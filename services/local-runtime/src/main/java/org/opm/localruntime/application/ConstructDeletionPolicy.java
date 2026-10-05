package org.opm.localruntime.application;

import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.api.generated.ApiEdtContract;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import static org.opm.localruntime.application.RuntimeActiveBindingProvider.*;
import static org.opm.localruntime.application.SemanticViewSupport.*;

/** 删除影响计划、候选和语义删除，授权及落库仍由调用层负责。 */
final class ConstructDeletionPolicy {
    private ConstructDeletionPolicy() { }

    static List<ApiEdtContract.CommandCapabilityOption> deleteOptions(String queryId, SemanticRevision revision, SemanticRevision.Occurrence occurrence) {
        if (occurrence == null) return List.of();
        List<ApiEdtContract.CommandCapabilityOption> options = new ArrayList<>();
        String targetKind = occurrence.targetKind().name();
        String display = "删除 " + targetKind;
        DeletePlan targetPlan = deletePlan(revision, occurrence, "DELETE_TARGET");
        if (occurrence.targetKind() != SemanticRevision.TargetKind.FACT
                && (occurrence.ownership() == SemanticRevision.OccurrenceOwnership.REFERENCED
                || revision.occurrences().stream().filter(item -> item.targetKind() == occurrence.targetKind() && item.targetId().equals(occurrence.targetId()) && item.ownership() == SemanticRevision.OccurrenceOwnership.OWNED).count() > 1)) {
            options.add(deleteOption(queryId, revision, occurrence, "REMOVE_OCCURRENCE", "移除此视图", true, List.of(), deletePlan(revision, occurrence, "REMOVE_OCCURRENCE")));
        }
        boolean blocked = targetPlan.items().stream().anyMatch(item -> "CASCADE".equals(item.effect()));
        options.add(deleteOption(queryId, revision, occurrence, "DELETE_TARGET", display, !blocked,
                blocked ? List.of("DELETE_DEPENDENCY_EXISTS") : List.of(), blocked ? targetPlan.withBlockers() : targetPlan));
        if (blocked) options.add(deleteOption(queryId, revision, occurrence, "CASCADE", "级联" + display, true, List.of(), deletePlan(revision, occurrence, "CASCADE")));
        return List.copyOf(options);
    }

    static ApiEdtContract.CommandCapabilityOption deleteOption(String queryId, SemanticRevision revision, SemanticRevision.Occurrence occurrence,
                                                                  String mode, String display, boolean enabled, List<String> reasons, DeletePlan plan) {
        ApiEdtContract.AssetReference symbol = new ApiEdtContract.AssetReference("symbol." + occurrence.targetKind().name().toLowerCase(), SYMBOL_VERSION, SYMBOL_DIGEST);
        ApiEdtContract.AssetReference template = new ApiEdtContract.AssetReference(GRAMMAR_ID, GRAMMAR_VERSION, GRAMMAR_DIGEST);
        ApiEdtContract.AssetReference rule = new ApiEdtContract.AssetReference(RULE_ID, RULE_VERSION, RULE_DIGEST);
        ApiEdtContract.ImpactSummary impact = new ApiEdtContract.ImpactSummary(revision.revisionId(), occurrence.id(), mode,
                new ApiEdtContract.DeleteTarget(plan.targetKind(), plan.targetId()), plan.items(), plan.counts());
        String token = deleteToken(revision, queryId, occurrence.id(), mode, plan);
        return new ApiEdtContract.CommandCapabilityOption(queryId, "option.delete." + digest(queryId + ":" + mode).substring(0, 20), ApiEdtContract.CommandType.DELETE_CONSTRUCT,
                "CAP-DELETE-001", null, display, List.of("Delete", occurrence.targetKind().name()), List.of(),
                List.of(new ApiEdtContract.RequiredField("impact_token", "TOKEN", true, List.of())), List.of(), symbol, template, List.of(rule), enabled, reasons,
                impact, token, mode, new ApiEdtContract.DeleteTarget(plan.targetKind(), plan.targetId()), revision.revisionId());
    }

