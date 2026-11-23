package org.opm.localruntime.golden;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.opm.localruntime.storage.ProjectDatabaseOpenResult;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.time.Instant;

/** 使用已迁移的 SQLite schema 初始化 Golden attempt 的 committed base Revision。 */
public final class OplGoldenReplayDatabaseInitializer {

    public static final String PROJECT_ID = "project.golden";

    private final ObjectMapper objectMapper = new ObjectMapper();

    public Path initialize(Path storageRoot, SemanticRevision base, Path baseFixture) {
        try {
            ProjectDatabaseFactory factory = new ProjectDatabaseFactory(storageRoot, org.opm.localruntime.storage.SqliteSnapshots.tools(storageRoot), false);
            if (factory.databaseScope(PROJECT_ID).exists()) {
                try (var connection = factory.databaseScope(PROJECT_ID).getConnection(); var query = connection.createStatement();
                     var rows = query.executeQuery("SELECT document_json FROM revision_document")) {
                    if (!rows.next() || !Files.readString(baseFixture).equals(rows.getString(1)) || rows.next())
                        throw new IllegalStateException("Golden replay 拒绝覆盖不同的已有项目");
                    for (String table : java.util.List.of("operation_record", "revision_parent", "text_trace_index")) {
                        try (var check = connection.createStatement(); var count = check.executeQuery("SELECT COUNT(*) FROM " + table)) {
                            if (!count.next() || count.getInt(1) != 0) throw new IllegalStateException("Golden replay 拒绝覆盖已经修改的项目");
                        }
                    }
                    try (var check = connection.prepareStatement("SELECT draft_head_revision_id,head_sequence FROM model_head WHERE model_id=?")) {
                        check.setString(1, base.modelId());
                        try (var head = check.executeQuery()) {
                            if (!head.next() || !base.revisionId().equals(head.getString(1)) || base.revisionSequence() != head.getInt(2))
                                throw new IllegalStateException("Golden replay 既有项目的 head 不匹配");
                        }
                    }
                    return factory.snapshot(PROJECT_ID);
                }
            }

            ProjectDatabaseOpenResult opened = factory.open(PROJECT_ID);
            if (!(opened instanceof ProjectDatabaseOpenResult.Ready ready)) throw new IllegalStateException("Golden replay database migration requires recovery");
            byte[] document = Files.readAllBytes(baseFixture);
            try (Connection connection = ready.database().databaseScope().getConnection()) {
                connection.setAutoCommit(false);
                insertProject(connection, base);
                insertModel(connection, base);
                insertPackages(connection, base);
                insertBaseRevision(connection, base, document, objectMapper.readTree(document).required("schema_version").asText());
                insertHead(connection, base);
                connection.commit();
            }
            return org.opm.localruntime.storage.SqliteSnapshots.write(storageRoot, ready.database().databaseScope());
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot initialize Golden replay base Revision", exception);
        }
    }

    private void insertProject(Connection connection, SemanticRevision base) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO project_metadata(project_id, name, normalized_name, status, default_profile_id, default_profile_version, created_at, updated_at)
                VALUES (?, 'Golden Replay', 'golden replay', 'ACTIVE', ?, ?, ?, ?)
                """)) {
            statement.setString(1, PROJECT_ID);
            statement.setString(2, base.profileBinding().profile().id());
            statement.setString(3, base.profileBinding().profile().version());
            statement.setString(4, Instant.EPOCH.toString());
            statement.setString(5, Instant.EPOCH.toString());
            statement.executeUpdate();
        }
    }

    private void insertModel(Connection connection, SemanticRevision base) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO model_catalog(model_id, project_id, name, normalized_name, status, profile_binding_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
                """)) {
            statement.setString(1, base.modelId());
            statement.setString(2, PROJECT_ID);
            statement.setString(3, base.modelId());
            statement.setString(4, base.modelId());
            statement.setString(5, objectMapper.writeValueAsString(objectMapper.createObjectNode().put("binding_digest", base.profileBinding().bindingDigest())));
            statement.setString(6, Instant.EPOCH.toString());
            statement.setString(7, Instant.EPOCH.toString());
            statement.executeUpdate();
        }
    }

    private void insertPackages(Connection connection, SemanticRevision base) throws Exception {
        try (PreparedStatement profile = connection.prepareStatement("""
                INSERT INTO profile_package(profile_id, package_version, package_digest, lifecycle_status, package_json, installed_at)
                VALUES (?, ?, ?, 'DRAFT', '{}', ?)
                """)) {
            profile.setString(1, base.profileBinding().profile().id());
            profile.setString(2, base.profileBinding().profile().version());
            profile.setString(3, base.profileBinding().profile().sha256());
            profile.setString(4, Instant.EPOCH.toString());
            profile.executeUpdate();
        }
        try (PreparedStatement rules = connection.prepareStatement("""
                INSERT INTO rule_set_package(rule_set_id, rule_set_version, rule_set_digest, lifecycle_status, package_json, installed_at)
                VALUES (?, ?, ?, 'DRAFT', '{}', ?)
                """)) {
            rules.setString(1, base.profileBinding().ruleSet().id());
            rules.setString(2, base.profileBinding().ruleSet().version());
            rules.setString(3, base.profileBinding().ruleSet().sha256());
            rules.setString(4, Instant.EPOCH.toString());
            rules.executeUpdate();
        }
    }

    private void insertBaseRevision(Connection connection, SemanticRevision base, byte[] document, String schemaVersion) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO revision_document(revision_id, model_id, revision_sequence, schema_version, profile_id, profile_version,
                    rule_set_id, rule_set_version, schema_set_json, profile_binding_json, document_json, document_digest, commit_reason, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', '{}', ?, ?, 'GOLDEN_BASE', ?)
                """)) {
            statement.setString(1, base.revisionId());
            statement.setString(2, base.modelId());
            statement.setInt(3, base.revisionSequence());
            statement.setString(4, schemaVersion);
            statement.setString(5, base.profileBinding().profile().id());
            statement.setString(6, base.profileBinding().profile().version());
            statement.setString(7, base.profileBinding().ruleSet().id());
            statement.setString(8, base.profileBinding().ruleSet().version());
            statement.setString(9, new String(document, StandardCharsets.UTF_8));
            statement.setString(10, sha256(document));
            statement.setString(11, Instant.EPOCH.toString());
            statement.executeUpdate();
        }
    }

    private void insertHead(Connection connection, SemanticRevision base) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO model_head(model_id, draft_head_revision_id, head_sequence, updated_at) VALUES (?, ?, ?, ?)
                """)) {
            statement.setString(1, base.modelId());
            statement.setString(2, base.revisionId());
            statement.setInt(3, base.revisionSequence());
            statement.setString(4, Instant.EPOCH.toString());
            statement.executeUpdate();
        }
    }

    private String sha256(byte[] value) throws Exception {
        return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
    }
}
