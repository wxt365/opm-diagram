package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.*;

/** 仅重组当前图的出现，不创建或删除语义实体；跨边界事实保留父图。 */
final class DraftSubgraphReorganization {
    static List<String> apply(ObjectNode doc, String parent, String child, String ownerOccurrence, String name, List<String> members, boolean abstractBoundary) {
        var occurrences = (ArrayNode) doc.get("occurrences");
        var byId = new HashMap<String, ObjectNode>();
        for (var item : occurrences) byId.put(item.path("occurrence_id").asText(), (ObjectNode) item);
        var owner = byId.get(ownerOccurrence);
        require(owner != null && owner.path("context_id").asText().equals(parent)
                && owner.path("target_kind").asText().equals("ELEMENT") && owner.path("ownership").asText().equals("OWNED"));
        String ownerId = owner.path("target_id").asText();
        require(!abstractBoundary || find(doc.get("elements"), "element_id", ownerId).path("core_kind").asText().equals("PROCESS"));
        for (var edge : doc.path("refinement_edges")) require(!edge.path("parent_context_id").asText().equals(parent)
                || !edge.path("refinee_element_id").asText().equals(ownerId));
        var selected = new LinkedHashSet<String>();
        for (var id : members) {
            var occurrence = byId.get(id);
            require(occurrence != null && occurrence.path("context_id").asText().equals(parent)
                    && occurrence.path("target_kind").asText().equals("ELEMENT") && occurrence.path("ownership").asText().equals("OWNED")
                    && !occurrence.path("target_id").asText().equals(ownerId));
            selected.add(occurrence.path("target_id").asText());
        }
        require(!selected.isEmpty());
        for (var edge : doc.path("refinement_edges")) require(!edge.path("parent_context_id").asText().equals(parent)
                || !selected.contains(edge.path("refinee_element_id").asText()));
        boolean changed;
        do {
            changed = false;
            for (String collection : List.of("features", "states")) for (var item : doc.path(collection)) {
                String ownerRef = item.path("owner_ref").path("target_id").asText(item.path("owner_element_id").asText());
                if (selected.contains(ownerRef)) changed |= selected.add(item.path(collection.equals("features") ? "feature_id" : "state_id").asText());
            }
        } while (changed);
        var internalProcesses = new HashSet<String>();
        for (var item : doc.path("elements")) if (selected.contains(item.path("element_id").asText()) && item.path("core_kind").asText().equals("PROCESS")) internalProcesses.add(item.path("element_id").asText());
        var childBoundaryTargets = new HashSet<String>(); var newBoundaryFacts = new ArrayList<ObjectNode>();
        var internalFacts = new HashSet<String>(); var boundaryTargets = new HashSet<String>();
        var visibleFacts = new HashSet<String>();
        for (var occurrence : occurrences) if (occurrence.path("context_id").asText().equals(parent)
                && occurrence.path("target_kind").asText().equals("FACT")) visibleFacts.add(occurrence.path("target_id").asText());
        var producedInside = new HashSet<String>(); var producedOutside = new HashSet<String>();
        for (var fact : doc.path("facts")) if (visibleFacts.contains(fact.path("fact_id").asText())
                && fact.at("/capability_ref/capability_id").asText().equals("CAP-ISO-PROC-002")) {
            String process = null, output = null;
            for (var endpoint : fact.path("endpoints")) {
                if (endpoint.path("role").asText().equals("RESULT_PROCESS")) process = endpoint.path("target_id").asText();
                if (endpoint.path("role").asText().equals("RESULT_OBJECT")) output = endpoint.path("target_id").asText();
            }
            if (process != null && output != null) (internalProcesses.contains(process) ? producedInside : producedOutside).add(output);
        }
        producedInside.removeAll(producedOutside);
        for (var fact : doc.path("facts")) if (visibleFacts.contains(fact.path("fact_id").asText())) {
            var endpoints = new HashSet<String>();
            for (var endpoint : fact.path("endpoints")) {
                endpoints.add(endpoint.path("target_id").asText());
                if (!endpoint.path("state_qualification_id").isNull() && endpoint.has("state_qualification_id")) endpoints.add(endpoint.path("state_qualification_id").asText());
            }
            if (!endpoints.isEmpty() && selected.containsAll(endpoints)) internalFacts.add(fact.path("fact_id").asText());
            else if (abstractBoundary && endpoints.stream().anyMatch(internalProcesses::contains)) {
                String capability = fact.at("/capability_ref/capability_id").asText();
                require(List.of("CAP-ISO-PROC-001", "CAP-ISO-PROC-002", "CAP-ISO-PROC-004", "CAP-ISO-PROC-005", "CAP-ISO-PROC-013").contains(capability)
                        && fact.path("endpoints").size() == 2 && fact.path("modifiers").isEmpty() && fact.path("labels").isEmpty());
                internalFacts.add(fact.path("fact_id").asText()); childBoundaryTargets.addAll(endpoints);
                // 内部Result的后续使用不是父过程启动条件；原始事实仍完整保留子图。
                if (List.of("CAP-ISO-PROC-001", "CAP-ISO-PROC-004", "CAP-ISO-PROC-005").contains(capability)
                        && endpoints.stream().anyMatch(producedInside::contains)) {
                    for (String endpoint : endpoints) if (selected.contains(endpoint) && !internalProcesses.contains(endpoint)) boundaryTargets.add(endpoint);
                    continue;
                }
                var derived = (ObjectNode) fact.deepCopy();
                for (var endpoint : derived.path("endpoints")) if (internalProcesses.contains(endpoint.path("target_id").asText())) ((ObjectNode) endpoint).put("target_id", ownerId);
                if (derived.path("endpoints").get(0).path("target_id").equals(derived.path("endpoints").get(1).path("target_id"))) continue;
                String suffix = UUID.nameUUIDFromBytes((child + ":boundary:" + fact.path("fact_id").asText()).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString();
                derived.put("fact_id", "fact.boundary." + suffix);
                int ordinal = 0; for (var endpoint : derived.path("endpoints")) ((ObjectNode) endpoint).put("endpoint_id", "endpoint.boundary." + suffix + "." + ordinal++);
                ((ObjectNode) derived.get("source")).put("source_kind", "PROCESS_BOUNDARY_ABSTRACTION").put("source_entity_id", fact.path("fact_id").asText());
                newBoundaryFacts.add(derived);
                for (String endpoint : endpoints) if (selected.contains(endpoint) && !internalProcesses.contains(endpoint)) boundaryTargets.add(endpoint);
            } else for (String endpoint : endpoints) if (selected.contains(endpoint)) boundaryTargets.add(endpoint);
        }
        // 不允许不支持的结构/状态边界迫使内部过程留主图却冒称已抽象。
        if (abstractBoundary) require(boundaryTargets.stream().noneMatch(internalProcesses::contains));
        do {
            changed = false;
            for (String collection : List.of("features", "states")) for (var item : doc.path(collection)) {
                String id = item.path(collection.equals("features") ? "feature_id" : "state_id").asText();
                if (childBoundaryTargets.contains(id)) changed |= childBoundaryTargets.add(item.path("owner_element_id").asText());
            }
        } while (changed);
        // 状态/属性在父图继续出现时，其所属对象也必须保留。
        do {
            changed = false;
            for (String collection : List.of("features", "states")) for (var item : doc.path(collection)) {
                String id = item.path(collection.equals("features") ? "feature_id" : "state_id").asText();
                if (boundaryTargets.contains(id)) changed |= boundaryTargets.add(item.path("owner_ref").path("target_id").asText(item.path("owner_element_id").asText()));
            }
        } while (changed);
        var parentContext = find(doc.get("contexts"), "context_id", parent);
        var element = find(doc.get("elements"), "element_id", ownerId);
        var context = parentContext.deepCopy();
        context.put("context_id", child).put("context_kind", element.path("core_kind").asText().equals("PROCESS") ? "PROCESS_REFINEMENT" : "OBJECT_REFINEMENT");
        ((ObjectNode) context.get("name")).put("local_name", name);
        context.remove(List.of("architecture_links", "architecture_level")); context.putArray("occurrence_ids");
        ((ObjectNode) context.get("capability_ref")).put("capability_id", "CAP-CONTEXT-001");
        ((ArrayNode) doc.get("contexts")).add(context);
        if (!doc.has("refinement_edges")) doc.putArray("refinement_edges");
        ((ArrayNode) doc.get("refinement_edges")).addObject().put("refinement_id", "refinement." + child)
                .put("parent_context_id", parent).put("child_context_id", child).put("refinee_element_id", ownerId)
                .put("refinement_kind", element.path("core_kind").asText());
        if (!List.of("0.4", "0.5", "0.6", "0.7").contains(doc.path("schema_version").asText())) doc.put("schema_version", "0.3");
        var additions = new ArrayList<ObjectNode>(); var layouts = (ArrayNode) doc.get("layouts");
        for (var occurrence : occurrences) if (occurrence.path("context_id").asText().equals(parent)) {
            String target = occurrence.path("target_id").asText();
            if (!selected.contains(target) && !internalFacts.contains(target) && !childBoundaryTargets.contains(target)) continue;
            var copy = occurrence.deepCopy(); String suffix = UUID.nameUUIDFromBytes((child + ":" + occurrence.path("occurrence_id").asText()).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString();
            String id = "occurrence." + suffix, layoutId = "layout." + suffix;
            ((ObjectNode) copy).put("context_id", child).put("occurrence_id", id).put("layout_id", layoutId);
            additions.add((ObjectNode) copy);
            var layout = find(layouts, "layout_id", occurrence.path("layout_id").asText()).deepCopy(); layout.put("layout_id", layoutId); layouts.add(layout);
        }
        for (var copy : additions) { occurrences.add(copy); ((ArrayNode) context.get("occurrence_ids")).add(copy.path("occurrence_id")); }
        for (var fact : newBoundaryFacts) {
            ((ArrayNode) doc.get("facts")).add(fact);
            String suffix = fact.path("fact_id").asText().substring("fact.boundary.".length());
            String occurrenceId = "occurrence.boundary." + suffix, layoutId = "layout.boundary." + suffix;
            var original = byId.values().stream().filter(item -> item.path("target_id").asText().equals(fact.at("/source/source_entity_id").asText()) && item.path("context_id").asText().equals(parent)).findFirst().orElseThrow();
            var copy = original.deepCopy(); copy.put("occurrence_id", occurrenceId).put("layout_id", layoutId).put("target_id", fact.path("fact_id").asText()); occurrences.add(copy);
            var layout = find(layouts, "layout_id", original.path("layout_id").asText()).deepCopy(); layout.put("layout_id", layoutId); layouts.add(layout);
            ((ArrayNode) parentContext.get("occurrence_ids")).add(occurrenceId);
        }
        var removed = new HashSet<String>(); var removedLayouts = new HashSet<String>();
        for (int i = occurrences.size() - 1; i >= 0; i--) {
            var occurrence = occurrences.get(i); String target = occurrence.path("target_id").asText();
            if (occurrence.path("context_id").asText().equals(parent) && (internalFacts.contains(target) || (selected.contains(target) && !boundaryTargets.contains(target)))) {
                removed.add(occurrence.path("occurrence_id").asText()); removedLayouts.add(occurrence.path("layout_id").asText()); occurrences.remove(i);
            }
        }
        var ids = (ArrayNode) parentContext.get("occurrence_ids"); for (int i = ids.size() - 1; i >= 0; i--) if (removed.contains(ids.get(i).asText())) ids.remove(i);
        for (int i = layouts.size() - 1; i >= 0; i--) if (removedLayouts.contains(layouts.get(i).path("layout_id").asText())) layouts.remove(i);
        if (doc.path("state_presentations") instanceof ArrayNode presentations) {
            var copies = new ArrayList<ObjectNode>();
            for (var item : presentations) if (item.path("context_id").asText().equals(parent) && selected.contains(item.path("state_id").asText())) {
                var copy = (ObjectNode) item.deepCopy(); copy.put("context_id", child); copies.add(copy);
            }
            for (int i = presentations.size() - 1; i >= 0; i--) if (presentations.get(i).path("context_id").asText().equals(parent)
                    && selected.contains(presentations.get(i).path("state_id").asText()) && !boundaryTargets.contains(presentations.get(i).path("state_id").asText())) presentations.remove(i);
            copies.forEach(presentations::add);
        }
        require(new org.opm.localruntime.semantic.SemanticRevisionValidator().validate(DraftWorkspaceService.semantic(doc)).isEmpty());
        var affected = new ArrayList<String>(removed); affected.add(parent); affected.add(child); affected.addAll(selected); affected.addAll(internalFacts); return affected;
    }
    private static ObjectNode find(JsonNode values, String key, String id) {
        for (var item : values) if (item.path(key).asText().equals(id)) return (ObjectNode) item;
        throw new DraftWorkspaceService.Failure("DRAFT_EDIT_REJECTED", "CONTEXT_NOT_ALLOWED");
    }
    private static void require(boolean valid) { if (!valid) throw new DraftWorkspaceService.Failure("DRAFT_EDIT_REJECTED", "CONTEXT_NOT_ALLOWED"); }
}
