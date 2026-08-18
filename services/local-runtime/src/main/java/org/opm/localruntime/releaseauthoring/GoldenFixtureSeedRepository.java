package org.opm.localruntime.releaseauthoring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.application.RuntimeActiveBindingProvider;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionReader;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.opm.localruntime.storage.ProjectDatabaseOpenResult;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/** 将一个已经验证的 Golden fixture 写入独立 SQLite 单 Revision 快照。 */
public final class GoldenFixtureSeedRepository {

    private static final String HISTORY_MODE = "SINGLE_REVISION_SNAPSHOT";
    private static final String COMMIT_REASON = "GOLDEN_FIXTURE_MATERIALIZED";
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final SemanticRevisionReader revisionReader = new SemanticRevisionReader();
    private final FaultInjector faultInjector;

    public GoldenFixtureSeedRepository() {
        this(stage -> { });
    }

    /** 仅供 package 内定向测试注入 SQLite 失败，不提供运行时配置入口。 */
    GoldenFixtureSeedRepository(FaultInjector faultInjector) {
        this.faultInjector = faultInjector;
    }

    public MaterializedFixture materialize(Path storageRoot, byte[] fixtureBytes, String fixtureSha256, long sourceDateEpoch) {
        try {
            requireEmpty(storageRoot);
            String document = utf8(fixtureBytes);
            JsonNode root = objectMapper.readTree(fixtureBytes);
            if (!"MS-REV-001".equals(text(root, "schema_id")) || !"0.2".equals(text(root, "schema_version"))) {
                throw new GoldenFixtureMaterializationException("GFM_FIXTURE_SCHEMA_UNSUPPORTED", "Fixture schema must be MS-REV-001/0.2.");
            }
            SemanticRevision revision = revisionReader.read(new ByteArrayInputStream(fixtureBytes));
            verifyIdentity(root, revision);
            verifyBinding(revision.profileBinding());
            String projectId = "project.golden.fixture." + fixtureSha256;
            long migrationStarted = System.nanoTime();
            ProjectDatabaseOpenResult opened;
            try {
                fault("migration.before-open", "GFM_STORAGE_MIGRATION_FAILED");
                ProjectDatabaseFactory factory = new ProjectDatabaseFactory(storageRoot);
                opened = factory.open(projectId);
            } catch (GoldenFixtureMaterializationException exception) {
                throw exception;
            } catch (Exception exception) {
                throw new GoldenFixtureMaterializationException("GFM_STORAGE_MIGRATION_FAILED", "SQLite V1 migration failed.", exception);
            }
            if (!(opened instanceof ProjectDatabaseOpenResult.Ready ready)) {
                throw new GoldenFixtureMaterializationException("GFM_STORAGE_MIGRATION_FAILED", "SQLite V1 migration did not become ready.");
            }
            long migrationMicros = elapsedMicros(migrationStarted);
            long seedStarted = System.nanoTime();
            Instant createdAt = Instant.ofEpochSecond(sourceDateEpoch);
            try (Connection connection = connect(ready.database().databasePath())) {
                connection.setAutoCommit(false);
                try {
                    fault("seed.project_metadata", "GFM_STORAGE_WRITE_FAILED");
                    insertProject(connection, projectId, revision, createdAt);
                    insertPackages(connection, revision, fixtureSha256, createdAt);
                    fault("seed.model_catalog", "GFM_STORAGE_WRITE_FAILED");
                    insertModel(connection, projectId, revision, root.required("profile_binding"), createdAt);
                    fault("seed.revision_document", "GFM_STORAGE_WRITE_FAILED");
                    insertRevision(connection, revision, root.required("schema_set_ref"), root.required("profile_binding"), document, fixtureSha256, createdAt);
                    fault("seed.model_head", "GFM_STORAGE_WRITE_FAILED");
                    insertHead(connection, revision, createdAt);
                    fault("seed.before-commit", "GFM_STORAGE_WRITE_FAILED");
                    connection.commit();
                } catch (Exception exception) {
                    connection.rollback();
                    throw exception;
                }
            }
            long seedMicros = elapsedMicros(seedStarted);
            long verifyStarted = System.nanoTime();
            fault("verify.before", "GFM_STORAGE_VERIFY_FAILED");
            Map<String, Integer> counts = verify(ready.database().databasePath(), projectId, revision, fixtureSha256, fixtureBytes);
            long verifyMicros = elapsedMicros(verifyStarted);
            return new MaterializedFixture(projectId, revision.modelId(), revision.revisionId(), revision.revisionSequence(),
                    ready.database().databasePath(), counts, HISTORY_MODE, new StageDurations(migrationMicros, seedMicros, verifyMicros));
        } catch (GoldenFixtureMaterializationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new GoldenFixtureMaterializationException("GFM_STORAGE_WRITE_FAILED", "Cannot materialize Golden fixture.", exception);
        }
    }

