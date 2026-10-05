package org.opm.localruntime.storage.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;
import java.sql.Connection;
import java.sql.SQLException;

/** 仅授权完整模型清理事务删除不可变数据，活动模型仍保留原保护。 */
public final class V7__Model_lifecycle_delete_guards extends BaseJavaMigration {
    @Override public Integer getChecksum() { return 1; }

    @Override public void migrate(Context context) throws SQLException {
        var connection = context.getConnection();
        execute(connection, "CREATE TABLE model_purge_authorization (model_id TEXT PRIMARY KEY REFERENCES model_catalog(model_id))");
        guard(connection, "trg_revision_document_no_delete", "revision_document", "revision_document is immutable", null);
        if (exists(connection, "model_save_mode")) {
            guard(connection, "model_save_mode_no_delete", "model_save_mode", "DRAFT_MODE_DOWNGRADE_FORBIDDEN", "OLD.mode = 'JOURNALED_DRAFT_V2'");
            guard(connection, "legacy_head_delete_guard", "model_head", "DRAFT_PROTOCOL_UPGRADE_REQUIRED",
                    "EXISTS (SELECT 1 FROM model_save_mode WHERE model_id=OLD.model_id AND mode='JOURNALED_DRAFT_V2')");
            guard(connection, "draft_savepoint_no_delete", "draft_savepoint", "DRAFT_SAVEPOINT_IMMUTABLE", null);
            guard(connection, "draft_receipt_no_delete", "draft_receipt", "DRAFT_RECEIPT_IMMUTABLE", null);
        }
        execute(connection, """
                CREATE TRIGGER model_archived_revision_write_guard BEFORE INSERT ON revision_document
                WHEN EXISTS (SELECT 1 FROM model_catalog WHERE model_id=NEW.model_id AND status <> 'ACTIVE')
                BEGIN SELECT RAISE(ABORT, 'MODEL_ARCHIVED'); END
                """);
        execute(connection, """
                CREATE TRIGGER model_archived_baseline_write_guard BEFORE INSERT ON baseline
                WHEN EXISTS (SELECT 1 FROM model_catalog WHERE model_id=NEW.model_id AND status <> 'ACTIVE')
                BEGIN SELECT RAISE(ABORT, 'MODEL_ARCHIVED'); END
                """);
    }

    private static void guard(Connection connection, String trigger, String table, String message, String condition) throws SQLException {
        execute(connection, "DROP TRIGGER " + trigger);
        String authorized = "EXISTS (SELECT 1 FROM model_purge_authorization a JOIN model_catalog m ON m.model_id=a.model_id WHERE a.model_id=OLD.model_id AND m.status='ARCHIVED')";
        execute(connection, "CREATE TRIGGER " + trigger + " BEFORE DELETE ON " + table + " WHEN "
                + (condition == null ? "" : "(" + condition + ") AND ") + "NOT " + authorized
                + " BEGIN SELECT RAISE(ABORT, '" + message + "'); END");
    }
    private static boolean exists(Connection connection, String table) throws SQLException {
        try (var statement = connection.prepareStatement("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")) {
            statement.setString(1, table); try (var rows = statement.executeQuery()) { return rows.next(); }
        }
    }
    private static void execute(Connection connection, String sql) throws SQLException {
        try (var statement = connection.createStatement()) { statement.execute(sql); }
    }
}
