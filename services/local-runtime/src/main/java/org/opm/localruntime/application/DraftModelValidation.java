package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.api.DraftCapabilityIdentity;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.text.OplGenerationException;
import org.opm.localruntime.text.OplTextGenerationService;
import org.opm.localruntime.text.TextGenerationAssets;

import java.util.List;
import java.util.Comparator;

/** 只读检查当前模型；不改变编辑授权，也不把现有规则覆盖写成完整标准符合性。 */
final class DraftModelValidation {
    private DraftModelValidation() { }

    static ObjectNode findings(String project, String model, JsonNode token, SemanticRevision revision, TextGenerationAssets assets) {
        var result = DraftWorkspaceQueries.findings(project, model, token, revision);
        // 引用结构不完整时，生成器无法可靠工作，保留基础诊断而不是抛出整个查询。
        if (!result.get("items").isEmpty()) return result;
        var text = new OplTextGenerationService();
        for (var fact : revision.facts().stream().sorted(Comparator.comparing(SemanticRevision.Fact::id)).toList()) {
            if (!sameAffectedObject(revision, fact)) {
                add(result, project, model, token, "rule.model.STATE_OWNER_MISMATCH", "STATE_OWNER_MISMATCH", fact.id(),
                        "状态改变关系的输入与输出必须属于同一个对象。请重新连接同一对象的状态，或删除并重新创建该关系。");
            }
            // 每条关系独立生成，防止一条失败掩盖同图的其他问题。
            var isolated = isolate(revision, fact);
            var contextIds = isolated.occurrences().stream().filter(item -> item.targetKind() == SemanticRevision.TargetKind.FACT)
                    .map(SemanticRevision.Occurrence::contextId).distinct().sorted().toList();
            for (String context : contextIds) {
                try {
                    var generated = text.generate(isolated, context, assets);
                    text.validateActiveWriteEvidence(isolated, assets, generated);
                } catch (OplGenerationException exception) {
                    String category = switch (exception.code()) {
                        case STATE_OWNER_MISMATCH -> "STATE_OWNER_MISMATCH";
                        case TEXT_GRAMMAR_BINDING_MISMATCH, TEXT_CAPABILITY_UNSUPPORTED, TEXT_TEMPLATE_MISSING -> "CAPABILITY_BINDING_MISMATCH";
                        case TEXT_TRACE_INCOMPLETE, TEXT_PRODUCTION_IDENTITY_INVALID -> "CONTEXT_CLOSURE_VIOLATION";
                        default -> "INVALID_ENDPOINT";
                    };
                    var diagram = revision.contexts().stream().filter(item -> item.id().equals(context)).findFirst().orElseThrow();
                    add(result, project, model, token, "rule.opl." + exception.code().name(), category, fact.id(),
                            "OPD「" + diagram.name().localName() + "」中的关系未通过 OPL 校验（" + exception.code().name()
                                    + "）。请检查关系类型、端点及控制修饰；规则资产或追溯问题需要检查当前 Profile。");
                }
            }
        }
        ((ObjectNode) result.get("validation_summary")).put("blocking", result.get("items").size());
        return result;
    }

    private static boolean sameAffectedObject(SemanticRevision revision, SemanticRevision.Fact fact) {
        String capability = fact.capability().capabilityId();
        if (!List.of("CAP-ISO-PROC-008", "CAP-ISO-PROC-009", "CAP-ISO-PROC-010").contains(capability)) return true;
        var endpoints = fact.endpoints().stream().sorted(Comparator.comparingInt(SemanticRevision.Endpoint::ordinal)).toList();
        if (endpoints.size() != 3) return true; // 端点数量交给现有生成规则报告。
        return owner(revision, endpoints.getFirst()).equals(owner(revision, endpoints.getLast()));
    }

    private static String owner(SemanticRevision revision, SemanticRevision.Endpoint endpoint) {
        if (endpoint.targetKind() != SemanticRevision.TargetKind.STATE) return endpoint.targetId();
        return revision.states().stream().filter(item -> item.id().equals(endpoint.targetId()))
                .map(SemanticRevision.State::ownerElementId).findFirst().orElse(endpoint.targetId());
    }

    private static SemanticRevision isolate(SemanticRevision revision, SemanticRevision.Fact fact) {
        var occurrences = revision.occurrences().stream().filter(item -> item.targetKind() != SemanticRevision.TargetKind.FACT
                || item.targetId().equals(fact.id())).toList();
        var ids = occurrences.stream().map(SemanticRevision.Occurrence::id).collect(java.util.stream.Collectors.toSet());
        var contexts = revision.contexts().stream().map(item -> new SemanticRevision.Context(item.id(), item.kind(), item.capability(),
                item.name(), item.occurrenceIds().stream().filter(ids::contains).toList(), item.source(), item.architectureLevel(), item.architectureLinks())).toList();
        return new SemanticRevision(revision.revisionId(), revision.modelId(), revision.revisionSequence(), revision.profileBinding(),
                revision.rootContextId(), revision.elements(), revision.features(), revision.states(), List.of(fact), contexts,
                occurrences, revision.layouts(), revision.statePresentations(), revision.refinementEdges());
    }

    private static void add(ObjectNode result, String project, String model, JsonNode token, String rule, String category, String target, String message) {
        var items = (com.fasterxml.jackson.databind.node.ArrayNode) result.get("items");
        String id = DraftCapabilityIdentity.finding(project, model, token, rule, target, message);
        items.addObject().put("finding_id", id).put("rule_id", rule).put("severity", "BLOCKING").put("category", category)
                .putNull("context_id").put("entity_id", target).put("message", message);
    }
}
