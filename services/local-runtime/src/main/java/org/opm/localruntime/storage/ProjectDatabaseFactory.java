package org.opm.localruntime.storage;

import java.nio.file.Path;
import java.util.Objects;

public final class ProjectDatabaseFactory {

    private final Path storageRoot;
    private final FlywayProjectSchemaMigrator migrator;
    private final boolean journaledDrafts;

    /** 应用新建入口使用混合保存；历史发布工具仍显式使用旧构造器。 */
    public static ProjectDatabaseFactory journaledDrafts(Path storageRoot) {
        return new ProjectDatabaseFactory(storageRoot, new FlywayProjectSchemaMigrator(java.util.List.of(
                "classpath:db/migration", "classpath:db/hybrid-save", "classpath:db/checkpoint", "classpath:db/pin")), true);
    }

    public ProjectDatabaseFactory(Path storageRoot) {
        this(storageRoot, new FlywayProjectSchemaMigrator());
    }

    ProjectDatabaseFactory(Path storageRoot, FlywayProjectSchemaMigrator migrator) {
        this(storageRoot, migrator, false);
    }

    private ProjectDatabaseFactory(Path storageRoot, FlywayProjectSchemaMigrator migrator, boolean journaledDrafts) {
        this.storageRoot = Objects.requireNonNull(storageRoot, "storageRoot must not be null").toAbsolutePath().normalize();
        this.migrator = Objects.requireNonNull(migrator, "migrator must not be null");
        this.journaledDrafts = journaledDrafts;
    }

    public ProjectDatabaseOpenResult open(String projectId) {
        validateProjectId(projectId);
        return migrator.migrate(databasePath(projectId), journaledDrafts);
    }

    public boolean usesJournaledDrafts() { return journaledDrafts; }

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
