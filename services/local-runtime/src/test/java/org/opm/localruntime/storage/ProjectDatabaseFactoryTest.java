package org.opm.localruntime.storage;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProjectDatabaseFactoryTest {

    @TempDir
    Path temporaryDirectory;

    @Test
    void migratesEmptyProjectDatabaseAndExposesSchemaVersionWithoutJdbcTypes() throws SQLException {
        ProjectDatabaseOpenResult.Ready ready = openReady("project-001");

        assertEquals("1.0", ready.database().storageSchemaVersion().value());
        assertFalse(ready.recoveryPoint().isPresent());

        try (Connection connection = openRawConnection(ready.database().databasePath())) {
            assertEquals(20, count(connection,
                    "SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'flyway_schema_history'"));
            assertNoRows(connection, "PRAGMA foreign_key_check");
            assertEquals(1, count(connection,
                    "SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1 AND version = '1'"));
        }
    }

    @Test
    void repeatedOpenDoesNotReapplyV1AndKeepsSqlitePragmas() throws SQLException {
        ProjectDatabaseOpenResult.Ready first = openReady("project-002");
        ProjectDatabaseOpenResult.Ready second = openReady("project-002");

        assertEquals(first.database().databasePath(), second.database().databasePath());
        assertEquals("1.0", second.database().storageSchemaVersion().value());
        SqliteConnectionFactory.verify(SqliteConnectionFactory.create(second.database().databasePath()));

        try (Connection connection = openRawConnection(second.database().databasePath())) {
            assertEquals(1, count(connection,
                    "SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1 AND version = '1'"));
        }
    }

    @Test
    void schemaRejectsDanglingRevisionAndRevisionMutation() throws SQLException {
        ProjectDatabaseOpenResult.Ready ready = openReady("project-003");

        try (Connection connection = openRawConnection(ready.database().databasePath())) {
            assertThrows(SQLException.class, () -> insertRevision(connection, "revision-missing-model", "missing-model"));
            seedRequiredRevisionReferences(connection);
            insertRevision(connection, "revision-001", "model-001");

            assertThrows(SQLException.class,
                    () -> execute(connection, "UPDATE revision_document SET document_json = '{}' WHERE revision_id = 'revision-001'"));
            assertThrows(SQLException.class,
                    () -> execute(connection, "DELETE FROM revision_document WHERE revision_id = 'revision-001'"));
        }
    }

    @Test
    void createsRecoveryPointAndMarkerWhenPendingMigrationFails() throws IOException {
        openReady("project-004");
        Path brokenMigrations = temporaryDirectory.resolve("broken-migrations");
        Files.createDirectories(brokenMigrations);
        Files.writeString(brokenMigrations.resolve("V2__broken.sql"), "CREATE TABLE ;\n");

        ProjectDatabaseFactory factory = new ProjectDatabaseFactory(
                temporaryDirectory,
                new FlywayProjectSchemaMigrator(List.of(
                        "classpath:db/migration",
                        "filesystem:" + brokenMigrations.toAbsolutePath())));
        ProjectDatabaseOpenResult result = factory.open("project-004");

        ProjectDatabaseOpenResult.RecoveryRequired recovery = assertInstanceOf(
                ProjectDatabaseOpenResult.RecoveryRequired.class, result);
        assertTrue(recovery.recoveryPoint().isPresent());
        assertTrue(Files.exists(recovery.recoveryPoint().orElseThrow()));
        assertTrue(Files.exists(recovery.markerPath()));
        assertTrue(Files.readString(recovery.markerPath()).contains("status=RECOVERY_REQUIRED"));
    }

    @Test
    void rejectsProjectIdThatCouldBeUsedAsAPath() {
        ProjectDatabaseFactory factory = new ProjectDatabaseFactory(temporaryDirectory, new FlywayProjectSchemaMigrator());

        assertThrows(IllegalArgumentException.class, () -> factory.open("../project"));
        assertThrows(IllegalArgumentException.class, () -> factory.open("project/001"));
    }

    private ProjectDatabaseOpenResult.Ready openReady(String projectId) {
        ProjectDatabaseFactory factory = new ProjectDatabaseFactory(temporaryDirectory, new FlywayProjectSchemaMigrator());
        ProjectDatabaseOpenResult result = factory.open(projectId);
        if (result instanceof ProjectDatabaseOpenResult.RecoveryRequired recovery) {
            throw new AssertionError("Project database migration requires recovery: " + readMarker(recovery.markerPath()));
        }
        return assertInstanceOf(ProjectDatabaseOpenResult.Ready.class, result);
    }

    private String readMarker(Path markerPath) {
        try {
            return Files.readString(markerPath);
        } catch (IOException exception) {
            return "marker unreadable: " + exception.getMessage();
        }
    }

    private Connection openRawConnection(Path databasePath) throws SQLException {
        Connection connection = DriverManager.getConnection("jdbc:sqlite:" + databasePath.toAbsolutePath() + "?foreign_keys=on");
        try (Statement statement = connection.createStatement()) {
            statement.execute("PRAGMA foreign_keys = ON");
        }
        return connection;
    }

    private int count(Connection connection, String sql) throws SQLException {
        try (Statement statement = connection.createStatement();
             ResultSet resultSet = statement.executeQuery(sql)) {
            resultSet.next();
            return resultSet.getInt(1);
        }
    }

    private void assertNoRows(Connection connection, String sql) throws SQLException {
        try (Statement statement = connection.createStatement();
             ResultSet resultSet = statement.executeQuery(sql)) {
            assertFalse(resultSet.next());
        }
    }

    private void seedRequiredRevisionReferences(Connection connection) throws SQLException {
        execute(connection, """
                INSERT INTO project_metadata(
                    project_id, name, normalized_name, status, default_profile_id, default_profile_version, created_at, updated_at)
                VALUES ('project-003', 'Project', 'project', 'ACTIVE', 'profile-001', '1.0.0', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
                """);
        execute(connection, """
                INSERT INTO model_catalog(
                    model_id, project_id, name, normalized_name, status, profile_binding_json, created_at, updated_at)
                VALUES ('model-001', 'project-003', 'Model', 'model', 'ACTIVE', '{}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
                """);
        execute(connection, """
                INSERT INTO profile_package(
                    profile_id, package_version, package_digest, lifecycle_status, package_json, installed_at)
                VALUES ('profile-001', '1.0.0', 'profile-digest', 'DRAFT', '{}', '2026-01-01T00:00:00Z')
                """);
        execute(connection, """
                INSERT INTO rule_set_package(
                    rule_set_id, rule_set_version, rule_set_digest, lifecycle_status, package_json, installed_at)
                VALUES ('rule-001', '1.0.0', 'rule-digest', 'DRAFT', '{}', '2026-01-01T00:00:00Z')
                """);
    }

    private void insertRevision(Connection connection, String revisionId, String modelId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO revision_document(
                    revision_id, model_id, revision_sequence, schema_version, profile_id, profile_version,
                    rule_set_id, rule_set_version, schema_set_json, profile_binding_json, document_json,
                    document_digest, commit_reason, created_at)
                VALUES (?, ?, 1, '0.1', 'profile-001', '1.0.0', 'rule-001', '1.0.0', '{}', '{}', '{}',
                    ?, 'TEST', '2026-01-01T00:00:00Z')
                """)) {
            statement.setString(1, revisionId);
            statement.setString(2, modelId);
            statement.setString(3, revisionId + "-digest");
            statement.executeUpdate();
        }
    }

    private void execute(Connection connection, String sql) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute(sql);
        }
    }
}
