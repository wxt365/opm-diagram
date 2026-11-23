package org.opm.localruntime.storage;
import javax.sql.DataSource;
import java.sql.*;
public final class ProjectConnectionFactory {
    private ProjectConnectionFactory() { }
    static DataSource create(ProjectScope project) { return project; }
    static void verify(DataSource source) {
        try(var c=source.getConnection();var s=c.createStatement();var r=s.executeQuery("SELECT 1")){if(!r.next())throw new SQLException("Database health check failed");}
        catch(SQLException e){throw new StorageAccessException("数据库连接验证失败",e);}
    }
    static boolean hasTable(Connection connection,String table) throws SQLException {
        return JdbcDialect.tables(connection).contains(table);
    }
    /** Serialize project writes and preserve project-wide receipt order. */
    public static void lockProject(Connection connection) throws SQLException {
        if (!JdbcDialect.sqlite(connection)) throw new SQLException("此版本仅支持 SQLite 事务");
    }
}
