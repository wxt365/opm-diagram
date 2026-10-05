package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.api.DraftWorkspaceSchema;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.storage.DraftJournalRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** 在独立正文副本中逐步绑定候选，依赖别名不直接成为持久化身份。 */
final class DraftModelPlan {
    private static final ObjectMapper JSON = new ObjectMapper();
    static final Set<String> TYPES = Set.of("CREATE_ELEMENT", "CREATE_STATE", "CREATE_FACT", "UPDATE_PROPERTY", "UPDATE_STATE", "UPDATE_LAYOUT");
    @FunctionalInterface interface Candidates { JsonNode query(JsonNode scope, SemanticRevision revision); }
    @FunctionalInterface interface Editor { DraftJournalRepository.Proposal edit(JsonNode input, ObjectNode document); }
    @FunctionalInterface interface Guard { void check(SemanticRevision revision, String context, String target); }
    record Result(ObjectNode document, DraftJournalRepository.Proposal proposal, Map<String, String> aliases) { }

    static Result build(String context, String planId, JsonNode token, JsonNode steps, ObjectNode source,
                        Candidates candidates, Editor editor, Guard guard) {
        ObjectNode document = source.deepCopy(); var aliases = new LinkedHashMap<String, String>();
        var affected = new LinkedHashSet<String>(); var traces = new LinkedHashSet<String>();
        var keys = new HashSet<String>(); DraftJournalRepository.Proposal last = null;
        for (var step : steps) {
            DraftWorkspaceSchema.validate(step, "ModelPlanStep");
            String key = step.path("local_id").asText(), type = step.path("command_type").asText();
            require(keys.add(key));
            var revision = DraftWorkspaceService.semantic(document);
            require(revision.occurrences().stream().noneMatch(item -> item.id().equals(key) || item.targetId().equals(key)));
            var scope = JSON.createObjectNode().put("context_id", context).put("intent", type).putNull("selection_id");
            var endpoints = scope.putArray("endpoints");
            if (type.equals("CREATE_FACT")) for (var endpoint : step.get("endpoints")) endpoints.add(resolve(endpoint.asText(), aliases, revision, context));
            else if (step.has("target")) scope.put("selection_id", resolve(step.get("target").asText(), aliases, revision, context));
            if (!scope.get("selection_id").isNull()) {
                String occurrence = scope.get("selection_id").asText();
                if (!type.equals("UPDATE_LAYOUT")) {
                    var selected = revision.occurrences().stream().filter(item -> item.id().equals(occurrence)).findFirst().orElseThrow();
                    guard.check(revision, context, selected.targetId());
                }
            }
            var options = candidates.query(scope, revision); JsonNode chosen = null;
            String capability = type.equals("CREATE_ELEMENT") ? "CAP-" + step.get("kind").asText() + "-001" : step.path("capability_id").asText(null);
            for (var option : options.path("options")) if (option.path("enabled").asBoolean()
                    && (capability == null || option.at("/capability_ref/capability_id").asText().equals(capability))) { chosen = option; break; }
            require(chosen != null);
            var payload = payload(context, planId, step, revision, scope, chosen);
            var input = JSON.createObjectNode().put("request_id", "request.plan.step").put("command_id", "command.plan.step");
            input.set("expected_draft_token", token); input.set("scope", scope);
            input.putObject("authorization").set("capability_query_id", options.get("capability_query_id"));
            ((ObjectNode) input.get("authorization")).set("selected_option_id", chosen.get("option_id"));
            var command = input.putObject("command").put("command_type", type); command.set("payload", payload);
            DraftWorkspaceSchema.validate(input, "DraftEditRequest");
            last = editor.edit(input, document);
            document = SaveContentDigestV1.read(last.documentJson());
            // 重演同一方案时保持图元身份稳定，避免实时预览反复重建连线。
            var identities = new HashMap<String, String>();
            if (type.startsWith("CREATE")) {
                String id = generatedId(planId, key);
                var occurrence = (ObjectNode) document.get("occurrences").get(document.get("occurrences").size() - 1);
                identities.put(occurrence.get("occurrence_id").asText(), "occurrence." + id);
                identities.put(occurrence.get("layout_id").asText(), "layout." + id);
                if (type.equals("CREATE_FACT")) {
                    var fact = document.get("facts").get(document.get("facts").size() - 1);
                    int ordinal = 0;
                    for (var endpoint : fact.get("endpoints")) identities.put(endpoint.get("endpoint_id").asText(), "endpoint." + id + "." + ordinal++);
                }
                remapIdentities(document, identities);
            }
            for (String identity : last.affectedIds()) affected.add(identities.getOrDefault(identity, identity));
            traces.addAll(last.textTraceIds());
            if (type.startsWith("CREATE")) {
                String idField = type.equals("CREATE_ELEMENT") ? "element_id" : type.equals("CREATE_STATE") ? "state_id" : "fact_id";
                String createdId = payload.get(idField).asText();
                String occurrence = DraftWorkspaceService.semantic(document).occurrences().stream()
                        .filter(item -> item.contextId().equals(context) && item.targetId().equals(createdId)).findFirst().orElseThrow().id();
                aliases.put(key, occurrence);
            } else aliases.put(key, scope.get("selection_id").asText());
        }
        String summary = last == null ? "{\"blocking\":0,\"warning\":0,\"suggestion\":0,\"coverage_state\":\"INCOMPLETE\"}" : last.validationSummaryJson();
        return new Result(document, new DraftJournalRepository.Proposal(document.toString(), List.copyOf(affected), List.copyOf(traces), summary), aliases);
    }

