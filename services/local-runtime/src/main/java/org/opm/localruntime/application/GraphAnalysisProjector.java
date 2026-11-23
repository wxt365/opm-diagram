package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.semantic.SemanticRevision;
import java.util.*;
import static org.opm.localruntime.semantic.SemanticRevision.*;

/** Read-only semantic projection. No storage access, layout mutation or inferred causality. */
final class GraphAnalysisProjector {
    private static final ObjectMapper JSON = new ObjectMapper();
    private record Rule(String label, String direction, List<String> roles) { }
    private record Pair(Endpoint source, Endpoint target) { }

    static ObjectNode project(SemanticRevision revision, JsonNode options) {
        String context = options.path("context_id").asText(), scope = options.path("scope").asText();
        if (revision.contexts().stream().noneMatch(item -> item.id().equals(context))) throw new DraftWorkspaceService.Failure("NOT_FOUND", null);
        boolean model = scope.equals("MODEL"), hidden = model || options.path("include_hidden_states").asBoolean();
        Set<String> contexts = new TreeSet<>(); contexts.add(context);
        if (model) revision.contexts().forEach(item -> contexts.add(item.id()));
        if (scope.equals("CONTEXT_SUBTREE")) {
            boolean changed;
            do { changed = false; for (var edge : revision.refinementEdges())
                if (contexts.contains(edge.parentContextId())) changed |= contexts.add(edge.childContextId());
            } while (changed);
        }
        Map<String, String> names = new HashMap<>(); revision.contexts().forEach(item -> names.put(item.id(), item.name().localName()));
        Set<String> suppressed = new HashSet<>();
        for (var item : revision.statePresentations()) if (item.explicitness() == StateExplicitness.SUPPRESSED)
            suppressed.add(item.contextId() + "/" + item.stateId());
        Map<String, ArrayNode> refs = new HashMap<>(); Set<String> visible = new TreeSet<>();
        Set<String> visibleFacts = new TreeSet<>(); Set<String> hiddenStates = new HashSet<>();
        for (var occurrence : revision.occurrences()) {
            boolean inScope = contexts.contains(occurrence.contextId());
            boolean isHidden = !hidden && suppressed.contains(occurrence.contextId() + "/" + occurrence.targetId());
            if (inScope && isHidden) hiddenStates.add(occurrence.targetId());
            if (inScope && !isHidden) {
                visible.add(occurrence.targetId());
                if (occurrence.targetKind() == TargetKind.FACT) visibleFacts.add(occurrence.targetId());
            }
            if (!isHidden && (inScope || options.path("include_boundary_nodes").asBoolean())) {
                refs.computeIfAbsent(occurrence.targetId(), ignored -> JSON.createArrayNode()).addObject()
                    .put("context_id", occurrence.contextId()).put("context_name", names.getOrDefault(occurrence.contextId(), occurrence.contextId()))
                    .put("occurrence_id", occurrence.id()).put("target_id", occurrence.targetId());
            }
        }
        hiddenStates.removeAll(visible);
        ObjectNode result = JSON.createObjectNode(); var warnings = result.putArray("warnings");
        Map<String, ObjectNode> candidates = new TreeMap<>();
        for (var item : revision.elements()) if (item.coreKind() == CoreKind.OBJECT || item.coreKind() == CoreKind.PROCESS) {
            candidates.put(item.id(), node(item.id(), item.coreKind().name(), item.name().localName(), null, refs));
        }
        for (var state : revision.states()) {
            var owner = candidates.get(state.ownerElementId());
            if (state.ownerTargetKind() == TargetKind.ELEMENT && owner != null && owner.path("kind").asText().equals("OBJECT"))
                candidates.put(state.id(), node(state.id(), "STATE", owner.path("label").asText() + " · " + state.name().localName(), state.ownerElementId(), refs));
            else if (model || visible.contains(state.id())) warn(warnings, "UNSUPPORTED_NODE", state.id(), "属性取值或非对象状态未纳入三类节点。");
        }
        Map<String, ObjectNode> nodes = new TreeMap<>();
        candidates.forEach((id, value) -> { if (model || visible.contains(id)) nodes.put(id, value); });
        var edges = result.putArray("edges"); int factCount = 0;
        var facts = revision.facts().stream().sorted(Comparator.comparing(Fact::id)).toList();
        for (var fact : facts) {
            if (!model && !visibleFacts.contains(fact.id())) continue;
            Rule rule = rule(fact);
            if (rule == null) { warn(warnings, "UNSUPPORTED_RELATION", fact.id(), "暂不支持关系能力：" + fact.capability().capabilityId()); continue; }
            List<Pair> pairs = new ArrayList<>(); boolean valid = true;
            // Each adjacent catalog role connects to the next. Only structural fan tails may repeat.
            for (int i = 0; i < rule.roles().size() - 1; i++) {
                String from = rule.roles().get(i), to = rule.roles().get(i + 1);
                var sources = fact.endpoints().stream().filter(e -> e.role().equals(from)).toList();
                var targets = fact.endpoints().stream().filter(e -> e.role().equals(to)).toList();
                if (sources.size() != 1 || targets.isEmpty() || (rule.roles().size() > 2 && targets.size() != 1)) { valid = false; break; }
                for (var target : targets) pairs.add(new Pair(sources.get(0), target));
            }
            if (!valid || fact.endpoints().stream().anyMatch(e -> !rule.roles().contains(e.role()))) {
                warn(warnings, "UNSUPPORTED_ENDPOINTS", fact.id(), "关系端点不符合能力角色约定。"); continue;
            }
            Set<String> required = new TreeSet<>();
            for (var pair : pairs) { required.add(target(pair.source())); required.add(target(pair.target())); }
            if (required.stream().anyMatch(id -> !candidates.containsKey(id))) {
                warn(warnings, "UNSUPPORTED_ENDPOINT", fact.id(), "关系包含缺失端点或不属于过程、对象、对象状态的端点。"); continue;
            }
            if (!model && required.stream().anyMatch(hiddenStates::contains)) {
                warn(warnings, "HIDDEN_STATE", fact.id(), "关系连接到已隐藏状态；启用包含隐藏状态后查看。"); continue;
            }
            if (!nodes.keySet().containsAll(required) && !options.path("include_boundary_nodes").asBoolean()) {
                warn(warnings, "OUTSIDE_SCOPE", fact.id(), "关系端点超出当前范围，可启用边界节点。"); continue;
            }
            for (String id : required) if (!nodes.containsKey(id)) { var boundary = candidates.get(id).deepCopy(); boundary.put("boundary", true); nodes.put(id, boundary); }
            for (var pair : pairs) {
                String edgeId = fact.id() + "/" + pair.source().id() + "/" + pair.target().id();
                var edge = edges.addObject().put("id", edgeId).put("source", target(pair.source())).put("target", target(pair.target()))
                    .put("relation_type", fact.capability().capabilityId()).put("label", label(fact, rule.label()))
                    .put("direction", rule.direction()).put("fact_id", fact.id()).put("group_id", fact.id()).put("derived", false);
                edge.set("source_refs", refs.getOrDefault(fact.id(), JSON.createArrayNode()));
                var endpoints = edge.putArray("endpoints");
                for (var endpoint : fact.endpoints()) endpoints.addObject().put("role", endpoint.role()).put("target_id", target(endpoint)).put("ordinal", endpoint.ordinal());
                checkLimit(nodes.size(), edges.size());
            }
            factCount++;
        }
        int derived = 0;
        if (options.path("include_state_ownership").asBoolean()) for (var node : nodes.values()) {
            String owner = node.path("owner_id").asText("");
            if (!owner.isEmpty() && nodes.containsKey(owner)) {
                var edge = edges.addObject().put("id", "state-of/" + node.path("id").asText()).put("source", owner).put("target", node.path("id").asText())
                    .put("relation_type", "STATE_OF").put("label", "拥有状态").put("direction", "DIRECTED").putNull("fact_id")
                    .put("group_id", "state-of/" + node.path("id").asText()).put("derived", true);
                edge.set("source_refs", node.get("source_refs")); edge.putArray("endpoints"); derived++;
            }
        }
        checkLimit(nodes.size(), edges.size());
        var outputNodes = result.putArray("nodes"); nodes.values().forEach(outputNodes::add);
        Map<String, ObjectNode> types = new TreeMap<>();
        for (var edge : edges) {
            var type = types.computeIfAbsent(edge.path("relation_type").asText(), id -> JSON.createObjectNode().put("id", id)
                .put("label", id.equals("STATE_OF") ? "拥有状态" : Objects.requireNonNull(rule(facts.stream().filter(f -> f.capability().capabilityId().equals(id)).findFirst().orElseThrow())).label()).put("count", 0));
            type.put("count", type.path("count").asInt() + 1);
        }
        var typeArray = result.putArray("relation_types"); types.values().forEach(typeArray::add);
        result.putObject("statistics").put("node_count", nodes.size()).put("fact_count", factCount).put("derived_count", derived)
            .put("edge_count", edges.size()).put("excluded_count", warnings.size());
        return result;
    }

