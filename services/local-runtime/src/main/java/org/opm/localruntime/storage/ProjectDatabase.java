package org.opm.localruntime.storage;

import java.nio.file.Path;
import java.util.Objects;

public final class ProjectDatabase {

    private final Path databasePath;
    private final SchemaMetadataRepository schemaMetadataRepository;

    ProjectDatabase(Path databasePath, SchemaMetadataRepository schemaMetadataRepository) {
        this.databasePath = Objects.requireNonNull(databasePath, "databasePath must not be null");
        this.schemaMetadataRepository = Objects.requireNonNull(schemaMetadataRepository, "schemaMetadataRepository must not be null");
    }

    public Path databasePath() {
        return databasePath;
    }

    public StorageSchemaVersion storageSchemaVersion() {
        return schemaMetadataRepository.storageSchemaVersion();
    }
}
