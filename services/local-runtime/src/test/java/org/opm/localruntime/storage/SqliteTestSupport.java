package org.opm.localruntime.storage;

import javax.sql.DataSource;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;

/** 测试连接沿用真实 SQLite 项目身份函数、迁移及外键约束。 */
public final class SqliteTestSupport {
    private SqliteTestSupport() { }
    public static Connection connection(Path path) throws SQLException { return SqliteSnapshots.connection(path); }
    public static boolean sqlite(Connection connection) throws SQLException { return JdbcDialect.sqlite(connection); }
    public static boolean sqlite(Path path) { return SqliteSnapshots.scope(path).store() instanceof SqliteStore; }
    public static String dropTriggerSql(Connection connection, String trigger, String table) { return "DROP TRIGGER " + trigger; }
    public static String dropTriggerSql(Path path, String trigger, String table) { return "DROP TRIGGER " + trigger; }
    public static DataSource create(Path path) { return SqliteSnapshots.scope(path); }
    public static void verify(DataSource source) { ProjectConnectionFactory.verify(source); }
    public static void integrity(Connection connection) throws SQLException { SqliteSnapshots.verifyForeignKeys(connection); }
    public static void migrate(Path path) { SqliteSnapshots.scope(path).store().migrate(); }
}
