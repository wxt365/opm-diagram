package org.opm.localruntime.storage;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Objects;

final class SqliteSchemaMetadataRepository implements SchemaMetadataRepository {

    private final DataSource dataSource;

    SqliteSchemaMetadataRepository(DataSource dataSource) {
        this.dataSource = Objects.requireNonNull(dataSource, "dataSource must not be null");
    }

    @Override
    public StorageSchemaVersion storageSchemaVersion() {
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement();
             ResultSet resultSet = statement.executeQuery(
                     "SELECT metadata_value FROM schema_metadata WHERE metadata_key = 'storage_schema_version'")) {
            if (!resultSet.next()) {
                throw new StorageAccessException("storage_schema_version is missing");
            }
            return new StorageSchemaVersion(resultSet.getString(1));
        } catch (SQLException exception) {
            throw new StorageAccessException("Cannot read storage schema metadata", exception);
        }
    }
}
