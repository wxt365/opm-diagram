package org.opm.localruntime.application;

import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.api.generated.ApiEdtContract;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import static org.opm.localruntime.application.SemanticViewSupport.*;
import static org.opm.localruntime.application.SemanticEditValues.*;
import static org.opm.localruntime.application.CommandCapabilityOptions.*;
import static org.opm.localruntime.application.SemanticLayoutEditor.*;

/** Procedural、Control、Structural Fact 的无存储编辑规则。 */
final class SemanticFactEditor {
    private SemanticFactEditor() { }

    static void createProceduralFact(SemanticRevision base, Map<String, Object> payload, List<SemanticRevision.Fact> facts,
                                      List<SemanticRevision.Context> contexts, List<SemanticRevision.Occurrence> occurrences, List<SemanticRevision.Layout> layouts) {
        Map<String, Object> capabilityRef = requiredMap(payload, "capability_ref");
        String capabilityId = required(capabilityRef, "capability_id");
        ProceduralLinkCatalog.Descriptor descriptor = ProceduralLinkCatalog.find(capabilityId).orElseGet(() -> {
            if (ControlLinkCatalog.find(capabilityId).isPresent()) throw modifierCombinationInvalid("Control 不能作为独立 Fact 创建");
            throw profileForbidden();
        });
        if (!descriptor.family().name().equals(required(payload, "fact_family")) || !"DIRECTED".equals(required(payload, "direction"))) {
            throw domain("过程关系的 Fact family 或方向不符合 Capability");
        }
        List<Map<String, Object>> endpointInputs = objectList(payload.get("normalized_endpoints"), "normalized_endpoints");
        List<ProceduralTarget> selected = endpointInputs.stream().map(input -> {
            Map<String, Object> targetRef = requiredMap(input, "target_ref");
            return proceduralTarget(base, required(targetRef, "target_id"));
        }).toList();
        if (selected.stream().anyMatch(java.util.Objects::isNull)) throw domain("过程关系端点必须引用当前修订中的 Object、State 或 Process");
        List<ApiEdtContract.NormalizedEndpoint> normalized = normalizeProceduralEndpoints(descriptor, selected)
                .orElseThrow(() -> domain("过程关系端点不符合 Capability"));
        if (descriptor.sameProcessRequired() && !normalized.getFirst().targetRef().targetId().equals(normalized.get(1).targetRef().targetId())) {
            throw domain("Self-invocation 必须引用同一稳定 Process 标识");
        }
        String requestedId = optional(payload, "fact_id");
        String id = requestedId == null ? newId("fact.procedural") : requestedId;
        stableId(id);
        if (facts.stream().anyMatch(fact -> fact.id().equals(id))) throw domain("Fact 标识已存在");
        List<SemanticRevision.Modifier> modifiers = proceduralModifiers(payload, descriptor);
        List<SemanticRevision.Endpoint> endpoints = normalized.stream().map(endpoint -> new SemanticRevision.Endpoint(
                newId("endpoint"), endpoint.role(), SemanticRevision.TargetKind.valueOf(endpoint.targetRef().targetKind()), endpoint.targetRef().targetId(), endpoint.ordinal(), endpoint.stateQualification())).toList();
        facts.add(new SemanticRevision.Fact(id, descriptor.family(), capability(capabilityId), endpoints, SemanticRevision.Direction.DIRECTED, modifiers,
                source(descriptor.displayName().replace(" ", "")), core()));
        appendOccurrence(base, id, SemanticRevision.TargetKind.FACT, "PROCEDURAL_LINK", payload, contexts, occurrences, layouts);
    }

