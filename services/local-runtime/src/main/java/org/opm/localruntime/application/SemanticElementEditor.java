package org.opm.localruntime.application;

import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.api.ApiErrorCode;
import org.opm.localruntime.api.ApiException;
import java.util.List;
import java.util.Map;
import static org.opm.localruntime.application.SemanticViewSupport.*;
import static org.opm.localruntime.application.SemanticEditValues.*;
import static org.opm.localruntime.application.SemanticLayoutEditor.*;

/** Element、Feature、State 的候选编辑，不负责 Revision 或 DraftToken 授权。 */
final class SemanticElementEditor {
    private SemanticElementEditor() { }

    static void createFeatureConstruct(SemanticRevision base, Map<String, Object> payload, List<SemanticRevision.Element> elements, List<SemanticRevision.Feature> features, List<SemanticRevision.Context> contexts, List<SemanticRevision.Occurrence> occurrences, List<SemanticRevision.Layout> layouts) {
        String ownerId = required(payload, "owner_element_id");
        SemanticRevision.Element owner = elements.stream().filter(element -> element.id().equals(ownerId)).findFirst().orElseThrow(() -> domain("Feature owner 不存在"));
        String kind = required(payload, "feature_kind");
        if (!"ATTRIBUTE".equals(kind) && !"OPERATION".equals(kind)) throw profileForbidden();
        String capabilityId = required(requiredMap(payload, "capability_ref"), "capability_id");
        String expectedCapability = "ATTRIBUTE".equals(kind) ? "CAP-FEAT-ATTRIBUTE-001" : "CAP-FEAT-OPERATION-001";
        if (!expectedCapability.equals(capabilityId)) throw domain("Feature kind 与 Capability 不匹配");
        String requestedFeatureId = optional(payload, "feature_id");
        String featureId = requestedFeatureId == null ? newId("feature") : requestedFeatureId;
        stableId(featureId);
        if (features.stream().anyMatch(feature -> feature.id().equals(featureId))) throw domain("Feature 标识已存在");
        features.add(new SemanticRevision.Feature(featureId, ownerId, SemanticRevision.FeatureKind.valueOf(kind), capability(capabilityId), qualifiedName(required(payload, "name")), source(kind + "Feature"), core()));
        replaceElementFeatureIds(elements, ownerId, append(owner.featureIds(), featureId));
        appendOccurrence(base, featureId, SemanticRevision.TargetKind.FEATURE, "ATTRIBUTE".equals(kind) ? "ATTRIBUTE_NODE" : "OPERATION_NODE", payload, contexts, occurrences, layouts);
    }

    static void createStateConstruct(SemanticRevision base, Map<String, Object> payload, List<SemanticRevision.Element> elements, List<SemanticRevision.Feature> features, List<SemanticRevision.State> states, List<SemanticRevision.Context> contexts, List<SemanticRevision.Occurrence> occurrences, List<SemanticRevision.Layout> layouts, List<SemanticRevision.StatePresentation> presentations) {
        Map<String, Object> ownerRef = requiredMap(payload, "owner_ref");
        String ownerKind = required(ownerRef, "target_kind");
        if (!"ELEMENT".equals(ownerKind) && !"FEATURE".equals(ownerKind)) throw domain("State owner 必须是 Element 或 Feature");
        String ownerId = required(ownerRef, "target_id");
        SemanticRevision.Element owner = "ELEMENT".equals(ownerKind) ? elements.stream().filter(element -> element.id().equals(ownerId)).findFirst().orElseThrow(() -> domain("State owner 不存在")) : null;
        SemanticRevision.Feature featureOwner = "FEATURE".equals(ownerKind) ? features.stream().filter(feature -> feature.id().equals(ownerId)).findFirst().orElseThrow(() -> domain("Feature State owner 不存在")) : null;
        if (owner != null && owner.coreKind() != SemanticRevision.CoreKind.OBJECT) throw profileForbidden();
        String requestedStateId = optional(payload, "state_id");
        String stateId = requestedStateId == null ? newId("state") : requestedStateId;
        stableId(stateId);
        if (states.stream().anyMatch(state -> state.id().equals(stateId))) throw domain("State 标识已存在");
        String stateCapability = owner == null ? "CAP-FEAT-STATE-001" : "CAP-STATE-001";
        states.add(new SemanticRevision.State(stateId, SemanticRevision.TargetKind.valueOf(ownerKind), ownerId, capability(stateCapability), qualifiedName(required(payload, "name_or_value")), stateRoles(payload), source(owner == null ? "FeatureValueState" : "ObjectState"), core()));
        if (owner != null) replaceElementStateIds(elements, ownerId, append(owner.stateIds(), stateId));
        appendOccurrence(base, stateId, SemanticRevision.TargetKind.STATE, owner == null ? "FEATURE_STATE_NODE" : "STATE_NODE", payload, contexts, occurrences, layouts);
        containState(states.getLast(), occurrences.getLast(), occurrences, layouts, true);
        String contextId = optional(payload, "context_id");
        presentations.add(new SemanticRevision.StatePresentation(contextId == null ? base.rootContextId() : contextId,
                stateId, SemanticRevision.StateExplicitness.EXPLICIT, SemanticRevision.StateFoldState.UNFOLDED));
    }

