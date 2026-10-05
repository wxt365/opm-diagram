package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.semantic.SemanticRevision;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/** 子树删除预览与执行共用计划，任何外部引用都阻止整个删除。 */
final class DraftContextDeletion {
    private static final ObjectMapper JSON = new ObjectMapper();
    private DraftContextDeletion() { }

    record Plan(String target, String parent, Set<String> contexts, Set<String> elements, Set<String> features,
                Set<String> states, Set<String> facts, Set<String> occurrences, Set<String> layouts, ArrayNode blockers) {
        ObjectNode impact(JsonNode token) {
            var result = JSON.createObjectNode().put("context_id", target).put("parent_context_id", parent);
            result.set("input_token", token); var ids = result.putArray("context_ids"); contexts.stream().sorted().forEach(ids::add);
            var counts = result.putObject("counts");
            counts.put("contexts", contexts.size()).put("occurrences", occurrences.size()).put("elements", elements.size())
                    .put("features", features.size()).put("states", states.size()).put("facts", facts.size())
                    .put("opl_sentences", 0).put("traces", 0).put("findings", 0);
            result.set("blockers", blockers); return result;
        }
    }

    static Plan plan(SemanticRevision base, String target) {
        var incoming = base.refinementEdges().stream().filter(edge -> edge.childContextId().equals(target)).findFirst()
                .orElseThrow(() -> new DraftWorkspaceService.Failure("DRAFT_EDIT_REJECTED", "CONTEXT_NOT_ALLOWED"));
        if (target.equals(base.rootContextId())) throw new DraftWorkspaceService.Failure("DRAFT_EDIT_REJECTED", "CONTEXT_NOT_ALLOWED");
        var contexts = new TreeSet<String>(); contexts.add(target);
        boolean changed;
        do {
            changed = false;
            for (var edge : base.refinementEdges()) if (contexts.contains(edge.parentContextId())) changed |= contexts.add(edge.childContextId());
        } while (changed);
        var elements = new TreeSet<String>(); var features = new TreeSet<String>(); var states = new TreeSet<String>(); var facts = new TreeSet<String>();
        var occurrences = new TreeSet<String>(); var layouts = new TreeSet<String>();
        for (var occurrence : base.occurrences()) if (contexts.contains(occurrence.contextId())) {
            occurrences.add(occurrence.id()); layouts.add(occurrence.layoutId());
            if (occurrence.ownership() == SemanticRevision.OccurrenceOwnership.OWNED) switch (occurrence.targetKind()) {
                case ELEMENT -> elements.add(occurrence.targetId()); case FEATURE -> features.add(occurrence.targetId());
                case STATE -> states.add(occurrence.targetId()); case FACT -> facts.add(occurrence.targetId()); default -> { }
            }
        }
        base.features().stream().filter(feature -> elements.contains(feature.ownerElementId())).forEach(feature -> features.add(feature.id()));
        base.states().stream().filter(state -> elements.contains(state.ownerElementId()) || features.contains(state.ownerElementId())).forEach(state -> states.add(state.id()));
        do {
            changed = false;
            for (var fact : base.facts()) if (fact.endpoints().stream().anyMatch(endpoint ->
                    elements.contains(endpoint.targetId()) || features.contains(endpoint.targetId()) || states.contains(endpoint.targetId())
                    || (endpoint.stateQualificationId() != null && states.contains(endpoint.stateQualificationId())) || facts.contains(endpoint.targetId()))) changed |= facts.add(fact.id());
        } while (changed);
        var blockers = JSON.createArrayNode();
        for (var occurrence : base.occurrences()) if (!contexts.contains(occurrence.contextId())
                && (elements.contains(occurrence.targetId()) || features.contains(occurrence.targetId()) || states.contains(occurrence.targetId())
                    || facts.contains(occurrence.targetId()) || layouts.contains(occurrence.layoutId()))) {
            blockers.addObject().put("kind", "OCCURRENCE").put("id", occurrence.id()).put("context_id", occurrence.contextId());
        }
        // 没有出现位置的外部关系也不能因删除端点而被静默带走。
        for (var fact : base.facts()) if (facts.contains(fact.id()) && base.occurrences().stream().noneMatch(occurrence ->
                contexts.contains(occurrence.contextId()) && occurrence.targetId().equals(fact.id()) && occurrence.ownership() == SemanticRevision.OccurrenceOwnership.OWNED))
            blockers.addObject().put("kind", "FACT").put("id", fact.id());
        for (var element : base.elements()) if (!elements.contains(element.id())
                && (element.featureIds().stream().anyMatch(features::contains) || element.stateIds().stream().anyMatch(states::contains)))
            blockers.addObject().put("kind", "ELEMENT").put("id", element.id());
        for (var feature : base.features()) if (!features.contains(feature.id()) && elements.contains(feature.ownerElementId()))
            blockers.addObject().put("kind", "FEATURE").put("id", feature.id());
        for (var presentation : base.statePresentations()) if (!contexts.contains(presentation.contextId()) && states.contains(presentation.stateId()))
            blockers.addObject().put("kind", "STATE").put("id", presentation.stateId()).put("context_id", presentation.contextId());
        for (var edge : base.refinementEdges()) if (!contexts.contains(edge.childContextId()) && elements.contains(edge.refineeElementId()))
            blockers.addObject().put("kind", "CONTEXT").put("id", edge.childContextId()).put("context_id", edge.parentContextId());
        for (var context : base.contexts()) if (!contexts.contains(context.id()))
            for (var link : context.architectureLinks()) if (contexts.contains(link.targetContextId()))
                blockers.addObject().put("kind", "CONTEXT").put("id", context.id()).put("context_id", context.id());
        return new Plan(target, incoming.parentContextId(), contexts, elements, features, states, facts, occurrences, layouts, blockers);
    }

    static List<String> apply(ObjectNode document, Plan plan) {
        if (!plan.blockers().isEmpty()) throw new DraftWorkspaceService.Failure("DRAFT_EDIT_REJECTED", "DELETE_DEPENDENCY_EXISTS");
        var affected = new ArrayList<String>();
        remove(document, "contexts", "context_id", plan.contexts(), affected);
        remove(document, "elements", "element_id", plan.elements(), affected);
        remove(document, "features", "feature_id", plan.features(), affected);
        remove(document, "states", "state_id", plan.states(), affected);
        remove(document, "facts", "fact_id", plan.facts(), affected);
        remove(document, "occurrences", "occurrence_id", plan.occurrences(), affected);
        remove(document, "layouts", "layout_id", plan.layouts(), affected);
        filter(document, "refinement_edges", item -> {
            if (!plan.contexts().contains(item.path("child_context_id").asText())) return false;
            affected.add(item.path("refinement_id").asText()); return true;
        });
        filter(document, "state_presentations", item -> plan.contexts().contains(item.path("context_id").asText()) || plan.states().contains(item.path("state_id").asText()));
        return affected;
    }
    private static void remove(ObjectNode document, String collection, String key, Set<String> ids, List<String> affected) {
        filter(document, collection, item -> {
            String id = item.path(key).asText(); if (!ids.contains(id)) return false;
            affected.add(id); return true;
        });
    }
    private static void filter(ObjectNode document, String collection, java.util.function.Predicate<JsonNode> remove) {
        if (!(document.get(collection) instanceof ArrayNode array)) return;
        for (int index = array.size() - 1; index >= 0; index--) if (remove.test(array.get(index))) array.remove(index);
    }
}