    static String resolve(String reference, Map<String, String> aliases, SemanticRevision revision, String context) {
        String resolved = aliases.getOrDefault(reference, reference);
        var exact = revision.occurrences().stream().filter(item -> item.contextId().equals(context) && item.id().equals(resolved)).findFirst();
        if (exact.isPresent()) return exact.get().id();
        var matches = revision.occurrences().stream().filter(item -> item.contextId().equals(context) && item.targetId().equals(resolved)).toList();
        require(matches.size() == 1); return matches.getFirst().id();
    }

    private static ObjectNode payload(String context, String plan, JsonNode step, SemanticRevision revision, JsonNode scope, JsonNode option) {
        String type = step.get("command_type").asText(), id = generatedId(plan, step.get("local_id").asText());
        var payload = JSON.createObjectNode();
        switch (type) {
            case "CREATE_ELEMENT" -> {
                payload.put("context_id", context).put("element_id", "element." + id).put("kind", step.get("kind").asText()).set("name", step.get("name"));
                payload.set("layout", step.get("layout"));
            }
            case "CREATE_STATE" -> {
                payload.put("context_id", context).put("state_id", "state." + id).set("owner_ref", option.at("/normalized_endpoints/0/target_ref"));
                payload.set("capability_ref", option.get("capability_ref")); payload.set("name_or_value", step.get("name"));
                payload.set("state_roles", step.has("state_roles") ? step.get("state_roles") : JSON.createArrayNode());
                String role = option.at("/normalized_endpoints/0/target_ref/target_kind").asText().equals("FEATURE") ? "FEATURE_STATE_NODE" : "STATE_NODE";
                payload.putObject("occurrence").put("ownership", "OWNED").put("construct_role", role);
                if (step.has("layout")) payload.set("layout", step.get("layout"));
                else {
                    String ownerId = option.at("/normalized_endpoints/0/target_ref/target_id").asText();
                    var owner = revision.occurrences().stream().filter(item -> item.contextId().equals(context) && item.targetId().equals(ownerId)).findFirst().orElseThrow();
                    var layout = revision.layouts().stream().filter(item -> item.id().equals(owner.layoutId())).findFirst().orElseThrow();
                    double y = layout.y() + 28;
                    for (var state : revision.states()) if (state.ownerElementId().equals(ownerId)) for (var occurrence : revision.occurrences())
                        if (occurrence.contextId().equals(context) && occurrence.targetId().equals(state.id())) {
                            var bounds = revision.layouts().stream().filter(item -> item.id().equals(occurrence.layoutId())).findFirst().orElseThrow();
                            y = Math.max(y, bounds.y() + bounds.height() + 8);
                        }
                    payload.putObject("layout").put("x", layout.x() + 8).put("y", y).put("width", 88).put("height", 28);
                }
            }
            case "CREATE_FACT" -> {
                String capability = option.at("/capability_ref/capability_id").asText();
                payload.put("context_id", context).put("fact_id", "fact." + id).set("capability_ref", option.get("capability_ref"));
                payload.put("fact_family", family(capability)); payload.set("normalized_endpoints", option.get("normalized_endpoints"));
                payload.put("direction", capability.startsWith("CAP-ISO-STRUCT-") ? "UNDIRECTED" : "DIRECTED");
                for (String name : List.of("labels", "modifiers", "logical_groups")) payload.putArray(name);
                payload.putObject("occurrence").put("ownership", "OWNED").put("construct_role", capability.startsWith("CAP-ISO-STRUCT-") ? "STRUCTURAL_LINK" : "PROCEDURAL_LINK");
                payload.putObject("layout");
            }
            case "UPDATE_PROPERTY" -> {
                var endpoint = option.at("/normalized_endpoints/0/target_ref");
                payload.putObject("target_ref").set("target_kind", endpoint.get("target_kind"));
                ((ObjectNode) payload.get("target_ref")).set("target_id", endpoint.get("target_id"));
                payload.put("property_name", "name").set("value", step.get("name"));
            }
            case "UPDATE_STATE" -> {
                String target = option.at("/normalized_endpoints/0/target_ref/target_id").asText();
                var state = revision.states().stream().filter(item -> item.id().equals(target)).findFirst().orElseThrow();
                payload.put("state_id", target); payload.putObject("expected_owner_ref").put("target_kind", state.ownerTargetKind().name()).put("target_id", state.ownerElementId());
                var changes = payload.putObject("changes"); changes.set("name_or_value", step.get("name"));
                if (step.has("state_roles")) changes.set("state_roles", step.get("state_roles"));
            }
            case "UPDATE_LAYOUT" -> { payload.set("occurrence_id", scope.get("selection_id")); payload.set("layout", step.get("layout")); }
            default -> throw new DraftWorkspaceService.Failure("DRAFT_EDIT_REJECTED", "COMMAND_NOT_IMPLEMENTED");
        }
        return payload;
    }
    private static String family(String capability) {
        if (capability.startsWith("CAP-ISO-STRUCT-")) return "STRUCTURAL";
        return switch (capability) {
            case "CAP-ISO-PROC-001", "CAP-ISO-PROC-002", "CAP-ISO-PROC-003", "CAP-ISO-PROC-006", "CAP-ISO-PROC-007", "CAP-ISO-PROC-008", "CAP-ISO-PROC-009", "CAP-ISO-PROC-010" -> "TRANSFORMATION";
            case "CAP-ISO-PROC-004", "CAP-ISO-PROC-005", "CAP-ISO-PROC-011", "CAP-ISO-PROC-012" -> "ENABLING";
            default -> "PROFILE_FACT";
        };
    }
    private static String generatedId(String plan, String key) {
        try { return "plan." + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((plan + "/" + key).getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
    private static void remapIdentities(JsonNode node, Map<String, String> identities) {
        if (node.isObject()) {
            var object = (ObjectNode) node;
            object.properties().forEach(entry -> {
                var value = entry.getValue();
                if (value.isTextual() && identities.containsKey(value.asText())) object.put(entry.getKey(), identities.get(value.asText()));
                else remapIdentities(value, identities);
            });
        } else if (node.isArray()) {
            var array = (com.fasterxml.jackson.databind.node.ArrayNode) node;
            for (int i = 0; i < array.size(); i++) {
                var value = array.get(i);
                if (value.isTextual() && identities.containsKey(value.asText())) array.set(i, JSON.getNodeFactory().textNode(identities.get(value.asText())));
                else remapIdentities(value, identities);
            }
        }
    }
    private static void require(boolean allowed) { if (!allowed) throw new DraftWorkspaceService.Failure("DRAFT_EDIT_REJECTED", "ENDPOINT_KIND_MISMATCH"); }
}
