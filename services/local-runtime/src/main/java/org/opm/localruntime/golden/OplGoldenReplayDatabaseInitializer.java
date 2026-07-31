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
            ProjectDatabaseFactory factory = new ProjectDatabaseFactory(storageRoot);
            resetAttemptDatabase(factory.databasePath(PROJECT_ID));
            ProjectDatabaseOpenResult opened = factory.open(PROJECT_ID);
            if (!(opened instanceof ProjectDatabaseOpenResult.Ready ready)) throw new IllegalStateException("Golden replay database migration requires recovery");
            byte[] document = Files.readAllBytes(baseFixture);
            try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + ready.database().databasePath().toAbsolutePath())) {
                connection.createStatement().execute("PRAGMA foreign_keys = ON");
                connection.setAutoCommit(false);
                insertProject(connection, base);
                insertModel(connection, base);
                insertPackages(connection, base);
                insertBaseRevision(connection, base, document, objectMapper.readTree(document).required("schema_version").asText());
                insertHead(connection, base);
                connection.commit();
            }
            return ready.database().databasePath();
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot initialize Golden replay base Revision", exception);
        }
    }

    /** workRoot 仅承载本次 replay attempt，启动前必须去除上次遗留的 SQLite 状态。 */
    private void resetAttemptDatabase(Path database) throws Exception {
        Files.deleteIfExists(database);
        Files.deleteIfExists(database.resolveSibling(database.getFileName() + "-wal"));
        Files.deleteIfExists(database.resolveSibling(database.getFileName() + "-shm"));
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
