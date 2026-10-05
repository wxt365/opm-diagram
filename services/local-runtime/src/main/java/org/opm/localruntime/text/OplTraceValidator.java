package org.opm.localruntime.text;

import org.opm.localruntime.semantic.SemanticRevision;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import static org.opm.localruntime.text.OplSemanticSupport.*;
import static org.opm.localruntime.text.OplTokenPipeline.*;

/** 复核最终 Artifact/Trace；保持 ACTIVE 写入前检查与历史兼容边界。 */
final class OplTraceValidator {
    private OplTraceValidator() { }

    static void validateTrace(OplTextArtifact artifact, List<OplTextTrace> traces, String bindingDigest, boolean activeWrite) {
        List<OplSentence> sentences = artifact.paragraphs().stream()
                .flatMap(paragraph -> paragraph.sentences().stream()).toList();
        if (traces.size() != sentences.size()) {
            throw incomplete("Every generated sentence must have exactly one trace");
        }
        for (int index = 0; index < sentences.size(); index++) {
            OplSentence sentence = sentences.get(index);
            OplTextTrace trace = traces.get(index);
            if (trace.sentenceIds().size() != 1 || !sentence.sentenceId().equals(trace.sentenceIds().getFirst())) {
                throw incomplete("Trace order must match generated sentence order");
            }
            validateSentenceTokens(sentence, activeWrite);
            validateTraceSources(trace, sentence, artifact.grammarBinding(), bindingDigest, activeWrite);
            validateTokenRanges(trace, sentence, activeWrite);
        }
    }

    static void validateActiveTrace(
            SemanticRevision revision,
            TextGenerationAssets assets,
            OplTextArtifact artifact,
            List<OplTextTrace> traces) {
        validateTrace(artifact, traces, assets.bindingDigest(), true);
        Map<String, SemanticRevision.Fact> facts = index(revision.facts(), SemanticRevision.Fact::id);
        Map<String, SemanticRevision.Element> elements = index(revision.elements(), SemanticRevision.Element::id);
        Map<String, SemanticRevision.Feature> features = index(revision.features(), SemanticRevision.Feature::id);
        Map<String, SemanticRevision.State> states = index(revision.states(), SemanticRevision.State::id);
        Map<String, SemanticRevision.Context> contexts = index(revision.contexts(), SemanticRevision.Context::id);
        Map<String, SemanticRevision.Occurrence> occurrences = index(revision.occurrences(), SemanticRevision.Occurrence::id);
        List<OplSentence> sentences = artifact.paragraphs().stream()
                .flatMap(paragraph -> paragraph.sentences().stream()).toList();
        for (int index = 0; index < sentences.size(); index++) {
            OplSentence sentence = sentences.get(index);
            OplTextTrace trace = traces.get(index);
            SemanticRevision.Fact fact = facts.get(sentence.inputFactIds().getFirst());
            SemanticRevision.Context context = contexts.get(trace.contextId());
            if (fact == null || context == null || !artifact.contextId().equals(trace.contextId())
                    || !sentence.inputFactIds().equals(trace.factIds())) {
                throw incomplete("Trace Fact or Context does not match the active revision");
            }
            List<String> expectedRules = ruleIds(fact, assets);
            if (!expectedRules.equals(sentence.generationRuleIds()) || !expectedRules.equals(trace.ruleIds())) {
                throw incomplete("Trace rules must match the active capability binding in order");
            }
            String templateId = templateId(sentence);
            OplGrammar.Template template = assets.grammar().template(templateId)
                    .orElseThrow(() -> incomplete("Trace template does not exist in the active Grammar"));
            String activeCapability = activeCapabilityId(fact);
            if (!activeCapability.equals(template.capabilityId())) {
                throw incomplete("Trace template does not match the active capability binding");
            }
            List<String> expectedInputElementIds = finalInputElementIds(fact, elements, features, states);
            if (!expectedInputElementIds.equals(trace.inputElementIds())) {
                throw incomplete("Trace input elements do not resolve to the active endpoint owners");
            }
            List<String> expectedOccurrenceIds = occurrenceIds(fact, scopedOwnedOccurrences(context, occurrences), elements, features, states);
            if (!expectedOccurrenceIds.equals(trace.occurrenceIds())) {
                throw incomplete("Trace occurrences do not match the current Context ownership");
            }
            validateActiveSourceRefs(trace.sourceRefs(), fact, template, expectedRules, trace.occurrenceIds(), assets, elements, features, states, context, occurrences);
            validateListSeparatorTokens(sentence, fact, elements, features, states);
            validateExactActiveSourceCatalog(trace.sourceRefs(), fact, template, assets.grammar(), expectedRules,
                    trace.occurrenceIds(), elements, features, states);
        }
    }

