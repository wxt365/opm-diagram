package org.opm.localruntime.application;

import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.api.ApiErrorCode;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.api.generated.ApiEdtContract;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static org.opm.localruntime.application.SemanticViewSupport.*;
import static org.opm.localruntime.application.SemanticEditValues.*;
import static org.opm.localruntime.application.CommandCapabilityOptions.*;
import static org.opm.localruntime.application.ConstructDeletionPolicy.*;
import static org.opm.localruntime.application.SemanticElementEditor.*;
import static org.opm.localruntime.application.SemanticFactEditor.*;
import static org.opm.localruntime.application.SemanticLayoutEditor.*;

/** 组合候选编辑；V1 候选授权与已由 V2 授权的草稿入口保持分离。 */
final class SemanticCommandEditor {
    SemanticRevision applyP0Command(String projectId, String modelId, SemanticRevision base, String type, Map<String, Object> payload) {
        String revisionId = newId("revision");
        List<SemanticRevision.Element> elements = new ArrayList<>(base.elements());
        List<SemanticRevision.Feature> features = new ArrayList<>(base.features());
        List<SemanticRevision.Fact> facts = new ArrayList<>(base.facts());
        List<SemanticRevision.Context> contexts = new ArrayList<>(base.contexts());
        List<SemanticRevision.Occurrence> occurrences = new ArrayList<>(base.occurrences());
        List<SemanticRevision.Layout> layouts = new ArrayList<>(base.layouts());
        List<SemanticRevision.State> states = new ArrayList<>(base.states());
        List<SemanticRevision.StatePresentation> presentations = new ArrayList<>(base.statePresentations());
        if ("CREATE_ELEMENT".equals(type)) {
            createElement(base, payload, elements, contexts, occurrences, layouts);
        } else if ("CREATE_FEATURE".equals(type)) {
            validateFeatureCreateOption(projectId, modelId, base, payload, required(payload, "owner_element_id"), required(requiredMap(payload, "capability_ref"), "capability_id"));
            createFeatureConstruct(base, payload, elements, features, contexts, occurrences, layouts);
        } else if ("CREATE_FACT".equals(type)) {
            if ("CONSUMPTION".equals(optional(payload, "kind"))) {
                String objectId = required(payload, "object_id"); String processId = required(payload, "process_id");
                if (elements.stream().noneMatch(item -> item.id().equals(objectId) && item.coreKind() == SemanticRevision.CoreKind.OBJECT)
                        || elements.stream().noneMatch(item -> item.id().equals(processId) && item.coreKind() == SemanticRevision.CoreKind.PROCESS)) throw domain("Consumption 端点必须引用现有 Object 和 Process");
                String stateId = optional(payload, "state_id");
                if (stateId != null && states.stream().noneMatch(state -> state.id().equals(stateId) && state.ownerElementId().equals(objectId))) {
                    throw domain("Consumption State 必须由被消耗 Object 持有");
                }
                String id = optional(payload, "fact_id"); if (id == null) id = newId("fact.consumption"); stableId(id);
                String capabilityId = stateId == null ? ProceduralLinkCatalog.CONSUMPTION : "CAP-ISO-PROC-006";
                String sourceRole = stateId == null ? "CONSUMED_OBJECT" : "CONSUMED_STATE";
                facts.add(new SemanticRevision.Fact(id, SemanticRevision.FactFamily.TRANSFORMATION, capability(capabilityId), List.of(
                        new SemanticRevision.Endpoint(newId("endpoint"), sourceRole, stateId == null ? SemanticRevision.TargetKind.ELEMENT : SemanticRevision.TargetKind.STATE, stateId == null ? objectId : stateId, 0, null),
                        new SemanticRevision.Endpoint(newId("endpoint"), "CONSUMING_PROCESS", SemanticRevision.TargetKind.ELEMENT, processId, 1, null)), SemanticRevision.Direction.DIRECTED, source("ConsumptionLink"), core()));
                appendOccurrence(base, id, SemanticRevision.TargetKind.FACT, "CONSUMPTION_LINK", payload, contexts, occurrences, layouts);
            } else {
                String capabilityId = required(requiredMap(payload, "capability_ref"), "capability_id");
                if (StructuralLinkCatalog.find(capabilityId).isPresent()) {
                    createStructuralFact(projectId, modelId, base, payload, facts, contexts, occurrences, layouts);
                } else {
                    createProceduralFact(projectId, modelId, base, payload, facts, contexts, occurrences, layouts);
                }
            }
        } else if ("CREATE_STATE".equals(type)) {
            createStateConstruct(base, payload, elements, features, states, contexts, occurrences, layouts, presentations);
        } else if ("UPDATE_STATE".equals(type)) {
            updateStateConstruct(payload, states);
        } else if ("UPDATE_FACT".equals(type)) {
            if (!payload.containsKey("expected_capability_ref")) throw profileForbidden();
            String factId = required(payload, "fact_id");
            SemanticRevision.Fact current = facts.stream().filter(fact -> fact.id().equals(factId)).findFirst().orElseThrow(() -> domain("Fact 不存在"));
            if (StructuralLinkCatalog.find(current.capability().capabilityId()).isPresent()) {
                updateStructuralFact(projectId, modelId, base, payload, facts);
            } else {
                updateProceduralFact(projectId, modelId, base, payload, facts);
            }
        } else if ("UPDATE_PROPERTY".equals(type)) {
            updateName(projectId, modelId, base, payload, elements, features);
        } else if ("UPDATE_LAYOUT".equals(type)) {
            updateOccurrenceLayout(base, payload, elements, features, occurrences, layouts);
        } else if ("DELETE_CONSTRUCT".equals(type)) {
            applyDeleteConstruct(projectId, modelId, base, payload, elements, features, states, facts, contexts, occurrences, layouts, presentations);
        } else if ("STATE_EXPLICIT".equals(type) || "STATE_SUPPRESS".equals(type) || "UNFOLD".equals(type) || "FOLD".equals(type)) {
            updateStatePresentation(base, type, payload, states, contexts, occurrences, layouts, presentations);
        } else throw profileForbidden();
        return new SemanticRevision(revisionId, base.modelId(), base.revisionSequence() + 1, base.profileBinding(), base.rootContextId(), elements, features, states, facts, contexts, occurrences, layouts, presentations, base.refinementEdges());
    }

