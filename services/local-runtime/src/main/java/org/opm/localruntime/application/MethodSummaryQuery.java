package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.semantic.SemanticRevision;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import static org.opm.localruntime.semantic.SemanticRevision.*;

/** 6×1 方法指导：关系只能作为候选证据，不能替代工程师确认角色。 */
final class MethodSummaryQuery {
    private static final ObjectMapper JSON = new ObjectMapper();
    private record Rule(String role, Set<String> capabilities, String processRole, Set<String> objectRoles, String relation) { }
    private static final List<Rule> RULES = List.of(
            new Rule("SUBJECT", Set.of("CAP-ISO-PROC-004", "CAP-ISO-PROC-011"), "ENABLED_PROCESS", Set.of("AGENT_OBJECT", "AGENT_STATE"), "代理"),
            new Rule("OBJECT", Set.of("CAP-ISO-PROC-003", "CAP-ISO-PROC-008", "CAP-ISO-PROC-009", "CAP-ISO-PROC-010"), "AFFECTING_PROCESS",
                    Set.of("AFFECTEE", "AFFECTED", "AFFECTEE_INPUT_STATE", "AFFECTED_OUTPUT_STATE", "AFFECTEE_OBJECT", "AFFECTED_OBJECT"), "影响"),
            new Rule("INSTRUMENT", Set.of("CAP-ISO-PROC-005", "CAP-ISO-PROC-012"), "ENABLED_PROCESS", Set.of("INSTRUMENT_OBJECT", "INSTRUMENT_STATE"), "工具"),
            new Rule("RESOURCE", Set.of("CAP-ISO-PROC-001", "CAP-ISO-PROC-006"), "CONSUMING_PROCESS", Set.of("CONSUMED_OBJECT", "CONSUMED_STATE"), "消耗"));
    private static final List<String> ROLES = List.of("SUBJECT", "OBJECT", "INSTRUMENT", "RESOURCE", "ENVIRONMENT", "INFORMATION");

    static ObjectNode summarize(SemanticRevision revision) {
        var result = JSON.createObjectNode().put("coverage", "RELATION_EVIDENCE_ONLY"); var processes = result.putArray("processes");
        for (var process : revision.elements()) {
            if (process.coreKind() != CoreKind.PROCESS) continue;
            var item = processes.addObject().put("process_id", process.id()).put("name", process.name().localName());
            item.set("context_ids", JSON.valueToTree(contexts(revision, process.id()))); var roles = item.putArray("roles");
            for (String role : ROLES) {
                var card = roles.addObject().put("role", role); var evidence = card.putArray("evidence");
                var rule = RULES.stream().filter(value -> value.role().equals(role)).findFirst().orElse(null);
                if (rule != null) for (var fact : revision.facts()) {
                    if (fact.family() != (Set.of("SUBJECT", "INSTRUMENT").contains(rule.role()) ? FactFamily.ENABLING : FactFamily.TRANSFORMATION) || !rule.capabilities().contains(fact.capability().capabilityId())
                            || fact.endpoints().stream().noneMatch(endpoint -> endpoint.role().equals(rule.processRole())
                                && endpoint.targetKind() == TargetKind.ELEMENT && endpoint.targetId().equals(process.id()))) continue;
                    addEvidence(revision, fact, process, rule, evidence);
                }
                card.put("status", rule == null ? "MANUAL" : evidence.isEmpty() ? "NO_EVIDENCE" : "EVIDENCE");
                card.put("guidance", guidance(role, evidence.isEmpty()));
            }
        }
        var contexts = result.putArray("contexts");
        for (var context : revision.contexts()) {
            var item = contexts.addObject().put("context_id", context.id()).put("name", context.name().localName());
            if (context.architectureLevel() == null) item.putNull("architecture_level");
            else item.put("architecture_level", context.architectureLevel().name());
        }
        var refinements = result.putArray("refinements");
        for (var edge : revision.refinementEdges()) {
            var refinee = revision.elements().stream().filter(element -> element.id().equals(edge.refineeElementId())).findFirst().orElseThrow();
            refinements.addObject().put("refinement_id", edge.id()).put("parent_context_id", edge.parentContextId())
                    .put("child_context_id", edge.childContextId()).put("refinee_element_id", edge.refineeElementId())
                    .put("refinee_name", refinee.name().localName()).put("refinement_kind", edge.kind().name());
        }
        var links = result.putArray("architecture_links");
        for (var context : revision.contexts()) for (var link : context.architectureLinks())
            links.addObject().put("link_id", link.id()).put("source_context_id", context.id())
                    .put("target_context_id", link.targetContextId()).put("kind", link.kind().name());
        return result;
    }

