package org.opm.localruntime.text;

import org.opm.localruntime.golden.OplGoldenArtifactCanonicalWriter;
import org.opm.localruntime.semantic.SemanticRevision;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import static org.opm.localruntime.text.OplSemanticSupport.*;
import static org.opm.localruntime.text.OplTokenPipeline.*;

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
        var requestedContext = textContext(revision, contextId);
        Set<String> requestedFacts = localFactIds(requestedContext, index(revision.occurrences(), SemanticRevision.Occurrence::id));
        if (revision.facts().stream().anyMatch(fact -> requestedFacts.contains(fact.id()) && (fact.capability().capabilityId().startsWith("CAP-ISO-PROC-")
                || fact.capability().capabilityId().startsWith("CAP-ISO-STRUCT-")))) {
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
        SemanticRevision.Context context = textContext(revision, contextId);
        Map<String, SemanticRevision.Element> elements = index(revision.elements(), SemanticRevision.Element::id);
        Map<String, SemanticRevision.Feature> features = index(revision.features(), SemanticRevision.Feature::id);
        Map<String, SemanticRevision.State> states = index(revision.states(), SemanticRevision.State::id);
        Map<String, SemanticRevision.Occurrence> occurrences = index(revision.occurrences(), SemanticRevision.Occurrence::id);
        Map<String, List<SemanticRevision.Occurrence>> occurrencesByTarget = scopedOwnedOccurrences(context, occurrences);
        Set<String> localFacts = localFactIds(context, occurrences);
        List<GenericPlan> plans = new ArrayList<>();
        for (SemanticRevision.Fact fact : revision.facts()) {
            if (!localFacts.contains(fact.id())) continue;
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
            String sentenceId = contextSentenceId(revision, contextId, identifier("sentence", plan.fact().id(), plan.templateId(), grammar.binding().version(), plan.text()));
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

    /** 只读取当前图的显式成员；禁止以过滤缺失项的方式掩盖跨图或悬空引用。 */
    private SemanticRevision.Context textContext(SemanticRevision revision, String contextId) {
        var context = revision.contexts().stream().filter(value -> value.id().equals(contextId)).findFirst().orElse(null);
        if (context == null || context.kind() == SemanticRevision.ContextKind.PROFILE_CONTEXT)
            throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "当前 Context 尚无文本生成契约");
        var occurrences = index(revision.occurrences(), SemanticRevision.Occurrence::id);
        Set<String> ids = new LinkedHashSet<>(context.occurrenceIds());
        if (ids.size() != context.occurrenceIds().size()) throw incomplete("Context 成员重复");
        for (String id : ids) {
            var occurrence = occurrences.get(id);
            if (occurrence == null || !contextId.equals(occurrence.contextId())) throw incomplete("Context 成员缺失或属于其他图");
        }
        if (revision.occurrences().stream().anyMatch(value -> contextId.equals(value.contextId()) && !ids.contains(value.id())))
            throw incomplete("Context 未声明属于本图的 occurrence");
        return context;
    }

    private Set<String> localFactIds(SemanticRevision.Context context, Map<String, SemanticRevision.Occurrence> occurrences) {
        return context.occurrenceIds().stream().map(occurrences::get)
                .filter(value -> value.targetKind() == SemanticRevision.TargetKind.FACT)
                .map(SemanticRevision.Occurrence::targetId).collect(Collectors.toSet());
    }

    private String contextSentenceId(SemanticRevision revision, String contextId, String sentenceId) {
        return revision.rootContextId().equals(contextId) ? sentenceId : identifier("sentence", contextId, sentenceId);
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
        SemanticRevision.Context context = textContext(revision, contextId);
        Map<String, SemanticRevision.Element> elements = index(revision.elements(), SemanticRevision.Element::id);
        Map<String, SemanticRevision.State> states = index(revision.states(), SemanticRevision.State::id);
        Map<String, SemanticRevision.Occurrence> occurrences = index(revision.occurrences(), SemanticRevision.Occurrence::id);
        Map<String, List<SemanticRevision.Occurrence>> occurrencesByTarget = scopedOwnedOccurrences(context, occurrences);
        Set<String> localFacts = localFactIds(context, occurrences);

        List<SentencePlan> plans = new ArrayList<>();
        for (SemanticRevision.Fact fact : revision.facts()) {
            if (!localFacts.contains(fact.id())) continue;
            if (!occurrencesByTarget.containsKey(fact.id())) throw incomplete("当前图缺少 Fact 的 OWNED occurrence");
            if (!isConsumption(fact.capability().capabilityId())) {
                throw failure(OplGenerationCode.TEXT_CAPABILITY_UNSUPPORTED,
                        "P0 OPL does not support capability " + fact.capability().capabilityId());
            }
            var plan = planConsumption(fact, elements, states, occurrencesByTarget, grammar);
            plans.add(new SentencePlan(contextSentenceId(revision, contextId, plan.sentenceId()), plan.contextId(), plan.templateId(),
                    plan.inputFactIds(), plan.inputElementIds(), plan.occurrenceIds(), plan.sortKey(), plan.grammarVersion(),
                    plan.processName(), plan.objectName(), plan.stateId(), plan.stateName()));
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

    void validateTrace(OplTextArtifact artifact, List<OplTextTrace> traces, String bindingDigest, boolean activeWrite) {
        OplTraceValidator.validateTrace(artifact, traces, bindingDigest, activeWrite);
    }

    void validateActiveTrace(SemanticRevision revision, TextGenerationAssets assets, OplTextArtifact artifact, List<OplTextTrace> traces) {
        OplTraceValidator.validateActiveTrace(revision, assets, artifact, traces);
    }

    /** ACTIVE 持久化前复核最终 Text Artifact 和 Trace。 */
    public void validateActiveWriteEvidence(
            SemanticRevision revision,
            TextGenerationAssets assets,
            OplGenerationResult evidence) {
        Objects.requireNonNull(evidence, "evidence must not be null");
        validateActiveTrace(revision, assets, evidence.artifact(), evidence.traces());
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

}
