package org.opm.localruntime.storage;

import org.flywaydb.core.Flyway;
import org.sqlite.Function;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;
import java.nio.file.*;
import java.sql.*;
import java.util.*;

/** 每个项目使用独立文件；现有按模型查询不会跨项目读取同名身份。 */
public final class SqliteStore implements RuntimeStore {
    private static final Map<Path, Object> MIGRATION_LOCKS = new java.util.concurrent.ConcurrentHashMap<>();
    private final Path root;
    private final Set<Path> migrated = new HashSet<>();
    public SqliteStore(Path root) {
        try {
            Path absolute = root.toAbsolutePath().normalize();
            Path existing = absolute;
            while (!Files.exists(existing)) existing = existing.getParent();
            this.root = existing.toRealPath().resolve(existing.relativize(absolute));
        } catch (java.io.IOException error) { throw new StorageAccessException("无法打开 SQLite 存储目录", error); }
    }
    public Path root() { return root; }
    public Path path(String project) { return root.resolve("projects").resolve(project).resolve("project.db"); }
    @Override public String schema() { return "sqlite"; }
    @Override public void migrate() { try (var ignored = catalogConnection()) { projects(); } catch (SQLException e) { throw new StorageAccessException("SQLite 初始化失败", e); } }
    @Override public Connection catalogConnection() throws SQLException { return open(root.resolve("catalog.db"), ""); }
    @Override public Connection projectConnection(String project) throws SQLException {
        new ProjectScope(this, project);
        if (project.isEmpty()) throw new SQLException("项目连接必须指定项目身份");
        return open(path(project), project);
    }
    private synchronized Connection open(Path path, String project) throws SQLException {
        try {
            for (Path part = path; part != null; part = part.getParent())
                if (Files.isSymbolicLink(part)) throw new SQLException("SQLite 路径不能包含符号链接");
            if (Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS) && !migrated.contains(path)) {
                SQLiteConfig readOnly = new SQLiteConfig(); readOnly.setReadOnly(true);
                try (var probe = DriverManager.getConnection("jdbc:sqlite:" + path, readOnly.toProperties());
                     var statement = probe.createStatement();
                     var tables = statement.executeQuery("SELECT 1 FROM sqlite_master WHERE type='table' AND name='project_metadata'")) {
                    if (tables.next()) {
                        try (var query = probe.createStatement(); var rows = query.executeQuery("SELECT metadata_value FROM schema_metadata WHERE metadata_key='storage_schema_version'")) {
                            if (!rows.next() || !"2.0".equals(rows.getString(1)))
                                throw new SQLException("检测到旧 SQLite 项目；请先停机备份，再用 LegacySqliteImportCli 转换到全新目录，原库不会自动升级");
                        }
                    }
                }
            }
            Files.createDirectories(path.getParent());
            var config = new SQLiteConfig();
            config.enforceForeignKeys(true); config.setBusyTimeout(10000);
            config.setJournalMode(SQLiteConfig.JournalMode.WAL);
            config.setSynchronous(SQLiteConfig.SynchronousMode.FULL);
            config.setTransactionMode(SQLiteConfig.TransactionMode.IMMEDIATE);
            var source = new SQLiteDataSource(config) {
                @Override public Connection getConnection() throws SQLException {
                    var connection = super.getConnection();
                    try {
                        Function.create(connection, "project_scope", new Function() {
                            @Override protected void xFunc() throws SQLException { if (project.isEmpty()) result(); else result(project); }
                        });
                        return connection;
                    } catch (SQLException error) { connection.close(); throw error; }
                }
            };
            source.setUrl("jdbc:sqlite:" + path);
            if (!migrated.contains(path)) {
                synchronized (MIGRATION_LOCKS.computeIfAbsent(path, ignored -> new Object())) {
                    Flyway.configure().dataSource(source).locations(project.isEmpty() ? "classpath:db/migration/sqlite-catalog" : "classpath:db/migration/sqlite")
                        .initSql("PRAGMA foreign_keys=ON").cleanDisabled(true).load().migrate();
                    migrated.add(path);
                }
            }
            return source.getConnection();
        } catch (java.io.IOException e) { throw new SQLException("无法创建 SQLite 存储目录", e); }
    }
    @Override public List<ProjectScope> projects() {
        Path projects = root.resolve("projects");
        if (!Files.exists(projects)) return List.of();
        try (var paths = Files.list(projects)) {
            var result = new ArrayList<ProjectScope>();
            for (Path directory : paths.sorted().toList()) {
                if (Files.isSymbolicLink(directory) || !Files.isRegularFile(directory.resolve("project.db"), LinkOption.NOFOLLOW_LINKS)) continue;
                var scope = project(directory.getFileName().toString());
                if (scope.exists()) result.add(scope);
            }
            return List.copyOf(result);
        } catch (java.io.IOException e) { throw new StorageAccessException("无法枚举 SQLite 项目", e); }
    }
    @Override public Path snapshot(Path ignored, ProjectScope project) { return path(project.projectId()); }
    static ProjectScope scope(Path path) {
        Path absolute = path.toAbsolutePath().normalize();
        if (!absolute.getFileName().toString().equals("project.db") || !absolute.getParent().getParent().getFileName().toString().equals("projects"))
            throw new IllegalArgumentException("不是 SQLite 项目文件");
        return new SqliteStore(absolute.getParent().getParent().getParent()).project(absolute.getParent().getFileName().toString());
    }
}