    static DeletePlan deletePlan(SemanticRevision revision, SemanticRevision.Occurrence occurrence, String mode) {
        String targetKind = "REMOVE_OCCURRENCE".equals(mode) ? "OCCURRENCE" : occurrence.targetKind().name();
        String targetId = "REMOVE_OCCURRENCE".equals(mode) ? occurrence.id() : occurrence.targetId();
        Set<String> elements = new HashSet<>(), features = new HashSet<>(), states = new HashSet<>(), facts = new HashSet<>();
        if (!"REMOVE_OCCURRENCE".equals(mode)) {
            if (occurrence.targetKind() == SemanticRevision.TargetKind.ELEMENT) {
                elements.add(occurrence.targetId());
                revision.elements().stream().filter(element -> elements.contains(element.id())).forEach(element -> { features.addAll(element.featureIds()); states.addAll(element.stateIds()); });
            } else if (occurrence.targetKind() == SemanticRevision.TargetKind.FEATURE) features.add(occurrence.targetId());
            else if (occurrence.targetKind() == SemanticRevision.TargetKind.STATE) states.add(occurrence.targetId());
            else if (occurrence.targetKind() == SemanticRevision.TargetKind.FACT) facts.add(occurrence.targetId());
            revision.states().stream().filter(state -> features.contains(state.ownerElementId())).forEach(state -> states.add(state.id()));
            revision.facts().stream().filter(fact -> fact.endpoints().stream().anyMatch(endpoint ->
                    elements.contains(endpoint.targetId()) || features.contains(endpoint.targetId()) || states.contains(endpoint.targetId()) || states.contains(endpoint.stateQualificationId())))
                    .forEach(fact -> facts.add(fact.id()));
        }
        List<ApiEdtContract.DeleteImpactItem> items = new ArrayList<>();
        if ("REMOVE_OCCURRENCE".equals(mode)) items.add(new ApiEdtContract.DeleteImpactItem("OCCURRENCE", occurrence.id(), occurrence.contextId(), "DIRECT"));
        else {
            String dependentEffect = "DELETE_TARGET".equals(mode) ? "CASCADE" : "CASCADE";
            elements.forEach(id -> items.add(new ApiEdtContract.DeleteImpactItem("ELEMENT", id, null, id.equals(targetId) ? "DIRECT" : dependentEffect)));
            features.forEach(id -> items.add(new ApiEdtContract.DeleteImpactItem("FEATURE", id, null, id.equals(targetId) ? "DIRECT" : dependentEffect)));
            states.forEach(id -> items.add(new ApiEdtContract.DeleteImpactItem("STATE", id, null, id.equals(targetId) ? "DIRECT" : dependentEffect)));
            facts.forEach(id -> items.add(new ApiEdtContract.DeleteImpactItem("FACT", id, null, id.equals(targetId) ? "DIRECT" : dependentEffect)));
            revision.occurrences().stream().filter(item -> elements.contains(item.targetId()) || features.contains(item.targetId()) || states.contains(item.targetId()) || facts.contains(item.targetId()))
                    .forEach(item -> items.add(new ApiEdtContract.DeleteImpactItem("OCCURRENCE", item.id(), item.contextId(), item.id().equals(occurrence.id()) ? "DIRECT" : dependentEffect)));
        }
        items.sort(Comparator.comparing(ApiEdtContract.DeleteImpactItem::kind).thenComparing(ApiEdtContract.DeleteImpactItem::id).thenComparing(item -> item.contextId() == null ? "" : item.contextId()));
        int occurrences = (int) items.stream().filter(item -> "OCCURRENCE".equals(item.kind())).count();
        return new DeletePlan(targetKind, targetId, List.copyOf(items), new ApiEdtContract.DeleteImpactCounts(0, occurrences, elements.size(), features.size(), states.size(), facts.size(), 0, 0, 0));
    }

    static String deleteToken(SemanticRevision revision, String queryId, String selectionId, String mode, DeletePlan plan) {
        return "impact." + digest(revision.revisionId() + ":" + revision.profileBinding().bindingDigest() + ":" + queryId + ":" + selectionId + ":" + mode + ":" + plan);
    }

