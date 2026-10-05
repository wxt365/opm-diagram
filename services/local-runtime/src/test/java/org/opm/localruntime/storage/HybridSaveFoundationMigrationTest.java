package org.opm.localruntime.storage;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import javax.sql.DataSource;

import static org.junit.jupiter.api.Assertions.*;

class HybridSaveFoundationMigrationTest {
    @TempDir Path temporaryDirectory;
    private static final String DIGEST = "a".repeat(64);

    @Test
    void upgradesExistingDatabaseWithoutChangingLegacyRevisionAndRepeatsSafely() throws Exception {
        DataSource source = database("upgrade");
        migrate(source, "2");
        try (Connection connection = source.getConnection()) { seed(connection); }
        assertEquals(1, migrate(source, "3"));
        assertEquals(0, migrate(source, "3"));
        try (Connection connection = source.getConnection()) {
            assertEquals("1.2", scalar(connection, "SELECT metadata_value FROM schema_metadata WHERE metadata_key='storage_schema_version'"));
            assertEquals("legacy-document", scalar(connection, "SELECT document_json FROM revision_document WHERE revision_id='revision.1'"));
            assertEquals("0", scalar(connection, "SELECT count(*) FROM model_save_mode"));
            execute(connection, "UPDATE model_head SET head_sequence=1 WHERE model_id='model.1'");
            assertThrows(SQLException.class, () -> execute(connection, "DELETE FROM revision_document WHERE revision_id='revision.1'"));
            assertThrows(SQLException.class, () -> execute(connection, "UPDATE revision_document SET document_json='changed' WHERE revision_id='revision.1'"));
            try (var statement = connection.createStatement(); var rows = statement.executeQuery("PRAGMA foreign_key_check")) {
                assertFalse(rows.next());
            }
        }
    }

    @Test
    void newDatabaseRequiresWholeSeedBeforeModeCanBecomeVisible() throws Exception {
        assertNull(getClass().getResource("/db/migration/hybrid-save/V3__hybrid_save_foundation.sql"), "待启用迁移不得进入默认运行资源");
        assertNull(getClass().getResource("/db/migration/V3__hybrid_save_foundation.sql"), "待启用迁移不得进入默认运行资源");
        DataSource source = database("atomic");
        assertEquals(3, migrate(source, "3"));
        try (Connection connection = source.getConnection()) {
            seed(connection);
            assertThrows(SQLException.class, () -> execute(connection, "INSERT INTO model_save_mode VALUES ('model.1','JOURNALED_DRAFT_V2','missing')"));
            connection.setAutoCommit(false);
            content(connection);
            stream(connection, "model.1", "draft.1", "revision.1");
            assertThrows(SQLException.class, connection::commit);
            connection.rollback();
            connection.setAutoCommit(true);
            assertEquals("0", scalar(connection, "SELECT count(*) FROM draft_stream"));
            assertEquals("0", scalar(connection, "SELECT count(*) FROM draft_content"));
            activate(connection);
            assertEquals("JOURNALED_DRAFT_V2", scalar(connection, "SELECT mode FROM model_save_mode"));
        }
    }

    @Test
    void blocksLegacyWritesAndModeDowngradeAfterActivationButPreservesReads() throws Exception {
        DataSource source = database("guard");
        migrate(source, "3");
        try (Connection connection = source.getConnection()) {
            seed(connection);
            activate(connection);
            for (String sql : new String[]{
                    "UPDATE model_head SET head_sequence=2 WHERE model_id='model.1'",
                    "DELETE FROM model_head WHERE model_id='model.1'",
                    "INSERT INTO revision_document SELECT 'revision.2', model_id, 2, schema_version, profile_id, profile_version, rule_set_id, rule_set_version, schema_set_json, profile_binding_json, document_json, 'digest.2', commit_reason, immutable, created_at FROM revision_document",
                    "DELETE FROM model_save_mode WHERE model_id='model.1'",
                    "INSERT OR REPLACE INTO model_save_mode VALUES ('model.1','REVISION_PER_EDIT_V1',NULL)",
                    "UPDATE model_save_mode SET mode='REVISION_PER_EDIT_V1', active_draft_id=NULL WHERE model_id='model.1'"}) {
                assertThrows(SQLException.class, () -> execute(connection, sql), sql);
            }
            assertEquals("revision.1", scalar(connection, "SELECT draft_head_revision_id FROM model_head"));
            assertEquals("1", scalar(connection, "SELECT count(*) FROM revision_document"));
            execute(connection, "INSERT INTO draft_savepoint VALUES ('saved.1','model.1','draft.1',0,1,'MANUAL','" + DIGEST + "','2026-09-11T00:00:00.000Z')");
            assertEquals("1", scalar(connection, "SELECT count(*) FROM draft_savepoint"));
            assertThrows(SQLException.class, () -> execute(connection, "DELETE FROM draft_savepoint"));
            assertThrows(SQLException.class, () -> execute(connection, "INSERT OR REPLACE INTO draft_savepoint SELECT * FROM draft_savepoint"));
            assertThrows(SQLException.class, () -> execute(connection, "UPDATE draft_content SET model_json='{}'"));
            assertThrows(SQLException.class, () -> execute(connection, "INSERT OR REPLACE INTO draft_content SELECT * FROM draft_content"));
        }
    }

