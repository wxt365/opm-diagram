package org.opm.localruntime.storage;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.api.generated.DraftSaveContract.SaveRequest;
import org.opm.localruntime.application.DraftSaveService;
import org.opm.localruntime.assets.FileProfilePackageLoader;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Clock;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.*;

class SaveContentDigestV2MigrationTest {
    @TempDir Path temporary;

    @Test
    void upgradesV5WithoutChangingReferencedContentAndKeepsBothVersionsProtected() throws Exception {
        Path database = DraftWorkspaceTestDatabase.create(temporary, true, ignored -> { });
        Flyway.configure().dataSource(SqliteConnectionFactory.create(database))
                .locations("filesystem:" + DraftWorkspaceTestDatabase.root().resolve("docs/contracts/migrations/sqlite"),
                        "filesystem:" + DraftWorkspaceTestDatabase.root().resolve("docs/contracts/migrations/sqlite-checkpoint"),
                        "filesystem:" + DraftWorkspaceTestDatabase.root().resolve("docs/contracts/migrations/sqlite-pin"))
                .target("5").mixed(true).load().migrate();
        String original;
        try (Connection connection = SqliteConnectionFactory.create(database).getConnection()) {
            original = scalar(connection, "SELECT model_json || artifact_json || content_digest FROM draft_content");
            assertEquals("1", scalar(connection, "SELECT count(*) FROM draft_checkpoint"));
        }

        ProjectDatabaseFactory factory = ProjectDatabaseFactory.journaledDrafts(temporary);
        var opened = factory.open(DraftWorkspaceTestDatabase.PROJECT);
        if (opened instanceof ProjectDatabaseOpenResult.RecoveryRequired recovery)
            fail(java.nio.file.Files.readString(recovery.markerPath()));
        var result = assertInstanceOf(ProjectDatabaseOpenResult.Ready.class, opened);
        assertTrue(result.recoveryPoint().isPresent());
        assertInstanceOf(ProjectDatabaseOpenResult.Ready.class, factory.open(DraftWorkspaceTestDatabase.PROJECT));
        try (Connection connection = SqliteConnectionFactory.create(database).getConnection()) {
            assertEquals("8", scalar(connection, "SELECT max(version) FROM flyway_schema_history WHERE success=1"));
            assertEquals("1", scalar(connection, "SELECT count(*) FROM flyway_schema_history WHERE version='6' AND success=1"));
            assertEquals(original, scalar(connection, "SELECT model_json || artifact_json || content_digest FROM draft_content"));
            assertEquals("1", scalar(connection, "SELECT count(*) FROM draft_checkpoint c JOIN draft_content d ON d.model_id=c.model_id AND d.content_digest=c.content_digest"));
            assertEquals("ok", scalar(connection, "PRAGMA integrity_check"));
            assertNull(optionalScalar(connection, "PRAGMA foreign_key_check"));

            String model = DraftWorkspaceTestDatabase.MODEL;
            String digest = "b".repeat(64);
            String insert = "INSERT INTO draft_content VALUES ('" + model + "','" + digest + "',%s,'{}','{}','" + digest + "')";
            execute(connection, insert.formatted("'SaveContentDigest/2'"));
            assertEquals("SaveContentDigest/2", scalar(connection, "SELECT digest_version FROM draft_content WHERE content_digest='" + digest + "'"));
            assertThrows(SQLException.class, () -> execute(connection, insert.formatted("'SaveContentDigest/3'")));
            assertThrows(SQLException.class, () -> execute(connection, insert.formatted("'SaveContentDigest/1'")));
            assertThrows(SQLException.class, () -> execute(connection, "UPDATE draft_content SET model_json='{}' WHERE content_digest='" + digest + "'"));
            assertThrows(SQLException.class, () -> execute(connection, "INSERT OR REPLACE INTO draft_content SELECT * FROM draft_content WHERE content_digest='" + digest + "'"));
            assertEquals("ok", scalar(connection, "PRAGMA integrity_check"));
            assertNull(optionalScalar(connection, "PRAGMA foreign_key_check"));
        }
    }