    private static String target(Endpoint endpoint) { return endpoint.stateQualificationId() == null ? endpoint.targetId() : endpoint.stateQualificationId(); }
    private static ObjectNode node(String id, String kind, String label, String owner, Map<String, ArrayNode> refs) {
        var node = JSON.createObjectNode().put("id", id).put("kind", kind).put("label", label).put("owner_id", owner).put("boundary", false);
        node.set("source_refs", refs.getOrDefault(id, JSON.createArrayNode())); return node;
    }
    private static void warn(ArrayNode warnings, String code, String id, String message) { warnings.addObject().put("code", code).put("target_id", id).put("message", message); }
    private static void checkLimit(int nodes, int edges) { if (nodes > 2000 || edges > 10000) throw new GraphAnalysisService.LimitExceeded(); }
    private static String label(Fact fact, String fallback) {
        return fact.labels().isEmpty() ? fallback : String.join(" / ", fact.labels().stream().map(Label::text).toList());
    }
    private static Rule rule(Fact fact) {
        var procedural = ProceduralLinkCatalog.find(fact.capability().capabilityId());
        if (procedural.isPresent()) {
            var descriptor = procedural.get();
            return new Rule(descriptor.displayName(), "DIRECTED", descriptor.endpointRoles().stream().map(ProceduralLinkCatalog.EndpointRole::role).toList());
        }
        var structural = StructuralLinkCatalog.find(fact.capability().capabilityId());
        if (structural.isEmpty()) return null;
        var descriptor = structural.get();
        List<String> roles = switch (descriptor.shape()) {
            case BINARY_SAME_THING -> List.of("STRUCTURAL_SOURCE", "STRUCTURAL_TARGET");
            case AGGREGATION_FAN -> List.of("WHOLE_THING", "PART_THING");
            case EXHIBITION_FAN -> List.of("EXHIBITOR_THING", "FEATURE_THING");
            case GENERALIZATION_FAN -> List.of("GENERAL_THING", "SPECIALIZED_THING");
            case CLASSIFICATION_FAN -> List.of("CLASS_THING", "INSTANCE_THING");
            case STATE_CHARACTERIZATION -> List.of("EXHIBITOR_THING_OR_STATE", "VALUE_STATE");
            case STATE_TAGGED -> List.of("STATE_TAGGED_SOURCE", "STATE_TAGGED_TARGET");
        };
        Direction direction = descriptor.direction() == Direction.PROFILE_DEFINED ? fact.direction() : descriptor.direction();
        if (direction == Direction.PROFILE_DEFINED) return null;
        return new Rule(descriptor.displayName(), direction.name(), roles);
    }
}
