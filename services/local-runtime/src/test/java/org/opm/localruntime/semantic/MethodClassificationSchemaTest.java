package org.opm.localruntime.semantic;

import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import java.nio.file.Files;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.root;

class MethodClassificationSchemaTest {
    @Test void classificationAffectsDigestWithFrozenOldSchemasAndRoundTrip() throws Exception {
        var old = SaveContentDigestV1.read(Files.readString(root().resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/g-opl-proc-001-consumption-object-pass.json")));
        old.put("schema_version", "0.3"); old.putArray("refinement_edges");
        String before = SaveContentDigestV1.sha256(old);
        var upgraded = old.deepCopy().put("schema_version", "0.4");
        assertEquals(before, SaveContentDigestV1.sha256(upgraded));
        ((ObjectNode) upgraded.at("/contexts/0")).put("architecture_level", "PRODUCT");
        assertNotEquals(before, SaveContentDigestV1.sha256(upgraded));
        assertEquals(upgraded, SaveContentDigestV1.join(SaveContentDigestV1.split(upgraded)));
        var revision = DraftSemanticView.read(upgraded);
        assertEquals(SemanticRevision.ArchitectureLevel.PRODUCT, revision.contexts().getFirst().architectureLevel());
        var rewritten = SaveContentDigestV1.read(new SemanticRevisionJsonWriter().write(revision));
        assertEquals("0.4", rewritten.path("schema_version").asText()); assertEquals("PRODUCT", rewritten.at("/contexts/0/architecture_level").asText());
        var wrongVersion = upgraded.deepCopy().put("schema_version", "0.3");
        assertThrows(SaveContentDigestV1.Invalid.class, () -> SaveContentDigestV1.sha256(wrongVersion));
        ((ObjectNode) upgraded.at("/contexts/0")).put("architecture_level", "INVALID");
        assertThrows(SaveContentDigestV1.Invalid.class, () -> SaveContentDigestV1.sha256(upgraded));
        assertEquals(before, SaveContentDigestV1.sha256(old));
    }
}