    static void validateListSeparatorTokens(
            OplSentence sentence,
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        if (!fact.capability().capabilityId().startsWith("CAP-ISO-STRUCT-")) return;
        List<OplToken> tokens = sentence.tokens();
        for (int index = 0; index < tokens.size(); index++) {
            OplToken token = tokens.get(index);
            boolean listSeparator = token.kind() == OplToken.Kind.LIST_SEPARATOR;
            boolean comma = token.kind() == OplToken.Kind.PUNCTUATION && ",".equals(token.text());
            if (!listSeparator && !comma) continue;
            SemanticRevision.Endpoint left = adjacentEndpoint(tokens, index, -1, fact, elements, features, states);
            boolean completenessTail = listSeparator ? isCompletenessTail(tokens, index) : isCompletenessComma(tokens, index);
            SemanticRevision.Endpoint right = completenessTail ? null : adjacentEndpoint(tokens, index, 1, fact, elements, features, states);
            if (left == null || (!completenessTail && right == null)) continue;
            List<Integer> expectedOrdinals = right == null ? List.of(left.ordinal()) : List.of(left.ordinal(), right.ordinal());
            List<Integer> actualOrdinals = token.sourceRefs().stream().filter(ref -> ref.sourceKind() == OplToken.SourceKind.ENDPOINT)
                    .map(OplToken.SourceRef::endpointOrdinal).toList();
            boolean hasCompleteness = token.sourceRefs().stream().anyMatch(ref -> ref.sourceKind() == OplToken.SourceKind.FACT
                    && fact.id().equals(ref.stableId()) && "collection_completeness".equals(ref.fieldPath()));
            if (!expectedOrdinals.equals(actualOrdinals) || completenessTail != hasCompleteness) {
                throw incomplete("Structural list separator sources do not match adjacent endpoints or completeness");
            }
        }
    }

    static String activeCapabilityId(SemanticRevision.Fact fact) {
        return fact.modifiers().stream()
                .filter(modifier -> "control.capability".equals(modifier.id()))
                .map(SemanticRevision.Modifier::value)
                .findFirst()
                .orElse(fact.capability().capabilityId());
    }

