package db.digestv2;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

/** SQLite 重建受引用的内容表需要在事务外关闭外键，再在事务内校验全部引用。 */
public final class V6__save_content_digest_v2 extends BaseJavaMigration {
    @Override public boolean canExecuteInTransaction() { return false; }

    @Override public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        try (Statement statement = connection.createStatement()) {
            statement.execute("PRAGMA foreign_keys = OFF");
            if (pragma(statement, "foreign_keys") != 0) throw new SQLException("无法关闭迁移连接的外键检查");
            try {
                statement.execute("BEGIN IMMEDIATE");
                statement.execute("""
                        CREATE TABLE draft_content_v6 (
                            model_id TEXT NOT NULL REFERENCES model_catalog(model_id),
                            content_digest TEXT NOT NULL CHECK (length(content_digest) = 64 AND content_digest NOT GLOB '*[^0-9a-f]*'),
                            digest_version TEXT NOT NULL CHECK (digest_version IN ('SaveContentDigest/1', 'SaveContentDigest/2')),
                            model_json TEXT NOT NULL CHECK (json_valid(model_json) AND json_type(model_json) = 'object'),
                            artifact_json TEXT NOT NULL CHECK (json_valid(artifact_json) AND json_type(artifact_json) = 'object'),
                            artifact_digest TEXT NOT NULL CHECK (length(artifact_digest) = 64 AND artifact_digest NOT GLOB '*[^0-9a-f]*'),
                            PRIMARY KEY (model_id, content_digest)
                        )
                        """);
                statement.execute("""
                        INSERT INTO draft_content_v6 (model_id, content_digest, digest_version, model_json, artifact_json, artifact_digest)
                        SELECT model_id, content_digest, digest_version, model_json, artifact_json, artifact_digest FROM draft_content
                        """);
                statement.execute("DROP TABLE draft_content");
                statement.execute("ALTER TABLE draft_content_v6 RENAME TO draft_content");
                statement.execute("""
                        CREATE TRIGGER draft_content_no_update BEFORE UPDATE ON draft_content
                        BEGIN SELECT RAISE(ABORT, 'DRAFT_CONTENT_IMMUTABLE'); END
                        """);
                statement.execute("""
                        CREATE TRIGGER draft_content_no_replace BEFORE INSERT ON draft_content
                        WHEN EXISTS (SELECT 1 FROM draft_content WHERE model_id = NEW.model_id AND content_digest = NEW.content_digest)
                        BEGIN SELECT RAISE(ABORT, 'DRAFT_CONTENT_IMMUTABLE'); END
                        """);
                try (var violations = statement.executeQuery("PRAGMA foreign_key_check")) {
                    if (violations.next()) throw new SQLException("V6 迁移后存在悬空外键引用");
                }
                statement.execute("COMMIT");
            } catch (Exception failure) {
                try { statement.execute("ROLLBACK"); } catch (SQLException rollbackFailure) { failure.addSuppressed(rollbackFailure); }
                throw failure;
            } finally {
                statement.execute("PRAGMA foreign_keys = ON");
                if (pragma(statement, "foreign_keys") != 1) throw new SQLException("无法恢复迁移连接的外键检查");
            }
        }
    }

    private static int pragma(Statement statement, String name) throws SQLException {
        try (var rows = statement.executeQuery("PRAGMA " + name)) {
            if (!rows.next()) throw new SQLException("无法读取 SQLite 设置：" + name);
            return rows.getInt(1);
        }
    }
}
