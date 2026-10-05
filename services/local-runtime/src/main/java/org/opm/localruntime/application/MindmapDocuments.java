package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import org.opm.localruntime.api.DraftWorkspaceSchema;
import java.util.*;

/** 树形组织、实体引用和状态归属各自校验，不从父级推断语义。 */
public final class MindmapDocuments {
    private MindmapDocuments() { }
    public static void validate(JsonNode document) {
        DraftWorkspaceSchema.validate(document, "MindmapDocument");
        Map<String, JsonNode> nodes = new LinkedHashMap<>();
        for (var node : document.get("nodes")) require(nodes.put(node.get("id").asText(), node) == null);
        String root = document.get("root_id").asText(); require(nodes.containsKey(root));
        require(nodes.get(root).get("parent_id").isNull() && nodes.get(root).get("kind").asText().equals("TOPIC"));
        for (var node : nodes.values()) {
            String id = node.get("id").asText();
            if (!id.equals(root)) require(!node.get("parent_id").isNull() && nodes.containsKey(node.get("parent_id").asText()));
            Set<String> visited = new HashSet<>(); String current = id;
            while (current != null) { require(visited.add(current)); var parent = nodes.get(current).get("parent_id"); current = parent.isNull() ? null : parent.asText(); }
            for (String field : List.of("owner_id", "entity_ref")) if (!node.get(field).isNull()) require(nodes.containsKey(node.get(field).asText()) && !node.get(field).asText().equals(id));
            if (!node.get("owner_id").isNull() && node.get("kind").asText().equals("STATE")) require(nodes.get(node.get("owner_id").asText()).get("kind").asText().equals("OBJECT"));
            visited.clear(); current = id;
            while (current != null) { require(visited.add(current)); var next = nodes.get(current).get("entity_ref");
                if (!next.isNull()) require(nodes.get(next.asText()).get("kind").equals(node.get("kind")));
                current = next.isNull() ? null : next.asText(); }
        }
        Set<String> relationIds = new HashSet<>();
        for (var relation : document.get("relations")) {
            require(!nodes.containsKey(relation.get("id").asText()) && relationIds.add(relation.get("id").asText()));
            for (var endpoint : relation.get("endpoints")) require(nodes.containsKey(endpoint.asText()));
        }
    }
    public static void require(boolean condition) { if (!condition) throw new DraftWorkspaceService.Failure("INPUT_INVALID", null); }
}