    static void validateActiveSourceRefs(
            List<OplToken.SourceRef> refs,
            SemanticRevision.Fact fact,
            OplGrammar.Template template,
            List<String> expectedRules,
            List<String> occurrenceIds,
            TextGenerationAssets assets,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            SemanticRevision.Context context,
            Map<String, SemanticRevision.Occurrence> occurrences) {
        Set<String> contextOccurrenceIds = Set.copyOf(context.occurrenceIds());
        Set<String> expectedEndpointIds = fact.endpoints().stream().map(SemanticRevision.Endpoint::id).collect(Collectors.toSet());
        Set<String> expectedCapabilities = new LinkedHashSet<>();
        expectedCapabilities.add(fact.capability().capabilityId());
        fact.modifiers().stream().filter(modifier -> "control.capability".equals(modifier.id()))
                .map(SemanticRevision.Modifier::value).forEach(expectedCapabilities::add);
        for (OplToken.SourceRef ref : refs) {
            if (ref.sentenceSlot() == null || !Set.of("SINGLE", "FORWARD", "REVERSE", "RECIPROCAL").contains(ref.sentenceSlot())
                    || ref.sourceKind() == OplToken.SourceKind.LEGACY) {
                throw incomplete("ACTIVE trace source reference must use a concrete source kind and sentence slot");
            }
            switch (ref.sourceKind()) {
                case FACT -> validateFactSource(ref, fact);
                case CAPABILITY -> {
                    boolean baseCapability = fact.capability().capabilityId().equals(ref.stableId())
                            && "capability_ref.capability_id".equals(ref.fieldPath());
                    boolean controlCapability = fact.modifiers().stream()
                            .anyMatch(value -> "control.capability".equals(value.id()) && value.value().equals(ref.stableId()))
                            && "modifiers[modifier_id=control.capability].value".equals(ref.fieldPath());
                    if (!expectedCapabilities.contains(ref.stableId()) || !(baseCapability || controlCapability)) {
                        throw incomplete("Trace capability source does not match the active Fact");
                    }
                    requireNoEndpointOrdinal(ref);
                }
                case ENDPOINT -> {
                    SemanticRevision.Endpoint endpoint = fact.endpoints().stream()
                            .filter(value -> value.id().equals(ref.stableId())).findFirst().orElse(null);
                    if (endpoint == null || !"target_id".equals(ref.fieldPath()) || ref.endpointOrdinal() == null
                            || endpoint.ordinal() != ref.endpointOrdinal() || !expectedEndpointIds.contains(ref.stableId())) {
                        throw incomplete("Trace endpoint source does not match the active Fact endpoint");
                    }
                }
                case ELEMENT -> {
                    if (!elements.containsKey(ref.stableId()) || !"name.local_name".equals(ref.fieldPath())) {
                        throw incomplete("Trace Element source cannot be resolved");
                    }
                    validateDerivedEndpointOrdinal(ref, fact, elements, features, states);
                }
                case FEATURE -> {
                    if (!features.containsKey(ref.stableId()) || !Set.of("name.local_name", "owner_element_id", "feature_kind").contains(ref.fieldPath())) {
                        throw incomplete("Trace Feature source cannot be resolved");
                    }
                    validateDerivedEndpointOrdinal(ref, fact, elements, features, states);
                }
                case STATE -> {
                    if (!states.containsKey(ref.stableId()) || !Set.of("name.local_name", "owner_target_kind", "owner_element_id").contains(ref.fieldPath())) {
                        throw incomplete("Trace State source cannot be resolved");
                    }
                    validateDerivedEndpointOrdinal(ref, fact, elements, features, states);
                }
                case MODIFIER -> {
                    boolean present = fact.modifiers().stream().anyMatch(value -> value.id().equals(ref.stableId()));
                    if (!present || !"value".equals(ref.fieldPath())) throw incomplete("Trace Modifier source does not match the active Fact");
                    requireNoEndpointOrdinal(ref);
                }
                case OCCURRENCE -> {
                    if (!contextOccurrenceIds.contains(ref.stableId()) || !occurrences.containsKey(ref.stableId()) || ref.fieldPath() != null) {
                        throw incomplete("Trace Occurrence source is outside the active Context");
                    }
                    requireNoEndpointOrdinal(ref);
                }
                case TEMPLATE -> {
                    if (!template.templateId().equals(ref.stableId()) || !"pattern".equals(ref.fieldPath())) {
                        throw incomplete("Trace Template source does not match the active Grammar");
                    }
                    requireNoEndpointOrdinal(ref);
                }
                case GRAMMAR -> {
                    String expectedPath = grammarPath(template.templateId());
                    if (!assets.grammar().binding().id().equals(ref.stableId()) || !expectedPath.equals(ref.fieldPath())) {
                        throw incomplete("Trace Grammar source does not match the active Grammar binding");
                    }
                    requireNoEndpointOrdinal(ref);
                }
                case RULE -> {
                    if (!expectedRules.contains(ref.stableId()) || !assets.ruleSet().contains(ref.stableId())) {
                        throw incomplete("Trace Rule source does not exist in the active Rule Set");
                    }
                    requireNoEndpointOrdinal(ref);
                }
                case LEGACY -> throw incomplete("ACTIVE trace must not contain LEGACY sources");
            }
        }
        requireSource(refs, OplToken.SourceKind.FACT, fact.id());
        expectedCapabilities.forEach(capabilityId -> requireSource(refs, OplToken.SourceKind.CAPABILITY, capabilityId));
        for (SemanticRevision.Endpoint endpoint : fact.endpoints()) {
            if (refs.stream().noneMatch(ref -> ref.sourceKind() == OplToken.SourceKind.ENDPOINT
                    && endpoint.id().equals(ref.stableId()) && Integer.valueOf(endpoint.ordinal()).equals(ref.endpointOrdinal()))) {
                throw incomplete("Trace source catalog is missing a Fact endpoint");
            }
        }
        for (SemanticRevision.Modifier modifier : fact.modifiers()) {
            requireSource(refs, OplToken.SourceKind.MODIFIER, modifier.id());
        }
        validateEndpointDerivedSources(refs, fact, elements, features, states);
        validateOccurrenceSources(refs, fact, elements, features, states, context, occurrences);
        validateDirectionSources(refs, fact, template);
        expectedRules.forEach(ruleId -> requireSource(refs, OplToken.SourceKind.RULE, ruleId));
        requireSource(refs, OplToken.SourceKind.TEMPLATE, template.templateId());
        requireSource(refs, OplToken.SourceKind.GRAMMAR, assets.grammar().binding().id());
    }

