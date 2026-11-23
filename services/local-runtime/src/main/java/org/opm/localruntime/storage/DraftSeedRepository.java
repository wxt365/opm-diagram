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
final class DraftSeedRepository {
    private static final JsonMapper JSON = JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    record Source(String raw, ObjectNode document) { }
    record Content(String contentDigest, String artifactDigest) { }
    private DraftSeedRepository() { }

    static Source source(Connection connection, DraftPreparationRequest request) throws Exception {
        return source(connection, request, false);
    }
    static Source source(Connection connection, DraftPreparationRequest request, boolean newRefinementModel) throws Exception {
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
                        && request.expected_document_sha256().equals(StorageDigests.hash(raw))
                        && request.expected_document_sha256().equals(rows.getString("document_digest")), "SOURCE_MISMATCH");
                ObjectNode document;
                try { document = SaveContentDigestV1.read(raw); }
                catch (RuntimeException exception) { throw new StorageAccessException("Draft initialization failed", exception); }
                var binding = document.required("profile_binding");
                require(request.model_id().equals(document.required("model_id").asText())
                        && request.expected_revision_id().equals(document.required("revision_id").asText())
                        && rows.getLong("revision_sequence") == document.required("revision_sequence").longValue()
                        && ("0.2".equals(rows.getString("schema_version")) || newRefinementModel && java.util.List.of("0.3", "0.4", "0.5", "0.6", "0.7").contains(rows.getString("schema_version"))
                            && rows.getString("schema_version").equals(document.path("schema_version").asText()) && document.path("refinement_edges").isArray())
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
        } catch (StorageAccessException exception) { throw exception; }
        catch (Exception exception) { throw new StorageAccessException("Draft initialization failed", exception); }
    }

    static void seed(Connection connection, DraftPreparationRequest request, Source source,
                     java.util.function.Consumer<String> stage) throws Exception {
        var parts = SaveContentDigestV1.split(source.document());
        String content = parts.content().toString(), artifact = parts.metadata().toString();
        String digest = SaveContentDigestV1.sha256(source.document());
        execute(connection, "INSERT INTO draft_content(model_id,content_digest,digest_version,model_json,artifact_json,artifact_digest) VALUES (?,?,?,?,?,?)",
                request.model_id(), digest, SaveContentDigestV1.version(source.document()), content, artifact, StorageDigests.hash(artifact));
        stage.accept("CONTENT");
        execute(connection, "INSERT INTO draft_stream(model_id,draft_id,edit_seq,binding_digest,base_revision_id,checkpoint_id,dirty_since,deadline) VALUES (?,?,0,?,?,?,NULL,NULL)", request.model_id(),
                request.draft_id(), request.expected_binding_digest(), request.expected_revision_id(), request.checkpoint_id());
        stage.accept("STREAM");
        execute(connection, "INSERT INTO draft_checkpoint(model_id,draft_id,checkpoint_id,covered_seq,content_digest,created_at) VALUES (?,?,?,0,?,?)", request.model_id(), request.draft_id(),
                request.checkpoint_id(), digest, request.requested_at());
        stage.accept("CHECKPOINT");
    }

    private static void execute(Connection connection,String sql,String...values) throws Exception {try(var statement=connection.prepareStatement(sql)){for(int i=0;i<values.length;i++)statement.setString(i+1,values[i]);require(statement.executeUpdate()==1,"PERSISTENCE_FAILED");}}
    private static void require(boolean condition,String code){if(!condition)throw new StorageAccessException(code);}
}