    private static void addEvidence(SemanticRevision revision, Fact fact, Element process, Rule rule, ArrayNode evidence) {
        var names = new LinkedHashSet<String>(); var targets = new LinkedHashSet<String>(); targets.add(process.id());
        for (var endpoint : fact.endpoints()) {
            targets.add(endpoint.targetId());
            if (endpoint.stateQualificationId() != null) targets.add(endpoint.stateQualificationId());
            if (!rule.objectRoles().contains(endpoint.role())) continue;
            String owner = owner(revision, endpoint.targetKind(), endpoint.targetId());
            if (owner == null) continue;
            var object = revision.elements().stream().filter(item -> item.id().equals(owner) && item.coreKind() == CoreKind.OBJECT).findFirst().orElse(null);
            if (object == null) continue;
            targets.add(owner); String label = object.name().localName();
            if (endpoint.targetKind() == TargetKind.STATE) {
                var state = revision.states().stream().filter(item -> item.id().equals(endpoint.targetId())).findFirst().orElseThrow();
                if (state.ownerTargetKind() == TargetKind.FEATURE) {
                    targets.add(state.ownerElementId());
                    label += " / " + revision.features().stream().filter(item -> item.id().equals(state.ownerElementId())).findFirst().orElseThrow().name().localName();
                }
                label += "［" + state.name().localName() + "］";
            }
            names.add(label);
        }
        if (names.isEmpty()) return;
        var entry = evidence.addObject().put("fact_id", fact.id()).put("capability_id", fact.capability().capabilityId())
                .put("description", rule.relation() + "关系：" + String.join(" → ", names));
        entry.set("context_ids", JSON.valueToTree(contexts(revision, fact.id())));
        entry.set("target_ids", JSON.valueToTree(targets));
    }

    private static String owner(SemanticRevision revision, TargetKind kind, String id) {
        if (kind == TargetKind.ELEMENT) return id;
        if (kind == TargetKind.FEATURE) return revision.features().stream().filter(item -> item.id().equals(id)).map(Feature::ownerElementId).findFirst().orElse(null);
        if (kind == TargetKind.STATE) {
            var state = revision.states().stream().filter(item -> item.id().equals(id)).findFirst().orElse(null);
            return state == null ? null : owner(revision, state.ownerTargetKind(), state.ownerElementId());
        }
        return null;
    }

    private static List<String> contexts(SemanticRevision revision, String target) {
        return revision.occurrences().stream().filter(item -> item.targetId().equals(target)).map(Occurrence::contextId).distinct().toList();
    }

    private static String guidance(String role, boolean empty) {
        return switch (role) {
            case "SUBJECT" -> empty ? "未发现代理关系。请确认是否需要负责该过程的人或组织。" : "已发现代理关系；请确认代理是人或组织，并负责该过程。";
            case "OBJECT" -> empty ? "未发现影响关系。请确认过程影响的客体及原状态、预期状态。" : "已发现影响关系；请确认客体及原状态、预期状态，单一影响关系不代表边界已完整。";
            case "INSTRUMENT" -> empty ? "未发现工具关系。请确认过程所需的手段或信息。" : "已发现工具关系；请确认用途属于手段还是信息。";
            case "RESOURCE" -> empty ? "未发现消耗关系。请确认过程是否需要消耗资源。" : "已发现消耗关系；请确认消耗对象符合资源用途。";
            case "ENVIRONMENT" -> "需人工确认环境如何影响过程；当前关系无法唯一识别，环境属性不等同于方法角色。";
            case "INFORMATION" -> "需人工确认过程所需的信息；工具关系可提供线索，名称和信息性属性不足以确认角色。";
            default -> throw new IllegalArgumentException("未知方法角色");
        };
    }
}