    static void validateExactActiveSourceCatalog(
            List<OplToken.SourceRef> refs,
            SemanticRevision.Fact fact,
            OplGrammar.Template template,
            OplGrammar grammar,
            List<String> expectedRules,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        List<OplToken.SourceRef> expectedCatalog = activeSourceCatalog(fact, template, grammar, expectedRules, occurrenceIds, elements, features, states);
        if (!expectedCatalog.equals(refs)) {
            throw incomplete("Trace source catalog does not exactly match the active semantic source order");
        }
    }

    static void validateDirectionSources(
            List<OplToken.SourceRef> refs,
            SemanticRevision.Fact fact,
            OplGrammar.Template template) {
        if (refs.stream().anyMatch(ref -> !template.sentenceSlot().equals(ref.sentenceSlot()))) {
            throw incomplete("Trace source sentence slots do not match the sentence template");
        }
        List<String> expectedEndpointIds = sentenceEndpoints(fact, template.sentenceSlot()).stream()
                .map(SemanticRevision.Endpoint::id).toList();
        List<String> actualEndpointIds = refs.stream().filter(ref -> ref.sourceKind() == OplToken.SourceKind.ENDPOINT)
                .map(OplToken.SourceRef::stableId).toList();
        if (!expectedEndpointIds.equals(actualEndpointIds)) {
            throw incomplete("Trace endpoints do not follow the sentence-slot semantic order");
        }
        List<String> expectedLabelPaths = fact.labels().stream()
                .filter(label -> sentenceLabelSlots(fact, template.sentenceSlot()).contains(label.slotId()))
                .map(label -> "labels[slot_id=" + label.slotId() + "].text").toList();
        List<String> actualLabelPaths = refs.stream()
                .filter(ref -> ref.sourceKind() == OplToken.SourceKind.FACT && fact.id().equals(ref.stableId()))
                .map(OplToken.SourceRef::fieldPath)
                .filter(fieldPath -> fieldPath != null && fieldPath.startsWith("labels[slot_id="))
                .toList();
        if (!expectedLabelPaths.equals(actualLabelPaths)) {
            throw incomplete("Trace labels do not match the sentence-slot semantic direction");
        }
    }

