package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import org.opm.localruntime.api.DraftCapabilityIdentity;
import org.opm.localruntime.semantic.*;
import org.opm.localruntime.text.*;
import org.opm.localruntime.assets.ProfilePackageAssembler;

/** 候选查询与目标授权；草稿 token 验证及事务仍由工作台服务持有。 */
final class DraftCapabilityQuery {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<String> SUPPORTED = List.of("APPLY_MODEL_PLAN", "CREATE_ARCHITECTURE_LINK", "DELETE_ARCHITECTURE_LINK", "UPDATE_ARCHITECTURE_CLASSIFICATION", "CREATE_ELEMENT", "CREATE_CONTEXT", "DELETE_CONTEXT", "UPDATE_PROPERTY", "UPDATE_LAYOUT", "UPDATE_LAYOUT_BATCH",
            "CREATE_FEATURE", "CREATE_STATE", "UPDATE_STATE", "STATE_EXPLICIT", "STATE_SUPPRESS", "UNFOLD", "FOLD", "CREATE_FACT", "UPDATE_FACT", "DELETE_CONSTRUCT");
    private final LocalApiService domain;
    private final ProfilePackageAssembler profiles;
    private final OplTextGenerationService text = new OplTextGenerationService();
    DraftCapabilityQuery(LocalApiService domain, ProfilePackageAssembler profiles) { this.domain = domain; this.profiles = profiles; }
    ObjectNode candidates(String project, String model, JsonNode token, JsonNode scope, SemanticRevision revision) {
        require(revision.profileBinding().equals(RuntimeActiveBindingProvider.current()), "RULE_VERSION_CONFLICT", null);
        String intent = scope.get("intent").asText(); String context = scope.get("context_id").asText();
        String query = DraftCapabilityIdentity.query(project, model, token, scope);
        var data = JSON.createObjectNode(); data.set("scope", scope); var allowed = data.putArray("allowed"); var forbidden = data.putArray("forbidden");
        data.put("capability_query_id", query); var options = data.putArray("options");
        String selection = scope.get("selection_id").isNull() ? null : scope.get("selection_id").asText();
        String reason = !SUPPORTED.contains(intent) ? "COMMAND_NOT_IMPLEMENTED"
                : !intent.equals("UPDATE_LAYOUT_BATCH") && !DraftFactEdits.TYPES.contains(intent) && !scope.get("endpoints").isEmpty() ? "ENDPOINT_KIND_MISMATCH" : null;
        if (intent.equals("UPDATE_ARCHITECTURE_CLASSIFICATION") || MethodArchitectureLinks.COMMANDS.contains(intent)) {
            if (reason == null && selection == null) {
                var item = JSON.createObjectNode().put("capability_query_id", query).put("command_type", intent)
                        .put("option_kind", "METHOD_METADATA").put("target_context_id", context)
                        .put("display_name", switch (intent) { case "CREATE_ARCHITECTURE_LINK" -> "添加架构关联"; case "DELETE_ARCHITECTURE_LINK" -> "删除架构关联"; default -> "设置 OPD 架构层分类"; }).put("enabled", true);
                item.putArray("required_fields"); item.putArray("reason_codes"); item.set("expires_with_token", token);
                item.put("option_id", DraftCapabilityIdentity.option(query, item)); options.add(item); allowed.add(intent);
            } else forbidden.addObject().put("command_type", intent).put("reason_code", reason == null ? "CONTEXT_NOT_ALLOWED" : reason);
            return data;
        }
        var assets = profiles.assemble(revision.profileBinding());
        if (intent.equals("APPLY_MODEL_PLAN")) {
            if (reason == null && selection == null) { options.add(option(query, token, intent, "CAP-OBJECT-001", null, null, null, assets)); allowed.add(intent); }
            else forbidden.addObject().put("command_type", intent).put("reason_code", "CONTEXT_NOT_ALLOWED");
            return data;
        }
        if (intent.equals("DELETE_CONTEXT")) {
            var incoming = revision.refinementEdges().stream().filter(edge -> edge.childContextId().equals(selection)).findFirst().orElse(null);
            if (reason == null && (selection == null || selection.equals(revision.rootContextId()) || incoming == null)) reason = "CONTEXT_NOT_ALLOWED";
            if (reason == null) {
                var refinee = revision.elements().stream().filter(item -> item.id().equals(incoming.refineeElementId())).findFirst().orElseThrow();
                var plan = DraftContextDeletion.plan(revision, selection);
                var item = option(query, token, intent, refinee.capability().capabilityId(), "CONTEXT", selection, null, assets);
                item.set("context_impact", plan.impact(token)); item.put("enabled", plan.blockers().isEmpty());
                if (!plan.blockers().isEmpty()) ((ArrayNode) item.get("reason_codes")).add("DELETE_DEPENDENCY_EXISTS");
                String identity = DraftCapabilityIdentity.option(query, item); item.put("option_id", identity);
                item.put("impact_token", DraftCapabilityIdentity.impact(query, identity, item.get("context_impact")));
                options.add(item); if (plan.blockers().isEmpty()) allowed.add(intent);
            } else forbidden.addObject().put("command_type", intent).put("reason_code", reason);
            return data;
        }
        if (DraftFactEdits.TYPES.contains(intent)) {
            if (reason == null) {
                OplGenerationResult generated = null;
                if (intent.equals("DELETE_CONSTRUCT")) {
                    require(new SemanticRevisionValidator().validate(revision).isEmpty(), "DRAFT_EDIT_REJECTED", null);
                    generated = generate(revision, context);
                }
                options.addAll(DraftFactEdits.options(domain, revision, scope, token, query, assets, generated));
                if (options.isEmpty()) reason = "ENDPOINT_KIND_MISMATCH";
                else for (var option : options) if (option.get("enabled").asBoolean()) { allowed.add(intent); break; }
            }
            if (reason != null) forbidden.addObject().put("command_type", intent).put("reason_code", reason);
            return data;
        }
        if (intent.equals("UPDATE_LAYOUT_BATCH")) {
            var ids = new java.util.HashSet<String>();
            if (selection != null || scope.get("endpoints").isEmpty() || scope.get("endpoints").size() > 1000) reason = "ENDPOINT_KIND_MISMATCH";
            for (var id : scope.get("endpoints")) {
                if (!ids.add(id.asText()) || revision.occurrences().stream().noneMatch(item -> item.contextId().equals(context)
                        && item.id().equals(id.asText())) || !domain.draftLayoutAllowed(revision, id.asText())) reason = "ENDPOINT_KIND_MISMATCH";
            }
            if (reason == null) {
                options.add(option(query, token, intent, "CAP-OBJECT-001", null, null, null, assets)); allowed.add(intent);
            } else forbidden.addObject().put("command_type", intent).put("reason_code", reason);
            return data;
        }
        var occurrence = revision.occurrences().stream().filter(item -> item.contextId().equals(context) && item.id().equals(selection)).findFirst().orElse(null);
        String target = occurrence == null ? selection : occurrence.targetId();
        var element = revision.elements().stream().filter(item -> item.id().equals(target)).findFirst().orElse(null);
        var selectedFeature = revision.features().stream().filter(item -> item.id().equals(target)).findFirst().orElse(null);
        if (reason == null) switch (intent) {
            case "CREATE_ELEMENT" -> {
                if (selection != null) reason = "ENDPOINT_KIND_MISMATCH";
                else for (String kind : List.of("OBJECT", "PROCESS")) options.add(option(query, token, intent, "CAP-" + kind + "-001", null, null, null, assets));
            }
            case "CREATE_CONTEXT" -> {
                if (occurrence == null || occurrence.targetKind() != SemanticRevision.TargetKind.ELEMENT
                        || occurrence.ownership() != SemanticRevision.OccurrenceOwnership.OWNED || element == null
                        || element.coreKind() == SemanticRevision.CoreKind.PROFILE_ELEMENT
                        || revision.refinementEdges().stream().anyMatch(item -> item.parentContextId().equals(context)
                            && item.refineeElementId().equals(element.id()))) reason = "ENDPOINT_KIND_MISMATCH";
                else options.add(option(query, token, intent, element.capability().capabilityId(), "ELEMENT", element.id(), occurrence.id(), assets));
            }
            case "UPDATE_PROPERTY" -> {
                String kind = element != null ? "ELEMENT" : selectedFeature != null ? "FEATURE" : null;
                boolean visible = kind != null && visible(revision, context, kind, target);
                if (!visible) reason = "ENDPOINT_KIND_MISMATCH";
                else options.add(option(query, token, intent,
                        element != null ? element.capability().capabilityId() : selectedFeature.capability().capabilityId(),
                        kind, target, null, assets));
            }
            case "UPDATE_LAYOUT" -> {
                if (occurrence == null || !domain.draftLayoutAllowed(revision, selection)) reason = "ENDPOINT_KIND_MISMATCH";
                else {
                    String capability = occurrence.targetKind() == SemanticRevision.TargetKind.ELEMENT ? element.capability().capabilityId()
                            : occurrence.targetKind() == SemanticRevision.TargetKind.STATE
                            ? revision.states().stream().filter(item -> item.id().equals(target)).findFirst().orElseThrow().capability().capabilityId()
                            : revision.features().stream().filter(item -> item.id().equals(target)).findFirst().orElseThrow().capability().capabilityId();
                    options.add(option(query, token, intent, capability, occurrence.targetKind().name(), target, occurrence.id(), assets));
                }
            }
            case "CREATE_FEATURE" -> {
                if (element == null || !visible(revision, context, "ELEMENT", target)) reason = "ENDPOINT_KIND_MISMATCH";
                else for (String kind : List.of("ATTRIBUTE", "OPERATION"))
                    options.add(option(query, token, intent, "CAP-FEAT-" + kind + "-001", "ELEMENT", target, occurrence == null ? null : occurrence.id(), assets));
            }
            case "CREATE_STATE" -> {
                var feature = revision.features().stream().filter(item -> item.id().equals(target)).findFirst().orElse(null);
                String kind = element != null && element.coreKind() == SemanticRevision.CoreKind.OBJECT ? "ELEMENT" : feature != null ? "FEATURE" : null;
                if (kind == null || !visible(revision, context, kind, target)) reason = "ENDPOINT_KIND_MISMATCH";
                else options.add(option(query, token, intent, kind.equals("ELEMENT") ? "CAP-STATE-001" : "CAP-FEAT-STATE-001", kind, target, occurrence == null ? null : occurrence.id(), assets));
            }
            case "UPDATE_STATE", "STATE_EXPLICIT", "STATE_SUPPRESS", "UNFOLD", "FOLD" -> {
                var state = revision.states().stream().filter(item -> item.id().equals(target)).findFirst().orElse(null);
                boolean suppressed = state != null && occurrence == null && revision.statePresentations().stream().anyMatch(item -> item.contextId().equals(context)
                        && item.stateId().equals(target) && item.explicitness() == SemanticRevision.StateExplicitness.SUPPRESSED)
                        && visible(revision, context, state.ownerTargetKind().name(), state.ownerElementId());
                if (state == null || !(visible(revision, context, "STATE", target) || suppressed)) reason = "ENDPOINT_KIND_MISMATCH";
                else options.add(option(query, token, intent, state.capability().capabilityId(), "STATE", target, occurrence == null ? null : occurrence.id(), assets));
            }
            default -> throw failure("DRAFT_EDIT_REJECTED", "COMMAND_NOT_IMPLEMENTED");
        }
        if (reason != null) forbidden.addObject().put("command_type", intent).put("reason_code", reason);
        else if (!options.isEmpty()) allowed.add(intent);
        return data;
    }

