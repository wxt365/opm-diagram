package org.opm.localruntime.text;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionReader;
import org.opm.localruntime.golden.OplGoldenReplayReportWriter;
import org.opm.localruntime.golden.OplGoldenReplayRunner;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;
import java.util.function.UnaryOperator;
import java.util.stream.Stream;

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
        assertEquals(fixture().profileBinding().bindingDigest(), trace.bindingDigest());
        assertEquals(List.of("element.processing", "element.raw.material"), trace.inputElementIds());
        assertTrue(trace.occurrenceIds().containsAll(List.of(
                "occurrence.consumption", "occurrence.processing", "occurrence.raw.material", "occurrence.raw.available")));
        assertTrue(trace.tokenRanges().stream().anyMatch(range -> range.inputId().equals("state.raw.available")
                && sentence.text().substring(range.startInclusive(), range.endExclusive()).equals("available")));
        assertEquals(64, result.artifact().artifactDigest().length());
    }

    @Test
    void delegatesVersionedGoldenReplayToTheSingleRunner() throws Exception {
        Path manifest = findGoldenManifest();
        OplGoldenReplayReportWriter.Report report = new OplGoldenReplayRunner().run(manifest, Files.createTempDirectory("opm-golden-replay-service-"));

        assertEquals(0, report.cases().stream().filter(item -> item.observedStatus() == OplGoldenReplayReportWriter.ObservedStatus.FAILED).count());
    }

    @Test
    void mapsStructuralEndpointsAndDirectionLabelsIntoTokenTraceSources() {
        SemanticRevision revision = new SemanticRevisionReader().read(
                findFromRepository("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/g-opl-struct-003-bidirectional-object.json"));
        OplGrammar grammar = new OplGrammarAssetLoader().load(
                findFromRepository("packages/profiles/profile.iso19450.2024.draft/0.2.0/grammar/representative-opl-grammar.json"),
                revision.profileBinding().textGrammar());

        OplGenerationResult result = service.generate(revision, revision.rootContextId(), grammar);
        OplTextTrace forward = result.traces().getFirst();
        OplTextTrace reverse = result.traces().get(1);

        assertTrue(forward.sourceRefs().stream().anyMatch(ref -> ref.sourceKind() == OplToken.SourceKind.ENDPOINT
                && "endpoint.raw".equals(ref.stableId()) && ref.endpointOrdinal() == 0 && "FORWARD".equals(ref.sentenceSlot())));
        assertTrue(forward.sourceRefs().stream().anyMatch(ref -> ref.sourceKind() == OplToken.SourceKind.FACT
                && "labels[slot_id=forward_tag].text".equals(ref.fieldPath()) && "FORWARD".equals(ref.sentenceSlot())));
        assertTrue(reverse.sourceRefs().stream().anyMatch(ref -> ref.sourceKind() == OplToken.SourceKind.ENDPOINT
                && "endpoint.refined".equals(ref.stableId()) && ref.endpointOrdinal() == 1 && "REVERSE".equals(ref.sentenceSlot())));
        assertTrue(reverse.sourceRefs().stream().anyMatch(ref -> ref.sourceKind() == OplToken.SourceKind.FACT
                && "labels[slot_id=reverse_tag].text".equals(ref.fieldPath()) && "REVERSE".equals(ref.sentenceSlot())));
    }

    @Test
    void emitsContiguousUtf8TokensAndClosedTraceSources() {
        OplGenerationResult result = service.generate(fixture(), "context.sd.root", grammarWithConsumptionTemplates(fixture()));
        OplSentence sentence = result.artifact().paragraphs().getFirst().sentences().getFirst();
        int expectedStart = 0;
        for (int ordinal = 0; ordinal < sentence.tokens().size(); ordinal++) {
            OplToken token = sentence.tokens().get(ordinal);
            assertEquals(sentence.sentenceId(), token.sentenceId());
            assertEquals(ordinal, token.ordinal());
            assertEquals(expectedStart, token.startUtf8Byte());
            assertEquals(token.text().getBytes(java.nio.charset.StandardCharsets.UTF_8).length,
                    token.endUtf8Byte() - token.startUtf8Byte());
            assertFalse(token.sourceRefs().isEmpty());
            expectedStart = token.endUtf8Byte();
        }
        assertEquals(sentence.text().getBytes(java.nio.charset.StandardCharsets.UTF_8).length, expectedStart);
        assertTrue(sentence.tokens().stream().anyMatch(token -> token.kind() == OplToken.Kind.ENTITY));
        assertTrue(sentence.tokens().stream().anyMatch(token -> token.kind() == OplToken.Kind.STATE));

        Set<OplToken.SourceKind> traceKinds = result.traces().getFirst().sourceRefs().stream()
                .map(OplToken.SourceRef::sourceKind).collect(java.util.stream.Collectors.toSet());
        assertTrue(traceKinds.containsAll(Set.of(OplToken.SourceKind.FACT, OplToken.SourceKind.TEMPLATE,
                OplToken.SourceKind.GRAMMAR, OplToken.SourceKind.RULE, OplToken.SourceKind.CAPABILITY)));
    }

    @Test
    void acceptsUtf8TokenRangesAtMultibyteCharacterBoundaries() {
        OplToken.SourceRef source = new OplToken.SourceRef(OplToken.SourceKind.ELEMENT, "element.processing", null, 0, "SINGLE");
        OplToken entity = new OplToken("token.unicode.entity", "sentence.unicode", 0, "处理", OplToken.Kind.ENTITY, 0, 6, List.of(source));
        OplToken punctuation = new OplToken("token.unicode.punctuation", "sentence.unicode", 1, ".", OplToken.Kind.PUNCTUATION, 6, 7, List.of(source));

        OplSentence sentence = new OplSentence("sentence.unicode", "处理.", 0, List.of(entity, punctuation),
                List.of("opl.consumption.v1"), List.of("fact.processing.consumes.raw"));

        assertEquals(7, sentence.text().getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
        assertEquals(6, sentence.tokens().getFirst().endUtf8Byte());
    }

    @Test
    void acceptsAnActiveTraceWithClosedTokenSourcesAndTokenAlignedRanges() {
        ActiveTraceFixture fixture = activeTraceFixture();

        service.validateTrace(fixture.artifact(), List.of(fixture.trace()), fixture.bindingDigest(), true);
    }

    @ParameterizedTest(name = "TTRACE-MUT-007 {0}")
    @MethodSource("legacyTokenKinds")
    void rejectsLegacyTokenKindsForAnActiveTrace(OplToken.Kind legacyKind) {
        ActiveTraceFixture fixture = activeTraceFixture();
        OplSentence source = fixture.artifact().paragraphs().getFirst().sentences().getFirst();
        OplToken original = source.tokens().getFirst();
        OplToken legacy = new OplToken(original.tokenId(), original.sentenceId(), original.ordinal(), original.text(), legacyKind,
                original.startUtf8Byte(), original.endUtf8Byte(), original.sourceRefs());
        OplSentence mutated = new OplSentence(source.sentenceId(), source.text(), source.ordinal(), List.of(legacy, source.tokens().get(1)),
                source.generationRuleIds(), source.inputFactIds());
        OplTextArtifact artifact = new OplTextArtifact(fixture.artifact().artifactId(), fixture.artifact().inputRevisionId(), fixture.artifact().grammarBinding(),
                fixture.artifact().contextId(), List.of(new OplParagraph("paragraph.active", fixture.artifact().contextId(), 0, List.of(mutated))), fixture.artifact().artifactDigest());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateTrace(artifact, List.of(fixture.trace()), fixture.bindingDigest(), true));
        assertEquals(OplGenerationCode.TEXT_LEGACY_VALUE_FORBIDDEN, exception.code());
    }

    @Test
    void rejectsActiveTokenWithLegacySourceReference() {
        ActiveTraceFixture fixture = activeTraceFixture();
        OplToken.SourceRef legacy = new OplToken.SourceRef(OplToken.SourceKind.LEGACY, "legacy", null, null, null);
        OplTextArtifact artifact = artifactWithFirstTokenSources(fixture, refs -> appendSourceRef(refs, legacy));

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateTrace(artifact, List.of(fixture.trace()), fixture.bindingDigest(), true));

        assertEquals(OplGenerationCode.TEXT_LEGACY_VALUE_FORBIDDEN, exception.code());
    }

    @Test
    void rejectsActiveTokenWithDuplicateSourceReference() {
        ActiveTraceFixture fixture = activeTraceFixture();
        OplTextArtifact artifact = artifactWithFirstTokenSources(fixture, refs -> appendSourceRef(refs, refs.getFirst()));

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateTrace(artifact, List.of(fixture.trace()), fixture.bindingDigest(), true));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void rejectsActiveTokenWhoseGrammarPathContainsADigest() {
        ActiveTraceFixture fixture = activeTraceFixture();
        OplTextArtifact artifact = artifactWithFirstTokenSources(fixture, refs -> refs.stream().map(ref -> ref.sourceKind() == OplToken.SourceKind.GRAMMAR
                ? new OplToken.SourceRef(ref.sourceKind(), ref.stableId(), "digest=" + "a".repeat(64), ref.endpointOrdinal(), ref.sentenceSlot())
                : ref).toList());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateTrace(artifact, List.of(fixture.trace()), fixture.bindingDigest(), true));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void rejectsAnActiveTraceWithAMissingTokenSourceInItsCatalog() {
        ActiveTraceFixture fixture = activeTraceFixture();
        List<OplToken.SourceRef> missing = fixture.trace().sourceRefs().subList(0, fixture.trace().sourceRefs().size() - 1);
        OplTextTrace trace = new OplTextTrace(fixture.trace().traceId(), fixture.trace().contextId(), fixture.trace().factIds(),
                fixture.trace().inputElementIds(), fixture.trace().occurrenceIds(), fixture.trace().sentenceIds(), fixture.trace().ruleIds(),
                fixture.trace().bindingDigest(), fixture.trace().tokenRanges(), missing);

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateTrace(fixture.artifact(), List.of(trace), fixture.bindingDigest(), true));
        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void rejectsAnActiveTraceRangeThatCutsThroughAToken() {
        ActiveTraceFixture fixture = activeTraceFixture();
        List<OplTextTrace.TokenRange> ranges = List.of(
                new OplTextTrace.TokenRange("element.active", 1, 5),
                fixture.trace().tokenRanges().get(1));
        OplTextTrace trace = new OplTextTrace(fixture.trace().traceId(), fixture.trace().contextId(), fixture.trace().factIds(),
                fixture.trace().inputElementIds(), fixture.trace().occurrenceIds(), fixture.trace().sentenceIds(), fixture.trace().ruleIds(),
                fixture.trace().bindingDigest(), ranges, fixture.trace().sourceRefs());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateTrace(fixture.artifact(), List.of(trace), fixture.bindingDigest(), true));
        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void rejectsAnActiveTraceRangeWithAnUnknownInputSource() {
        ActiveTraceFixture fixture = activeTraceFixture();
        List<OplTextTrace.TokenRange> ranges = List.of(
                new OplTextTrace.TokenRange("element.unknown", 0, 5),
                fixture.trace().tokenRanges().get(1));
        OplTextTrace trace = copyTrace(fixture.trace(), ranges, fixture.trace().sourceRefs());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateTrace(fixture.artifact(), List.of(trace), fixture.bindingDigest(), true));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void rejectsAnActiveTraceWithDuplicateTokenRanges() {
        ActiveTraceFixture fixture = activeTraceFixture();
        List<OplTextTrace.TokenRange> ranges = List.of(
                fixture.trace().tokenRanges().getFirst(),
                fixture.trace().tokenRanges().getFirst());
        OplTextTrace trace = copyTrace(fixture.trace(), ranges, fixture.trace().sourceRefs());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateTrace(fixture.artifact(), List.of(trace), fixture.bindingDigest(), true));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void rejectsAnActiveTraceWhoseLocatableTokenSourceHasNoTokenRange() {
        ActiveTraceFixture fixture = activeTraceFixture();
        List<OplTextTrace.TokenRange> ranges = fixture.trace().tokenRanges().stream()
                .filter(range -> !"occurrence.active".equals(range.inputId())).toList();
        OplTextTrace trace = copyTrace(fixture.trace(), ranges, fixture.trace().sourceRefs());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateTrace(fixture.artifact(), List.of(trace), fixture.bindingDigest(), true));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidActiveTraceInputs")
    void rejectsTokenIdentityAndUtf8CoverageMutations(String mutationId, OplTextArtifact artifact, OplTextTrace trace) {
        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateTrace(artifact, List.of(trace), "a".repeat(64), true));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code(), mutationId);
    }

    @Test
    void rejectsActiveTraceWhoseRuleSourceIsAConcreteTemplateId() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-proc-001-consumption-object-pass.json");
        MutatedGeneration mutated = mutateSources(fixture.generated(), ref -> ref.sourceKind() == OplToken.SourceKind.RULE,
                ref -> new OplToken.SourceRef(OplToken.SourceKind.RULE, "opl.consumption.v1", null, null, ref.sentenceSlot()));

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(fixture.revision(), fixture.assets(), mutated.artifact(), mutated.traces()));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @ParameterizedTest(name = "TTRACE-MUT-011 {0}")
    @MethodSource("requiredFactAndCapabilitySources")
    void rejectsActiveTraceWhoseCatalogOmitsItsFactOrCapability(OplToken.SourceKind sourceKind) {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-proc-001-consumption-object-pass.json");
        MutatedGeneration mutated = mutateSources(fixture.generated(), ref -> ref.sourceKind() == sourceKind, UnaryOperator.identity());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(fixture.revision(), fixture.assets(), mutated.artifact(), mutated.traces()));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void rejectsActiveControlTraceWhoseRuleOrderIsReversed() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-ctrl-001-consumption-pass.json");
        OplTextTrace source = fixture.generated().traces().getFirst();
        OplTextTrace trace = new OplTextTrace(source.traceId(), source.contextId(), source.factIds(), source.inputElementIds(),
                source.occurrenceIds(), source.sentenceIds(), List.of(source.ruleIds().get(1), source.ruleIds().getFirst()),
                source.bindingDigest(), source.tokenRanges(), source.sourceRefs());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(fixture.revision(), fixture.assets(), fixture.generated().artifact(), List.of(trace)));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void rejectsActiveTraceWhoseBindingDigestDoesNotMatchTheRevision() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-proc-001-consumption-object-pass.json");
        OplTextTrace source = fixture.generated().traces().getFirst();
        OplTextTrace trace = new OplTextTrace(source.traceId(), source.contextId(), source.factIds(), source.inputElementIds(),
                source.occurrenceIds(), source.sentenceIds(), source.ruleIds(), "b".repeat(64), source.tokenRanges(), source.sourceRefs());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(fixture.revision(), fixture.assets(), fixture.generated().artifact(), List.of(trace)));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void rejectsActiveTraceWhoseEndpointOrdinalDoesNotResolveTheReferencedEndpoint() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-proc-001-consumption-object-pass.json");
        MutatedGeneration mutated = mutateSources(fixture.generated(), ref -> ref.sourceKind() == OplToken.SourceKind.ENDPOINT,
                ref -> new OplToken.SourceRef(ref.sourceKind(), ref.stableId(), ref.fieldPath(), 9, ref.sentenceSlot()));

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(fixture.revision(), fixture.assets(), mutated.artifact(), mutated.traces()));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void rejectsActiveTraceWhoseCatalogOmitsAnEndpoint() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-proc-001-consumption-object-pass.json");
        MutatedGeneration mutated = mutateSources(fixture.generated(), ref -> ref.sourceKind() == OplToken.SourceKind.ENDPOINT, UnaryOperator.identity());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(fixture.revision(), fixture.assets(), mutated.artifact(), mutated.traces()));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @ParameterizedTest(name = "TTRACE-MUT-015 {0}")
    @MethodSource("endpointDerivedSourceCases")
    void rejectsActiveTraceWhoseCatalogOmitsAnElementOrFeatureSource(
            String branch,
            String fixtureName,
            OplToken.SourceKind sourceKind) {
        ActiveGenerationFixture fixture = activeGenerationFixture(fixtureName);
        MutatedGeneration mutated = mutateSources(fixture.generated(), ref -> ref.sourceKind() == sourceKind, UnaryOperator.identity());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(fixture.revision(), fixture.assets(), mutated.artifact(), mutated.traces()));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @ParameterizedTest(name = "TTRACE-MUT-017 {0}")
    @MethodSource("requiredControlModifierIds")
    void rejectsActiveControlTraceWhoseCatalogOmitsARequiredModifier(String modifierId) {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-ctrl-001-consumption-pass.json");
        MutatedGeneration mutated = mutateSources(fixture.generated(), ref -> ref.sourceKind() == OplToken.SourceKind.MODIFIER
                && modifierId.equals(ref.stableId()), UnaryOperator.identity());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(fixture.revision(), fixture.assets(), mutated.artifact(), mutated.traces()));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @ParameterizedTest(name = "TTRACE-MUT-016 {0}")
    @MethodSource("requiredStateAndOccurrenceSourceCases")
    void rejectsActiveTraceWhoseRequiredStateOrOccurrenceSourceIsMissing(
            String branch,
            OplToken.SourceKind sourceKind,
            String stableId,
            String fieldPath) {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-proc-006-consumption-state-pass.json");
        MutatedGeneration mutated = mutateSources(fixture.generated(), ref -> ref.sourceKind() == sourceKind
                && (stableId == null || stableId.equals(ref.stableId()))
                && (fieldPath == null || fieldPath.equals(ref.fieldPath())), UnaryOperator.identity());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(fixture.revision(), fixture.assets(), mutated.artifact(), mutated.traces()));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void rejectsActiveTraceWhoseOccurrenceIsNotOwnedByTheCurrentContext() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-proc-006-consumption-state-pass.json");
        List<SemanticRevision.Occurrence> occurrences = fixture.revision().occurrences().stream()
                .map(occurrence -> occurrence.id().equals("occurrence.raw")
                        ? new SemanticRevision.Occurrence(occurrence.id(), occurrence.contextId(), occurrence.targetKind(), occurrence.targetId(),
                        SemanticRevision.OccurrenceOwnership.REFERENCED, occurrence.constructRole(), occurrence.layoutId())
                        : occurrence)
                .toList();
        SemanticRevision mutatedRevision = new SemanticRevision(fixture.revision().revisionId(), fixture.revision().modelId(),
                fixture.revision().revisionSequence(), fixture.revision().profileBinding(), fixture.revision().rootContextId(),
                fixture.revision().elements(), fixture.revision().features(), fixture.revision().states(), fixture.revision().facts(),
                fixture.revision().contexts(), occurrences, fixture.revision().layouts(), fixture.revision().statePresentations());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(mutatedRevision, fixture.assets(), fixture.generated().artifact(), fixture.generated().traces()));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void emitsBidirectionalTraceSourcesInSentenceSlotSemanticOrder() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-struct-003-bidirectional-object-tagged-pass.json");
        OplTextTrace forward = fixture.generated().traces().getFirst();
        OplTextTrace reverse = fixture.generated().traces().get(1);

        assertEquals(List.of(0, 1), endpointOrdinals(forward));
        assertEquals(List.of(1, 0), endpointOrdinals(reverse));
        assertEquals(List.of("labels[slot_id=forward_tag].text"), labelPaths(forward));
        assertEquals(List.of("labels[slot_id=reverse_tag].text"), labelPaths(reverse));
    }

    @Test
    void rejectsActiveBidirectionalTraceWhoseForwardSentenceUsesTheReverseLabel() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-struct-003-bidirectional-object-tagged-pass.json");
        MutatedGeneration mutated = mutateSources(fixture.generated(), ref -> ref.sourceKind() == OplToken.SourceKind.FACT
                && "labels[slot_id=forward_tag].text".equals(ref.fieldPath()), ref -> new OplToken.SourceRef(
                ref.sourceKind(), ref.stableId(), "labels[slot_id=reverse_tag].text", ref.endpointOrdinal(), ref.sentenceSlot()));

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(fixture.revision(), fixture.assets(), mutated.artifact(), mutated.traces()));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void rejectsActiveBidirectionalTraceWhoseForwardSentenceUsesTheReverseSlot() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-struct-003-bidirectional-object-tagged-pass.json");
        MutatedGeneration mutated = mutateSources(fixture.generated(), ref -> false, ref -> new OplToken.SourceRef(
                ref.sourceKind(), ref.stableId(), ref.fieldPath(), ref.endpointOrdinal(), "REVERSE"));

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(fixture.revision(), fixture.assets(), mutated.artifact(), mutated.traces()));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void rejectsActiveBidirectionalTraceWhoseEndpointCatalogOrderIsReversed() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-struct-003-bidirectional-object-tagged-pass.json");
        OplTextTrace source = fixture.generated().traces().getFirst();
        OplTextTrace trace = copyTrace(source, source.tokenRanges(), swapFirstTwoEndpoints(source.sourceRefs()));

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(fixture.revision(), fixture.assets(), fixture.generated().artifact(), List.of(trace, fixture.generated().traces().get(1))));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void emitsStructuralListSeparatorsWithOnlyTheirAdjacentEndpoints() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-struct-005-aggregation-object-fan-2-complete-pass.json");
        OplToken separator = fixture.generated().artifact().paragraphs().getFirst().sentences().getFirst().tokens().stream()
                .filter(token -> token.kind() == OplToken.Kind.LIST_SEPARATOR).findFirst().orElseThrow();

        assertEquals(List.of(1, 2), tokenEndpointOrdinals(separator));
    }

    @Test
    void emitsLocalSourcesForWhitespaceAndStructuralEntityTokens() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-struct-005-aggregation-object-fan-2-complete-pass.json");
        List<OplToken> tokens = fixture.generated().artifact().paragraphs().getFirst().sentences().getFirst().tokens();
        OplToken whitespace = tokens.stream().filter(token -> token.kind() == OplToken.Kind.WHITESPACE).findFirst().orElseThrow();
        OplToken partOne = tokens.stream().filter(token -> "Object Part 1".equals(token.text())).findFirst().orElseThrow();

        assertEquals(Set.of(OplToken.SourceKind.TEMPLATE, OplToken.SourceKind.GRAMMAR), whitespace.sourceRefs().stream()
                .map(OplToken.SourceRef::sourceKind).collect(java.util.stream.Collectors.toSet()));
        assertEquals(List.of(1), tokenEndpointOrdinals(partOne));
    }

    @Test
    void emitsIncompleteStructuralListTailWithLastEndpointAndCompletenessOnly() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-struct-005-aggregation-object-fan-2-incomplete-pass.json");
        OplToken separator = fixture.generated().artifact().paragraphs().getFirst().sentences().getFirst().tokens().stream()
                .filter(token -> token.kind() == OplToken.Kind.LIST_SEPARATOR).reduce((first, second) -> second).orElseThrow();

        assertEquals(List.of(2), tokenEndpointOrdinals(separator));
        assertTrue(separator.sourceRefs().stream().anyMatch(ref -> ref.sourceKind() == OplToken.SourceKind.FACT
                && "collection_completeness".equals(ref.fieldPath())));
    }

    @Test
    void doesNotEmitCompletenessSourcesForCompleteStructuralLists() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-struct-005-aggregation-object-fan-2-complete-pass.json");

        assertFalse(fixture.generated().artifact().paragraphs().getFirst().sentences().getFirst().tokens().stream()
                .flatMap(token -> token.sourceRefs().stream())
                .anyMatch(ref -> ref.sourceKind() == OplToken.SourceKind.FACT && "collection_completeness".equals(ref.fieldPath())));
        assertFalse(fixture.generated().traces().getFirst().sourceRefs().stream()
                .anyMatch(ref -> ref.sourceKind() == OplToken.SourceKind.FACT && "collection_completeness".equals(ref.fieldPath())));
    }

    @Test
    void rejectsActiveStructuralListSeparatorWhoseLeftEndpointIsMissing() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-struct-005-aggregation-object-fan-2-complete-pass.json");
        MutatedGeneration mutated = mutateListSeparatorSources(fixture.generated(), ref -> ref.sourceKind() == OplToken.SourceKind.ENDPOINT
                && Integer.valueOf(1).equals(ref.endpointOrdinal()));

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(fixture.revision(), fixture.assets(), mutated.artifact(), mutated.traces()));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void rejectsActiveStructuralListSeparatorWhoseRightEndpointIsMissing() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-struct-005-aggregation-object-fan-2-complete-pass.json");
        MutatedGeneration mutated = mutateListSeparatorSources(fixture.generated(), ref -> ref.sourceKind() == OplToken.SourceKind.ENDPOINT
                && Integer.valueOf(2).equals(ref.endpointOrdinal()));

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(fixture.revision(), fixture.assets(), mutated.artifact(), mutated.traces()));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void rejectsActiveIncompleteListTailWhoseCompletenessSourceIsMissing() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-struct-005-aggregation-object-fan-2-incomplete-pass.json");
        MutatedGeneration mutated = mutateListSeparatorSources(fixture.generated(), ref -> ref.sourceKind() == OplToken.SourceKind.FACT
                && "collection_completeness".equals(ref.fieldPath()));

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(fixture.revision(), fixture.assets(), mutated.artifact(), mutated.traces()));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void rejectsActiveIncompleteListTailWhoseCompletenessSourceIsWrong() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-struct-005-aggregation-object-fan-2-incomplete-pass.json");
        MutatedGeneration mutated = rewriteListSeparatorSources(fixture.generated(), ref -> ref.sourceKind() == OplToken.SourceKind.FACT
                && "collection_completeness".equals(ref.fieldPath()), ref -> new OplToken.SourceRef(
                ref.sourceKind(), ref.stableId(), "source.source_kind", ref.endpointOrdinal(), ref.sentenceSlot()));

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(fixture.revision(), fixture.assets(), mutated.artifact(), mutated.traces()));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void rejectsActiveTraceWithAnUnfoundedButWellFormedCatalogSource() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-proc-001-consumption-object-pass.json");
        OplTextTrace source = fixture.generated().traces().getFirst();
        OplToken.SourceRef extra = new OplToken.SourceRef(OplToken.SourceKind.FACT, source.factIds().getFirst(), "source.source_kind", null, "SINGLE");
        OplTextTrace trace = copyTrace(source, source.tokenRanges(), appendSourceRef(source.sourceRefs(), extra));

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.validateActiveTrace(fixture.revision(), fixture.assets(), fixture.generated().artifact(), List.of(trace)));

        assertEquals(OplGenerationCode.TEXT_TRACE_INCOMPLETE, exception.code());
    }

    @Test
    void emitsStructuralListCommaWithOnlyItsAdjacentEndpoints() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-struct-005-aggregation-object-fan-3-complete-pass.json");
        OplToken comma = fixture.generated().artifact().paragraphs().getFirst().sentences().getFirst().tokens().stream()
                .filter(token -> token.kind() == OplToken.Kind.PUNCTUATION && ",".equals(token.text())).findFirst().orElseThrow();

        assertEquals(List.of(1, 2), tokenEndpointOrdinals(comma));
    }

    @Test
    void emitsMixedGroupSeparatorWithBoundaryEndpoints() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-struct-006-characterization-object-mixed-a1-o2-complete-pass.json");
        OplToken separator = fixture.generated().artifact().paragraphs().getFirst().sentences().getFirst().tokens().stream()
                .filter(token -> token.kind() == OplToken.Kind.LIST_SEPARATOR && "as well as".equals(token.text())).findFirst().orElseThrow();

        assertEquals(List.of(1, 2), tokenEndpointOrdinals(separator));
    }

    @Test
    void emitsDurationKeywordWithItsModifierSourceAndTokenRange() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-proc-015-overtime-duration-pass.json");
        OplSentence sentence = fixture.generated().artifact().paragraphs().getFirst().sentences().getFirst();
        OplToken duration = sentence.tokens().stream().filter(token -> "PT2H".equals(token.text())).findFirst().orElseThrow();

        assertTrue(duration.sourceRefs().stream().anyMatch(ref -> ref.sourceKind() == OplToken.SourceKind.MODIFIER
                && "duration".equals(ref.stableId()) && "value".equals(ref.fieldPath())));
        assertTrue(fixture.generated().traces().getFirst().tokenRanges().stream().anyMatch(range -> "duration".equals(range.inputId())
                && range.startUtf8Byte() == duration.startUtf8Byte() && range.endUtf8Byte() == duration.endUtf8Byte()));
    }

    @Test
    void emitsSelfInvocationKeywordWithItsFactEndpointAndRuleSources() {
        ActiveGenerationFixture fixture = activeGenerationFixture("g-opl-proc-014-self-invocation-same-process-pass.json");
        OplToken itself = fixture.generated().artifact().paragraphs().getFirst().sentences().getFirst().tokens().stream()
                .filter(token -> "itself".equals(token.text())).findFirst().orElseThrow();

        assertTrue(itself.sourceRefs().stream().anyMatch(ref -> ref.sourceKind() == OplToken.SourceKind.FACT));
        assertTrue(itself.sourceRefs().stream().anyMatch(ref -> ref.sourceKind() == OplToken.SourceKind.RULE));
        assertEquals(List.of(0, 1), tokenEndpointOrdinals(itself));
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
    void replacesBaseConsumptionWithTheFrozenTransformingEventSentence() {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact source = revision.facts().getFirst();
        SemanticRevision.Fact controlled = new SemanticRevision.Fact(
                source.id(), source.family(), new SemanticRevision.CapabilityReference(
                "CAP-ISO-PROC-001", source.capability().profileId(), source.capability().profileVersion()),
                source.endpoints(), source.direction(), List.of(
                new SemanticRevision.Modifier("control.capability", "CAP-ISO-CTRL-001"),
                new SemanticRevision.Modifier("control.segment", "PROCESS_INPUT")), source.source(), source.normalization());
        SemanticRevision candidate = copy(revision, List.of(controlled), revision.contexts(), revision.occurrences());
        OplGrammar grammar = new OplGrammar(binding(candidate), List.of(
                new OplGrammar.Template("opl.control.event.transforming.consumption.v1", 300)));

        OplGenerationResult result = service.generate(candidate, "context.sd.root", grammar);

        assertEquals("Raw Material initiates Processing, which consumes Raw Material.",
                result.artifact().paragraphs().getFirst().sentences().getFirst().text());
        assertEquals(List.of("opl.control.event.transforming.consumption.v1"),
                result.artifact().paragraphs().getFirst().sentences().getFirst().generationRuleIds());
        assertTrue(result.traces().getFirst().sourceRefs().stream().anyMatch(ref -> ref.sourceKind() == OplToken.SourceKind.MODIFIER
                && "control.capability".equals(ref.stableId()) && "value".equals(ref.fieldPath())));
        assertTrue(result.traces().getFirst().sourceRefs().stream().anyMatch(ref -> ref.sourceKind() == OplToken.SourceKind.MODIFIER
                && "control.segment".equals(ref.stableId()) && "value".equals(ref.fieldPath())));
        assertTrue(result.traces().getFirst().sourceRefs().stream().anyMatch(ref -> ref.sourceKind() == OplToken.SourceKind.CAPABILITY
                && "CAP-ISO-CTRL-001".equals(ref.stableId()) && "modifiers[modifier_id=control.capability].value".equals(ref.fieldPath())));
    }

    @ParameterizedTest(name = "{0} on {1}")
    @MethodSource("controlCases")
    void generatesAllTwentyFrozenControlCompositions(String controlCapability, String baseCapability, String templateId, String expectedText) {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact fact = controlFact(revision, controlCapability, baseCapability);
        SemanticRevision candidate = revisionWithFactOccurrence(revision, fact);
        OplGrammar grammar = new OplGrammar(binding(candidate), List.of(new OplGrammar.Template(templateId, 300)));

        OplGenerationResult result = service.generate(candidate, "context.sd.root", grammar);

        OplSentence sentence = result.artifact().paragraphs().getFirst().sentences().getFirst();
        assertEquals(expectedText, sentence.text());
        assertEquals(List.of(templateId), sentence.generationRuleIds());
        assertEquals(List.of(fact.id()), sentence.inputFactIds());
        assertTrue(result.traces().getFirst().sourceRefs().stream().anyMatch(ref -> ref.sourceKind() == OplToken.SourceKind.MODIFIER
                && "value".equals(ref.fieldPath())));
        assertTrue(result.traces().getFirst().sourceRefs().stream().anyMatch(ref -> ref.sourceKind() == OplToken.SourceKind.CAPABILITY
                && controlCapability.equals(ref.stableId())));
    }

    @Test
    void preservesLegacyProceduralTextWhenAControlTemplateIsNotPublished() {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact source = revision.facts().getFirst();
        SemanticRevision.Fact controlled = new SemanticRevision.Fact(
                source.id(), source.family(), source.capability(), source.endpoints(), source.direction(), List.of(
                new SemanticRevision.Modifier("control.capability", "CAP-ISO-CTRL-001"),
                new SemanticRevision.Modifier("control.segment", "PROCESS_INPUT")), source.source(), source.normalization());

        OplGenerationResult result = service.generate(
                copy(revision, List.of(controlled), revision.contexts(), revision.occurrences()),
                "context.sd.root",
                grammarWithConsumptionTemplates(revision));

        assertEquals("Processing consumes available Raw Material.",
                result.artifact().paragraphs().getFirst().sentences().getFirst().text());
        assertEquals(List.of("opl.consumption.state.v1"),
                result.artifact().paragraphs().getFirst().sentences().getFirst().generationRuleIds());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("proceduralCanonicalCases")
    void generatesAllFrozenProceduralCanonicalTexts(
            String caseId,
            SemanticRevision.Fact fact,
            String templateId,
            String expectedText) {
        SemanticRevision revision = fixture();
        SemanticRevision candidate = revisionWithFactOccurrence(revision, fact);
        OplGrammar grammar = new OplGrammar(binding(candidate), List.of(new OplGrammar.Template(templateId, 300)));

        OplGenerationResult result = service.generate(candidate, candidate.rootContextId(), grammar);

        OplSentence sentence = result.artifact().paragraphs().getFirst().sentences().getFirst();
        assertEquals(expectedText, sentence.text());
        assertEquals(List.of(templateId), sentence.generationRuleIds());
        assertEquals(List.of(fact.id()), sentence.inputFactIds());
    }

    @Test
    void rejectsMissingExceptionDurationWithStableInvalidArgument() {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact source = revision.facts().getFirst();
        SemanticRevision.Fact invalid = new SemanticRevision.Fact(
                "fact.exception.duration.missing", SemanticRevision.FactFamily.PROFILE_FACT,
                new SemanticRevision.CapabilityReference("CAP-ISO-PROC-015", source.capability().profileId(), source.capability().profileVersion()),
                List.of(endpoint("MONITORED_PROCESS", "element.processing", 0), endpoint("HANDLING_PROCESS", "element.processing", 1)),
                SemanticRevision.Direction.DIRECTED, List.of(), source.source(), source.normalization());
        SemanticRevision candidate = revisionWithFactOccurrence(revision, invalid);
        OplGrammar grammar = new OplGrammar(binding(candidate), List.of(new OplGrammar.Template("opl.exception.overtime.v1", 300)));

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.generate(candidate, candidate.rootContextId(), grammar));

        assertEquals(OplGenerationCode.INVALID_ARGUMENT, exception.code());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidProceduralEndpointCases")
    void rejectsFrozenProceduralEndpointKindMismatches(
            String caseId,
            String capabilityId,
            String templateId,
            List<SemanticRevision.Endpoint> endpoints) {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact source = revision.facts().getFirst();
        SemanticRevision.Fact invalid = new SemanticRevision.Fact(
                "fact.invalid." + caseId, source.family(),
                new SemanticRevision.CapabilityReference(capabilityId, source.capability().profileId(), source.capability().profileVersion()),
                endpoints, SemanticRevision.Direction.DIRECTED, List.of(), source.source(), source.normalization());
        SemanticRevision candidate = copy(revision, List.of(invalid), revision.contexts(), revision.occurrences());
        OplGrammar grammar = new OplGrammar(binding(candidate), List.of(new OplGrammar.Template(templateId, 300)));

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.generate(candidate, candidate.rootContextId(), grammar));

        assertEquals(OplGenerationCode.ENDPOINT_KIND_MISMATCH, exception.code());
    }

    @Test
    void rejectsSelfInvocationAcrossDifferentProcesses() {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact source = revision.facts().getFirst();
        SemanticRevision.Element process = revision.elements().stream()
                .filter(element -> element.id().equals("element.processing")).findFirst().orElseThrow();
        SemanticRevision.Element differentProcess = new SemanticRevision.Element(
                "element.handling", SemanticRevision.CoreKind.PROCESS, process.capability(),
                new SemanticRevision.QualifiedName(process.name().namespace(), "Handling"), List.of(), process.source(), process.normalization());
        SemanticRevision.Fact invalid = new SemanticRevision.Fact(
                "fact.invalid.self.invocation", SemanticRevision.FactFamily.PROFILE_FACT,
                new SemanticRevision.CapabilityReference("CAP-ISO-PROC-014", source.capability().profileId(), source.capability().profileVersion()),
                List.of(
                        invalidProceduralEndpoint("self.invoking", "INVOKING_PROCESS", "element.processing", 0),
                        invalidProceduralEndpoint("self.invoked", "INVOKED_PROCESS", "element.handling", 1)),
                SemanticRevision.Direction.DIRECTED, List.of(), source.source(), source.normalization());
        List<SemanticRevision.Element> elements = new ArrayList<>(revision.elements());
        elements.add(differentProcess);
        SemanticRevision candidate = new SemanticRevision(revision.revisionId(), revision.modelId(), revision.revisionSequence(), revision.profileBinding(),
                revision.rootContextId(), elements, revision.states(), List.of(invalid), revision.contexts(), revision.occurrences(), revision.layouts());
        OplGrammar grammar = new OplGrammar(binding(candidate), List.of(new OplGrammar.Template("opl.invocation.self.v1", 300)));

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.generate(candidate, candidate.rootContextId(), grammar));

        assertEquals(OplGenerationCode.ENDPOINT_KIND_MISMATCH, exception.code());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("blockedControlCases")
    void blocksEveryFrozenInvalidControlComposition(
            String caseId,
            String baseCapability,
            List<SemanticRevision.Modifier> modifiers) {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact source = revision.facts().getFirst();
        SemanticRevision.Fact invalid = new SemanticRevision.Fact(
                source.id(), source.family(), new SemanticRevision.CapabilityReference(
                baseCapability, source.capability().profileId(), source.capability().profileVersion()),
                source.endpoints(), source.direction(), modifiers, source.source(), source.normalization());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.generate(copy(revision, List.of(invalid), revision.contexts(), revision.occurrences()),
                        "context.sd.root", grammarWithConsumptionTemplates(revision)));

        assertEquals(OplGenerationCode.MODIFIER_COMBINATION_INVALID, exception.code());
    }

    @Test
    void rejectsAnIndependentControlFact() {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact source = revision.facts().getFirst();
        SemanticRevision.Fact invalid = new SemanticRevision.Fact(
                "fact.invalid.independent.control", SemanticRevision.FactFamily.CONTROL,
                new SemanticRevision.CapabilityReference("CAP-ISO-CTRL-001", source.capability().profileId(), source.capability().profileVersion()),
                source.endpoints(), source.direction(), List.of(), source.source(), source.normalization());

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.generate(revisionWithFactOccurrence(revision, invalid), "context.sd.root", grammarWithConsumptionTemplates(revision)));

        assertEquals(OplGenerationCode.MODIFIER_COMBINATION_INVALID, exception.code());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("sameKindStructuralCases")
    void generatesFrozenSameKindStructuralSentencesAndTraceSlots(
            String caseId,
            String capabilityId,
            String sourceId,
            String targetId,
            String targetName,
            SemanticRevision.Direction direction,
            List<SemanticRevision.Label> labels,
            List<String> expectedSentences,
            List<String> expectedTemplates,
            List<String> expectedSlots) {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact source = revision.facts().getFirst();
        OplGenerationResult result = binaryStructuralResult(revision, source, caseId, capabilityId, sourceId, targetId, targetName, direction, labels);

        assertEquals(expectedSentences,
                result.artifact().paragraphs().getFirst().sentences().stream().map(OplSentence::text).toList());
        assertEquals(expectedTemplates,
                result.artifact().paragraphs().getFirst().sentences().stream().map(OplSentence::generationRuleIds).map(List::getFirst).toList());
        assertEquals(expectedSentences.size(), result.traces().size());
        for (int index = 0; index < result.traces().size(); index++) {
            OplTextTrace trace = result.traces().get(index);
            String expectedSlot = expectedSlots.get(index);
            assertEquals(List.of("fact.structural." + caseId.toLowerCase()), trace.factIds());
            assertTrue(trace.sourceRefs().stream().anyMatch(ref -> expectedSlot.equals(ref.sentenceSlot())));
        }
    }

    @Test
    void rejectsTaggedStructuralRelationsBetweenObjectAndProcess() {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact source = revision.facts().getFirst();
        SemanticRevision.Fact structural = new SemanticRevision.Fact(
                "fact.structural.mixed", SemanticRevision.FactFamily.STRUCTURAL,
                new SemanticRevision.CapabilityReference("CAP-ISO-STRUCT-001", source.capability().profileId(), source.capability().profileVersion()),
                List.of(
                        new SemanticRevision.Endpoint("endpoint.structural.mixed.source", "STRUCTURAL_SOURCE", SemanticRevision.TargetKind.ELEMENT, "element.raw.material", 0, null),
                        new SemanticRevision.Endpoint("endpoint.structural.mixed.target", "STRUCTURAL_TARGET", SemanticRevision.TargetKind.ELEMENT, "element.processing", 1, null)),
                SemanticRevision.Direction.DIRECTED, List.of(), List.of(new SemanticRevision.Label("forward_tag", "feeds")),
                SemanticRevision.CollectionCompleteness.NOT_APPLICABLE, source.source(), source.normalization());
        SemanticRevision candidate = revisionWithFactOccurrence(revision, structural);
        OplGrammar grammar = new OplGrammar(binding(candidate), List.of(
                new OplGrammar.Template("opl.structural.tagged.unidirectional.v1", "CAP-ISO-STRUCT-001", 200, "SINGLE", "{Source} {forward-tag} {Destination}.")));

        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> service.generate(candidate, "context.sd.root", grammar));

        assertEquals(OplGenerationCode.ENDPOINT_KIND_MISMATCH, exception.code());
    }

    @Test
    void generatesFrozenAggregationListsForOneTwoAndThreeMembers() {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact source = revision.facts().getFirst();
        List<SemanticRevision.Element> elements = new ArrayList<>(revision.elements());
        elements.add(structuralObject(source, "element.part.one", "Part One"));
        elements.add(structuralObject(source, "element.part.two", "Part Two"));
        elements.add(structuralObject(source, "element.part.three", "Part Three"));

        assertEquals("Raw Material consists of Part One.", aggregationText(revision, elements, source, "fact.aggregation.one",
                List.of("element.part.one"), SemanticRevision.CollectionCompleteness.COMPLETE));
        assertEquals("Raw Material consists of Part One and Part Two.", aggregationText(revision, elements, source, "fact.aggregation.two",
                List.of("element.part.one", "element.part.two"), SemanticRevision.CollectionCompleteness.COMPLETE));
        assertEquals("Raw Material consists of Part One, Part Two and Part Three and at least one other part.", aggregationText(revision, elements, source, "fact.aggregation.three",
                List.of("element.part.one", "element.part.two", "element.part.three"), SemanticRevision.CollectionCompleteness.INCOMPLETE));
    }

    @Test
    void generatesFrozenCharacterizationAttributeOperationAndMixedVariants() {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact source = revision.facts().getFirst();
        SemanticRevision.Feature temperature = new SemanticRevision.Feature("feature.raw.temperature", "element.raw.material", SemanticRevision.FeatureKind.ATTRIBUTE,
                source.capability(), new SemanticRevision.QualifiedName("urn:opm:test", "temperature"), source.source(), source.normalization());
        SemanticRevision.Feature calibrate = new SemanticRevision.Feature("feature.raw.calibrate", "element.raw.material", SemanticRevision.FeatureKind.OPERATION,
                source.capability(), new SemanticRevision.QualifiedName("urn:opm:test", "calibrate"), source.source(), source.normalization());

        assertEquals("Raw Material exhibits temperature.", characterizationText(revision, source, "fact.characterization.attribute.complete",
                List.of(temperature), List.of(temperature.id()), SemanticRevision.CollectionCompleteness.COMPLETE));
        assertEquals("Raw Material exhibits temperature, and at least one other attribute.", characterizationText(revision, source, "fact.characterization.attribute.incomplete",
                List.of(temperature), List.of(temperature.id()), SemanticRevision.CollectionCompleteness.INCOMPLETE));
        assertEquals("Raw Material exhibits calibrate.", characterizationText(revision, source, "fact.characterization.operation.complete",
                List.of(calibrate), List.of(calibrate.id()), SemanticRevision.CollectionCompleteness.COMPLETE));
        assertEquals("Raw Material exhibits calibrate, and at least one other operator.", characterizationText(revision, source, "fact.characterization.operation.incomplete",
                List.of(calibrate), List.of(calibrate.id()), SemanticRevision.CollectionCompleteness.INCOMPLETE));
        assertEquals("Raw Material exhibits temperature, as well as calibrate.", characterizationText(revision, source, "fact.characterization.mixed.complete",
                List.of(temperature, calibrate), List.of(temperature.id(), calibrate.id()), SemanticRevision.CollectionCompleteness.COMPLETE));
        assertEquals("Raw Material exhibits temperature, and at least one other attribute, as well as calibrate, and at least one other operator.", characterizationText(revision, source, "fact.characterization.mixed.incomplete",
                List.of(temperature, calibrate), List.of(temperature.id(), calibrate.id()), SemanticRevision.CollectionCompleteness.INCOMPLETE));
    }

    @Test
    void generatesExplicitExhibitionOnlyForTheFrozenProductionTuple() {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact source = revision.facts().getFirst();
        SemanticRevision.Feature temperature = new SemanticRevision.Feature("feature.raw.temperature", "element.raw.material", SemanticRevision.FeatureKind.ATTRIBUTE,
                source.capability(), new SemanticRevision.QualifiedName("urn:opm:test", "temperature"), source.source(), source.normalization());
        SemanticRevision.Feature calibrate = new SemanticRevision.Feature("feature.raw.calibrate", "element.raw.material", SemanticRevision.FeatureKind.OPERATION,
                source.capability(), new SemanticRevision.QualifiedName("urn:opm:test", "calibrate"), source.source(), source.normalization());

        OplGenerationResult result = exhibitionResult(revision, source, "fact.exhibition.object", "element.raw.material", List.of(temperature, calibrate));

        assertEquals("temperature of Raw Material is calibrate.", result.artifact().paragraphs().getFirst().sentences().getFirst().text());
        assertEquals(List.of("opl.structural.exhibition.v1"), result.artifact().paragraphs().getFirst().sentences().getFirst().generationRuleIds());
        assertTrue(result.traces().getFirst().sourceRefs().stream().anyMatch(ref -> "source.source_kind".equals(ref.fieldPath())));
        assertTrue(result.traces().getFirst().sourceRefs().stream().anyMatch(ref -> "source.source_entity_id".equals(ref.fieldPath())));
    }

    @Test
    void ordersMixedCharacterizationByExhibitorThingKind() {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact source = revision.facts().getFirst();
        SemanticRevision.Feature attribute = new SemanticRevision.Feature("feature.processing.priority", "element.processing", SemanticRevision.FeatureKind.ATTRIBUTE,
                source.capability(), new SemanticRevision.QualifiedName("urn:opm:test", "priority"), source.source(), source.normalization());
        SemanticRevision.Feature operation = new SemanticRevision.Feature("feature.processing.calibrate", "element.processing", SemanticRevision.FeatureKind.OPERATION,
                source.capability(), new SemanticRevision.QualifiedName("urn:opm:test", "calibrate"), source.source(), source.normalization());

        assertEquals("Processing exhibits calibrate, as well as priority.", characterizationTextFor(revision, source,
                "fact.characterization.process.mixed", "element.processing", List.of(attribute, operation), List.of(attribute.id(), operation.id()),
                SemanticRevision.CollectionCompleteness.COMPLETE));
    }

    @Test
    void generatesFrozenGeneralizationObjectProcessAndCompletenessVariants() {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact source = revision.facts().getFirst();
        List<SemanticRevision.Element> elements = new ArrayList<>(revision.elements());
        elements.add(structuralObject(source, "element.special.one", "Special Material"));
        elements.add(structuralObject(source, "element.special.two", "Refined Material"));
        elements.add(structuralProcess(source, "element.refining", "Refining Process"));

        assertEquals("Special Material is a Raw Material.", generalizationText(revision, elements, source, "fact.generalization.object.single",
                "element.raw.material", List.of("element.special.one"), SemanticRevision.CollectionCompleteness.COMPLETE));
        assertEquals("Refining Process is Processing.", generalizationText(revision, elements, source, "fact.generalization.process.single",
                "element.processing", List.of("element.refining"), SemanticRevision.CollectionCompleteness.COMPLETE));
        assertEquals("Special Material and Refined Material are Raw Material.", generalizationText(revision, elements, source, "fact.generalization.object.multiple",
                "element.raw.material", List.of("element.special.one", "element.special.two"), SemanticRevision.CollectionCompleteness.COMPLETE));
        assertEquals("Special Material and other specializations are Raw Material.", generalizationText(revision, elements, source, "fact.generalization.object.incomplete",
                "element.raw.material", List.of("element.special.one"), SemanticRevision.CollectionCompleteness.INCOMPLETE));
        assertThrows(OplGenerationException.class, () -> generalizationText(revision, elements, source, "fact.generalization.mixed",
                "element.raw.material", List.of("element.refining"), SemanticRevision.CollectionCompleteness.COMPLETE));
    }

    @Test
    void generatesStateCharacterizationOnlyForAnObjectsOwnedAttributeValueState() {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact source = revision.facts().getFirst();
        SemanticRevision.Feature attribute = new SemanticRevision.Feature("feature.raw.temperature", "element.raw.material", SemanticRevision.FeatureKind.ATTRIBUTE,
                source.capability(), new SemanticRevision.QualifiedName("urn:opm:test", "temperature"), source.source(), source.normalization());
        SemanticRevision.State valueState = new SemanticRevision.State("state.raw.temperature.high", SemanticRevision.TargetKind.FEATURE, attribute.id(), source.capability(),
                new SemanticRevision.QualifiedName("urn:opm:test", "high"), List.of(), source.source(), source.normalization());
        SemanticRevision.Fact valid = stateCharacterizationFact(source, "fact.state.characterization.valid", SemanticRevision.TargetKind.ELEMENT, "element.raw.material", valueState.id());

        OplGenerationResult result = stateCharacterizationResult(revision, valid, List.of(attribute), List.of(valueState));

        assertEquals("Raw Material exhibits high temperature.", result.artifact().paragraphs().getFirst().sentences().getFirst().text());
        assertEquals(List.of("opl.structural.characterization.state.v1"), result.artifact().paragraphs().getFirst().sentences().getFirst().generationRuleIds());
        assertTrue(result.traces().getFirst().inputElementIds().contains("element.raw.material"));
        assertThrows(OplGenerationException.class, () -> stateCharacterizationResult(revision,
                stateCharacterizationFact(source, "fact.state.characterization.process", SemanticRevision.TargetKind.ELEMENT, "element.processing", valueState.id()),
                List.of(attribute), List.of(valueState)));
        assertThrows(OplGenerationException.class, () -> stateCharacterizationResult(revision,
                stateCharacterizationFact(source, "fact.state.characterization.state", SemanticRevision.TargetKind.STATE, valueState.id(), valueState.id()),
                List.of(attribute), List.of(valueState)));
        SemanticRevision.Feature operation = new SemanticRevision.Feature(attribute.id(), attribute.ownerElementId(), SemanticRevision.FeatureKind.OPERATION,
                attribute.capability(), attribute.name(), attribute.source(), attribute.normalization());
        assertThrows(OplGenerationException.class, () -> stateCharacterizationResult(revision, valid, List.of(operation), List.of(valueState)));
        SemanticRevision.Feature foreignAttribute = new SemanticRevision.Feature(attribute.id(), "element.processing", SemanticRevision.FeatureKind.ATTRIBUTE,
                attribute.capability(), attribute.name(), attribute.source(), attribute.normalization());
        OplGenerationException exception = assertThrows(OplGenerationException.class,
                () -> stateCharacterizationResult(revision, valid, List.of(foreignAttribute), List.of(valueState)));
        assertEquals(OplGenerationCode.STATE_OWNER_MISMATCH, exception.code());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("stateTaggedCases")
    void generatesAllFrozenStateTaggedInputVariants(
            String caseId,
            SemanticRevision.Direction direction,
            SemanticRevision.TargetKind sourceKind,
            String sourceId,
            SemanticRevision.TargetKind targetKind,
            String targetId,
            List<SemanticRevision.Label> labels,
            List<String> expectedSentences,
            List<String> expectedTemplates,
            List<String> expectedSlots) {
        OplGenerationResult result = stateTaggedResult(fixture(), caseId, direction, sourceKind, sourceId, targetKind, targetId, labels);

        assertEquals(expectedSentences, result.artifact().paragraphs().getFirst().sentences().stream().map(OplSentence::text).toList());
        assertEquals(expectedTemplates, result.artifact().paragraphs().getFirst().sentences().stream()
                .map(OplSentence::generationRuleIds).map(List::getFirst).toList());
        for (int index = 0; index < result.traces().size(); index++) {
            String expectedSlot = expectedSlots.get(index);
            assertTrue(result.traces().get(index).sourceRefs().stream().anyMatch(ref -> expectedSlot.equals(ref.sentenceSlot())));
        }
    }

    @Test
    void rejectsProcessesForStateTaggedStructuralGeneration() {
        assertThrows(OplGenerationException.class, () -> stateTaggedResult(fixture(), "process_source", SemanticRevision.Direction.DIRECTED,
                SemanticRevision.TargetKind.ELEMENT, "element.processing", SemanticRevision.TargetKind.ELEMENT, "element.refined.material",
                List.of(new SemanticRevision.Label("forward_tag", "feeds"))));
    }

    @Test
    void generatesFrozenClassificationSingleAndMultipleInstancesAndRejectsCompleteness() {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact source = revision.facts().getFirst();
        List<SemanticRevision.Element> elements = new ArrayList<>(revision.elements());
        elements.add(structuralObject(source, "element.instance.one", "Instance One"));
        elements.add(structuralObject(source, "element.instance.two", "Instance Two"));

        assertEquals("Instance One is an instance of Raw Material.", classificationText(revision, elements, source,
                "fact.classification.one", List.of("element.instance.one"), SemanticRevision.CollectionCompleteness.NOT_APPLICABLE));
        assertEquals("Instance One and Instance Two are instances of Raw Material.", classificationText(revision, elements, source,
                "fact.classification.two", List.of("element.instance.one", "element.instance.two"), SemanticRevision.CollectionCompleteness.NOT_APPLICABLE));
        assertThrows(OplGenerationException.class, () -> classificationText(revision, elements, source,
                "fact.classification.invalid", List.of("element.instance.one"), SemanticRevision.CollectionCompleteness.COMPLETE));
    }

    @Test
    void omitsStructuralTextForTheLegacyGrammar() {
        SemanticRevision revision = fixture();
        SemanticRevision.Fact source = revision.facts().getFirst();
        SemanticRevision.Fact structural = new SemanticRevision.Fact(
                "fact.structural.unidirectional", SemanticRevision.FactFamily.STRUCTURAL,
                new SemanticRevision.CapabilityReference("CAP-ISO-STRUCT-002", source.capability().profileId(), source.capability().profileVersion()),
                List.of(
                        new SemanticRevision.Endpoint("endpoint.structural.source", "STRUCTURAL_SOURCE", SemanticRevision.TargetKind.ELEMENT, "element.raw.material", 0, null),
                        new SemanticRevision.Endpoint("endpoint.structural.target", "STRUCTURAL_TARGET", SemanticRevision.TargetKind.ELEMENT, "element.processing", 1, null)),
                SemanticRevision.Direction.DIRECTED, source.source(), source.normalization());
        SemanticRevision.Context root = revision.contexts().getFirst();
        SemanticRevision.Context expandedRoot = new SemanticRevision.Context(root.id(), root.kind(), root.capability(), root.name(),
                List.of("occurrence.raw.material", "occurrence.processing", "occurrence.structural"), root.source());
        List<SemanticRevision.Occurrence> occurrences = new ArrayList<>(revision.occurrences());
        occurrences.add(new SemanticRevision.Occurrence("occurrence.structural", root.id(), SemanticRevision.TargetKind.FACT, structural.id(),
                SemanticRevision.OccurrenceOwnership.OWNED, "STRUCTURAL_LINK", "layout.consumption"));

        OplGenerationResult result = service.generate(
                copy(revision, List.of(structural), List.of(expandedRoot), occurrences),
                "context.sd.root",
                grammarWithConsumptionTemplates(revision));

        assertTrue(result.artifact().paragraphs().getFirst().sentences().isEmpty());
        assertTrue(result.traces().isEmpty());
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

    private static Stream<Arguments> controlCases() {
        return Stream.of(
                Arguments.of("CAP-ISO-CTRL-001", "CAP-ISO-PROC-001", "opl.control.event.transforming.consumption.v1", "Raw Material initiates Processing, which consumes Raw Material."),
                Arguments.of("CAP-ISO-CTRL-001", "CAP-ISO-PROC-003", "opl.control.event.transforming.effect.v1", "Raw Material initiates Processing, which affects Raw Material."),
                Arguments.of("CAP-ISO-CTRL-002", "CAP-ISO-PROC-004", "opl.control.event.enabling.agent.v1", "Raw Material initiates and handles Processing."),
                Arguments.of("CAP-ISO-CTRL-002", "CAP-ISO-PROC-005", "opl.control.event.enabling.instrument.v1", "Raw Material initiates Processing, which requires Raw Material."),
                Arguments.of("CAP-ISO-CTRL-003", "CAP-ISO-PROC-006", "opl.control.event.transforming.state.consumption.v1", "available Raw Material initiates Processing, which consumes Raw Material."),
                Arguments.of("CAP-ISO-CTRL-003", "CAP-ISO-PROC-008", "opl.control.event.transforming.state.effect.input-output.v1", "available Raw Material initiates Processing, which changes Raw Material from available to available."),
                Arguments.of("CAP-ISO-CTRL-003", "CAP-ISO-PROC-009", "opl.control.event.transforming.state.effect.input.v1", "available Raw Material initiates Processing, which changes Raw Material from available."),
                Arguments.of("CAP-ISO-CTRL-003", "CAP-ISO-PROC-010", "opl.control.event.transforming.state.effect.output.v1", "Raw Material in any state initiates Processing, which changes Raw Material to available."),
                Arguments.of("CAP-ISO-CTRL-004", "CAP-ISO-PROC-011", "opl.control.event.enabling.state.agent.v1", "available Raw Material initiates and handles Processing."),
                Arguments.of("CAP-ISO-CTRL-004", "CAP-ISO-PROC-012", "opl.control.event.enabling.state.instrument.v1", "available Raw Material initiates Processing, which requires available Raw Material."),
                Arguments.of("CAP-ISO-CTRL-005", "CAP-ISO-PROC-001", "opl.control.condition.transforming.consumption.v1", "Processing occurs if Raw Material exists, in which case Raw Material is consumed, otherwise Processing is skipped."),
                Arguments.of("CAP-ISO-CTRL-005", "CAP-ISO-PROC-003", "opl.control.condition.transforming.effect.v1", "Processing occurs if Raw Material exists, in which case Processing affects Raw Material, otherwise Processing is skipped."),
                Arguments.of("CAP-ISO-CTRL-006", "CAP-ISO-PROC-004", "opl.control.condition.enabling.agent.v1", "Processing occurs if Raw Material exists, else Processing is skipped."),
                Arguments.of("CAP-ISO-CTRL-006", "CAP-ISO-PROC-005", "opl.control.condition.enabling.instrument.v1", "Processing occurs if Raw Material exists, else Processing is skipped."),
                Arguments.of("CAP-ISO-CTRL-007", "CAP-ISO-PROC-006", "opl.control.condition.transforming.state.consumption.v1", "Processing occurs if Raw Material is available, in which case Raw Material is consumed, otherwise Processing is skipped."),
                Arguments.of("CAP-ISO-CTRL-007", "CAP-ISO-PROC-008", "opl.control.condition.transforming.state.effect.input-output.v1", "Processing occurs if there is available Raw Material, in which case Processing changes Raw Material from available to available, else Processing is skipped."),
                Arguments.of("CAP-ISO-CTRL-007", "CAP-ISO-PROC-009", "opl.control.condition.transforming.state.effect.input.v1", "Processing occurs if there is available Raw Material in which case Processing changes Raw Material from available, else Processing is skipped."),
                Arguments.of("CAP-ISO-CTRL-007", "CAP-ISO-PROC-010", "opl.control.condition.transforming.state.effect.output.v1", "Processing occurs if Raw Material exists, in which case Processing changes Raw Material to available, otherwise Processing is skipped."),
                Arguments.of("CAP-ISO-CTRL-008", "CAP-ISO-PROC-011", "opl.control.condition.enabling.state.agent.v1", "Processing occurs if available Raw Material exists, else Processing is skipped."),
                Arguments.of("CAP-ISO-CTRL-008", "CAP-ISO-PROC-012", "opl.control.condition.enabling.state.instrument.v1", "Processing occurs if available Raw Material exists, else Processing is skipped."));
    }

    private static Stream<Arguments> sameKindStructuralCases() {
        return Stream.of(
                Arguments.of("001_object_tagged", "CAP-ISO-STRUCT-001", "element.raw.material", "element.structural.object.target", "Refined Material",
                        SemanticRevision.Direction.DIRECTED, List.of(new SemanticRevision.Label("forward_tag", "feeds")),
                        List.of("Raw Material feeds Refined Material."), List.of("opl.structural.tagged.unidirectional.v1"), List.of("SINGLE")),
                Arguments.of("001_process_tagged", "CAP-ISO-STRUCT-001", "element.processing", "element.structural.process.target", "Refining Process",
                        SemanticRevision.Direction.DIRECTED, List.of(new SemanticRevision.Label("forward_tag", "precedes")),
                        List.of("Processing precedes Refining Process."), List.of("opl.structural.tagged.unidirectional.v1"), List.of("SINGLE")),
                Arguments.of("002_object_null_tagged", "CAP-ISO-STRUCT-002", "element.raw.material", "element.structural.object.target", "Refined Material",
                        SemanticRevision.Direction.DIRECTED, List.of(),
                        List.of("Raw Material relates to Refined Material."), List.of("opl.structural.null-tagged.unidirectional.v1"), List.of("SINGLE")),
                Arguments.of("002_process_null_tagged", "CAP-ISO-STRUCT-002", "element.processing", "element.structural.process.target", "Refining Process",
                        SemanticRevision.Direction.DIRECTED, List.of(),
                        List.of("Processing relates to Refining Process."), List.of("opl.structural.null-tagged.unidirectional.v1"), List.of("SINGLE")),
                Arguments.of("003_object_bidirectional", "CAP-ISO-STRUCT-003", "element.raw.material", "element.structural.object.target", "Refined Material",
                        SemanticRevision.Direction.BIDIRECTIONAL, List.of(new SemanticRevision.Label("forward_tag", "feeds"), new SemanticRevision.Label("reverse_tag", "depends on")),
                        List.of("Raw Material feeds Refined Material.", "Refined Material depends on Raw Material."),
                        List.of("opl.structural.tagged.bidirectional.forward.v1", "opl.structural.tagged.bidirectional.reverse.v1"), List.of("FORWARD", "REVERSE")),
                Arguments.of("003_process_bidirectional", "CAP-ISO-STRUCT-003", "element.processing", "element.structural.process.target", "Refining Process",
                        SemanticRevision.Direction.BIDIRECTIONAL, List.of(new SemanticRevision.Label("forward_tag", "triggers"), new SemanticRevision.Label("reverse_tag", "precedes")),
                        List.of("Processing triggers Refining Process.", "Refining Process precedes Processing."),
                        List.of("opl.structural.tagged.bidirectional.forward.v1", "opl.structural.tagged.bidirectional.reverse.v1"), List.of("FORWARD", "REVERSE")),
                Arguments.of("004_object_reciprocal_tagged", "CAP-ISO-STRUCT-004", "element.raw.material", "element.structural.object.target", "Refined Material",
                        SemanticRevision.Direction.BIDIRECTIONAL, List.of(new SemanticRevision.Label("reciprocal", "connected")),
                        List.of("Raw Material and Refined Material are connected."), List.of("opl.structural.tagged.reciprocal.v1"), List.of("RECIPROCAL")),
                Arguments.of("004_process_reciprocal_null_tagged", "CAP-ISO-STRUCT-004", "element.processing", "element.structural.process.target", "Refining Process",
                        SemanticRevision.Direction.BIDIRECTIONAL, List.of(),
                        List.of("Processing and Refining Process are related."), List.of("opl.structural.null-tagged.reciprocal.v1"), List.of("RECIPROCAL")));
    }

    private static Stream<Arguments> stateTaggedCases() {
        List<SemanticRevision.Label> forward = List.of(new SemanticRevision.Label("forward_tag", "feeds"));
        List<SemanticRevision.Label> bidirectional = List.of(new SemanticRevision.Label("forward_tag", "feeds"), new SemanticRevision.Label("reverse_tag", "depends on"));
        List<SemanticRevision.Label> reciprocal = List.of(new SemanticRevision.Label("reciprocal_tag", "connected"));
        return Stream.of(
                Arguments.of("directed_source_state_tagged", SemanticRevision.Direction.DIRECTED, SemanticRevision.TargetKind.STATE, "state.raw.available", SemanticRevision.TargetKind.ELEMENT, "element.refined.material", forward,
                        List.of("available Raw Material feeds Refined Material."), List.of("opl.structural.tagged.state.unidirectional.v1"), List.of("SINGLE")),
                Arguments.of("directed_source_state_null", SemanticRevision.Direction.DIRECTED, SemanticRevision.TargetKind.STATE, "state.raw.available", SemanticRevision.TargetKind.ELEMENT, "element.refined.material", List.of(),
                        List.of("available Raw Material relates to Refined Material."), List.of("opl.structural.tagged.state.unidirectional.v1"), List.of("SINGLE")),
                Arguments.of("directed_target_state_tagged", SemanticRevision.Direction.DIRECTED, SemanticRevision.TargetKind.ELEMENT, "element.raw.material", SemanticRevision.TargetKind.STATE, "state.refined.ready", forward,
                        List.of("Raw Material feeds ready Refined Material."), List.of("opl.structural.tagged.state.unidirectional.v1"), List.of("SINGLE")),
                Arguments.of("directed_target_state_null", SemanticRevision.Direction.DIRECTED, SemanticRevision.TargetKind.ELEMENT, "element.raw.material", SemanticRevision.TargetKind.STATE, "state.refined.ready", List.of(),
                        List.of("Raw Material relates to ready Refined Material."), List.of("opl.structural.tagged.state.unidirectional.v1"), List.of("SINGLE")),
                Arguments.of("directed_both_state_tagged", SemanticRevision.Direction.DIRECTED, SemanticRevision.TargetKind.STATE, "state.raw.available", SemanticRevision.TargetKind.STATE, "state.refined.ready", forward,
                        List.of("available Raw Material feeds ready Refined Material."), List.of("opl.structural.tagged.state.unidirectional.v1"), List.of("SINGLE")),
                Arguments.of("directed_both_state_null", SemanticRevision.Direction.DIRECTED, SemanticRevision.TargetKind.STATE, "state.raw.available", SemanticRevision.TargetKind.STATE, "state.refined.ready", List.of(),
                        List.of("available Raw Material relates to ready Refined Material."), List.of("opl.structural.tagged.state.unidirectional.v1"), List.of("SINGLE")),
                Arguments.of("bidirectional_source_state", SemanticRevision.Direction.BIDIRECTIONAL, SemanticRevision.TargetKind.STATE, "state.raw.available", SemanticRevision.TargetKind.ELEMENT, "element.refined.material", bidirectional,
                        List.of("available Raw Material feeds Refined Material.", "Refined Material depends on available Raw Material."),
                        List.of("opl.structural.tagged.state.bidirectional.forward.v1", "opl.structural.tagged.state.bidirectional.reverse.v1"), List.of("FORWARD", "REVERSE")),
                Arguments.of("bidirectional_target_state", SemanticRevision.Direction.BIDIRECTIONAL, SemanticRevision.TargetKind.ELEMENT, "element.raw.material", SemanticRevision.TargetKind.STATE, "state.refined.ready", bidirectional,
                        List.of("Raw Material feeds ready Refined Material.", "ready Refined Material depends on Raw Material."),
                        List.of("opl.structural.tagged.state.bidirectional.forward.v1", "opl.structural.tagged.state.bidirectional.reverse.v1"), List.of("FORWARD", "REVERSE")),
                Arguments.of("bidirectional_both_state", SemanticRevision.Direction.BIDIRECTIONAL, SemanticRevision.TargetKind.STATE, "state.raw.available", SemanticRevision.TargetKind.STATE, "state.refined.ready", bidirectional,
                        List.of("available Raw Material feeds ready Refined Material.", "ready Refined Material depends on available Raw Material."),
                        List.of("opl.structural.tagged.state.bidirectional.forward.v1", "opl.structural.tagged.state.bidirectional.reverse.v1"), List.of("FORWARD", "REVERSE")),
                Arguments.of("reciprocal_source_state_tagged", SemanticRevision.Direction.UNDIRECTED, SemanticRevision.TargetKind.STATE, "state.raw.available", SemanticRevision.TargetKind.ELEMENT, "element.refined.material", reciprocal,
                        List.of("available Raw Material and Refined Material are connected."), List.of("opl.structural.tagged.state.reciprocal.v1"), List.of("RECIPROCAL")),
                Arguments.of("reciprocal_source_state_null", SemanticRevision.Direction.UNDIRECTED, SemanticRevision.TargetKind.STATE, "state.raw.available", SemanticRevision.TargetKind.ELEMENT, "element.refined.material", List.of(),
                        List.of("available Raw Material and Refined Material are related."), List.of("opl.structural.tagged.state.reciprocal.v1"), List.of("RECIPROCAL")),
                Arguments.of("reciprocal_target_state_tagged", SemanticRevision.Direction.UNDIRECTED, SemanticRevision.TargetKind.ELEMENT, "element.raw.material", SemanticRevision.TargetKind.STATE, "state.refined.ready", reciprocal,
                        List.of("Raw Material and ready Refined Material are connected."), List.of("opl.structural.tagged.state.reciprocal.v1"), List.of("RECIPROCAL")),
                Arguments.of("reciprocal_target_state_null", SemanticRevision.Direction.UNDIRECTED, SemanticRevision.TargetKind.ELEMENT, "element.raw.material", SemanticRevision.TargetKind.STATE, "state.refined.ready", List.of(),
                        List.of("Raw Material and ready Refined Material are related."), List.of("opl.structural.tagged.state.reciprocal.v1"), List.of("RECIPROCAL")),
                Arguments.of("reciprocal_both_state_tagged", SemanticRevision.Direction.UNDIRECTED, SemanticRevision.TargetKind.STATE, "state.raw.available", SemanticRevision.TargetKind.STATE, "state.refined.ready", reciprocal,
                        List.of("available Raw Material and ready Refined Material are connected."), List.of("opl.structural.tagged.state.reciprocal.v1"), List.of("RECIPROCAL")),
                Arguments.of("reciprocal_both_state_null", SemanticRevision.Direction.UNDIRECTED, SemanticRevision.TargetKind.STATE, "state.raw.available", SemanticRevision.TargetKind.STATE, "state.refined.ready", List.of(),
                        List.of("available Raw Material and ready Refined Material are related."), List.of("opl.structural.tagged.state.reciprocal.v1"), List.of("RECIPROCAL")));
    }

    private static Stream<Arguments> blockedControlCases() {
        return Stream.of(
                Arguments.of("C-OPL-CTRL-BLK-001-result", "CAP-ISO-PROC-002", controlModifiers("CAP-ISO-CTRL-001", "PROCESS_INPUT")),
                Arguments.of("C-OPL-CTRL-BLK-002-state-result", "CAP-ISO-PROC-007", controlModifiers("CAP-ISO-CTRL-003", "PROCESS_INPUT")),
                Arguments.of("C-OPL-CTRL-BLK-003-effect-output", "CAP-ISO-PROC-003", controlModifiers("CAP-ISO-CTRL-001", "PROCESS_OUTPUT")),
                Arguments.of("C-OPL-CTRL-BLK-004-non-input-segment", "CAP-ISO-PROC-001", controlModifiers("CAP-ISO-CTRL-001", "PROCESS_OUTPUT")),
                Arguments.of("C-OPL-CTRL-BLK-005-base-mismatch", "CAP-ISO-PROC-001", controlModifiers("CAP-ISO-CTRL-002", "PROCESS_INPUT")),
                Arguments.of("C-OPL-CTRL-BLK-006-missing-capability", "CAP-ISO-PROC-001", List.of(new SemanticRevision.Modifier("control.segment", "PROCESS_INPUT"))),
                Arguments.of("C-OPL-CTRL-BLK-007-missing-segment", "CAP-ISO-PROC-001", List.of(new SemanticRevision.Modifier("control.capability", "CAP-ISO-CTRL-001"))),
                Arguments.of("C-OPL-CTRL-BLK-008-duplicate-capability", "CAP-ISO-PROC-001", List.of(
                        new SemanticRevision.Modifier("control.capability", "CAP-ISO-CTRL-001"),
                        new SemanticRevision.Modifier("control.capability", "CAP-ISO-CTRL-005"),
                        new SemanticRevision.Modifier("control.segment", "PROCESS_INPUT"))),
                Arguments.of("C-OPL-CTRL-BLK-009-duplicate-segment", "CAP-ISO-PROC-001", List.of(
                        new SemanticRevision.Modifier("control.capability", "CAP-ISO-CTRL-001"),
                        new SemanticRevision.Modifier("control.segment", "PROCESS_INPUT"),
                        new SemanticRevision.Modifier("control.segment", "PROCESS_OUTPUT"))),
                Arguments.of("C-OPL-CTRL-BLK-010-event-condition", "CAP-ISO-PROC-001", List.of(
                        new SemanticRevision.Modifier("control.capability", "CAP-ISO-CTRL-001"),
                        new SemanticRevision.Modifier("control.capability", "CAP-ISO-CTRL-005"),
                        new SemanticRevision.Modifier("control.segment", "PROCESS_INPUT"))),
                Arguments.of("C-OPL-CTRL-BLK-011-unknown-capability", "CAP-ISO-PROC-001", controlModifiers("CAP-ISO-CTRL-999", "PROCESS_INPUT")),
                Arguments.of("C-OPL-CTRL-BLK-012-modifier-capability-ref", "CAP-ISO-PROC-001", List.of(
                        new SemanticRevision.Modifier("control.capability_ref", "CAP-ISO-CTRL-001"),
                        new SemanticRevision.Modifier("control.segment", "PROCESS_INPUT"))),
                Arguments.of("C-OPL-CTRL-BLK-013-modifier-value-ref", "CAP-ISO-PROC-001", controlModifiers("CAP-ISO-CTRL-001@0.2.0", "PROCESS_INPUT")),
                Arguments.of("C-OPL-CTRL-BLK-014-option-payload", "CAP-ISO-PROC-001", List.of(
                        new SemanticRevision.Modifier("control.capability", "CAP-ISO-CTRL-001"),
                        new SemanticRevision.Modifier("control.segment", "PROCESS_INPUT"),
                        new SemanticRevision.Modifier("control.option_id", "CAP-ISO-CTRL-001"))));
    }

    private static Stream<Arguments> invalidProceduralEndpointCases() {
        return Stream.of(
                Arguments.of("consumption_reversed", "CAP-ISO-PROC-001", "opl.consumption.v1", List.of(
                        invalidProceduralEndpoint("consumption.source", "CONSUMED_OBJECT", "element.processing", 0),
                        invalidProceduralEndpoint("consumption.process", "CONSUMING_PROCESS", "element.raw.material", 1))),
                Arguments.of("result_reversed", "CAP-ISO-PROC-002", "opl.result.v1", List.of(
                        invalidProceduralEndpoint("result.process", "RESULT_PROCESS", "element.raw.material", 0),
                        invalidProceduralEndpoint("result.object", "RESULT_OBJECT", "element.processing", 1))),
                Arguments.of("effect_reversed", "CAP-ISO-PROC-003", "opl.effect.v1", List.of(
                        invalidProceduralEndpoint("effect.affectee", "AFFECTEE", "element.processing", 0),
                        invalidProceduralEndpoint("effect.process", "AFFECTING_PROCESS", "element.raw.material", 1),
                        invalidProceduralEndpoint("effect.affected", "AFFECTED", "element.raw.material", 2))),
                Arguments.of("agent_reversed", "CAP-ISO-PROC-004", "opl.agent.v1", List.of(
                        invalidProceduralEndpoint("agent.object", "AGENT_OBJECT", "element.processing", 0),
                        invalidProceduralEndpoint("agent.process", "ENABLED_PROCESS", "element.raw.material", 1))),
                Arguments.of("instrument_reversed", "CAP-ISO-PROC-005", "opl.instrument.v1", List.of(
                        invalidProceduralEndpoint("instrument.object", "INSTRUMENT_OBJECT", "element.processing", 0),
                        invalidProceduralEndpoint("instrument.process", "ENABLED_PROCESS", "element.raw.material", 1))),
                Arguments.of("invocation_target_invalid", "CAP-ISO-PROC-013", "opl.invocation.v1", List.of(
                        invalidProceduralEndpoint("invocation.source", "INVOKING_PROCESS", "element.processing", 0),
                        invalidProceduralEndpoint("invocation.target", "INVOKED_PROCESS", "element.raw.material", 1))),
                Arguments.of("self_invocation_target_invalid", "CAP-ISO-PROC-014", "opl.invocation.self.v1", List.of(
                        invalidProceduralEndpoint("self.source", "INVOKING_PROCESS", "element.processing", 0),
                        invalidProceduralEndpoint("self.target", "INVOKED_PROCESS", "element.raw.material", 1))));
    }

    private static Stream<Arguments> proceduralCanonicalCases() {
        SemanticRevision revision = new SemanticRevisionReader().read(findFixture());
        return Stream.of(
                proceduralCase(revision, "PROC-001", "CAP-ISO-PROC-001", "opl.consumption.v1", "Processing consumes Raw Material.",
                        SemanticRevision.FactFamily.TRANSFORMATION, List.of(endpoint("CONSUMED_OBJECT", "element.raw.material", 0), endpoint("CONSUMING_PROCESS", "element.processing", 1)), List.of()),
                proceduralCase(revision, "PROC-002", "CAP-ISO-PROC-002", "opl.result.v1", "Processing yields Raw Material.",
                        SemanticRevision.FactFamily.TRANSFORMATION, List.of(endpoint("RESULT_PROCESS", "element.processing", 0), endpoint("RESULT_OBJECT", "element.raw.material", 1)), List.of()),
                proceduralCase(revision, "PROC-003", "CAP-ISO-PROC-003", "opl.effect.v1", "Processing affects Raw Material.",
                        SemanticRevision.FactFamily.TRANSFORMATION, List.of(endpoint("AFFECTEE", "element.raw.material", 0), endpoint("AFFECTING_PROCESS", "element.processing", 1), endpoint("AFFECTED", "element.raw.material", 2)), List.of()),
                proceduralCase(revision, "PROC-004", "CAP-ISO-PROC-004", "opl.agent.v1", "Raw Material handles Processing.",
                        SemanticRevision.FactFamily.ENABLING, List.of(endpoint("AGENT_OBJECT", "element.raw.material", 0), endpoint("ENABLED_PROCESS", "element.processing", 1)), List.of()),
                proceduralCase(revision, "PROC-005", "CAP-ISO-PROC-005", "opl.instrument.v1", "Processing requires Raw Material.",
                        SemanticRevision.FactFamily.ENABLING, List.of(endpoint("INSTRUMENT_OBJECT", "element.raw.material", 0), endpoint("ENABLED_PROCESS", "element.processing", 1)), List.of()),
                proceduralCase(revision, "PROC-006", "CAP-ISO-PROC-006", "opl.consumption.state.v1", "Processing consumes available Raw Material.",
                        SemanticRevision.FactFamily.TRANSFORMATION, List.of(stateEndpoint("CONSUMED_STATE", 0), endpoint("CONSUMING_PROCESS", "element.processing", 1)), List.of()),
                proceduralCase(revision, "PROC-007", "CAP-ISO-PROC-007", "opl.result.state.v1", "Processing yields available Raw Material.",
                        SemanticRevision.FactFamily.TRANSFORMATION, List.of(endpoint("RESULT_PROCESS", "element.processing", 0), stateEndpoint("RESULT_STATE", 1)), List.of()),
                proceduralCase(revision, "PROC-008", "CAP-ISO-PROC-008", "opl.effect.state.input-output.v1", "Processing changes Raw Material from available to available.",
                        SemanticRevision.FactFamily.TRANSFORMATION, List.of(stateEndpoint("AFFECTEE_INPUT_STATE", 0), endpoint("AFFECTING_PROCESS", "element.processing", 1), stateEndpoint("AFFECTED_OUTPUT_STATE", 2)), List.of()),
                proceduralCase(revision, "PROC-009", "CAP-ISO-PROC-009", "opl.effect.state.input.v1", "Processing changes Raw Material from available.",
                        SemanticRevision.FactFamily.TRANSFORMATION, List.of(stateEndpoint("AFFECTEE_INPUT_STATE", 0), endpoint("AFFECTING_PROCESS", "element.processing", 1), endpoint("AFFECTED_OBJECT", "element.raw.material", 2)), List.of()),
                proceduralCase(revision, "PROC-010", "CAP-ISO-PROC-010", "opl.effect.state.output.v1", "Processing changes Raw Material to available.",
                        SemanticRevision.FactFamily.TRANSFORMATION, List.of(endpoint("AFFECTEE_OBJECT", "element.raw.material", 0), endpoint("AFFECTING_PROCESS", "element.processing", 1), stateEndpoint("AFFECTED_OUTPUT_STATE", 2)), List.of()),
                proceduralCase(revision, "PROC-011", "CAP-ISO-PROC-011", "opl.agent.state.v1", "available Raw Material handles Processing.",
                        SemanticRevision.FactFamily.ENABLING, List.of(stateEndpoint("AGENT_STATE", 0), endpoint("ENABLED_PROCESS", "element.processing", 1)), List.of()),
                proceduralCase(revision, "PROC-012", "CAP-ISO-PROC-012", "opl.instrument.state.v1", "Processing requires available Raw Material.",
                        SemanticRevision.FactFamily.ENABLING, List.of(stateEndpoint("INSTRUMENT_STATE", 0), endpoint("ENABLED_PROCESS", "element.processing", 1)), List.of()),
                proceduralCase(revision, "PROC-013", "CAP-ISO-PROC-013", "opl.invocation.v1", "Processing invokes Processing.",
                        SemanticRevision.FactFamily.PROFILE_FACT, List.of(endpoint("INVOKING_PROCESS", "element.processing", 0), endpoint("INVOKED_PROCESS", "element.processing", 1)), List.of()),
                proceduralCase(revision, "PROC-014", "CAP-ISO-PROC-014", "opl.invocation.self.v1", "Processing invokes itself.",
                        SemanticRevision.FactFamily.PROFILE_FACT, List.of(endpoint("INVOKING_PROCESS", "element.processing", 0), endpoint("INVOKED_PROCESS", "element.processing", 1)), List.of()),
                proceduralCase(revision, "PROC-015", "CAP-ISO-PROC-015", "opl.exception.overtime.v1", "When Processing exceeds 2h, Processing handles the exception.",
                        SemanticRevision.FactFamily.PROFILE_FACT, List.of(endpoint("MONITORED_PROCESS", "element.processing", 0), endpoint("HANDLING_PROCESS", "element.processing", 1)), List.of(new SemanticRevision.Modifier("duration", "2h"))),
                proceduralCase(revision, "PROC-016", "CAP-ISO-PROC-016", "opl.exception.undertime.v1", "When Processing is under 2h, Processing handles the exception.",
                        SemanticRevision.FactFamily.PROFILE_FACT, List.of(endpoint("MONITORED_PROCESS", "element.processing", 0), endpoint("HANDLING_PROCESS", "element.processing", 1)), List.of(new SemanticRevision.Modifier("duration", "2h"))));
    }

    private static Arguments proceduralCase(
            SemanticRevision revision,
            String caseId,
            String capabilityId,
            String templateId,
            String expectedText,
            SemanticRevision.FactFamily family,
            List<SemanticRevision.Endpoint> endpoints,
            List<SemanticRevision.Modifier> modifiers) {
        SemanticRevision.Fact source = revision.facts().getFirst();
        SemanticRevision.Fact fact = new SemanticRevision.Fact("fact.canonical." + caseId.toLowerCase(), family,
                new SemanticRevision.CapabilityReference(capabilityId, source.capability().profileId(), source.capability().profileVersion()),
                endpoints, SemanticRevision.Direction.DIRECTED, modifiers, source.source(), source.normalization());
        return Arguments.of(caseId, fact, templateId, expectedText);
    }

    private static SemanticRevision.Endpoint invalidProceduralEndpoint(String suffix, String role, String targetId, int ordinal) {
        return new SemanticRevision.Endpoint("endpoint.invalid." + suffix, role, SemanticRevision.TargetKind.ELEMENT, targetId, ordinal, null);
    }

    private static List<SemanticRevision.Modifier> controlModifiers(String capability, String segment) {
        return List.of(
                new SemanticRevision.Modifier("control.capability", capability),
                new SemanticRevision.Modifier("control.segment", segment));
    }

    private SemanticRevision.Fact controlFact(SemanticRevision revision, String controlCapability, String baseCapability) {
        SemanticRevision.Fact source = revision.facts().getFirst();
        List<SemanticRevision.Endpoint> endpoints = switch (baseCapability) {
            case "CAP-ISO-PROC-001" -> endpoints("CONSUMED_OBJECT", "element.raw.material", "CONSUMING_PROCESS", "element.processing");
            case "CAP-ISO-PROC-003" -> List.of(endpoint("AFFECTEE", "element.raw.material", 0), endpoint("AFFECTING_PROCESS", "element.processing", 1), endpoint("AFFECTED", "element.raw.material", 2));
            case "CAP-ISO-PROC-004" -> endpoints("AGENT_OBJECT", "element.raw.material", "ENABLED_PROCESS", "element.processing");
            case "CAP-ISO-PROC-005" -> endpoints("INSTRUMENT_OBJECT", "element.raw.material", "ENABLED_PROCESS", "element.processing");
            case "CAP-ISO-PROC-006" -> List.of(stateEndpoint("CONSUMED_STATE", 0), endpoint("CONSUMING_PROCESS", "element.processing", 1));
            case "CAP-ISO-PROC-008" -> List.of(stateEndpoint("AFFECTEE_INPUT_STATE", 0), endpoint("AFFECTING_PROCESS", "element.processing", 1), stateEndpoint("AFFECTED_OUTPUT_STATE", 2));
            case "CAP-ISO-PROC-009" -> List.of(stateEndpoint("AFFECTEE_INPUT_STATE", 0), endpoint("AFFECTING_PROCESS", "element.processing", 1), endpoint("AFFECTED_OBJECT", "element.raw.material", 2));
            case "CAP-ISO-PROC-010" -> List.of(endpoint("AFFECTEE_OBJECT", "element.raw.material", 0), endpoint("AFFECTING_PROCESS", "element.processing", 1), stateEndpoint("AFFECTED_OUTPUT_STATE", 2));
            case "CAP-ISO-PROC-011" -> List.of(stateEndpoint("AGENT_STATE", 0), endpoint("ENABLED_PROCESS", "element.processing", 1));
            case "CAP-ISO-PROC-012" -> List.of(stateEndpoint("INSTRUMENT_STATE", 0), endpoint("ENABLED_PROCESS", "element.processing", 1));
            default -> throw new IllegalArgumentException("Unsupported Control base capability " + baseCapability);
        };
        return new SemanticRevision.Fact("fact.control." + controlCapability.substring(controlCapability.length() - 3) + "." + baseCapability.substring(baseCapability.length() - 3),
                source.family(), new SemanticRevision.CapabilityReference(baseCapability, source.capability().profileId(), source.capability().profileVersion()),
                endpoints, SemanticRevision.Direction.DIRECTED, List.of(
                new SemanticRevision.Modifier("control.capability", controlCapability),
                new SemanticRevision.Modifier("control.segment", "PROCESS_INPUT")), source.source(), source.normalization());
    }

    private List<SemanticRevision.Endpoint> endpoints(String objectRole, String objectId, String processRole, String processId) {
        return List.of(endpoint(objectRole, objectId, 0), endpoint(processRole, processId, 1));
    }

    private static SemanticRevision.Endpoint endpoint(String role, String targetId, int ordinal) {
        return new SemanticRevision.Endpoint("endpoint.control." + role.toLowerCase() + "." + ordinal, role, SemanticRevision.TargetKind.ELEMENT, targetId, ordinal, null);
    }

    private static SemanticRevision.Endpoint stateEndpoint(String role, int ordinal) {
        return new SemanticRevision.Endpoint("endpoint.control." + role.toLowerCase() + "." + ordinal, role, SemanticRevision.TargetKind.STATE, "state.raw.available", ordinal, null);
    }

    private SemanticRevision revisionWithFactOccurrence(SemanticRevision revision, SemanticRevision.Fact fact) {
        SemanticRevision.Context root = revision.contexts().getFirst();
        String occurrenceId = "occurrence.control." + fact.id();
        List<String> occurrenceIds = new ArrayList<>(root.occurrenceIds());
        occurrenceIds.add(occurrenceId);
        SemanticRevision.Context expandedRoot = new SemanticRevision.Context(root.id(), root.kind(), root.capability(), root.name(), occurrenceIds, root.source());
        List<SemanticRevision.Occurrence> occurrences = new ArrayList<>(revision.occurrences());
        occurrences.add(new SemanticRevision.Occurrence(occurrenceId, root.id(), SemanticRevision.TargetKind.FACT, fact.id(),
                SemanticRevision.OccurrenceOwnership.OWNED, "PROCEDURAL_LINK", "layout.consumption"));
        return copy(revision, List.of(fact), List.of(expandedRoot), occurrences);
    }

    private OplGenerationResult binaryStructuralResult(
            SemanticRevision revision,
            SemanticRevision.Fact source,
            String caseId,
            String capabilityId,
            String sourceId,
            String targetId,
            String targetName,
            SemanticRevision.Direction direction,
            List<SemanticRevision.Label> labels) {
        SemanticRevision.Element sourceElement = revision.elements().stream().filter(element -> sourceId.equals(element.id())).findFirst().orElseThrow();
        SemanticRevision.Element targetElement = new SemanticRevision.Element(targetId, sourceElement.coreKind(), sourceElement.capability(),
                new SemanticRevision.QualifiedName(sourceElement.name().namespace(), targetName), List.of(), source.source(), source.normalization());
        String factId = "fact.structural." + caseId;
        SemanticRevision.Fact structural = new SemanticRevision.Fact(factId, SemanticRevision.FactFamily.STRUCTURAL,
                new SemanticRevision.CapabilityReference(capabilityId, source.capability().profileId(), source.capability().profileVersion()),
                List.of(
                        new SemanticRevision.Endpoint("endpoint." + caseId + ".source", "STRUCTURAL_SOURCE", SemanticRevision.TargetKind.ELEMENT, sourceId, 0, null),
                        new SemanticRevision.Endpoint("endpoint." + caseId + ".target", "STRUCTURAL_TARGET", SemanticRevision.TargetKind.ELEMENT, targetId, 1, null)),
                direction, List.of(), labels, SemanticRevision.CollectionCompleteness.NOT_APPLICABLE, source.source(), source.normalization());
        SemanticRevision.Context root = revision.contexts().getFirst();
        String factOccurrenceId = "occurrence." + factId;
        String targetOccurrenceId = "occurrence." + targetId;
        SemanticRevision.Context expandedRoot = new SemanticRevision.Context(root.id(), root.kind(), root.capability(), root.name(),
                append(append(root.occurrenceIds(), factOccurrenceId), targetOccurrenceId), root.source());
        List<SemanticRevision.Occurrence> occurrences = appendOccurrence(
                appendOccurrence(revision.occurrences(), new SemanticRevision.Occurrence(factOccurrenceId, root.id(), SemanticRevision.TargetKind.FACT, factId,
                        SemanticRevision.OccurrenceOwnership.OWNED, "STRUCTURAL_LINK", "layout.consumption")),
                new SemanticRevision.Occurrence(targetOccurrenceId, root.id(), SemanticRevision.TargetKind.ELEMENT, targetId,
                        SemanticRevision.OccurrenceOwnership.OWNED, sourceElement.coreKind() == SemanticRevision.CoreKind.OBJECT ? "OBJECT_NODE" : "PROCESS_NODE", "layout.consumption"));
        List<SemanticRevision.Element> elements = new ArrayList<>(revision.elements());
        elements.add(targetElement);
        SemanticRevision candidate = new SemanticRevision(revision.revisionId(), revision.modelId(), revision.revisionSequence(), revision.profileBinding(),
                revision.rootContextId(), elements, revision.features(), revision.states(), List.of(structural), List.of(expandedRoot), occurrences,
                revision.layouts(), revision.statePresentations());
        return service.generate(candidate, root.id(), new OplGrammar(binding(candidate), structuralTemplates(capabilityId)));
    }

    private List<OplGrammar.Template> structuralTemplates(String capabilityId) {
        return switch (capabilityId) {
            case "CAP-ISO-STRUCT-001" -> List.of(new OplGrammar.Template("opl.structural.tagged.unidirectional.v1", capabilityId, 200, "SINGLE", "{Source} {forward-tag} {Destination}."));
            case "CAP-ISO-STRUCT-002" -> List.of(new OplGrammar.Template("opl.structural.null-tagged.unidirectional.v1", capabilityId, 200, "SINGLE", "{Source} relates to {Destination}."));
            case "CAP-ISO-STRUCT-003" -> List.of(
                    new OplGrammar.Template("opl.structural.tagged.bidirectional.forward.v1", capabilityId, 200, "FORWARD", "{Source} {forward-tag} {Destination}."),
                    new OplGrammar.Template("opl.structural.tagged.bidirectional.reverse.v1", capabilityId, 200, "REVERSE", "{Destination} {reverse-tag} {Source}."));
            case "CAP-ISO-STRUCT-004" -> List.of(
                    new OplGrammar.Template("opl.structural.tagged.reciprocal.v1", capabilityId, 200, "RECIPROCAL", "{A} and {B} are {reciprocal-tag}."),
                    new OplGrammar.Template("opl.structural.null-tagged.reciprocal.v1", capabilityId, 200, "RECIPROCAL", "{A} and {B} are related."));
            default -> throw new IllegalArgumentException("Unsupported Structural capability " + capabilityId);
        };
    }

    private String aggregationText(
            SemanticRevision revision,
            List<SemanticRevision.Element> elements,
            SemanticRevision.Fact source,
            String factId,
            List<String> partIds,
            SemanticRevision.CollectionCompleteness completeness) {
        List<SemanticRevision.Endpoint> endpoints = new ArrayList<>();
        endpoints.add(new SemanticRevision.Endpoint(factId + ".whole", "WHOLE_THING", SemanticRevision.TargetKind.ELEMENT,
                "element.raw.material", 0, null));
        for (int index = 0; index < partIds.size(); index++) {
            endpoints.add(new SemanticRevision.Endpoint(factId + ".part." + (index + 1), "PART_THING",
                    SemanticRevision.TargetKind.ELEMENT, partIds.get(index), index + 1, null));
        }
        SemanticRevision.Fact aggregation = new SemanticRevision.Fact(factId, SemanticRevision.FactFamily.STRUCTURAL,
                new SemanticRevision.CapabilityReference("CAP-ISO-STRUCT-005", source.capability().profileId(), source.capability().profileVersion()),
                endpoints, SemanticRevision.Direction.DIRECTED, List.of(), List.of(), completeness, source.source(), source.normalization());
        SemanticRevision.Context root = revision.contexts().getFirst();
        String occurrenceId = "occurrence." + factId;
        List<String> occurrenceIds = append(root.occurrenceIds(), occurrenceId);
        List<SemanticRevision.Occurrence> occurrences = appendOccurrence(revision.occurrences(), new SemanticRevision.Occurrence(occurrenceId, root.id(), SemanticRevision.TargetKind.FACT,
                aggregation.id(), SemanticRevision.OccurrenceOwnership.OWNED, "STRUCTURAL_LINK", "layout.consumption"));
        for (String partId : partIds) {
            if (!partId.startsWith("element.part.")) continue;
            String partOccurrenceId = "occurrence." + partId;
            occurrenceIds = append(occurrenceIds, partOccurrenceId);
            occurrences = appendOccurrence(occurrences, new SemanticRevision.Occurrence(partOccurrenceId, root.id(), SemanticRevision.TargetKind.ELEMENT,
                    partId, SemanticRevision.OccurrenceOwnership.OWNED, "OBJECT_NODE", "layout.raw.material"));
        }
        SemanticRevision.Context expandedRoot = new SemanticRevision.Context(root.id(), root.kind(), root.capability(), root.name(),
                occurrenceIds, root.source());
        SemanticRevision candidate = new SemanticRevision(revision.revisionId(), revision.modelId(), revision.revisionSequence(), revision.profileBinding(),
                revision.rootContextId(), elements, revision.features(), revision.states(), List.of(aggregation), List.of(expandedRoot),
                occurrences, revision.layouts(), revision.statePresentations());
        OplGrammar grammar = new OplGrammar(binding(candidate), List.of(
                new OplGrammar.Template("opl.structural.aggregation.complete.v1", "CAP-ISO-STRUCT-005", 200, "SINGLE", "{Whole} consists of {part-list}."),
                new OplGrammar.Template("opl.structural.aggregation.incomplete.v1", "CAP-ISO-STRUCT-005", 200, "SINGLE", "{Whole} consists of {known-part-list} and at least one other part.")));
        return service.generate(candidate, root.id(), grammar).artifact().paragraphs().getFirst().sentences().getFirst().text();
    }

    private String characterizationText(
            SemanticRevision revision,
            SemanticRevision.Fact source,
            String factId,
            List<SemanticRevision.Feature> features,
            List<String> featureIds,
            SemanticRevision.CollectionCompleteness completeness) {
        return characterizationTextFor(revision, source, factId, "element.raw.material", features, featureIds, completeness);
    }

    private String characterizationTextFor(
            SemanticRevision revision,
            SemanticRevision.Fact source,
            String factId,
            String exhibitorId,
            List<SemanticRevision.Feature> features,
            List<String> featureIds,
            SemanticRevision.CollectionCompleteness completeness) {
        List<SemanticRevision.Endpoint> endpoints = new ArrayList<>();
        endpoints.add(new SemanticRevision.Endpoint(factId + ".exhibitor", "EXHIBITOR_THING", SemanticRevision.TargetKind.ELEMENT, exhibitorId, 0, null));
        for (int index = 0; index < featureIds.size(); index++) {
            endpoints.add(new SemanticRevision.Endpoint(factId + ".feature." + (index + 1), "FEATURE_THING", SemanticRevision.TargetKind.FEATURE,
                    featureIds.get(index), index + 1, null));
        }
        SemanticRevision.Fact characterization = new SemanticRevision.Fact(factId, SemanticRevision.FactFamily.STRUCTURAL,
                new SemanticRevision.CapabilityReference("CAP-ISO-STRUCT-006", source.capability().profileId(), source.capability().profileVersion()),
                endpoints, SemanticRevision.Direction.DIRECTED, List.of(), List.of(), completeness, source.source(), source.normalization());
        SemanticRevision.Context root = revision.contexts().getFirst();
        String factOccurrenceId = "occurrence." + factId;
        List<String> occurrenceIds = append(root.occurrenceIds(), factOccurrenceId);
        List<SemanticRevision.Occurrence> occurrences = appendOccurrence(revision.occurrences(), new SemanticRevision.Occurrence(factOccurrenceId, root.id(), SemanticRevision.TargetKind.FACT,
                characterization.id(), SemanticRevision.OccurrenceOwnership.OWNED, "STRUCTURAL_LINK", "layout.consumption"));
        for (String featureId : featureIds) {
            String featureOccurrenceId = "occurrence." + featureId;
            occurrenceIds = append(occurrenceIds, featureOccurrenceId);
            occurrences = appendOccurrence(occurrences, new SemanticRevision.Occurrence(featureOccurrenceId, root.id(), SemanticRevision.TargetKind.FEATURE,
                    featureId, SemanticRevision.OccurrenceOwnership.OWNED, "FEATURE_NODE", "layout.consumption"));
        }
        SemanticRevision.Context expandedRoot = new SemanticRevision.Context(root.id(), root.kind(), root.capability(), root.name(), occurrenceIds, root.source());
        SemanticRevision candidate = new SemanticRevision(revision.revisionId(), revision.modelId(), revision.revisionSequence(), revision.profileBinding(),
                revision.rootContextId(), revision.elements(), features, revision.states(), List.of(characterization), List.of(expandedRoot), occurrences,
                revision.layouts(), revision.statePresentations());
        OplGrammar grammar = new OplGrammar(binding(candidate), List.of(
                new OplGrammar.Template("opl.structural.characterization.complete.v1", "CAP-ISO-STRUCT-006", 200, "SINGLE", "{Exhibitor} exhibits {feature-list}."),
                new OplGrammar.Template("opl.structural.characterization.incomplete.v1", "CAP-ISO-STRUCT-006", 200, "SINGLE", "{Exhibitor} exhibits {feature-list}, and at least one other {feature-kind}."),
                new OplGrammar.Template("opl.structural.characterization.mixed.complete.v1", "CAP-ISO-STRUCT-006", 200, "SINGLE", "{Exhibitor} exhibits {attribute-list}, as well as {operator-list}."),
                new OplGrammar.Template("opl.structural.characterization.mixed.incomplete.v1", "CAP-ISO-STRUCT-006", 200, "SINGLE", "{Exhibitor} exhibits {attribute-list}, and at least one other attribute, as well as {operator-list}, and at least one other operator.")));
        return service.generate(candidate, root.id(), grammar).artifact().paragraphs().getFirst().sentences().getFirst().text();
    }

    private OplGenerationResult exhibitionResult(
            SemanticRevision revision,
            SemanticRevision.Fact source,
            String factId,
            String exhibitorId,
            List<SemanticRevision.Feature> features) {
        List<SemanticRevision.Endpoint> endpoints = new ArrayList<>();
        endpoints.add(new SemanticRevision.Endpoint(factId + ".exhibitor", "EXHIBITOR_THING", SemanticRevision.TargetKind.ELEMENT, exhibitorId, 0, null));
        for (int index = 0; index < features.size(); index++) {
            endpoints.add(new SemanticRevision.Endpoint(factId + ".feature." + (index + 1), "FEATURE_THING", SemanticRevision.TargetKind.FEATURE,
                    features.get(index).id(), index + 1, null));
        }
        SemanticRevision.SourceProvenance production = new SemanticRevision.SourceProvenance(
                revision.profileBinding().profile().id(), revision.profileBinding().profile().version(), "OPL_PRODUCTION", "opl.structural.exhibition.v1");
        SemanticRevision.Fact fact = new SemanticRevision.Fact(factId, SemanticRevision.FactFamily.STRUCTURAL,
                new SemanticRevision.CapabilityReference("CAP-ISO-STRUCT-006", source.capability().profileId(), source.capability().profileVersion()),
                endpoints, SemanticRevision.Direction.DIRECTED, List.of(), List.of(), SemanticRevision.CollectionCompleteness.COMPLETE,
                production, source.normalization());
        SemanticRevision.Context root = revision.contexts().getFirst();
        String factOccurrenceId = "occurrence." + factId;
        List<String> occurrenceIds = append(root.occurrenceIds(), factOccurrenceId);
        List<SemanticRevision.Occurrence> occurrences = appendOccurrence(revision.occurrences(), new SemanticRevision.Occurrence(factOccurrenceId, root.id(), SemanticRevision.TargetKind.FACT,
                fact.id(), SemanticRevision.OccurrenceOwnership.OWNED, "STRUCTURAL_LINK", "layout.consumption"));
        for (SemanticRevision.Feature feature : features) {
            String featureOccurrenceId = "occurrence." + feature.id();
            occurrenceIds = append(occurrenceIds, featureOccurrenceId);
            occurrences = appendOccurrence(occurrences, new SemanticRevision.Occurrence(featureOccurrenceId, root.id(), SemanticRevision.TargetKind.FEATURE,
                    feature.id(), SemanticRevision.OccurrenceOwnership.OWNED, "FEATURE_NODE", "layout.consumption"));
        }
        SemanticRevision.Context expandedRoot = new SemanticRevision.Context(root.id(), root.kind(), root.capability(), root.name(), occurrenceIds, root.source());
        SemanticRevision candidate = new SemanticRevision(revision.revisionId(), revision.modelId(), revision.revisionSequence(), revision.profileBinding(),
                revision.rootContextId(), revision.elements(), features, revision.states(), List.of(fact), List.of(expandedRoot), occurrences,
                revision.layouts(), revision.statePresentations());
        OplGrammar grammar = new OplGrammar(binding(candidate), List.of(
                new OplGrammar.Template("opl.structural.exhibition.v1", "CAP-ISO-STRUCT-006", 200, "SINGLE", "{Feature} of {Exhibitor} is {value-or-feature-list}.")));
        return service.generate(candidate, root.id(), grammar);
    }

    private String generalizationText(
            SemanticRevision revision,
            List<SemanticRevision.Element> elements,
            SemanticRevision.Fact source,
            String factId,
            String generalId,
            List<String> specializedIds,
            SemanticRevision.CollectionCompleteness completeness) {
        List<SemanticRevision.Endpoint> endpoints = new ArrayList<>();
        endpoints.add(new SemanticRevision.Endpoint(factId + ".general", "GENERAL_THING", SemanticRevision.TargetKind.ELEMENT, generalId, 0, null));
        for (int index = 0; index < specializedIds.size(); index++) {
            endpoints.add(new SemanticRevision.Endpoint(factId + ".specialized." + (index + 1), "SPECIALIZED_THING",
                    SemanticRevision.TargetKind.ELEMENT, specializedIds.get(index), index + 1, null));
        }
        SemanticRevision.Fact generalization = new SemanticRevision.Fact(factId, SemanticRevision.FactFamily.STRUCTURAL,
                new SemanticRevision.CapabilityReference("CAP-ISO-STRUCT-007", source.capability().profileId(), source.capability().profileVersion()),
                endpoints, SemanticRevision.Direction.DIRECTED, List.of(), List.of(), completeness, source.source(), source.normalization());
        SemanticRevision.Context root = revision.contexts().getFirst();
        String factOccurrenceId = "occurrence." + factId;
        List<String> occurrenceIds = append(root.occurrenceIds(), factOccurrenceId);
        List<SemanticRevision.Occurrence> occurrences = appendOccurrence(revision.occurrences(), new SemanticRevision.Occurrence(factOccurrenceId, root.id(), SemanticRevision.TargetKind.FACT,
                generalization.id(), SemanticRevision.OccurrenceOwnership.OWNED, "STRUCTURAL_LINK", "layout.consumption"));
        for (String specializedId : specializedIds) {
            SemanticRevision.Element specialized = elements.stream().filter(element -> specializedId.equals(element.id())).findFirst().orElseThrow();
            String occurrenceId = "occurrence." + specializedId;
            occurrenceIds = append(occurrenceIds, occurrenceId);
            occurrences = appendOccurrence(occurrences, new SemanticRevision.Occurrence(occurrenceId, root.id(), SemanticRevision.TargetKind.ELEMENT,
                    specializedId, SemanticRevision.OccurrenceOwnership.OWNED,
                    specialized.coreKind() == SemanticRevision.CoreKind.OBJECT ? "OBJECT_NODE" : "PROCESS_NODE", "layout.consumption"));
        }
        SemanticRevision.Context expandedRoot = new SemanticRevision.Context(root.id(), root.kind(), root.capability(), root.name(), occurrenceIds, root.source());
        SemanticRevision candidate = new SemanticRevision(revision.revisionId(), revision.modelId(), revision.revisionSequence(), revision.profileBinding(),
                revision.rootContextId(), elements, revision.features(), revision.states(), List.of(generalization), List.of(expandedRoot), occurrences,
                revision.layouts(), revision.statePresentations());
        OplGrammar grammar = new OplGrammar(binding(candidate), List.of(
                new OplGrammar.Template("opl.structural.generalization.object.single.v1", "CAP-ISO-STRUCT-007", 200, "SINGLE", "{SpecialObject} is a {GeneralObject}."),
                new OplGrammar.Template("opl.structural.generalization.process.single.v1", "CAP-ISO-STRUCT-007", 200, "SINGLE", "{SpecialProcess} is {GeneralProcess}."),
                new OplGrammar.Template("opl.structural.generalization.multiple.v1", "CAP-ISO-STRUCT-007", 200, "SINGLE", "{specialization-list} are {General}."),
                new OplGrammar.Template("opl.structural.generalization.incomplete.v1", "CAP-ISO-STRUCT-007", 200, "SINGLE", "{specialization-list} and other specializations are {General}.")));
        return service.generate(candidate, root.id(), grammar).artifact().paragraphs().getFirst().sentences().getFirst().text();
    }

    private SemanticRevision.Fact stateCharacterizationFact(
            SemanticRevision.Fact source,
            String factId,
            SemanticRevision.TargetKind sourceKind,
            String sourceId,
            String valueStateId) {
        return new SemanticRevision.Fact(factId, SemanticRevision.FactFamily.STRUCTURAL,
                new SemanticRevision.CapabilityReference("CAP-ISO-STRUCT-009", source.capability().profileId(), source.capability().profileVersion()),
                List.of(
                        new SemanticRevision.Endpoint(factId + ".source", "EXHIBITOR_THING_OR_STATE", sourceKind, sourceId, 0, null),
                        new SemanticRevision.Endpoint(factId + ".value", "VALUE_STATE", SemanticRevision.TargetKind.STATE, valueStateId, 1, null)),
                SemanticRevision.Direction.DIRECTED, List.of(), List.of(), SemanticRevision.CollectionCompleteness.NOT_APPLICABLE,
                source.source(), source.normalization());
    }

    private OplGenerationResult stateCharacterizationResult(
            SemanticRevision revision,
            SemanticRevision.Fact fact,
            List<SemanticRevision.Feature> features,
            List<SemanticRevision.State> states) {
        SemanticRevision.Context root = revision.contexts().getFirst();
        String factOccurrenceId = "occurrence." + fact.id();
        String stateOccurrenceId = "occurrence." + fact.endpoints().get(1).targetId();
        SemanticRevision.Context expandedRoot = new SemanticRevision.Context(root.id(), root.kind(), root.capability(), root.name(),
                append(append(root.occurrenceIds(), factOccurrenceId), stateOccurrenceId), root.source());
        List<SemanticRevision.Occurrence> occurrences = appendOccurrence(
                appendOccurrence(revision.occurrences(), new SemanticRevision.Occurrence(factOccurrenceId, root.id(), SemanticRevision.TargetKind.FACT, fact.id(),
                        SemanticRevision.OccurrenceOwnership.OWNED, "STRUCTURAL_LINK", "layout.consumption")),
                new SemanticRevision.Occurrence(stateOccurrenceId, root.id(), SemanticRevision.TargetKind.STATE, fact.endpoints().get(1).targetId(),
                        SemanticRevision.OccurrenceOwnership.OWNED, "STATE_NODE", "layout.consumption"));
        SemanticRevision candidate = new SemanticRevision(revision.revisionId(), revision.modelId(), revision.revisionSequence(), revision.profileBinding(),
                revision.rootContextId(), revision.elements(), features, states, List.of(fact), List.of(expandedRoot), occurrences,
                revision.layouts(), revision.statePresentations());
        OplGrammar grammar = new OplGrammar(binding(candidate), List.of(
                new OplGrammar.Template("opl.structural.characterization.state.v1", "CAP-ISO-STRUCT-009", 200, "SINGLE", "{SpecializedObject} exhibits {value-state} {Attribute}.")));
        return service.generate(candidate, root.id(), grammar);
    }

    private OplGenerationResult stateTaggedResult(
            SemanticRevision revision,
            String caseId,
            SemanticRevision.Direction direction,
            SemanticRevision.TargetKind sourceKind,
            String sourceId,
            SemanticRevision.TargetKind targetKind,
            String targetId,
            List<SemanticRevision.Label> labels) {
        SemanticRevision.Fact source = revision.facts().getFirst();
        SemanticRevision.Element raw = revision.elements().stream().filter(element -> "element.raw.material".equals(element.id())).findFirst().orElseThrow();
        SemanticRevision.Element refined = new SemanticRevision.Element("element.refined.material", SemanticRevision.CoreKind.OBJECT, raw.capability(),
                new SemanticRevision.QualifiedName(raw.name().namespace(), "Refined Material"), List.of("state.refined.ready"), source.source(), source.normalization());
        SemanticRevision.State ready = new SemanticRevision.State("state.refined.ready", "element.refined.material", raw.capability(),
                new SemanticRevision.QualifiedName(raw.name().namespace(), "ready"), List.of(), source.source(), source.normalization());
        String factId = "fact.state.tagged." + caseId;
        SemanticRevision.Fact tagged = new SemanticRevision.Fact(factId, SemanticRevision.FactFamily.STRUCTURAL,
                new SemanticRevision.CapabilityReference("CAP-ISO-STRUCT-010", source.capability().profileId(), source.capability().profileVersion()),
                List.of(
                        new SemanticRevision.Endpoint(factId + ".source", "STATE_TAGGED_SOURCE", sourceKind, sourceId, 0, null),
                        new SemanticRevision.Endpoint(factId + ".target", "STATE_TAGGED_TARGET", targetKind, targetId, 1, null)),
                direction, List.of(), labels, SemanticRevision.CollectionCompleteness.NOT_APPLICABLE, source.source(), source.normalization());
        SemanticRevision.Context root = revision.contexts().getFirst();
        String factOccurrenceId = "occurrence." + factId;
        SemanticRevision.Context expandedRoot = new SemanticRevision.Context(root.id(), root.kind(), root.capability(), root.name(),
                append(append(append(root.occurrenceIds(), "occurrence.refined.material"), "occurrence.refined.ready"), factOccurrenceId), root.source());
        List<SemanticRevision.Occurrence> occurrences = appendOccurrence(
                appendOccurrence(
                        appendOccurrence(revision.occurrences(), new SemanticRevision.Occurrence("occurrence.refined.material", root.id(), SemanticRevision.TargetKind.ELEMENT,
                                refined.id(), SemanticRevision.OccurrenceOwnership.OWNED, "OBJECT_NODE", "layout.consumption")),
                        new SemanticRevision.Occurrence("occurrence.refined.ready", root.id(), SemanticRevision.TargetKind.STATE, ready.id(),
                                SemanticRevision.OccurrenceOwnership.OWNED, "STATE_NODE", "layout.consumption")),
                new SemanticRevision.Occurrence(factOccurrenceId, root.id(), SemanticRevision.TargetKind.FACT, factId,
                        SemanticRevision.OccurrenceOwnership.OWNED, "STRUCTURAL_LINK", "layout.consumption"));
        List<SemanticRevision.Element> elements = new ArrayList<>(revision.elements());
        elements.add(refined);
        List<SemanticRevision.State> states = new ArrayList<>(revision.states());
        states.add(ready);
        SemanticRevision candidate = new SemanticRevision(revision.revisionId(), revision.modelId(), revision.revisionSequence(), revision.profileBinding(),
                revision.rootContextId(), elements, revision.features(), states, List.of(tagged), List.of(expandedRoot), occurrences,
                revision.layouts(), revision.statePresentations());
        OplGrammar grammar = new OplGrammar(binding(candidate), List.of(
                new OplGrammar.Template("opl.structural.tagged.state.unidirectional.v1", "CAP-ISO-STRUCT-010", 200, "SINGLE", "{qualified-source} {forward-tag-or-relates-to} {qualified-destination}."),
                new OplGrammar.Template("opl.structural.tagged.state.bidirectional.forward.v1", "CAP-ISO-STRUCT-010", 200, "FORWARD", "{qualified-source} {forward-tag} {qualified-destination}."),
                new OplGrammar.Template("opl.structural.tagged.state.bidirectional.reverse.v1", "CAP-ISO-STRUCT-010", 200, "REVERSE", "{qualified-destination} {reverse-tag} {qualified-source}."),
                new OplGrammar.Template("opl.structural.tagged.state.reciprocal.v1", "CAP-ISO-STRUCT-010", 200, "RECIPROCAL", "{qualified-source} and {qualified-destination} are {reciprocal-tag-or-related}.")));
        return service.generate(candidate, root.id(), grammar);
    }

    private String classificationText(
            SemanticRevision revision,
            List<SemanticRevision.Element> elements,
            SemanticRevision.Fact source,
            String factId,
            List<String> instanceIds,
            SemanticRevision.CollectionCompleteness completeness) {
        List<SemanticRevision.Endpoint> endpoints = new ArrayList<>();
        endpoints.add(new SemanticRevision.Endpoint(factId + ".class", "CLASS_THING", SemanticRevision.TargetKind.ELEMENT,
                "element.raw.material", 0, null));
        for (int index = 0; index < instanceIds.size(); index++) {
            endpoints.add(new SemanticRevision.Endpoint(factId + ".instance." + (index + 1), "INSTANCE_THING",
                    SemanticRevision.TargetKind.ELEMENT, instanceIds.get(index), index + 1, null));
        }
        SemanticRevision.Fact classification = new SemanticRevision.Fact(factId, SemanticRevision.FactFamily.STRUCTURAL,
                new SemanticRevision.CapabilityReference("CAP-ISO-STRUCT-008", source.capability().profileId(), source.capability().profileVersion()),
                endpoints, SemanticRevision.Direction.DIRECTED, List.of(), List.of(), completeness, source.source(), source.normalization());
        SemanticRevision.Context root = revision.contexts().getFirst();
        String factOccurrenceId = "occurrence." + factId;
        List<String> occurrenceIds = append(root.occurrenceIds(), factOccurrenceId);
        List<SemanticRevision.Occurrence> occurrences = appendOccurrence(revision.occurrences(), new SemanticRevision.Occurrence(factOccurrenceId, root.id(), SemanticRevision.TargetKind.FACT,
                classification.id(), SemanticRevision.OccurrenceOwnership.OWNED, "STRUCTURAL_LINK", "layout.consumption"));
        for (String instanceId : instanceIds) {
            String instanceOccurrenceId = "occurrence." + instanceId;
            occurrenceIds = append(occurrenceIds, instanceOccurrenceId);
            occurrences = appendOccurrence(occurrences, new SemanticRevision.Occurrence(instanceOccurrenceId, root.id(), SemanticRevision.TargetKind.ELEMENT,
                    instanceId, SemanticRevision.OccurrenceOwnership.OWNED, "OBJECT_NODE", "layout.raw.material"));
        }
        SemanticRevision.Context expandedRoot = new SemanticRevision.Context(root.id(), root.kind(), root.capability(), root.name(), occurrenceIds, root.source());
        SemanticRevision candidate = new SemanticRevision(revision.revisionId(), revision.modelId(), revision.revisionSequence(), revision.profileBinding(),
                revision.rootContextId(), elements, revision.features(), revision.states(), List.of(classification), List.of(expandedRoot), occurrences,
                revision.layouts(), revision.statePresentations());
        OplGrammar grammar = new OplGrammar(binding(candidate), List.of(
                new OplGrammar.Template("opl.structural.classification.single.v1", "CAP-ISO-STRUCT-008", 200, "SINGLE", "{Instance} is an instance of {Class}."),
                new OplGrammar.Template("opl.structural.classification.multiple.v1", "CAP-ISO-STRUCT-008", 200, "SINGLE", "{instance-list} are instances of {Class}.")));
        return service.generate(candidate, root.id(), grammar).artifact().paragraphs().getFirst().sentences().getFirst().text();
    }

    private SemanticRevision.Element structuralObject(SemanticRevision.Fact source, String id, String name) {
        SemanticRevision.Element original = fixture().elements().getFirst();
        return new SemanticRevision.Element(id, SemanticRevision.CoreKind.OBJECT, original.capability(),
                new SemanticRevision.QualifiedName(original.name().namespace(), name), List.of(), source.source(), source.normalization());
    }

    private SemanticRevision.Element structuralProcess(SemanticRevision.Fact source, String id, String name) {
        SemanticRevision.Element original = fixture().elements().stream()
                .filter(element -> element.coreKind() == SemanticRevision.CoreKind.PROCESS).findFirst().orElseThrow();
        return new SemanticRevision.Element(id, SemanticRevision.CoreKind.PROCESS, original.capability(),
                new SemanticRevision.QualifiedName(original.name().namespace(), name), List.of(), source.source(), source.normalization());
    }

    private List<String> append(List<String> values, String value) {
        List<String> result = new ArrayList<>(values);
        result.add(value);
        return result;
    }

    private List<SemanticRevision.Occurrence> appendOccurrence(
            List<SemanticRevision.Occurrence> values,
            SemanticRevision.Occurrence value) {
        List<SemanticRevision.Occurrence> result = new ArrayList<>(values);
        result.add(value);
        return result;
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

    private static OplTextTrace copyTrace(
            OplTextTrace source,
            List<OplTextTrace.TokenRange> tokenRanges,
            List<OplToken.SourceRef> sourceRefs) {
        return new OplTextTrace(source.traceId(), source.contextId(), source.factIds(), source.inputElementIds(),
                source.occurrenceIds(), source.sentenceIds(), source.ruleIds(), source.bindingDigest(), tokenRanges, sourceRefs);
    }

    private static List<Integer> endpointOrdinals(OplTextTrace trace) {
        return trace.sourceRefs().stream().filter(ref -> ref.sourceKind() == OplToken.SourceKind.ENDPOINT)
                .map(OplToken.SourceRef::endpointOrdinal).toList();
    }

    private static List<String> labelPaths(OplTextTrace trace) {
        return trace.sourceRefs().stream().filter(ref -> ref.sourceKind() == OplToken.SourceKind.FACT)
                .map(OplToken.SourceRef::fieldPath).filter(path -> path != null && path.startsWith("labels[slot_id=")).toList();
    }

    private static List<Integer> tokenEndpointOrdinals(OplToken token) {
        return token.sourceRefs().stream().filter(ref -> ref.sourceKind() == OplToken.SourceKind.ENDPOINT)
                .map(OplToken.SourceRef::endpointOrdinal).toList();
    }

    private static Stream<Arguments> legacyTokenKinds() {
        return Stream.of(Arguments.of(OplToken.Kind.PROCESS), Arguments.of(OplToken.Kind.OBJECT));
    }

    private static Stream<Arguments> requiredFactAndCapabilitySources() {
        return Stream.of(Arguments.of(OplToken.SourceKind.FACT), Arguments.of(OplToken.SourceKind.CAPABILITY));
    }

    private static Stream<Arguments> endpointDerivedSourceCases() {
        return Stream.of(
                Arguments.of("element", "g-opl-proc-001-consumption-object-pass.json", OplToken.SourceKind.ELEMENT),
                Arguments.of("feature", "g-opl-struct-006-characterization-object-mixed-a1-o2-complete-pass.json", OplToken.SourceKind.FEATURE));
    }

    private static Stream<Arguments> requiredControlModifierIds() {
        return Stream.of(Arguments.of("control.capability"), Arguments.of("control.segment"));
    }

    private static Stream<Arguments> requiredStateAndOccurrenceSourceCases() {
        return Stream.of(
                Arguments.of("state", OplToken.SourceKind.STATE, null, null),
                Arguments.of("state owner", OplToken.SourceKind.STATE, null, "owner_element_id"),
                Arguments.of("final owner occurrence", OplToken.SourceKind.OCCURRENCE, "occurrence.raw", null));
    }

    private static List<OplToken.SourceRef> swapFirstTwoEndpoints(List<OplToken.SourceRef> refs) {
        List<OplToken.SourceRef> result = new ArrayList<>(refs);
        List<Integer> endpointIndexes = new ArrayList<>();
        for (int index = 0; index < result.size(); index++) {
            if (result.get(index).sourceKind() == OplToken.SourceKind.ENDPOINT) endpointIndexes.add(index);
        }
        java.util.Collections.swap(result, endpointIndexes.getFirst(), endpointIndexes.get(1));
        return result;
    }

    private static OplTextArtifact artifactWithFirstTokenSources(
            ActiveTraceFixture fixture,
            UnaryOperator<List<OplToken.SourceRef>> sourceRefs) {
        OplSentence source = fixture.artifact().paragraphs().getFirst().sentences().getFirst();
        OplToken first = source.tokens().getFirst();
        OplToken replacement = new OplToken(first.tokenId(), first.sentenceId(), first.ordinal(), first.text(), first.kind(),
                first.startUtf8Byte(), first.endUtf8Byte(), sourceRefs.apply(first.sourceRefs()));
        OplSentence sentence = new OplSentence(source.sentenceId(), source.text(), source.ordinal(), List.of(replacement, source.tokens().get(1)),
                source.generationRuleIds(), source.inputFactIds());
        return artifactWithSentence(fixture, sentence);
    }

    private static List<OplToken.SourceRef> appendSourceRef(List<OplToken.SourceRef> refs, OplToken.SourceRef ref) {
        List<OplToken.SourceRef> result = new ArrayList<>(refs);
        result.add(ref);
        return result;
    }

    private static Stream<Arguments> invalidActiveTraceInputs() {
        ActiveTraceFixture fixture = activeTraceFixture();
        OplSentence source = fixture.artifact().paragraphs().getFirst().sentences().getFirst();
        OplToken first = source.tokens().getFirst();
        OplToken period = source.tokens().get(1);

        OplSentence ordinalGap = new OplSentence(source.sentenceId(), source.text(), source.ordinal(), List.of(
                new OplToken(first.tokenId(), first.sentenceId(), 1, first.text(), first.kind(), first.startUtf8Byte(), first.endUtf8Byte(), first.sourceRefs()),
                period), source.generationRuleIds(), source.inputFactIds());
        OplSentence wrongSentence = new OplSentence(source.sentenceId(), source.text(), source.ordinal(), List.of(
                new OplToken(first.tokenId(), "sentence.other", first.ordinal(), first.text(), first.kind(), first.startUtf8Byte(), first.endUtf8Byte(), first.sourceRefs()),
                period), source.generationRuleIds(), source.inputFactIds());
        OplSentence byteGap = new OplSentence(source.sentenceId(), source.text(), source.ordinal(), List.of(
                new OplToken(first.tokenId(), first.sentenceId(), first.ordinal(), "Inpu", first.kind(), 0, 4, first.sourceRefs()),
                period), source.generationRuleIds(), source.inputFactIds());
        OplSentence byteOverlap = new OplSentence(source.sentenceId(), source.text(), source.ordinal(), List.of(
                first,
                new OplToken(period.tokenId(), period.sentenceId(), period.ordinal(), period.text(), period.kind(), 4, 5, period.sourceRefs())),
                source.generationRuleIds(), source.inputFactIds());
        OplSentence beyondEnd = new OplSentence(source.sentenceId(), source.text(), source.ordinal(), List.of(
                first,
                new OplToken(period.tokenId(), period.sentenceId(), period.ordinal(), period.text(), period.kind(), 5, 7, period.sourceRefs())),
                source.generationRuleIds(), source.inputFactIds());
        OplSentence multibyteInterior = new OplSentence("sentence.unicode", "处理.", 0, List.of(
                new OplToken("token.unicode.entity", "sentence.unicode", 0, "处理", OplToken.Kind.ENTITY, 0, 5, first.sourceRefs()),
                new OplToken("token.unicode.period", "sentence.unicode", 1, ".", OplToken.Kind.PUNCTUATION, 6, 7, period.sourceRefs())),
                source.generationRuleIds(), source.inputFactIds());

        return Stream.of(
                Arguments.of("TTRACE-MUT-001", artifactWithSentence(fixture, ordinalGap), fixture.trace()),
                Arguments.of("TTRACE-MUT-002", artifactWithSentence(fixture, wrongSentence), fixture.trace()),
                Arguments.of("TTRACE-MUT-003", artifactWithSentence(fixture, byteGap), fixture.trace()),
                Arguments.of("TTRACE-MUT-004", artifactWithSentence(fixture, byteOverlap), fixture.trace()),
                Arguments.of("TTRACE-MUT-005", artifactWithSentence(fixture, beyondEnd), fixture.trace()),
                Arguments.of("TTRACE-MUT-006", artifactWithSentence(fixture, multibyteInterior), traceForSentence(fixture.trace(), "sentence.unicode")));
    }

    private static OplTextArtifact artifactWithSentence(ActiveTraceFixture fixture, OplSentence sentence) {
        OplTextArtifact source = fixture.artifact();
        return new OplTextArtifact(source.artifactId(), source.inputRevisionId(), source.grammarBinding(), source.contextId(),
                List.of(new OplParagraph("paragraph.active", source.contextId(), 0, List.of(sentence))), source.artifactDigest());
    }

    private static OplTextTrace traceForSentence(OplTextTrace source, String sentenceId) {
        return new OplTextTrace(source.traceId(), source.contextId(), source.factIds(), source.inputElementIds(), source.occurrenceIds(),
                List.of(sentenceId), source.ruleIds(), source.bindingDigest(), source.tokenRanges(), source.sourceRefs());
    }

    private static ActiveTraceFixture activeTraceFixture() {
        String bindingDigest = "a".repeat(64);
        OplGrammar.Binding grammar = new OplGrammar.Binding("grammar.active", "0.2.0", bindingDigest);
        List<OplToken.SourceRef> refs = List.of(
                new OplToken.SourceRef(OplToken.SourceKind.FACT, "fact.active", null, null, "SINGLE"),
                new OplToken.SourceRef(OplToken.SourceKind.ENDPOINT, "endpoint.active", "target_id", 0, "SINGLE"),
                new OplToken.SourceRef(OplToken.SourceKind.ELEMENT, "element.active", "name.local_name", 0, "SINGLE"),
                new OplToken.SourceRef(OplToken.SourceKind.OCCURRENCE, "occurrence.active", null, null, "SINGLE"),
                new OplToken.SourceRef(OplToken.SourceKind.TEMPLATE, "opl.active.v1", "pattern", null, "SINGLE"),
                new OplToken.SourceRef(OplToken.SourceKind.GRAMMAR, "grammar.active", "templates[template_id=opl.active.v1].pattern", null, "SINGLE"),
                new OplToken.SourceRef(OplToken.SourceKind.RULE, "rule.active", null, null, "SINGLE"));
        OplSentence sentence = new OplSentence("sentence.active", "Input.", 0, List.of(
                new OplToken("token.active.input", "sentence.active", 0, "Input", OplToken.Kind.ENTITY, 0, 5, refs),
                new OplToken("token.active.period", "sentence.active", 1, ".", OplToken.Kind.PUNCTUATION, 5, 6, refs)),
                List.of("rule.active"), List.of("fact.active"));
        OplTextArtifact artifact = new OplTextArtifact("artifact.active", "revision.active", grammar, "context.active",
                List.of(new OplParagraph("paragraph.active", "context.active", 0, List.of(sentence))), "b".repeat(64));
        OplTextTrace trace = new OplTextTrace("trace.active", "context.active", List.of("fact.active"), List.of("element.active"),
                List.of("occurrence.active"), List.of("sentence.active"), List.of("rule.active"), bindingDigest,
                List.of(
                        new OplTextTrace.TokenRange("endpoint.active", 0, 6),
                        new OplTextTrace.TokenRange("element.active", 0, 6),
                        new OplTextTrace.TokenRange("occurrence.active", 0, 6),
                        new OplTextTrace.TokenRange("fact.active", 0, 6)), refs);
        return new ActiveTraceFixture(artifact, trace, bindingDigest);
    }

    private ActiveGenerationFixture activeGenerationFixture(String fixtureName) {
        Path profileRoot = findFromRepository("packages/profiles/profile.iso19450.2024.draft/0.2.0/profile.json").getParent();
        SemanticRevision revision = new SemanticRevisionReader().read(profileRoot.resolve("golden/fixtures").resolve(fixtureName));
        TextGenerationAssets assets = new ProfilePackageAssembler(new FileProfilePackageLoader(profileRoot.getParent().getParent()))
                .assemble(revision.profileBinding());
        return new ActiveGenerationFixture(revision, assets, service.generate(revision, revision.rootContextId(), assets));
    }

    private static MutatedGeneration mutateSources(
            OplGenerationResult generated,
            Predicate<OplToken.SourceRef> remove,
            UnaryOperator<OplToken.SourceRef> rewrite) {
        List<OplParagraph> paragraphs = new ArrayList<>();
        java.util.Map<String, OplSentence> sentences = new java.util.LinkedHashMap<>();
        for (OplParagraph paragraph : generated.artifact().paragraphs()) {
            List<OplSentence> rewritten = new ArrayList<>();
            for (OplSentence sentence : paragraph.sentences()) {
                List<OplToken> tokens = sentence.tokens().stream().map(token -> new OplToken(token.tokenId(), token.sentenceId(), token.ordinal(),
                        token.text(), token.kind(), token.startUtf8Byte(), token.endUtf8Byte(), token.sourceRefs().stream()
                        .filter(remove.negate()).map(rewrite).toList())).toList();
                OplSentence replacement = new OplSentence(sentence.sentenceId(), sentence.text(), sentence.ordinal(), tokens,
                        sentence.generationRuleIds(), sentence.inputFactIds());
                rewritten.add(replacement);
                sentences.put(replacement.sentenceId(), replacement);
            }
            paragraphs.add(new OplParagraph(paragraph.paragraphId(), paragraph.contextId(), paragraph.ordinal(), rewritten));
        }
        OplTextArtifact artifact = new OplTextArtifact(generated.artifact().artifactId(), generated.artifact().inputRevisionId(),
                generated.artifact().grammarBinding(), generated.artifact().contextId(), paragraphs, generated.artifact().artifactDigest());
        List<OplTextTrace> traces = generated.traces().stream().map(trace -> {
            OplSentence sentence = sentences.get(trace.sentenceIds().getFirst());
            List<OplToken.SourceRef> sourceRefs = new ArrayList<>();
            sentence.tokens().forEach(token -> sourceRefs.addAll(token.sourceRefs()));
            return new OplTextTrace(trace.traceId(), trace.contextId(), trace.factIds(), trace.inputElementIds(), trace.occurrenceIds(),
                    trace.sentenceIds(), trace.ruleIds(), trace.bindingDigest(), trace.tokenRanges(), List.copyOf(new LinkedHashSet<>(sourceRefs)));
        }).toList();
        return new MutatedGeneration(artifact, traces);
    }

    private static MutatedGeneration mutateListSeparatorSources(
            OplGenerationResult generated,
            Predicate<OplToken.SourceRef> remove) {
        return rewriteListSeparatorSources(generated, ref -> remove.test(ref) ? null : ref);
    }

    private static MutatedGeneration rewriteListSeparatorSources(
            OplGenerationResult generated,
            Predicate<OplToken.SourceRef> rewritePredicate,
            UnaryOperator<OplToken.SourceRef> rewrite) {
        return rewriteListSeparatorSources(generated, ref -> rewritePredicate.test(ref) ? rewrite.apply(ref) : ref);
    }

    private static MutatedGeneration rewriteListSeparatorSources(
            OplGenerationResult generated,
            UnaryOperator<OplToken.SourceRef> transform) {
        List<OplParagraph> paragraphs = new ArrayList<>();
        java.util.Map<String, OplSentence> sentences = new java.util.LinkedHashMap<>();
        for (OplParagraph paragraph : generated.artifact().paragraphs()) {
            List<OplSentence> rewritten = new ArrayList<>();
            for (OplSentence sentence : paragraph.sentences()) {
                List<OplToken> tokens = sentence.tokens().stream().map(token -> new OplToken(token.tokenId(), token.sentenceId(), token.ordinal(),
                        token.text(), token.kind(), token.startUtf8Byte(), token.endUtf8Byte(), token.kind() == OplToken.Kind.LIST_SEPARATOR
                        ? token.sourceRefs().stream().map(transform).filter(java.util.Objects::nonNull).toList() : token.sourceRefs())).toList();
                OplSentence replacement = new OplSentence(sentence.sentenceId(), sentence.text(), sentence.ordinal(), tokens,
                        sentence.generationRuleIds(), sentence.inputFactIds());
                rewritten.add(replacement);
                sentences.put(replacement.sentenceId(), replacement);
            }
            paragraphs.add(new OplParagraph(paragraph.paragraphId(), paragraph.contextId(), paragraph.ordinal(), rewritten));
        }
        OplTextArtifact artifact = new OplTextArtifact(generated.artifact().artifactId(), generated.artifact().inputRevisionId(),
                generated.artifact().grammarBinding(), generated.artifact().contextId(), paragraphs, generated.artifact().artifactDigest());
        List<OplTextTrace> traces = generated.traces().stream().map(trace -> {
            OplSentence sentence = sentences.get(trace.sentenceIds().getFirst());
            List<OplToken.SourceRef> sourceRefs = new ArrayList<>();
            sentence.tokens().forEach(token -> sourceRefs.addAll(token.sourceRefs()));
            return new OplTextTrace(trace.traceId(), trace.contextId(), trace.factIds(), trace.inputElementIds(), trace.occurrenceIds(),
                    trace.sentenceIds(), trace.ruleIds(), trace.bindingDigest(), trace.tokenRanges(), List.copyOf(new LinkedHashSet<>(sourceRefs)));
        }).toList();
        return new MutatedGeneration(artifact, traces);
    }

    private static Path findFixture() {
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

    private Path findGoldenManifest() {
        return findFromRepository("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/opm-opl-golden-manifest.json");
    }

    private Path findFromRepository(String relativePath) {
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            Path candidate = current.resolve(relativePath);
            if (Files.isRegularFile(candidate)) return candidate;
            current = current.getParent();
        }
        throw new IllegalStateException("Repository file is not available: " + relativePath);
    }

    private record ActiveTraceFixture(OplTextArtifact artifact, OplTextTrace trace, String bindingDigest) {
    }

    private record ActiveGenerationFixture(SemanticRevision revision, TextGenerationAssets assets, OplGenerationResult generated) {
    }

    private record MutatedGeneration(OplTextArtifact artifact, List<OplTextTrace> traces) {
    }
}