    static void createStructuralFact(SemanticRevision base, Map<String, Object> payload, List<SemanticRevision.Fact> facts,
                                      List<SemanticRevision.Context> contexts, List<SemanticRevision.Occurrence> occurrences, List<SemanticRevision.Layout> layouts) {
        String capabilityId = required(requiredMap(payload, "capability_ref"), "capability_id");
        StructuralLinkCatalog.Descriptor descriptor = StructuralLinkCatalog.find(capabilityId).orElseThrow(SemanticEditValues::profileForbidden);
        if (!"STRUCTURAL".equals(required(payload, "fact_family"))) throw domain("结构关系必须使用 STRUCTURAL Fact family");
        List<Map<String, Object>> inputs = objectList(payload.get("normalized_endpoints"), "normalized_endpoints");
        List<StructuralTarget> selected = inputs.stream().map(input -> structuralTarget(base, required(requiredMap(input, "target_ref"), "target_id"))).toList();
        if (selected.stream().anyMatch(java.util.Objects::isNull)) throw domain("结构关系端点必须引用当前修订中的 Object、Process 或 State");
        List<ApiEdtContract.NormalizedEndpoint> normalized = normalizeStructuralEndpoints(descriptor, selected)
                .orElseThrow(() -> domain("结构关系端点不符合 Capability"));
        List<SemanticRevision.Label> labels = labels(payload, descriptor);
        SemanticRevision.Direction direction = structuralDirection(payload, descriptor, labels);
        String requestedId = optional(payload, "fact_id");
        String id = requestedId == null ? newId("fact.structural") : requestedId;
        stableId(id);
        if (facts.stream().anyMatch(fact -> fact.id().equals(id))) throw domain("Fact 标识已存在");
        List<SemanticRevision.Endpoint> endpoints = structuralEndpoints(normalized);
        facts.add(new SemanticRevision.Fact(id, SemanticRevision.FactFamily.STRUCTURAL, capability(capabilityId), endpoints, direction, List.of(),
                labels, structuralCompleteness(payload, descriptor), source(descriptor.displayName().replace(" ", "")), core()));
        appendOccurrence(base, id, SemanticRevision.TargetKind.FACT, "STRUCTURAL_LINK", payload, contexts, occurrences, layouts);
    }

    static void updateProceduralFact(SemanticRevision base, Map<String, Object> payload, List<SemanticRevision.Fact> facts) {
        String factId = required(payload, "fact_id");
        SemanticRevision.Fact current = facts.stream().filter(fact -> fact.id().equals(factId)).findFirst().orElseThrow(() -> domain("Fact 不存在"));
        Map<String, Object> expected = requiredMap(payload, "expected_capability_ref");
        if (!current.capability().capabilityId().equals(required(expected, "capability_id"))) throw domain("Fact Capability 不匹配");
        ProceduralLinkCatalog.Descriptor descriptor = ProceduralLinkCatalog.find(current.capability().capabilityId()).orElseThrow(SemanticEditValues::profileForbidden);
        Map<String, Object> replacement = requiredMap(payload, "replacement");
        List<SemanticRevision.Endpoint> endpoints = replacement.containsKey("normalized_endpoints")
                ? normalizedFactEndpoints(base, descriptor, objectList(replacement.get("normalized_endpoints"), "replacement.normalized_endpoints")) : current.endpoints();
        List<SemanticRevision.Modifier> modifiers;
        if (replacement.containsKey("modifiers") && objectList(replacement.get("modifiers"), "replacement.modifiers").isEmpty() && hasValidControlPair(current.modifiers())) {
            modifiers = List.of();
        } else if (replacement.containsKey("modifiers") && containsControlModifier(objectList(replacement.get("modifiers"), "replacement.modifiers"))) {
            ControlLinkCatalog.Descriptor control = controlDescriptor(replacement);
            if (!control.baseCapabilityIds().contains(current.capability().capabilityId())) throw modifierCombinationInvalid("Control Capability 与基础 Fact 不匹配");
            modifiers = controlModifiers(replacement, control);
        } else {
            modifiers = replacement.containsKey("modifiers")
                    ? proceduralModifiers(Map.of("modifiers", replacement.get("modifiers")), descriptor) : current.modifiers();
        }
        if (descriptor.durationRequired() && modifiers.stream().noneMatch(modifier -> "duration".equals(modifier.id()))) throw domain("Exception Link 必须包含 duration");
        for (int index = 0; index < facts.size(); index++) {
            if (facts.get(index).id().equals(factId)) {
                facts.set(index, new SemanticRevision.Fact(current.id(), current.family(), current.capability(), endpoints, current.direction(), modifiers, current.source(), current.normalization()));
                return;
            }
        }
    }

