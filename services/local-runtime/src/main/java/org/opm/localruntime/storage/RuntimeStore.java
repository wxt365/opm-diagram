package org.opm.localruntime.storage;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;

/** 数据库适配边界；项目连接必须已落实项目隔离。 */
public interface RuntimeStore extends AutoCloseable {
    Connection projectConnection(String project) throws SQLException;
    Connection catalogConnection() throws SQLException;
    List<ProjectScope> projects();
    void migrate();
    String schema();
    Path snapshot(Path root, ProjectScope project) throws Exception;
    default ProjectScope project(String project) { return new ProjectScope(this, project); }
    @Override default void close() { }
}
