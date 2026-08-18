package org.opm.localruntime.recovery;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.opm.localruntime.storage.ProjectDatabaseOpenResult;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/** 只为 Recovery attempt 写入单 Revision 的 SQLite V1 快照。 */
final class RecoveryFactorySqliteMaterializer {

    private static final String COMMIT_REASON = "RECOVERY_FACTORY_BASE";
    private static final String[] TABLES = {
            "schema_metadata", "flyway_schema_history", "project_metadata", "profile_package", "rule_set_package",
            "grammar_package", "model_catalog", "revision_document", "model_head", "revision_parent", "named_snapshot",
            "baseline", "operation_record", "idempotency_record", "background_task", "asset_manifest", "element_index",
            "fact_endpoint_index", "occurrence_index", "finding_index", "text_trace_index"
    };
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    Result materialize(Path storageRoot, String projectId, byte[] baseRevisionBytes, ProfileAssets assets, long sourceDateEpoch) {
        try {
            requireEmpty(storageRoot);
            String revisionText = strictUtf8(baseRevisionBytes);
            JsonNode revision = OBJECT_MAPPER.readTree(baseRevisionBytes);
            validateRevision(revision);
            Instant instant = Instant.ofEpochSecond(sourceDateEpoch);
            String fixedTime = instant.toString();
            ProjectDatabaseOpenResult opened = new ProjectDatabaseFactory(storageRoot).open(projectId);
            if (!(opened instanceof ProjectDatabaseOpenResult.Ready ready)) {
                throw new RecoveryFactoryException("SQLite V1 migration did not become ready.");
            }
            try (Connection connection = connect(ready.database().databasePath())) {
                connection.setAutoCommit(false);
                try {
                    insertProject(connection, projectId, revision, fixedTime);
                    insertPackages(connection, revision, assets, fixedTime);
                    insertModel(connection, projectId, revision, fixedTime);
                    insertRevision(connection, revision, revisionText, fixedTime);
                    insertHead(connection, revision, fixedTime);
                    connection.commit();
                } catch (Exception exception) {
                    connection.rollback();
                    throw exception;
                }
            }
            Map<String, Integer> counts = verify(ready.database().databasePath(), projectId, revision);
            return new Result(ready.database().databasePath(), Map.copyOf(counts));
        } catch (RecoveryFactoryException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new RecoveryFactoryException("Cannot materialize Recovery SQLite snapshot.", exception);
        }
    }

