package org.opm.localruntime.text;

import org.opm.localruntime.golden.OplGoldenArtifactCanonicalWriter;
import org.opm.localruntime.semantic.SemanticRevision;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

public final class OplTextGenerationService {

    private static final String LEGACY_CONSUMPTION_CAPABILITY = "CAP-CONSUMPTION-001";
    private static final String CONSUMPTION_CAPABILITY = "CAP-ISO-PROC-001";
    private static final String STATE_CONSUMPTION_CAPABILITY = "CAP-ISO-PROC-006";
    private static final String CONSUMPTION_TEMPLATE = "opl.consumption.v1";
    private static final String STATE_CONSUMPTION_TEMPLATE = "opl.consumption.state.v1";
    private final OplGoldenArtifactCanonicalWriter canonicalArtifactWriter = new OplGoldenArtifactCanonicalWriter();

    public OplGenerationResult generate(SemanticRevision revision, String contextId, OplGrammar grammar) {
        Objects.requireNonNull(revision, "revision must not be null");
        requireNonBlank(contextId, "contextId");
        Objects.requireNonNull(grammar, "grammar must not be null");
        verifyGrammarBinding(revision, grammar);
        if (revision.facts().stream().anyMatch(fact -> fact.capability().capabilityId().startsWith("CAP-ISO-CTRL-"))) {
            throw failure(OplGenerationCode.MODIFIER_COMBINATION_INVALID, "Control must modify a base Procedural fact");
        }
        if (revision.facts().stream().anyMatch(fact -> fact.capability().capabilityId().startsWith("CAP-ISO-PROC-")
                || fact.capability().capabilityId().startsWith("CAP-ISO-STRUCT-"))) {
            return generateProcedural(revision, contextId, grammar);
        }

        List<SentencePlan> plans = plan(revision, contextId, grammar);
        Map<String, SemanticRevision.Fact> facts = index(revision.facts(), SemanticRevision.Fact::id);
        Map<String, SemanticRevision.Element> elements = index(revision.elements(), SemanticRevision.Element::id);
        Map<String, SemanticRevision.State> states = index(revision.states(), SemanticRevision.State::id);
        Map<String, SemanticRevision.Occurrence> occurrences = index(revision.occurrences(), SemanticRevision.Occurrence::id);
        List<OplSentence> sentences = new ArrayList<>();
        List<OplTextTrace> traces = new ArrayList<>();
        for (int ordinal = 0; ordinal < plans.size(); ordinal++) {
            SentencePlan plan = plans.get(ordinal);
            SemanticRevision.Fact fact = facts.get(plan.inputFactIds().getFirst());
            if (fact == null) throw failure(OplGenerationCode.TEXT_TRACE_INCOMPLETE, "Sentence plan fact does not exist");
            OplSentence sentence = sentence(plan.sentenceId(), composeText(plan), ordinal, fact, plan.templateId(), grammar,
                    plan.occurrenceIds(), elements, Map.of(), states, occurrences, "SINGLE");
            sentences.add(sentence);
            traces.add(trace(plan, sentence, grammar, revision.profileBinding().bindingDigest()));
        }
        OplParagraph paragraph = new OplParagraph(
                identifier("paragraph", revision.revisionId(), contextId, grammar.binding().version()),
                contextId,
                0,
                sentences);
        OplTextArtifact artifact = artifact(
                identifier("artifact", revision.revisionId(), contextId, grammar.binding().id(), grammar.binding().version(), grammar.binding().digest()),
                revision.revisionId(),
                grammar.binding(),
                contextId,
                List.of(paragraph));
        validateTrace(artifact, traces, revision.profileBinding().bindingDigest(), false);
        return new OplGenerationResult(artifact, traces);
    }

    /**
     * ACTIVE 路径必须使用已按 Revision binding 装配的资产，不接受调用方临时提供的 Grammar。
     */
    public OplGenerationResult generate(SemanticRevision revision, String contextId, TextGenerationAssets assets) {
        Objects.requireNonNull(assets, "assets must not be null");
        if (!assets.binding().equals(revision.profileBinding())) {
            throw failure(OplGenerationCode.TEXT_GRAMMAR_BINDING_MISMATCH, "Text generation assets do not match the revision binding");
        }
        OplGenerationResult generated = generate(revision, contextId, assets.grammar());
        Map<String, SemanticRevision.Fact> facts = index(revision.facts(), SemanticRevision.Fact::id);
        Map<String, SemanticRevision.Element> elements = index(revision.elements(), SemanticRevision.Element::id);
        Map<String, SemanticRevision.Feature> features = index(revision.features(), SemanticRevision.Feature::id);
        Map<String, SemanticRevision.State> states = index(revision.states(), SemanticRevision.State::id);
        Map<String, List<String>> rulesByFact = new java.util.LinkedHashMap<>();
        for (SemanticRevision.Fact fact : revision.facts()) rulesByFact.put(fact.id(), ruleIds(fact, assets));

        Map<String, OplSentence> rewrittenSentences = new java.util.LinkedHashMap<>();
        List<OplParagraph> paragraphs = new ArrayList<>();
        for (OplParagraph paragraph : generated.artifact().paragraphs()) {
            List<OplSentence> sentences = new ArrayList<>();
            for (OplSentence sentence : paragraph.sentences()) {
                SemanticRevision.Fact fact = facts.get(sentence.inputFactIds().getFirst());
                if (fact == null) throw failure(OplGenerationCode.TEXT_TRACE_INCOMPLETE, "Sentence fact does not exist");
                List<String> ruleIds = rulesByFact.get(fact.id());
                OplSentence rewritten = new OplSentence(sentence.sentenceId(), sentence.text(), sentence.ordinal(),
                        rewriteTokens(sentence.tokens(), ruleIds, assets.grammar()), ruleIds, sentence.inputFactIds());
                rewrittenSentences.put(rewritten.sentenceId(), rewritten);
                sentences.add(rewritten);
            }
            paragraphs.add(new OplParagraph(paragraph.paragraphId(), paragraph.contextId(), paragraph.ordinal(), sentences));
        }
        List<OplTextTrace> traces = new ArrayList<>();
        for (OplTextTrace trace : generated.traces()) {
            SemanticRevision.Fact fact = facts.get(trace.factIds().getFirst());
            OplSentence sentence = rewrittenSentences.get(trace.sentenceIds().getFirst());
            if (fact == null || sentence == null) throw failure(OplGenerationCode.TEXT_TRACE_INCOMPLETE, "Trace sentence or fact does not exist");
            List<String> ruleIds = rulesByFact.get(fact.id());
            OplGrammar.Template template = assets.grammar().template(templateId(sentence))
                    .orElseThrow(() -> failure(OplGenerationCode.TEXT_TRACE_INCOMPLETE, "Trace template does not exist"));
            List<OplToken.SourceRef> catalog = activeSourceCatalog(
                    fact, template, assets.grammar(), ruleIds, trace.occurrenceIds(), elements, features, states);
            traces.add(new OplTextTrace(trace.traceId(), trace.contextId(), trace.factIds(), trace.inputElementIds(), trace.occurrenceIds(),
                    trace.sentenceIds(), ruleIds, assets.bindingDigest(), tokenRanges(sentence, catalog), catalog));
        }
        OplTextArtifact artifact = artifact(generated.artifact().artifactId(), generated.artifact().inputRevisionId(),
                generated.artifact().grammarBinding(), generated.artifact().contextId(), paragraphs);
        validateActiveTrace(revision, assets, artifact, traces);
        return new OplGenerationResult(artifact, traces);
    }

    private OplGenerationResult generateProcedural(SemanticRevision revision, String contextId, OplGrammar grammar) {
        Map<String, SemanticRevision.Context> contexts = index(revision.contexts(), SemanticRevision.Context::id);
        SemanticRevision.Context context = contexts.get(contextId);
        if (context == null || context.kind() != SemanticRevision.ContextKind.SYSTEM_DIAGRAM || !revision.rootContextId().equals(contextId)) {
            throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Procedural OPL only supports the root SYSTEM_DIAGRAM context");
        }
        Map<String, SemanticRevision.Element> elements = index(revision.elements(), SemanticRevision.Element::id);
        Map<String, SemanticRevision.Feature> features = index(revision.features(), SemanticRevision.Feature::id);
        Map<String, SemanticRevision.State> states = index(revision.states(), SemanticRevision.State::id);
        Map<String, SemanticRevision.Occurrence> occurrences = index(revision.occurrences(), SemanticRevision.Occurrence::id);
        Map<String, List<SemanticRevision.Occurrence>> occurrencesByTarget = scopedOwnedOccurrences(context, occurrences);
        List<GenericPlan> plans = new ArrayList<>();
        for (SemanticRevision.Fact fact : revision.facts()) {
            if (fact.capability().capabilityId().startsWith("CAP-ISO-STRUCT-")) {
                if (isLegacyGrammar(grammar) && grammar.templates().stream()
                        .noneMatch(template -> fact.capability().capabilityId().equals(template.capabilityId()))) {
                    continue;
                }
                for (StructuralSentence structural : structuralSentences(fact, elements, features, states, revision.profileBinding().profile())) {
                    OplGrammar.Template template = grammar.template(structural.templateId()).orElse(null);
                    if (template == null) {
                        throw failure(OplGenerationCode.TEXT_TEMPLATE_MISSING, "Grammar does not provide " + structural.templateId());
                    }
                    List<String> occurrenceIds = occurrenceIds(fact, occurrencesByTarget, elements, features, states);
                    List<String> elementIds = structuralElementIds(fact, elements, features, states);
                    plans.add(new GenericPlan(fact, structural.templateId(), template.precedence(), sentenceSlotRank(template), structural.text(), elementIds, occurrenceIds, structural.primarySubjectId()));
                }
                continue;
            }
            if (!fact.capability().capabilityId().startsWith("CAP-ISO-PROC-")) {
                continue;
            }
            ControlComposition control = controlComposition(fact);
            validateProceduralEndpoints(fact, elements, states);
            if (control != null && grammar.template(control.templateId()).isEmpty() && isLegacyGrammar(grammar)) {
                control = null;
            }
            String templateId = control == null ? proceduralTemplate(fact.capability().capabilityId()) : control.templateId();
            OplGrammar.Template template = grammar.template(templateId).orElseThrow(() -> failure(OplGenerationCode.TEXT_TEMPLATE_MISSING, "Grammar does not provide " + templateId));
            List<String> occurrenceIds = occurrenceIds(fact, occurrencesByTarget, elements, features, states);
            List<String> inputElementIds = proceduralElementIds(fact, elements, states);
            String text = control == null ? proceduralText(fact, elements, states) : controlText(fact, control.controlCapabilityId(), elements, states);
            String primaryProcessId = fact.endpoints().stream().filter(endpoint -> endpoint.role().contains("PROCESS"))
                    .map(SemanticRevision.Endpoint::targetId).findFirst().orElse(fact.id());
            plans.add(new GenericPlan(fact, templateId, template.precedence(), sentenceSlotRank(template), text, inputElementIds, List.copyOf(new LinkedHashSet<>(occurrenceIds)), primaryProcessId));
        }
        plans.sort(Comparator.comparing(GenericPlan::sortKey));
        List<OplSentence> sentences = new ArrayList<>();
        List<OplTextTrace> traces = new ArrayList<>();
        for (int ordinal = 0; ordinal < plans.size(); ordinal++) {
            GenericPlan plan = plans.get(ordinal);
            String sentenceId = identifier("sentence", plan.fact().id(), plan.templateId(), grammar.binding().version(), plan.text());
            OplGrammar.Template template = grammar.template(plan.templateId()).orElseThrow();
            OplSentence sentence = sentence(sentenceId, plan.text(), ordinal, plan.fact(), plan.templateId(), grammar,
                    plan.occurrenceIds(), elements, features, states, occurrences, template.sentenceSlot());
            sentences.add(sentence);
            traces.add(genericTrace(plan, sentence, contextId, elements, features, states, grammar, revision.profileBinding().bindingDigest()));
        }
        OplParagraph paragraph = new OplParagraph(identifier("paragraph", revision.revisionId(), contextId, grammar.binding().version()), contextId, 0, sentences);
        OplTextArtifact artifact = artifact(identifier("artifact", revision.revisionId(), contextId, grammar.binding().id(), grammar.binding().version(), grammar.binding().digest()),
                revision.revisionId(), grammar.binding(), contextId, List.of(paragraph));
        validateTrace(artifact, traces, revision.profileBinding().bindingDigest(), false);
        return new OplGenerationResult(artifact, traces);
    }

    private boolean isLegacyGrammar(OplGrammar grammar) {
        return "0.1.0".equals(grammar.binding().version());
    }

    private OplTextArtifact artifact(
            String artifactId,
            String revisionId,
            OplGrammar.Binding grammarBinding,
            String contextId,
            List<OplParagraph> paragraphs) {
        OplTextArtifact provisional = new OplTextArtifact(artifactId, revisionId, grammarBinding, contextId, paragraphs, "pending");
        return new OplTextArtifact(artifactId, revisionId, grammarBinding, contextId, paragraphs,
                canonicalArtifactWriter.sha256(provisional));
    }

    private int sentenceSlotRank(OplGrammar.Template template) {
        return switch (template.sentenceSlot()) {
            case "FORWARD" -> 0;
            case "REVERSE" -> 1;
            default -> 0;
        };
    }

    private Map<String, List<SemanticRevision.Occurrence>> scopedOwnedOccurrences(
            SemanticRevision.Context context,
            Map<String, SemanticRevision.Occurrence> occurrences) {
        return context.occurrenceIds().stream().map(occurrences::get)
                .filter(Objects::nonNull)
                .filter(occurrence -> context.id().equals(occurrence.contextId()))
                .filter(occurrence -> occurrence.ownership() == SemanticRevision.OccurrenceOwnership.OWNED)
                .collect(Collectors.groupingBy(SemanticRevision.Occurrence::targetId));
    }

    private List<String> occurrenceIds(
            SemanticRevision.Fact fact,
            Map<String, List<SemanticRevision.Occurrence>> occurrencesByTarget,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        List<String> occurrenceIds = new ArrayList<>();
        appendOccurrenceIds(occurrenceIds, occurrencesByTarget, fact.id());
        for (SemanticRevision.Endpoint endpoint : fact.endpoints()) {
            appendOptionalOccurrenceIds(occurrenceIds, occurrencesByTarget, endpoint.targetId());
            if (endpoint.stateQualificationId() != null) {
                appendOptionalOccurrenceIds(occurrenceIds, occurrencesByTarget, endpoint.stateQualificationId());
            }
            for (String ownerId : finalOwningElementIds(endpoint, elements, features, states)) {
                appendOccurrenceIds(occurrenceIds, occurrencesByTarget, ownerId);
            }
        }
        return List.copyOf(new LinkedHashSet<>(occurrenceIds));
    }

    private List<String> finalOwningElementIds(
            SemanticRevision.Endpoint endpoint,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        if (endpoint.targetKind() == SemanticRevision.TargetKind.ELEMENT) return List.of(endpoint.targetId());
        if (endpoint.targetKind() == SemanticRevision.TargetKind.FEATURE) {
            SemanticRevision.Feature feature = features.get(endpoint.targetId());
            return feature == null ? List.of() : List.of(feature.ownerElementId());
        }
        if (endpoint.targetKind() == SemanticRevision.TargetKind.STATE) {
            SemanticRevision.State state = states.get(endpoint.targetId());
            if (state == null) return List.of();
            if (state.ownerTargetKind() == SemanticRevision.TargetKind.ELEMENT) return List.of(state.ownerElementId());
            SemanticRevision.Feature feature = features.get(state.ownerElementId());
            return feature == null ? List.of() : List.of(feature.ownerElementId());
        }
        return List.of();
    }