    private ObjectNode option(String query, JsonNode token, String type, String capability, String targetKind, String target, String occurrence, TextGenerationAssets assets) {
        String symbol = switch (capability) {
            case "CAP-OBJECT-001" -> "symbol.object.basic";
            case "CAP-PROCESS-001" -> "symbol.process.basic";
            case "CAP-FEAT-ATTRIBUTE-001" -> "symbol.feature.attribute";
            case "CAP-FEAT-OPERATION-001" -> "symbol.feature.operation";
            case "CAP-STATE-001" -> "symbol.state.basic";
            case "CAP-FEAT-STATE-001" -> "symbol.feature.state";
            default -> throw failure("DRAFT_EDIT_REJECTED", "PROFILE_CAPABILITY_DISABLED");
        };
        require(assets.symbolCatalog().containsSymbol(symbol), "DRAFT_EDIT_REJECTED", "SYMBOL_ASSET_MISSING");
        var option = JSON.createObjectNode().put("capability_query_id", query).put("command_type", type)
                .put("display_name", switch (type) {
                    case "APPLY_MODEL_PLAN" -> "确认整图修改";
                    case "CREATE_ELEMENT" -> "创建 " + (capability.equals("CAP-OBJECT-001") ? "Object" : "Process");
                    case "CREATE_CONTEXT" -> "创建子 OPD";
                    case "DELETE_CONTEXT" -> "删除子图";
                    case "UPDATE_LAYOUT_BATCH" -> "批量移动元素";
                    case "UPDATE_PROPERTY" -> "编辑名称"; case "UPDATE_LAYOUT" -> "移动元素";
                    case "CREATE_FEATURE" -> capability.equals("CAP-FEAT-ATTRIBUTE-001") ? "创建属性" : "创建操作";
                    case "CREATE_STATE" -> "创建状态"; case "UPDATE_STATE" -> "编辑状态";
                    case "STATE_EXPLICIT" -> "显示状态"; case "STATE_SUPPRESS" -> "隐藏状态";
                    case "UNFOLD" -> "展开状态"; case "FOLD" -> "折叠状态";
                    default -> throw failure("DRAFT_EDIT_REJECTED", "COMMAND_NOT_IMPLEMENTED"); });
        option.putObject("capability_ref").put("capability_id", capability); option.putArray("group_path").add("元素");
        var endpoints = option.putArray("normalized_endpoints");
        if (target != null) {
            String role = switch (type) { case "UPDATE_PROPERTY" -> "PROPERTY_TARGET"; case "UPDATE_LAYOUT" -> "LAYOUT_TARGET";
                case "CREATE_FEATURE" -> "FEATURE_OWNER"; case "CREATE_STATE" -> "STATE_OWNER";
                case "CREATE_CONTEXT" -> "REFINEE"; case "DELETE_CONTEXT" -> "DELETE_TARGET"; default -> "STATE_TARGET"; };
            var endpoint = endpoints.addObject().put("role", role).put("ordinal", 0);
            var ref = endpoint.putObject("target_ref").put("target_kind", targetKind).put("target_id", target);
            if (occurrence != null) ref.put("occurrence_id", occurrence);
        }
        var fields = option.putArray("required_fields");
        if (type.equals("APPLY_MODEL_PLAN")) { field(fields, "steps", "LIST"); }
        else if (type.equals("CREATE_ELEMENT")) { field(fields, "kind", "ENUM", capability.equals("CAP-OBJECT-001") ? "OBJECT" : "PROCESS"); field(fields, "name", "TEXT"); field(fields, "layout", "LAYOUT"); }
        else if (type.equals("CREATE_CONTEXT")) { field(fields, "refinee_element_id", "TEXT"); field(fields, "name", "TEXT"); }
        else if (type.equals("DELETE_CONTEXT")) { field(fields, "context_id", "TEXT"); field(fields, "impact_token", "TEXT"); }
        else if (type.equals("UPDATE_PROPERTY")) { field(fields, "target_ref", "ENDPOINT"); field(fields, "property_name", "ENUM", "name"); field(fields, "value", "TEXT"); }
        else if (type.equals("UPDATE_LAYOUT_BATCH")) { field(fields, "layouts", "LAYOUT"); }
        else if (type.equals("UPDATE_LAYOUT")) { field(fields, "occurrence_id", "TEXT"); field(fields, "layout", "LAYOUT"); }
        else if (type.equals("CREATE_FEATURE")) {
            field(fields, "owner_element_id", "TEXT"); field(fields, "feature_kind", "ENUM", capability.equals("CAP-FEAT-ATTRIBUTE-001") ? "ATTRIBUTE" : "OPERATION");
            field(fields, "name", "TEXT"); field(fields, "layout", "LAYOUT");
        } else if (type.equals("CREATE_STATE")) { field(fields, "owner_ref", "ENDPOINT"); field(fields, "name_or_value", "TEXT"); field(fields, "state_roles", "LIST", "INITIAL", "DEFAULT", "FINAL"); field(fields, "layout", "LAYOUT"); }
        else if (type.equals("UPDATE_STATE")) { field(fields, "state_id", "TEXT"); field(fields, "expected_owner_ref", "ENDPOINT"); field(fields, "changes", "LIST", "name_or_value", "state_roles"); }
        else field(fields, "state_id", "TEXT");
        option.putArray("allowed_modifiers"); option.set("symbol_descriptor", asset(symbol, assets.binding().symbolCatalog()));
        option.set("template_family", asset(assets.binding().textGrammar().id(), assets.binding().textGrammar())); option.putArray("rule_refs").add(asset(assets.binding().ruleSet().id(), assets.binding().ruleSet()));
        option.put("enabled", true).putArray("reason_codes"); option.set("expires_with_token", token);
        option.put("option_id", DraftCapabilityIdentity.option(query, option)); return option;
    }

