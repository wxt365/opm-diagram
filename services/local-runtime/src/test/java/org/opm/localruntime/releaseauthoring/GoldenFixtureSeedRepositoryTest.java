package org.opm.localruntime.releaseauthoring;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.DriverManager;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GoldenFixtureSeedRepositoryTest {

    @TempDir
    Path temporaryDirectory;

    @Test
    void materializesProceduralControlAndStructuralFixturesAsSingleRevisionSnapshots() throws Exception {
        for (String fixture : new String[] {
                "g-opl-proc-001-consumption-object-pass.json",
                "g-opl-ctrl-002-instrument-pass.json",
                "g-opl-struct-002-unidirectional-process-null-tag-pass.json"}) {
            byte[] bytes = Files.readAllBytes(fixturePath(fixture));
            var result = new GoldenFixtureSeedRepository().materialize(temporaryDirectory.resolve(fixture), bytes, sha256(bytes), 1782864000L);
            assertTrue(Files.isRegularFile(result.databasePath()));
            assertEquals("SINGLE_REVISION_SNAPSHOT", result.historyMode());
            assertEquals(1, result.tableCounts().get("revision_document"));
            assertEquals(0, result.tableCounts().get("revision_parent"));
            assertEquals(0, result.tableCounts().get("operation_record"));
            assertTrue(result.stageDurations().migrationMicros() > 0);
            assertTrue(result.stageDurations().seedMicros() > 0);
            assertTrue(result.stageDurations().verifyMicros() > 0);
        }
    }

    @Test
    void rejectsNonEmptyStorageWithoutDeletingExistingData() throws Exception {
        Path storage = temporaryDirectory.resolve("existing");
        Files.createDirectories(storage);
        Path existing = storage.resolve("retain.txt");
        Files.writeString(existing, "retain");
        byte[] bytes = Files.readAllBytes(fixturePath("g-opl-proc-001-consumption-object-pass.json"));

        GoldenFixtureMaterializationException error = assertThrows(GoldenFixtureMaterializationException.class,
                () -> new GoldenFixtureSeedRepository().materialize(storage, bytes, sha256(bytes), 1782864000L));

        assertEquals("GFM_TARGET_STORAGE_NOT_EMPTY", error.code());
        assertEquals("retain", Files.readString(existing));
    }

    @Test
    void materializesAnExplicitProjectIdentityWithoutUsingTheGoldenProjectDerivation() throws Exception {
        byte[] bytes = Files.readAllBytes(fixturePath("g-opl-proc-001-consumption-object-pass.json"));
        String fixtureSha256 = sha256(bytes);
        GoldenFixtureSeedRepository.SeedIdentity identity = new GoldenFixtureSeedRepository.SeedIdentity(
                "project.e2e.family.proc.001", "E2E Family Fixture", "Release E2E fixture materialization.");

        var result = new GoldenFixtureSeedRepository().materialize(
                temporaryDirectory.resolve("family"), bytes, fixtureSha256, 1782864000L, identity);

        assertEquals(identity.projectId(), result.projectId());
        assertEquals(temporaryDirectory.resolve("family").resolve("projects").resolve(identity.projectId()).resolve("project.db"), result.databasePath());
        assertFalse(Files.exists(temporaryDirectory.resolve("family").resolve("projects").resolve("project.golden.fixture." + fixtureSha256)));
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + result.databasePath())) {
            try (var row = connection.createStatement().executeQuery("SELECT project_id, name, description FROM project_metadata")) {
                assertTrue(row.next());
                assertEquals(identity.projectId(), row.getString("project_id"));
                assertEquals(identity.projectName() + " " + result.revisionId(), row.getString("name"));
                assertEquals(identity.description(), row.getString("description"));
            }
        }
    }

    @Test
    void mapsMigrationSeedCommitAndVerifyFaultsWithoutLeavingPartialSeedTransactions() throws Exception {
        byte[] bytes = Files.readAllBytes(fixturePath("g-opl-proc-001-consumption-object-pass.json"));
        String fixtureSha256 = sha256(bytes);
        List<FaultCase> faults = List.of(
                new FaultCase("migration.before-open", "GFM_STORAGE_MIGRATION_FAILED", false),
                new FaultCase("seed.project_metadata", "GFM_STORAGE_WRITE_FAILED", false),
                new FaultCase("seed.profile_package", "GFM_STORAGE_WRITE_FAILED", false),
                new FaultCase("seed.rule_set_package", "GFM_STORAGE_WRITE_FAILED", false),
                new FaultCase("seed.grammar_package", "GFM_STORAGE_WRITE_FAILED", false),
                new FaultCase("seed.model_catalog", "GFM_STORAGE_WRITE_FAILED", false),
                new FaultCase("seed.revision_document", "GFM_STORAGE_WRITE_FAILED", false),
                new FaultCase("seed.model_head", "GFM_STORAGE_WRITE_FAILED", false),
                new FaultCase("seed.before-commit", "GFM_STORAGE_WRITE_FAILED", false),
                new FaultCase("verify.before", "GFM_STORAGE_VERIFY_FAILED", true));

        for (FaultCase fault : faults) {
            Path storage = temporaryDirectory.resolve(fault.stage().replace('.', '-'));
            GoldenFixtureMaterializationException error = assertThrows(GoldenFixtureMaterializationException.class,
                    () -> new GoldenFixtureSeedRepository(stage -> {
                        if (fault.stage().equals(stage)) throw new IllegalStateException(stage);
                    }).materialize(storage, bytes, fixtureSha256, 1782864000L), fault.stage());

            assertEquals(fault.code(), error.code(), fault.stage());
            Path database = storage.resolve("projects").resolve("project.golden.fixture." + fixtureSha256).resolve("project.db");
            if ("migration.before-open".equals(fault.stage())) {
                assertFalse(Files.exists(database));
                continue;
            }
            assertTrue(Files.isRegularFile(database), fault.stage());
            assertBusinessRows(database, fault.committedRows());
        }
    }

    private void assertBusinessRows(Path database, boolean committedRows) throws Exception {
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + database)) {
            for (String table : List.of("project_metadata", "profile_package", "rule_set_package", "grammar_package", "model_catalog", "revision_document", "model_head")) {
                try (var result = connection.createStatement().executeQuery("SELECT COUNT(*) FROM " + table)) {
                    assertTrue(result.next());
                    assertEquals(committedRows ? 1 : 0, result.getInt(1), table);
                }
            }
        }
    }

    private Path fixturePath(String file) {
        return Path.of("..", "..", "packages", "profiles", "profile.iso19450.2024.draft", "0.2.0", "golden", "fixtures", file);
    }

    private String sha256(byte[] value) throws Exception {
        return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
    }

    private record FaultCase(String stage, String code, boolean committedRows) { }
}