    private List<String> structuralElementIds(
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (SemanticRevision.Endpoint endpoint : fact.endpoints()) {
            if (endpoint.targetKind() == SemanticRevision.TargetKind.ELEMENT && elements.containsKey(endpoint.targetId())) ids.add(endpoint.targetId());
            if (endpoint.targetKind() == SemanticRevision.TargetKind.FEATURE && features.containsKey(endpoint.targetId())) ids.add(features.get(endpoint.targetId()).ownerElementId());
            if (endpoint.targetKind() == SemanticRevision.TargetKind.STATE) {
                SemanticRevision.State state = states.get(endpoint.targetId());
                if (state == null) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural state endpoint does not exist");
                if (state.ownerTargetKind() == SemanticRevision.TargetKind.ELEMENT) ids.add(state.ownerElementId());
                else {
                    SemanticRevision.Feature feature = features.get(state.ownerElementId());
                    if (feature == null) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural feature state owner does not exist");
                    ids.add(feature.ownerElementId());
                }
            }
        }
        if (ids.isEmpty()) throw failure(OplGenerationCode.TEXT_TRACE_INCOMPLETE, "Structural trace has no input elements");
        return List.copyOf(ids);
    }

    private List<StructuralSentence> structuralSentences(
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            SemanticRevision.AssetReference profile) {
        String capability = fact.capability().capabilityId();
        java.util.function.Function<String, String> name = role -> structuralName(endpoint(fact, role), elements, features, states);
        return switch (capability) {
            case "CAP-ISO-STRUCT-001" -> { requireSameThingKind(fact, elements); yield List.of(structural(fact, "opl.structural.tagged.unidirectional.v1", name.apply("STRUCTURAL_SOURCE") + " " + label(fact, "forward_tag") + " " + name.apply("STRUCTURAL_TARGET") + ".", name.apply("STRUCTURAL_SOURCE"))); }
            case "CAP-ISO-STRUCT-002" -> { requireSameThingKind(fact, elements); yield List.of(structural(fact, "opl.structural.null-tagged.unidirectional.v1", name.apply("STRUCTURAL_SOURCE") + " relates to " + name.apply("STRUCTURAL_TARGET") + ".", name.apply("STRUCTURAL_SOURCE"))); }
            case "CAP-ISO-STRUCT-003" -> { requireSameThingKind(fact, elements); yield List.of(
                    structural(fact, "opl.structural.tagged.bidirectional.forward.v1", name.apply("STRUCTURAL_SOURCE") + " " + label(fact, "forward_tag") + " " + name.apply("STRUCTURAL_TARGET") + ".", name.apply("STRUCTURAL_SOURCE")),
                    structural(fact, "opl.structural.tagged.bidirectional.reverse.v1", name.apply("STRUCTURAL_TARGET") + " " + label(fact, "reverse_tag") + " " + name.apply("STRUCTURAL_SOURCE") + ".", name.apply("STRUCTURAL_TARGET"))); }
            case "CAP-ISO-STRUCT-004" -> { requireSameThingKind(fact, elements); yield List.of(structural(fact, hasLabel(fact, "reciprocal") ? "opl.structural.tagged.reciprocal.v1" : "opl.structural.null-tagged.reciprocal.v1",
                    name.apply("STRUCTURAL_SOURCE") + " and " + name.apply("STRUCTURAL_TARGET") + (hasLabel(fact, "reciprocal") ? " are " + label(fact, "reciprocal") : " are related") + ".", name.apply("STRUCTURAL_SOURCE"))); }
            case "CAP-ISO-STRUCT-005" -> fundamentalAggregation(fact, name, elements, features, states);
            case "CAP-ISO-STRUCT-006" -> fundamentalCharacterization(fact, name, elements, features, states, profile);
            case "CAP-ISO-STRUCT-007" -> fundamentalGeneralization(fact, name, elements, features, states);
            case "CAP-ISO-STRUCT-008" -> fundamentalClassification(fact, name, elements, features, states);
            case "CAP-ISO-STRUCT-009" -> List.of(stateCharacterization(fact, name, elements, features, states));
            case "CAP-ISO-STRUCT-010" -> stateTagged(fact, name, elements, states);
            default -> throw failure(OplGenerationCode.TEXT_CAPABILITY_UNSUPPORTED, "Structural OPL does not support capability " + capability);
        };
    }

    private void requireSameThingKind(SemanticRevision.Fact fact, Map<String, SemanticRevision.Element> elements) {
        SemanticRevision.Element source = requireElement(endpoint(fact, "STRUCTURAL_SOURCE"), elements, "structural source");
        SemanticRevision.Element target = requireElement(endpoint(fact, "STRUCTURAL_TARGET"), elements, "structural target");
        if (source.coreKind() != target.coreKind()) {
            throw structuralEndpointMismatch(fact, "Tagged Structural endpoints must have the same Thing kind");
        }
    }

    private List<StructuralSentence> fundamentalAggregation(SemanticRevision.Fact fact, java.util.function.Function<String, String> name,
                                                              Map<String, SemanticRevision.Element> elements, Map<String, SemanticRevision.Feature> features, Map<String, SemanticRevision.State> states) {
        List<SemanticRevision.Endpoint> parts = sameThingFanEndpoints(fact, "WHOLE_THING", "PART_THING", elements);
        String whole = name.apply("WHOLE_THING");
        String list = joinList(parts.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList());
        boolean incomplete = fact.collectionCompleteness() == SemanticRevision.CollectionCompleteness.INCOMPLETE;
        return List.of(structural(fact, incomplete ? "opl.structural.aggregation.incomplete.v1" : "opl.structural.aggregation.complete.v1",
                whole + " consists of " + list + (incomplete ? " and at least one other part" : "") + ".", whole));
    }

    private List<StructuralSentence> fundamentalCharacterization(SemanticRevision.Fact fact, java.util.function.Function<String, String> name,
                                                                   Map<String, SemanticRevision.Element> elements, Map<String, SemanticRevision.Feature> features,
                                                                   Map<String, SemanticRevision.State> states, SemanticRevision.AssetReference profile) {
        if ("OPL_PRODUCTION".equals(fact.source().sourceKind())) {
            return explicitExhibition(fact, elements, features, states, profile);
        }
        List<SemanticRevision.Endpoint> featuresEndpoints = fanEndpoints(fact, "EXHIBITOR_THING", "FEATURE_THING");
        String exhibitor = name.apply("EXHIBITOR_THING");
        List<SemanticRevision.Endpoint> attributes = featuresEndpoints.stream().filter(endpoint -> featureKind(endpoint, features) == SemanticRevision.FeatureKind.ATTRIBUTE).toList();
        List<SemanticRevision.Endpoint> operations = featuresEndpoints.stream().filter(endpoint -> featureKind(endpoint, features) == SemanticRevision.FeatureKind.OPERATION).toList();
        boolean incomplete = fact.collectionCompleteness() == SemanticRevision.CollectionCompleteness.INCOMPLETE;
        if (!attributes.isEmpty() && !operations.isEmpty()) {
            SemanticRevision.Element exhibitorElement = requireElement(endpoint(fact, "EXHIBITOR_THING"), elements, "exhibitor");
            boolean objectFirst = exhibitorElement.coreKind() == SemanticRevision.CoreKind.OBJECT;
            List<SemanticRevision.Endpoint> primary = objectFirst ? attributes : operations;
            List<SemanticRevision.Endpoint> secondary = objectFirst ? operations : attributes;
            String primaryKind = objectFirst ? "attribute" : "operator";
            String secondaryKind = objectFirst ? "operator" : "attribute";
            String primaryList = joinList(primary.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList());
            String secondaryList = joinList(secondary.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList());
            String suffix = incomplete ? ", and at least one other " + primaryKind + ", as well as " + secondaryList
                    + ", and at least one other " + secondaryKind : ", as well as " + secondaryList;
            return List.of(structural(fact, incomplete ? "opl.structural.characterization.mixed.incomplete.v1" : "opl.structural.characterization.mixed.complete.v1",
                    exhibitor + " exhibits " + primaryList + suffix + ".", exhibitor));
        }
        List<SemanticRevision.Endpoint> sameKind = attributes.isEmpty() ? operations : attributes;
        String kind = attributes.isEmpty() ? "operator" : "attribute";
        String list = joinList(sameKind.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList());
        return List.of(structural(fact, incomplete ? "opl.structural.characterization.incomplete.v1" : "opl.structural.characterization.complete.v1",
                exhibitor + " exhibits " + list + (incomplete ? ", and at least one other " + kind : "") + ".", exhibitor));
    }

    private List<StructuralSentence> explicitExhibition(
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            SemanticRevision.AssetReference profile) {
        if (!"opl.structural.exhibition.v1".equals(fact.source().sourceEntityId())
                || !profile.id().equals(fact.source().profileId()) || !profile.version().equals(fact.source().profileVersion())
                || !profile.id().equals(fact.capability().profileId()) || !profile.version().equals(fact.capability().profileVersion())) {
            throw failure(OplGenerationCode.TEXT_PRODUCTION_IDENTITY_INVALID, "Structural Exhibition production identity is invalid");
        }
        List<SemanticRevision.Endpoint> endpoints = fact.endpoints().stream().sorted(Comparator.comparingInt(SemanticRevision.Endpoint::ordinal)).toList();
        if (endpoints.size() < 3 || fact.collectionCompleteness() != SemanticRevision.CollectionCompleteness.COMPLETE) {
            throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural Exhibition endpoints or completeness are invalid");
        }
        for (int index = 0; index < endpoints.size(); index++) {
            if (endpoints.get(index).ordinal() != index) {
                throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural Exhibition endpoint ordinals are not contiguous");
            }
        }
        SemanticRevision.Element exhibitor = requireElement(endpoints.getFirst(), elements, "exhibitor");
        List<SemanticRevision.Endpoint> featureEndpoints = endpoints.subList(1, endpoints.size());
        if (featureEndpoints.stream().map(SemanticRevision.Endpoint::targetId).distinct().count() != featureEndpoints.size()) {
            throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural Exhibition feature endpoints must be unique");
        }
        for (SemanticRevision.Endpoint endpoint : featureEndpoints) {
            SemanticRevision.Feature feature = features.get(endpoint.targetId());
            if (endpoint.targetKind() != SemanticRevision.TargetKind.FEATURE || feature == null
                    || (feature.kind() != SemanticRevision.FeatureKind.ATTRIBUTE && feature.kind() != SemanticRevision.FeatureKind.OPERATION)
                    || !exhibitor.id().equals(feature.ownerElementId())) {
                throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural Exhibition feature endpoint is invalid");
            }
        }
        SemanticRevision.Endpoint firstFeature = featureEndpoints.getFirst();
        List<SemanticRevision.Endpoint> values = featureEndpoints.subList(1, featureEndpoints.size());
        List<SemanticRevision.Endpoint> attributes = values.stream().filter(endpoint -> featureKind(endpoint, features) == SemanticRevision.FeatureKind.ATTRIBUTE).toList();
        List<SemanticRevision.Endpoint> operations = values.stream().filter(endpoint -> featureKind(endpoint, features) == SemanticRevision.FeatureKind.OPERATION).toList();
        List<SemanticRevision.Endpoint> primary = exhibitor.coreKind() == SemanticRevision.CoreKind.OBJECT ? attributes : operations;
        List<SemanticRevision.Endpoint> secondary = exhibitor.coreKind() == SemanticRevision.CoreKind.OBJECT ? operations : attributes;
        String valuesText = primary.isEmpty() || secondary.isEmpty()
                ? joinList(values.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList())
                : joinList(primary.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList()) + " as well as "
                + joinList(secondary.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList());
        return List.of(structural(fact, "opl.structural.exhibition.v1",
                structuralName(firstFeature, elements, features, states) + " of " + exhibitor.name().localName() + " is " + valuesText + ".", exhibitor.name().localName()));
    }

    private List<StructuralSentence> fundamentalGeneralization(SemanticRevision.Fact fact, java.util.function.Function<String, String> name,
                                                                 Map<String, SemanticRevision.Element> elements, Map<String, SemanticRevision.Feature> features, Map<String, SemanticRevision.State> states) {
        List<SemanticRevision.Endpoint> specialized = sameThingFanEndpoints(fact, "GENERAL_THING", "SPECIALIZED_THING", elements);
        String general = name.apply("GENERAL_THING");
        List<String> values = specialized.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList();
        boolean incomplete = fact.collectionCompleteness() == SemanticRevision.CollectionCompleteness.INCOMPLETE;
        String template = incomplete ? "opl.structural.generalization.incomplete.v1" : values.size() == 1
                ? generalizationSingleTemplate(specialized.getFirst(), endpoint(fact, "GENERAL_THING"), elements) : "opl.structural.generalization.multiple.v1";
        String text = values.size() == 1 && !incomplete ? values.getFirst() + ("opl.structural.generalization.object.single.v1".equals(template) ? " is a " : " is ") + general + "."
                : joinList(values) + (incomplete ? " and other specializations are " : " are ") + general + ".";
        return List.of(structural(fact, template, text, general));
    }

    private List<StructuralSentence> fundamentalClassification(SemanticRevision.Fact fact, java.util.function.Function<String, String> name,
                                                                 Map<String, SemanticRevision.Element> elements, Map<String, SemanticRevision.Feature> features, Map<String, SemanticRevision.State> states) {
        if (fact.collectionCompleteness() != SemanticRevision.CollectionCompleteness.NOT_APPLICABLE) throw failure(OplGenerationCode.MODIFIER_COMBINATION_INVALID, "Classification does not support completeness");
        List<SemanticRevision.Endpoint> instances = sameThingFanEndpoints(fact, "CLASS_THING", "INSTANCE_THING", elements);
        String type = name.apply("CLASS_THING");
        List<String> values = instances.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList();
        String template = values.size() == 1 ? "opl.structural.classification.single.v1" : "opl.structural.classification.multiple.v1";
        String text = values.size() == 1 ? values.getFirst() + " is an instance of " + type + "." : joinList(values) + " are instances of " + type + ".";
        return List.of(structural(fact, template, text, type));
    }