    private void updateName(String projectId, String modelId, SemanticRevision base, Map<String, Object> payload,
                            List<SemanticRevision.Element> elements, List<SemanticRevision.Feature> features) {
        if (!payload.keySet().equals(java.util.Set.of("target_ref", "property_name", "value", "capability_query_id", "selected_option_id"))) {
            throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "UPDATE_PROPERTY payload 字段不合法");
        }
        Map<String, Object> targetRef = requiredMap(payload, "target_ref");
        String targetKind = required(targetRef, "target_kind");
        if (!targetRef.keySet().equals(java.util.Set.of("target_kind", "target_id"))
                || (!"ELEMENT".equals(targetKind) && !"FEATURE".equals(targetKind))) {
            throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "UPDATE_PROPERTY target_ref 不合法");
        }
        if (!"name".equals(required(payload, "property_name"))) {
            throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "UPDATE_PROPERTY 只允许修改 name");
        }
        String targetId = required(targetRef, "target_id");
        String queryId = capabilityQueryId(projectId, modelId, base.revisionId(), targetId, "UPDATE_PROPERTY", List.of());
        if (!queryId.equals(required(payload, "capability_query_id")) || !propertyOptionId(queryId).equals(required(payload, "selected_option_id"))) {
            throw domain("名称编辑候选项已过期或不匹配");
        }
        if ("ELEMENT".equals(targetKind)) {
            SemanticRevision.Element current = elements.stream().filter(element -> element.id().equals(targetId)).findFirst()
                    .orElseThrow(() -> domain("Element 不存在"));
            if (current.coreKind() != SemanticRevision.CoreKind.OBJECT && current.coreKind() != SemanticRevision.CoreKind.PROCESS) {
                throw domain("仅 Object/Process 支持 Element 名称编辑");
            }
            renameElement(elements, current, payload.get("value"), true);
        } else {
            SemanticRevision.Feature current = features.stream().filter(feature -> feature.id().equals(targetId)).findFirst()
                    .orElseThrow(() -> domain("Feature 不存在"));
            renameFeature(features, current, payload.get("value"), true);
        }
    }

    // 只处理已由草稿服务授权的节点命令；不产生新的 Revision 身份。
    SemanticRevision editDraftElement(SemanticRevision base, String type, Map<String, Object> payload) {
        var elements = new ArrayList<>(base.elements()); var contexts = new ArrayList<>(base.contexts());
        var occurrences = new ArrayList<>(base.occurrences()); var layouts = new ArrayList<>(base.layouts());
        var features = new ArrayList<>(base.features()); var states = new ArrayList<>(base.states());
        var presentations = new ArrayList<>(base.statePresentations());
        switch (type) {
            case "CREATE_ELEMENT" -> createElement(base, payload, elements, contexts, occurrences, layouts);
            case "UPDATE_PROPERTY" -> {
                Map<String, Object> targetRef = requiredMap(payload, "target_ref");
                String target = required(targetRef, "target_id");
                if ("ELEMENT".equals(required(targetRef, "target_kind"))) {
                    var element = elements.stream().filter(item -> item.id().equals(target)).findFirst().orElseThrow(() -> domain("Element 不存在"));
                    renameElement(elements, element, payload.get("value"), false);
                } else {
                    var feature = features.stream().filter(item -> item.id().equals(target)).findFirst().orElseThrow(() -> domain("Feature 不存在"));
                    renameFeature(features, feature, payload.get("value"), false);
                }
            }
            case "UPDATE_LAYOUT" -> updateOccurrenceLayout(base, payload, elements, base.features(), occurrences, layouts);
            case "UPDATE_LAYOUT_BATCH" -> SemanticLayoutEditor.updateBatch(base, payload, layouts);
            case "CREATE_FEATURE" -> createFeatureConstruct(base, payload, elements, features, contexts, occurrences, layouts);
            case "CREATE_STATE" -> createStateConstruct(base, payload, elements, features, states, contexts, occurrences, layouts, presentations);
            case "UPDATE_STATE" -> updateStateConstruct(payload, states);
            case "STATE_EXPLICIT", "STATE_SUPPRESS", "UNFOLD", "FOLD" -> updateStatePresentation(base, type, payload, states, contexts, occurrences, layouts, presentations);
            default -> throw profileForbidden();
        }
        return new SemanticRevision(base.revisionId(), base.modelId(), base.revisionSequence(), base.profileBinding(), base.rootContextId(),
                elements, features, states, base.facts(), contexts, occurrences, layouts, presentations, base.refinementEdges());
    }

    SemanticRevision editDraftContext(SemanticRevision base, Map<String, Object> payload) {
        String parentId = required(payload, "context_id");
        String refineeId = required(payload, "refinee_element_id");
        String name = elementName(payload.get("name"));
        var element = base.elements().stream().filter(item -> item.id().equals(refineeId)).findFirst()
                .orElseThrow(() -> domain("细化元素不存在"));
        if (element.coreKind() != SemanticRevision.CoreKind.OBJECT && element.coreKind() != SemanticRevision.CoreKind.PROCESS
                || base.occurrences().stream().noneMatch(item -> item.contextId().equals(parentId)
                    && item.targetKind() == SemanticRevision.TargetKind.ELEMENT && item.targetId().equals(refineeId)
                    && item.ownership() == SemanticRevision.OccurrenceOwnership.OWNED)
                || base.refinementEdges().stream().anyMatch(item -> item.parentContextId().equals(parentId)
                    && item.refineeElementId().equals(refineeId))) throw domain("当前图中的元素不可细化");
        var contexts = new ArrayList<>(base.contexts());
        var edges = new ArrayList<>(base.refinementEdges());
        String childId = newId("context.refinement");
        var kind = element.coreKind() == SemanticRevision.CoreKind.PROCESS
                ? SemanticRevision.ContextKind.PROCESS_REFINEMENT : SemanticRevision.ContextKind.OBJECT_REFINEMENT;
        contexts.add(new SemanticRevision.Context(childId, kind, capability("CAP-CONTEXT-001"),
                qualifiedName(name), List.of(), source(kind.name())));
        edges.add(new SemanticRevision.RefinementEdge(newId("refinement"), parentId, childId, refineeId, element.coreKind()));
        return new SemanticRevision(base.revisionId(), base.modelId(), base.revisionSequence(), base.profileBinding(),
                base.rootContextId(), base.elements(), base.features(), base.states(), base.facts(), contexts,
                base.occurrences(), base.layouts(), base.statePresentations(), edges);
    }

    boolean draftLayoutAllowed(SemanticRevision base, String occurrenceId) {
        try {
            var occurrence = base.occurrences().stream().filter(item -> item.id().equals(occurrenceId)).findFirst().orElseThrow(() -> domain("Occurrence 不存在"));
            var layout = occurrenceLayout(occurrence, base.layouts());
            updateOccurrenceLayout(base, Map.of("occurrence_id", occurrenceId, "layout", Map.of("x", layout.x(), "y", layout.y())),
                    base.elements(), base.features(), base.occurrences(), new ArrayList<>(base.layouts()));
            return true;
        } catch (ApiException exception) { return false; }
    }

    List<ApiEdtContract.CommandCapabilityOption> draftFactOptions(String query, SemanticRevision base, String intent, String selection, List<String> endpoints) {
        if (intent.equals("CREATE_FACT")) return factOptions(query, base, endpoints);
        if (intent.equals("UPDATE_FACT")) {
            var fact = base.facts().stream().filter(item -> item.id().equals(selection)).findFirst().orElse(null);
            return proceduralFactUpdateOptions(query, base, fact, endpoints.isEmpty() && fact != null ? fact.endpoints().stream().map(SemanticRevision.Endpoint::targetId).toList() : endpoints);
        }
        var occurrence = base.occurrences().stream().filter(item -> item.id().equals(selection)).findFirst().orElse(null);
        return deleteOptions(query, base, occurrence);
    }

    SemanticRevision editDraftFact(SemanticRevision base, String type, Map<String, Object> payload) {
        var elements = new ArrayList<>(base.elements()); var features = new ArrayList<>(base.features()); var states = new ArrayList<>(base.states());
        var facts = new ArrayList<>(base.facts()); var contexts = new ArrayList<>(base.contexts()); var occurrences = new ArrayList<>(base.occurrences());
        var layouts = new ArrayList<>(base.layouts()); var presentations = new ArrayList<>(base.statePresentations());
        if (type.equals("CREATE_FACT")) {
            if (StructuralLinkCatalog.find(required(requiredMap(payload, "capability_ref"), "capability_id")).isPresent()) SemanticFactEditor.createStructuralFact(base, payload, facts, contexts, occurrences, layouts);
            else SemanticFactEditor.createProceduralFact(base, payload, facts, contexts, occurrences, layouts);
        } else if (type.equals("UPDATE_FACT")) {
            var fact = facts.stream().filter(item -> item.id().equals(required(payload, "fact_id"))).findFirst().orElseThrow(() -> domain("Fact 不存在"));
            if (StructuralLinkCatalog.find(fact.capability().capabilityId()).isPresent()) SemanticFactEditor.updateStructuralFact(base, payload, facts);
            else SemanticFactEditor.updateProceduralFact(base, payload, facts);
        } else if (type.equals("DELETE_CONSTRUCT")) {
            var occurrence = occurrences.stream().filter(item -> item.id().equals(required(payload, "selection_id"))).findFirst().orElseThrow(() -> domain("Occurrence 不存在"));
            String mode = required(payload, "delete_mode"); var plan = deletePlan(base, occurrence, mode);
            if (!remainsWithinContext(base, occurrence, plan)) throw domain("CONTEXT_NOT_ALLOWED");
            if (mode.equals("DELETE_TARGET") && plan.items().stream().anyMatch(item -> item.effect().equals("CASCADE"))) throw domain("DELETE_DEPENDENCY_EXISTS");
            applyDeletePlan(plan, mode, elements, features, states, facts, contexts, occurrences, layouts, presentations);
        } else throw profileForbidden();
        return new SemanticRevision(base.revisionId(), base.modelId(), base.revisionSequence(), base.profileBinding(), base.rootContextId(), elements, features, states, facts, contexts, occurrences, layouts, presentations, base.refinementEdges());
    }

    private void createProceduralFact(
            String projectId,
            String modelId,
            SemanticRevision base,
            Map<String, Object> payload,
            List<SemanticRevision.Fact> facts,
            List<SemanticRevision.Context> contexts,
            List<SemanticRevision.Occurrence> occurrences,
            List<SemanticRevision.Layout> layouts) {
        SemanticFactEditor.createProceduralFact(base, payload, facts, contexts, occurrences, layouts);
        String capabilityId = required(requiredMap(payload, "capability_ref"), "capability_id");
        List<String> ids = objectList(payload.get("normalized_endpoints"), "normalized_endpoints").stream().map(item -> required(requiredMap(item, "target_ref"), "target_id")).toList();
        validateProceduralFactOption(projectId, modelId, base, payload, "CREATE_FACT", null, capabilityId, ids);
    }

    private void createStructuralFact(
            String projectId,
            String modelId,
            SemanticRevision base,
            Map<String, Object> payload,
            List<SemanticRevision.Fact> facts,
            List<SemanticRevision.Context> contexts,
            List<SemanticRevision.Occurrence> occurrences,
            List<SemanticRevision.Layout> layouts) {
        SemanticFactEditor.createStructuralFact(base, payload, facts, contexts, occurrences, layouts);
        String capabilityId = required(requiredMap(payload, "capability_ref"), "capability_id");
        List<String> ids = objectList(payload.get("normalized_endpoints"), "normalized_endpoints").stream().map(item -> required(requiredMap(item, "target_ref"), "target_id")).toList();
        validateStructuralFactOption(projectId, modelId, base, payload, "CREATE_FACT", null, capabilityId, ids);
    }

    private void updateProceduralFact(String projectId, String modelId, SemanticRevision base, Map<String, Object> payload, List<SemanticRevision.Fact> facts) {
        authorizeLegacyFactUpdate(projectId, modelId, base, payload, false);
        SemanticFactEditor.updateProceduralFact(base, payload, facts);
    }

    private void updateStructuralFact(String projectId, String modelId, SemanticRevision base, Map<String, Object> payload, List<SemanticRevision.Fact> facts) {
        authorizeLegacyFactUpdate(projectId, modelId, base, payload, true);
        SemanticFactEditor.updateStructuralFact(base, payload, facts);
    }

    // 旧入口保留 Revision 授权；纯领域函数供已完成 DraftToken 授权的服务复用。
    private void authorizeLegacyFactUpdate(String project, String model, SemanticRevision base, Map<String, Object> payload, boolean structural) {
        String id = required(payload, "fact_id"); var fact = base.facts().stream().filter(item -> item.id().equals(id)).findFirst().orElseThrow(() -> domain("Fact 不存在"));
        var replacement = requiredMap(payload, "replacement");
        List<String> ids = replacement.containsKey("normalized_endpoints") ? objectList(replacement.get("normalized_endpoints"), "normalized_endpoints").stream()
                .map(item -> required(requiredMap(item, "target_ref"), "target_id")).toList() : fact.endpoints().stream().map(SemanticRevision.Endpoint::targetId).toList();
        if (structural) validateStructuralFactOption(project, model, base, payload, "UPDATE_FACT", id, fact.capability().capabilityId(), ids);
        else if (replacement.containsKey("modifiers") && objectList(replacement.get("modifiers"), "modifiers").isEmpty() && hasValidControlPair(fact.modifiers())) {
            String query = capabilityQueryId(project, model, base.revisionId(), id, "UPDATE_FACT", ids);
            if (!removeControlOptionId(query, id).equals(required(payload, "selected_option_id"))) throw domain("Control 移除候选项已过期或不匹配");
        } else if (replacement.containsKey("modifiers") && containsControlModifier(objectList(replacement.get("modifiers"), "modifiers")))
            validateControlFactOption(project, model, base, payload, id, fact.capability().capabilityId(), ids, controlDescriptor(replacement));
        else validateProceduralFactOption(project, model, base, payload, "UPDATE_FACT", id, fact.capability().capabilityId(), ids);
    }

    private void validateProceduralFactOption(String projectId, String modelId, SemanticRevision base, Map<String, Object> payload,
                                              String intent, String selectionId, String capabilityId, List<String> endpointIds) {
        String queryId = capabilityQueryId(projectId, modelId, base.revisionId(), selectionId, intent, endpointIds);
        if (!queryId.equals(required(payload, "capability_query_id"))
                || !proceduralFactOptionId(queryId, capabilityId).equals(required(payload, "selected_option_id"))) {
            throw domain("过程关系候选项已过期或不匹配");
        }
    }

    private void validateStructuralFactOption(String projectId, String modelId, SemanticRevision base, Map<String, Object> payload,
                                              String intent, String selectionId, String capabilityId, List<String> endpointIds) {
        String queryId = capabilityQueryId(projectId, modelId, base.revisionId(), selectionId, intent, endpointIds);
        if (!queryId.equals(required(payload, "capability_query_id"))
                || !structuralFactOptionId(queryId, capabilityId).equals(required(payload, "selected_option_id"))) {
            throw domain("结构关系候选项已过期或不匹配");
        }
    }

    private void validateFeatureCreateOption(String projectId, String modelId, SemanticRevision base, Map<String, Object> payload,
                                             String ownerId, String capabilityId) {
        String queryId = capabilityQueryId(projectId, modelId, base.revisionId(), ownerId, "CREATE_FEATURE", List.of());
        String kind = required(payload, "feature_kind");
        String optionId = "option.feature." + kind.toLowerCase() + "." + digest(queryId).substring(0, 16);
        if (!queryId.equals(required(payload, "capability_query_id")) || !optionId.equals(required(payload, "selected_option_id"))) {
            throw domain("Feature 候选项已过期或不匹配");
        }
        if (!("CAP-FEAT-ATTRIBUTE-001".equals(capabilityId) || "CAP-FEAT-OPERATION-001".equals(capabilityId))) throw profileForbidden();
    }

    private void validateControlFactOption(String projectId, String modelId, SemanticRevision base, Map<String, Object> payload,
                                           String factId, String baseCapabilityId, List<String> endpointIds, ControlLinkCatalog.Descriptor control) {
        if (!control.baseCapabilityIds().contains(baseCapabilityId)) throw modifierCombinationInvalid("Control Capability 与基础 Fact 不匹配");
        String queryId = capabilityQueryId(projectId, modelId, base.revisionId(), factId, "UPDATE_FACT", endpointIds);
        if (!queryId.equals(required(payload, "capability_query_id"))
                || !controlFactOptionId(queryId, control.capabilityId()).equals(required(payload, "selected_option_id"))) {
            throw domain("Control 候选项已过期或不匹配");
        }
    }

    private void applyDeleteConstruct(String projectId, String modelId, SemanticRevision base, Map<String, Object> payload,
                                      List<SemanticRevision.Element> elements, List<SemanticRevision.Feature> features, List<SemanticRevision.State> states,
                                      List<SemanticRevision.Fact> facts, List<SemanticRevision.Context> contexts, List<SemanticRevision.Occurrence> occurrences,
                                      List<SemanticRevision.Layout> layouts, List<SemanticRevision.StatePresentation> presentations) {
        if (!payload.keySet().equals(Set.of("selection_id", "construct_kind", "construct_id", "delete_mode", "impact_token"))) {
            throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "DELETE_CONSTRUCT payload 字段不合法");
        }
        String selectionId = required(payload, "selection_id");
        String mode = required(payload, "delete_mode");
        SemanticRevision.Occurrence occurrence = base.occurrences().stream().filter(item -> item.id().equals(selectionId)).findFirst()
                .orElseThrow(() -> new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "删除选择必须是当前 Projection occurrence"));
        String queryId = capabilityQueryId(projectId, modelId, base.revisionId(), selectionId, "DELETE_CONSTRUCT", List.of());
        DeletePlan plan = deletePlan(base, occurrence, mode);
        if (!remainsWithinContext(base, occurrence, plan)) throw domain("CONTEXT_NOT_ALLOWED");
        if (!plan.targetKind().equals(required(payload, "construct_kind")) || !plan.targetId().equals(required(payload, "construct_id"))
                || !deleteToken(base, queryId, selectionId, mode, plan).equals(required(payload, "impact_token"))) {
            throw new ApiException(ApiErrorCode.REVISION_CONFLICT, 409, false, "IMPACT_TOKEN_STALE");
        }
        if ("DELETE_TARGET".equals(mode) && plan.items().stream().anyMatch(item -> "CASCADE".equals(item.effect()))) {
            throw domain("DELETE_DEPENDENCY_EXISTS");
        }
        if (!"REMOVE_OCCURRENCE".equals(mode) && !"DELETE_TARGET".equals(mode) && !"CASCADE".equals(mode)) {
            throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "delete_mode 不合法");
        }
        applyDeletePlan(plan, mode, elements, features, states, facts, contexts, occurrences, layouts, presentations);
    }

}