    static void updateStateConstruct(Map<String, Object> payload, List<SemanticRevision.State> states) {
        String stateId = required(payload, "state_id");
        SemanticRevision.State current = states.stream().filter(state -> state.id().equals(stateId)).findFirst().orElseThrow(() -> domain("State 不存在"));
        Map<String, Object> ownerRef = requiredMap(payload, "expected_owner_ref");
        if (!current.ownerTargetKind().name().equals(required(ownerRef, "target_kind")) || !current.ownerElementId().equals(required(ownerRef, "target_id"))) throw domain("State owner 不匹配");
        Map<String, Object> changes = requiredMap(payload, "changes");
        if (changes.isEmpty()) throw domain("State 更新至少需要一个字段");
        String name = optional(changes, "name_or_value");
        List<SemanticRevision.StateRole> roles = changes.containsKey("state_roles") ? stateRoles(changes) : current.roles();
        for (int index = 0; index < states.size(); index++) {
            if (states.get(index).id().equals(stateId)) states.set(index, new SemanticRevision.State(stateId, current.ownerTargetKind(), current.ownerElementId(), current.capability(), qualifiedName(name == null ? current.name().localName() : name), roles, current.source(), current.normalization()));
        }
    }

    static void updateStatePresentation(SemanticRevision base, String type, Map<String, Object> payload, List<SemanticRevision.State> states, List<SemanticRevision.Context> contexts, List<SemanticRevision.Occurrence> occurrences, List<SemanticRevision.Layout> layouts, List<SemanticRevision.StatePresentation> presentations) {
        String contextId = required(payload, "context_id");
        String stateId = required(payload, "state_id");
        if (contexts.stream().noneMatch(context -> context.id().equals(contextId))) throw domain("State presentation Context 不存在或不可编辑");
        if (states.stream().noneMatch(state -> state.id().equals(stateId))) throw domain("State 不存在");
        SemanticRevision.StatePresentation current = presentations.stream()
                .filter(presentation -> presentation.contextId().equals(contextId) && presentation.stateId().equals(stateId))
                .findFirst()
                .orElse(new SemanticRevision.StatePresentation(contextId, stateId, SemanticRevision.StateExplicitness.EXPLICIT, SemanticRevision.StateFoldState.UNFOLDED));
        SemanticRevision.StateExplicitness explicitness = "STATE_SUPPRESS".equals(type)
                ? SemanticRevision.StateExplicitness.SUPPRESSED
                : "STATE_EXPLICIT".equals(type) ? SemanticRevision.StateExplicitness.EXPLICIT : current.explicitness();
        SemanticRevision.StateFoldState foldState = "FOLD".equals(type)
                ? SemanticRevision.StateFoldState.FOLDED
                : "UNFOLD".equals(type) ? SemanticRevision.StateFoldState.UNFOLDED : current.foldState();
        replaceStatePresentation(presentations, new SemanticRevision.StatePresentation(contextId, stateId, explicitness, foldState));
        if (explicitness == SemanticRevision.StateExplicitness.SUPPRESSED) {
            removeStateOccurrences(contextId, stateId, contexts, occurrences, layouts);
        } else if (occurrences.stream().noneMatch(occurrence -> occurrence.contextId().equals(contextId)
                && occurrence.targetKind() == SemanticRevision.TargetKind.STATE && occurrence.targetId().equals(stateId))) {
            String role = states.stream().filter(state -> state.id().equals(stateId)).findFirst().orElseThrow().ownerTargetKind() == SemanticRevision.TargetKind.FEATURE ? "FEATURE_STATE_NODE" : "STATE_NODE";
            appendOccurrence(base, stateId, SemanticRevision.TargetKind.STATE, role, payload, contexts, occurrences, layouts);
            containState(states.stream().filter(state -> state.id().equals(stateId)).findFirst().orElseThrow(), occurrences.getLast(), occurrences, layouts, true);
        }
    }

    static void renameElement(List<SemanticRevision.Element> elements, SemanticRevision.Element current, Object value, boolean rejectUnchanged) {
        String name = elementName(value);
        if (rejectUnchanged && name.equals(current.name().localName())) throw domain("Element 名称未发生变化");
        for (int index = 0; index < elements.size(); index++) {
            SemanticRevision.Element element = elements.get(index);
            if (element.id().equals(current.id())) {
                elements.set(index, new SemanticRevision.Element(element.id(), element.coreKind(), element.capability(),
                        new SemanticRevision.QualifiedName(element.name().namespace(), name), element.featureIds(), element.stateIds(),
                        element.source(), element.normalization()));
                return;
            }
        }
    }