    static void updateStructuralFact(SemanticRevision base, Map<String, Object> payload, List<SemanticRevision.Fact> facts) {
        String factId = required(payload, "fact_id");
        SemanticRevision.Fact current = facts.stream().filter(fact -> fact.id().equals(factId)).findFirst().orElseThrow(() -> domain("Fact 不存在"));
        Map<String, Object> expected = requiredMap(payload, "expected_capability_ref");
        if (!current.capability().capabilityId().equals(required(expected, "capability_id"))) throw domain("Fact Capability 不匹配");
        StructuralLinkCatalog.Descriptor descriptor = StructuralLinkCatalog.find(current.capability().capabilityId()).orElseThrow(SemanticEditValues::profileForbidden);
        Map<String, Object> replacement = requiredMap(payload, "replacement");
        List<StructuralTarget> selected = replacement.containsKey("normalized_endpoints")
                ? objectList(replacement.get("normalized_endpoints"), "replacement.normalized_endpoints").stream()
                        .map(endpoint -> structuralTarget(base, required(requiredMap(endpoint, "target_ref"), "target_id"))).toList()
                : current.endpoints().stream().map(endpoint -> structuralTarget(base, endpoint.targetId())).toList();
        if (selected.stream().anyMatch(java.util.Objects::isNull)) throw domain("结构关系端点必须引用当前修订中的 Object、Process 或 State");
        List<ApiEdtContract.NormalizedEndpoint> normalized = normalizeStructuralEndpoints(descriptor, selected)
                .orElseThrow(() -> domain("结构关系端点不符合 Capability"));
        List<SemanticRevision.Label> labels = replacement.containsKey("labels") ? labels(replacement, descriptor) : current.labels();
        SemanticRevision.CollectionCompleteness completeness = replacement.containsKey("collection_completeness")
                ? structuralCompleteness(replacement, descriptor) : current.collectionCompleteness();
        SemanticRevision.Direction direction = descriptor.direction() == SemanticRevision.Direction.PROFILE_DEFINED
                ? structuralDirection(replacement.containsKey("direction") ? replacement : Map.of("direction", current.direction().name()), descriptor, labels)
                : descriptor.direction();
        for (int index = 0; index < facts.size(); index++) {
            if (facts.get(index).id().equals(factId)) {
                facts.set(index, new SemanticRevision.Fact(current.id(), current.family(), current.capability(), structuralEndpoints(normalized), direction,
                        current.modifiers(), labels, completeness, current.source(), current.normalization()));
                return;
            }
        }
    }

    static List<SemanticRevision.Modifier> proceduralModifiers(Map<String, Object> payload, ProceduralLinkCatalog.Descriptor descriptor) {
        List<Map<String, Object>> values = objectList(payload.getOrDefault("modifiers", List.of()), "modifiers");
        List<SemanticRevision.Modifier> result = values.stream().map(value -> new SemanticRevision.Modifier(required(value, "modifier_id"), required(value, "value"))).toList();
        if (!descriptor.durationRequired()) return result;
        String duration = result.stream().filter(value -> "duration".equals(value.id())).map(SemanticRevision.Modifier::value).findFirst()
                .orElseThrow(() -> domain("Exception Link 必须包含 duration"));
        try {
            java.time.Duration parsed = java.time.Duration.parse(duration);
            if (parsed.isZero() || parsed.isNegative()) throw domain("Exception Link 的 duration 必须为正 ISO-8601 Duration");
        } catch (java.time.format.DateTimeParseException exception) {
            throw domain("Exception Link 的 duration 必须为 ISO-8601 Duration");
        }
        return result;
    }

