package org.opm.localruntime.releaseauthoring;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.DriverManager;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GoldenFixtureAttemptCloneVerifierTest {

    @TempDir
    Path temporaryDirectory;

    @Test
    void createsIndependentClonesWithoutChangingTheImmutableBaseDatabase() throws Exception {
        byte[] fixture = Files.readAllBytes(fixturePath("g-opl-proc-001-consumption-object-pass.json"));
        var materialized = new GoldenFixtureSeedRepository().materialize(temporaryDirectory.resolve("base"), fixture, sha256(fixture), 1782864000L);
        Path baseStorage = temporaryDirectory.resolve("base");
        String baseSha256 = sha256(materialized.databasePath());
        GoldenFixtureAttemptCloneVerifier verifier = new GoldenFixtureAttemptCloneVerifier();

        var cloneOne = verifier.cloneStorage(baseStorage, materialized.projectId(), baseSha256, temporaryDirectory.resolve("attempt-one"));
        var cloneTwo = verifier.cloneStorage(baseStorage, materialized.projectId(), baseSha256, temporaryDirectory.resolve("attempt-two"));
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + cloneOne.databasePath())) {
            connection.createStatement().executeUpdate("UPDATE project_metadata SET description = 'attempt one mutation'");
        }

        assertEquals(baseSha256, sha256(materialized.databasePath()));
        assertEquals(baseSha256, sha256(cloneTwo.databasePath()));
        assertFalse(baseSha256.equals(sha256(cloneOne.databasePath())));
        assertFalse(Files.exists(materialized.databasePath().resolveSibling("project.db-wal")));
        assertFalse(Files.exists(materialized.databasePath().resolveSibling("project.db-shm")));
        assertTrue(Files.isRegularFile(cloneOne.databasePath()));
        assertTrue(Files.isRegularFile(cloneTwo.databasePath()));
    }

    @Test
    void rejectsNonEmptyAttemptStorageWithoutChangingItsExistingContent() throws Exception {
        byte[] fixture = Files.readAllBytes(fixturePath("g-opl-proc-001-consumption-object-pass.json"));
        var materialized = new GoldenFixtureSeedRepository().materialize(temporaryDirectory.resolve("base"), fixture, sha256(fixture), 1782864000L);
        Path attempt = temporaryDirectory.resolve("attempt");
        Files.createDirectories(attempt);
        Path retained = attempt.resolve("retain.txt");
        Files.writeString(retained, "retain");

        GoldenFixtureMaterializationException error = assertThrows(GoldenFixtureMaterializationException.class,
                () -> new GoldenFixtureAttemptCloneVerifier().cloneStorage(temporaryDirectory.resolve("base"), materialized.projectId(), sha256(materialized.databasePath()), attempt));

        assertEquals("GFM_TARGET_STORAGE_NOT_EMPTY", error.code());
        assertEquals("retain", Files.readString(retained));
    }

    @Test
    void rejectsAttemptStorageNestedInsideTheImmutableBase() throws Exception {
        byte[] fixture = Files.readAllBytes(fixturePath("g-opl-proc-001-consumption-object-pass.json"));
        Path base = temporaryDirectory.resolve("base");
        var materialized = new GoldenFixtureSeedRepository().materialize(base, fixture, sha256(fixture), 1782864000L);

        GoldenFixtureMaterializationException error = assertThrows(GoldenFixtureMaterializationException.class,
                () -> new GoldenFixtureAttemptCloneVerifier().cloneStorage(base, materialized.projectId(), sha256(materialized.databasePath()), base.resolve("attempt")));

        assertEquals("GFM_TARGET_STORAGE_UNSAFE", error.code());
        assertFalse(Files.exists(base.resolve("attempt")));
    }

    private Path fixturePath(String file) {
        return Path.of("..", "..", "packages", "profiles", "profile.iso19450.2024.draft", "0.2.0", "golden", "fixtures", file);
    }

    private String sha256(byte[] value) throws Exception {
        return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
    }

    private String sha256(Path file) throws Exception {
        return sha256(Files.readAllBytes(file));
    }
}
