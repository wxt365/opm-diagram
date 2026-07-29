package org.opm.localruntime.text;

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

    public OplGenerationResult generate(SemanticRevision revision, String contextId, OplGrammar grammar) {
        Objects.requireNonNull(revision, "revision must not be null");
        requireNonBlank(contextId, "contextId");
        Objects.requireNonNull(grammar, "grammar must not be null");
        verifyGrammarBinding(revision, grammar);
        if (revision.facts().stream().anyMatch(fact -> fact.capability().capabilityId().startsWith("CAP-ISO-PROC-")
                || fact.capability().capabilityId().startsWith("CAP-ISO-STRUCT-"))) {
            return generateProcedural(revision, contextId, grammar);
        }

        List<SentencePlan> plans = plan(revision, contextId, grammar);
        List<OplSentence> sentences = new ArrayList<>();
        List<OplTextTrace> traces = new ArrayList<>();
        for (int ordinal = 0; ordinal < plans.size(); ordinal++) {
            SentencePlan plan = plans.get(ordinal);
            OplSentence sentence = compose(plan, ordinal);
            sentences.add(sentence);
            traces.add(trace(plan, sentence));
        }
        OplParagraph paragraph = new OplParagraph(
                identifier("paragraph", revision.revisionId(), contextId, grammar.binding().version()),
                contextId,
                0,
                sentences);
        OplTextArtifact artifact = new OplTextArtifact(
                identifier("artifact", revision.revisionId(), contextId, grammar.binding().id(), grammar.binding().version(), grammar.binding().digest()),
                revision.revisionId(),
                grammar.binding(),
                contextId,
                List.of(paragraph),
                digest(sentences.stream().map(OplSentence::text).collect(Collectors.joining("\n"))));
        validateTrace(artifact, traces);
        return new OplGenerationResult(artifact, traces);
    }

    private OplGenerationResult generateProcedural(SemanticRevision revision, String contextId, OplGrammar grammar) {
        Map<String, SemanticRevision.Context> contexts = index(revision.contexts(), SemanticRevision.Context::id);
        SemanticRevision.Context context = contexts.get(contextId);
        if (context == null || context.kind() != SemanticRevision.ContextKind.SYSTEM_DIAGRAM || !revision.rootContextId().equals(contextId)) {
            throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Procedural OPL only supports the root SYSTEM_DIAGRAM context");
        }
        Map<String, SemanticRevision.Element> elements = index(revision.elements(), SemanticRevision.Element::id);
        Map<String, SemanticRevision.State> states = index(revision.states(), SemanticRevision.State::id);
        Map<String, SemanticRevision.Occurrence> occurrences = index(revision.occurrences(), SemanticRevision.Occurrence::id);
        Map<String, List<SemanticRevision.Occurrence>> occurrencesByTarget = context.occurrenceIds().stream().map(occurrences::get)
                .filter(Objects::nonNull).collect(Collectors.groupingBy(SemanticRevision.Occurrence::targetId));
        List<GenericPlan> plans = new ArrayList<>();
        for (SemanticRevision.Fact fact : revision.facts()) {
            if (!fact.capability().capabilityId().startsWith("CAP-ISO-PROC-")) {
                continue;
            }
            String templateId = proceduralTemplate(fact.capability().capabilityId());
            OplGrammar.Template template = grammar.template(templateId).orElseThrow(() -> failure(OplGenerationCode.TEXT_TEMPLATE_MISSING, "Grammar does not provide " + templateId));
            List<String> occurrenceIds = new ArrayList<>();
            appendOccurrenceIds(occurrenceIds, occurrencesByTarget, fact.id());
            for (SemanticRevision.Endpoint endpoint : fact.endpoints()) appendOccurrenceIds(occurrenceIds, occurrencesByTarget, endpoint.targetId());
            List<String> inputElementIds = proceduralElementIds(fact, elements, states);
            String text = proceduralText(fact, elements, states);
            String primaryProcessId = fact.endpoints().stream().filter(endpoint -> endpoint.role().contains("PROCESS"))
                    .map(SemanticRevision.Endpoint::targetId).findFirst().orElse(fact.id());
            plans.add(new GenericPlan(fact, templateId, template.precedence(), text, inputElementIds, List.copyOf(new LinkedHashSet<>(occurrenceIds)), primaryProcessId));
        }
        plans.sort(Comparator.comparing(GenericPlan::sortKey));
        List<OplSentence> sentences = new ArrayList<>();
        List<OplTextTrace> traces = new ArrayList<>();
        for (int ordinal = 0; ordinal < plans.size(); ordinal++) {
            GenericPlan plan = plans.get(ordinal);
            String sentenceId = identifier("sentence", plan.fact().id(), plan.templateId(), grammar.binding().version(), plan.text());
            OplSentence sentence = new OplSentence(sentenceId, plan.text(), ordinal, List.of(new OplToken(OplToken.Kind.KEYWORD, plan.text())), List.of(plan.templateId()), List.of(plan.fact().id()));
            sentences.add(sentence);
            traces.add(genericTrace(plan, sentence, contextId, elements, states));
        }
        OplParagraph paragraph = new OplParagraph(identifier("paragraph", revision.revisionId(), contextId, grammar.binding().version()), contextId, 0, sentences);
        OplTextArtifact artifact = new OplTextArtifact(identifier("artifact", revision.revisionId(), contextId, grammar.binding().id(), grammar.binding().version(), grammar.binding().digest()),
                revision.revisionId(), grammar.binding(), contextId, List.of(paragraph), digest(sentences.stream().map(OplSentence::text).collect(Collectors.joining("\n"))));
        validateTrace(artifact, traces);
        return new OplGenerationResult(artifact, traces);
    }

    private OplTextTrace genericTrace(GenericPlan plan, OplSentence sentence, String contextId, Map<String, SemanticRevision.Element> elements, Map<String, SemanticRevision.State> states) {
        List<OplTextTrace.TokenRange> ranges = new ArrayList<>();
        int cursor = 0;
        for (SemanticRevision.Endpoint endpoint : plan.fact().endpoints()) {
            String label = endpointName(endpoint, elements, states);
            int start = sentence.text().indexOf(label, cursor);
            if (start >= 0) {
                ranges.add(new OplTextTrace.TokenRange(endpoint.targetId(), start, start + label.length()));
                cursor = start + label.length();
            }
        }
        ranges.add(new OplTextTrace.TokenRange(plan.fact().id(), 0, sentence.text().length()));
        return new OplTextTrace(identifier("trace", sentence.sentenceId(), plan.fact().id()), contextId, List.of(plan.fact().id()), plan.inputElementIds(),
                plan.occurrenceIds(), List.of(sentence.sentenceId()), List.of(plan.templateId()), ranges);
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
            case "CAP-ISO-PROC-008" -> label.apply("AFFECTING_PROCESS") + " changes " + label.apply("AFFECTEE_INPUT_STATE") + " to " + label.apply("AFFECTED_OUTPUT_STATE") + ".";
            case "CAP-ISO-PROC-009" -> label.apply("AFFECTING_PROCESS") + " changes " + label.apply("AFFECTEE_INPUT_STATE") + " to " + label.apply("AFFECTED_OBJECT") + ".";
            case "CAP-ISO-PROC-010" -> label.apply("AFFECTING_PROCESS") + " changes " + label.apply("AFFECTEE_OBJECT") + " to " + label.apply("AFFECTED_OUTPUT_STATE") + ".";
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
                .orElseThrow(() -> failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Exception duration is missing"));
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

    private OplSentence compose(SentencePlan plan, int ordinal) {
        List<OplToken> tokens = new ArrayList<>();
        tokens.add(new OplToken(OplToken.Kind.PROCESS, plan.processName()));
        tokens.add(new OplToken(OplToken.Kind.KEYWORD, " consumes "));
        if (plan.stateName() != null) {
            tokens.add(new OplToken(OplToken.Kind.STATE, plan.stateName()));
            tokens.add(new OplToken(OplToken.Kind.KEYWORD, " "));
        }
        tokens.add(new OplToken(OplToken.Kind.OBJECT, plan.objectName()));
        tokens.add(new OplToken(OplToken.Kind.PUNCTUATION, "."));
        String text = tokens.stream().map(OplToken::text).collect(Collectors.joining());
        if (!text.endsWith(".")) {
            throw failure(OplGenerationCode.TEXT_COMPOSITION_FAILED, "OPL sentence must end with an ASCII period");
        }
        return new OplSentence(plan.sentenceId(), text, ordinal, tokens, List.of(plan.templateId()), plan.inputFactIds());
    }

    private OplTextTrace trace(SentencePlan plan, OplSentence sentence) {
        List<OplTextTrace.TokenRange> ranges = new ArrayList<>();
        int processEnd = plan.processName().length();
        ranges.add(new OplTextTrace.TokenRange(plan.inputElementIds().getFirst(), 0, processEnd));
        int objectStart = sentence.text().lastIndexOf(plan.objectName());
        ranges.add(new OplTextTrace.TokenRange(plan.inputElementIds().get(1), objectStart, objectStart + plan.objectName().length()));
        if (plan.stateName() != null) {
            int stateStart = sentence.text().indexOf(plan.stateName(), processEnd);
            ranges.add(new OplTextTrace.TokenRange(plan.stateId(), stateStart, stateStart + plan.stateName().length()));
        }
        ranges.add(new OplTextTrace.TokenRange(plan.inputFactIds().getFirst(), 0, sentence.text().length()));
        return new OplTextTrace(
                identifier("trace", sentence.sentenceId(), plan.inputFactIds().getFirst()),
                plan.contextId(),
                plan.inputFactIds(),
                plan.inputElementIds(),
                plan.occurrenceIds(),
                List.of(sentence.sentenceId()),
                List.of(plan.templateId()),
                ranges);
    }

    private void validateTrace(OplTextArtifact artifact, List<OplTextTrace> traces) {
        List<String> sentenceIds = artifact.paragraphs().stream()
                .flatMap(paragraph -> paragraph.sentences().stream())
                .map(OplSentence::sentenceId)
                .toList();
        if (traces.size() != sentenceIds.size() || traces.stream().anyMatch(trace -> !sentenceIds.containsAll(trace.sentenceIds()))) {
            throw failure(OplGenerationCode.TEXT_TRACE_INCOMPLETE, "Every generated sentence must have a complete trace");
        }
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

    private static void requireNonBlank(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
    }

    private record GenericPlan(
            SemanticRevision.Fact fact,
            String templateId,
            int precedence,
            String text,
            List<String> inputElementIds,
            List<String> occurrenceIds,
            String primaryProcessId) {
        private SentencePlan.SortKey sortKey() {
            String sentenceId = identifier("sentence", fact.id(), templateId, text);
            return new SentencePlan.SortKey(0, precedence, primaryProcessId, fact.id(), sentenceId);
        }
    }

    private record ConsumptionSource(SemanticRevision.Element object, String stateId, String stateName) { }
}