    static List<SemanticRevision.Endpoint> normalizedFactEndpoints(SemanticRevision base, ProceduralLinkCatalog.Descriptor descriptor, List<Map<String, Object>> endpointInputs) {
        List<ProceduralTarget> selected = endpointInputs.stream().map(input -> proceduralTarget(base, required(requiredMap(input, "target_ref"), "target_id"))).toList();
        if (selected.stream().anyMatch(java.util.Objects::isNull)) throw domain("过程关系端点必须引用当前修订中的 Object、State 或 Process");
        List<ApiEdtContract.NormalizedEndpoint> normalized = normalizeProceduralEndpoints(descriptor, selected).orElseThrow(() -> domain("过程关系端点不符合 Capability"));
        return normalized.stream().map(endpoint -> new SemanticRevision.Endpoint(newId("endpoint"), endpoint.role(),
                SemanticRevision.TargetKind.valueOf(endpoint.targetRef().targetKind()), endpoint.targetRef().targetId(), endpoint.ordinal(), endpoint.stateQualification())).toList();
    }

    static List<SemanticRevision.Endpoint> structuralEndpoints(List<ApiEdtContract.NormalizedEndpoint> normalized) {
        return normalized.stream().map(endpoint -> new SemanticRevision.Endpoint(newId("endpoint"), endpoint.role(),
                SemanticRevision.TargetKind.valueOf(endpoint.targetRef().targetKind()), endpoint.targetRef().targetId(), endpoint.ordinal(), endpoint.stateQualification())).toList();
    }

    static List<SemanticRevision.Label> labels(Map<String, Object> source, StructuralLinkCatalog.Descriptor descriptor) {
        List<Map<String, Object>> values = objectList(source.getOrDefault("labels", List.of()), "labels");
        Map<String, String> bySlot = new LinkedHashMap<>();
        for (Map<String, Object> value : values) {
            String slot = required(value, "slot_id");
            if (!descriptor.labelSlots().contains(slot)) throw domain("结构关系标签槽位不受当前 Capability 支持");
            if (bySlot.put(slot, required(value, "text")) != null) throw domain("结构关系标签槽位不能重复");
        }
        if (descriptor.labelsRequired() && descriptor.direction() != SemanticRevision.Direction.PROFILE_DEFINED
                && !bySlot.keySet().containsAll(descriptor.labelSlots())) {
            if (bySlot.isEmpty() && ("CAP-ISO-STRUCT-001".equals(descriptor.capabilityId())
                    || "CAP-ISO-STRUCT-003".equals(descriptor.capabilityId()))) {
                throw modifierCombinationInvalid("结构关系缺少必填标签槽位");
            }
            throw domain("结构关系缺少必填标签槽位");
        }
        return bySlot.entrySet().stream().map(entry -> new SemanticRevision.Label(entry.getKey(), entry.getValue())).toList();
    }

    static SemanticRevision.CollectionCompleteness structuralCompleteness(Map<String, Object> source, StructuralLinkCatalog.Descriptor descriptor) {
        String value = optional(source, "collection_completeness");
        if (descriptor.completenessSupported()) {
            if (!"COMPLETE".equals(value) && !"INCOMPLETE".equals(value)) throw domain("该结构 fan 必须声明 COMPLETE 或 INCOMPLETE");
            return SemanticRevision.CollectionCompleteness.valueOf(value);
        }
        if (value != null && !"NOT_APPLICABLE".equals(value)) {
            if ("CAP-ISO-STRUCT-008".equals(descriptor.capabilityId()) && "COMPLETE".equals(value)) {
                throw modifierCombinationInvalid("该结构关系不支持完整性标记");
            }
            throw domain("该结构关系不支持完整性标记");
        }
        return SemanticRevision.CollectionCompleteness.NOT_APPLICABLE;
    }

