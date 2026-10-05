package org.opm.localruntime.storage;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

final class FlywayProjectSchemaMigrator {

    private final List<String> locations;

    FlywayProjectSchemaMigrator() {
        this(List.of("classpath:db/migration"));
    }

    FlywayProjectSchemaMigrator(List<String> locations) {
        this.locations = List.copyOf(Objects.requireNonNull(locations, "locations must not be null"));
    }

    ProjectDatabaseOpenResult migrate(Path databasePath) {
        return migrate(databasePath, false);
    }

    ProjectDatabaseOpenResult migrate(Path databasePath, boolean newDatabaseOnly) {
        return migrate(databasePath, newDatabaseOnly, false);
    }

    ProjectDatabaseOpenResult migrate(Path databasePath, boolean newDatabaseOnly, boolean modelLifecycle) {
        Path normalizedDatabasePath = databasePath.toAbsolutePath().normalize();
        Optional<Path> recoveryPoint = Optional.empty();
        boolean databaseExisted = Files.isRegularFile(normalizedDatabasePath);
        try {
            Files.createDirectories(normalizedDatabasePath.getParent());
            DataSource dataSource = SqliteConnectionFactory.create(normalizedDatabasePath);
            Flyway flyway = Flyway.configure()
                    .dataSource(dataSource)
                    .locations(locations.toArray(String[]::new))
                    .javaMigrations(modelLifecycle || hasModelLifecycle(dataSource)
                            ? new org.flywaydb.core.api.migration.JavaMigration[]{new org.opm.localruntime.storage.migration.V7__Model_lifecycle_delete_guards()}
                            : new org.flywaydb.core.api.migration.JavaMigration[0])
                    .ignoreMigrationPatterns("*:pending")
                    .mixed(true)
                    .load();

            flyway.validate();
            if (newDatabaseOnly && databaseExisted && hasUnsupportedPendingMigration(flyway)) {
                throw new StorageAccessException("已有开发库必须显式重置或迁移，不能在新建模式中隐式升级");
            }
            if (hasPendingMigration(flyway) && databaseExisted && Files.size(normalizedDatabasePath) > 0) {
                recoveryPoint = Optional.of(createRecoveryPoint(normalizedDatabasePath));
            }
            flyway.migrate();
            SqliteConnectionFactory.verify(dataSource);
            Files.deleteIfExists(markerPath(normalizedDatabasePath));
            return new ProjectDatabaseOpenResult.Ready(
                    new ProjectDatabase(normalizedDatabasePath, new SqliteSchemaMetadataRepository(dataSource)),
                    recoveryPoint);
        } catch (RuntimeException | IOException exception) {
            Path marker = markerPath(normalizedDatabasePath);
            writeRecoveryMarker(marker, recoveryPoint, exception);
            return new ProjectDatabaseOpenResult.RecoveryRequired(normalizedDatabasePath, recoveryPoint, marker);
        }
    }

    private boolean hasPendingMigration(Flyway flyway) {
        return flyway.info().pending().length > 0;
    }

    private boolean hasModelLifecycle(DataSource source) {
        try (var connection = source.getConnection(); var statement = connection.createStatement();
             var rows = statement.executeQuery("SELECT 1 FROM sqlite_master WHERE type='table' AND name='model_purge_authorization'")) {
            return rows.next();
        } catch (java.sql.SQLException exception) { throw new StorageAccessException("无法检查模型生命周期迁移", exception); }
    }

    private boolean hasUnsupportedPendingMigration(Flyway flyway) {
        for (var migration : flyway.info().pending()) {
            if (migration.getVersion() == null || !List.of(MigrationVersion.fromVersion("6"), MigrationVersion.fromVersion("7"), MigrationVersion.fromVersion("8")).contains(migration.getVersion())) return true;
        }
        return false;
    }

    private Path createRecoveryPoint(Path databasePath) {
        Path recoveryPoint = databasePath.resolveSibling(
                databasePath.getFileName() + ".before-migration-" + Instant.now().toEpochMilli() + "-" + java.util.UUID.randomUUID() + ".bak");
        // WAL 可能仍有已提交内容；必须生成 SQLite 一致快照，不能只复制主文件。
        try (var connection = SqliteConnectionFactory.create(databasePath).getConnection();
             var statement = connection.prepareStatement("VACUUM INTO ?")) {
            statement.setString(1, recoveryPoint.toString()); statement.execute();
        } catch (java.sql.SQLException exception) { throw new StorageAccessException("无法创建迁移前一致备份", exception); }
        return recoveryPoint;
    }

    private Path markerPath(Path databasePath) {
        return databasePath.resolveSibling(databasePath.getFileName() + ".recovery-required");
    }

    private void writeRecoveryMarker(Path marker, Optional<Path> recoveryPoint, Exception exception) {
        try {
            Files.writeString(marker,
                    "status=RECOVERY_REQUIRED\nrecovery_point=" + recoveryPoint.map(Path::toString).orElse("")
                            + "\nreason=" + exception.getClass().getSimpleName()
                            + "\nmessage=" + sanitize(exception.getMessage()) + "\n",
                    StandardCharsets.UTF_8);
        } catch (IOException markerException) {
            throw new StorageAccessException("Migration failed and recovery marker cannot be written", markerException);
        }
    }

    private String sanitize(String message) {
        return message == null ? "" : message.replace('\n', ' ').replace('\r', ' ');
    }
}
