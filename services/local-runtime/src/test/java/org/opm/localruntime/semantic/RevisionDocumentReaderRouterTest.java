package org.opm.localruntime.semantic;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class RevisionDocumentReaderRouterTest {

    @Test
    void separatesHistoricalReadOnlyEnvelopeFromActiveV02Envelope() throws Exception {
        byte[] active = Files.readAllBytes(repositoryFile("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/base-golden.struct.003.json"));
        RevisionDocumentReaderRouter router = new RevisionDocumentReaderRouter();
        assertEquals("0.2", router.read(active).schemaVersion());
        assertEquals(false, router.read(active).readOnly());

        ObjectNode historical = (ObjectNode) new ObjectMapper().readTree(active);
        historical.put("schema_version", "0.1");
        historical.remove("text_traces");
        RevisionDocumentEnvelope envelope = router.read(new ObjectMapper().writeValueAsBytes(historical));
        assertEquals("0.1", envelope.schemaVersion());
        assertEquals(true, envelope.readOnly());
        assertEquals(RevisionDocumentEnvelope.TextEvidenceAvailability.STORED_TEXT_ONLY, envelope.textEvidenceAvailability());

        historical.putObject("text_artifact").putArray("traces");
        assertEquals("REVISION_SCHEMA_SHAPE_INVALID", assertThrows(SemanticReadException.class,
                () -> router.read(new ObjectMapper().writeValueAsBytes(historical))).getMessage());
    }

    @Test
    void rejectsTopLevelV02TracesInV01Document() throws Exception {
        ObjectNode historical = (ObjectNode) new ObjectMapper().readTree(Files.readAllBytes(repositoryFile(
                "packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/base-golden.struct.003.json")));
        historical.put("schema_version", "0.1");
        historical.putArray("text_traces");

        assertEquals("REVISION_SCHEMA_SHAPE_INVALID", assertThrows(SemanticReadException.class,
                () -> new RevisionDocumentReaderRouter().read(new ObjectMapper().writeValueAsBytes(historical))).getMessage());
    }

    private Path repositoryFile(String relative) {
        Path current = Path.of("").toAbsolutePath();
        while (current != null) { Path candidate = current.resolve(relative); if (Files.isRegularFile(candidate)) return candidate; current = current.getParent(); }
        throw new IllegalStateException("Missing fixture");
    }
}
