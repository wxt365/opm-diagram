package org.opm.localruntime.storage;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/** 仅封装已经使用到的方言能力，不改写任意业务 SQL。 */
public final class JdbcDialect {
    private JdbcDialect() { }
    public static boolean sqlite(Connection connection) throws SQLException {
        return connection.getMetaData().getDatabaseProductName().equals("SQLite");
    }
    public static void begin(Connection connection, boolean write) throws SQLException {
        try (var statement = connection.createStatement()) {
            if (sqlite(connection) && !write) statement.execute("PRAGMA query_only=ON");
            if (!sqlite(connection)) throw new SQLException("此版本仅支持 SQLite");
            statement.execute(write ? "BEGIN IMMEDIATE" : "BEGIN");
        }
    }
    public static List<String> tables(Connection connection) throws SQLException {
        var result = new ArrayList<String>();
        if (!sqlite(connection)) throw new SQLException("此版本仅支持 SQLite");
        String sql = "SELECT name FROM sqlite_master WHERE type='table'";
        try (var statement = connection.createStatement(); var rows = statement.executeQuery(sql)) {
            while (rows.next()) result.add(rows.getString(1));
        }
        return result;
    }
    public static String jsonText(Connection connection, String column, String path) throws SQLException {
        if (!column.matches("[a-z_.]+") || !path.matches("[a-z_]+(,[a-z_]+)*")) throw new IllegalArgumentException("无效 JSON 路径");
        if (!sqlite(connection)) throw new SQLException("此版本仅支持 SQLite");
        return "json_extract(" + column + ",'$." + path.replace(',', '.') + "')";
    }
    public static long nextOrder(Connection connection, String kind) throws SQLException {
        try (var statement = connection.prepareStatement("INSERT INTO project_order(project_id,kind,next_order) VALUES (project_scope(),?,1) ON CONFLICT(project_id,kind) DO UPDATE SET next_order=project_order.next_order+1 RETURNING next_order")) {
            statement.setString(1, kind);
            try (var rows = statement.executeQuery()) { rows.next(); return rows.getLong(1); }
        }
    }
}
