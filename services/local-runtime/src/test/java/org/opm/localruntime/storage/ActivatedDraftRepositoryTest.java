package org.opm.localruntime.storage;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class ActivatedDraftRepositoryTest {
    @TempDir Path temporary;
    @Test void rollsBackModeBeforeAndAfterInsertWithoutChangingInput() throws Exception {
        var source = HybridSavePreparationTest.source(temporary, "source", "2", ignored -> { });
        Path migrations = DraftWorkspaceTestDatabase.root().resolve("docs/contracts/migrations");
        Path prepared = temporary.resolve("prepared");
        var report = new HybridSavePreparation().prepare(source.path(), prepared, migrations.resolve("sqlite"), source.request());
        String originalHash = HybridSavePreparation.hash(source.path());
        for (String stage : List.of("BEFORE_MODE", "AFTER_MODE", "BEFORE_COMMIT")) {
            Path database = temporary.resolve(stage + ".sqlite"); Files.copy(prepared.resolve("prepared.sqlite"), database);
            var repository = new ActivatedDraftRepository(reached -> { if (stage.equals(reached)) throw new IllegalStateException(stage); });
            assertThrows(IllegalStateException.class, () -> repository.activate(database, prepared.resolve("backup.sqlite"), migrations, report));
            try (var connection = HybridSavePreparation.readOnly(database); var statement = connection.createStatement()) {
                try (var rows = statement.executeQuery("SELECT count(*) FROM model_save_mode")) { assertTrue(rows.next()); assertEquals(0, rows.getInt(1)); }
                assertEquals(report.content_digest(), PreparedDraftRepository.read(connection, source.request(), PreparedDraftRepository.source(connection, source.request())).contentDigest());
            }
            assertEquals(report, new HybridSavePreparation().verify(prepared));
            assertEquals(originalHash, HybridSavePreparation.hash(source.path()));
        }
    }
}
