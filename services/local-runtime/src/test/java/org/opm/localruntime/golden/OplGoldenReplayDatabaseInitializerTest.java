package org.opm.localruntime.golden;

import org.junit.jupiter.api.Test;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionReader;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;

import static org.junit.jupiter.api.Assertions.assertEquals;

class OplGoldenReplayDatabaseInitializerTest {

    @Test
    void initializesMigratedDatabaseWithOnlyTheCommittedBaseRevisionAndHead() throws Exception {
        Path fixture = repositoryFile("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/base-golden.proc.001.json");
        SemanticRevision base = new SemanticRevisionReader().read(fixture);
        Path workRoot = Files.createTempDirectory("opm-golden-db-");
        OplGoldenReplayDatabaseInitializer initializer = new OplGoldenReplayDatabaseInitializer();
        Path database = initializer.initialize(workRoot, base, fixture);
        initializer.initialize(workRoot, base, fixture);

        try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + database.toAbsolutePath())) {
            assertEquals(1, integer(connection, "SELECT COUNT(*) FROM revision_document"));
            assertEquals(base.revisionId(), text(connection, "SELECT draft_head_revision_id FROM model_head"));
            assertEquals(base.revisionSequence(), integer(connection, "SELECT head_sequence FROM model_head"));
            assertEquals(0, integer(connection, "SELECT COUNT(*) FROM text_trace_index"));
            assertEquals(0, integer(connection, "SELECT COUNT(*) FROM operation_record"));
        }
    }

    private Path repositoryFile(String relativePath) {
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            Path candidate = current.resolve(relativePath);
            if (Files.isRegularFile(candidate)) return candidate;
            current = current.getParent();
        }
        throw new IllegalStateException("Repository fixture is not available: " + relativePath);
    }

    private int integer(Connection connection, String query) throws Exception {
        try (var statement = connection.createStatement(); var result = statement.executeQuery(query)) {
            result.next(); return result.getInt(1);
        }
    }

    private String text(Connection connection, String query) throws Exception {
        try (var statement = connection.createStatement(); var result = statement.executeQuery(query)) {
            result.next(); return result.getString(1);
        }
    }
}
