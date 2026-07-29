package org.opm.localruntime.storage;

import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;

import javax.sql.DataSource;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

final class SqliteConnectionFactory {

    private SqliteConnectionFactory() {
    }

    static DataSource create(Path databasePath) {
        SQLiteConfig configuration = new SQLiteConfig();
        configuration.enforceForeignKeys(true);
        configuration.setJournalMode(SQLiteConfig.JournalMode.WAL);
        configuration.setSynchronous(SQLiteConfig.SynchronousMode.FULL);
        configuration.setBusyTimeout(5000);
        configuration.setTempStore(SQLiteConfig.TempStore.MEMORY);

        SQLiteDataSource dataSource = new SQLiteDataSource(configuration);
        dataSource.setUrl("jdbc:sqlite:" + databasePath.toAbsolutePath().normalize());
        return dataSource;
    }

    static void verify(DataSource dataSource) {
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {
            assertInteger(statement, "PRAGMA foreign_keys", 1);
            assertText(statement, "PRAGMA journal_mode", "wal");
            assertInteger(statement, "PRAGMA synchronous", 2);
            assertInteger(statement, "PRAGMA busy_timeout", 5000);
            assertInteger(statement, "PRAGMA temp_store", 2);
        } catch (SQLException exception) {
            throw new StorageAccessException("SQLite connection settings do not satisfy the storage baseline", exception);
        }
    }

    private static void assertInteger(Statement statement, String pragma, int expected) throws SQLException {
        try (ResultSet resultSet = statement.executeQuery(pragma)) {
            if (!resultSet.next() || resultSet.getInt(1) != expected) {
                throw new SQLException(pragma + " does not equal " + expected);
            }
        }
    }

    private static void assertText(Statement statement, String pragma, String expected) throws SQLException {
        try (ResultSet resultSet = statement.executeQuery(pragma)) {
            if (!resultSet.next() || !expected.equalsIgnoreCase(resultSet.getString(1))) {
                throw new SQLException(pragma + " does not equal " + expected);
            }
        }
    }
}