    private void verifyIdentity(JsonNode root, SemanticRevision revision) {
        if (!revision.modelId().equals(text(root.required("model_header"), "model_id"))) {
            throw new GoldenFixtureMaterializationException("GFM_IDENTITY_MISMATCH", "Fixture model_header differs from model_id.");
        }
    }

    private void verifyBinding(SemanticRevision.ProfileBinding binding) {
        SemanticRevision.ProfileBinding active = RuntimeActiveBindingProvider.current();
        if (!same(binding.profile(), active.profile()) || !same(binding.ruleSet(), active.ruleSet())
                || !same(binding.textGrammar(), active.textGrammar()) || !same(binding.symbolCatalog(), active.symbolCatalog())
                || !same(binding.normalizationAdapter(), active.normalizationAdapter()) || !binding.bindingDigest().equals(active.bindingDigest())) {
            throw new GoldenFixtureMaterializationException("GFM_BINDING_MISMATCH", "Fixture binding differs from active Runtime binding.");
        }
    }

    private void insertProject(Connection connection, String projectId, SemanticRevision revision, Instant now) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO project_metadata(project_id, name, normalized_name, description, status, default_profile_id, default_profile_version, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
                """)) {
            statement.setString(1, projectId); statement.setString(2, "Golden Fixture " + revision.revisionId());
            statement.setString(3, ("golden fixture " + revision.revisionId()).toLowerCase(java.util.Locale.ROOT));
            statement.setString(4, "Release-only Golden fixture materialization.");
            statement.setString(5, revision.profileBinding().profile().id()); statement.setString(6, revision.profileBinding().profile().version());
            statement.setString(7, now.toString()); statement.setString(8, now.toString()); statement.executeUpdate();
        }
    }

    private void insertPackages(Connection connection, SemanticRevision revision, String fixtureSha256, Instant now) throws Exception {
        String payload = objectMapper.writeValueAsString(Map.of("source", "GOLDEN_FIXTURE_MATERIALIZER", "asset_ref", Map.of("fixture_sha256", fixtureSha256)));
        fault("seed.profile_package", "GFM_STORAGE_WRITE_FAILED");
        insertPackage(connection, "INSERT INTO profile_package(profile_id, package_version, package_digest, lifecycle_status, package_json, installed_at) VALUES (?, ?, ?, 'DRAFT', ?, ?)", revision.profileBinding().profile(), payload, now, "OPL");
        fault("seed.rule_set_package", "GFM_STORAGE_WRITE_FAILED");
        insertPackage(connection, "INSERT INTO rule_set_package(rule_set_id, rule_set_version, rule_set_digest, lifecycle_status, package_json, installed_at) VALUES (?, ?, ?, 'DRAFT', ?, ?)", revision.profileBinding().ruleSet(), payload, now, "OPL");
        fault("seed.grammar_package", "GFM_STORAGE_WRITE_FAILED");
        insertPackage(connection, "INSERT INTO grammar_package(grammar_id, grammar_version, grammar_digest, text_modality, manifest_json, installed_at) VALUES (?, ?, ?, ?, ?, ?)", revision.profileBinding().textGrammar(), payload, now, "OPL");
    }

    private void insertPackage(Connection connection, String sql, SemanticRevision.AssetReference asset, String payload, Instant now, String modality) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, asset.id()); statement.setString(2, asset.version()); statement.setString(3, asset.sha256());
            if (sql.contains("text_modality")) { statement.setString(4, modality); statement.setString(5, payload); statement.setString(6, now.toString()); }
            else { statement.setString(4, payload); statement.setString(5, now.toString()); }
            statement.executeUpdate();
        }
    }

    private void insertModel(Connection connection, String projectId, SemanticRevision revision, JsonNode binding, Instant now) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO model_catalog(model_id, project_id, name, normalized_name, description, status, profile_binding_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
                """)) {
            statement.setString(1, revision.modelId()); statement.setString(2, projectId); statement.setString(3, revision.modelId());
            statement.setString(4, revision.modelId().toLowerCase(java.util.Locale.ROOT)); statement.setString(5, "Golden fixture model.");
            statement.setString(6, objectMapper.writeValueAsString(binding)); statement.setString(7, now.toString()); statement.setString(8, now.toString()); statement.executeUpdate();
        }
    }

    private void insertRevision(Connection connection, SemanticRevision revision, JsonNode schemaSet, JsonNode binding, String document, String documentSha256, Instant now) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO revision_document(revision_id, model_id, revision_sequence, schema_version, profile_id, profile_version,
                    rule_set_id, rule_set_version, schema_set_json, profile_binding_json, document_json, document_digest, commit_reason, created_at)
                VALUES (?, ?, ?, '0.2', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """)) {
            statement.setString(1, revision.revisionId()); statement.setString(2, revision.modelId()); statement.setInt(3, revision.revisionSequence());
            statement.setString(4, revision.profileBinding().profile().id()); statement.setString(5, revision.profileBinding().profile().version());
            statement.setString(6, revision.profileBinding().ruleSet().id()); statement.setString(7, revision.profileBinding().ruleSet().version());
            statement.setString(8, objectMapper.writeValueAsString(schemaSet)); statement.setString(9, objectMapper.writeValueAsString(binding));
            statement.setString(10, document); statement.setString(11, documentSha256); statement.setString(12, COMMIT_REASON); statement.setString(13, now.toString()); statement.executeUpdate();
        }
    }

    private void insertHead(Connection connection, SemanticRevision revision, Instant now) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO model_head(model_id, draft_head_revision_id, head_sequence, updated_at) VALUES (?, ?, ?, ?)")) {
            statement.setString(1, revision.modelId()); statement.setString(2, revision.revisionId()); statement.setInt(3, revision.revisionSequence()); statement.setString(4, now.toString()); statement.executeUpdate();
        }
    }

    private Map<String, Integer> verify(Path database, String projectId, SemanticRevision revision, String fixtureSha256, byte[] fixtureBytes) throws Exception {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String table : new String[] {"project_metadata", "profile_package", "rule_set_package", "grammar_package", "model_catalog", "revision_document", "model_head", "revision_parent", "operation_record", "idempotency_record", "background_task", "asset_manifest", "element_index", "fact_endpoint_index", "occurrence_index", "finding_index", "text_trace_index"}) counts.put(table, 0);
        try (Connection connection = connect(database)) {
            try (ResultSet result = connection.createStatement().executeQuery("PRAGMA integrity_check")) { if (!result.next() || !"ok".equals(result.getString(1))) throw new GoldenFixtureMaterializationException("GFM_STORAGE_VERIFY_FAILED", "SQLite integrity check failed."); }
            try (ResultSet result = connection.createStatement().executeQuery("PRAGMA foreign_key_check")) { if (result.next()) throw new GoldenFixtureMaterializationException("GFM_STORAGE_VERIFY_FAILED", "SQLite foreign key check failed."); }
            for (String table : counts.keySet()) try (ResultSet result = connection.createStatement().executeQuery("SELECT COUNT(*) FROM " + table)) { result.next(); counts.put(table, result.getInt(1)); }
            if (counts.entrySet().stream().anyMatch(entry -> expectedCount(entry.getKey()) != entry.getValue())) throw new GoldenFixtureMaterializationException("GFM_STORAGE_VERIFY_FAILED", "SQLite table counts differ from the single Revision contract.");
            try (PreparedStatement statement = connection.prepareStatement("SELECT document_json, document_digest FROM revision_document WHERE revision_id = ? AND model_id = ?")) {
                statement.setString(1, revision.revisionId()); statement.setString(2, revision.modelId());
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next() || !fixtureSha256.equals(result.getString(2))) throw new GoldenFixtureMaterializationException("GFM_STORAGE_VERIFY_FAILED", "Persisted revision identity differs from fixture.");
                    revisionReader.read(new ByteArrayInputStream(result.getString(1).getBytes(StandardCharsets.UTF_8)));
                }
            }
            try (PreparedStatement statement = connection.prepareStatement("SELECT draft_head_revision_id, head_sequence FROM model_head WHERE model_id = ?")) {
                statement.setString(1, revision.modelId()); try (ResultSet result = statement.executeQuery()) { if (!result.next() || !revision.revisionId().equals(result.getString(1)) || revision.revisionSequence() != result.getInt(2)) throw new GoldenFixtureMaterializationException("GFM_STORAGE_VERIFY_FAILED", "Model head differs from fixture."); }
            }
        }
        if (!fixtureSha256.equals(sha256(fixtureBytes)) || Files.exists(database.resolveSibling(database.getFileName() + "-wal")) || Files.exists(database.resolveSibling(database.getFileName() + "-shm"))) throw new GoldenFixtureMaterializationException("GFM_STORAGE_VERIFY_FAILED", "Database sidecar or fixture digest mismatch.");
        return Map.copyOf(counts);
    }

    private Connection connect(Path database) throws Exception {
        Connection connection = DriverManager.getConnection("jdbc:sqlite:" + database.toAbsolutePath() + "?foreign_keys=on");
        connection.createStatement().execute("PRAGMA foreign_keys = ON");
        return connection;
    }

    private void requireEmpty(Path root) throws Exception {
        if (Files.exists(root)) try (var paths = Files.list(root)) { if (paths.findAny().isPresent()) throw new GoldenFixtureMaterializationException("GFM_TARGET_STORAGE_NOT_EMPTY", "Target storage must be empty."); }
    }

    private void fault(String stage, String code) {
        try {
            faultInjector.check(stage);
        } catch (GoldenFixtureMaterializationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new GoldenFixtureMaterializationException(code, "Controlled materialization stage failure.", exception);
        }
    }

    private int expectedCount(String table) { return switch (table) { case "project_metadata", "profile_package", "rule_set_package", "grammar_package", "model_catalog", "revision_document", "model_head" -> 1; default -> 0; }; }
    private boolean same(SemanticRevision.AssetReference left, SemanticRevision.AssetReference right) { return left.id().equals(right.id()) && left.version().equals(right.version()) && left.sha256().equals(right.sha256()); }
    private String text(JsonNode node, String field) { return node.required(field).asText(); }
    private String utf8(byte[] bytes) { String value = new String(bytes, StandardCharsets.UTF_8); if (!java.util.Arrays.equals(bytes, value.getBytes(StandardCharsets.UTF_8))) throw new GoldenFixtureMaterializationException("GFM_FIXTURE_REF_MISMATCH", "Fixture is not valid UTF-8."); return value; }
    private String sha256(byte[] bytes) throws Exception { return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }

    private static long elapsedMicros(long started) { return Math.max(1L, (System.nanoTime() - started) / 1_000L); }

    public record MaterializedFixture(String projectId, String modelId, String revisionId, int revisionSequence, Path databasePath, Map<String, Integer> tableCounts, String historyMode, StageDurations stageDurations) { }
    public record StageDurations(long migrationMicros, long seedMicros, long verifyMicros) { }
    @FunctionalInterface interface FaultInjector { void check(String stage) throws Exception; }
}