    static List<String> finalInputElementIds(
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (SemanticRevision.Endpoint endpoint : fact.endpoints()) {
            ids.addAll(finalOwningElementIds(endpoint, elements, features, states));
        }
        if (ids.isEmpty()) throw incomplete("Trace endpoints do not resolve to owning Elements");
        return List.copyOf(ids);
    }

    static void validateEndpointDerivedSources(
            List<OplToken.SourceRef> refs,
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        for (SemanticRevision.Endpoint endpoint : fact.endpoints()) {
            switch (endpoint.targetKind()) {
                case ELEMENT -> {
                    if (endpoint.stateQualificationId() != null) {
                        SemanticRevision.State state = states.get(endpoint.stateQualificationId());
                        if (state == null || state.ownerTargetKind() != SemanticRevision.TargetKind.ELEMENT
                                || !endpoint.targetId().equals(state.ownerElementId())) {
                            throw incomplete("Trace state qualification does not resolve to the endpoint Element");
                        }
                        requireStateSources(refs, state, endpoint.ordinal());
                    }
                    requireSource(refs, OplToken.SourceKind.ELEMENT, endpoint.targetId(), "name.local_name", endpoint.ordinal());
                }
                case FEATURE -> {
                    SemanticRevision.Feature feature = features.get(endpoint.targetId());
                    if (feature == null || !elements.containsKey(feature.ownerElementId())) {
                        throw incomplete("Trace Feature endpoint does not resolve to an owning Element");
                    }
                    requireFeatureSources(refs, feature, endpoint.ordinal());
                    requireSource(refs, OplToken.SourceKind.ELEMENT, feature.ownerElementId(), "name.local_name", endpoint.ordinal());
                }
                case STATE -> {
                    SemanticRevision.State state = states.get(endpoint.targetId());
                    if (state == null) throw incomplete("Trace State endpoint cannot be resolved");
                    requireStateSources(refs, state, endpoint.ordinal());
                    if (state.ownerTargetKind() == SemanticRevision.TargetKind.ELEMENT) {
                        requireSource(refs, OplToken.SourceKind.ELEMENT, state.ownerElementId(), "name.local_name", endpoint.ordinal());
                    } else {
                        SemanticRevision.Feature feature = features.get(state.ownerElementId());
                        if (feature == null || !elements.containsKey(feature.ownerElementId())) {
                            throw incomplete("Trace State Feature owner cannot be resolved");
                        }
                        requireFeatureSources(refs, feature, endpoint.ordinal());
                        requireSource(refs, OplToken.SourceKind.ELEMENT, feature.ownerElementId(), "name.local_name", endpoint.ordinal());
                    }
                }
                default -> throw incomplete("Trace endpoint kind cannot resolve to an owning Element");
            }
        }
    }

    static void requireStateSources(List<OplToken.SourceRef> refs, SemanticRevision.State state, int endpointOrdinal) {
        requireSource(refs, OplToken.SourceKind.STATE, state.id(), "name.local_name", endpointOrdinal);
        requireSource(refs, OplToken.SourceKind.STATE, state.id(), "owner_target_kind", endpointOrdinal);
        requireSource(refs, OplToken.SourceKind.STATE, state.id(), "owner_element_id", endpointOrdinal);
    }

    static void requireFeatureSources(List<OplToken.SourceRef> refs, SemanticRevision.Feature feature, int endpointOrdinal) {
        requireSource(refs, OplToken.SourceKind.FEATURE, feature.id(), "name.local_name", endpointOrdinal);
        requireSource(refs, OplToken.SourceKind.FEATURE, feature.id(), "owner_element_id", endpointOrdinal);
        requireSource(refs, OplToken.SourceKind.FEATURE, feature.id(), "feature_kind", endpointOrdinal);
    }

