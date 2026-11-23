package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.opm.localruntime.semantic.DraftSemanticView;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import java.nio.file.Files;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.*;

class GraphAnalysisProjectorTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private ObjectNode fixture(String name) throws Exception { return SaveContentDigestV1.read(Files.readString(root().resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/" + name))); }
    private ObjectNode options(ObjectNode document) {
        return JSON.createObjectNode().put("context_id", document.at("/model_header/root_context_id").asText()).put("scope", "MODEL")
            .put("include_hidden_states", false).put("include_boundary_nodes", false).put("include_state_ownership", true);
    }
    private ObjectNode project(ObjectNode document, ObjectNode options) { return GraphAnalysisProjector.project(DraftSemanticView.read(document), options); }

    @Test void allProceduralGoldenRelationsKeepRolesAndDoNotMutateInput() throws Exception {
        int checked = 0;
        try (var files = Files.list(root().resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures"))) {
            for (var file : files.filter(p -> p.getFileName().toString().matches("g-opl-proc-\\d{3}.*-pass.json")).toList()) {
                var document = SaveContentDigestV1.read(Files.readString(file)); var before = document.deepCopy();
                var result = project(document, options(document));
                assertEquals(document.path("facts").size(), result.at("/statistics/fact_count").asInt(), file.toString());
                assertTrue(result.path("warnings").isEmpty(), result.path("warnings").toString());
                Set<String> ids = new HashSet<>(); result.path("nodes").forEach(n -> ids.add(n.path("id").asText()));
                for (var edge : result.path("edges")) { assertTrue(ids.contains(edge.path("source").asText())); assertTrue(ids.contains(edge.path("target").asText())); }
                assertEquals(before, document); checked++;
            }
        }
        assertEquals(16, checked);
    }

    @Test void stateEffectKeepsInputProcessOutputAndDerivedOwnershipDistinct() throws Exception {
        var document = fixture("g-opl-proc-008-effect-input-output-state-pass.json");
        var result = project(document, options(document));
        assertEquals(1, result.at("/statistics/fact_count").asInt()); assertEquals(2, result.at("/statistics/derived_count").asInt());
        var original = new ArrayList<JsonNode>(); result.path("edges").forEach(e -> { if (!e.path("derived").asBoolean()) original.add(e); });
        assertEquals(2, original.size()); assertEquals(original.get(0).path("target"), original.get(1).path("source"));
        assertEquals(original.get(0).path("group_id"), original.get(1).path("group_id"));
        assertEquals(3, original.get(0).path("endpoints").size());
    }

    @Test void structuralFanUsesThreeSpokesNotCliqueAndStableOrdering() throws Exception {
        for (String filename : List.of("g-opl-struct-005-aggregation-object-fan-3-complete-pass.json", "g-opl-struct-007-generalization-object-fan-3-complete-pass.json", "g-opl-struct-008-classification-object-fan-3-pass.json")) {
            var document = fixture(filename); var result = project(document, options(document));
            assertEquals(3, result.path("edges").size(), filename); assertEquals(1, result.at("/statistics/fact_count").asInt());
            assertEquals(result, project(document, options(document)));
            assertEquals(result.at("/edges/0/source"), result.at("/edges/2/source"));
        }
    }

    @Test void repeatedOccurrencesAndNamesDoNotMergeEntitiesOrDuplicateFacts() throws Exception {
        var document = fixture("g-opl-proc-001-consumption-object-pass.json");
        addOwnedContext(document, "context.child", "MODEL_VIEW");
        var duplicate = ((ObjectNode) document.at("/elements/0")).deepCopy().put("element_id", "element.duplicate");
        document.withArray("elements").add(duplicate);
        var result = project(document, options(document));
        assertEquals(4, result.path("nodes").size()); assertEquals(1, result.at("/statistics/fact_count").asInt());
        for (var node : result.path("nodes")) if (node.path("id").asText().equals("element.raw.material")) assertEquals(2, node.path("source_refs").size());
    }

    @Test void unknownCapabilityIsWarningAndLimitIsExplicit() throws Exception {
        var document = fixture("g-opl-proc-001-consumption-object-pass.json");
        ((ObjectNode) document.at("/facts/0/capability_ref")).put("capability_id", "CAP-UNKNOWN");
        var result = project(document, options(document).put("include_state_ownership", false));
        assertEquals("UNSUPPORTED_RELATION", result.at("/warnings/0/code").asText()); assertTrue(result.path("edges").isEmpty());
        for (int i = 0; i < 2001; i++) document.withArray("elements").add(((ObjectNode) document.at("/elements/0")).deepCopy().put("element_id", "element.large." + i));
        assertThrows(GraphAnalysisService.LimitExceeded.class, () -> project(document, options(document)));
    }

    @Test void projectionMainSamplePerformance() throws Exception {
        var document = fixture("g-opl-proc-001-consumption-object-pass.json");
        for (int i = 0; i < 298; i++) document.withArray("elements").add(((ObjectNode) document.at("/elements/0")).deepCopy().put("element_id", "element.perf." + i));
        var template = ((ObjectNode) document.at("/facts/0")).deepCopy();
        for (int i = 0; i < 999; i++) document.withArray("facts").add(template.deepCopy().put("fact_id", "fact.perf." + i));
        var revision = DraftSemanticView.read(document); var options = options(document).put("include_state_ownership", false);
        for (int i = 0; i < 5; i++) GraphAnalysisProjector.project(revision, options);
        long[] samples = new long[20];
        for (int i = 0; i < samples.length; i++) { long start = System.nanoTime(); var result = GraphAnalysisProjector.project(revision, options); samples[i] = (System.nanoTime() - start) / 1_000_000; assertEquals(1000, result.path("edges").size()); }
        Arrays.sort(samples); System.out.println("Graph projector 300 nodes/1000 edges p95=" + samples[18] + "ms"); assertTrue(samples[18] < 1000);
    }

    @Test void contextHiddenStateAndBoundaryOptionsAreExplicit() throws Exception {
        var document = fixture("g-opl-proc-006-consumption-state-pass.json");
        String state = document.at("/states/0/state_id").asText(), context = document.at("/model_header/root_context_id").asText();
        document.withArray("state_presentations").addObject().put("context_id", context).put("state_id", state).put("explicitness", "SUPPRESSED").put("fold_state", "UNFOLDED");
        var options = options(document).put("scope", "CONTEXT"); var hidden = project(document, options);
        assertFalse(hidden.path("nodes").toString().contains("\"id\":\"" + state + "\""));
        assertEquals(0, hidden.at("/statistics/fact_count").asInt());
        options.put("include_hidden_states", true); assertEquals(1, project(document, options).at("/statistics/fact_count").asInt());
        var occurrences = document.withArray("occurrences");
        for (int i = occurrences.size() - 1; i >= 0; i--) if (occurrences.get(i).path("target_id").asText().equals(state)) occurrences.remove(i);
        assertEquals(0, project(document, options).at("/statistics/fact_count").asInt());
        options.put("include_boundary_nodes", true); var boundary = project(document, options);
        assertEquals(1, boundary.at("/statistics/fact_count").asInt());
        assertTrue(java.util.stream.StreamSupport.stream(boundary.path("nodes").spliterator(), false).anyMatch(n -> n.path("id").asText().equals(state) && n.path("boundary").asBoolean()));
    }

    @Test void subtreeFollowsRefinementEdgesAndDoesNotIncludeUnrelatedContext() throws Exception {
        var document = fixture("g-opl-proc-001-consumption-object-pass.json");
        addOwnedContext(document, "context.child", "MODEL_VIEW"); addOwnedContext(document, "context.unrelated", "MODEL_VIEW");
        var original = DraftSemanticView.read(document);
        var revision = new org.opm.localruntime.semantic.SemanticRevision(original.revisionId(), original.modelId(), original.revisionSequence(),
            original.profileBinding(), original.rootContextId(), original.elements(), original.features(), original.states(), original.facts(),
            original.contexts(), original.occurrences(), original.layouts(), original.statePresentations(),
            List.of(new org.opm.localruntime.semantic.SemanticRevision.RefinementEdge("refinement.test", original.rootContextId(), "context.child", "element.process", org.opm.localruntime.semantic.SemanticRevision.CoreKind.PROCESS)));
        var options = options(document).put("scope", "CONTEXT_SUBTREE");
        var result = GraphAnalysisProjector.project(revision, options);
        for (var node : result.path("nodes")) {
            assertEquals(2, node.path("source_refs").size());
            assertFalse(node.path("source_refs").toString().contains("context.unrelated"));
        }
        assertEquals(1, result.at("/statistics/fact_count").asInt());
    }
}
