package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionJsonWriter;
import org.opm.localruntime.storage.DraftJsonDelta;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 仅回写本次 owned construct 变化，避免领域序列化覆盖原始可选字段和几何。 */
final class DraftOwnedConstructEdits {
    private DraftOwnedConstructEdits() { }

    static List<String> apply(ObjectNode document, SemanticRevision before, SemanticRevision after, String type, JsonNode payload) {
        var serialized = (ObjectNode) DraftJsonDelta.read(new SemanticRevisionJsonWriter().write(after));
        var affected = new ArrayList<String>();
        if (type.equals("UPDATE_STATE")) {
            String id = payload.get("state_id").asText(); var state = find(document.get("states"), "state_id", id);
            var changes = payload.get("changes");
            if (changes.has("name_or_value")) ((ObjectNode) state.get("name")).set("local_name", changes.get("name_or_value"));
            if (changes.has("state_roles") && !values(state.path("state_roles")).equals(values(changes.get("state_roles"))))
                state.set("state_roles", changes.get("state_roles"));
            affected.add(id); return affected;
        }
        if (type.equals("CREATE_FEATURE") || type.equals("CREATE_STATE")) {
            String collection = type.equals("CREATE_FEATURE") ? "features" : "states";
            syncIdentities(document, serialized, collection, type.equals("CREATE_FEATURE") ? "feature_id" : "state_id", affected);
            String ownerId = type.equals("CREATE_FEATURE") ? payload.get("owner_element_id").asText() : payload.at("/owner_ref/target_id").asText();
            if (type.equals("CREATE_FEATURE") || payload.at("/owner_ref/target_kind").asText().equals("ELEMENT")) {
                String field = type.equals("CREATE_FEATURE") ? "feature_ids" : "state_ids";
                find(document.get("elements"), "element_id", ownerId).set(field, find(serialized.get("elements"), "element_id", ownerId).get(field));
            }
            affected.add(ownerId);
        } else affected.add(payload.get("state_id").asText());
        syncIdentities(document, serialized, "occurrences", "occurrence_id", affected);
        syncIdentities(document, serialized, "layouts", "layout_id", affected);
        syncLayoutGeometry(document, before, after, affected);
        String contextId = payload.hasNonNull("context_id") ? payload.get("context_id").asText() : before.rootContextId();
        var context = find(document.get("contexts"), "context_id", contextId);
        JsonNode occurrenceIds = find(serialized.get("contexts"), "context_id", contextId).get("occurrence_ids");
        if (!context.get("occurrence_ids").equals(occurrenceIds)) context.set("occurrence_ids", occurrenceIds);
        if (!type.equals("CREATE_FEATURE")) {
            String stateId = type.equals("CREATE_STATE") ? after.states().getLast().id() : payload.get("state_id").asText();
            JsonNode next = presentation(serialized.path("state_presentations"), contextId, stateId);
            ObjectNode current = presentation(document.path("state_presentations"), contextId, stateId);
            if (current != null) {
                current.set("explicitness", next.get("explicitness")); current.set("fold_state", next.get("fold_state"));
            } else if (type.equals("CREATE_STATE") || !next.path("explicitness").asText().equals("EXPLICIT") || !next.path("fold_state").asText().equals("UNFOLDED")) {
                document.withArray("state_presentations").add(next.deepCopy());
            }
        }
        return affected;
    }

    /** 只回写发生变化的几何字段，保留原始文档中的其他数字类型和扩展字段。 */
    static void syncLayoutGeometry(ObjectNode document, SemanticRevision before, SemanticRevision after, List<String> affected) {
        for (var next : after.layouts()) {
            var previous = before.layouts().stream().filter(item -> item.id().equals(next.id())).findFirst().orElse(null);
            if (previous == null) continue;
            var raw = find(document.get("layouts"), "layout_id", next.id());
            if (Double.compare(previous.x(), next.x()) != 0) raw.put("x", next.x());
            if (Double.compare(previous.y(), next.y()) != 0) raw.put("y", next.y());
            if (Double.compare(previous.width(), next.width()) != 0) raw.put("width", next.width());
            if (Double.compare(previous.height(), next.height()) != 0) raw.put("height", next.height());
            if (!previous.equals(next)) after.occurrences().stream().filter(item -> item.layoutId().equals(next.id())).forEach(item -> {
                if (!affected.contains(item.id())) affected.add(item.id());
            });
        }
    }

    private static void syncIdentities(ObjectNode target, ObjectNode source, String collection, String key, List<String> affected) {
        var existing = (ArrayNode) target.get(collection); JsonNode next = source.get(collection);
        Set<String> nextIds = new HashSet<>(); for (var item : next) nextIds.add(item.get(key).asText());
        for (int i = existing.size() - 1; i >= 0; i--) if (!nextIds.contains(existing.get(i).get(key).asText())) {
            affected.add(existing.get(i).get(key).asText()); existing.remove(i);
        }
        Set<String> existingIds = new HashSet<>(); for (var item : existing) existingIds.add(item.get(key).asText());
        for (var item : next) if (!existingIds.contains(item.get(key).asText())) {
            existing.add(item.deepCopy()); affected.add(item.get(key).asText());
        }
    }

    private static Set<String> values(JsonNode array) {
        var result = new HashSet<String>(); for (var item : array) result.add(item.asText()); return result;
    }
    private static ObjectNode find(JsonNode array, String key, String id) {
        for (var item : array) if (item.path(key).asText().equals(id)) return (ObjectNode) item;
        throw new IllegalStateException("已验证的草稿缺少目标：" + id);
    }
    private static ObjectNode presentation(JsonNode array, String context, String state) {
        for (var item : array) if (item.path("context_id").asText().equals(context) && item.path("state_id").asText().equals(state)) return (ObjectNode) item;
        return null;
    }
}