    static void validateOccurrenceSources(
            List<OplToken.SourceRef> refs,
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            SemanticRevision.Context context,
            Map<String, SemanticRevision.Occurrence> occurrences) {
        List<String> expectedIds = occurrenceIds(fact, scopedOwnedOccurrences(context, occurrences), elements, features, states);
        List<String> expectedCatalogIds = expectedIds.stream().sorted().toList();
        List<String> sourceIds = refs.stream().filter(ref -> ref.sourceKind() == OplToken.SourceKind.OCCURRENCE)
                .map(OplToken.SourceRef::stableId).toList();
        if (!expectedCatalogIds.equals(sourceIds)) {
            throw incomplete("Trace Occurrence sources do not match the active Context ownership");
        }
        for (String occurrenceId : expectedIds) {
            SemanticRevision.Occurrence occurrence = occurrences.get(occurrenceId);
            if (occurrence == null || !context.id().equals(occurrence.contextId())
                    || occurrence.ownership() != SemanticRevision.OccurrenceOwnership.OWNED) {
                throw incomplete("Trace Occurrence source is not owned by the active Context");
            }
        }
    }

    static void requireSource(List<OplToken.SourceRef> refs, OplToken.SourceKind sourceKind, String stableId) {
        if (refs.stream().noneMatch(ref -> ref.sourceKind() == sourceKind && stableId.equals(ref.stableId()))) {
            throw incomplete("Trace source catalog is missing a required " + sourceKind + " source");
        }
    }

    static void requireSource(
            List<OplToken.SourceRef> refs,
            OplToken.SourceKind sourceKind,
            String stableId,
            String fieldPath,
            int endpointOrdinal) {
        if (refs.stream().noneMatch(ref -> ref.sourceKind() == sourceKind && stableId.equals(ref.stableId())
                && fieldPath.equals(ref.fieldPath()) && Integer.valueOf(endpointOrdinal).equals(ref.endpointOrdinal()))) {
            throw incomplete("Trace source catalog is missing a required endpoint-derived " + sourceKind + " source");
        }
    }

    static void validateFactSource(OplToken.SourceRef ref, SemanticRevision.Fact fact) {
        String fieldPath = ref.fieldPath();
        boolean allowedFieldPath = fieldPath == null || Set.of("capability_ref.capability_id", "collection_completeness",
                "source.source_kind", "source.source_entity_id").contains(fieldPath)
                || fieldPath.matches("labels\\[slot_id=[A-Za-z][A-Za-z0-9._:-]{0,127}]\\.text");
        if (!fact.id().equals(ref.stableId()) || !allowedFieldPath) {
            throw incomplete("Trace Fact source does not match the active Fact");
        }
        requireNoEndpointOrdinal(ref);
    }

    static void validateDerivedEndpointOrdinal(
            OplToken.SourceRef ref,
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        if (ref.endpointOrdinal() == null) {
            throw incomplete("Trace endpoint-derived source must carry its endpoint ordinal");
        }
        SemanticRevision.Endpoint endpoint = fact.endpoints().stream()
                .filter(value -> value.ordinal() == ref.endpointOrdinal()).findFirst().orElse(null);
        if (endpoint == null || !isDerivedFromEndpoint(ref, endpoint, elements, features, states)) {
            throw incomplete("Trace source endpoint ordinal does not match its semantic target");
        }
    }

    static boolean isDerivedFromEndpoint(
            OplToken.SourceRef ref,
            SemanticRevision.Endpoint endpoint,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        if (endpoint.targetId().equals(ref.stableId())) return true;
        SemanticRevision.State state = states.get(endpoint.targetId());
        if (state == null && endpoint.stateQualificationId() != null) state = states.get(endpoint.stateQualificationId());
        if (state != null) {
            if (state.id().equals(ref.stableId()) || state.ownerElementId().equals(ref.stableId())) return true;
            SemanticRevision.Feature owner = features.get(state.ownerElementId());
            return owner != null && owner.ownerElementId().equals(ref.stableId());
        }
        SemanticRevision.Feature feature = features.get(endpoint.targetId());
        return feature != null && feature.ownerElementId().equals(ref.stableId());
    }

