package org.opm.localruntime.storage;

import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.api.generated.DraftSaveContract.DraftPreparationRequest;
import org.opm.localruntime.semantic.SaveContentDigestV1;

import java.nio.file.Path;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.List;

/** 隔离迁移副本的事务存储；不改变旧 HEAD 或激活模型模式。 */
final class PreparedDraftRepository {
    private static final JsonMapper JSON = JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    record Source(String raw, ObjectNode document) { }
    record Content(String contentDigest, String artifactDigest) { }
    private PreparedDraftRepository() { }

    static Source source(Connection connection, DraftPreparationRequest request) throws Exception {
        try (var statement = connection.prepareStatement("""
                SELECT r.document_json,r.document_digest,r.revision_id,r.model_id,r.revision_sequence,r.schema_version,
                       r.profile_binding_json AS revision_binding,m.profile_binding_json AS model_binding,
                       r.profile_id,r.profile_version,r.rule_set_id,r.rule_set_version,h.head_sequence
                FROM model_catalog m JOIN project_metadata p ON m.project_id=p.project_id
                JOIN model_head h ON h.model_id=m.model_id
                JOIN revision_document r ON r.revision_id=h.draft_head_revision_id AND r.model_id=m.model_id
                WHERE p.project_id=? AND m.model_id=? AND p.status='ACTIVE' AND m.status='ACTIVE'
                """)) {
            statement.setString(1, request.project_id()); statement.setString(2, request.model_id());
            try (var rows = statement.executeQuery()) {
                require(rows.next(), "SOURCE_MISMATCH");
                String raw = rows.getString("document_json");
                require(request.expected_revision_id().equals(rows.getString("revision_id"))
                        && request.expected_document_sha256().equals(HybridSavePreparation.hash(raw))
                        && request.expected_document_sha256().equals(rows.getString("document_digest")), "SOURCE_MISMATCH");
                ObjectNode document;
                try { document = SaveContentDigestV1.read(raw); }
                catch (RuntimeException exception) { throw HybridSavePreparation.failure("SOURCE_MISMATCH", exception); }
                var binding = document.required("profile_binding");
                require(request.model_id().equals(document.required("model_id").asText())
                        && request.expected_revision_id().equals(document.required("revision_id").asText())
                        && rows.getLong("revision_sequence") == document.required("revision_sequence").longValue()
                        && "0.2".equals(rows.getString("schema_version"))
                        && rows.getLong("head_sequence") > 0 && rows.getLong("head_sequence") <= 9_007_199_254_740_991L
                        && request.expected_binding_digest().equals(binding.at("/binding_digest/digest").asText())
                        && binding.equals(JSON.readTree(rows.getString("revision_binding")))
                        && binding.equals(JSON.readTree(rows.getString("model_binding")))
                        && rows.getString("profile_id").equals(binding.at("/profile/id").asText())
                        && rows.getString("profile_version").equals(binding.at("/profile/version").asText())
                        && rows.getString("rule_set_id").equals(binding.at("/rule_set/id").asText())
                        && rows.getString("rule_set_version").equals(binding.at("/rule_set/version").asText()), "SOURCE_MISMATCH");
                require(!rows.next(), "SOURCE_MISMATCH");
                return new Source(raw, document);
            }
        } catch (HybridSavePreparation.Failure exception) { throw exception; }
        catch (Exception exception) { throw HybridSavePreparation.failure("SOURCE_MISMATCH", exception); }
    }

    static void seed(Connection connection, DraftPreparationRequest request, Source source,
                     java.util.function.Consumer<String> stage) throws Exception {
        var parts = SaveContentDigestV1.split(source.document());
        String content = parts.content().toString(), artifact = parts.metadata().toString();
        String digest = SaveContentDigestV1.sha256(source.document());
        execute(connection, "INSERT INTO draft_content VALUES (?,?,'SaveContentDigest/1',?,?,?)",
                request.model_id(), digest, content, artifact, HybridSavePreparation.hash(artifact));
        stage.accept("CONTENT");
        execute(connection, "INSERT INTO draft_stream VALUES (?,?,0,?,?,?,NULL,NULL)", request.model_id(),
                request.draft_id(), request.expected_binding_digest(), request.expected_revision_id(), request.checkpoint_id());
        stage.accept("STREAM");
        execute(connection, "INSERT INTO draft_checkpoint VALUES (?,?,?,0,?,?)", request.model_id(), request.draft_id(),
                request.checkpoint_id(), digest, request.requested_at());
        stage.accept("CHECKPOINT");
    }

    static Content read(Connection connection, DraftPreparationRequest request, Source source) throws Exception {
        return read(connection, request, source, false);
    }