    @Test
    void firstSaveMigratesExistingV5ProjectBeforeWriting() throws Exception {
        Path database = DraftWorkspaceTestDatabase.create(temporary, true, ignored -> { });
        Flyway.configure().dataSource(SqliteConnectionFactory.create(database))
                .locations("filesystem:" + DraftWorkspaceTestDatabase.root().resolve("docs/contracts/migrations/sqlite"),
                        "filesystem:" + DraftWorkspaceTestDatabase.root().resolve("docs/contracts/migrations/sqlite-checkpoint"),
                        "filesystem:" + DraftWorkspaceTestDatabase.root().resolve("docs/contracts/migrations/sqlite-pin"))
                .target("5").mixed(true).load().migrate();
        var token = new DraftJournalRepository(database, Clock.systemUTC())
                .read(DraftWorkspaceTestDatabase.PROJECT, DraftWorkspaceTestDatabase.MODEL).token();
        var factory = ProjectDatabaseFactory.journaledDrafts(temporary);
        var loader = new FileProfilePackageLoader(DraftWorkspaceTestDatabase.root().resolve("packages/profiles"));
        try (var service = new DraftSaveService(factory, loader, Clock.systemUTC(), System::nanoTime,
                Executors.newSingleThreadScheduledExecutor())) {
            var saved = service.save(DraftWorkspaceTestDatabase.PROJECT, DraftWorkspaceTestDatabase.MODEL,
                    new SaveRequest("save.after.v6.migration", token, "MANUAL"));
            assertEquals("SAVED", saved.status());
        }
        try (Connection connection = SqliteConnectionFactory.create(database).getConnection()) {
            assertEquals("8", scalar(connection, "SELECT max(version) FROM flyway_schema_history WHERE success=1"));
            assertEquals("1", scalar(connection, "SELECT count(*) FROM draft_savepoint"));
        }
    }

    @Test
    void failedV6LeavesV5ContentUntouchedAndProvidesRecoveryPoint() throws Exception {
        Path database = DraftWorkspaceTestDatabase.create(temporary, true, ignored -> { });
        Flyway.configure().dataSource(SqliteConnectionFactory.create(database))
                .locations("filesystem:" + DraftWorkspaceTestDatabase.root().resolve("docs/contracts/migrations/sqlite"),
                        "filesystem:" + DraftWorkspaceTestDatabase.root().resolve("docs/contracts/migrations/sqlite-checkpoint"),
                        "filesystem:" + DraftWorkspaceTestDatabase.root().resolve("docs/contracts/migrations/sqlite-pin"))
                .target("5").mixed(true).load().migrate();
        try (Connection connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + database)) {
            execute(connection, "INSERT INTO draft_checkpoint VALUES ('" + DraftWorkspaceTestDatabase.MODEL
                    + "','draft.http','checkpoint.dangling',1,'" + "f".repeat(64) + "','2026-09-13T00:00:00.000Z')");
        }

        var result = ProjectDatabaseFactory.journaledDrafts(temporary).open(DraftWorkspaceTestDatabase.PROJECT);
        var recovery = assertInstanceOf(ProjectDatabaseOpenResult.RecoveryRequired.class, result);
        assertTrue(recovery.recoveryPoint().isPresent());
        assertTrue(java.nio.file.Files.isRegularFile(recovery.recoveryPoint().orElseThrow()));
        try (Connection connection = SqliteConnectionFactory.create(database).getConnection()) {
            assertEquals("5", scalar(connection, "SELECT max(version) FROM flyway_schema_history WHERE success=1"));
            assertEquals("1", scalar(connection, "SELECT count(*) FROM draft_content"));
            assertEquals("0", scalar(connection, "SELECT count(*) FROM sqlite_master WHERE name='draft_content_v6'"));
            assertTrue(scalar(connection, "SELECT sql FROM sqlite_master WHERE name='draft_content'")
                    .contains("digest_version = 'SaveContentDigest/1'"));
        }
    }

    private static void execute(Connection connection, String sql) throws SQLException {
        try (var statement = connection.createStatement()) { statement.execute(sql); }
    }

    private static String scalar(Connection connection, String sql) throws SQLException {
        String value = optionalScalar(connection, sql);
        assertNotNull(value, sql);
        return value;
    }

    private static String optionalScalar(Connection connection, String sql) throws SQLException {
        try (var statement = connection.createStatement(); var rows = statement.executeQuery(sql)) {
            return rows.next() ? rows.getString(1) : null;
        }
    }
}