    private static boolean visible(SemanticRevision revision, String context, String kind, String target) {
        return revision.occurrences().stream().anyMatch(item -> item.contextId().equals(context) && item.targetKind().name().equals(kind) && item.targetId().equals(target));
    }

    static void validateOwnedPayload(SemanticRevision base, JsonNode scope, JsonNode chosen, String type, JsonNode payload) {
        String context = scope.get("context_id").asText(); JsonNode endpoint = chosen.at("/normalized_endpoints/0/target_ref");
        String target = endpoint.get("target_id").asText();
        if (payload.has("context_id")) require(context.equals(payload.get("context_id").asText()), "DRAFT_EDIT_REJECTED", "CONTEXT_NOT_ALLOWED");
        if (type.equals("CREATE_FEATURE") || type.equals("CREATE_STATE")) {
            JsonNode capability = payload.get("capability_ref"); String selectedCapability = chosen.at("/capability_ref/capability_id").asText();
            require(selectedCapability.equals(capability.path("capability_id").asText())
                    && (!capability.has("version") || base.profileBinding().profile().version().equals(capability.get("version").asText())), "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
            String role;
            if (type.equals("CREATE_FEATURE")) {
                require(target.equals(payload.path("owner_element_id").asText())
                        && selectedCapability.equals("CAP-FEAT-" + payload.path("feature_kind").asText() + "-001"), "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
                role = payload.get("feature_kind").asText() + "_NODE";
            } else {
                ownerLocator(base, context, payload.get("owner_ref"), endpoint.get("target_kind").asText(), target);
                role = endpoint.get("target_kind").asText().equals("FEATURE") ? "FEATURE_STATE_NODE" : "STATE_NODE";
            }
            require(payload.at("/occurrence/ownership").asText().equals("OWNED") && payload.at("/occurrence/construct_role").asText().equals(role), "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
            String name = payload.get(type.equals("CREATE_FEATURE") ? "name" : "name_or_value").asText();
            require(!name.isBlank(), "INPUT_INVALID", null);
        } else {
            require(target.equals(payload.get("state_id").asText()), "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
            if (type.equals("UPDATE_STATE")) {
                var state = base.states().stream().filter(item -> item.id().equals(target)).findFirst().orElseThrow();
                ownerLocator(base, context, payload.get("expected_owner_ref"), state.ownerTargetKind().name(), state.ownerElementId());
                if (payload.get("changes").has("name_or_value")) require(!payload.at("/changes/name_or_value").asText().isBlank(), "INPUT_INVALID", null);
            }
        }
    }

    private static void ownerLocator(SemanticRevision base, String context, JsonNode locator, String kind, String target) {
        require(locator.path("target_kind").asText().equals(kind) && locator.path("target_id").asText().equals(target), "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
        if (locator.has("occurrence_id")) require(base.occurrences().stream().anyMatch(item -> item.id().equals(locator.get("occurrence_id").asText())
                && item.contextId().equals(context) && item.targetKind().name().equals(kind) && item.targetId().equals(target)), "DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH");
    }

    private static ObjectNode asset(String id, SemanticRevision.AssetReference asset) { return JSON.createObjectNode().put("id", id).put("version", asset.version()).put("digest", asset.sha256()); }
    private static void field(ArrayNode fields, String name, String kind, String... values) {
        var field = fields.addObject().put("field_id", name).put("field_kind", kind).put("required", true); var allowed = field.putArray("allowed_values"); for (String value : values) allowed.add(value);
    }
    private OplGenerationResult generate(SemanticRevision revision, String context) {
        var assets = profiles.assemble(revision.profileBinding()); var result = text.generate(revision, context, assets);
        text.validateActiveWriteEvidence(revision, assets, result); return result;
    }
    private static DraftWorkspaceService.Failure failure(String code, String reason) { return new DraftWorkspaceService.Failure(code, reason); }
    private static void require(boolean condition, String code, String reason) { if (!condition) throw failure(code, reason); }
}