    private void insertProject(Connection connection, String projectId, JsonNode revision, String time) throws Exception {
        JsonNode binding = revision.required("profile_binding");
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO project_metadata(project_id, name, normalized_name, description, status, default_profile_id, default_profile_version, created_at, updated_at)
                VALUES (?, ?, ?, 'DEV-CANVAS-06 Recovery attempt base.', 'ACTIVE', ?, ?, ?, ?)
                """)) {
            statement.setString(1, projectId);
            statement.setString(2, projectId);
            statement.setString(3, asciiLower(projectId));
            statement.setString(4, text(binding.required("profile"), "id"));
            statement.setString(5, text(binding.required("profile"), "version"));
            statement.setString(6, time);
            statement.setString(7, time);
            statement.executeUpdate();
        }
    }

    private void insertPackages(Connection connection, JsonNode revision, ProfileAssets assets, String time) throws Exception {
        JsonNode binding = revision.required("profile_binding");
        insertPackage(connection, """
                INSERT INTO profile_package(profile_id, package_version, package_digest, lifecycle_status, package_json, installed_at)
                VALUES (?, ?, ?, 'DRAFT', ?, ?)
                """, binding.required("profile"), assets.profileJson(), time, false);
        insertPackage(connection, """
                INSERT INTO rule_set_package(rule_set_id, rule_set_version, rule_set_digest, lifecycle_status, package_json, installed_at)
                VALUES (?, ?, ?, 'DRAFT', ?, ?)
                """, binding.required("rule_set"), assets.ruleSetJson(), time, false);
        insertPackage(connection, """
                INSERT INTO grammar_package(grammar_id, grammar_version, grammar_digest, text_modality, manifest_json, installed_at)
                VALUES (?, ?, ?, 'OPL', ?, ?)
                """, binding.required("text_grammar"), assets.grammarJson(), time, true);
    }

    private void insertPackage(Connection connection, String sql, JsonNode identity, String originalJson, String time, boolean grammar) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, text(identity, "id"));
            statement.setString(2, text(identity, "version"));
            statement.setString(3, digest(identity));
            statement.setString(4, originalJson);
            statement.setString(5, time);
            statement.executeUpdate();
        }
    }

    private void insertModel(Connection connection, String projectId, JsonNode revision, String time) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO model_catalog(model_id, project_id, name, normalized_name, description, status, profile_binding_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'DEV-CANVAS-06 Recovery base model.', 'ACTIVE', ?, ?, ?)
                """)) {
            String modelId = text(revision, "model_id");
            statement.setString(1, modelId);
            statement.setString(2, projectId);
            statement.setString(3, modelId);
            statement.setString(4, asciiLower(modelId));
            statement.setString(5, Rfc8785JsonCanonicalizer.canonicalize(revision.required("profile_binding")));
            statement.setString(6, time);
            statement.setString(7, time);
            statement.executeUpdate();
        }
    }

    private void insertRevision(Connection connection, JsonNode revision, String originalJson, String time) throws Exception {
        JsonNode binding = revision.required("profile_binding");
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO revision_document(revision_id, model_id, revision_sequence, schema_version, profile_id, profile_version,
                    rule_set_id, rule_set_version, schema_set_json, profile_binding_json, document_json, document_digest, commit_reason, immutable, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                """)) {
            statement.setString(1, text(revision, "revision_id"));
            statement.setString(2, text(revision, "model_id"));
            statement.setInt(3, revision.required("revision_sequence").intValue());
            statement.setString(4, text(revision, "schema_version"));
            statement.setString(5, text(binding.required("profile"), "id"));
            statement.setString(6, text(binding.required("profile"), "version"));
            statement.setString(7, text(binding.required("rule_set"), "id"));
            statement.setString(8, text(binding.required("rule_set"), "version"));
            statement.setString(9, Rfc8785JsonCanonicalizer.canonicalize(revision.required("schema_set_ref")));
            statement.setString(10, Rfc8785JsonCanonicalizer.canonicalize(binding));
            statement.setString(11, originalJson);
            statement.setString(12, sha256(originalJson.getBytes(StandardCharsets.UTF_8)));
            statement.setString(13, COMMIT_REASON);
            statement.setString(14, time);
            statement.executeUpdate();
        }
    }

    private void insertHead(Connection connection, JsonNode revision, String time) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO model_head(model_id, draft_head_revision_id, head_sequence, updated_at) VALUES (?, ?, ?, ?)
                """)) {
            statement.setString(1, text(revision, "model_id"));
            statement.setString(2, text(revision, "revision_id"));
            statement.setInt(3, revision.required("revision_sequence").intValue());
            statement.setString(4, time);
            statement.executeUpdate();
        }
    }

    private Map<String, Integer> verify(Path database, String projectId, JsonNode revision) throws Exception {
        Map<String, Integer> counts = new LinkedHashMap<>();
        try (Connection connection = connect(database)) {
            try (ResultSet result = connection.createStatement().executeQuery("PRAGMA quick_check")) {
                if (!result.next() || !"ok".equals(result.getString(1))) throw new RecoveryFactoryException("SQLite quick_check failed.");
            }
            try (ResultSet result = connection.createStatement().executeQuery("PRAGMA foreign_key_check")) {
                if (result.next()) throw new RecoveryFactoryException("SQLite foreign key check failed.");
            }
            for (String table : TABLES) {
                try (ResultSet result = connection.createStatement().executeQuery("SELECT COUNT(*) FROM " + table)) {
                    result.next();
                    counts.put(table, result.getInt(1));
                }
            }
            for (String table : TABLES) {
                int expected = switch (table) {
                    case "schema_metadata", "flyway_schema_history", "project_metadata", "profile_package", "rule_set_package",
                            "grammar_package", "model_catalog", "revision_document", "model_head" -> 1;
                    default -> 0;
                };
                if (counts.get(table) != expected) throw new RecoveryFactoryException("SQLite table count differs from the Recovery contract.");
            }
            try (PreparedStatement statement = connection.prepareStatement("SELECT draft_head_revision_id, head_sequence FROM model_head WHERE model_id = ?")) {
                statement.setString(1, text(revision, "model_id"));
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next() || !text(revision, "revision_id").equals(result.getString(1))
                            || revision.required("revision_sequence").intValue() != result.getInt(2)) {
                        throw new RecoveryFactoryException("SQLite Model head differs from base Revision.");
                    }
                }
            }
        }
        if (Files.exists(database.resolveSibling(database.getFileName() + "-wal"))
                || Files.exists(database.resolveSibling(database.getFileName() + "-shm"))
                || Files.exists(database.resolveSibling(database.getFileName() + "-journal"))) {
            throw new RecoveryFactoryException("SQLite sidecar exists after Recovery materialization.");
        }
        return counts;
    }

    private Connection connect(Path database) throws Exception {
        Connection connection = DriverManager.getConnection("jdbc:sqlite:" + database.toAbsolutePath() + "?foreign_keys=on");
        connection.createStatement().execute("PRAGMA foreign_keys = ON");
        return connection;
    }

    private void validateRevision(JsonNode revision) {
        if (!"MS-REV-001".equals(text(revision, "schema_id")) || !"0.2".equals(text(revision, "schema_version"))) {
            throw new RecoveryFactoryException("Recovery base Revision must be MS-REV-001/0.2.");
        }
        revision.required("model_header");
        revision.required("profile_binding");
        revision.required("schema_set_ref");
    }

    private void requireEmpty(Path root) throws Exception {
        if (Files.exists(root)) try (var entries = Files.list(root)) {
            if (entries.findAny().isPresent()) throw new RecoveryFactoryException("Recovery storage root must be empty.");
        }
    }

    private static String strictUtf8(byte[] bytes) {
        String text = new String(bytes, StandardCharsets.UTF_8);
        if (!java.util.Arrays.equals(bytes, text.getBytes(StandardCharsets.UTF_8))) {
            throw new RecoveryFactoryException("Recovery input must be strict UTF-8.");
        }
        return text;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.required(field);
        if (!value.isTextual() || value.asText().isBlank()) throw new RecoveryFactoryException("Recovery JSON text field is invalid: " + field);
        return value.asText();
    }

    private static String digest(JsonNode identity) {
        JsonNode value = identity.required("digest");
        if (!"sha256".equals(text(value, "algorithm"))) throw new RecoveryFactoryException("Recovery binding digest algorithm is invalid.");
        return text(value, "digest");
    }

    private static String asciiLower(String value) {
        if (!value.chars().allMatch(character -> character <= 0x7f)) throw new RecoveryFactoryException("Recovery identifier must be ASCII.");
        return value.toLowerCase(java.util.Locale.ROOT);
    }

    private static String sha256(byte[] bytes) {
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception exception) {
            throw new RecoveryFactoryException("SHA-256 is unavailable.", exception);
        }
    }

    record ProfileAssets(String profileJson, String ruleSetJson, String grammarJson) {
        ProfileAssets {
            if (profileJson == null || ruleSetJson == null || grammarJson == null) {
                throw new IllegalArgumentException("Recovery Profile assets must not be null.");
            }
        }
    }

    record Result(Path databasePath, Map<String, Integer> tableCounts) {
    }

    static final class RecoveryFactoryException extends RuntimeException {
        RecoveryFactoryException(String message) {
            super(message);
        }

        RecoveryFactoryException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
