package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.api.ApiErrorCode;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.semantic.DraftSemanticView;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionValidator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 以完整文档构造 OPD 与语义依赖闭包，保留持久字段，不用画布投影重写语义。 */
final class OpdJsonPackage {
    private OpdJsonPackage() { }
    static ObjectNode slice(ObjectNode source, String selected) {
        var revision = validate(source);
        if (revision.contexts().stream().noneMatch(item -> item.id().equals(selected))) invalid("OPD 不存在");
        Set<String> contexts = new HashSet<>(Set.of(selected)); contexts.add(revision.rootContextId());
        Set<String> descendants = new HashSet<>(Set.of(selected));
        boolean changed;
        do {
            changed = false;
            for (var edge : revision.refinementEdges()) if (descendants.contains(edge.parentContextId())) changed |= descendants.add(edge.childContextId());
        } while (changed);
        contexts.addAll(descendants);
        Set<String> targets = new HashSet<>();
        do {
            int count = contexts.size() + targets.size();
            // 两端及全部依赖进入闭包；允许回环，集合增长到固定点即终止。
            for (var context : revision.contexts()) for (var link : context.architectureLinks())
                if (contexts.contains(context.id()) || contexts.contains(link.targetContextId())) {
                    contexts.add(context.id()); contexts.add(link.targetContextId());
                }
            for (var edge : revision.refinementEdges()) if (contexts.contains(edge.childContextId())) { contexts.add(edge.parentContextId()); targets.add(edge.refineeElementId()); }
            for (var occurrence : revision.occurrences()) if (contexts.contains(occurrence.contextId())) targets.add(occurrence.targetId());
            for (var element : revision.elements()) if (targets.contains(element.id())) { targets.addAll(element.featureIds()); targets.addAll(element.stateIds()); }
            for (var feature : revision.features()) if (targets.contains(feature.id())) targets.add(feature.ownerElementId());
            for (var state : revision.states()) {
                if (targets.contains(state.id())) targets.add(state.ownerElementId());
                if (targets.contains(state.ownerElementId())) targets.add(state.id());
            }
            for (var fact : revision.facts()) if (targets.contains(fact.id())) {
                for (var endpoint : fact.endpoints()) { targets.add(endpoint.targetId()); if (endpoint.stateQualificationId() != null) targets.add(endpoint.stateQualificationId()); }
                // 被控制关系引用的基础事实可能只在依赖图中出现，保留其一个展示上下文。
                if (revision.occurrences().stream().noneMatch(item -> item.targetId().equals(fact.id()) && contexts.contains(item.contextId())))
                    revision.occurrences().stream().filter(item -> item.targetId().equals(fact.id())).findFirst().ifPresent(item -> contexts.add(item.contextId()));
            }
            changed = count != contexts.size() + targets.size();
        } while (changed);
        ObjectNode document = source.deepCopy();
        keep(document, "contexts", "context_id", contexts);
        for (String collection : List.of("elements", "features", "states", "facts"))
            keep(document, collection, switch (collection) { case "elements" -> "element_id"; case "features" -> "feature_id"; case "states" -> "state_id"; default -> "fact_id"; }, targets);
        ArrayNode occurrences = document.putArray("occurrences"); Set<String> layouts = new HashSet<>();
        for (var item : source.required("occurrences")) if (contexts.contains(item.path("context_id").asText())) { occurrences.add(item.deepCopy()); layouts.add(item.path("layout_id").asText()); }
        keep(document, "layouts", "layout_id", layouts);
        ArrayNode presentations = document.putArray("state_presentations");
        for (var item : source.path("state_presentations")) if (contexts.contains(item.path("context_id").asText()) && targets.contains(item.path("state_id").asText())) presentations.add(item.deepCopy());
        if (source.has("refinement_edges")) {
            ArrayNode edges = document.putArray("refinement_edges");
            for (var item : source.path("refinement_edges")) if (contexts.contains(item.path("parent_context_id").asText()) && contexts.contains(item.path("child_context_id").asText())) edges.add(item.deepCopy());
        }
        clearEvidence(document); validate(document); return document;
    }
    static void clearEvidence(ObjectNode document) {
        document.remove(List.of("parent_revision_id", "text_artifact", "text_traces", "validation_summary", "revision_digest"));
    }
    static SemanticRevision validate(ObjectNode document) {
        try {
            if (!Set.of("0.2", "0.3", "0.4", "0.5").contains(document.path("schema_version").asText())) invalid("OPD JSON 只支持语义版本 0.2、0.3、0.4 或 0.5");
            var identity = document.path("model_header").path("identity_namespace");
            if (!identity.isObject() || !identity.path("namespace").isTextual() || identity.path("namespace").asText().isBlank()
                    || !identity.path("local_name").isTextual() || identity.path("local_name").asText().isBlank()) invalid("OPD 模型身份格式无效");
            var revision = DraftSemanticView.read(document);
            if (!document.path("model_header").path("model_id").asText().equals(revision.modelId()) || !new SemanticRevisionValidator().validate(revision).isEmpty()) invalid("OPD 语义引用或布局不完整");
            return revision;
        } catch (ApiException exception) { throw exception; }
        catch (RuntimeException exception) { invalid("OPD 语义数据格式无效"); return null; }
    }
    private static void keep(ObjectNode document, String collection, String field, Set<String> ids) {
        JsonNode source = document.path(collection); ArrayNode target = document.putArray(collection);
        for (var item : source) if (ids.contains(item.path(field).asText())) target.add(item.deepCopy());
    }
    static void invalid(String message) { throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, message); }
}
