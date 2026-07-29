package org.opm.localruntime.semantic;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SemanticRevisionReaderTest {

    @Test
    void readsMinimalContractFixtureAsP0SemanticRevision() {
        SemanticRevision revision = new SemanticRevisionReader().read(findFixture());

        assertEquals("revision.demo.0001", revision.revisionId());
        assertEquals(2, revision.elements().size());
        assertEquals(SemanticRevision.CoreKind.OBJECT, revision.elements().getFirst().coreKind());
        assertEquals(1, revision.states().size());
        assertEquals(1, revision.facts().size());
        assertEquals(SemanticRevision.ContextKind.SYSTEM_DIAGRAM, revision.contexts().getFirst().kind());
        assertFalse(new SemanticRevisionValidator().validate(revision).iterator().hasNext());
    }

    @Test
    void rejectsUnsupportedContractEnum() throws IOException {
        String malformed = Files.readString(findFixture()).replaceFirst("SYSTEM_DIAGRAM", "UNKNOWN_CONTEXT");

        SemanticReadException exception = assertThrows(SemanticReadException.class,
                () -> new SemanticRevisionReader().read(new ByteArrayInputStream(malformed.getBytes(StandardCharsets.UTF_8))));

        assertTrue(exception.getMessage().contains("unsupported value"));
    }

    private Path findFixture() {
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            Path candidate = current.resolve("docs/contracts/examples/minimal-iso-revision.json");
            if (Files.isRegularFile(candidate)) {
                return candidate;
            }
            current = current.getParent();
        }
        throw new IllegalStateException("Minimal ISO revision fixture is not available for the test");
    }
}