    static SemanticRevision.Direction structuralDirection(Map<String, Object> source, StructuralLinkCatalog.Descriptor descriptor, List<SemanticRevision.Label> labels) {
        String value = required(source, "direction");
        if (descriptor.direction() != SemanticRevision.Direction.PROFILE_DEFINED) {
            if (!descriptor.direction().name().equals(value)) throw domain("结构关系方向不符合 Capability");
            return descriptor.direction();
        }
        SemanticRevision.Direction direction;
        try {
            direction = SemanticRevision.Direction.valueOf(value);
        } catch (IllegalArgumentException exception) {
            throw domain("State-specified Tagged 方向不受支持");
        }
        if (direction != SemanticRevision.Direction.DIRECTED && direction != SemanticRevision.Direction.BIDIRECTIONAL) throw domain("State-specified Tagged 方向不受支持");
        boolean hasForward = labels.stream().anyMatch(label -> "forward_tag".equals(label.slotId()));
        boolean hasReverse = labels.stream().anyMatch(label -> "reverse_tag".equals(label.slotId()));
        if (!hasForward || direction == SemanticRevision.Direction.BIDIRECTIONAL != hasReverse) {
            if ("CAP-ISO-STRUCT-010".equals(descriptor.capabilityId())
                    && direction == SemanticRevision.Direction.BIDIRECTIONAL && labels.isEmpty()) {
                throw modifierCombinationInvalid("State-specified Tagged 的标签与方向不匹配");
            }
            throw domain("State-specified Tagged 的标签与方向不匹配");
        }
        return direction;
    }

    static boolean containsControlModifier(List<Map<String, Object>> modifiers) {
        return modifiers.stream().anyMatch(modifier -> ControlLinkCatalog.CONTROL_CAPABILITY_MODIFIER.equals(optional(modifier, "modifier_id"))
                || ControlLinkCatalog.CONTROL_SEGMENT_MODIFIER.equals(optional(modifier, "modifier_id")));
    }

    static ControlLinkCatalog.Descriptor controlDescriptor(Map<String, Object> replacement) {
        List<Map<String, Object>> modifiers = objectList(replacement.get("modifiers"), "replacement.modifiers");
        List<String> values = modifiers.stream()
                .filter(modifier -> ControlLinkCatalog.CONTROL_CAPABILITY_MODIFIER.equals(optional(modifier, "modifier_id")))
                .map(modifier -> required(modifier, "value"))
                .toList();
        if (values.size() != 1) throw modifierCombinationInvalid("Control Modifier 必须包含唯一 control.capability");
        return ControlLinkCatalog.find(values.getFirst()).orElseThrow(() -> modifierCombinationInvalid("Control Capability 不受当前 Profile 支持"));
    }

    static List<SemanticRevision.Modifier> controlModifiers(Map<String, Object> replacement, ControlLinkCatalog.Descriptor control) {
        List<Map<String, Object>> values = objectList(replacement.get("modifiers"), "replacement.modifiers");
        if (values.size() != 2) throw modifierCombinationInvalid("Control Modifier 必须为完整原子对");
        Map<String, String> controls = new LinkedHashMap<>();
        for (Map<String, Object> value : values) {
            String modifierId = required(value, "modifier_id");
            String modifierValue = required(value, "value");
            if (!ControlLinkCatalog.CONTROL_CAPABILITY_MODIFIER.equals(modifierId) && !ControlLinkCatalog.CONTROL_SEGMENT_MODIFIER.equals(modifierId)) {
                throw modifierCombinationInvalid("Control Modifier 包含不受支持字段");
            }
            if (controls.put(modifierId, modifierValue) != null) throw modifierCombinationInvalid("Control Modifier 不能重复");
        }
        if (!control.capabilityId().equals(controls.get(ControlLinkCatalog.CONTROL_CAPABILITY_MODIFIER))
                || !ControlLinkCatalog.PROCESS_INPUT.equals(controls.get(ControlLinkCatalog.CONTROL_SEGMENT_MODIFIER))) {
            throw modifierCombinationInvalid("Control Modifier 值或 Process 输入段不匹配");
        }
        return List.of(
                new SemanticRevision.Modifier(ControlLinkCatalog.CONTROL_CAPABILITY_MODIFIER, control.capabilityId()),
                new SemanticRevision.Modifier(ControlLinkCatalog.CONTROL_SEGMENT_MODIFIER, ControlLinkCatalog.PROCESS_INPUT));
    }
}
