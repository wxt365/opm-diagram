package org.opm.localruntime.application;

import org.opm.localruntime.semantic.SemanticRevision;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import static org.opm.localruntime.application.SemanticViewSupport.*;

/** 将已提供的语义视图投影为 OPD；不访问数据库、HEAD 或草稿会话。 */
final class OpdProjectionQuery {
    static void addRemarks(Map<String, Object> projection, com.fasterxml.jackson.databind.JsonNode document) {
        var remarks = new java.util.HashMap<String, String>();
        for (String collection : List.of("elements", "features", "states")) for (var item : document.path(collection)) {
            String key = switch (collection) { case "elements" -> "element_id"; case "features" -> "feature_id"; default -> "state_id"; };
            if (item.has("remark")) remarks.put(item.path(key).asText(), item.get("remark").asText());
        }
        @SuppressWarnings("unchecked") var constructs = (List<Map<String, Object>>) projection.get("constructs");
        for (var construct : constructs) {
            var remark = remarks.get(construct.get("target_id"));
            if (remark != null) construct.put("remark", remark);
        }
        var appearances = new java.util.HashMap<String, com.fasterxml.jackson.databind.JsonNode>();
        for (var layout : document.path("layouts")) if (layout.has("appearance"))
            appearances.put(layout.path("layout_id").asText(), layout.get("appearance"));
        var layoutIds = new java.util.HashMap<String, String>();
        for (var occurrence : document.path("occurrences"))
            layoutIds.put(occurrence.path("occurrence_id").asText(), occurrence.path("layout_id").asText());
        for (var construct : constructs) {
            var appearance = appearances.get(layoutIds.get(construct.get("occurrence_id")));
            if (appearance == null) continue;
            @SuppressWarnings("unchecked") var original = (Map<String, Object>) construct.get("layout");
            var layout = new LinkedHashMap<>(original);
            var colors = new LinkedHashMap<String, String>();
            appearance.fields().forEachRemaining(field -> colors.put(field.getKey(), field.getValue().asText()));
            layout.put("appearance", colors); construct.put("layout", layout);
        }
    }
    Map<String, Object> projectionData(SemanticRevision revision, String contextId) {
        SemanticRevision.Context context = context(revision, contextId);
        Map<String, String> labels = labels(revision);
        Map<String, SemanticRevision.Layout> layouts = new LinkedHashMap<>();
        Map<String, SemanticRevision.Feature> features = new LinkedHashMap<>();
        revision.layouts().forEach(layout -> layouts.put(layout.id(), layout));
        revision.features().forEach(feature -> features.put(feature.id(), feature));
        Map<String, String> occurrenceIds = new LinkedHashMap<>();
        Map<String, SemanticRevision.StatePresentation> presentations = new LinkedHashMap<>();
        revision.occurrences().stream()
                .filter(item -> item.contextId().equals(contextId))
                .forEach(item -> occurrenceIds.putIfAbsent(item.targetId(), item.id()));
        revision.statePresentations().stream()
                .filter(item -> item.contextId().equals(contextId))
                .forEach(item -> presentations.put(item.stateId(), item));
        List<Map<String, Object>> constructs = new ArrayList<>();
        for (String occurrenceId : context.occurrenceIds()) {
            SemanticRevision.Occurrence occurrence = revision.occurrences().stream().filter(item -> item.id().equals(occurrenceId)).findFirst().orElseThrow(() -> domain("Context occurrence 不存在"));
            SemanticRevision.StatePresentation presentation = presentations.get(occurrence.targetId());
            if (occurrence.targetKind() == SemanticRevision.TargetKind.STATE && presentation != null
                    && presentation.explicitness() == SemanticRevision.StateExplicitness.SUPPRESSED) continue;
            SemanticRevision.Layout layout = layouts.get(occurrence.layoutId());
            if (layout == null) throw domain("Context layout 不存在");
            Map<String, Object> construct = new LinkedHashMap<>();
            construct.put("occurrence_id", occurrence.id());
            construct.put("target_id", occurrence.targetId());
            construct.put("target_kind", occurrence.targetKind().name());
            construct.put("capability_id", projectionCapability(revision, occurrence));
            construct.put("construct_role", occurrence.constructRole());
            construct.put("label", labels.getOrDefault(occurrence.targetId(), occurrence.targetId()));
            var geometry = new LinkedHashMap<String, Object>(Map.of("x", layout.x(), "y", layout.y(), "width", layout.width(), "height", layout.height(), "z_order", layout.zOrder()));
            if (!layout.edgeRoutes().isEmpty()) geometry.put("edge_routes", layout.edgeRoutes());
            construct.put("layout", geometry);
            if (occurrence.targetKind() == SemanticRevision.TargetKind.FEATURE) {
                SemanticRevision.Feature feature = features.get(occurrence.targetId());
                if (feature == null) throw domain("Context Feature 不存在");
                construct.put("owner_id", feature.ownerElementId());
            }
            if (occurrence.targetKind() == SemanticRevision.TargetKind.STATE) {
                SemanticRevision.State state = revision.states().stream().filter(item -> item.id().equals(occurrence.targetId())).findFirst().orElseThrow(() -> domain("Context State 不存在"));
                construct.put("owner_id", state.ownerElementId());
                construct.put("owner_target_kind", state.ownerTargetKind().name());
                construct.put("state_roles", state.roles().stream().map(Enum::name).toList());
                construct.put("explicitness", presentation == null ? SemanticRevision.StateExplicitness.EXPLICIT.name() : presentation.explicitness().name());
                construct.put("fold_state", presentation == null ? SemanticRevision.StateFoldState.UNFOLDED.name() : presentation.foldState().name());
            }
            if (occurrence.targetKind() == SemanticRevision.TargetKind.FACT) {
                SemanticRevision.Fact fact = revision.facts().stream().filter(item -> item.id().equals(occurrence.targetId())).findFirst().orElseThrow(() -> domain("Context Fact 不存在"));
                if (isConsumptionCapability(fact.capability().capabilityId())) {
                    SemanticRevision.Endpoint source = fact.endpoints().stream().filter(endpoint -> "CONSUMED_OBJECT".equals(endpoint.role()) || "CONSUMED_STATE".equals(endpoint.role())).findFirst().orElseThrow(() -> domain("Consumption 源端点不存在"));
                    SemanticRevision.Endpoint target = fact.endpoints().stream().filter(endpoint -> "CONSUMING_PROCESS".equals(endpoint.role())).findFirst().orElseThrow(() -> domain("Consumption Process 端点不存在"));
                    String sourceId = source.targetId();
                    String targetId = target.targetId();
                    construct.put("source_id", sourceId);
                    construct.put("process_id", targetId);
                    construct.put("capability_id", fact.capability().capabilityId());
                    construct.put("endpoints", fact.endpoints().stream().map(endpoint -> Map.of(
                            "role", endpoint.role(), "target_kind", endpoint.targetKind().name(), "target_id", endpoint.targetId(), "ordinal", endpoint.ordinal())).toList());
                    if (!fact.modifiers().isEmpty()) construct.put("modifiers", fact.modifiers().stream().map(modifier -> Map.of("modifier_id", modifier.id(), "value", modifier.value())).toList());
                    construct.put("source_occurrence_id", occurrenceIds.getOrDefault(sourceId, sourceId));
                    construct.put("target_occurrence_id", occurrenceIds.getOrDefault(targetId, targetId));
                    construct.put("symbol_ref", source.targetKind() == SemanticRevision.TargetKind.STATE ? "symbol.link.consumption.state" : "symbol.link.consumption");
                    construct.put("layout_ref", occurrence.layoutId());
                } else {
                    ProceduralLinkCatalog.find(fact.capability().capabilityId()).ifPresent(descriptor -> {
                        construct.put("capability_id", descriptor.capabilityId());
                        construct.put("symbol_ref", descriptor.symbolId());
                        construct.put("layout_ref", occurrence.layoutId());
                        construct.put("endpoints", fact.endpoints().stream().map(endpoint -> Map.of(
                                "role", endpoint.role(), "target_kind", endpoint.targetKind().name(), "target_id", endpoint.targetId(), "ordinal", endpoint.ordinal())).toList());
                        if (!fact.modifiers().isEmpty()) construct.put("modifiers", fact.modifiers().stream().map(modifier -> Map.of("modifier_id", modifier.id(), "value", modifier.value())).toList());
                    });
                    StructuralLinkCatalog.find(fact.capability().capabilityId()).ifPresent(descriptor -> {
                        construct.put("capability_id", descriptor.capabilityId());
                        construct.put("symbol_ref", descriptor.symbolId());
                        construct.put("layout_ref", occurrence.layoutId());
                        construct.put("endpoints", fact.endpoints().stream().map(endpoint -> Map.of(
                                "role", endpoint.role(), "target_kind", endpoint.targetKind().name(), "target_id", endpoint.targetId(), "ordinal", endpoint.ordinal())).toList());
                        construct.put("direction", fact.direction().name());
                        construct.put("labels", fact.labels().stream().map(label -> Map.of("slot_id", label.slotId(), "text", label.text())).toList());
                        construct.put("collection_completeness", fact.collectionCompleteness().name());
                    });
                }
            }
            constructs.add(construct);
        }
        List<Map<String, Object>> suppressedStates = revision.states().stream()
                .filter(state -> {
                    SemanticRevision.StatePresentation presentation = presentations.get(state.id());
                    return presentation != null && presentation.explicitness() == SemanticRevision.StateExplicitness.SUPPRESSED;
                })
                .sorted(java.util.Comparator.comparing(SemanticRevision.State::id))
                .map(state -> Map.<String, Object>of(
                        "state_id", state.id(),
                        "owner_ref", Map.of("target_kind", state.ownerTargetKind().name(), "target_id", state.ownerElementId()),
                        "name_or_value", state.name().localName(),
                        "state_roles", state.roles().stream().map(Enum::name).toList(),
                        "explicitness", SemanticRevision.StateExplicitness.SUPPRESSED.name()))
                .toList();
        return Map.of("context_id", contextId, "constructs", constructs, "suppressed_states", suppressedStates);
    }

    private String projectionCapability(SemanticRevision revision, SemanticRevision.Occurrence occurrence) {
        return switch (occurrence.targetKind()) {
            case ELEMENT -> revision.elements().stream().filter(element -> element.id().equals(occurrence.targetId())).findFirst()
                    .orElseThrow(() -> domain("Context Element 不存在")).capability().capabilityId();
            case FEATURE -> revision.features().stream().filter(feature -> feature.id().equals(occurrence.targetId())).findFirst()
                    .orElseThrow(() -> domain("Context Feature 不存在")).capability().capabilityId();
            case STATE -> revision.states().stream().filter(state -> state.id().equals(occurrence.targetId())).findFirst()
                    .orElseThrow(() -> domain("Context State 不存在")).capability().capabilityId();
            case FACT -> revision.facts().stream().filter(fact -> fact.id().equals(occurrence.targetId())).findFirst()
                    .orElseThrow(() -> domain("Context Fact 不存在")).capability().capabilityId();
            default -> throw domain("Context construct 类型不支持 Projection capability");
        };
    }

}
