package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.api.DraftCapabilityIdentity;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionValidator;
import org.opm.localruntime.semantic.SemanticValidationProblem;
import org.opm.localruntime.text.TextGenerationAssets;
import java.util.Comparator;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;

/** 当前快照的只读派生查询；不访问旧 Revision 或持久化索引。 */
final class DraftWorkspaceQueries {
    private static final ObjectMapper JSON = new ObjectMapper();
    private DraftWorkspaceQueries() { }

    static ObjectNode navigation(SemanticRevision revision, String context) {
        var parentEdges = new HashMap<String, SemanticRevision.RefinementEdge>();
        var children = new HashSet<String>();
        for (var edge : revision.refinementEdges()) {
            parentEdges.put(edge.childContextId(), edge);
            children.add(edge.parentContextId());
        }
        var path = new ArrayList<String>();
        String cursor = context;
        while (cursor != null && !path.contains(cursor)) {
            path.add(cursor);
            var edge = parentEdges.get(cursor);
            cursor = edge == null ? null : edge.parentContextId();
        }
        var result = JSON.createObjectNode(); var currentPath = result.putArray("current_path");
        for (int i = path.size() - 1; i >= 0; i--) currentPath.add(path.get(i));
        var processes = result.putArray("process_tree"); var objects = result.putArray("object_forest"); var views = result.putArray("views");
        revision.contexts().stream().sorted(Comparator.comparing(SemanticRevision.Context::id)).forEach(item -> {
            var group = switch (item.kind()) {
                case SYSTEM_DIAGRAM, PROCESS_REFINEMENT -> processes;
                case OBJECT_REFINEMENT -> objects;
                case MODEL_VIEW, PROFILE_CONTEXT -> views;
            };
            var node = group.addObject().put("context_id", item.id()).put("label", item.name().localName())
                    .put("context_kind", item.kind().name()).put("has_children", children.contains(item.id()));
            var edge = parentEdges.get(item.id());
            if (edge != null) node.put("parent_context_id", edge.parentContextId()).put("refinee_element_id", edge.refineeElementId());
        });
        return result;
    }

    static ObjectNode findings(String project, String model, JsonNode token, SemanticRevision revision) {
        var result = JSON.createObjectNode().put("validation_scope", "MODEL"); var items = result.putArray("items");
        new SemanticRevisionValidator().validate(revision).stream().distinct()
                .sorted(Comparator.comparing((SemanticValidationProblem item) -> item.code().name())
                        .thenComparing(SemanticValidationProblem::locatorId).thenComparing(SemanticValidationProblem::message))
                .forEach(problem -> {
                    String id = DraftCapabilityIdentity.finding(project, model, token, problem.code().name(), problem.locatorId(), problem.message());
                    items.addObject().put("finding_id", id).put("rule_id", "rule.core." + problem.code().name()).put("severity", "BLOCKING")
                            .put("category", problem.code().name()).putNull("context_id").put("entity_id", visibleTarget(revision, problem.locatorId())).put("message", problem.message());
                });
        result.putObject("validation_summary").put("blocking", items.size()).put("warning", 0).put("suggestion", 0).put("coverage_state", "INCOMPLETE");
        return result;
    }

    private static String visibleTarget(SemanticRevision revision, String locator) {
        for (var fact : revision.facts()) if (fact.endpoints().stream().anyMatch(endpoint -> endpoint.id().equals(locator))) return fact.id();
        for (var occurrence : revision.occurrences()) if (occurrence.id().equals(locator) || occurrence.layoutId().equals(locator)) return occurrence.targetId();
        for (var edge : revision.refinementEdges()) if (edge.id().equals(locator)) return edge.childContextId();
        return locator;
    }

    static ObjectNode catalog(LocalApiService domain, SemanticRevision revision, String context, JsonNode selection, TextGenerationAssets assets) {
        String target = null;
        if (!selection.isNull()) {
            String id = selection.asText();
            var occurrence = revision.occurrences().stream().filter(item -> item.contextId().equals(context) && item.id().equals(id)).findFirst().orElse(null);
            target = occurrence == null ? id : occurrence.targetId(); String selectedTarget = target;
            if (occurrence != null && occurrence.targetKind() != SemanticRevision.TargetKind.FACT
                    || revision.facts().stream().noneMatch(item -> item.id().equals(selectedTarget))
                    || revision.occurrences().stream().noneMatch(item -> item.contextId().equals(context)
                        && item.targetKind() == SemanticRevision.TargetKind.FACT && item.targetId().equals(selectedTarget))) {
                throw new DraftWorkspaceService.Failure("NOT_FOUND", null);
            }
        }
        var current = revision.contexts().stream().filter(item -> item.id().equals(context)).findFirst().orElseThrow();
        boolean editable = current.kind() == SemanticRevision.ContextKind.SYSTEM_DIAGRAM
                || (revision.refinementEdges().stream().anyMatch(edge -> edge.childContextId().equals(context))
                    && (current.kind() == SemanticRevision.ContextKind.OBJECT_REFINEMENT
                    || current.kind() == SemanticRevision.ContextKind.PROCESS_REFINEMENT));
        ObjectNode result = JSON.valueToTree(domain.relationCatalogData(revision, context, target,
                editable ? null : "CONTEXT_NOT_ALLOWED"));
        for (var value : result.get("items")) {
            var item = (ObjectNode) value; String capability = item.get("capability_id").asText();
            if (!assets.capabilities().containsKey(capability)) throw new DraftWorkspaceService.Failure("DRAFT_EDIT_REJECTED", "PROFILE_CAPABILITY_DISABLED");
            String symbol = assets.capability(capability).symbolRef();
            if (!assets.symbolCatalog().containsSymbol(symbol)) throw new DraftWorkspaceService.Failure("DRAFT_EDIT_REJECTED", "SYMBOL_ASSET_MISSING");
            item.put("symbol_id", symbol);
            item.putObject("symbol_descriptor").put("id", symbol).put("version", assets.binding().symbolCatalog().version())
                    .put("digest", assets.binding().symbolCatalog().sha256());
        }
        return result;
    }

}
