package org.opm.localruntime.semantic;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public final class SemanticRevisionValidator {

    public List<SemanticValidationProblem> validate(SemanticRevision revision) {
        Objects.requireNonNull(revision, "revision must not be null");
        List<SemanticValidationProblem> problems = new ArrayList<>();
        Map<String, SemanticRevision.Element> elements = index(revision.elements(), SemanticRevision.Element::id, problems);
        Map<String, SemanticRevision.Feature> features = index(revision.features(), SemanticRevision.Feature::id, problems);
        Map<String, SemanticRevision.State> states = index(revision.states(), SemanticRevision.State::id, problems);
        Map<String, SemanticRevision.Fact> facts = index(revision.facts(), SemanticRevision.Fact::id, problems);
        Map<String, SemanticRevision.Context> contexts = index(revision.contexts(), SemanticRevision.Context::id, problems);
        Map<String, SemanticRevision.Occurrence> occurrences = index(revision.occurrences(), SemanticRevision.Occurrence::id, problems);
        Map<String, SemanticRevision.Layout> layouts = index(revision.layouts(), SemanticRevision.Layout::id, problems);
        validateGlobalStableIds(revision, problems);
        validateCapabilities(revision, problems);
        validateFeatures(revision, elements, features, problems);
        validateStates(revision, elements, features, states, problems);
        validateStatePresentations(revision, states, contexts, problems);
        validateFacts(revision, elements, features, states, facts, problems);
        validateContexts(revision, elements, features, states, facts, contexts, occurrences, layouts, problems);
        validateLayouts(revision.layouts(), problems);
        return List.copyOf(problems);
    }

    private void validateGlobalStableIds(SemanticRevision revision, List<SemanticValidationProblem> problems) {
        Set<String> identifiers = new HashSet<>();
        registerAll(revision.elements(), SemanticRevision.Element::id, identifiers, problems);
        registerAll(revision.features(), SemanticRevision.Feature::id, identifiers, problems);
        registerAll(revision.states(), SemanticRevision.State::id, identifiers, problems);
        registerAll(revision.facts(), SemanticRevision.Fact::id, identifiers, problems);
        registerAll(revision.contexts(), SemanticRevision.Context::id, identifiers, problems);
        registerAll(revision.occurrences(), SemanticRevision.Occurrence::id, identifiers, problems);
        registerAll(revision.layouts(), SemanticRevision.Layout::id, identifiers, problems);
    }

    private void validateCapabilities(SemanticRevision revision, List<SemanticValidationProblem> problems) {
        String profileId = revision.profileBinding().profile().id();
        String profileVersion = revision.profileBinding().profile().version();
        for (SemanticRevision.Element element : revision.elements()) {
            validateCapability(element.id(), element.capability(), profileId, profileVersion, problems);
        }
        for (SemanticRevision.Feature feature : revision.features()) {
            validateCapability(feature.id(), feature.capability(), profileId, profileVersion, problems);
        }
        for (SemanticRevision.State state : revision.states()) {
            validateCapability(state.id(), state.capability(), profileId, profileVersion, problems);
        }
        for (SemanticRevision.Fact fact : revision.facts()) {
            validateCapability(fact.id(), fact.capability(), profileId, profileVersion, problems);
        }
        for (SemanticRevision.Context context : revision.contexts()) {
            validateCapability(context.id(), context.capability(), profileId, profileVersion, problems);
        }
    }

    private void validateStates(
            SemanticRevision revision,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            List<SemanticValidationProblem> problems) {
        for (SemanticRevision.State state : revision.states()) {
            boolean ownerExists = state.ownerTargetKind() == SemanticRevision.TargetKind.ELEMENT
                    ? elements.containsKey(state.ownerElementId()) : features.containsKey(state.ownerElementId());
            if (!ownerExists) {
                missing(state.id(), "state owner does not exist", problems);
            } else if (state.ownerTargetKind() == SemanticRevision.TargetKind.ELEMENT
                    && !elements.get(state.ownerElementId()).stateIds().contains(state.id())) {
                problem(SemanticValidationCode.STATE_OWNER_MISMATCH, state.id(),
                        "state is not declared by its owner element", problems);
            }
        }
        for (SemanticRevision.Element element : revision.elements()) {
            for (String stateId : element.stateIds()) {
                SemanticRevision.State state = states.get(stateId);
                if (state == null) {
                    missing(element.id(), "declared state does not exist", problems);
                } else if (state.ownerTargetKind() != SemanticRevision.TargetKind.ELEMENT || !element.id().equals(state.ownerElementId())) {
                    problem(SemanticValidationCode.STATE_OWNER_MISMATCH, element.id(),
                            "declared state belongs to another element", problems);
                }
            }
        }
    }

    private void validateFeatures(
            SemanticRevision revision,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            List<SemanticValidationProblem> problems) {
        for (SemanticRevision.Feature feature : revision.features()) {
            SemanticRevision.Element owner = elements.get(feature.ownerElementId());
            if (owner == null) {
                missing(feature.id(), "feature owner does not exist", problems);
            } else if (!owner.featureIds().contains(feature.id())) {
                problem(SemanticValidationCode.STATE_OWNER_MISMATCH, feature.id(),
                        "feature is not declared by its owner element", problems);
            }
        }
        for (SemanticRevision.Element element : revision.elements()) {
            for (String featureId : element.featureIds()) {
                SemanticRevision.Feature feature = features.get(featureId);
                if (feature == null) {
                    missing(element.id(), "declared feature does not exist", problems);
                } else if (!element.id().equals(feature.ownerElementId())) {
                    problem(SemanticValidationCode.STATE_OWNER_MISMATCH, element.id(),
                            "declared feature belongs to another element", problems);
                }
            }
        }
    }

    private void validateFacts(
            SemanticRevision revision,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            Map<String, SemanticRevision.Fact> facts,
            List<SemanticValidationProblem> problems) {
        for (SemanticRevision.Fact fact : revision.facts()) {
            if (fact.endpoints().size() < 2) {
                problem(SemanticValidationCode.INVALID_ENDPOINT, fact.id(), "fact requires at least two endpoints", problems);
            }
            Set<String> endpointIds = new HashSet<>();
            Set<Integer> ordinals = new HashSet<>();
            for (SemanticRevision.Endpoint endpoint : fact.endpoints()) {
                if (!endpointIds.add(endpoint.id())) {
                    problem(SemanticValidationCode.DUPLICATE_ID, endpoint.id(), "endpoint id is duplicated in fact", problems);
                }
                if (!ordinals.add(endpoint.ordinal())) {
                    problem(SemanticValidationCode.INVALID_ENDPOINT, endpoint.id(), "endpoint ordinal is duplicated", problems);
                }
                validateTarget(endpoint.id(), endpoint.targetKind(), endpoint.targetId(), elements, features, states, facts, problems);
                validateStateQualification(endpoint, states, problems);
            }
            for (int ordinal = 0; ordinal < fact.endpoints().size(); ordinal++) {
                if (!ordinals.contains(ordinal)) {
                    problem(SemanticValidationCode.INVALID_ENDPOINT, fact.id(), "endpoint ordinals must be contiguous from zero", problems);
                    break;
                }
            }
        }
    }

    private void validateStatePresentations(
            SemanticRevision revision,
            Map<String, SemanticRevision.State> states,
            Map<String, SemanticRevision.Context> contexts,
            List<SemanticValidationProblem> problems) {
        Set<String> keys = new HashSet<>();
        for (SemanticRevision.StatePresentation presentation : revision.statePresentations()) {
            String key = presentation.contextId() + "\u001f" + presentation.stateId();
            if (!keys.add(key)) {
                problem(SemanticValidationCode.INVALID_STATE_PRESENTATION, presentation.stateId(),
                        "state presentation is duplicated in its context", problems);
            }
            if (!contexts.containsKey(presentation.contextId())) {
                missing(presentation.stateId(), "state presentation context does not exist", problems);
            }
            if (!states.containsKey(presentation.stateId())) {
                missing(presentation.contextId(), "state presentation state does not exist", problems);
            }
        }
    }

    private void validateContexts(
            SemanticRevision revision,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            Map<String, SemanticRevision.Fact> facts,
            Map<String, SemanticRevision.Context> contexts,
            Map<String, SemanticRevision.Occurrence> occurrences,
            Map<String, SemanticRevision.Layout> layouts,
            List<SemanticValidationProblem> problems) {
        if (!contexts.containsKey(revision.rootContextId())) {
            missing(revision.modelId(), "root context does not exist", problems);
        }
        for (SemanticRevision.Context context : revision.contexts()) {
            for (String occurrenceId : context.occurrenceIds()) {
                SemanticRevision.Occurrence occurrence = occurrences.get(occurrenceId);
                if (occurrence == null) {
                    missing(context.id(), "declared occurrence does not exist", problems);
                } else if (!context.id().equals(occurrence.contextId())) {
                    problem(SemanticValidationCode.CONTEXT_CLOSURE_VIOLATION, occurrence.id(),
                            "occurrence is declared by a different context", problems);
                }
            }
        }
        for (SemanticRevision.Occurrence occurrence : revision.occurrences()) {
            SemanticRevision.Context context = contexts.get(occurrence.contextId());
            if (context == null) {
                missing(occurrence.id(), "occurrence context does not exist", problems);
            } else if (!context.occurrenceIds().contains(occurrence.id())) {
                problem(SemanticValidationCode.CONTEXT_CLOSURE_VIOLATION, occurrence.id(),
                        "occurrence is absent from its context declaration", problems);
            }
            validateTarget(occurrence.id(), occurrence.targetKind(), occurrence.targetId(), elements, features, states, facts, problems);
            if (!layouts.containsKey(occurrence.layoutId())) {
                missing(occurrence.id(), "occurrence layout does not exist", problems);
            }
            if (occurrence.ownership() == SemanticRevision.OccurrenceOwnership.VIEW_DERIVED
                    && occurrence.targetKind() == SemanticRevision.TargetKind.FACT) {
                problem(SemanticValidationCode.INVALID_OWNERSHIP, occurrence.id(),
                        "view-derived occurrence cannot own a fact", problems);
            }
        }
    }

    private void validateLayouts(Collection<SemanticRevision.Layout> layouts, List<SemanticValidationProblem> problems) {
        for (SemanticRevision.Layout layout : layouts) {
            if (layout.width() <= 0 || layout.height() <= 0) {
                problem(SemanticValidationCode.INVALID_LAYOUT, layout.id(),
                        "layout dimensions must be positive", problems);
            }
        }
    }

    private void validateCapability(
            String locatorId,
            SemanticRevision.CapabilityReference capability,
            String profileId,
            String profileVersion,
            List<SemanticValidationProblem> problems) {
        if (!profileId.equals(capability.profileId()) || !profileVersion.equals(capability.profileVersion())) {
            problem(SemanticValidationCode.CAPABILITY_BINDING_MISMATCH, locatorId,
                    "capability profile binding differs from the semantic revision", problems);
        }
    }

    private void validateTarget(
            String locatorId,
            SemanticRevision.TargetKind targetKind,
            String targetId,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            Map<String, SemanticRevision.Fact> facts,
            List<SemanticValidationProblem> problems) {
        boolean exists = switch (targetKind) {
            case ELEMENT -> elements.containsKey(targetId);
            case STATE -> states.containsKey(targetId);
            case FACT -> facts.containsKey(targetId);
            case FEATURE -> features.containsKey(targetId);
        };
        if (!exists) {
            missing(locatorId, "target does not exist for " + targetKind, problems);
        }
    }

    private void validateStateQualification(
            SemanticRevision.Endpoint endpoint,
            Map<String, SemanticRevision.State> states,
            List<SemanticValidationProblem> problems) {
        if (endpoint.stateQualificationId() == null) {
            return;
        }
        SemanticRevision.State state = states.get(endpoint.stateQualificationId());
        if (state == null) {
            missing(endpoint.id(), "state qualification does not exist", problems);
        } else if (state.ownerTargetKind() != SemanticRevision.TargetKind.ELEMENT
                || endpoint.targetKind() != SemanticRevision.TargetKind.ELEMENT
                || !state.ownerElementId().equals(endpoint.targetId())) {
            problem(SemanticValidationCode.STATE_OWNER_MISMATCH, endpoint.id(),
                    "state qualification does not belong to the endpoint target", problems);
        }
    }

    private <T> Map<String, T> index(
            Collection<T> values,
            java.util.function.Function<T, String> identifier,
            List<SemanticValidationProblem> problems) {
        Map<String, T> result = new HashMap<>();
        for (T value : values) {
            String id = identifier.apply(value);
            if (result.putIfAbsent(id, value) != null) {
                problem(SemanticValidationCode.DUPLICATE_ID, id, "identifier is duplicated", problems);
            }
        }
        return result;
    }

    private <T> void registerAll(
            Collection<T> values,
            java.util.function.Function<T, String> identifier,
            Set<String> known,
            List<SemanticValidationProblem> problems) {
        for (T value : values) {
            String id = identifier.apply(value);
            if (!known.add(id)) {
                problem(SemanticValidationCode.DUPLICATE_ID, id, "stable identifier is reused across semantic entities", problems);
            }
        }
    }

    private void missing(String locatorId, String message, List<SemanticValidationProblem> problems) {
        problem(SemanticValidationCode.MISSING_REFERENCE, locatorId, message, problems);
    }

    private void problem(
            SemanticValidationCode code,
            String locatorId,
            String message,
            List<SemanticValidationProblem> problems) {
        problems.add(new SemanticValidationProblem(code, locatorId, message));
    }
}
