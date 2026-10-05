package org.opm.localruntime.text;

import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.semantic.*;
import java.nio.file.Files;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.*;

class OplMultiContextTest {
    private final OplTextGenerationService service = new OplTextGenerationService();

    @ParameterizedTest
    @ValueSource(strings = {"SYSTEM_DIAGRAM", "PROCESS_REFINEMENT", "OBJECT_REFINEMENT", "MODEL_VIEW"})
    void generatesSharedFactInEachSupportedContextWithIsolatedIdentities(String kind) throws Exception {
        var document = fixture("g-opl-proc-001-consumption-object-pass.json"); var root = generate(document, CONTEXT);
        addOwnedContext(document, "context.child", kind); addOwnedContext(document, "context.other", kind);
        assertTrue(new SemanticRevisionValidator().validate(DraftSemanticView.read(document)).isEmpty());
        assertEquals(root, generate(document, CONTEXT));
        var child = generate(document, "context.child"); var other = generate(document, "context.other");
        assertEquals(sentences(root).getFirst().text(), sentences(child).getFirst().text());
        assertNotEquals(sentences(root).getFirst().sentenceId(), sentences(child).getFirst().sentenceId());
        assertNotEquals(sentences(child).getFirst().sentenceId(), sentences(other).getFirst().sentenceId());
        assertNotEquals(child.artifact().artifactId(), other.artifact().artifactId());
        assertNotEquals(child.traces().getFirst().traceId(), other.traces().getFirst().traceId());
        assertNotEquals(sentences(child).getFirst().tokens().getFirst().tokenId(), sentences(other).getFirst().tokens().getFirst().tokenId());
        scoped(child, "context.child"); scoped(other, "context.other");
    }

    @ParameterizedTest
    @ValueSource(strings = {"g-opl-proc-006-consumption-state-pass.json", "g-opl-ctrl-002-instrument-pass.json", "g-opl-struct-003-bidirectional-object-tagged-pass.json"})
    void preservesStateControlAndStructuralCompositionAndTraceInSubgraph(String file) throws Exception {
        var document = fixture(file); var root = generate(document, CONTEXT);
        addOwnedContext(document, "context.child", "PROCESS_REFINEMENT");
        var child = generate(document, "context.child");
        assertEquals(sentences(root).stream().map(OplSentence::text).toList(), sentences(child).stream().map(OplSentence::text).toList());
        assertEquals(root, generate(document, CONTEXT)); scoped(child, "context.child");
    }