    static void requireNoEndpointOrdinal(OplToken.SourceRef ref) {
        if (ref.endpointOrdinal() != null) throw incomplete("Trace source kind must not carry an endpoint ordinal");
    }

    static void validateSentenceTokens(OplSentence sentence, boolean activeWrite) {
        int expectedStart = 0;
        StringBuilder reconstructed = new StringBuilder();
        Set<Integer> boundaries = utf8Boundaries(sentence.text());
        for (int ordinal = 0; ordinal < sentence.tokens().size(); ordinal++) {
            OplToken token = sentence.tokens().get(ordinal);
            if (!sentence.sentenceId().equals(token.sentenceId()) || token.ordinal() != ordinal
                    || token.startUtf8Byte() != expectedStart || !boundaries.contains(token.startUtf8Byte())
                    || !boundaries.contains(token.endUtf8Byte())) {
                throw incomplete("Token identity or UTF-8 byte coverage is invalid");
            }
            if (activeWrite && (token.kind() == OplToken.Kind.PROCESS || token.kind() == OplToken.Kind.OBJECT)) {
                throw legacyValueForbidden("ACTIVE token kind must not use legacy PROCESS or OBJECT");
            }
            if (activeWrite && token.sourceRefs().stream()
                    .anyMatch(ref -> ref.sourceKind() == OplToken.SourceKind.LEGACY || ref.sentenceSlot() == null)) {
                throw legacyValueForbidden("ACTIVE token source reference must be concrete and slot-qualified");
            }
            if (new LinkedHashSet<>(token.sourceRefs()).size() != token.sourceRefs().size()) {
                throw incomplete("Token source references must not repeat");
            }
            reconstructed.append(token.text());
            expectedStart = token.endUtf8Byte();
        }
        if (expectedStart != sentence.text().getBytes(StandardCharsets.UTF_8).length || !sentence.text().contentEquals(reconstructed)) {
            throw incomplete("Tokens must reconstruct the complete sentence");
        }
    }

    static void validateTraceSources(
            OplTextTrace trace,
            OplSentence sentence,
            OplGrammar.Binding grammarBinding,
            String bindingDigest,
            boolean activeWrite) {
        if (!bindingDigest.equals(trace.bindingDigest())) {
            throw incomplete("Trace binding digest does not match the revision binding");
        }
        List<OplToken.SourceRef> tokenCatalog = tokenSourceCatalog(sentence);
        if (activeWrite && !trace.sourceRefs().containsAll(tokenCatalog)) {
            throw incomplete("ACTIVE trace source catalog must close every token source reference");
        }
        if (!activeWrite && !trace.sourceRefs().containsAll(tokenCatalog)) {
            throw incomplete("Trace source catalog does not close token source references");
        }
        if (new LinkedHashSet<>(trace.sourceRefs()).size() != trace.sourceRefs().size()) {
            throw incomplete("Trace source references must not repeat");
        }
        for (OplToken.SourceRef ref : trace.sourceRefs()) {
            if (activeWrite && (ref.sourceKind() == OplToken.SourceKind.LEGACY || ref.sentenceSlot() == null)) {
                throw legacyValueForbidden("ACTIVE trace source reference must be concrete and slot-qualified");
            }
            if (ref.sourceKind() == OplToken.SourceKind.GRAMMAR) {
                boolean matchesGrammar = grammarBinding.id().equals(ref.stableId())
                        && (activeWrite ? ref.fieldPath() != null && ref.fieldPath().startsWith("templates[template_id=")
                        : ref.fieldPath() != null && (ref.fieldPath().startsWith("digest=") || ref.fieldPath().startsWith("templates[template_id=")));
                if (!matchesGrammar) throw incomplete("Trace grammar source reference does not match the grammar binding");
            }
        }
    }