    static void renameFeature(List<SemanticRevision.Feature> features, SemanticRevision.Feature current, Object value, boolean rejectUnchanged) {
        String name = elementName(value);
        if (rejectUnchanged && name.equals(current.name().localName())) throw domain("Feature 名称未发生变化");
        for (int index = 0; index < features.size(); index++) {
            SemanticRevision.Feature feature = features.get(index);
            if (feature.id().equals(current.id())) {
                features.set(index, new SemanticRevision.Feature(feature.id(), feature.ownerElementId(), feature.kind(),
                        feature.capability(), new SemanticRevision.QualifiedName(feature.name().namespace(), name),
                        feature.source(), feature.normalization()));
                return;
            }
        }
    }

    static void createElement(SemanticRevision base, Map<String, Object> payload, List<SemanticRevision.Element> elements,
                               List<SemanticRevision.Context> contexts, List<SemanticRevision.Occurrence> occurrences, List<SemanticRevision.Layout> layouts) {
        String kind = required(payload, "kind");
        if (!"OBJECT".equals(kind) && !"PROCESS".equals(kind)) throw profileForbidden();
        String id = optional(payload, "element_id"); if (id == null) id = newId("element"); stableId(id);
        String name = elementName(payload.get("name"));
        String capability = "OBJECT".equals(kind) ? "CAP-OBJECT-001" : "CAP-PROCESS-001";
        elements.add(new SemanticRevision.Element(id, SemanticRevision.CoreKind.valueOf(kind), capability(capability), qualifiedName(name), List.of(), source(kind), core()));
        appendOccurrence(base, id, SemanticRevision.TargetKind.ELEMENT, "OBJECT".equals(kind) ? "OBJECT_NODE" : "PROCESS_NODE", payload, contexts, occurrences, layouts);
    }

    static void replaceElementStateIds(List<SemanticRevision.Element> elements, String elementId, List<String> stateIds) {
        for (int index = 0; index < elements.size(); index++) {
            SemanticRevision.Element element = elements.get(index);
            if (element.id().equals(elementId)) {
                elements.set(index, new SemanticRevision.Element(element.id(), element.coreKind(), element.capability(), element.name(), element.featureIds(), stateIds, element.source(), element.normalization()));
                return;
            }
        }
        throw domain("State owner 不存在");
    }

    static void replaceElementFeatureIds(List<SemanticRevision.Element> elements, String elementId, List<String> featureIds) {
        for (int index = 0; index < elements.size(); index++) {
            SemanticRevision.Element element = elements.get(index);
            if (element.id().equals(elementId)) {
                elements.set(index, new SemanticRevision.Element(element.id(), element.coreKind(), element.capability(), element.name(), featureIds, element.stateIds(), element.source(), element.normalization()));
                return;
            }
        }
        throw domain("Feature owner 不存在");
    }

    static void replaceStatePresentation(List<SemanticRevision.StatePresentation> presentations, SemanticRevision.StatePresentation replacement) {
        for (int index = 0; index < presentations.size(); index++) {
            SemanticRevision.StatePresentation current = presentations.get(index);
            if (current.contextId().equals(replacement.contextId()) && current.stateId().equals(replacement.stateId())) {
                presentations.set(index, replacement);
                return;
            }
        }
        presentations.add(replacement);
    }

    static void removeStateOccurrences(String contextId, String stateId, List<SemanticRevision.Context> contexts,
                                        List<SemanticRevision.Occurrence> occurrences, List<SemanticRevision.Layout> layouts) {
        List<String> removedOccurrenceIds = occurrences.stream()
                .filter(occurrence -> occurrence.contextId().equals(contextId) && occurrence.targetKind() == SemanticRevision.TargetKind.STATE && occurrence.targetId().equals(stateId))
                .map(SemanticRevision.Occurrence::id).toList();
        List<String> removedLayoutIds = occurrences.stream().filter(occurrence -> removedOccurrenceIds.contains(occurrence.id()))
                .map(SemanticRevision.Occurrence::layoutId).toList();
        occurrences.removeIf(occurrence -> removedOccurrenceIds.contains(occurrence.id()));
        layouts.removeIf(layout -> removedLayoutIds.contains(layout.id()));
        for (int index = 0; index < contexts.size(); index++) {
            SemanticRevision.Context context = contexts.get(index);
            if (context.id().equals(contextId)) {
                contexts.set(index, new SemanticRevision.Context(context.id(), context.kind(), context.capability(), context.name(),
                        context.occurrenceIds().stream().filter(id -> !removedOccurrenceIds.contains(id)).toList(), context.source(), context.architectureLevel(), context.architectureLinks()));
            }
        }
    }

    static List<SemanticRevision.StateRole> stateRoles(Map<String, Object> values) {
        Object raw = values.get("state_roles");
        if (!(raw instanceof List<?> roles)) throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "state_roles 必须是数组");
        try {
            return roles.stream().map(value -> SemanticRevision.StateRole.valueOf(requiredText(value, "state_roles"))).toList();
        } catch (IllegalArgumentException exception) {
            throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "state_roles 包含非法角色");
        }
    }

    static String requiredText(Object value, String key) {
        if (value instanceof String text && !text.isBlank()) return text;
        throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "缺少字段 " + key);
    }
}
