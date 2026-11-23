package org.opm.localruntime.storage;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.sql.*;
import java.time.Clock;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class LegacySqliteImportTest {
    @TempDir Path temporary;
    private Path root() throws Exception { return temporary.toRealPath(); }

    @Test void 旧V8转换保留语义草稿与脑图并保持原文件不变() throws Exception {
        Path old = legacy(); String before = StorageDigests.hash(old);
        Path converted = LegacySqliteImportCli.importProject(old, root().resolve("converted"));
        assertEquals(before, StorageDigests.hash(old));
        try (var source = DriverManager.getConnection("jdbc:sqlite:" + old);
             var target = SqliteSnapshots.connection(converted)) {
            for (String table : List.of("revision_document", "draft_content", "draft_stream", "mindmap_document"))
                assertEquals(count(source, table), count(target, table), table);
            assertEquals(8, count(source, "flyway_schema_history"));
            assertEquals(1, count(target, "flyway_schema_history"));
            try (var s = target.createStatement(); var rows = s.executeQuery("SELECT document_json FROM mindmap_document")) {
                assertTrue(rows.next()); assertEquals("{\"label\":\"独立分析\"}", rows.getString(1));
            }
        }
        var reopened = new DraftJournalRepository(converted, Clock.systemUTC()).read(DraftWorkspaceTestDatabase.PROJECT, DraftWorkspaceTestDatabase.MODEL);
        assertEquals(0, reopened.token().edit_seq());
        assertTrue(reopened.documentJson().contains("Material"));
        assertThrows(IllegalArgumentException.class, () -> LegacySqliteImportCli.importProject(old, root().resolve("converted")));
        assertEquals(before, StorageDigests.hash(old));
    }

    @Test void 旧库不能被新版Flyway直接升级() throws Exception {
        Path old = legacy(); String before = StorageDigests.hash(old);
        var store = new SqliteStore(old.getParent().getParent().getParent());
        var error = assertThrows(SQLException.class, () -> store.projectConnection(DraftWorkspaceTestDatabase.PROJECT));
        assertTrue(error.getMessage().contains("LegacySqliteImportCli"));
        assertEquals(before, StorageDigests.hash(old));
    }

    @Test void 不能静默丢弃业务或未知表且失败没有最终目录() throws Exception {
        Path old = legacy();
        try (var c = DriverManager.getConnection("jdbc:sqlite:" + old); var s = c.createStatement()) { s.execute("CREATE TABLE bm_unsupported(value TEXT)"); }
        String before = StorageDigests.hash(old); Path target = root().resolve("rejected");
        assertThrows(IllegalArgumentException.class, () -> LegacySqliteImportCli.importProject(old, target));
        assertFalse(Files.exists(target)); assertEquals(before, StorageDigests.hash(old));
        try (var files = Files.list(root())) { assertFalse(files.anyMatch(p -> p.getFileName().toString().startsWith(".opm-sqlite-import-"))); }
    }

    @Test void 拒绝链接和损坏数据库且不创建最终输出() throws Exception {
        Path old = legacy(), link = root().resolve("linked.db"); Files.createSymbolicLink(link, old);
        assertThrows(IllegalArgumentException.class, () -> LegacySqliteImportCli.importProject(link, root().resolve("linked-target")));
        Path bad = root().resolve("bad.db"); Files.writeString(bad, "invalid database");
        assertThrows(Exception.class, () -> LegacySqliteImportCli.importProject(bad, root().resolve("bad-target")));
        assertFalse(Files.exists(root().resolve("bad-target")));
    }

    private Path legacy() throws Exception {
        Path data = DraftWorkspaceTestDatabase.create(root().resolve("current"), true, doc -> {
            doc.withArray("layouts").forEach(layout -> ((com.fasterxml.jackson.databind.node.ObjectNode) layout).remove("route_points"));
        });
        Path old = root().resolve("old/projects").resolve(DraftWorkspaceTestDatabase.PROJECT).resolve("project.db");
        Files.createDirectories(old.getParent()); Path migrations = root().resolve("legacy-migrations"); Files.createDirectories(migrations);
        for (String file : List.of("sqlite/V1__initial_schema.sql", "sqlite/V2__exchange_import_origin.sql", "sqlite/hybrid-save/V3__hybrid_save_foundation.sql",
                "sqlite-checkpoint/V4__checkpoint_capture_overlay.sql", "sqlite-pin/V5__pin_retention_nullable_sequence.sql", "sqlite-mindmap/V8__mindmap_analysis.sql")) {
            Path source = DraftWorkspaceTestDatabase.root().resolve("docs/contracts/migrations").resolve(file);
            Files.copy(source, migrations.resolve(source.getFileName()));
        }
        org.flywaydb.core.Flyway.configure().dataSource("jdbc:sqlite:" + old, "", "").locations("filesystem:" + migrations)
                .javaMigrations(new db.digestv2.V6__save_content_digest_v2(), new org.opm.localruntime.storage.migration.V7__Model_lifecycle_delete_guards())
                .mixed(true).load().migrate();
        try (var from = SqliteSnapshots.connection(data); var to = DriverManager.getConnection("jdbc:sqlite:" + old)) {
            to.setAutoCommit(false);
            List<String> first = List.of("project_metadata", "profile_package", "rule_set_package", "grammar_package", "model_catalog", "revision_document", "model_head", "draft_content", "draft_stream", "draft_checkpoint", "model_save_mode");
            var tables = new ArrayList<>(JdbcDialect.tables(to)); tables.removeIf(t -> t.equals("schema_metadata") || t.equals("flyway_schema_history") || t.startsWith("sqlite_"));
            tables.sort(Comparator.comparingInt(t -> first.contains(t) ? first.indexOf(t) : first.size()));
            for (String table : tables) {
                List<String> columns = new ArrayList<>();
                try (var s = to.createStatement(); var rows = s.executeQuery("PRAGMA table_info(" + table + ")")) { while (rows.next()) columns.add(rows.getString("name")); }
                String names = String.join(",", columns);
                try (var query = from.createStatement(); var rows = query.executeQuery("SELECT " + names + " FROM " + table);
                     var insert = to.prepareStatement("INSERT INTO " + table + "(" + names + ") VALUES(" + String.join(",", Collections.nCopies(columns.size(), "?")) + ")")) {
                    while (rows.next()) { for (int i = 1; i <= columns.size(); i++) insert.setObject(i, rows.getObject(i)); insert.executeUpdate(); }
                }
            }
            try (var s = to.prepareStatement("INSERT INTO mindmap_document(model_id,mindmap_id,revision,document_json,digest) VALUES(?, 'mindmap.legacy',0,?,?)")) {
                s.setString(1, DraftWorkspaceTestDatabase.MODEL); s.setString(2, "{\"label\":\"独立分析\"}"); s.setString(3, "a".repeat(64)); s.executeUpdate();
            }
            to.commit();
        }
        return old;
    }
    private long count(Connection c, String table) throws SQLException { try (var s = c.createStatement(); var r = s.executeQuery("SELECT COUNT(*) FROM " + table)) { r.next(); return r.getLong(1); } }
}
