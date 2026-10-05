package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.storage.DraftJournalRepository;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import java.util.List;

/** 在编辑事务的领域边界捕获名称，避免以后改名或删除改变历史含义。 */
final class DraftOperationDescription {
    private static final ObjectMapper JSON = new ObjectMapper();
    static DraftJournalRepository.Proposal describe(JsonNode input, ObjectNode before, DraftJournalRepository.Proposal proposal) {
        var after = SaveContentDigestV1.read(proposal.documentJson());
        String type = input.at("/command/command_type").asText();
        String context = input.at("/scope/context_id").asText();
        String action = switch (type) {
            case "APPLY_MODEL_PLAN" -> "确认智能建模方案";
            case "CREATE_ELEMENT" -> input.at("/command/payload/kind").asText().equals("OBJECT") ? "创建对象" : "创建过程";
            case "CREATE_FEATURE" -> input.at("/command/payload/feature_kind").asText().equals("ATTRIBUTE") ? "创建属性" : "创建操作";
            case "CREATE_STATE" -> "创建状态";
            case "UPDATE_STATE" -> "修改状态";
            case "UPDATE_PROPERTY" -> "修改名称";
            case "UPDATE_LAYOUT" -> "移动或调整元素";
            case "UPDATE_LAYOUT_BATCH" -> input.at("/command/payload/layouts").size() == 1 ? "移动或调整元素" : "调整多个元素布局";
            case "CREATE_ARCHITECTURE_LINK" -> "添加架构关联";
            case "DELETE_ARCHITECTURE_LINK" -> "删除架构关联";
            case "UPDATE_ARCHITECTURE_CLASSIFICATION" -> "修改架构层分类";
            case "CREATE_CONTEXT" -> "添加子图";
            case "DELETE_CONTEXT" -> "删除子图";
            case "CREATE_FACT" -> "创建关系";
            case "UPDATE_FACT" -> "修改关系";
            case "DELETE_CONSTRUCT" -> "删除元素或关系";
            case "STATE_EXPLICIT" -> "显示状态";
            case "STATE_SUPPRESS" -> "隐藏状态";
            case "UNFOLD" -> "展开元素";
            case "FOLD" -> "折叠元素";
            default -> "编辑模型";
        };
        var names = new java.util.LinkedHashSet<String>();
        for (String id : proposal.affectedIds()) {
            String name = name(type.startsWith("DELETE") ? before : after, id);
            if (name != null) names.add(name);
            if (names.size() == 3) break;
        }
        if (names.isEmpty()) for (var id : input.at("/scope/endpoints")) {
            String name = name(before, id.asText());
            if (name != null) names.add(name);
            if (names.size() == 3) break;
        }
        String title = action + (names.isEmpty() ? "" : "：" + String.join("、", names));
        if (type.equals("UPDATE_PROPERTY")) {
            String previous = name(before, input.at("/command/payload/target_ref/target_id").asText());
            if (previous != null) title = "修改名称：" + previous + " → " + input.at("/command/payload/value").asText();
        }
        if (type.equals("UPDATE_ARCHITECTURE_CLASSIFICATION")) {
            String level = input.at("/command/payload/architecture_level").asText("");
            title += " → " + switch (level) { case "MISSION" -> "任务架构"; case "FUNCTION" -> "功能架构"; case "PRODUCT" -> "产品架构"; default -> "未分类"; };
        }
        if (MethodArchitectureLinks.COMMANDS.contains(type)) {
            String from = context, to = input.at("/command/payload/target_context_id").asText(), kind = input.at("/command/payload/kind").asText();
            if (type.equals("DELETE_ARCHITECTURE_LINK")) {
                String id = input.at("/command/payload/link_id").asText();
                for (var owner : before.path("contexts")) for (var link : owner.path("architecture_links"))
                    if (link.path("link_id").asText().equals(id)) { from = owner.path("context_id").asText(); to = link.path("target_context_id").asText(); kind = link.path("kind").asText(); }
            }
            title = action + "：" + name(before, from) + " — " + switch (kind) { case "INPUT" -> "提供输入给"; case "GENERATES" -> "生成"; default -> "追溯到"; } + " → " + name(before, to);
        }
        String contextName = name(before, context);
        var detail = JSON.createObjectNode().put("title", title).put("context_id", context).put("context_name", contextName).put("operation", type);
        return new DraftJournalRepository.Proposal(proposal.documentJson(), proposal.affectedIds(), proposal.textTraceIds(), proposal.validationSummaryJson(), detail.toString(), proposal.analysisMappingsJson());
    }
    private static String name(JsonNode document, String id) {
        for (String collection : List.of("elements", "features", "states", "contexts")) for (var node : document.path(collection)) {
            String key = switch (collection) { case "elements" -> "element_id"; case "features" -> "feature_id"; case "states" -> "state_id"; default -> "context_id"; };
            if (node.path(key).asText().equals(id)) {
                String value = node.path("name").path("local_name").asText(null);
                if (value == null) value = node.path("name_or_value").asText(null);
                return value;
            }
        }
        for (var node : document.path("occurrences")) if (node.path("occurrence_id").asText().equals(id))
            return name(document, node.path("target_id").asText());
        return null;
    }
}