    static void validateTokenRanges(OplTextTrace trace, OplSentence sentence, boolean activeWrite) {
        Set<Integer> boundaries = utf8Boundaries(sentence.text());
        Set<String> uniqueRanges = new LinkedHashSet<>();
        for (OplTextTrace.TokenRange range : trace.tokenRanges()) {
            if (!boundaries.contains(range.startUtf8Byte()) || !boundaries.contains(range.endUtf8Byte())
                    || !uniqueRanges.add(range.inputId() + "\\u0000" + range.startUtf8Byte() + "\\u0000" + range.endUtf8Byte())) {
                throw incomplete("Trace token range is not a unique UTF-8 token boundary range");
            }
            boolean startsAtToken = sentence.tokens().stream().anyMatch(token -> token.startUtf8Byte() == range.startUtf8Byte());
            boolean endsAtToken = sentence.tokens().stream().anyMatch(token -> token.endUtf8Byte() == range.endUtf8Byte());
            if (activeWrite && (!startsAtToken || !endsAtToken)) {
                throw incomplete("Trace token range must align with complete tokens");
            }
            if (activeWrite) {
                List<OplToken> coveredTokens = sentence.tokens().stream()
                        .filter(token -> token.startUtf8Byte() >= range.startUtf8Byte()
                                && token.endUtf8Byte() <= range.endUtf8Byte())
                        .toList();
                boolean closesAgainstOneSource = trace.sourceRefs().stream()
                        .filter(ref -> range.inputId().equals(ref.stableId()))
                        .anyMatch(source -> !coveredTokens.isEmpty() && coveredTokens.stream()
                                .allMatch(token -> token.sourceRefs().contains(source)));
                if (!closesAgainstOneSource) {
                    throw incomplete("Trace token range must close against its source reference and covered tokens");
                }
            }
        }
        if (activeWrite) validateLocatableTokenSourcesHaveRanges(trace, sentence);
    }

    static void validateLocatableTokenSourcesHaveRanges(OplTextTrace trace, OplSentence sentence) {
        Set<OplToken.SourceKind> locatableKinds = Set.of(OplToken.SourceKind.FACT, OplToken.SourceKind.ENDPOINT,
                OplToken.SourceKind.ELEMENT, OplToken.SourceKind.FEATURE, OplToken.SourceKind.STATE,
                OplToken.SourceKind.MODIFIER, OplToken.SourceKind.OCCURRENCE);
        for (OplToken token : sentence.tokens()) {
            for (OplToken.SourceRef source : token.sourceRefs()) {
                if (!locatableKinds.contains(source.sourceKind())) continue;
                boolean covered = trace.tokenRanges().stream()
                        .filter(range -> source.stableId().equals(range.inputId())
                                && range.startUtf8Byte() <= token.startUtf8Byte()
                                && token.endUtf8Byte() <= range.endUtf8Byte())
                        .anyMatch(range -> sentence.tokens().stream()
                                .filter(candidate -> candidate.startUtf8Byte() >= range.startUtf8Byte()
                                        && candidate.endUtf8Byte() <= range.endUtf8Byte())
                                .allMatch(candidate -> candidate.sourceRefs().contains(source)));
                if (!covered) {
                    throw incomplete("Every locatable token source reference must have a closed token range");
                }
            }
        }
    }

    static Set<Integer> utf8Boundaries(String text) {
        Set<Integer> result = new LinkedHashSet<>();
        result.add(0);
        for (int offset = 0; offset < text.length();) {
            offset += Character.charCount(text.codePointAt(offset));
            result.add(utf8Offset(text, offset));
        }
        return result;
    }

}
