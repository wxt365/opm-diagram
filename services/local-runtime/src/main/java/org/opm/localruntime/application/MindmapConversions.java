package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;

/** 来源记录由正式结果反向绑定，禁止将助手自报的身份当作提交事实。 */
final class MindmapConversions {
    private static final ObjectMapper JSON = new ObjectMapper();
    static String bind(JsonNode analysis, JsonNode source, JsonNode projection, Map<String, String> aliases, JsonNode steps) {
        Map<String, JsonNode> originals = new LinkedHashMap<>(), bindings = new LinkedHashMap<>();
        for (var node : analysis.get("nodes")) originals.put(node.get("id").asText(), node);
        for (var relation : analysis.get("relations")) originals.put(relation.get("id").asText(), relation);
        Set<String> excluded = new HashSet<>();
        for (var id : source.get("excluded_ids")) { MindmapDocuments.require(originals.containsKey(id.asText())); MindmapDocuments.require(excluded.add(id.asText())); }
        var result = JSON.createArrayNode(); Set<String> refs = new HashSet<>(), namedTargets = new HashSet<>();
        for (var step : steps) if (!step.path("command_type").asText().equals("UPDATE_LAYOUT")) namedTargets.add(aliases.getOrDefault(step.path("local_id").asText(), step.path("target").asText()));
        for (var binding : source.get("bindings")) {
            String id = binding.get("source_id").asText(), reference = binding.get("target_ref").asText();
            MindmapDocuments.require(originals.containsKey(id) && !excluded.contains(id) && !bindings.containsKey(id)); refs.add(reference);
            String resolved = aliases.getOrDefault(reference, reference); JsonNode target = null;
            for (var item : projection.get("constructs")) if (item.get("occurrence_id").asText().equals(resolved) || item.get("target_id").asText().equals(resolved)) {
                MindmapDocuments.require(target == null); target = item;
            }
            MindmapDocuments.require(target != null); var original = originals.get(id);
            String kind = original.path("kind").asText("FACT");
            MindmapDocuments.require(Set.of("OBJECT", "PROCESS", "STATE", "FACT").contains(kind));
            MindmapDocuments.require(kind.equals("FACT") ? target.get("target_kind").asText().equals("FACT")
                    : kind.equals("STATE") ? target.get("target_kind").asText().equals("STATE") : target.path("construct_role").asText().equals(kind + "_NODE"));
            if (!kind.equals("FACT") && original.get("entity_ref").isNull() && (namedTargets.contains(target.path("occurrence_id").asText()) || namedTargets.contains(target.path("target_id").asText()))) MindmapDocuments.require(original.get("label").equals(target.get("label")));
            bindings.put(id, target);
            result.addObject().put("source_id", id).put("target_id", target.get("target_id").asText()).put("source_json", original.toString())
                    .put("target_kind", kind).put("target_name", target.path("label").asText());
        }
        for (var entry : originals.entrySet()) {
            var item = entry.getValue(); String id = entry.getKey();
            if (excluded.contains(id) || item.path("kind").asText().equals("TOPIC")) continue;
            MindmapDocuments.require(bindings.containsKey(id));
            if (item.path("kind").asText().equals("STATE")) {
                var owner = bindings.get(item.get("owner_id").asText());
                MindmapDocuments.require(owner != null && bindings.get(id).path("owner_id").asText().equals(owner.path("target_id").asText()));
            }
            if (item.has("entity_ref") && !item.get("entity_ref").isNull()) {
                var canonical = bindings.get(item.get("entity_ref").asText());
                MindmapDocuments.require(canonical != null && canonical.get("target_id").equals(bindings.get(id).get("target_id")));
            }
            if (item.has("endpoints")) {
                var target = bindings.get(id); MindmapDocuments.require(item.get("capability_id").asText().equals(target.path("capability_id").asText()));
                MindmapDocuments.require(item.get("endpoints").size() == target.get("endpoints").size());
                for (int i = 0; i < item.get("endpoints").size(); i++) {
                    var endpoint = bindings.get(item.get("endpoints").get(i).asText());
                    var actual = target.get("endpoints").get(i);
                    MindmapDocuments.require(endpoint != null && (endpoint.get("target_id").equals(actual.get("target_id"))
                            || endpoint.get("target_id").equals(actual.get("state_qualification"))));
                }
            }
        }
        for (var step : steps) {
            if (step.get("command_type").asText().startsWith("CREATE")) MindmapDocuments.require(refs.contains(step.get("local_id").asText()));
            else {
                String target = aliases.getOrDefault(step.path("target").asText(), step.path("target").asText());
                MindmapDocuments.require(bindings.values().stream().anyMatch(item -> item.path("target_id").asText().equals(target) || item.path("occurrence_id").asText().equals(target)));
            }
        }
        return result.toString();
    }
}
