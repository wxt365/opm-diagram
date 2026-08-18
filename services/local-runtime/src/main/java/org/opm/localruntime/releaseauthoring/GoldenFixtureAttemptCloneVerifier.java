package org.opm.localruntime.releaseauthoring;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;

/** 复制 immutable materialization storage，并验证 attempt 不会共享基础 SQLite。 */
public final class GoldenFixtureAttemptCloneVerifier {

    public AttemptClone cloneStorage(Path baseStorage, String projectId, String expectedDatabaseSha256, Path attemptStorage) {
        try {
            Path base = baseStorage.toAbsolutePath().normalize();
            Path attempt = attemptStorage.toAbsolutePath().normalize();
            Path baseDatabase = database(base, projectId);
            if (!Files.isDirectory(base) || Files.isSymbolicLink(base) || !Files.isRegularFile(baseDatabase) || Files.isSymbolicLink(baseDatabase)) {
                throw failure("GFM_STORAGE_VERIFY_FAILED", "Materialized base storage is unsafe.");
            }
            if (attempt.startsWith(base) || base.startsWith(attempt)) {
                throw failure("GFM_TARGET_STORAGE_UNSAFE", "Attempt storage must not overlap immutable base storage.");
            }
            if (Files.exists(sidecar(baseDatabase, "-wal")) || Files.exists(sidecar(baseDatabase, "-shm")) || !expectedDatabaseSha256.equals(sha256(baseDatabase))) {
                throw failure("GFM_STORAGE_VERIFY_FAILED", "Materialized base database does not match its verified identity.");
            }
            if (Files.exists(attempt)) {
                if (Files.isSymbolicLink(attempt) || !Files.isDirectory(attempt)) throw failure("GFM_TARGET_STORAGE_UNSAFE", "Attempt storage is unsafe.");
                try (var paths = Files.list(attempt)) {
                    if (paths.findAny().isPresent()) throw failure("GFM_TARGET_STORAGE_NOT_EMPTY", "Attempt storage must be empty.");
                }
            }
            rejectSymbolicLinks(base);
            Files.createDirectories(attempt);
            copyTree(base, attempt);
            Path clonedDatabase = database(attempt, projectId);
            if (!Files.isRegularFile(clonedDatabase) || Files.isSymbolicLink(clonedDatabase)
                    || Files.exists(sidecar(clonedDatabase, "-wal")) || Files.exists(sidecar(clonedDatabase, "-shm"))
                    || !expectedDatabaseSha256.equals(sha256(clonedDatabase))) {
                throw failure("GFM_STORAGE_VERIFY_FAILED", "Attempt clone differs from its immutable base database.");
            }
            return new AttemptClone(clonedDatabase, expectedDatabaseSha256);
        } catch (GoldenFixtureMaterializationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw failure("GFM_STORAGE_WRITE_FAILED", "Cannot create isolated attempt storage.", exception);
        }
    }

    private void rejectSymbolicLinks(Path root) throws IOException {
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) {
                if (Files.isSymbolicLink(file)) throw failure("GFM_STORAGE_VERIFY_FAILED", "Materialized base storage contains a symbolic link.");
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private void copyTree(Path source, Path target) throws IOException {
        Files.walkFileTree(source, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attributes) throws IOException {
                Files.createDirectories(target.resolve(source.relativize(directory)));
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) throws IOException {
                Files.copy(file, target.resolve(source.relativize(file)));
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private Path database(Path storage, String projectId) {
        return storage.resolve("projects").resolve(projectId).resolve("project.db");
    }

    private Path sidecar(Path database, String suffix) {
        return database.resolveSibling(database.getFileName() + suffix);
    }

    private String sha256(Path file) throws Exception {
        return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(file)));
    }

    private GoldenFixtureMaterializationException failure(String code, String message) {
        return new GoldenFixtureMaterializationException(code, message);
    }

    private GoldenFixtureMaterializationException failure(String code, String message, Throwable cause) {
        return new GoldenFixtureMaterializationException(code, message, cause);
    }

    public record AttemptClone(Path databasePath, String databaseSha256) { }
}
