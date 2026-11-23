package org.opm.localruntime.storage;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;

/** OPM 测试、交换及恢复共用的 SQLite 文件身份边界。 */
public final class SqliteSnapshots {
    private SqliteSnapshots() { }
    public static SqliteStore tools(Path root) { return new SqliteStore(root); }
    public static ProjectScope scope(Path file) { return SqliteStore.scope(file); }
    public static Connection connection(Path file) throws SQLException { return scope(file).getConnection(); }
    public static Path path(Path root, String project) { return root.resolve("projects").resolve(project).resolve("project.db"); }
    @FunctionalInterface public interface SnapshotCheck { void verify(Connection connection) throws Exception; }
    public static Path write(Path root, ProjectScope project) throws Exception { return write(root, project, ignored -> { }); }
    public static Path write(Path root, ProjectScope project, SnapshotCheck check) throws Exception {
        try (var connection = project.getConnection()) { check.verify(connection); }
        return project.store().snapshot(root, project);
    }
    public static void verify(Path file) throws Exception {
        try (var connection = connection(file)) { verifyForeignKeys(connection); }
    }
    public static void verifyForeignKeys(Connection connection) throws SQLException {
        try (var statement = connection.createStatement(); var rows = statement.executeQuery("PRAGMA foreign_key_check")) {
            if (rows.next()) throw new SQLException("SQLite 外键检查失败");
        }
    }
}
