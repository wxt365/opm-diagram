package org.opm.localruntime.recovery;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RecoveryFactorySqliteMaterializerTest {

    @TempDir
    Path temporaryDirectory;

    @Test
    void materializesSingleRevisionSqliteV1WithFixedRowsAndNoSidecars() throws Exception {
        Path root = repositoryRoot();
        byte[] revision = Files.readAllBytes(root.resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/base-golden.struct.003.json"));
        RecoveryFactorySqliteMaterializer.ProfileAssets assets = new RecoveryFactorySqliteMaterializer.ProfileAssets(
                Files.readString(root.resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/profile.json")),
                Files.readString(root.resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/rules/representative-rule-set.json")),
                Files.readString(root.resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/grammar/representative-opl-grammar.json")));

        RecoveryFactorySqliteMaterializer.Result result = new RecoveryFactorySqliteMaterializer()
                .materialize(temporaryDirectory.resolve("fixture/storage"), "project.recovery.state.001", revision, assets, 1782864000L);

        assertTrue(Files.isRegularFile(result.databasePath()));
        assertEquals(1, result.tableCounts().get("revision_document"));
        assertEquals(0, result.tableCounts().get("revision_parent"));
        assertEquals(0, result.tableCounts().get("operation_record"));
        assertFalse(Files.exists(result.databasePath().resolveSibling("project.db-wal")));
        assertFalse(Files.exists(result.databasePath().resolveSibling("project.db-shm")));
        assertFalse(Files.exists(result.databasePath().resolveSibling("project.db-journal")));
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + result.databasePath());
             var statement = connection.prepareStatement("SELECT commit_reason, immutable, created_at FROM revision_document")) {
            try (var rows = statement.executeQuery()) {
                assertTrue(rows.next());
                assertEquals("RECOVERY_FACTORY_BASE", rows.getString(1));
                assertEquals(1, rows.getInt(2));
                assertEquals("2026-07-01T00:00:00Z", rows.getString(3));
            }
        }
    }

    private Path repositoryRoot() {
        Path current = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        while (current != null) {
            if (Files.isRegularFile(current.resolve("pom.xml"))
                    && Files.isDirectory(current.resolve("packages/profiles"))) {
                return current;
            }
            current = current.getParent();
        }
        throw new AssertionError("无法定位仓库根目录");
    }
}
