package org.opm.localruntime.releaseauthoring.visualcommon;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.releaseauthoring.GoldenFixtureMaterializationException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class VisualCommonFixtureMaterializerTest {

    private static final long EPOCH = 1782864000L;

    @TempDir
    Path temporaryDirectory;

    @Test
    void materializesEightFixturesWithClosedIndexesAndAttestations() throws Exception {
        VisualCommonFixtureMaterializer materializer = new VisualCommonFixtureMaterializer();
        for (String subject : new String[] {"STATE_ROLES", "LONG_LABELS", "FUNDAMENTAL_FAN", "CANDIDATE_LAYER", "INSPECTOR", "TOOLCHAIN_CATALOG", "FINDING_FOCUS", "BLOCKED_FEEDBACK"}) {
            Path root = temporaryDirectory.resolve(subject.toLowerCase());
            var result = materializer.materialize(fixture(subject), root.resolve("storage"), root.resolve("attestation.json"), EPOCH);
            assertTrue(Files.isRegularFile(result.databasePath()), subject);
            assertTrue(Files.isRegularFile(root.resolve("attestation.json")), subject);
            assertEquals(1, result.indexCounts().get("revision_document"), subject);
            assertEquals(0, result.indexCounts().get("text_trace_index"), subject);
            try (var connection = DriverManager.getConnection("jdbc:sqlite:" + result.databasePath())) {
                assertCount(connection, "project_metadata", 1); assertCount(connection, "model_catalog", 1);
                assertCount(connection, "model_head", 1); assertCount(connection, "revision_parent", 0);
                assertCount(connection, "finding_index", "FINDING_FOCUS".equals(subject) ? 1 : 0);
                assertCount(connection, "operation_record", "BLOCKED_FEEDBACK".equals(subject) ? 3 : 0);
            }
            assertFalse(Files.exists(result.databasePath().resolveSibling("project.db-wal")), subject);
        }
    }

    @Test
    void rejectsExistingStorageWithoutChangingIt() throws Exception {
        Path root = temporaryDirectory.resolve("existing");
        Path storage = root.resolve("storage");
        Files.createDirectories(storage);
        Path retained = storage.resolve("retain.txt");
        Files.writeString(retained, "retain");
        GoldenFixtureMaterializationException error = assertThrows(GoldenFixtureMaterializationException.class,
                () -> new VisualCommonFixtureMaterializer().materialize(fixture("STATE_ROLES"), storage, root.resolve("attestation.json"), EPOCH));
        assertEquals("GOLDEN_COMMON_STORAGE_NOT_EMPTY", error.code());
        assertEquals("retain", Files.readString(retained));
    }

    @Test
    void createsFreshAttemptClonesWithoutMutatingTheBase() throws Exception {
        Path root = temporaryDirectory.resolve("clone");
        VisualCommonFixtureMaterializer materializer = new VisualCommonFixtureMaterializer();
        var base = materializer.materialize(fixture("BLOCKED_FEEDBACK"), root.resolve("base/storage"), root.resolve("base/attestation.json"), EPOCH);
        var first = materializer.cloneAttempt(base, root.resolve("attempts/capture-a/1/storage"));
        var second = materializer.cloneAttempt(base, root.resolve("attempts/capture-a/2/storage"));
        assertEquals(first.baseTreeSha256(), second.baseTreeSha256());
        assertTrue(Files.isRegularFile(first.databasePath()));
        assertTrue(Files.isRegularFile(second.databasePath()));
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + first.databasePath())) {
            connection.createStatement().executeUpdate("UPDATE project_metadata SET description = 'attempt mutation'");
        }
        assertFalse(sha256(first.databasePath()).equals(sha256(second.databasePath())));
        assertEquals(base.databaseSha256(), sha256(base.databasePath()));
    }

    private Path fixture(String subject) {
        return Path.of("..", "..", "packages", "profiles", "profile.iso19450.2024.draft", "0.2.0", "handoff", "releases", "clean-37c5412a9c12", "dev-canvas-06", "common-fixtures", "0.2.0", "visual", subject + ".json");
    }

    private void assertCount(java.sql.Connection connection, String table, int expected) throws Exception {
        try (var result = connection.createStatement().executeQuery("SELECT COUNT(*) FROM " + table)) { assertTrue(result.next()); assertEquals(expected, result.getInt(1), table); }
    }

    private String sha256(Path path) throws Exception { return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path))); }
}
