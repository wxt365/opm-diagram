package org.opm.localruntime.storage;

import javax.sql.DataSource;
import java.io.PrintWriter;
import java.sql.*;
import java.util.Objects;
import java.util.logging.Logger;

/** 显式项目身份；连接生命周期由存储实现管理。 */
public record ProjectScope(RuntimeStore store, String projectId) implements DataSource {
    public ProjectScope {
        Objects.requireNonNull(store);
        if (projectId == null || (!projectId.isEmpty() && !projectId.matches("[A-Za-z][A-Za-z0-9._:-]{2,127}")))
            throw new IllegalArgumentException("Invalid project identity");
    }
    @Override public Connection getConnection() throws SQLException { return store.projectConnection(projectId); }
    public boolean exists() {
        if (store instanceof SqliteStore sqlite && !java.nio.file.Files.isRegularFile(sqlite.path(projectId), java.nio.file.LinkOption.NOFOLLOW_LINKS)) return false;
        try (var c=getConnection();var s=c.prepareStatement("SELECT 1 FROM project_metadata WHERE project_id=?")) {
            s.setString(1,projectId);try(var rows=s.executeQuery()){return rows.next();}
        } catch(SQLException e){throw new StorageAccessException("Cannot inspect project",e);}
    }
    @Override public Connection getConnection(String username,String password) throws SQLException { throw new SQLFeatureNotSupportedException(); }
    @Override public PrintWriter getLogWriter(){return null;}
    @Override public void setLogWriter(PrintWriter writer){}
    @Override public void setLoginTimeout(int seconds){}
    @Override public int getLoginTimeout(){return 10;}
    @Override public Logger getParentLogger(){return Logger.getLogger("org.opm.localruntime.storage");}
    @Override public <T>T unwrap(Class<T> type) throws SQLException {if(type.isInstance(this))return type.cast(this);throw new SQLException("Not a wrapper");}
    @Override public boolean isWrapperFor(Class<?> type){return type.isInstance(this);}
}
