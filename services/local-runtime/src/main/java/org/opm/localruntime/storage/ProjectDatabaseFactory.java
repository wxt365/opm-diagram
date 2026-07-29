package org.opm.localruntime.storage;

import java.nio.file.Path;
import java.util.Objects;

public final class ProjectDatabaseFactory {

    private final Path storageRoot;
    private final FlywayProjectSchemaMigrator migrator;

    public ProjectDatabaseFactory(Path storageRoot) {
        this(storageRoot, new FlywayProjectSchemaMigrator());
    }

    ProjectDatabaseFactory(Path storageRoot, FlywayProjectSchemaMigrator migrator) {
        this.storageRoot = Objects.requireNonNull(storageRoot, "storageRoot must not be null").toAbsolutePath().normalize();
        this.migrator = Objects.requireNonNull(migrator, "migrator must not be null");
    }

    public ProjectDatabaseOpenResult open(String projectId) {
        validateProjectId(projectId);
        return migrator.migrate(databasePath(projectId));
    }

    public Path databasePath(String projectId) {
        validateProjectId(projectId);
        Path databasePath = storageRoot.resolve("projects").resolve(projectId).resolve("project.db").normalize();
        if (!databasePath.startsWith(storageRoot)) {
            throw new IllegalArgumentException("project database path escapes the configured storage root");
        }
        return databasePath;
    }

    public Path storageRoot() {
        return storageRoot;
    }

    private void validateProjectId(String projectId) {
        if (projectId == null || !projectId.matches("[A-Za-z][A-Za-z0-9._:-]{2,127}")) {
            throw new IllegalArgumentException("projectId must be a stable identifier without path separators");
        }
    }
}