    static Content read(Connection connection, DraftPreparationRequest request, Source source, boolean activated) throws Exception {
        for (String table : List.of("draft_content", "draft_stream", "draft_checkpoint")) require(count(connection, table) == 1, "CONTENT_MISMATCH");
        for (String table : List.of("draft_journal", "draft_savepoint", "draft_receipt", "draft_retention")) require(count(connection, table) == 0, "CONTENT_MISMATCH");
        require(count(connection, "model_save_mode") == (activated ? 1 : 0), "CONTENT_MISMATCH");
        if (activated) {
            require(count(connection, "draft_checkpoint_overlay") == 0, "CONTENT_MISMATCH");
            try (var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT * FROM model_save_mode")) {
                require(rows.next() && request.model_id().equals(rows.getString("model_id"))
                        && request.draft_id().equals(rows.getString("active_draft_id"))
                        && "JOURNALED_DRAFT_V2".equals(rows.getString("mode")), "CONTENT_MISMATCH");
            }
        }
        try (var statement = connection.prepareStatement("""
                SELECT s.*,c.covered_seq,c.created_at,c.content_digest,d.digest_version,d.model_json,d.artifact_json,d.artifact_digest
                FROM draft_stream s JOIN draft_checkpoint c ON c.model_id=s.model_id AND c.draft_id=s.draft_id AND c.checkpoint_id=s.checkpoint_id
                JOIN draft_content d ON d.model_id=c.model_id AND d.content_digest=c.content_digest
                WHERE s.model_id=? AND s.draft_id=?
                """)) {
            statement.setString(1, request.model_id()); statement.setString(2, request.draft_id());
            try (var rows = statement.executeQuery()) {
                require(rows.next(), "CONTENT_MISMATCH");
                require(rows.getLong("edit_seq") == 0 && rows.getLong("covered_seq") == 0
                        && request.expected_binding_digest().equals(rows.getString("binding_digest"))
                        && request.expected_revision_id().equals(rows.getString("base_revision_id"))
                        && request.checkpoint_id().equals(rows.getString("checkpoint_id"))
                        && request.requested_at().equals(rows.getString("created_at"))
                        && rows.getString("dirty_since") == null && rows.getString("deadline") == null
                        && "SaveContentDigest/1".equals(rows.getString("digest_version")), "CONTENT_MISMATCH");
                String artifact = rows.getString("artifact_json"), artifactDigest = rows.getString("artifact_digest");
                require(HybridSavePreparation.hash(artifact).equals(artifactDigest), "CONTENT_MISMATCH");
                JsonNode model = JSON.readTree(rows.getString("model_json")), metadata = JSON.readTree(artifact);
                require(model.isObject() && metadata.isObject(), "CONTENT_MISMATCH");
                var joined = SaveContentDigestV1.join(new SaveContentDigestV1.Parts((ObjectNode) model, (ObjectNode) metadata));
                String digest = SaveContentDigestV1.sha256(joined);
                require(digest.equals(rows.getString("content_digest"))
                        && SaveContentDigestV1.read(joined.toString()).equals(source.document())
                        && digest.equals(SaveContentDigestV1.sha256(source.document())), "CONTENT_MISMATCH");
                require(!rows.next(), "CONTENT_MISMATCH");
                return new Content(digest, artifactDigest);
            }
        }
    }

    static void integrity(Connection connection) throws Exception {
        try (var statement = connection.createStatement(); var rows = statement.executeQuery("PRAGMA integrity_check")) {
            require(rows.next() && "ok".equals(rows.getString(1)) && !rows.next(), "CONTENT_MISMATCH");
        }
        try (var statement = connection.createStatement(); var rows = statement.executeQuery("PRAGMA foreign_key_check")) {
            require(!rows.next(), "CONTENT_MISMATCH");
        }
    }

    static void compareLegacy(Connection connection, Path backup) throws Exception {
        try (var attach = connection.prepareStatement("ATTACH DATABASE ? AS legacy")) {
            attach.setString(1, backup.toUri() + "?mode=ro"); attach.execute();
        }
        var tables = new ArrayList<String>();
        try (var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT name FROM legacy.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")) {
            while (rows.next()) tables.add(rows.getString(1));
        }
        for (String table : tables) {
            var columns = new ArrayList<String>();
            try (var statement = connection.createStatement(); var rows = statement.executeQuery("PRAGMA legacy.table_info(" + quote(table) + ")")) {
                while (rows.next()) columns.add(quote(rows.getString("name")));
            }
            require(!columns.isEmpty(), "CONTENT_MISMATCH");
            String names = String.join(",", columns);
            String where = table.equals("schema_metadata") ? " WHERE metadata_key<>'storage_schema_version'" : "";
            String prefix = "SELECT " + names + ",COUNT(*) FROM ";
            String suffix = quote(table) + where + " GROUP BY " + names;
            String original = prefix + "legacy." + suffix, candidate = prefix + "main." + suffix;
            difference(connection, original, candidate);
            if (!table.equals("flyway_schema_history")) difference(connection, candidate, original);
        }
    }

    private static void difference(Connection connection, String left, String right) throws Exception {
        try (var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT 1 FROM (" + left + " EXCEPT " + right + ") LIMIT 1")) {
            require(!rows.next(), "CONTENT_MISMATCH");
        }
    }
    private static String quote(String name) { return "\"" + name.replace("\"", "\"\"") + "\""; }
    private static long count(Connection connection, String table) throws Exception {
        try (var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT count(*) FROM " + quote(table))) { rows.next(); return rows.getLong(1); }
    }
    private static void execute(Connection connection, String sql, String... values) throws Exception {
        try (var statement = connection.prepareStatement(sql)) {
            for (int i = 0; i < values.length; i++) statement.setString(i + 1, values[i]);
            require(statement.executeUpdate() == 1, "PERSISTENCE_FAILED");
        }
    }
    private static void require(boolean condition, String code) { if (!condition) throw HybridSavePreparation.failure(code, null); }
}
