package org.opm.localruntime.semantic;

import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import java.nio.file.Files;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.*;

class MethodArchitectureSchemaTest {
    @Test void frozenSchemasRejectLinksAndTraceDigestRoundTripsWithoutChangingOldVector() throws Exception {
        var old = SaveContentDigestV1.read(Files.readString(root().resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/g-opl-proc-001-consumption-object-pass.json")));
        old.put("schema_version", "0.4"); old.putArray("refinement_edges"); String before = SaveContentDigestV1.sha256(old);
        var document = old.deepCopy().put("schema_version", "0.5"); assertEquals(before, SaveContentDigestV1.sha256(document));
        addOwnedContext(document, "context.target", "MODEL_VIEW");
        ((ObjectNode) document.at("/contexts/0")).putArray("architecture_links").addObject().put("link_id", "link.1").put("target_context_id", "context.target").put("kind", "GENERATES");
        assertNotEquals(before, SaveContentDigestV1.sha256(document));
        assertEquals(document, SaveContentDigestV1.join(SaveContentDigestV1.split(document)));
        var semantic = DraftSemanticView.read(document); assertTrue(new SemanticRevisionValidator().validate(semantic).isEmpty());
        var rewritten = SaveContentDigestV1.read(new SemanticRevisionJsonWriter().write(semantic));
        assertEquals("0.5", rewritten.path("schema_version").asText()); assertEquals(document.get("contexts"), rewritten.get("contexts"));
        for (String version : java.util.List.of("0.2", "0.3", "0.4")) {
            var frozen = document.deepCopy().put("schema_version", version);
            assertThrows(SaveContentDigestV1.Invalid.class, () -> SaveContentDigestV1.sha256(frozen));
        }
        assertEquals(before, SaveContentDigestV1.sha256(old));
    }
}
