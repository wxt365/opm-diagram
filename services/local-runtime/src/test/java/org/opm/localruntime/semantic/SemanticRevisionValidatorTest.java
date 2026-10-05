package org.opm.localruntime.semantic;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SemanticRevisionValidatorTest {

    private final SemanticRevisionValidator validator = new SemanticRevisionValidator();

    @Test
    void allowsOneSemanticElementToHaveOccurrencesInMultipleContexts() {
        SemanticRevision revision = validRevision();
        SemanticRevision.Context root = revision.contexts().getFirst();
        List<SemanticRevision.Context> contexts = new ArrayList<>(revision.contexts());
        contexts.add(new SemanticRevision.Context(
                "context.secondary",
                SemanticRevision.ContextKind.PROCESS_REFINEMENT,
                root.capability(),
                new SemanticRevision.QualifiedName("urn:opm:demo:processing", "Secondary"),
                List.of("occurrence.raw.secondary"),
                root.source()));
        List<SemanticRevision.Occurrence> occurrences = new ArrayList<>(revision.occurrences());
        occurrences.add(new SemanticRevision.Occurrence(
                "occurrence.raw.secondary",
                "context.secondary",
                SemanticRevision.TargetKind.ELEMENT,
                "element.raw.material",
                SemanticRevision.OccurrenceOwnership.REFERENCED,
                "OBJECT_NODE",
                "layout.raw.secondary"));
        List<SemanticRevision.Layout> layouts = new ArrayList<>(revision.layouts());
        layouts.add(new SemanticRevision.Layout("layout.raw.secondary", 40, 80, 160, 72, 0));

        assertFalse(validator.validate(copy(revision, revision.elements(), revision.states(), revision.facts(), contexts, occurrences, layouts)).iterator().hasNext());
    }

    @Test
    void rejectsDanglingWrongKindAndDuplicateRefinementEdges() {
        var revision = validRevision();
        var root = revision.contexts().getFirst();
        var child = new SemanticRevision.Context("context.child", SemanticRevision.ContextKind.OBJECT_REFINEMENT,
                root.capability(), root.name(), List.of(), root.source());
        var contexts = new ArrayList<>(revision.contexts()); contexts.add(child);
        var valid = new SemanticRevision.RefinementEdge("refinement.valid", root.id(), child.id(),
                "element.raw.material", SemanticRevision.CoreKind.OBJECT);
        assertTrue(validator.validate(withRefinements(revision, contexts, List.of(valid))).isEmpty());
        var dangling = new SemanticRevision.RefinementEdge("refinement.dangling", root.id(), child.id(),
                "element.missing", SemanticRevision.CoreKind.OBJECT);
        assertContains(SemanticValidationCode.MISSING_REFERENCE,
                validator.validate(withRefinements(revision, contexts, List.of(dangling))));
        var wrongKind = new SemanticRevision.RefinementEdge("refinement.wrong", root.id(), child.id(),
                "element.raw.material", SemanticRevision.CoreKind.PROCESS);
        assertContains(SemanticValidationCode.INVALID_REFINEMENT,
                validator.validate(withRefinements(revision, contexts, List.of(wrongKind))));
        var duplicate = new SemanticRevision.RefinementEdge("refinement.duplicate", root.id(), child.id(),
                "element.raw.material", SemanticRevision.CoreKind.OBJECT);
        assertContains(SemanticValidationCode.INVALID_REFINEMENT,
                validator.validate(withRefinements(revision, contexts, List.of(valid, duplicate))));
    }

    @Test
    void reportsDuplicateStableId() {
        SemanticRevision revision = validRevision();
        SemanticRevision.Element original = revision.elements().getFirst();
        List<SemanticRevision.Element> elements = new ArrayList<>(revision.elements());
        elements.add(new SemanticRevision.Element(
                "state.raw.available", original.coreKind(), original.capability(), original.name(), List.of(), original.source(), original.normalization()));

        assertContains(SemanticValidationCode.DUPLICATE_ID,
                validator.validate(copy(revision, elements, revision.states(), revision.facts(), revision.contexts(), revision.occurrences(), revision.layouts())));
    }

    @Test
    void reportsCapabilityBindingMismatch() {
        SemanticRevision revision = validRevision();
        SemanticRevision.Element original = revision.elements().getFirst();
        List<SemanticRevision.Element> elements = new ArrayList<>(revision.elements());
        elements.set(0, new SemanticRevision.Element(
                original.id(), original.coreKind(),
                new SemanticRevision.CapabilityReference(original.capability().capabilityId(), "profile.other", "0.1.0"),
                original.name(), original.stateIds(), original.source(), original.normalization()));

        assertContains(SemanticValidationCode.CAPABILITY_BINDING_MISMATCH,
                validator.validate(copy(revision, elements, revision.states(), revision.facts(), revision.contexts(), revision.occurrences(), revision.layouts())));
    }

    @Test
    void reportsStateOwnerMismatch() {
        SemanticRevision revision = validRevision();
        SemanticRevision.State original = revision.states().getFirst();
        List<SemanticRevision.State> states = List.of(new SemanticRevision.State(
                original.id(), "element.processing", original.capability(), original.name(), original.roles(), original.source(), original.normalization()));

        assertContains(SemanticValidationCode.STATE_OWNER_MISMATCH,
                validator.validate(copy(revision, revision.elements(), states, revision.facts(), revision.contexts(), revision.occurrences(), revision.layouts())));
    }

    @Test
    void reportsInvalidEndpointOrdinal() {
        SemanticRevision revision = validRevision();
        SemanticRevision.Fact original = revision.facts().getFirst();
        SemanticRevision.Endpoint endpoint = original.endpoints().getFirst();
        List<SemanticRevision.Endpoint> endpoints = new ArrayList<>(original.endpoints());
        endpoints.set(0, new SemanticRevision.Endpoint(
                endpoint.id(), endpoint.role(), endpoint.targetKind(), endpoint.targetId(), 5, endpoint.stateQualificationId()));
        List<SemanticRevision.Fact> facts = List.of(new SemanticRevision.Fact(
                original.id(), original.family(), original.capability(), endpoints, original.direction(), original.source(), original.normalization()));

        assertContains(SemanticValidationCode.INVALID_ENDPOINT,
                validator.validate(copy(revision, revision.elements(), revision.states(), facts, revision.contexts(), revision.occurrences(), revision.layouts())));
    }

    @Test
    void reportsMissingEndpointTarget() {
        SemanticRevision revision = validRevision();
        SemanticRevision.Fact original = revision.facts().getFirst();
        SemanticRevision.Endpoint endpoint = original.endpoints().getFirst();
        List<SemanticRevision.Endpoint> endpoints = new ArrayList<>(original.endpoints());
        endpoints.set(0, new SemanticRevision.Endpoint(
                endpoint.id(), endpoint.role(), endpoint.targetKind(), "element.missing", endpoint.ordinal(), endpoint.stateQualificationId()));
        List<SemanticRevision.Fact> facts = List.of(new SemanticRevision.Fact(
                original.id(), original.family(), original.capability(), endpoints, original.direction(), original.source(), original.normalization()));

        assertContains(SemanticValidationCode.MISSING_REFERENCE,
                validator.validate(copy(revision, revision.elements(), revision.states(), facts, revision.contexts(), revision.occurrences(), revision.layouts())));
    }

    @Test
    void reportsContextClosureViolation() {
        SemanticRevision revision = validRevision();
        SemanticRevision.Context original = revision.contexts().getFirst();
        List<SemanticRevision.Context> contexts = List.of(new SemanticRevision.Context(
                original.id(), original.kind(), original.capability(), original.name(), List.of(), original.source()));

        assertContains(SemanticValidationCode.CONTEXT_CLOSURE_VIOLATION,
                validator.validate(copy(revision, revision.elements(), revision.states(), revision.facts(), contexts, revision.occurrences(), revision.layouts())));
    }

    @Test
    void reportsMissingReferencesAndInvalidLayout() {
        SemanticRevision revision = validRevision();
        SemanticRevision.Occurrence originalOccurrence = revision.occurrences().getFirst();
        List<SemanticRevision.Occurrence> occurrences = new ArrayList<>(revision.occurrences());
        occurrences.set(0, new SemanticRevision.Occurrence(
                originalOccurrence.id(), originalOccurrence.contextId(), originalOccurrence.targetKind(), originalOccurrence.targetId(),
                originalOccurrence.ownership(), originalOccurrence.constructRole(), "layout.missing"));
        SemanticRevision.Layout originalLayout = revision.layouts().getFirst();
        List<SemanticRevision.Layout> layouts = new ArrayList<>(revision.layouts());
        layouts.set(0, new SemanticRevision.Layout(
                originalLayout.id(), originalLayout.x(), originalLayout.y(), 0, originalLayout.height(), originalLayout.zOrder()));
        List<SemanticValidationProblem> problems = validator.validate(copy(
                revision, revision.elements(), revision.states(), revision.facts(), revision.contexts(), occurrences, layouts));

        assertContains(SemanticValidationCode.MISSING_REFERENCE, problems);
        assertContains(SemanticValidationCode.INVALID_LAYOUT, problems);
    }

    @Test
    void reportsViewDerivedFactOwner() {
        SemanticRevision revision = validRevision();
        List<SemanticRevision.Occurrence> occurrences = new ArrayList<>(revision.occurrences());
        int index = findOccurrence(occurrences, "occurrence.consumption");
        SemanticRevision.Occurrence original = occurrences.get(index);
        occurrences.set(index, new SemanticRevision.Occurrence(
                original.id(), original.contextId(), original.targetKind(), original.targetId(),
                SemanticRevision.OccurrenceOwnership.VIEW_DERIVED, original.constructRole(), original.layoutId()));

        assertContains(SemanticValidationCode.INVALID_OWNERSHIP,
                validator.validate(copy(revision, revision.elements(), revision.states(), revision.facts(), revision.contexts(), occurrences, revision.layouts())));
    }

    @Test
    void publicDomainApiDoesNotExposeJacksonOrJdbcTypes() {
        List<Class<?>> apiTypes = List.of(
                SemanticRevision.class,
                SemanticRevisionReader.class,
                SemanticRevisionValidator.class,
                SemanticValidationProblem.class,
                SemanticValidationCode.class);

        for (Class<?> apiType : apiTypes) {
            assertNoInfrastructureTypes(apiType);
            for (Class<?> nestedType : apiType.getDeclaredClasses()) {
                assertNoInfrastructureTypes(nestedType);
            }
        }
    }

    @Test
    void domainCollectionsAreImmutable() {
        SemanticRevision revision = validRevision();

        assertThrows(UnsupportedOperationException.class, () -> revision.elements().add(revision.elements().getFirst()));
        assertThrows(UnsupportedOperationException.class, () -> revision.contexts().getFirst().occurrenceIds().clear());
        assertThrows(UnsupportedOperationException.class, () -> revision.facts().getFirst().endpoints().clear());
    }

    private SemanticRevision validRevision() {
        return new SemanticRevisionReader().read(findFixture());
    }

    private SemanticRevision withRefinements(SemanticRevision revision, List<SemanticRevision.Context> contexts,
                                            List<SemanticRevision.RefinementEdge> edges) {
        return new SemanticRevision(revision.revisionId(), revision.modelId(), revision.revisionSequence(),
                revision.profileBinding(), revision.rootContextId(), revision.elements(), revision.features(),
                revision.states(), revision.facts(), contexts, revision.occurrences(), revision.layouts(),
                revision.statePresentations(), edges);
    }

    private SemanticRevision copy(
            SemanticRevision revision,
            List<SemanticRevision.Element> elements,
            List<SemanticRevision.State> states,
            List<SemanticRevision.Fact> facts,
            List<SemanticRevision.Context> contexts,
            List<SemanticRevision.Occurrence> occurrences,
            List<SemanticRevision.Layout> layouts) {
        return new SemanticRevision(
                revision.revisionId(), revision.modelId(), revision.revisionSequence(), revision.profileBinding(), revision.rootContextId(),
                elements, states, facts, contexts, occurrences, layouts);
    }

    private int findOccurrence(List<SemanticRevision.Occurrence> occurrences, String occurrenceId) {
        for (int index = 0; index < occurrences.size(); index++) {
            if (occurrenceId.equals(occurrences.get(index).id())) {
                return index;
            }
        }
        throw new IllegalStateException("Occurrence is not present in the fixture");
    }

    private void assertContains(SemanticValidationCode expected, List<SemanticValidationProblem> problems) {
        assertTrue(problems.stream().anyMatch(problem -> problem.code() == expected),
                () -> "Expected " + expected + " but got " + problems);
    }

    private void assertNoInfrastructureType(Class<?> type) {
        String packageName = type.getPackageName();
        assertFalse(packageName.startsWith("com.fasterxml.jackson"), () -> "Jackson type leaked: " + type.getName());
        assertFalse(packageName.startsWith("java.sql") || packageName.startsWith("javax.sql"),
                () -> "JDBC type leaked: " + type.getName());
    }

    private void assertNoInfrastructureTypes(Class<?> apiType) {
        for (Method method : apiType.getMethods()) {
            assertNoInfrastructureType(method.getReturnType());
            for (Class<?> parameterType : method.getParameterTypes()) {
                assertNoInfrastructureType(parameterType);
            }
        }
        for (Constructor<?> constructor : apiType.getConstructors()) {
            for (Class<?> parameterType : constructor.getParameterTypes()) {
                assertNoInfrastructureType(parameterType);
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
