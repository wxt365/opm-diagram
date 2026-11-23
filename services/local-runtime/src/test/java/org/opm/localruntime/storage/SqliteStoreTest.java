package org.opm.localruntime.storage;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.application.LocalApiService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLException;
import java.util.Map;
import java.util.concurrent.Executors;
import static org.junit.jupiter.api.Assertions.*;

class SqliteStoreTest {
    @TempDir Path temporary;
    @Test void 读不存在项目不创建文件且外键和只读事务保持约束() throws Exception {
        var store = new SqliteStore(temporary.resolve("runtime"));
        assertFalse(store.project("project.missing").exists());
        assertFalse(Files.exists(store.root()));
        try (var connection = store.projectConnection("project.first")) {
            try (var statement = connection.createStatement(); var rows = statement.executeQuery("PRAGMA foreign_keys")) {
                assertTrue(rows.next()); assertEquals(1, rows.getInt(1));
            }
            connection.setAutoCommit(false);
            try (var statement = connection.createStatement()) {
                statement.execute("INSERT INTO model_catalog(model_id,project_id,name,normalized_name,status,profile_binding_json,created_at,updated_at) VALUES('model.orphan','project.first','x','x','ACTIVE','{}','now','now')");
            }
            assertThrows(SQLException.class, connection::commit);
            connection.rollback();
        }
        try (var connection = store.projectConnection("project.first"); var statement = connection.createStatement()) {
            JdbcDialect.begin(connection, false);
            assertThrows(SQLException.class, () -> statement.execute("DELETE FROM model_catalog"));
            statement.execute("ROLLBACK");
        }
        assertTrue(store.projects().isEmpty());
    }
    @Test void 两个服务并发创建同一项目命令只产生一个项目且重启可恢复() throws Exception {
        var first = new LocalApiService(new ProjectDatabaseFactory(temporary, new SqliteStore(temporary), false));
        var second = new LocalApiService(new ProjectDatabaseFactory(temporary, new SqliteStore(temporary), false));
        // 先完成目录迁移，本测试验证跨连接业务幂等，不混入启动时序。
        new SqliteStore(temporary).migrate();
        var request = Map.<String,Object>of("request_id", "request.shared", "command_id", "command.shared", "name", "共享项目");
        var executor = Executors.newFixedThreadPool(2);
        try {
            var a = executor.submit(() -> first.createProject(request));
            var b = executor.submit(() -> second.createProject(request));
            assertEquals(a.get(15, java.util.concurrent.TimeUnit.SECONDS), b.get(15, java.util.concurrent.TimeUnit.SECONDS));
        } finally { executor.shutdownNow(); }
        var reopened = new SqliteStore(temporary); reopened.migrate();
        assertEquals(1, reopened.projects().size());
    }
    @Test void 拒绝项目目录符号链接避免写入存储根目录之外() throws Exception {
        var store = new SqliteStore(temporary.resolve("runtime"));
        Files.createDirectories(store.root().resolve("projects"));
        var outside = Files.createDirectory(temporary.resolve("outside"));
        Files.createSymbolicLink(store.root().resolve("projects/project.link"), outside);
        assertThrows(SQLException.class, () -> store.projectConnection("project.link"));
        assertFalse(Files.exists(outside.resolve("project.db")));
    }
}
