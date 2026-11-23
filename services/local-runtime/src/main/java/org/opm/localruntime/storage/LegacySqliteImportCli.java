package org.opm.localruntime.storage;

import org.sqlite.SQLiteConfig;
import java.nio.file.*;
import java.sql.*;
import java.util.*;

/** 显式离线转换旧 SQLite；只读原库，验证后原子发布到全新目录。 */
public final class LegacySqliteImportCli {
    private static final Set<String> SKIP = Set.of("flyway_schema_history", "schema_metadata", "sqlite_sequence");
    private static final List<String> FIRST = List.of("project_metadata", "profile_package", "rule_set_package", "grammar_package",
            "model_catalog", "revision_document", "revision_parent", "model_head", "draft_content", "draft_stream",
            "draft_checkpoint", "draft_checkpoint_overlay", "model_save_mode");
    private LegacySqliteImportCli() { }
    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("用法：LegacySqliteImportCli 原project.db 全新存储目录");
        System.out.println("SQLite 转换完成，原库未修改：" + importProject(Path.of(args[0]), Path.of(args[1])));
    }
    public static Path importProject(Path original, Path destination) throws Exception {
        Path source = original.toAbsolutePath().normalize(), target = destination.toAbsolutePath().normalize();
        rejectLinks(source); rejectLinks(target);
        if (!Files.isRegularFile(source, LinkOption.NOFOLLOW_LINKS) || Files.exists(target))
            throw new IllegalArgumentException("原库必须存在，目标目录必须全新且不存在");
        Path parent = target.getParent(); Files.createDirectories(parent); rejectLinks(parent);
        Path stage = Files.createTempDirectory(parent, ".opm-sqlite-import-");
        try {
            String project;
            SQLiteConfig config = new SQLiteConfig(); config.setReadOnly(true);
            try (Connection input = DriverManager.getConnection("jdbc:sqlite:" + source, config.toProperties())) {
                input.setAutoCommit(false);
                if (!JdbcDialect.tables(input).contains("project_metadata")) throw new IllegalArgumentException("不是 OPM 项目数据库");
                try (var query = input.createStatement(); var rows = query.executeQuery("SELECT project_id FROM project_metadata")) {
                    if (!rows.next()) throw new IllegalArgumentException("原库缺少项目身份");
                    project = rows.getString(1);
                    if (rows.next()) throw new IllegalArgumentException("一个文件只能包含一个项目");
                }
                String projectId = project;
                org.sqlite.Function.create(input, "project_scope", new org.sqlite.Function() {
                    @Override protected void xFunc() throws SQLException { result(projectId); }
                });
                integrity(input);
                try (var store = new SqliteStore(stage); var output = store.projectConnection(project)) {
                    output.setAutoCommit(false);
                    try {
                        List<String> tables = new ArrayList<>(JdbcDialect.tables(input));
                        tables.removeAll(SKIP); tables.removeIf(name -> name.startsWith("sqlite_"));
                        tables.sort(Comparator.comparingInt(name -> FIRST.contains(name) ? FIRST.indexOf(name) : FIRST.size()));
                        Set<String> available = Set.copyOf(JdbcDialect.tables(output));
                        for (String table : tables) {
                            if (!table.matches("[a-z_]+") || table.startsWith("bm_") || !available.contains(table))
                                throw new IllegalArgumentException("原库包含未支持的表，禁止静默丢弃：" + table);
                            copyTable(input, output, table, project);
                        }
                        for (String table : List.of("draft_receipt", "mindmap_conversion")) {
                            String order = table.equals("draft_receipt") ? "receipt_order" : "conversion_order";
                            try (var statement = output.prepareStatement("INSERT INTO project_order(project_id,kind,next_order) SELECT ?,?,COALESCE(MAX(" + order + "),0) FROM " + table + " WHERE 1 ON CONFLICT(project_id,kind) DO UPDATE SET next_order=excluded.next_order")) {
                                statement.setString(1, project); statement.setString(2, table); statement.executeUpdate();
                            }
                        }
                        integrity(output);
                        try (var query = output.createStatement(); var models = query.executeQuery("SELECT model_id FROM model_save_mode WHERE mode='JOURNALED_DRAFT_V2'")) {
                            while (models.next()) DraftJournalRepository.load(output, models.getString(1));
                        }
                        output.commit();
                    } catch (Exception error) { output.rollback(); throw error; }
                    output.setAutoCommit(true);
                    try (var checkpoint = output.createStatement(); var rows = checkpoint.executeQuery("PRAGMA wal_checkpoint(TRUNCATE)")) {
                        if (!rows.next() || rows.getInt(1) != 0) throw new SQLException("转换文件检查点失败");
                    }
                }
                input.rollback();
            }
            Files.move(stage, target, StandardCopyOption.ATOMIC_MOVE);
            return target.resolve("projects").resolve(project).resolve("project.db");
        } finally {
            if (Files.exists(stage)) try (var paths = Files.walk(stage)) {
                for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.delete(path);
            }
        }
    }
    private static void copyTable(Connection input, Connection output, String table, String project) throws Exception {
        List<String> sourceColumns = columns(input, table), targetColumns = columns(output, table);
        if (!targetColumns.containsAll(sourceColumns)) throw new IllegalArgumentException("原表存在未支持字段：" + table);
        String order = table.equals("draft_receipt") ? "receipt_order" : table.equals("mindmap_conversion") ? "conversion_order" : null;
        boolean oldOrder = order != null && !sourceColumns.contains(order);
        List<String> inserted = new ArrayList<>(sourceColumns);
        if (!inserted.contains("project_id")) inserted.add("project_id");
        if (oldOrder) inserted.add(order);
        String select = "SELECT " + String.join(",", sourceColumns) + (oldOrder ? ",rowid" : "") + " FROM " + table + (oldOrder ? " ORDER BY rowid" : "");
        String insert = "INSERT INTO " + table + "(" + String.join(",", inserted) + ") VALUES(" + String.join(",", Collections.nCopies(inserted.size(), "?")) + ")";
        long count = 0;
        try (var query = input.createStatement(); var rows = query.executeQuery(select); var write = output.prepareStatement(insert)) {
            while (rows.next()) {
                int index = 1;
                for (String column : sourceColumns) {
                    Object value = rows.getObject(index);
                    if (column.equals("project_id") && !project.equals(value)) throw new IllegalArgumentException("原库项目身份冲突");
                    write.setObject(index++, value);
                }
                if (!sourceColumns.contains("project_id")) write.setString(index++, project);
                if (oldOrder) write.setLong(index, rows.getLong(sourceColumns.size() + 1));
                write.executeUpdate(); count++;
            }
        }
        try (var query = output.createStatement(); var rows = query.executeQuery("SELECT COUNT(*) FROM " + table)) {
            if (!rows.next() || rows.getLong(1) != count) throw new SQLException("转换后行数不一致：" + table);
        }
        if (!values(input, table, sourceColumns).equals(values(output, table, sourceColumns))) throw new SQLException("转换后字段内容不一致：" + table);
    }
    private static List<String> columns(Connection connection, String table) throws SQLException {
        List<String> result = new ArrayList<>();
        try (var query = connection.createStatement(); var rows = query.executeQuery("PRAGMA table_info(" + table + ")")) {
            while (rows.next()) {
                String name = rows.getString("name");
                if (!name.matches("[a-z_]+")) throw new SQLException("不支持的字段名");
                result.add(name);
            }
        }
        return result;
    }
    private static List<String> values(Connection connection, String table, List<String> columns) throws Exception {
        List<String> result = new ArrayList<>(); var json = new com.fasterxml.jackson.databind.ObjectMapper();
        try (var query = connection.createStatement(); var rows = query.executeQuery("SELECT " + String.join(",", columns) + " FROM " + table)) {
            while (rows.next()) {
                List<Object> row = new ArrayList<>();
                for (int i = 1; i <= columns.size(); i++) row.add(rows.getObject(i));
                result.add(json.writeValueAsString(row));
            }
        }
        Collections.sort(result); return result;
    }
    private static void integrity(Connection connection) throws SQLException {
        try (var query = connection.createStatement(); var rows = query.executeQuery("PRAGMA integrity_check")) {
            if (!rows.next() || !"ok".equals(rows.getString(1)) || rows.next()) throw new SQLException("SQLite 完整性检查失败");
        }
        SqliteSnapshots.verifyForeignKeys(connection);
    }
    private static void rejectLinks(Path path) {
        for (Path part = path; part != null; part = part.getParent())
            if (Files.isSymbolicLink(part)) throw new IllegalArgumentException("不允许符号链接：" + part);
    }
}