    @Test
    void rejectsCrossModelIdentityDanglingContentUnsafeSequenceAndProtectedDeletion() throws Exception {
        DataSource source = database("constraints");
        migrate(source, "3");
        try (Connection connection = source.getConnection()) {
            seed(connection);
            execute(connection, "INSERT INTO model_catalog VALUES ('model.2','project.1','Other','other',NULL,'ACTIVE','{}','now','now')");
            assertThrows(SQLException.class, () -> stream(connection, "model.2", "draft.2", "revision.1"));
            activate(connection);
            assertThrows(SQLException.class, () -> execute(connection, "INSERT INTO model_save_mode VALUES ('model.2','JOURNALED_DRAFT_V2','draft.1')"));
            for (String seq : new String[]{"-1", "0.5", "9007199254740992"}) {
                assertThrows(SQLException.class, () -> execute(connection, "UPDATE draft_stream SET edit_seq=" + seq), seq);
            }
            assertThrows(SQLException.class, () -> execute(connection, "INSERT INTO draft_checkpoint VALUES ('model.1','draft.1','checkpoint.missing',0,'" + "b".repeat(64) + "','now')"));
            assertThrows(SQLException.class, () -> execute(connection, "DELETE FROM draft_checkpoint"));
            assertThrows(SQLException.class, () -> execute(connection, "DELETE FROM draft_content"));
            execute(connection, "INSERT INTO draft_receipt VALUES ('model.1','EDIT','command.1','" + DIGEST + "','{}','now')");
            assertThrows(SQLException.class, () -> execute(connection, "DELETE FROM draft_receipt"));
            assertThrows(SQLException.class, () -> execute(connection, "UPDATE draft_receipt SET result_json='{}'"));
            assertThrows(SQLException.class, () -> execute(connection, "INSERT OR REPLACE INTO draft_receipt SELECT * FROM draft_receipt"));
        }
    }

    private DataSource database(String name) { return SqliteConnectionFactory.create(temporaryDirectory.resolve(name + ".sqlite")); }

    private int migrate(DataSource source, String target) {
        Path repository = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (repository != null && !Files.isDirectory(repository.resolve("docs/contracts/migrations/sqlite"))) repository = repository.getParent();
        assertNotNull(repository, "必须从仓库源码读取受控迁移");
        return Flyway.configure().dataSource(source)
                .locations("filesystem:" + repository.resolve("docs/contracts/migrations/sqlite"))
                .target(target).mixed(true).load().migrate().migrationsExecuted;
    }

    private void seed(Connection connection) throws SQLException {
        execute(connection, "INSERT INTO project_metadata VALUES ('project.1','Project','project',NULL,'ACTIVE','profile.1','1.0','now','now')");
        execute(connection, "INSERT INTO model_catalog VALUES ('model.1','project.1','Model','model',NULL,'ACTIVE','{}','now','now')");
        execute(connection, "INSERT INTO profile_package VALUES ('profile.1','1.0','profile-digest','DRAFT','{}','now')");
        execute(connection, "INSERT INTO rule_set_package VALUES ('rule.1','1.0','rule-digest','DRAFT','{}','now')");
        execute(connection, "INSERT INTO revision_document VALUES ('revision.1','model.1',1,'0.2','profile.1','1.0','rule.1','1.0','{}','{}','legacy-document','legacy-digest','TEST',1,'now')");
        execute(connection, "INSERT INTO model_head VALUES ('model.1','revision.1',1,'now')");
    }

    private void content(Connection connection) throws SQLException {
        execute(connection, "INSERT INTO draft_content VALUES ('model.1','" + DIGEST + "','SaveContentDigest/1','{}','{}','" + DIGEST + "')");
    }

    private void stream(Connection connection, String model, String draft, String revision) throws SQLException {
        // 测试输入均为本类固定 ID，不接受外部字符串。
        execute(connection, "INSERT INTO draft_stream VALUES ('" + model + "','" + draft + "',0,'" + DIGEST + "','" + revision + "','checkpoint.1',NULL,NULL)");
    }

    private void activate(Connection connection) throws SQLException {
        connection.setAutoCommit(false);
        try {
            content(connection);
            stream(connection, "model.1", "draft.1", "revision.1");
            execute(connection, "INSERT INTO draft_checkpoint VALUES ('model.1','draft.1','checkpoint.1',0,'" + DIGEST + "','now')");
            execute(connection, "INSERT INTO model_save_mode VALUES ('model.1','JOURNALED_DRAFT_V2','draft.1')");
            connection.commit();
        } catch (SQLException failure) { connection.rollback(); throw failure; }
        finally { connection.setAutoCommit(true); }
    }

    private void execute(Connection connection, String sql) throws SQLException {
        try (var statement = connection.createStatement()) { statement.execute(sql); }
    }

    private String scalar(Connection connection, String sql) throws SQLException {
        try (var statement = connection.createStatement(); var result = statement.executeQuery(sql)) {
            assertTrue(result.next()); return result.getString(1);
        }
    }
}
