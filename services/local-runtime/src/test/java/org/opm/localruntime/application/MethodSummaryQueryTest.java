package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.opm.localruntime.semantic.DraftSemanticView;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import java.nio.file.Files;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.*;

class MethodSummaryQueryTest {
    private static final Map<String, String> ROLES = Map.of("001", "RESOURCE", "003", "OBJECT", "004", "SUBJECT", "005", "INSTRUMENT",
            "006", "RESOURCE", "008", "OBJECT", "009", "OBJECT", "010", "OBJECT", "011", "SUBJECT", "012", "INSTRUMENT");

    @Test void tenSupportedObjectAndStateRelationsHaveEvidenceAndUnmappedRelationsDoNot() throws Exception {
        int supported = 0;
        try (var files = Files.list(root().resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures"))) {
            for (var file : files.filter(item -> item.getFileName().toString().matches("g-opl-proc-\\d{3}.*-pass.json")).toList()) {
                var document = SaveContentDigestV1.read(Files.readString(file)); var before = document.deepCopy();
                var result = MethodSummaryQuery.summarize(DraftSemanticView.read(document));
                String code = file.getFileName().toString().substring(11, 14); String expected = ROLES.get(code);
                for (var process : result.get("processes")) {
                    assertEquals(6, process.get("roles").size());
                    for (var role : process.get("roles")) {
                        String name = role.get("role").asText();
                        if (name.equals(expected)) {
                            assertEquals("EVIDENCE", role.get("status").asText(), file.toString());
                            assertEquals(document.at("/facts/0/fact_id"), role.at("/evidence/0/fact_id")); supported++;
                        } else assertTrue(role.get("evidence").isEmpty(), file + ": " + name);
                        if (name.equals("ENVIRONMENT") || name.equals("INFORMATION")) assertEquals("MANUAL", role.get("status").asText());
                    }
                }
                assertEquals(before, document);
            }
        }
        assertEquals(10, supported);
    }

    @Test void statesResolveOwnerAndShowBothBoundaryStatesAndCrossOpdEvidence() throws Exception {
        var document = fixture("g-opl-proc-008-effect-input-output-state-pass.json");
        addOwnedContext(document, "context.child", "MODEL_VIEW");
        var evidence = role(MethodSummaryQuery.summarize(DraftSemanticView.read(document)), "OBJECT").at("/evidence/0");
        assertTrue(evidence.get("description").asText().contains("available"));
        assertTrue(evidence.get("description").asText().contains("processed"));
        assertEquals(2, evidence.get("context_ids").size());
        assertTrue(evidence.get("target_ids").toString().contains("element.raw.material"));
        assertTrue(evidence.get("target_ids").toString().contains("state.raw.processed"));
    }

    @Test void namesAndEnvironmentalAffiliationDoNotAssignRolesOrMergeDifferentProcesses() throws Exception {
        var document = fixture("g-opl-proc-001-consumption-object-pass.json");
        var object = (ObjectNode) document.at("/elements/0"); object.put("affiliation", "ENVIRONMENTAL").put("essence", "INFORMATIONAL");
        ((ObjectNode) object.get("name")).put("local_name", "主体环境信息");
        var duplicate = ((ObjectNode) document.at("/elements/1")).deepCopy().put("element_id", "element.same.name");
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("elements")).add(duplicate);
        var result = MethodSummaryQuery.summarize(DraftSemanticView.read(document));
        assertEquals(2, result.get("processes").size());
        assertEquals("EVIDENCE", role(result, "RESOURCE").get("status").asText());
        assertTrue(result.at("/processes/1/roles/3/evidence").isEmpty());
        assertEquals("MANUAL", role(result, "ENVIRONMENT").get("status").asText());
        assertTrue(role(result, "INFORMATION").get("evidence").isEmpty());
    }

    @Test void featureStateEvidenceResolvesFeatureAndObjectAndKeepsItsName() throws Exception {
        var document = fixture("g-opl-proc-006-consumption-state-pass.json");
        var feature = ((ObjectNode) fixture("g-opl-struct-009-source-feature-state-invalid-blocked.json").at("/features/0")).deepCopy();
        feature.put("owner_element_id", document.at("/elements/0/element_id").asText());
        document.withArray("features").add(feature);
        var state = (ObjectNode) document.at("/states/0"); state.put("owner_target_kind", "FEATURE").set("owner_element_id", feature.get("feature_id"));
        var result = MethodSummaryQuery.summarize(DraftSemanticView.read(document));
        var evidence = role(result, "RESOURCE").at("/evidence/0");
        assertTrue(evidence.get("description").asText().contains("Quality［available］"));
        assertTrue(evidence.get("target_ids").toString().contains(feature.get("feature_id").asText()));
        assertTrue(evidence.get("target_ids").toString().contains("element.raw.material"));
    }

    private JsonNode role(JsonNode result, String role) {
        for (var item : result.at("/processes/0/roles")) if (item.get("role").asText().equals(role)) return item;
        throw new AssertionError(role);
    }
    private ObjectNode fixture(String filename) throws Exception {
        return SaveContentDigestV1.read(Files.readString(root().resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/" + filename)));
    }
}
