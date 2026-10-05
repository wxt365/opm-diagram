package org.opm.localruntime.storage;

import org.flywaydb.core.Flyway;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
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
        Path normalizedDatabasePath = databasePath.toAbsolutePath().normalize();
        Optional<Path> recoveryPoint = Optional.empty();
        boolean databaseExisted = Files.isRegularFile(normalizedDatabasePath);
        try {
            Files.createDirectories(normalizedDatabasePath.getParent());
            DataSource dataSource = SqliteConnectionFactory.create(normalizedDatabasePath);
            Flyway flyway = Flyway.configure()
                    .dataSource(dataSource)
                    .locations(locations.toArray(String[]::new))
                    .ignoreMigrationPatterns("*:pending")
                    .mixed(true)
                    .load();

            flyway.validate();
            if (newDatabaseOnly && databaseExisted && hasPendingMigration(flyway)) {
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

    private Path createRecoveryPoint(Path databasePath) throws IOException {
        Path recoveryPoint = databasePath.resolveSibling(
                databasePath.getFileName() + ".before-migration-" + Instant.now().toEpochMilli() + ".bak");
        Files.copy(databasePath, recoveryPoint, StandardCopyOption.COPY_ATTRIBUTES);
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