    @Test void skipsOtherContextsFactsAndReturnsEmptyArtifactForEmptyDiagram() throws Exception {
        var document = fixture("g-opl-proc-001-consumption-object-pass.json"); var root = generate(document, CONTEXT);
        addOwnedContext(document, "context.child", "MODEL_VIEW");
        var fact = ((ObjectNode) document.at("/facts/0")).deepCopy().put("fact_id", "fact.child");
        for (var endpoint : fact.get("endpoints")) ((ObjectNode) endpoint).put("endpoint_id", "child." + endpoint.get("endpoint_id").asText());
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("facts")).add(fact);
        for (var occurrence : document.get("occurrences")) if (occurrence.get("context_id").asText().equals("context.child") && occurrence.get("target_kind").asText().equals("FACT"))
            ((ObjectNode) occurrence).put("target_id", "fact.child");
        assertEquals(root, generate(document, CONTEXT)); assertEquals(List.of("fact.child"), generate(document, "context.child").traces().getFirst().factIds());
        var empty = ((ObjectNode) document.at("/contexts/0")).deepCopy().put("context_id", "context.empty").put("context_kind", "OBJECT_REFINEMENT");
        empty.putArray("occurrence_ids"); ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("contexts")).add(empty);
        var result = generate(document, "context.empty"); assertEquals(1, result.artifact().paragraphs().size()); assertTrue(sentences(result).isEmpty()); assertTrue(result.traces().isEmpty());
    }

    @Test void rejectsDanglingCrossContextMissingAndNonOwnedMembers() throws Exception {
        for (String fault : List.of("dangling", "cross", "duplicate", "omitted", "owner")) {
            var document = fixture("g-opl-proc-001-consumption-object-pass.json"); addOwnedContext(document, "context.child", "PROCESS_REFINEMENT");
            var ids = (com.fasterxml.jackson.databind.node.ArrayNode) document.at("/contexts/1/occurrence_ids");
            if (fault.equals("dangling")) ids.add("occurrence.absent");
            if (fault.equals("cross")) ids.add("occurrence.raw");
            if (fault.equals("duplicate")) ids.add(ids.get(0));
            if (fault.equals("omitted")) ids.remove(0);
            if (fault.equals("owner")) for (var occurrence : document.get("occurrences"))
                if (occurrence.get("occurrence_id").asText().equals("context.child.occurrence.raw")) ((ObjectNode) occurrence).put("ownership", "REFERENCED");
            if (fault.equals("duplicate")) assertThrows(SemanticReadException.class, () -> generate(document, "context.child"));
            else assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, assertThrows(OplGenerationException.class, () -> generate(document, "context.child"), fault).code());
        }
        var document = fixture("g-opl-proc-001-consumption-object-pass.json"); addOwnedContext(document, "context.profile", "PROFILE_CONTEXT");
        for (String id : List.of("context.profile", "context.missing")) assertEquals(OplGenerationCode.TEXT_PLAN_UNSUPPORTED,
                assertThrows(OplGenerationException.class, () -> generate(document, id)).code());
    }

    @Test void legacyConsumptionUsesTheSameSubgraphScopeAndDistinctSentenceIdentity() throws Exception {
        var document = fixture("g-opl-proc-001-consumption-object-pass.json");
        ((ObjectNode) document.at("/facts/0/capability_ref")).put("capability_id", "CAP-CONSUMPTION-001");
        var original = DraftSemanticView.read(document); var binding = original.profileBinding().textGrammar();
        var grammar = new OplGrammar(new OplGrammar.Binding(binding.id(), binding.version(), binding.sha256()),
                List.of(new OplGrammar.Template("opl.consumption.v1", 10), new OplGrammar.Template("opl.consumption.state.v1", 10)));
        var root = service.generate(original, CONTEXT, grammar);
        addOwnedContext(document, "context.child", "PROCESS_REFINEMENT");
        var revision = DraftSemanticView.read(document); var child = service.generate(revision, "context.child", grammar);
        assertEquals(root, service.generate(revision, CONTEXT, grammar));
        assertEquals(sentences(root).getFirst().text(), sentences(child).getFirst().text());
        assertNotEquals(sentences(root).getFirst().sentenceId(), sentences(child).getFirst().sentenceId()); scoped(child, "context.child");
    }

    private ObjectNode fixture(String file) throws Exception { return SaveContentDigestV1.read(Files.readString(root().resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/" + file))); }
    private OplGenerationResult generate(ObjectNode document, String context) {
        var revision = DraftSemanticView.read(document);
        var assets = new ProfilePackageAssembler(new FileProfilePackageLoader(root().resolve("packages/profiles"))).assemble(revision.profileBinding());
        var result = service.generate(revision, context, assets); service.validateActiveWriteEvidence(revision, assets, result); return result;
    }
    private List<OplSentence> sentences(OplGenerationResult result) { return result.artifact().paragraphs().stream().flatMap(value -> value.sentences().stream()).toList(); }
    private void scoped(OplGenerationResult result, String context) {
        assertEquals(context, result.artifact().contextId());
        for (var trace : result.traces()) { assertEquals(context, trace.contextId()); assertTrue(trace.occurrenceIds().stream().allMatch(id -> id.startsWith(context + "."))); }
        for (var sentence : sentences(result)) for (var token : sentence.tokens()) for (var ref : token.sourceRefs())
            if (ref.sourceKind() == OplToken.SourceKind.OCCURRENCE) assertTrue(ref.stableId().startsWith(context + "."));
    }
}
