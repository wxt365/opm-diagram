package org.opm.localruntime.text;

import org.junit.jupiter.api.Test;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionReader;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OplTextGenerationServiceTest {

    private final OplTextGenerationService service = new OplTextGenerationService();

    @Test
    void generatesGoldenConsumptionWithStateAndCompleteTrace() {
        OplGenerationResult result = service.generate(fixture(), "context.sd.root", grammarWithConsumptionTemplates(fixture()));

        OplSentence sentence = result.artifact().paragraphs().getFirst().sentences().getFirst();
        OplTextTrace trace = result.traces().getFirst();
        assertEquals("Processing consumes available Raw Material.", sentence.text());
        assertEquals(List.of("opl.consumption.state.v1"), sentence.generationRuleIds());
        assertEquals(List.of("fact.processing.consumes.raw"), trace.factIds());
        assertEquals(List.of("element.processing", "element.raw.material"), trace.inputElementIds());
        assertTrue(trace.occurrenceIds().containsAll(List.of(
                "occurrence.consumption", "occurrence.processing", "occurrence.raw.material", "occurrence.raw.available")));
        assertTrue(trace.tokenRanges().stream().anyMatch(range -> range.inputId().equals("state.raw.available")
                && sentence.text().substring(range.startInclusive(), range.endExclusive()).equals("available")));
        assertEquals(64, result.artifact().artifactDigest().length());
    }

    @Test
    void generatesGoldenConsumptionWithoutState() {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact original = revision.facts().getFirst();
        List<SemanticRevision.Endpoint> endpoints = new ArrayList<>(original.endpoints());
        SemanticRevision.Endpoint consumed = endpoints.getFirst();
        endpoints.set(0, new SemanticRevision.Endpoint(
                consumed.id(), consumed.role(), consumed.targetKind(), consumed.targetId(), consumed.ordinal(), null));
        SemanticRevision.Fact fact = new SemanticRevision.Fact(
                original.id(), original.family(), original.capability(), endpoints, original.direction(), original.source(), original.normalization());
        SemanticRevision withoutState = copy(revision, List.of(fact), revision.contexts(), revision.occurrences());

        OplGenerationResult result = service.generate(withoutState, "context.sd.root", grammarWithConsumptionTemplates(withoutState));

        assertEquals("Processing consumes Raw Material.", result.artifact().paragraphs().getFirst().sentences().getFirst().text());
        assertEquals(List.of("opl.consumption.v1"), result.artifact().paragraphs().getFirst().sentences().getFirst().generationRuleIds());
    }

    @Test
    void generatesEmptyArtifactForAValidContextWithoutConsumption() {
        SemanticRevision revision = fixture();
        SemanticRevision withoutFacts = copy(revision, List.of(), revision.contexts(), revision.occurrences());

        OplGenerationResult result = service.generate(withoutFacts, "context.sd.root", grammarWithConsumptionTemplates(withoutFacts));

        assertTrue(result.artifact().paragraphs().getFirst().sentences().isEmpty());
        assertTrue(result.traces().isEmpty());
    }

    @Test
    void replayProducesIdenticalArtifactSentencesAndTrace() {
        SemanticRevision revision = fixture();
        OplGrammar grammar = grammarWithConsumptionTemplates(revision);

        assertEquals(service.generate(revision, "context.sd.root", grammar), service.generate(revision, "context.sd.root", grammar));
    }

    @Test
    void rejectsGrammarBindingMismatch() {
        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.generate(fixture(), "context.sd.root", new OplGrammar(
                        new OplGrammar.Binding("grammar.other", "0.1.0", "different"),
                        List.of(new OplGrammar.Template("opl.consumption.state.v1", 10)))));

        assertEquals(OplGenerationCode.TEXT_GRAMMAR_BINDING_MISMATCH, exception.code());
    }

    @Test
    void rejectsMissingTemplate() {
        SemanticRevision revision = fixture();
        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.generate(revision, "context.sd.root", new OplGrammar(binding(revision),
                        List.of(new OplGrammar.Template("opl.consumption.v1", 10)))));

        assertEquals(OplGenerationCode.TEXT_TEMPLATE_MISSING, exception.code());
    }

    @Test
    void rejectsNonP0Context() {
        SemanticRevision revision = fixture();
        SemanticRevision.Context root = revision.contexts().getFirst();
        SemanticRevision.Context refinement = new SemanticRevision.Context(
                "context.refinement", SemanticRevision.ContextKind.PROCESS_REFINEMENT, root.capability(), root.name(),
                root.occurrenceIds(), root.source());
        SemanticRevision withRefinement = copy(revision, revision.facts(), List.of(root, refinement), revision.occurrences());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.generate(withRefinement, refinement.id(), grammarWithConsumptionTemplates(withRefinement)));

        assertEquals(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, exception.code());
    }

    @Test
    void rejectsUnknownCapability() {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact original = revision.facts().getFirst();
        SemanticRevision.Fact unsupported = new SemanticRevision.Fact(
                original.id(), original.family(), new SemanticRevision.CapabilityReference(
                "CAP-UNSUPPORTED-001", original.capability().profileId(), original.capability().profileVersion()),
                original.endpoints(), original.direction(), original.source(), original.normalization());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.generate(copy(revision, List.of(unsupported), revision.contexts(), revision.occurrences()),
                        "context.sd.root", grammarWithConsumptionTemplates(revision)));

        assertEquals(OplGenerationCode.TEXT_CAPABILITY_UNSUPPORTED, exception.code());
    }

    @Test
    void rejectsStateQualificationOwnedByAnotherElement() {
        SemanticRevision revision = fixture();
        SemanticRevision.State originalState = revision.states().getFirst();
        SemanticRevision.State mismatchedState = new SemanticRevision.State(
                "state.processing.invalid", "element.processing", originalState.capability(), originalState.name(),
                originalState.roles(), originalState.source(), originalState.normalization());
        SemanticRevision.Fact originalFact = revision.facts().getFirst();
        List<SemanticRevision.Endpoint> endpoints = new ArrayList<>(originalFact.endpoints());
        SemanticRevision.Endpoint consumed = endpoints.getFirst();
        endpoints.set(0, new SemanticRevision.Endpoint(
                consumed.id(), consumed.role(), consumed.targetKind(), consumed.targetId(), consumed.ordinal(), mismatchedState.id()));
        SemanticRevision.Fact mismatchedFact = new SemanticRevision.Fact(
                originalFact.id(), originalFact.family(), originalFact.capability(), endpoints,
                originalFact.direction(), originalFact.source(), originalFact.normalization());
        SemanticRevision mismatched = new SemanticRevision(
                revision.revisionId(), revision.modelId(), revision.revisionSequence(), revision.profileBinding(), revision.rootContextId(),
                revision.elements(), List.of(originalState, mismatchedState), List.of(mismatchedFact), revision.contexts(),
                revision.occurrences(), revision.layouts());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.generate(mismatched, "context.sd.root", grammarWithConsumptionTemplates(mismatched)));

        assertEquals(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, exception.code());
    }

    @Test
    void ordersConsumptionPlansByFactStableIdAfterGrammarPrecedenceAndProcess() {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact original = revision.facts().getFirst();
        SemanticRevision.Fact laterFact = new SemanticRevision.Fact(
                "fact.zzz.consumes.raw", original.family(), original.capability(), original.endpoints(),
                original.direction(), original.source(), original.normalization());
        SemanticRevision.Context root = revision.contexts().getFirst();
        SemanticRevision.Context expandedRoot = new SemanticRevision.Context(
                root.id(), root.kind(), root.capability(), root.name(),
                List.of("occurrence.zzz.consumption", "occurrence.consumption", "occurrence.processing", "occurrence.raw.material", "occurrence.raw.available"),
                root.source());
        List<SemanticRevision.Occurrence> occurrences = new ArrayList<>(revision.occurrences());
        occurrences.add(new SemanticRevision.Occurrence(
                "occurrence.zzz.consumption", root.id(), SemanticRevision.TargetKind.FACT, laterFact.id(),
                SemanticRevision.OccurrenceOwnership.OWNED, "CONSUMPTION_LINK", "layout.consumption"));
        SemanticRevision expanded = copy(revision, List.of(laterFact, original), List.of(expandedRoot), occurrences);

        List<String> factIds = service.generate(expanded, "context.sd.root", grammarWithConsumptionTemplates(expanded))
                .artifact().paragraphs().getFirst().sentences().stream().map(OplSentence::inputFactIds).map(List::getFirst).toList();

        assertEquals(List.of("fact.processing.consumes.raw", "fact.zzz.consumes.raw"), factIds);
    }

    @Test
    void rejectsMissingOccurrenceNeededByTrace() {
        SemanticRevision revision = fixture();
        List<SemanticRevision.Occurrence> occurrences = revision.occurrences().stream()
                .filter(occurrence -> !occurrence.id().equals("occurrence.processing"))
                .toList();
        SemanticRevision.Context root = revision.contexts().getFirst();
        SemanticRevision.Context incompleteRoot = new SemanticRevision.Context(
                root.id(), root.kind(), root.capability(), root.name(),
                root.occurrenceIds().stream().filter(id -> !id.equals("occurrence.processing")).toList(), root.source());
        SemanticRevision incomplete = copy(revision, revision.facts(), List.of(incompleteRoot), occurrences);

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.generate(incomplete, "context.sd.root", grammarWithConsumptionTemplates(incomplete)));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void publicTextApiDoesNotExposeJacksonOrJdbcAndKeepsCollectionsImmutable() {
        List<Class<?>> apiTypes = List.of(
                OplGrammar.class, OplGrammar.Binding.class, OplGrammar.Template.class, SentencePlan.class, SentencePlan.SortKey.class,
                OplToken.class, OplSentence.class, OplParagraph.class, OplTextArtifact.class, OplTextTrace.class,
                OplTextTrace.TokenRange.class, OplGenerationResult.class, OplGenerationException.class, OplGenerationCode.class,
                OplTextGenerationService.class);
        for (Class<?> apiType : apiTypes) {
            assertNoInfrastructureTypes(apiType);
        }
        OplGenerationResult result = service.generate(fixture(), "context.sd.root", grammarWithConsumptionTemplates(fixture()));
        assertThrows(UnsupportedOperationException.class, () -> result.traces().clear());
        assertThrows(UnsupportedOperationException.class, () -> result.artifact().paragraphs().clear());
        assertThrows(UnsupportedOperationException.class, () -> result.traces().getFirst().tokenRanges().clear());
    }

    private SemanticRevision fixture() {
        return new SemanticRevisionReader().read(findFixture());
    }

    private OplGrammar grammarWithConsumptionTemplates(SemanticRevision revision) {
        return new OplGrammar(binding(revision), List.of(
                new OplGrammar.Template("opl.consumption.v1", 10),
                new OplGrammar.Template("opl.consumption.state.v1", 10)));
    }

    private OplGrammar.Binding binding(SemanticRevision revision) {
        SemanticRevision.AssetReference reference = revision.profileBinding().textGrammar();
        return new OplGrammar.Binding(reference.id(), reference.version(), reference.sha256());
    }

    private SemanticRevision copy(
            SemanticRevision revision,
            List<SemanticRevision.Fact> facts,
            List<SemanticRevision.Context> contexts,
            List<SemanticRevision.Occurrence> occurrences) {
        return new SemanticRevision(revision.revisionId(), revision.modelId(), revision.revisionSequence(), revision.profileBinding(),
                revision.rootContextId(), revision.elements(), revision.states(), facts, contexts, occurrences, revision.layouts());
    }

    private void assertNoInfrastructureTypes(Class<?> type) {
        assertFalse(type.getPackageName().startsWith("com.fasterxml.jackson"));
        assertFalse(type.getPackageName().startsWith("java.sql") || type.getPackageName().startsWith("javax.sql"));
        for (Method method : type.getMethods()) {
            assertFalse(method.getReturnType().getPackageName().startsWith("com.fasterxml.jackson"));
            for (Class<?> parameterType : method.getParameterTypes()) {
                assertFalse(parameterType.getPackageName().startsWith("com.fasterxml.jackson")
                        || parameterType.getPackageName().startsWith("java.sql")
                        || parameterType.getPackageName().startsWith("javax.sql"));
            }
        }
        for (Constructor<?> constructor : type.getConstructors()) {
            for (Class<?> parameterType : constructor.getParameterTypes()) {
                assertFalse(parameterType.getPackageName().startsWith("com.fasterxml.jackson")
                        || parameterType.getPackageName().startsWith("java.sql")
                        || parameterType.getPackageName().startsWith("javax.sql"));
            }
        }
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