    record DeletePlan(String targetKind, String targetId, List<ApiEdtContract.DeleteImpactItem> items, ApiEdtContract.DeleteImpactCounts counts) {
        DeletePlan withBlockers() { return new DeletePlan(targetKind, targetId, items.stream().map(item -> new ApiEdtContract.DeleteImpactItem(item.kind(), item.id(), item.contextId(), "CASCADE".equals(item.effect()) ? "BLOCKER" : item.effect())).toList(), counts); }
    }

    static void applyDeletePlan(DeletePlan plan, String mode, List<SemanticRevision.Element> elements, List<SemanticRevision.Feature> features,
                                 List<SemanticRevision.State> states, List<SemanticRevision.Fact> facts, List<SemanticRevision.Context> contexts,
                                 List<SemanticRevision.Occurrence> occurrences, List<SemanticRevision.Layout> layouts, List<SemanticRevision.StatePresentation> presentations) {
        Set<String> removedOccurrenceIds = new HashSet<>();
        Set<String> removedTargets = new HashSet<>();
        for (ApiEdtContract.DeleteImpactItem item : plan.items()) {
            if ("OCCURRENCE".equals(item.kind())) removedOccurrenceIds.add(item.id());
            else if (!"REMOVE_OCCURRENCE".equals(mode)) removedTargets.add(item.id());
        }
        if (!"REMOVE_OCCURRENCE".equals(mode)) {
            facts.removeIf(fact -> removedTargets.contains(fact.id()));
            states.removeIf(state -> removedTargets.contains(state.id()));
            features.removeIf(feature -> removedTargets.contains(feature.id()));
            elements.removeIf(element -> removedTargets.contains(element.id()));
            for (int index = 0; index < elements.size(); index++) {
                SemanticRevision.Element element = elements.get(index);
                elements.set(index, new SemanticRevision.Element(element.id(), element.coreKind(), element.capability(), element.name(),
                        element.featureIds().stream().filter(id -> !removedTargets.contains(id)).toList(),
                        element.stateIds().stream().filter(id -> !removedTargets.contains(id)).toList(), element.source(), element.normalization()));
            }
            presentations.removeIf(presentation -> removedTargets.contains(presentation.stateId()));
        }
        Set<String> removedLayoutIds = occurrences.stream().filter(item -> removedOccurrenceIds.contains(item.id())).map(SemanticRevision.Occurrence::layoutId).collect(java.util.stream.Collectors.toSet());
        occurrences.removeIf(item -> removedOccurrenceIds.contains(item.id()));
        layouts.removeIf(layout -> removedLayoutIds.contains(layout.id()));
        for (int index = 0; index < contexts.size(); index++) {
            SemanticRevision.Context context = contexts.get(index);
            contexts.set(index, new SemanticRevision.Context(context.id(), context.kind(), context.capability(), context.name(),
                    context.occurrenceIds().stream().filter(id -> !removedOccurrenceIds.contains(id)).toList(), context.source()));
        }
    }

    static boolean stateHasFactReferences(SemanticRevision revision, String stateId) {
        return revision.facts().stream().anyMatch(fact -> fact.endpoints().stream().anyMatch(endpoint ->
                endpoint.targetKind() == SemanticRevision.TargetKind.STATE && endpoint.targetId().equals(stateId) || stateId.equals(endpoint.stateQualificationId())));
    }

    static String deleteStateToken(SemanticRevision revision, String stateId) {
        int occurrences = (int) revision.occurrences().stream().filter(item -> item.targetKind() == SemanticRevision.TargetKind.STATE && item.targetId().equals(stateId)).count();
        int references = (int) revision.facts().stream().filter(fact -> fact.endpoints().stream().anyMatch(endpoint ->
                endpoint.targetKind() == SemanticRevision.TargetKind.STATE && endpoint.targetId().equals(stateId) || stateId.equals(endpoint.stateQualificationId()))).count();
        return "impact." + digest(revision.revisionId() + ":" + stateId + ":" + revision.profileBinding().bindingDigest() + ":" + occurrences + ":" + references);
    }

}