    private List<StructuralSentence> stateTagged(
            SemanticRevision.Fact fact,
            java.util.function.Function<String, String> name,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.State> states) {
        requireStateTaggedObject(endpoint(fact, "STATE_TAGGED_SOURCE"), elements, states);
        requireStateTaggedObject(endpoint(fact, "STATE_TAGGED_TARGET"), elements, states);
        String source = name.apply("STATE_TAGGED_SOURCE"); String target = name.apply("STATE_TAGGED_TARGET");
        return switch (fact.direction()) {
            case DIRECTED -> List.of(structural(fact, "opl.structural.tagged.state.unidirectional.v1", source + " " + (hasLabel(fact, "forward_tag") ? label(fact, "forward_tag") : "relates to") + " " + target + ".", source));
            case BIDIRECTIONAL -> List.of(structural(fact, "opl.structural.tagged.state.bidirectional.forward.v1", source + " " + label(fact, "forward_tag") + " " + target + ".", source),
                    structural(fact, "opl.structural.tagged.state.bidirectional.reverse.v1", target + " " + label(fact, "reverse_tag") + " " + source + ".", target));
            case UNDIRECTED -> List.of(structural(fact, "opl.structural.tagged.state.reciprocal.v1", source + " and " + target + (hasLabel(fact, "reciprocal_tag") ? " are " + label(fact, "reciprocal_tag") : " are related") + ".", source));
            default -> throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "State-tagged Structural direction is unsupported");
        };
    }

    private void requireStateTaggedObject(
            SemanticRevision.Endpoint endpoint,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.State> states) {
        SemanticRevision.Element object = endpoint.targetKind() == SemanticRevision.TargetKind.ELEMENT ? elements.get(endpoint.targetId())
                : states.containsKey(endpoint.targetId()) ? elements.get(states.get(endpoint.targetId()).ownerElementId()) : null;
        if (object == null || object.coreKind() != SemanticRevision.CoreKind.OBJECT) {
            throw structuralEndpointMismatch(null, "State-specified Tagged Structural only accepts Objects or owned Object States");
        }
    }

    private StructuralSentence stateCharacterization(
            SemanticRevision.Fact fact,
            java.util.function.Function<String, String> name,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        SemanticRevision.Endpoint specializedObject = endpoint(fact, "EXHIBITOR_THING_OR_STATE");
        SemanticRevision.Element object = specializedObject.targetKind() == SemanticRevision.TargetKind.ELEMENT ? elements.get(specializedObject.targetId()) : null;
        if (object == null || object.coreKind() != SemanticRevision.CoreKind.OBJECT) {
            throw structuralEndpointMismatch(fact, "State Characterization source must be an Object");
        }
        SemanticRevision.Endpoint valueState = endpoint(fact, "VALUE_STATE");
        SemanticRevision.State state = valueState.targetKind() == SemanticRevision.TargetKind.STATE ? states.get(valueState.targetId()) : null;
        SemanticRevision.Feature attribute = state != null && state.ownerTargetKind() == SemanticRevision.TargetKind.FEATURE ? features.get(state.ownerElementId()) : null;
        if (attribute == null || attribute.kind() != SemanticRevision.FeatureKind.ATTRIBUTE) {
            throw structuralEndpointMismatch(fact, "State Characterization requires an Attribute Value State");
        }
        if (!object.id().equals(attribute.ownerElementId())) {
            throw failure(OplGenerationCode.STATE_OWNER_MISMATCH, "State Characterization value state must belong to the specialized Object");
        }
        return structural(fact, "opl.structural.characterization.state.v1",
                name.apply("EXHIBITOR_THING_OR_STATE") + " exhibits " + state.name().localName() + " " + attribute.name().localName() + ".",
                name.apply("EXHIBITOR_THING_OR_STATE"));
    }

    private SemanticRevision.FeatureKind featureKind(SemanticRevision.Endpoint endpoint, Map<String, SemanticRevision.Feature> features) {
        SemanticRevision.Feature feature = features.get(endpoint.targetId());
        if (feature == null || (feature.kind() != SemanticRevision.FeatureKind.ATTRIBUTE && feature.kind() != SemanticRevision.FeatureKind.OPERATION)) {
            throw structuralEndpointMismatch(null, "Characterization endpoint must be an Attribute or Operation");
        }
        return feature.kind();
    }

    private String generalizationSingleTemplate(
            SemanticRevision.Endpoint specialized,
            SemanticRevision.Endpoint general,
            Map<String, SemanticRevision.Element> elements) {
        SemanticRevision.Element specializedElement = requireElement(specialized, elements, "specialized thing");
        SemanticRevision.Element generalElement = requireElement(general, elements, "general thing");
        if (specializedElement.coreKind() != generalElement.coreKind()) {
            throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Generalization endpoints must have the same Thing kind");
        }
        return specializedElement.coreKind() == SemanticRevision.CoreKind.OBJECT
                ? "opl.structural.generalization.object.single.v1" : "opl.structural.generalization.process.single.v1";
    }

    private StructuralSentence structural(SemanticRevision.Fact fact, String templateId, String text, String ignoredPrimarySubjectName) {
        String primarySubjectStableId = fact.endpoints().stream().min(Comparator.comparingInt(SemanticRevision.Endpoint::ordinal))
                .map(SemanticRevision.Endpoint::targetId)
                .orElseThrow(() -> failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural Fact has no endpoints"));
        return new StructuralSentence(templateId, text, primarySubjectStableId);
    }
    private String label(SemanticRevision.Fact fact, String slot) { return fact.labels().stream().filter(item -> slot.equals(item.slotId())).map(SemanticRevision.Label::text).findFirst().orElseThrow(() -> failure(OplGenerationCode.MODIFIER_COMBINATION_INVALID, "Structural label " + slot + " is missing")); }
    private boolean hasLabel(SemanticRevision.Fact fact, String slot) { return fact.labels().stream().anyMatch(item -> slot.equals(item.slotId())); }
    private List<SemanticRevision.Endpoint> fanEndpoints(SemanticRevision.Fact fact, String rootRole, String memberRole) { List<SemanticRevision.Endpoint> endpoints = fact.endpoints().stream().sorted(Comparator.comparingInt(SemanticRevision.Endpoint::ordinal)).toList(); if (endpoints.size() < 2 || !rootRole.equals(endpoints.getFirst().role()) || endpoints.getFirst().ordinal() != 0 || endpoints.stream().skip(1).anyMatch(endpoint -> !memberRole.equals(endpoint.role()) || endpoint.ordinal() < 1)) throw structuralEndpointMismatch(fact, "Structural fan endpoints are invalid"); for (int i = 0; i < endpoints.size(); i++) if (endpoints.get(i).ordinal() != i) throw structuralEndpointMismatch(fact, "Structural fan endpoint ordinals are not contiguous"); return endpoints.subList(1, endpoints.size()); }
    private List<SemanticRevision.Endpoint> sameThingFanEndpoints(SemanticRevision.Fact fact, String rootRole, String memberRole, Map<String, SemanticRevision.Element> elements) { List<SemanticRevision.Endpoint> members = fanEndpoints(fact, rootRole, memberRole); SemanticRevision.Element root = requireElement(endpoint(fact, rootRole), elements, rootRole); for (SemanticRevision.Endpoint member : members) if (requireElement(member, elements, memberRole).coreKind() != root.coreKind()) throw structuralEndpointMismatch(fact, "Structural fan endpoints must have the same Thing kind"); return members; }
    private String joinList(List<String> values) { if (values.isEmpty()) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural list is empty"); if (values.size() == 1) return values.getFirst(); if (values.size() == 2) return values.getFirst() + " and " + values.get(1); return String.join(", ", values.subList(0, values.size() - 1)) + " and " + values.getLast(); }
    private String structuralName(SemanticRevision.Endpoint endpoint, Map<String, SemanticRevision.Element> elements, Map<String, SemanticRevision.Feature> features, Map<String, SemanticRevision.State> states) { if (endpoint.targetKind() == SemanticRevision.TargetKind.ELEMENT) return requireElement(endpoint, elements, endpoint.role()).name().localName(); if (endpoint.targetKind() == SemanticRevision.TargetKind.FEATURE) { SemanticRevision.Feature feature = features.get(endpoint.targetId()); if (feature == null) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural feature does not exist"); return feature.name().localName(); } if (endpoint.targetKind() == SemanticRevision.TargetKind.STATE) { SemanticRevision.State state = states.get(endpoint.targetId()); if (state == null) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural state does not exist"); if (state.ownerTargetKind() == SemanticRevision.TargetKind.ELEMENT) { SemanticRevision.Element owner = elements.get(state.ownerElementId()); if (owner == null) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural state owner does not exist"); return state.name().localName() + " " + owner.name().localName(); } return state.name().localName(); } throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural endpoint kind is unsupported"); }
    private String ownerFeatureName(SemanticRevision.Endpoint endpoint, Map<String, SemanticRevision.State> states, Map<String, SemanticRevision.Feature> features) { SemanticRevision.State state = states.get(endpoint.targetId()); SemanticRevision.Feature feature = state == null ? null : features.get(state.ownerElementId()); if (feature == null) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Value state feature owner does not exist"); return feature.name().localName(); }

    private OplGenerationException structuralEndpointMismatch(SemanticRevision.Fact fact, String reason) {
        return failure(OplGenerationCode.ENDPOINT_KIND_MISMATCH, "Structural endpoint mismatch" + (fact == null ? "" : " for " + fact.id()) + ": " + reason);
    }

    private OplTextTrace genericTrace(
            GenericPlan plan,
            OplSentence sentence,
            String contextId,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            OplGrammar grammar,
            String bindingDigest) {
        List<OplTextTrace.TokenRange> ranges = new ArrayList<>();
        int cursor = 0;
        for (SemanticRevision.Endpoint endpoint : plan.fact().endpoints()) {
            String label = structuralName(endpoint, elements, features, states);
            int start = sentence.text().indexOf(label, cursor);
            if (start >= 0) {
                ranges.add(new OplTextTrace.TokenRange(endpoint.targetId(), utf8Offset(sentence.text(), start), utf8Offset(sentence.text(), start + label.length())));
                cursor = start + label.length();
            }
        }
        ranges.add(new OplTextTrace.TokenRange(plan.fact().id(), 0, sentence.text().getBytes(StandardCharsets.UTF_8).length));
        return new OplTextTrace(identifier("trace", sentence.sentenceId(), plan.fact().id()), contextId, List.of(plan.fact().id()), plan.inputElementIds(),
                plan.occurrenceIds(), List.of(sentence.sentenceId()), List.of(plan.templateId()), bindingDigest, ranges, traceSources(sentence, plan.fact(), plan.templateId(), grammar));
    }

    private List<String> proceduralElementIds(SemanticRevision.Fact fact, Map<String, SemanticRevision.Element> elements, Map<String, SemanticRevision.State> states) {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (SemanticRevision.Endpoint endpoint : fact.endpoints()) {
            if (endpoint.targetKind() == SemanticRevision.TargetKind.ELEMENT && elements.containsKey(endpoint.targetId())) ids.add(endpoint.targetId());
            if (endpoint.targetKind() == SemanticRevision.TargetKind.STATE) {
                SemanticRevision.State state = states.get(endpoint.targetId());
                if (state == null || !elements.containsKey(state.ownerElementId())) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "State endpoint owner does not exist");
                ids.add(state.ownerElementId());
            }
        }
        if (ids.isEmpty()) throw failure(OplGenerationCode.TEXT_TRACE_INCOMPLETE, "Procedural trace has no input elements");
        return List.copyOf(ids);
    }

    private String proceduralText(SemanticRevision.Fact fact, Map<String, SemanticRevision.Element> elements, Map<String, SemanticRevision.State> states) {
        java.util.function.Function<String, String> label = role -> endpointName(endpoint(fact, role), elements, states);
        return switch (fact.capability().capabilityId()) {
            case "CAP-ISO-PROC-001" -> label.apply("CONSUMING_PROCESS") + " consumes " + label.apply("CONSUMED_OBJECT") + ".";
            case "CAP-ISO-PROC-002" -> label.apply("RESULT_PROCESS") + " yields " + label.apply("RESULT_OBJECT") + ".";
            case "CAP-ISO-PROC-003" -> label.apply("AFFECTING_PROCESS") + " affects " + label.apply("AFFECTED") + ".";
            case "CAP-ISO-PROC-004" -> label.apply("AGENT_OBJECT") + " handles " + label.apply("ENABLED_PROCESS") + ".";
            case "CAP-ISO-PROC-005" -> label.apply("ENABLED_PROCESS") + " requires " + label.apply("INSTRUMENT_OBJECT") + ".";
            case "CAP-ISO-PROC-006" -> label.apply("CONSUMING_PROCESS") + " consumes " + label.apply("CONSUMED_STATE") + ".";
            case "CAP-ISO-PROC-007" -> label.apply("RESULT_PROCESS") + " yields " + label.apply("RESULT_STATE") + ".";
            case "CAP-ISO-PROC-008" -> label.apply("AFFECTING_PROCESS") + " changes "
                    + ownerName(endpoint(fact, "AFFECTEE_INPUT_STATE"), states, elements) + " from "
                    + stateName(endpoint(fact, "AFFECTEE_INPUT_STATE"), states) + " to "
                    + stateName(endpoint(fact, "AFFECTED_OUTPUT_STATE"), states) + ".";
            case "CAP-ISO-PROC-009" -> label.apply("AFFECTING_PROCESS") + " changes "
                    + label.apply("AFFECTED_OBJECT") + " from "
                    + stateName(endpoint(fact, "AFFECTEE_INPUT_STATE"), states) + ".";
            case "CAP-ISO-PROC-010" -> label.apply("AFFECTING_PROCESS") + " changes "
                    + label.apply("AFFECTEE_OBJECT") + " to "
                    + stateName(endpoint(fact, "AFFECTED_OUTPUT_STATE"), states) + ".";
            case "CAP-ISO-PROC-011" -> label.apply("AGENT_STATE") + " handles " + label.apply("ENABLED_PROCESS") + ".";
            case "CAP-ISO-PROC-012" -> label.apply("ENABLED_PROCESS") + " requires " + label.apply("INSTRUMENT_STATE") + ".";
            case "CAP-ISO-PROC-013" -> label.apply("INVOKING_PROCESS") + " invokes " + label.apply("INVOKED_PROCESS") + ".";
            case "CAP-ISO-PROC-014" -> label.apply("INVOKING_PROCESS") + " invokes itself.";
            case "CAP-ISO-PROC-015" -> "When " + label.apply("MONITORED_PROCESS") + " exceeds " + duration(fact) + ", " + label.apply("HANDLING_PROCESS") + " handles the exception.";
            case "CAP-ISO-PROC-016" -> "When " + label.apply("MONITORED_PROCESS") + " is under " + duration(fact) + ", " + label.apply("HANDLING_PROCESS") + " handles the exception.";
            default -> throw failure(OplGenerationCode.TEXT_CAPABILITY_UNSUPPORTED, "Procedural OPL does not support capability " + fact.capability().capabilityId());
        };
    }

    private String proceduralTemplate(String capabilityId) {
        return switch (capabilityId) {
            case "CAP-ISO-PROC-001" -> "opl.consumption.v1";
            case "CAP-ISO-PROC-002" -> "opl.result.v1";
            case "CAP-ISO-PROC-003" -> "opl.effect.v1";
            case "CAP-ISO-PROC-004" -> "opl.agent.v1";
            case "CAP-ISO-PROC-005" -> "opl.instrument.v1";
            case "CAP-ISO-PROC-006" -> "opl.consumption.state.v1";
            case "CAP-ISO-PROC-007" -> "opl.result.state.v1";
            case "CAP-ISO-PROC-008" -> "opl.effect.state.input-output.v1";
            case "CAP-ISO-PROC-009" -> "opl.effect.state.input.v1";
            case "CAP-ISO-PROC-010" -> "opl.effect.state.output.v1";
            case "CAP-ISO-PROC-011" -> "opl.agent.state.v1";
            case "CAP-ISO-PROC-012" -> "opl.instrument.state.v1";
            case "CAP-ISO-PROC-013" -> "opl.invocation.v1";
            case "CAP-ISO-PROC-014" -> "opl.invocation.self.v1";
            case "CAP-ISO-PROC-015" -> "opl.exception.overtime.v1";
            case "CAP-ISO-PROC-016" -> "opl.exception.undertime.v1";
            default -> throw failure(OplGenerationCode.TEXT_CAPABILITY_UNSUPPORTED, "Procedural OPL does not support capability " + capabilityId);
        };
    }

    private void validateProceduralEndpoints(
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.State> states) {
        List<ProceduralEndpointExpectation> expected = switch (fact.capability().capabilityId()) {
            case "CAP-ISO-PROC-001" -> List.of(objectEndpoint("CONSUMED_OBJECT"), processEndpoint("CONSUMING_PROCESS"));
            case "CAP-ISO-PROC-002" -> List.of(processEndpoint("RESULT_PROCESS"), objectEndpoint("RESULT_OBJECT"));
            case "CAP-ISO-PROC-003" -> List.of(objectEndpoint("AFFECTEE"), processEndpoint("AFFECTING_PROCESS"), objectEndpoint("AFFECTED"));
            case "CAP-ISO-PROC-004" -> List.of(objectEndpoint("AGENT_OBJECT"), processEndpoint("ENABLED_PROCESS"));
            case "CAP-ISO-PROC-005" -> List.of(objectEndpoint("INSTRUMENT_OBJECT"), processEndpoint("ENABLED_PROCESS"));
            case "CAP-ISO-PROC-006" -> List.of(stateEndpoint("CONSUMED_STATE"), processEndpoint("CONSUMING_PROCESS"));
            case "CAP-ISO-PROC-007" -> List.of(processEndpoint("RESULT_PROCESS"), stateEndpoint("RESULT_STATE"));
            case "CAP-ISO-PROC-008" -> List.of(stateEndpoint("AFFECTEE_INPUT_STATE"), processEndpoint("AFFECTING_PROCESS"), stateEndpoint("AFFECTED_OUTPUT_STATE"));
            case "CAP-ISO-PROC-009" -> List.of(stateEndpoint("AFFECTEE_INPUT_STATE"), processEndpoint("AFFECTING_PROCESS"), objectEndpoint("AFFECTED_OBJECT"));
            case "CAP-ISO-PROC-010" -> List.of(objectEndpoint("AFFECTEE_OBJECT"), processEndpoint("AFFECTING_PROCESS"), stateEndpoint("AFFECTED_OUTPUT_STATE"));
            case "CAP-ISO-PROC-011" -> List.of(stateEndpoint("AGENT_STATE"), processEndpoint("ENABLED_PROCESS"));
            case "CAP-ISO-PROC-012" -> List.of(stateEndpoint("INSTRUMENT_STATE"), processEndpoint("ENABLED_PROCESS"));
            case "CAP-ISO-PROC-013" -> List.of(processEndpoint("INVOKING_PROCESS"), processEndpoint("INVOKED_PROCESS"));
            case "CAP-ISO-PROC-014" -> List.of(processEndpoint("INVOKING_PROCESS"), processEndpoint("INVOKED_PROCESS"));
            case "CAP-ISO-PROC-015", "CAP-ISO-PROC-016" -> List.of(processEndpoint("MONITORED_PROCESS"), processEndpoint("HANDLING_PROCESS"));
            default -> throw failure(OplGenerationCode.TEXT_CAPABILITY_UNSUPPORTED, "Procedural OPL does not support capability " + fact.capability().capabilityId());
        };
        List<SemanticRevision.Endpoint> actual = fact.endpoints().stream().sorted(Comparator.comparingInt(SemanticRevision.Endpoint::ordinal)).toList();
        if (actual.size() != expected.size()) {
            throw endpointMismatch(fact, "endpoint count does not match the capability");
        }
        for (int ordinal = 0; ordinal < expected.size(); ordinal++) {
            SemanticRevision.Endpoint endpoint = actual.get(ordinal);
            ProceduralEndpointExpectation expectation = expected.get(ordinal);
            if (endpoint.ordinal() != ordinal || !expectation.role().equals(endpoint.role()) || !matchesEndpoint(expectation.kind(), endpoint, elements, states)) {
                throw endpointMismatch(fact, "endpoint " + ordinal + " does not match " + expectation.role());
            }
        }
        if ("CAP-ISO-PROC-014".equals(fact.capability().capabilityId()) && !actual.getFirst().targetId().equals(actual.get(1).targetId())) {
            throw endpointMismatch(fact, "self-invocation endpoints must target the same Process");
        }
    }

    private boolean matchesEndpoint(
            ProceduralEndpointKind expected,
            SemanticRevision.Endpoint endpoint,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.State> states) {
        return switch (expected) {
            case OBJECT -> endpoint.targetKind() == SemanticRevision.TargetKind.ELEMENT
                    && elements.containsKey(endpoint.targetId()) && elements.get(endpoint.targetId()).coreKind() == SemanticRevision.CoreKind.OBJECT;
            case PROCESS -> endpoint.targetKind() == SemanticRevision.TargetKind.ELEMENT
                    && elements.containsKey(endpoint.targetId()) && elements.get(endpoint.targetId()).coreKind() == SemanticRevision.CoreKind.PROCESS;
            case OBJECT_STATE -> {
                SemanticRevision.State state = endpoint.targetKind() == SemanticRevision.TargetKind.STATE ? states.get(endpoint.targetId()) : null;
                SemanticRevision.Element owner = state == null || state.ownerTargetKind() != SemanticRevision.TargetKind.ELEMENT
                        ? null : elements.get(state.ownerElementId());
                yield owner != null && owner.coreKind() == SemanticRevision.CoreKind.OBJECT;
            }
        };
    }

    private ProceduralEndpointExpectation objectEndpoint(String role) {
        return new ProceduralEndpointExpectation(role, ProceduralEndpointKind.OBJECT);
    }

    private ProceduralEndpointExpectation processEndpoint(String role) {
        return new ProceduralEndpointExpectation(role, ProceduralEndpointKind.PROCESS);
    }

    private ProceduralEndpointExpectation stateEndpoint(String role) {
        return new ProceduralEndpointExpectation(role, ProceduralEndpointKind.OBJECT_STATE);
    }

    private OplGenerationException endpointMismatch(SemanticRevision.Fact fact, String reason) {
        return failure(OplGenerationCode.ENDPOINT_KIND_MISMATCH, "Procedural endpoint mismatch for " + fact.id() + ": " + reason);
    }

    private ControlComposition controlComposition(SemanticRevision.Fact fact) {
        List<SemanticRevision.Modifier> controls = fact.modifiers().stream()
                .filter(modifier -> "control.capability".equals(modifier.id()) || "control.segment".equals(modifier.id()))
                .toList();
        if (controls.isEmpty()) {
            return null;
        }
        if (fact.modifiers().size() != 2) {
            throw failure(OplGenerationCode.MODIFIER_COMBINATION_INVALID, "Control does not allow additional modifiers");
        }
        List<String> capabilityValues = controls.stream().filter(modifier -> "control.capability".equals(modifier.id()))
                .map(SemanticRevision.Modifier::value).toList();
        List<String> segmentValues = controls.stream().filter(modifier -> "control.segment".equals(modifier.id()))
                .map(SemanticRevision.Modifier::value).toList();
        if (capabilityValues.size() != 1 || segmentValues.size() != 1) {
            throw failure(OplGenerationCode.MODIFIER_COMBINATION_INVALID, "Control requires exactly one capability and segment modifier");
        }
        if (!"PROCESS_INPUT".equals(segmentValues.getFirst())) {
            throw failure(OplGenerationCode.MODIFIER_COMBINATION_INVALID, "Control is only valid for PROCESS_INPUT");
        }
        String control = capabilityValues.getFirst();
        String base = fact.capability().capabilityId();
        String template = switch (control + ":" + base) {
            case "CAP-ISO-CTRL-001:CAP-ISO-PROC-001" -> "opl.control.event.transforming.consumption.v1";
            case "CAP-ISO-CTRL-001:CAP-ISO-PROC-003" -> "opl.control.event.transforming.effect.v1";
            case "CAP-ISO-CTRL-002:CAP-ISO-PROC-004" -> "opl.control.event.enabling.agent.v1";
            case "CAP-ISO-CTRL-002:CAP-ISO-PROC-005" -> "opl.control.event.enabling.instrument.v1";
            case "CAP-ISO-CTRL-003:CAP-ISO-PROC-006" -> "opl.control.event.transforming.state.consumption.v1";
            case "CAP-ISO-CTRL-003:CAP-ISO-PROC-008" -> "opl.control.event.transforming.state.effect.input-output.v1";
            case "CAP-ISO-CTRL-003:CAP-ISO-PROC-009" -> "opl.control.event.transforming.state.effect.input.v1";
            case "CAP-ISO-CTRL-003:CAP-ISO-PROC-010" -> "opl.control.event.transforming.state.effect.output.v1";
            case "CAP-ISO-CTRL-004:CAP-ISO-PROC-011" -> "opl.control.event.enabling.state.agent.v1";
            case "CAP-ISO-CTRL-004:CAP-ISO-PROC-012" -> "opl.control.event.enabling.state.instrument.v1";
            case "CAP-ISO-CTRL-005:CAP-ISO-PROC-001" -> "opl.control.condition.transforming.consumption.v1";
            case "CAP-ISO-CTRL-005:CAP-ISO-PROC-003" -> "opl.control.condition.transforming.effect.v1";
            case "CAP-ISO-CTRL-006:CAP-ISO-PROC-004" -> "opl.control.condition.enabling.agent.v1";
            case "CAP-ISO-CTRL-006:CAP-ISO-PROC-005" -> "opl.control.condition.enabling.instrument.v1";
            case "CAP-ISO-CTRL-007:CAP-ISO-PROC-006" -> "opl.control.condition.transforming.state.consumption.v1";
            case "CAP-ISO-CTRL-007:CAP-ISO-PROC-008" -> "opl.control.condition.transforming.state.effect.input-output.v1";
            case "CAP-ISO-CTRL-007:CAP-ISO-PROC-009" -> "opl.control.condition.transforming.state.effect.input.v1";
            case "CAP-ISO-CTRL-007:CAP-ISO-PROC-010" -> "opl.control.condition.transforming.state.effect.output.v1";
            case "CAP-ISO-CTRL-008:CAP-ISO-PROC-011" -> "opl.control.condition.enabling.state.agent.v1";
            case "CAP-ISO-CTRL-008:CAP-ISO-PROC-012" -> "opl.control.condition.enabling.state.instrument.v1";
            default -> throw failure(OplGenerationCode.MODIFIER_COMBINATION_INVALID, "Control capability does not match its base fact");
        };
        return new ControlComposition(control, template);
    }

    private String controlText(
            SemanticRevision.Fact fact,
            String controlCapabilityId,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.State> states) {
        java.util.function.Function<String, String> label = role -> endpointName(endpoint(fact, role), elements, states);
        java.util.function.Function<String, String> state = role -> stateName(endpoint(fact, role), states);
        String capability = fact.capability().capabilityId();
        return switch (controlCapabilityId + ":" + capability) {
            case "CAP-ISO-CTRL-001:CAP-ISO-PROC-001" -> label.apply("CONSUMED_OBJECT") + " initiates " + label.apply("CONSUMING_PROCESS") + ", which consumes " + label.apply("CONSUMED_OBJECT") + ".";
            case "CAP-ISO-CTRL-001:CAP-ISO-PROC-003" -> label.apply("AFFECTEE") + " initiates " + label.apply("AFFECTING_PROCESS") + ", which affects " + label.apply("AFFECTED") + ".";
            case "CAP-ISO-CTRL-002:CAP-ISO-PROC-004" -> label.apply("AGENT_OBJECT") + " initiates and handles " + label.apply("ENABLED_PROCESS") + ".";
            case "CAP-ISO-CTRL-002:CAP-ISO-PROC-005" -> label.apply("INSTRUMENT_OBJECT") + " initiates " + label.apply("ENABLED_PROCESS") + ", which requires " + label.apply("INSTRUMENT_OBJECT") + ".";
            case "CAP-ISO-CTRL-003:CAP-ISO-PROC-006" -> state.apply("CONSUMED_STATE") + " " + ownerName(endpoint(fact, "CONSUMED_STATE"), states, elements) + " initiates " + label.apply("CONSUMING_PROCESS") + ", which consumes " + ownerName(endpoint(fact, "CONSUMED_STATE"), states, elements) + ".";
            case "CAP-ISO-CTRL-003:CAP-ISO-PROC-008" -> state.apply("AFFECTEE_INPUT_STATE") + " " + ownerName(endpoint(fact, "AFFECTEE_INPUT_STATE"), states, elements) + " initiates " + label.apply("AFFECTING_PROCESS") + ", which changes " + ownerName(endpoint(fact, "AFFECTEE_INPUT_STATE"), states, elements) + " from " + state.apply("AFFECTEE_INPUT_STATE") + " to " + state.apply("AFFECTED_OUTPUT_STATE") + ".";
            case "CAP-ISO-CTRL-003:CAP-ISO-PROC-009" -> state.apply("AFFECTEE_INPUT_STATE") + " " + ownerName(endpoint(fact, "AFFECTEE_INPUT_STATE"), states, elements) + " initiates " + label.apply("AFFECTING_PROCESS") + ", which changes " + ownerName(endpoint(fact, "AFFECTED_OBJECT"), states, elements) + " from " + state.apply("AFFECTEE_INPUT_STATE") + ".";
            case "CAP-ISO-CTRL-003:CAP-ISO-PROC-010" -> label.apply("AFFECTEE_OBJECT") + " in any state initiates " + label.apply("AFFECTING_PROCESS") + ", which changes " + label.apply("AFFECTEE_OBJECT") + " to " + state.apply("AFFECTED_OUTPUT_STATE") + ".";
            case "CAP-ISO-CTRL-004:CAP-ISO-PROC-011" -> state.apply("AGENT_STATE") + " " + ownerName(endpoint(fact, "AGENT_STATE"), states, elements) + " initiates and handles " + label.apply("ENABLED_PROCESS") + ".";
            case "CAP-ISO-CTRL-004:CAP-ISO-PROC-012" -> state.apply("INSTRUMENT_STATE") + " " + ownerName(endpoint(fact, "INSTRUMENT_STATE"), states, elements) + " initiates " + label.apply("ENABLED_PROCESS") + ", which requires " + state.apply("INSTRUMENT_STATE") + " " + ownerName(endpoint(fact, "INSTRUMENT_STATE"), states, elements) + ".";
            case "CAP-ISO-CTRL-005:CAP-ISO-PROC-001" -> label.apply("CONSUMING_PROCESS") + " occurs if " + label.apply("CONSUMED_OBJECT") + " exists, in which case " + label.apply("CONSUMED_OBJECT") + " is consumed, otherwise " + label.apply("CONSUMING_PROCESS") + " is skipped.";
            case "CAP-ISO-CTRL-005:CAP-ISO-PROC-003" -> label.apply("AFFECTING_PROCESS") + " occurs if " + label.apply("AFFECTEE") + " exists, in which case " + label.apply("AFFECTING_PROCESS") + " affects " + label.apply("AFFECTED") + ", otherwise " + label.apply("AFFECTING_PROCESS") + " is skipped.";
            case "CAP-ISO-CTRL-006:CAP-ISO-PROC-004" -> label.apply("ENABLED_PROCESS") + " occurs if " + label.apply("AGENT_OBJECT") + " exists, else " + label.apply("ENABLED_PROCESS") + " is skipped.";
            case "CAP-ISO-CTRL-006:CAP-ISO-PROC-005" -> label.apply("ENABLED_PROCESS") + " occurs if " + label.apply("INSTRUMENT_OBJECT") + " exists, else " + label.apply("ENABLED_PROCESS") + " is skipped.";
            case "CAP-ISO-CTRL-007:CAP-ISO-PROC-006" -> label.apply("CONSUMING_PROCESS") + " occurs if " + ownerName(endpoint(fact, "CONSUMED_STATE"), states, elements) + " is " + state.apply("CONSUMED_STATE") + ", in which case " + ownerName(endpoint(fact, "CONSUMED_STATE"), states, elements) + " is consumed, otherwise " + label.apply("CONSUMING_PROCESS") + " is skipped.";
            case "CAP-ISO-CTRL-007:CAP-ISO-PROC-008" -> label.apply("AFFECTING_PROCESS") + " occurs if there is " + state.apply("AFFECTEE_INPUT_STATE") + " " + ownerName(endpoint(fact, "AFFECTEE_INPUT_STATE"), states, elements) + ", in which case " + label.apply("AFFECTING_PROCESS") + " changes " + ownerName(endpoint(fact, "AFFECTEE_INPUT_STATE"), states, elements) + " from " + state.apply("AFFECTEE_INPUT_STATE") + " to " + state.apply("AFFECTED_OUTPUT_STATE") + ", else " + label.apply("AFFECTING_PROCESS") + " is skipped.";
            case "CAP-ISO-CTRL-007:CAP-ISO-PROC-009" -> label.apply("AFFECTING_PROCESS") + " occurs if there is " + state.apply("AFFECTEE_INPUT_STATE") + " " + ownerName(endpoint(fact, "AFFECTEE_INPUT_STATE"), states, elements) + " in which case " + label.apply("AFFECTING_PROCESS") + " changes " + ownerName(endpoint(fact, "AFFECTED_OBJECT"), states, elements) + " from " + state.apply("AFFECTEE_INPUT_STATE") + ", else " + label.apply("AFFECTING_PROCESS") + " is skipped.";
            case "CAP-ISO-CTRL-007:CAP-ISO-PROC-010" -> label.apply("AFFECTING_PROCESS") + " occurs if " + label.apply("AFFECTEE_OBJECT") + " exists, in which case " + label.apply("AFFECTING_PROCESS") + " changes " + label.apply("AFFECTEE_OBJECT") + " to " + state.apply("AFFECTED_OUTPUT_STATE") + ", otherwise " + label.apply("AFFECTING_PROCESS") + " is skipped.";
            case "CAP-ISO-CTRL-008:CAP-ISO-PROC-011" -> label.apply("ENABLED_PROCESS") + " occurs if " + state.apply("AGENT_STATE") + " " + ownerName(endpoint(fact, "AGENT_STATE"), states, elements) + " exists, else " + label.apply("ENABLED_PROCESS") + " is skipped.";
            case "CAP-ISO-CTRL-008:CAP-ISO-PROC-012" -> label.apply("ENABLED_PROCESS") + " occurs if " + state.apply("INSTRUMENT_STATE") + " " + ownerName(endpoint(fact, "INSTRUMENT_STATE"), states, elements) + " exists, else " + label.apply("ENABLED_PROCESS") + " is skipped.";
            default -> throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Control capability does not match its base fact");
        };
    }

    private String stateName(SemanticRevision.Endpoint endpoint, Map<String, SemanticRevision.State> states) {
        String stateId = endpoint.targetKind() == SemanticRevision.TargetKind.STATE ? endpoint.targetId() : endpoint.stateQualificationId();
        SemanticRevision.State state = stateId == null ? null : states.get(stateId);
        if (state == null) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Control state is missing");
        return state.name().localName();
    }

    private String ownerName(SemanticRevision.Endpoint endpoint, Map<String, SemanticRevision.State> states, Map<String, SemanticRevision.Element> elements) {
        if (endpoint.targetKind() == SemanticRevision.TargetKind.ELEMENT) return requireElement(endpoint, elements, endpoint.role()).name().localName();
        SemanticRevision.State state = states.get(endpoint.targetId());
        SemanticRevision.Element owner = state == null ? null : elements.get(state.ownerElementId());
        if (owner == null) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Control state owner is missing");
        return owner.name().localName();
    }

    private String endpointName(SemanticRevision.Endpoint endpoint, Map<String, SemanticRevision.Element> elements, Map<String, SemanticRevision.State> states) {
        if (endpoint.targetKind() == SemanticRevision.TargetKind.ELEMENT) return requireElement(endpoint, elements, endpoint.role()).name().localName();
        if (endpoint.targetKind() == SemanticRevision.TargetKind.STATE) {
            SemanticRevision.State state = states.get(endpoint.targetId());
            SemanticRevision.Element owner = state == null ? null : elements.get(state.ownerElementId());
            if (state == null || owner == null) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "State endpoint does not exist");
            return state.name().localName() + " " + owner.name().localName();
        }
        throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Procedural endpoint must be an Element or State");
    }

    private String duration(SemanticRevision.Fact fact) {
        return fact.modifiers().stream().filter(modifier -> "duration".equals(modifier.id())).map(SemanticRevision.Modifier::value).findFirst()
                .orElseThrow(() -> failure(OplGenerationCode.INVALID_ARGUMENT, "Exception duration is missing"));
    }

    private List<SentencePlan> plan(SemanticRevision revision, String contextId, OplGrammar grammar) {
        Map<String, SemanticRevision.Context> contexts = index(revision.contexts(), SemanticRevision.Context::id);
        SemanticRevision.Context context = contexts.get(contextId);
        if (context == null || context.kind() != SemanticRevision.ContextKind.SYSTEM_DIAGRAM
                || !revision.rootContextId().equals(contextId)) {
            throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED,
                    "P0 OPL generation only supports the root SYSTEM_DIAGRAM context");
        }
        Map<String, SemanticRevision.Element> elements = index(revision.elements(), SemanticRevision.Element::id);
        Map<String, SemanticRevision.State> states = index(revision.states(), SemanticRevision.State::id);
        Map<String, SemanticRevision.Occurrence> occurrences = index(revision.occurrences(), SemanticRevision.Occurrence::id);
        List<SemanticRevision.Occurrence> scopedOccurrences = context.occurrenceIds().stream()
                .map(occurrences::get)
                .filter(Objects::nonNull)
                .toList();
        Map<String, List<SemanticRevision.Occurrence>> occurrencesByTarget = scopedOccurrences.stream()
                .collect(Collectors.groupingBy(SemanticRevision.Occurrence::targetId));

        List<SentencePlan> plans = new ArrayList<>();
        for (SemanticRevision.Fact fact : revision.facts()) {
            List<SemanticRevision.Occurrence> factOccurrences = occurrencesByTarget.get(fact.id());
            if (factOccurrences == null || factOccurrences.isEmpty()) {
                continue;
            }
            if (!isConsumption(fact.capability().capabilityId())) {
                throw failure(OplGenerationCode.TEXT_CAPABILITY_UNSUPPORTED,
                        "P0 OPL does not support capability " + fact.capability().capabilityId());
            }
            plans.add(planConsumption(fact, elements, states, occurrencesByTarget, grammar));
        }
        return plans.stream().sorted(Comparator.comparing(SentencePlan::sortKey)).toList();
    }

    private SentencePlan planConsumption(
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.State> states,
            Map<String, List<SemanticRevision.Occurrence>> occurrencesByTarget,
            OplGrammar grammar) {
        SemanticRevision.Endpoint consumed = consumptionEndpoint(fact);
        SemanticRevision.Endpoint process = endpoint(fact, "CONSUMING_PROCESS");
        SemanticRevision.Element processElement = requireElement(process, elements, "consuming process");
        ConsumptionSource source = consumedSource(consumed, elements, states);
        String templateId = source.stateName() == null ? CONSUMPTION_TEMPLATE : STATE_CONSUMPTION_TEMPLATE;
        OplGrammar.Template template = grammar.template(templateId)
                .orElseThrow(() -> failure(OplGenerationCode.TEXT_TEMPLATE_MISSING, "Grammar does not provide " + templateId));
        List<String> occurrenceIds = new ArrayList<>();
        appendOccurrenceIds(occurrenceIds, occurrencesByTarget, fact.id());
        appendOccurrenceIds(occurrenceIds, occurrencesByTarget, processElement.id());
        appendOccurrenceIds(occurrenceIds, occurrencesByTarget, source.object().id());
        if (source.stateId() != null) {
            appendOccurrenceIds(occurrenceIds, occurrencesByTarget, source.stateId());
        }
        if (occurrenceIds.isEmpty()) {
            throw failure(OplGenerationCode.TEXT_TRACE_INCOMPLETE, "Consumption trace has no scoped occurrences");
        }
        List<String> elementIds = List.of(processElement.id(), source.object().id());
        String sentenceId = identifier("sentence", fact.id(), templateId, grammar.binding().version(),
                processElement.id(), processElement.name().localName(), source.object().id(), source.object().name().localName(),
                source.stateId() == null ? "" : source.stateId(), source.stateName() == null ? "" : source.stateName());
        return new SentencePlan(
                sentenceId,
                occurrencesByTarget.get(fact.id()).getFirst().contextId(),
                templateId,
                List.of(fact.id()),
                elementIds,
                List.copyOf(occurrenceIds),
                new SentencePlan.SortKey(0, template.precedence(), processElement.id(), fact.id(), sentenceId),
                grammar.binding().version(),
                processElement.name().localName(),
                source.object().name().localName(),
                source.stateId(),
                source.stateName());
    }

    private ConsumptionSource consumedSource(
            SemanticRevision.Endpoint consumed,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.State> states) {
        if (consumed.targetKind() == SemanticRevision.TargetKind.STATE) {
            SemanticRevision.State state = states.get(consumed.targetId());
            if (state == null) {
                throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Consumed state does not exist");
            }
            SemanticRevision.Element owner = elements.get(state.ownerElementId());
            if (owner == null) {
                throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Consumed state owner does not exist");
            }
            return new ConsumptionSource(owner, state.id(), state.name().localName());
        }
        SemanticRevision.Element object = requireElement(consumed, elements, "consumed object");
        if (consumed.stateQualificationId() == null) {
            return new ConsumptionSource(object, null, null);
        }
        SemanticRevision.State state = states.get(consumed.stateQualificationId());
        if (state == null || !object.id().equals(state.ownerElementId())) {
            throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Consumed state qualification is not owned by the object");
        }
        return new ConsumptionSource(object, state.id(), state.name().localName());
    }

    private String composeText(SentencePlan plan) {
        String text = plan.processName() + " consumes " + (plan.stateName() == null ? "" : plan.stateName() + " ") + plan.objectName() + ".";
        if (!text.endsWith(".")) {
            throw failure(OplGenerationCode.TEXT_COMPOSITION_FAILED, "OPL sentence must end with an ASCII period");
        }
        return text;
    }

    private OplTextTrace trace(SentencePlan plan, OplSentence sentence, OplGrammar grammar, String bindingDigest) {
        List<OplTextTrace.TokenRange> ranges = new ArrayList<>();
        int processEnd = plan.processName().length();
        ranges.add(new OplTextTrace.TokenRange(plan.inputElementIds().getFirst(), 0, utf8Offset(sentence.text(), processEnd)));
        int objectStart = sentence.text().lastIndexOf(plan.objectName());
        ranges.add(new OplTextTrace.TokenRange(plan.inputElementIds().get(1), utf8Offset(sentence.text(), objectStart), utf8Offset(sentence.text(), objectStart + plan.objectName().length())));
        if (plan.stateName() != null) {
            int stateStart = sentence.text().indexOf(plan.stateName(), processEnd);
            ranges.add(new OplTextTrace.TokenRange(plan.stateId(), utf8Offset(sentence.text(), stateStart), utf8Offset(sentence.text(), stateStart + plan.stateName().length())));
        }
        ranges.add(new OplTextTrace.TokenRange(plan.inputFactIds().getFirst(), 0, sentence.text().getBytes(StandardCharsets.UTF_8).length));
        return new OplTextTrace(
                identifier("trace", sentence.sentenceId(), plan.inputFactIds().getFirst()),
                plan.contextId(),
                plan.inputFactIds(),
                plan.inputElementIds(),
                plan.occurrenceIds(),
                List.of(sentence.sentenceId()),
                List.of(plan.templateId()),
                bindingDigest,
                ranges,
                traceSources(sentence, null, plan.templateId(), grammar));
    }

    private OplSentence sentence(
            String sentenceId,
            String text,
            int ordinal,
            SemanticRevision.Fact fact,
            String templateId,
            OplGrammar grammar,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            Map<String, SemanticRevision.Occurrence> occurrences,
            String sentenceSlot) {
        return new OplSentence(sentenceId, text, ordinal,
                tokenize(sentenceId, text, fact, templateId, grammar, occurrenceIds, elements, features, states, occurrences, sentenceSlot),
                List.of(templateId), List.of(fact.id()));
    }

    private List<OplToken> tokenize(
            String sentenceId,
            String text,
            SemanticRevision.Fact fact,
            String templateId,
            OplGrammar grammar,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            Map<String, SemanticRevision.Occurrence> occurrences,
            String sentenceSlot) {
        List<OplToken.SourceRef> baseRefs = assetRefs(templateId, grammar, sentenceSlot);
        List<TokenSpan> spans = tokenSpans(text, fact, elements, features, states, sentenceSlot);
        List<OplToken> result = new ArrayList<>();
        int cursor = 0;
        for (TokenSpan span : spans) {
            if (cursor < span.start()) appendLiteralTokens(result, sentenceId, text, text.substring(cursor, span.start()), cursor, baseRefs);
            List<OplToken.SourceRef> refs = new ArrayList<>(baseRefs);
            refs.addAll(span.sourceRefs());
            appendToken(result, sentenceId, text, span.text(), span.kind(), span.start(), refs);
            cursor = span.end();
        }
        if (cursor < text.length()) appendLiteralTokens(result, sentenceId, text, text.substring(cursor), cursor, baseRefs);
        return semanticTokenSources(listSeparatorSources(result, text, fact, elements, features, states, sentenceSlot), fact,
                occurrenceIds, elements, features, states, occurrences, sentenceSlot);
    }

    private List<OplToken.SourceRef> assetRefs(String templateId, OplGrammar grammar, String sentenceSlot) {
        return List.of(
                source(OplToken.SourceKind.TEMPLATE, templateId, "pattern", null, sentenceSlot),
                source(OplToken.SourceKind.GRAMMAR, grammar.binding().id(), grammarPath(templateId), null, sentenceSlot));
    }

    private List<OplToken> semanticTokenSources(
            List<OplToken> tokens,
            SemanticRevision.Fact fact,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            Map<String, SemanticRevision.Occurrence> occurrences,
            String sentenceSlot) {
        List<OplToken> result = new ArrayList<>();
        for (OplToken token : tokens) {
            List<OplToken.SourceRef> refs = new ArrayList<>(token.sourceRefs());
            OplToken.Kind kind = isSentenceLabel(token.text(), fact, sentenceSlot) ? OplToken.Kind.RELATION_VERB : token.kind();
            switch (kind) {
                case ENTITY, STATE -> appendMentionSources(refs, token, fact, occurrenceIds, elements, features, states, occurrences, sentenceSlot);
                case RELATION_VERB -> appendRelationSources(refs, fact, occurrenceIds, occurrences, sentenceSlot);
                case CONTROL_KEYWORD -> appendControlSources(refs, fact, occurrenceIds, occurrences, sentenceSlot);
                case LIST_SEPARATOR -> appendListSources(refs, fact, occurrenceIds, occurrences, sentenceSlot);
                case KEYWORD -> appendKeywordSources(refs, token, fact, occurrenceIds, occurrences, sentenceSlot);
                case PUNCTUATION, WHITESPACE -> { }
                case PROCESS, OBJECT -> throw incomplete("ACTIVE tokenizer must not emit legacy Token kinds");
            }
            result.add(new OplToken(token.tokenId(), token.sentenceId(), token.ordinal(), token.text(), kind,
                    token.startUtf8Byte(), token.endUtf8Byte(), distinct(refs)));
        }
        return List.copyOf(result);
    }

    private boolean isSentenceLabel(String text, SemanticRevision.Fact fact, String sentenceSlot) {
        return fact.labels().stream().anyMatch(label -> sentenceLabelSlots(fact, sentenceSlot).contains(label.slotId())
                && label.text().equals(text));
    }

    private void appendMentionSources(
            List<OplToken.SourceRef> refs,
            OplToken token,
            SemanticRevision.Fact fact,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            Map<String, SemanticRevision.Occurrence> occurrences,
            String sentenceSlot) {
        Set<String> targets = new LinkedHashSet<>();
        for (SemanticRevision.Endpoint endpoint : sentenceEndpoints(fact, sentenceSlot)) {
            TokenMention mention = tokenMention(endpoint, elements, features, states);
            if (mention == null || !token.text().equals(mention.text())) continue;
            refs.add(source(OplToken.SourceKind.ENDPOINT, endpoint.id(), "target_id", endpoint.ordinal(), sentenceSlot));
            refs.addAll(mention.sourceRefs());
            for (OplToken.SourceRef ref : mention.sourceRefs()) {
                if (Set.of(OplToken.SourceKind.ELEMENT, OplToken.SourceKind.FEATURE, OplToken.SourceKind.STATE).contains(ref.sourceKind())) {
                    targets.add(ref.stableId());
                }
            }
        }
        appendOccurrenceSources(refs, occurrenceIds, occurrences, targets, sentenceSlot);
    }

    private void appendRelationSources(
            List<OplToken.SourceRef> refs,
            SemanticRevision.Fact fact,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Occurrence> occurrences,
            String sentenceSlot) {
        refs.add(source(OplToken.SourceKind.FACT, fact.id(), null, null, sentenceSlot));
        if ("OPL_PRODUCTION".equals(fact.source().sourceKind())
                && "opl.structural.exhibition.v1".equals(fact.source().sourceEntityId())) {
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "source.source_kind", null, sentenceSlot));
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "source.source_entity_id", null, sentenceSlot));
        }
        fact.labels().stream().filter(label -> sentenceLabelSlots(fact, sentenceSlot).contains(label.slotId())).forEach(label ->
                refs.add(source(OplToken.SourceKind.FACT, fact.id(), "labels[slot_id=" + label.slotId() + "].text", null, sentenceSlot)));
        refs.add(source(OplToken.SourceKind.CAPABILITY, fact.capability().capabilityId(), "capability_ref.capability_id", null, sentenceSlot));
        sentenceEndpoints(fact, sentenceSlot).forEach(endpoint -> refs.add(source(OplToken.SourceKind.ENDPOINT, endpoint.id(), "target_id", endpoint.ordinal(), sentenceSlot)));
        appendOccurrenceSources(refs, occurrenceIds, occurrences, Set.of(fact.id()), sentenceSlot);
        refs.add(source(OplToken.SourceKind.RULE, "rule.pending", null, null, sentenceSlot));
    }

    private void appendControlSources(
            List<OplToken.SourceRef> refs,
            SemanticRevision.Fact fact,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Occurrence> occurrences,
            String sentenceSlot) {
        refs.add(source(OplToken.SourceKind.FACT, fact.id(), null, null, sentenceSlot));
        fact.modifiers().stream().filter(modifier -> "control.capability".equals(modifier.id())).forEach(modifier ->
                refs.add(source(OplToken.SourceKind.CAPABILITY, modifier.value(), "modifiers[modifier_id=control.capability].value", null, sentenceSlot)));
        fact.modifiers().stream().filter(modifier -> modifier.id().startsWith("control.")).forEach(modifier ->
                refs.add(source(OplToken.SourceKind.MODIFIER, modifier.id(), "value", null, sentenceSlot)));
        appendOccurrenceSources(refs, occurrenceIds, occurrences, Set.of(fact.id()), sentenceSlot);
        refs.add(source(OplToken.SourceKind.RULE, "rule.pending.control", null, null, sentenceSlot));
    }

    private void appendListSources(
            List<OplToken.SourceRef> refs,
            SemanticRevision.Fact fact,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Occurrence> occurrences,
            String sentenceSlot) {
        refs.add(source(OplToken.SourceKind.FACT, fact.id(), null, null, sentenceSlot));
        refs.add(source(OplToken.SourceKind.CAPABILITY, fact.capability().capabilityId(), "capability_ref.capability_id", null, sentenceSlot));
        appendOccurrenceSources(refs, occurrenceIds, occurrences, Set.of(fact.id()), sentenceSlot);
        refs.add(source(OplToken.SourceKind.RULE, "rule.pending", null, null, sentenceSlot));
    }

    private void appendKeywordSources(
            List<OplToken.SourceRef> refs,
            OplToken token,
            SemanticRevision.Fact fact,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Occurrence> occurrences,
            String sentenceSlot) {
        boolean durationLiteral = fact.modifiers().stream()
                .anyMatch(modifier -> "duration".equals(modifier.id()) && modifier.value().equals(token.text()));
        if (durationLiteral) {
            refs.add(source(OplToken.SourceKind.MODIFIER, "duration", "value", null, sentenceSlot));
        }
        if ("itself".equals(token.text())) {
            appendRelationSources(refs, fact, occurrenceIds, occurrences, sentenceSlot);
        }
        if ("at least one other".equals(token.text())) {
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "collection_completeness", null, sentenceSlot));
            appendOccurrenceSources(refs, occurrenceIds, occurrences, Set.of(fact.id()), sentenceSlot);
            refs.add(source(OplToken.SourceKind.RULE, "rule.pending", null, null, sentenceSlot));
        }
    }

    private void appendOccurrenceSources(
            List<OplToken.SourceRef> refs,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Occurrence> occurrences,
            Set<String> targetIds,
            String sentenceSlot) {
        occurrenceIds.stream().sorted().map(occurrences::get).filter(Objects::nonNull)
                .filter(occurrence -> targetIds.contains(occurrence.targetId()))
                .forEach(occurrence -> refs.add(source(OplToken.SourceKind.OCCURRENCE, occurrence.id(), null, null, sentenceSlot)));
    }

    private List<OplToken> listSeparatorSources(
            List<OplToken> tokens,
            String sentenceText,
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            String sentenceSlot) {
        if (!fact.capability().capabilityId().startsWith("CAP-ISO-STRUCT-")) return List.copyOf(tokens);
        List<OplToken> result = new ArrayList<>();
        for (int index = 0; index < tokens.size(); index++) {
            OplToken token = tokens.get(index);
            boolean listSeparator = token.kind() == OplToken.Kind.LIST_SEPARATOR;
            boolean comma = token.kind() == OplToken.Kind.PUNCTUATION && ",".equals(token.text());
            if (!listSeparator && !comma) {
                result.add(token);
                continue;
            }
            SemanticRevision.Endpoint left = adjacentEndpoint(tokens, index, -1, fact, elements, features, states);
            boolean completenessTail = listSeparator ? isCompletenessTail(tokens, index) : isCompletenessComma(tokens, index);
            SemanticRevision.Endpoint right = completenessTail ? null : adjacentEndpoint(tokens, index, 1, fact, elements, features, states);
            if (left == null || (!completenessTail && right == null)) {
                result.add(token);
                continue;
            }
            List<OplToken.SourceRef> refs = token.sourceRefs().stream()
                    .filter(ref -> ref.sourceKind() != OplToken.SourceKind.ENDPOINT
                            && ref.sourceKind() != OplToken.SourceKind.ELEMENT
                            && ref.sourceKind() != OplToken.SourceKind.FEATURE
                            && ref.sourceKind() != OplToken.SourceKind.STATE
                            && !(ref.sourceKind() == OplToken.SourceKind.FACT
                            && "collection_completeness".equals(ref.fieldPath())))
                    .collect(Collectors.toCollection(ArrayList::new));
            refs.add(source(OplToken.SourceKind.ENDPOINT, left.id(), "target_id", left.ordinal(), sentenceSlot));
            if (right != null) refs.add(source(OplToken.SourceKind.ENDPOINT, right.id(), "target_id", right.ordinal(), sentenceSlot));
            if (completenessTail) refs.add(source(OplToken.SourceKind.FACT, fact.id(), "collection_completeness", null, sentenceSlot));
            result.add(new OplToken(token.tokenId(), token.sentenceId(), token.ordinal(), token.text(), token.kind(),
                    token.startUtf8Byte(), token.endUtf8Byte(), distinct(refs)));
        }
        return List.copyOf(result);
    }

    private boolean isCompletenessTail(List<OplToken> tokens, int separatorIndex) {
        int next = nextContentToken(tokens, separatorIndex + 1);
        return next >= 0 && (tokens.get(next).text().startsWith("at least one other") || "other".equals(tokens.get(next).text()));
    }

    private boolean isCompletenessComma(List<OplToken> tokens, int commaIndex) {
        int andIndex = nextContentToken(tokens, commaIndex + 1);
        return andIndex >= 0 && "and".equals(tokens.get(andIndex).text()) && isCompletenessTail(tokens, andIndex);
    }

    private int nextContentToken(List<OplToken> tokens, int start) {
        for (int index = start; index < tokens.size(); index++) {
            if (tokens.get(index).kind() != OplToken.Kind.WHITESPACE) return index;
        }
        return -1;
    }

    private SemanticRevision.Endpoint adjacentEndpoint(
            List<OplToken> tokens,
            int separatorIndex,
            int direction,
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        for (int index = separatorIndex + direction; index >= 0 && index < tokens.size(); index += direction) {
            OplToken candidate = tokens.get(index);
            if (candidate.kind() != OplToken.Kind.ENTITY && candidate.kind() != OplToken.Kind.STATE) continue;
            for (SemanticRevision.Endpoint endpoint : sentenceEndpoints(fact, candidate.sourceRefs().getFirst().sentenceSlot())) {
                TokenMention mention = tokenMention(endpoint, elements, features, states);
                if (mention != null && candidate.text().equals(mention.text())) return endpoint;
            }
            return null;
        }
        return null;
    }

    private List<OplToken.SourceRef> endpointDerivedRefs(
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            String sentenceSlot) {
        List<OplToken.SourceRef> refs = new ArrayList<>();
        for (SemanticRevision.Endpoint endpoint : sentenceEndpoints(fact, sentenceSlot)) {
            switch (endpoint.targetKind()) {
                case ELEMENT -> {
                    if (endpoint.stateQualificationId() != null) {
                        SemanticRevision.State state = states.get(endpoint.stateQualificationId());
                        if (state != null) appendStateSources(refs, state, endpoint.ordinal(), elements, features);
                    }
                    if (elements.containsKey(endpoint.targetId())) {
                        refs.add(source(OplToken.SourceKind.ELEMENT, endpoint.targetId(), "name.local_name", endpoint.ordinal(), sentenceSlot));
                    }
                }
                case FEATURE -> {
                    SemanticRevision.Feature feature = features.get(endpoint.targetId());
                    if (feature != null) appendFeatureSources(refs, feature, endpoint.ordinal(), sentenceSlot);
                }
                case STATE -> {
                    SemanticRevision.State state = states.get(endpoint.targetId());
                    if (state == null) continue;
                    appendStateSources(refs, state, endpoint.ordinal(), elements, features);
                    if (state.ownerTargetKind() == SemanticRevision.TargetKind.ELEMENT) {
                        if (elements.containsKey(state.ownerElementId())) {
                            refs.add(source(OplToken.SourceKind.ELEMENT, state.ownerElementId(), "name.local_name", endpoint.ordinal(), sentenceSlot));
                        }
                    } else {
                        SemanticRevision.Feature feature = features.get(state.ownerElementId());
                        if (feature != null) appendFeatureSources(refs, feature, endpoint.ordinal(), sentenceSlot);
                    }
                }
                default -> { }
            }
        }
        return distinct(refs);
    }

    private void appendFeatureSources(List<OplToken.SourceRef> refs, SemanticRevision.Feature feature, int endpointOrdinal, String sentenceSlot) {
        refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "name.local_name", endpointOrdinal, sentenceSlot));
        refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "owner_element_id", endpointOrdinal, sentenceSlot));
        refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "feature_kind", endpointOrdinal, sentenceSlot));
        refs.add(source(OplToken.SourceKind.ELEMENT, feature.ownerElementId(), "name.local_name", endpointOrdinal, sentenceSlot));
    }

    private List<TokenSpan> tokenSpans(
            String text,
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            String sentenceSlot) {
        List<TokenSpan> candidates = new ArrayList<>();
        for (SemanticRevision.Label label : fact.labels()) {
            if (!sentenceLabelSlots(fact, sentenceSlot).contains(label.slotId())) continue;
            int searchStart = 0;
            while (searchStart < text.length()) {
                int start = text.indexOf(label.text(), searchStart);
                if (start < 0) break;
                candidates.add(new TokenSpan(start, start + label.text().length(), label.text(), OplToken.Kind.RELATION_VERB,
                        List.of(source(OplToken.SourceKind.FACT, fact.id(), "labels[slot_id=" + label.slotId() + "].text", null, sentenceSlot))));
                searchStart = start + label.text().length();
            }
        }
        for (SemanticRevision.Endpoint endpoint : fact.endpoints()) {
            TokenMention mention = tokenMention(endpoint, elements, features, states);
            if (mention == null || mention.text().isEmpty()) continue;
            int searchStart = 0;
            while (searchStart < text.length()) {
                int start = text.indexOf(mention.text(), searchStart);
                if (start < 0) break;
                candidates.add(new TokenSpan(start, start + mention.text().length(), mention.text(), mention.kind(), mention.sourceRefs()));
                searchStart = start + mention.text().length();
            }
        }
        candidates.sort(Comparator.comparingInt(TokenSpan::start).thenComparing(Comparator.comparingInt(TokenSpan::end).reversed()));
        List<TokenSpan> selected = new ArrayList<>();
        for (TokenSpan candidate : candidates) {
            if (selected.isEmpty() || candidate.start() >= selected.getLast().end()) {
                selected.add(candidate);
            } else if (candidate.start() == selected.getLast().start() && candidate.end() == selected.getLast().end()) {
                TokenSpan previous = selected.removeLast();
                List<OplToken.SourceRef> refs = new ArrayList<>(previous.sourceRefs());
                refs.addAll(candidate.sourceRefs());
                selected.add(new TokenSpan(previous.start(), previous.end(), previous.text(), previous.kind(), distinct(refs)));
            }
        }
        return List.copyOf(selected);
    }

    private TokenMention tokenMention(
            SemanticRevision.Endpoint endpoint,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        List<OplToken.SourceRef> refs = new ArrayList<>();
        if (endpoint.targetKind() == SemanticRevision.TargetKind.ELEMENT) {
            SemanticRevision.Element element = elements.get(endpoint.targetId());
            if (element == null) return null;
            if (endpoint.stateQualificationId() != null) {
                SemanticRevision.State state = states.get(endpoint.stateQualificationId());
                if (state != null && element.id().equals(state.ownerElementId())) {
                    appendStateSources(refs, state, endpoint.ordinal(), elements, features);
                    refs.add(source(OplToken.SourceKind.ELEMENT, element.id(), "name.local_name", endpoint.ordinal(), null));
                    return new TokenMention(state.name().localName() + " " + element.name().localName(), OplToken.Kind.STATE, refs);
                }
            }
            refs.add(source(OplToken.SourceKind.ELEMENT, element.id(), "name.local_name", endpoint.ordinal(), null));
            return new TokenMention(element.name().localName(), OplToken.Kind.ENTITY, refs);
        }
        if (endpoint.targetKind() == SemanticRevision.TargetKind.FEATURE) {
            SemanticRevision.Feature feature = features.get(endpoint.targetId());
            if (feature == null) return null;
            refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "name.local_name", endpoint.ordinal(), null));
            refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "owner_element_id", endpoint.ordinal(), null));
            refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "feature_kind", endpoint.ordinal(), null));
            refs.add(source(OplToken.SourceKind.ELEMENT, feature.ownerElementId(), "name.local_name", endpoint.ordinal(), null));
            return new TokenMention(feature.name().localName(), OplToken.Kind.ENTITY, refs);
        }
        if (endpoint.targetKind() == SemanticRevision.TargetKind.STATE) {
            SemanticRevision.State state = states.get(endpoint.targetId());
            if (state == null) return null;
            appendStateSources(refs, state, endpoint.ordinal(), elements, features);
            if (state.ownerTargetKind() == SemanticRevision.TargetKind.ELEMENT) {
                SemanticRevision.Element owner = elements.get(state.ownerElementId());
                if (owner != null) {
                    refs.add(source(OplToken.SourceKind.ELEMENT, owner.id(), "name.local_name", endpoint.ordinal(), null));
                    return new TokenMention(state.name().localName() + " " + owner.name().localName(), OplToken.Kind.STATE, refs);
                }
            }
            if (state.ownerTargetKind() == SemanticRevision.TargetKind.FEATURE) {
                SemanticRevision.Feature owner = features.get(state.ownerElementId());
                if (owner != null) {
                    refs.add(source(OplToken.SourceKind.FEATURE, owner.id(), "name.local_name", endpoint.ordinal(), null));
                    refs.add(source(OplToken.SourceKind.FEATURE, owner.id(), "owner_element_id", endpoint.ordinal(), null));
                    refs.add(source(OplToken.SourceKind.FEATURE, owner.id(), "feature_kind", endpoint.ordinal(), null));
                    refs.add(source(OplToken.SourceKind.ELEMENT, owner.ownerElementId(), "name.local_name", endpoint.ordinal(), null));
                }
            }
            return new TokenMention(state.name().localName(), OplToken.Kind.STATE, refs);
        }
        return null;
    }

    private void appendStateSources(
            List<OplToken.SourceRef> refs,
            SemanticRevision.State state,
            int endpointOrdinal,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features) {
        refs.add(source(OplToken.SourceKind.STATE, state.id(), "name.local_name", endpointOrdinal, null));
        refs.add(source(OplToken.SourceKind.STATE, state.id(), "owner_target_kind", endpointOrdinal, null));
        refs.add(source(OplToken.SourceKind.STATE, state.id(), "owner_element_id", endpointOrdinal, null));
    }

    private void appendLiteralTokens(List<OplToken> target, String sentenceId, String sentenceText, String literal, int offset, List<OplToken.SourceRef> refs) {
        int cursor = 0;
        while (cursor < literal.length()) {
            int end;
            OplToken.Kind kind;
            char first = literal.charAt(cursor);
            if (Character.isWhitespace(first)) {
                end = cursor + 1;
                while (end < literal.length() && Character.isWhitespace(literal.charAt(end))) end++;
                kind = OplToken.Kind.WHITESPACE;
            } else if (first == '.' || first == ',') {
                end = cursor + 1;
                kind = OplToken.Kind.PUNCTUATION;
            } else {
                String phrase = phraseAt(literal, cursor);
                if (phrase != null) {
                    end = cursor + phrase.length();
                    kind = phrase.equals("and") || phrase.equals("as well as") ? OplToken.Kind.LIST_SEPARATOR
                            : isControlPhrase(phrase) ? OplToken.Kind.CONTROL_KEYWORD : OplToken.Kind.RELATION_VERB;
                } else {
                    end = cursor + 1;
                    while (end < literal.length() && !Character.isWhitespace(literal.charAt(end)) && literal.charAt(end) != '.' && literal.charAt(end) != ',') end++;
                    kind = OplToken.Kind.KEYWORD;
                }
            }
            appendToken(target, sentenceId, sentenceText, literal.substring(cursor, end), kind, offset + cursor, refs);
            cursor = end;
        }
    }

    private String phraseAt(String text, int offset) {
        for (String phrase : List.of("is an instance of", "are instances of", "at least one other", "in which case", "as well as", "occurs if", "is skipped", "consists of", "relates to", "are related", "otherwise", "initiates", "consumes", "affects", "requires", "handles", "invokes", "changes", "yields", "exhibits", "and", "else", "are", "is")) {
            if (text.startsWith(phrase, offset) && phraseBoundary(text, offset, phrase.length())) return phrase;
        }
        return null;
    }

    private boolean phraseBoundary(String text, int offset, int length) {
        return (offset == 0 || !Character.isLetterOrDigit(text.charAt(offset - 1)))
                && (offset + length == text.length() || !Character.isLetterOrDigit(text.charAt(offset + length)));
    }

    private boolean isControlPhrase(String phrase) {
        return Set.of("initiates", "occurs if", "in which case", "otherwise", "else", "is skipped").contains(phrase);
    }

    private void appendToken(List<OplToken> target, String sentenceId, String sentenceText, String text, OplToken.Kind kind, int characterOffset, List<OplToken.SourceRef> refs) {
        int ordinal = target.size();
        int start = utf8Offset(sentenceText, characterOffset);
        int end = utf8Offset(sentenceText, characterOffset + text.length());
        target.add(new OplToken(identifier("token", sentenceId, Integer.toString(ordinal), text), sentenceId, ordinal, text, kind, start, end, distinct(refs)));
    }

    private List<OplToken.SourceRef> baseRefs(
            SemanticRevision.Fact fact,
            String templateId,
            OplGrammar grammar,
            List<String> occurrenceIds,
            String sentenceSlot) {
        List<OplToken.SourceRef> refs = new ArrayList<>();
        refs.add(source(OplToken.SourceKind.FACT, fact.id(), "", null, sentenceSlot));
        refs.add(source(OplToken.SourceKind.CAPABILITY, fact.capability().capabilityId(), "capability_ref.capability_id", null, sentenceSlot));
        refs.add(source(OplToken.SourceKind.TEMPLATE, templateId, "pattern", null, sentenceSlot));
        refs.add(source(OplToken.SourceKind.RULE, templateId, "", null, sentenceSlot));
        refs.add(source(OplToken.SourceKind.GRAMMAR, grammar.binding().id(), "digest=" + grammar.binding().digest(), null, sentenceSlot));
        if ("OPL_PRODUCTION".equals(fact.source().sourceKind())
                && "opl.structural.exhibition.v1".equals(fact.source().sourceEntityId())) {
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "source.source_kind", null, sentenceSlot));
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "source.source_entity_id", null, sentenceSlot));
        }
        for (SemanticRevision.Endpoint endpoint : sentenceEndpoints(fact, sentenceSlot)) {
            refs.add(source(OplToken.SourceKind.ENDPOINT, endpoint.id(), "target_id", endpoint.ordinal(), sentenceSlot));
        }
        for (SemanticRevision.Label label : fact.labels()) {
            if (!sentenceLabelSlots(fact, sentenceSlot).contains(label.slotId())) continue;
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "labels[slot_id=" + label.slotId() + "].text", null, sentenceSlot));
        }
        if (fact.collectionCompleteness() == SemanticRevision.CollectionCompleteness.INCOMPLETE) {
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "collection_completeness", null, sentenceSlot));
        }
        occurrenceIds.forEach(occurrenceId -> refs.add(source(OplToken.SourceKind.OCCURRENCE, occurrenceId, "", null, sentenceSlot)));
        for (SemanticRevision.Modifier modifier : fact.modifiers()) {
            refs.add(source(OplToken.SourceKind.MODIFIER, modifier.id(), "value", null, sentenceSlot));
            if ("control.capability".equals(modifier.id())) {
                refs.add(source(OplToken.SourceKind.CAPABILITY, modifier.value(), "modifiers[modifier_id=control.capability].value", null, sentenceSlot));
            }
        }
        return distinct(refs);
    }

    private List<SemanticRevision.Endpoint> sentenceEndpoints(SemanticRevision.Fact fact, String sentenceSlot) {
        List<SemanticRevision.Endpoint> endpoints = fact.endpoints().stream()
                .sorted(Comparator.comparingInt(SemanticRevision.Endpoint::ordinal)).toList();
        if ("REVERSE".equals(sentenceSlot) && fact.direction() == SemanticRevision.Direction.BIDIRECTIONAL) {
            List<SemanticRevision.Endpoint> reverse = new ArrayList<>(endpoints);
            java.util.Collections.reverse(reverse);
            return List.copyOf(reverse);
        }
        return endpoints;
    }

    private Set<String> sentenceLabelSlots(SemanticRevision.Fact fact, String sentenceSlot) {
        return switch (sentenceSlot) {
            case "FORWARD" -> Set.of("forward_tag");
            case "REVERSE" -> Set.of("reverse_tag");
            case "RECIPROCAL" -> switch (fact.capability().capabilityId()) {
                case "CAP-ISO-STRUCT-004" -> Set.of("reciprocal");
                case "CAP-ISO-STRUCT-010" -> Set.of("reciprocal_tag");
                default -> Set.of();
            };
            default -> fact.labels().stream().map(SemanticRevision.Label::slotId).collect(Collectors.toUnmodifiableSet());
        };
    }

    private List<OplToken.SourceRef> activeSourceCatalog(
            SemanticRevision.Fact fact,
            OplGrammar.Template template,
            OplGrammar grammar,
            List<String> ruleIds,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        String sentenceSlot = template.sentenceSlot();
        List<OplToken.SourceRef> refs = new ArrayList<>();
        refs.add(source(OplToken.SourceKind.FACT, fact.id(), null, null, sentenceSlot));
        if ("OPL_PRODUCTION".equals(fact.source().sourceKind())
                && "opl.structural.exhibition.v1".equals(fact.source().sourceEntityId())) {
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "source.source_kind", null, sentenceSlot));
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "source.source_entity_id", null, sentenceSlot));
        }
        refs.add(source(OplToken.SourceKind.CAPABILITY, fact.capability().capabilityId(), "capability_ref.capability_id", null, sentenceSlot));
        fact.modifiers().stream().filter(modifier -> "control.capability".equals(modifier.id()))
                .forEach(modifier -> refs.add(source(OplToken.SourceKind.CAPABILITY, modifier.value(), "modifiers[modifier_id=control.capability].value", null, sentenceSlot)));
        for (SemanticRevision.Endpoint endpoint : sentenceEndpoints(fact, sentenceSlot)) {
            refs.add(source(OplToken.SourceKind.ENDPOINT, endpoint.id(), "target_id", endpoint.ordinal(), sentenceSlot));
            appendEndpointCatalogSources(refs, endpoint, elements, features, states, sentenceSlot);
        }
        fact.labels().stream().filter(label -> sentenceLabelSlots(fact, sentenceSlot).contains(label.slotId()))
                .forEach(label -> refs.add(source(OplToken.SourceKind.FACT, fact.id(), "labels[slot_id=" + label.slotId() + "].text", null, sentenceSlot)));
        if (fact.collectionCompleteness() == SemanticRevision.CollectionCompleteness.INCOMPLETE) {
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "collection_completeness", null, sentenceSlot));
        }
        fact.modifiers().stream().sorted(Comparator.comparingInt(this::modifierCatalogRank).thenComparing(SemanticRevision.Modifier::id))
                .forEach(modifier -> refs.add(source(OplToken.SourceKind.MODIFIER, modifier.id(), "value", null, sentenceSlot)));
        occurrenceIds.stream().sorted().forEach(occurrenceId -> refs.add(source(OplToken.SourceKind.OCCURRENCE, occurrenceId, null, null, sentenceSlot)));
        refs.add(source(OplToken.SourceKind.TEMPLATE, template.templateId(), "pattern", null, sentenceSlot));
        refs.add(source(OplToken.SourceKind.GRAMMAR, grammar.binding().id(), grammarPath(template.templateId()), null, sentenceSlot));
        ruleIds.forEach(ruleId -> refs.add(source(OplToken.SourceKind.RULE, ruleId, null, null, sentenceSlot)));
        return List.copyOf(refs);
    }

    private int modifierCatalogRank(SemanticRevision.Modifier modifier) {
        return switch (modifier.id()) {
            case "control.capability" -> 0;
            case "control.segment" -> 1;
            default -> 2;
        };
    }

    private void appendEndpointCatalogSources(
            List<OplToken.SourceRef> refs,
            SemanticRevision.Endpoint endpoint,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            String sentenceSlot) {
        if (endpoint.targetKind() == SemanticRevision.TargetKind.ELEMENT) {
            if (endpoint.stateQualificationId() != null) {
                SemanticRevision.State state = states.get(endpoint.stateQualificationId());
                if (state != null) appendStateCatalogSources(refs, state, endpoint.ordinal(), sentenceSlot);
            }
            refs.add(source(OplToken.SourceKind.ELEMENT, endpoint.targetId(), "name.local_name", endpoint.ordinal(), sentenceSlot));
            return;
        }
        if (endpoint.targetKind() == SemanticRevision.TargetKind.FEATURE) {
            SemanticRevision.Feature feature = features.get(endpoint.targetId());
            if (feature != null) appendFeatureCatalogSources(refs, feature, endpoint.ordinal(), sentenceSlot);
            return;
        }
        SemanticRevision.State state = states.get(endpoint.targetId());
        if (state == null) return;
        appendStateCatalogSources(refs, state, endpoint.ordinal(), sentenceSlot);
        if (state.ownerTargetKind() == SemanticRevision.TargetKind.FEATURE) {
            SemanticRevision.Feature feature = features.get(state.ownerElementId());
            if (feature != null) appendFeatureCatalogSources(refs, feature, endpoint.ordinal(), sentenceSlot);
        } else {
            refs.add(source(OplToken.SourceKind.ELEMENT, state.ownerElementId(), "name.local_name", endpoint.ordinal(), sentenceSlot));
        }
    }

    private void appendStateCatalogSources(List<OplToken.SourceRef> refs, SemanticRevision.State state, int ordinal, String sentenceSlot) {
        refs.add(source(OplToken.SourceKind.STATE, state.id(), "name.local_name", ordinal, sentenceSlot));
        refs.add(source(OplToken.SourceKind.STATE, state.id(), "owner_target_kind", ordinal, sentenceSlot));
        refs.add(source(OplToken.SourceKind.STATE, state.id(), "owner_element_id", ordinal, sentenceSlot));
    }

    private void appendFeatureCatalogSources(List<OplToken.SourceRef> refs, SemanticRevision.Feature feature, int ordinal, String sentenceSlot) {
        refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "name.local_name", ordinal, sentenceSlot));
        refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "owner_element_id", ordinal, sentenceSlot));
        refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "feature_kind", ordinal, sentenceSlot));
        refs.add(source(OplToken.SourceKind.ELEMENT, feature.ownerElementId(), "name.local_name", ordinal, sentenceSlot));
    }

    private List<OplToken.SourceRef> traceSources(OplSentence sentence, SemanticRevision.Fact fact, String templateId, OplGrammar grammar) {
        return tokenSourceCatalog(sentence);
    }

    private List<OplToken.SourceRef> traceSources(
            OplSentence sentence,
            SemanticRevision.Fact fact,
            String templateId,
            OplGrammar grammar,
            List<String> ruleIds) {
        return tokenSourceCatalog(sentence);
    }

    private List<OplToken.SourceRef> tokenSourceCatalog(OplSentence sentence) {
        List<OplToken.SourceRef> refs = new ArrayList<>();
        sentence.tokens().forEach(token -> refs.addAll(token.sourceRefs()));
        return distinct(refs);
    }

    private List<OplTextTrace.TokenRange> tokenRanges(OplSentence sentence, List<OplToken.SourceRef> sourceOrder) {
        Set<OplToken.SourceKind> locatableKinds = Set.of(OplToken.SourceKind.FACT, OplToken.SourceKind.ENDPOINT,
                OplToken.SourceKind.ELEMENT, OplToken.SourceKind.FEATURE, OplToken.SourceKind.STATE,
                OplToken.SourceKind.MODIFIER, OplToken.SourceKind.OCCURRENCE);
        List<OplTextTrace.TokenRange> result = new ArrayList<>();
        Set<String> uniqueRanges = new LinkedHashSet<>();
        for (OplToken.SourceRef source : sourceOrder) {
            if (!locatableKinds.contains(source.sourceKind())) continue;
            List<OplToken> matched = sentence.tokens().stream().filter(token -> token.sourceRefs().contains(source)).toList();
            int start = -1;
            int end = -1;
            for (OplToken token : matched) {
                if (start >= 0 && token.startUtf8Byte() != end) {
                    appendTokenRange(result, uniqueRanges, source.stableId(), start, end);
                    start = -1;
                }
                if (start < 0) start = token.startUtf8Byte();
                end = token.endUtf8Byte();
            }
            if (start >= 0) appendTokenRange(result, uniqueRanges, source.stableId(), start, end);
        }
        return List.copyOf(result);
    }

    private void appendTokenRange(
            List<OplTextTrace.TokenRange> ranges,
            Set<String> uniqueRanges,
            String inputId,
            int start,
            int end) {
        if (uniqueRanges.add(inputId + "\u0000" + start + "\u0000" + end)) {
            ranges.add(new OplTextTrace.TokenRange(inputId, start, end));
        }
    }

    private List<String> ruleIds(SemanticRevision.Fact fact, TextGenerationAssets assets) {
        List<String> ids = new ArrayList<>();
        ids.add(assets.capability(fact.capability().capabilityId()).ruleRef());
        fact.modifiers().stream()
                .filter(modifier -> "control.capability".equals(modifier.id()))
                .map(SemanticRevision.Modifier::value)
                .findFirst()
                .ifPresent(capability -> ids.add(assets.capability(capability).ruleRef()));
        return List.copyOf(ids);
    }

    private List<OplToken> rewriteTokens(List<OplToken> tokens, List<String> ruleIds, OplGrammar grammar) {
        List<OplToken> result = new ArrayList<>();
        for (OplToken token : tokens) {
            String templateId = token.sourceRefs().stream().filter(ref -> ref.sourceKind() == OplToken.SourceKind.TEMPLATE)
                    .map(OplToken.SourceRef::stableId).findFirst()
                    .orElseThrow(() -> failure(OplGenerationCode.TEXT_TRACE_INCOMPLETE, "Token does not reference a Template"));
            String sentenceSlot = token.sourceRefs().stream().map(OplToken.SourceRef::sentenceSlot)
                    .filter(Objects::nonNull).findFirst().orElse("SINGLE");
            List<OplToken.SourceRef> refs = new ArrayList<>();
            for (OplToken.SourceRef ref : token.sourceRefs()) {
                if (ref.sourceKind() == OplToken.SourceKind.RULE) {
                    String ruleId = token.kind() == OplToken.Kind.CONTROL_KEYWORD && ruleIds.size() > 1
                            ? ruleIds.getLast() : ruleIds.getFirst();
                    refs.add(source(OplToken.SourceKind.RULE, ruleId, "", ref.endpointOrdinal(), sentenceSlot));
                } else if (ref.sourceKind() == OplToken.SourceKind.GRAMMAR) {
                    refs.add(source(OplToken.SourceKind.GRAMMAR, grammar.binding().id(), grammarPath(templateId), ref.endpointOrdinal(), sentenceSlot));
                } else {
                    refs.add(source(ref.sourceKind(), ref.stableId(), ref.fieldPath(), ref.endpointOrdinal(), sentenceSlot));
                }
            }
            result.add(new OplToken(token.tokenId(), token.sentenceId(), token.ordinal(), token.text(), token.kind(),
                    token.startUtf8Byte(), token.endUtf8Byte(), distinct(refs)));
        }
        return List.copyOf(result);
    }

    private String templateId(OplSentence sentence) {
        return sentence.tokens().stream().flatMap(token -> token.sourceRefs().stream())
                .filter(ref -> ref.sourceKind() == OplToken.SourceKind.TEMPLATE)
                .map(OplToken.SourceRef::stableId)
                .findFirst()
                .orElseThrow(() -> failure(OplGenerationCode.TEXT_TRACE_INCOMPLETE, "Sentence does not reference a Template"));
    }

    private String grammarPath(String templateId) {
        return "templates[template_id=" + templateId + "].pattern";
    }

    private OplToken.SourceRef source(OplToken.SourceKind kind, String stableId, String fieldPath, Integer endpointOrdinal, String sentenceSlot) {
        return new OplToken.SourceRef(kind, stableId, fieldPath == null || fieldPath.isEmpty() ? null : fieldPath, endpointOrdinal, sentenceSlot);
    }

    private <T> List<T> distinct(List<T> values) {
        return List.copyOf(new LinkedHashSet<>(values));
    }

    void validateTrace(OplTextArtifact artifact, List<OplTextTrace> traces, String bindingDigest, boolean activeWrite) {
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

    void validateActiveTrace(
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

    /** ACTIVE 持久化前复核最终 Text Artifact 和 Trace，禁止历史兼容值进入写入事务。 */
    public void validateActiveWriteEvidence(
            SemanticRevision revision,
            TextGenerationAssets assets,
            OplGenerationResult evidence) {
        Objects.requireNonNull(evidence, "evidence must not be null");
        validateActiveTrace(revision, assets, evidence.artifact(), evidence.traces());
    }

    private void validateListSeparatorTokens(
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

    private String activeCapabilityId(SemanticRevision.Fact fact) {
        return fact.modifiers().stream()
                .filter(modifier -> "control.capability".equals(modifier.id()))
                .map(SemanticRevision.Modifier::value)
                .findFirst()
                .orElse(fact.capability().capabilityId());
    }

    private void validateActiveSourceRefs(
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

    private void validateExactActiveSourceCatalog(
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

    private void validateDirectionSources(
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

    private List<String> finalInputElementIds(
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

    private void validateEndpointDerivedSources(
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

    private void requireStateSources(List<OplToken.SourceRef> refs, SemanticRevision.State state, int endpointOrdinal) {
        requireSource(refs, OplToken.SourceKind.STATE, state.id(), "name.local_name", endpointOrdinal);
        requireSource(refs, OplToken.SourceKind.STATE, state.id(), "owner_target_kind", endpointOrdinal);
        requireSource(refs, OplToken.SourceKind.STATE, state.id(), "owner_element_id", endpointOrdinal);
    }

    private void requireFeatureSources(List<OplToken.SourceRef> refs, SemanticRevision.Feature feature, int endpointOrdinal) {
        requireSource(refs, OplToken.SourceKind.FEATURE, feature.id(), "name.local_name", endpointOrdinal);
        requireSource(refs, OplToken.SourceKind.FEATURE, feature.id(), "owner_element_id", endpointOrdinal);
        requireSource(refs, OplToken.SourceKind.FEATURE, feature.id(), "feature_kind", endpointOrdinal);
    }

    private void validateOccurrenceSources(
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

    private void requireSource(List<OplToken.SourceRef> refs, OplToken.SourceKind sourceKind, String stableId) {
        if (refs.stream().noneMatch(ref -> ref.sourceKind() == sourceKind && stableId.equals(ref.stableId()))) {
            throw incomplete("Trace source catalog is missing a required " + sourceKind + " source");
        }
    }

    private void requireSource(
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

    private void validateFactSource(OplToken.SourceRef ref, SemanticRevision.Fact fact) {
        String fieldPath = ref.fieldPath();
        boolean allowedFieldPath = fieldPath == null || Set.of("capability_ref.capability_id", "collection_completeness",
                "source.source_kind", "source.source_entity_id").contains(fieldPath)
                || fieldPath.matches("labels\\[slot_id=[A-Za-z][A-Za-z0-9._:-]{0,127}]\\.text");
        if (!fact.id().equals(ref.stableId()) || !allowedFieldPath) {
            throw incomplete("Trace Fact source does not match the active Fact");
        }
        requireNoEndpointOrdinal(ref);
    }

    private void validateDerivedEndpointOrdinal(
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

    private boolean isDerivedFromEndpoint(
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

    private void requireNoEndpointOrdinal(OplToken.SourceRef ref) {
        if (ref.endpointOrdinal() != null) throw incomplete("Trace source kind must not carry an endpoint ordinal");
    }

    private void validateSentenceTokens(OplSentence sentence, boolean activeWrite) {
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

    private void validateTraceSources(
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

    private void validateTokenRanges(OplTextTrace trace, OplSentence sentence, boolean activeWrite) {
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

    private void validateLocatableTokenSourcesHaveRanges(OplTextTrace trace, OplSentence sentence) {
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

    private Set<Integer> utf8Boundaries(String text) {
        Set<Integer> result = new LinkedHashSet<>();
        result.add(0);
        for (int offset = 0; offset < text.length();) {
            offset += Character.charCount(text.codePointAt(offset));
            result.add(utf8Offset(text, offset));
        }
        return result;
    }

    private OplGenerationException incomplete(String message) {
        return failure(OplGenerationCode.TEXT_TRACE_INCOMPLETE, message);
    }

    private OplGenerationException legacyValueForbidden(String message) {
        return failure(OplGenerationCode.TEXT_LEGACY_VALUE_FORBIDDEN, message);
    }

    private void verifyGrammarBinding(SemanticRevision revision, OplGrammar grammar) {
        if (!grammar.matches(revision.profileBinding().textGrammar())) {
            throw failure(OplGenerationCode.TEXT_GRAMMAR_BINDING_MISMATCH,
                    "Grammar binding must match the semantic revision text grammar exactly");
        }
    }

    private SemanticRevision.Endpoint endpoint(SemanticRevision.Fact fact, String role) {
        return fact.endpoints().stream().filter(endpoint -> role.equals(endpoint.role())).findFirst()
                .orElseThrow(() -> failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Consumption endpoint " + role + " is missing"));
    }

    private SemanticRevision.Endpoint consumptionEndpoint(SemanticRevision.Fact fact) {
        return fact.endpoints().stream().filter(endpoint -> "CONSUMED_OBJECT".equals(endpoint.role()) || "CONSUMED_STATE".equals(endpoint.role())).findFirst()
                .orElseThrow(() -> failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Consumption source endpoint is missing"));
    }

    private boolean isConsumption(String capabilityId) {
        return LEGACY_CONSUMPTION_CAPABILITY.equals(capabilityId) || CONSUMPTION_CAPABILITY.equals(capabilityId) || STATE_CONSUMPTION_CAPABILITY.equals(capabilityId);
    }

    private SemanticRevision.Element requireElement(
            SemanticRevision.Endpoint endpoint,
            Map<String, SemanticRevision.Element> elements,
            String meaning) {
        if (endpoint.targetKind() != SemanticRevision.TargetKind.ELEMENT) {
            throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, meaning + " must be an Element");
        }
        SemanticRevision.Element element = elements.get(endpoint.targetId());
        if (element == null) {
            throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, meaning + " does not exist");
        }
        return element;
    }

    private void appendOccurrenceIds(
            List<String> target,
            Map<String, List<SemanticRevision.Occurrence>> occurrencesByTarget,
            String targetId) {
        List<SemanticRevision.Occurrence> occurrences = occurrencesByTarget.get(targetId);
        if (occurrences == null || occurrences.isEmpty()) {
            throw failure(OplGenerationCode.TEXT_TRACE_INCOMPLETE, "Trace is missing occurrence for " + targetId);
        }
        occurrences.stream().map(SemanticRevision.Occurrence::id).sorted().forEach(target::add);
    }

    private void appendOptionalOccurrenceIds(
            List<String> target,
            Map<String, List<SemanticRevision.Occurrence>> occurrencesByTarget,
            String targetId) {
        List<SemanticRevision.Occurrence> occurrences = occurrencesByTarget.get(targetId);
        if (occurrences != null) {
            occurrences.stream().map(SemanticRevision.Occurrence::id).sorted().forEach(target::add);
        }
    }

    private static <T> Map<String, T> index(List<T> values, java.util.function.Function<T, String> key) {
        Map<String, T> result = new HashMap<>();
        for (T value : values) {
            result.put(key.apply(value), value);
        }
        return result;
    }

    private static OplGenerationException failure(OplGenerationCode code, String message) {
        return new OplGenerationException(code, message);
    }

    private static String identifier(String prefix, String... values) {
        return prefix + "." + digest(String.join("\u001f", values)).substring(0, 32);
    }

    private static String digest(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(bytes.length * 2);
            for (byte valueByte : bytes) {
                result.append(String.format("%02x", valueByte));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }

    private static int utf8Offset(String text, int characterIndex) {
        return text.substring(0, characterIndex).getBytes(StandardCharsets.UTF_8).length;
    }

    private static void requireNonBlank(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
    }

    private record GenericPlan(
            SemanticRevision.Fact fact,
            String templateId,
            int precedence,
            int sentenceSlotRank,
            String text,
            List<String> inputElementIds,
            List<String> occurrenceIds,
            String primaryProcessId) {
        private SentencePlan.SortKey sortKey() {
            String sentenceId = identifier("sentence", fact.id(), templateId, text);
            return new SentencePlan.SortKey(0, precedence, primaryProcessId, fact.id(), sentenceSlotRank, templateId, sentenceId);
        }
    }

    private record ConsumptionSource(SemanticRevision.Element object, String stateId, String stateName) { }

    private record ControlComposition(String controlCapabilityId, String templateId) { }

    private record ProceduralEndpointExpectation(String role, ProceduralEndpointKind kind) { }

    private enum ProceduralEndpointKind { OBJECT, PROCESS, OBJECT_STATE }

    private record StructuralSentence(String templateId, String text, String primarySubjectId) { }

    private record TokenMention(String text, OplToken.Kind kind, List<OplToken.SourceRef> sourceRefs) { }

    private record TokenSpan(int start, int end, String text, OplToken.Kind kind, List<OplToken.SourceRef> sourceRefs) { }
}
