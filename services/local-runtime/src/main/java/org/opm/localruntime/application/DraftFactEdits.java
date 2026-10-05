package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.api.DraftCapabilityIdentity;
import org.opm.localruntime.semantic.*;
import org.opm.localruntime.storage.DraftJsonDelta;
import org.opm.localruntime.text.OplGenerationResult;
import org.opm.localruntime.text.TextGenerationAssets;
import java.util.*;

/** 草稿关系授权与局部正文回写；不读取旧 Revision 或数据库。 */
final class DraftFactEdits {
    private static final ObjectMapper JSON = new ObjectMapper();
    static final Set<String> TYPES = Set.of("CREATE_FACT", "UPDATE_FACT", "DELETE_CONSTRUCT");
    private DraftFactEdits() { }

    static ArrayNode options(LocalApiService domain, SemanticRevision base, JsonNode scope, JsonNode token, String query,
                             TextGenerationAssets assets, OplGenerationResult generated) {
        String type = scope.get("intent").asText(), context = scope.get("context_id").asText();
        String selection = scope.get("selection_id").isNull() ? null : scope.get("selection_id").asText();
        var result = JSON.createArrayNode(); var occurrence = occurrence(base, context, selection);
        String target = occurrence == null ? selection : occurrence.targetId();
        if (type.equals("CREATE_FACT") && selection != null) return result;
        if (type.equals("DELETE_CONSTRUCT") && (occurrence == null || !scope.get("endpoints").isEmpty())) return result;
        if (type.equals("UPDATE_FACT") && !visible(base, context, "FACT", target)) return result;
        var endpoints = new ArrayList<String>();
        for (var id : scope.get("endpoints")) {
            var selected = occurrence(base, context, id.asText()); String endpoint = selected == null ? id.asText() : selected.targetId();
            if (base.occurrences().stream().noneMatch(item -> item.contextId().equals(context) && item.targetId().equals(endpoint))) return result;
            endpoints.add(endpoint);
        }
        for (var candidate : domain.draftFactOptions(query, base, type, type.equals("DELETE_CONSTRUCT") ? selection : target, endpoints)) {
            ObjectNode option = JSON.valueToTree(candidate.toWire()); option.remove(List.of("expires_with_revision", "option_id", "impact_token"));
            option.set("expires_with_token", token);
            if (type.equals("DELETE_CONSTRUCT")) {
                var impact = (ObjectNode) option.get("impact_summary"); impact.remove("input_revision"); impact.set("input_token", token);
                enrichImpact(impact, generated);
                String capability = capability(base, occurrence.targetKind().name(), occurrence.targetId());
                String symbol = coreSymbol(capability);
                if (symbol == null) symbol = assets.capability(capability).symbolRef();
                ((ObjectNode) option.get("symbol_descriptor")).put("id", symbol);
            } else {
                String capability = candidate.capabilityId(); var binding = assets.capability(capability);
                // 移除 Control 预览复用基础关系符号，不引用虚构的 remove 符号。
                ((ObjectNode) option.get("symbol_descriptor")).put("id", binding.symbolRef());
            }
            require(assets.symbolCatalog().containsSymbol(option.at("/symbol_descriptor/id").asText()), "SYMBOL_ASSET_MISSING");
            String optionId = DraftCapabilityIdentity.option(query, option); option.put("option_id", optionId);
            if (type.equals("DELETE_CONSTRUCT")) option.put("impact_token", DraftCapabilityIdentity.impact(query, optionId, option.get("impact_summary")));
            result.add(option);
        }
        return result;
    }

    private static void enrichImpact(ObjectNode impact, OplGenerationResult generated) {
        var items = (ArrayNode) impact.get("items"); var contexts = new TreeSet<String>();
        for (var item : items) if (item.has("context_id")) contexts.add(item.get("context_id").asText());
        for (String id : contexts) items.addObject().put("kind", "CONTEXT").put("id", id).put("context_id", id).put("effect", "DIRECT");
        for (var paragraph : generated.artifact().paragraphs()) for (var sentence : paragraph.sentences())
            items.addObject().put("kind", "OPL_SENTENCE").put("id", sentence.sentenceId()).put("context_id", generated.artifact().contextId()).put("effect", "DIRECT");
        for (var trace : generated.traces()) items.addObject().put("kind", "TRACE").put("id", trace.traceId()).put("context_id", trace.contextId()).put("effect", "DIRECT");
        var sorted = new ArrayList<JsonNode>(); items.forEach(sorted::add);
        sorted.sort(Comparator.comparing((JsonNode item) -> item.get("kind").asText()).thenComparing(item -> item.get("id").asText()).thenComparing(item -> item.path("context_id").asText()));
        items.removeAll(); sorted.forEach(items::add); var counts = (ObjectNode) impact.get("counts");
        counts.put("contexts", contexts.size()); counts.put("opl_sentences", sorted.stream().filter(item -> item.get("kind").asText().equals("OPL_SENTENCE")).count());
        counts.put("traces", generated.traces().size()); counts.put("findings", 0);
    }

    static void validate(SemanticRevision base, JsonNode scope, JsonNode option, String type, JsonNode payload) {
        require(option.get("enabled").asBoolean(), "DELETE_DEPENDENCY_EXISTS");
        if (type.equals("DELETE_CONSTRUCT")) {
            require(payload.get("delete_mode").equals(option.get("delete_mode")) && payload.get("construct_kind").equals(option.at("/delete_target/kind"))
                    && payload.get("construct_id").equals(option.at("/delete_target/id")) && payload.get("impact_token").equals(option.get("impact_token")), "IMPACT_TOKEN_STALE");
            return;
        }
        String selected = option.at("/capability_ref/capability_id").asText();
        JsonNode changes = type.equals("CREATE_FACT") ? payload : payload.get("replacement");
        String baseCapability = selected; SemanticRevision.Fact fact = null;
        if (type.equals("UPDATE_FACT")) {
            String id = scope.get("selection_id").asText(); var occurrence = occurrence(base, scope.get("context_id").asText(), id);
            if (occurrence != null) id = occurrence.targetId();
            require(id.equals(payload.get("fact_id").asText()), "ENDPOINT_KIND_MISMATCH");
            String factId = id; fact = base.facts().stream().filter(item -> item.id().equals(factId)).findFirst().orElseThrow(); baseCapability = fact.capability().capabilityId();
            capabilityRef(base, payload.get("expected_capability_ref"), baseCapability);
        } else {
            capabilityRef(base, payload.get("capability_ref"), selected);
            require(payload.at("/occurrence/ownership").asText().equals("OWNED") && payload.at("/occurrence/construct_role").asText().equals(selected.startsWith("CAP-ISO-STRUCT-") ? "STRUCTURAL_LINK" : "PROCEDURAL_LINK"), "ENDPOINT_KIND_MISMATCH");
            require(!payload.get("layout").has("label_positions") && !payload.get("layout").has("junction_position"), "COMMAND_NOT_IMPLEMENTED");
        }
        require(!changes.has("condition") && (!changes.has("logical_groups") || changes.get("logical_groups").isEmpty()), "COMMAND_NOT_IMPLEMENTED");
        require(!type.equals("UPDATE_FACT") || !changes.has("logical_groups"), "COMMAND_NOT_IMPLEMENTED");
        boolean structural = baseCapability.startsWith("CAP-ISO-STRUCT-");
        if (structural) {
            require(!changes.has("modifiers") || changes.get("modifiers").isEmpty(), "MODIFIER_COMBINATION_INVALID");
            if (changes.has("direction")) for (var field : option.get("required_fields")) if (field.get("field_id").asText().equals("direction")) {
                boolean allowed = false; for (var value : field.get("allowed_values")) if (value.equals(changes.get("direction"))) allowed = true;
                require(allowed, "ENDPOINT_KIND_MISMATCH");
            }
        }
        else {
            require(!changes.has("labels") || changes.get("labels").isEmpty(), "MODIFIER_COMBINATION_INVALID");
            require(!changes.has("collection_completeness") || changes.get("collection_completeness").asText().equals("NOT_APPLICABLE"), "MODIFIER_COMBINATION_INVALID");
            require(!changes.has("direction") || changes.get("direction").asText().equals("DIRECTED"), "ENDPOINT_KIND_MISMATCH");
        }
        if (changes.has("normalized_endpoints")) validateEndpoints(base, scope.get("context_id").asText(), changes.get("normalized_endpoints"), option.get("normalized_endpoints"));
        else if (type.equals("UPDATE_FACT")) {
            // 无端点 replacement 时，不能借新 scope 悄悄改变或授权另一组端点。
            var raw = (ObjectNode) DraftJsonDelta.read(new SemanticRevisionJsonWriter().write(base));
            JsonNode current = find(raw.get("facts"), "fact_id", fact.id()).get("endpoints");
            require(sameEndpointMeaning(current, option.get("normalized_endpoints"), true), "ENDPOINT_KIND_MISMATCH");
        }
        boolean remove = option.path("group_path").toString().equals("[\"Control\",\"Remove\"]");
        if (remove) require(changes.size() == 1 && changes.has("modifiers") && changes.get("modifiers").isEmpty(), "MODIFIER_COMBINATION_INVALID");
        else if (changes.has("modifiers")) {
            var values = changes.get("modifiers"); var allowed = option.get("allowed_modifiers");
            if (fact != null && fact.modifiers().stream().anyMatch(item -> item.id().startsWith("control.")) && !selected.startsWith("CAP-ISO-CTRL-"))
                require(false, "MODIFIER_COMBINATION_INVALID");
            for (var value : values) {
                JsonNode rule = null; for (var candidate : allowed) if (candidate.get("modifier_id").equals(value.get("modifier_id"))) rule = candidate;
                require(rule != null, "MODIFIER_COMBINATION_INVALID");
                if (!rule.get("value_options").isEmpty()) { boolean found = false; for (var v : rule.get("value_options")) if (v.equals(value.get("value"))) found = true; require(found, "MODIFIER_COMBINATION_INVALID"); }
            }
            for (var rule : allowed) { long count = 0; for (var value : values) if (rule.get("modifier_id").equals(value.get("modifier_id"))) count++;
                require(count >= rule.get("min_occurs").asLong() && count <= rule.get("max_occurs").asLong(), "MODIFIER_COMBINATION_INVALID"); }
        } else require(!selected.startsWith("CAP-ISO-CTRL-"), "MODIFIER_COMBINATION_INVALID");
    }

    private static void capabilityRef(SemanticRevision base, JsonNode ref, String capability) {
        require(ref.get("capability_id").asText().equals(capability) && (!ref.has("version") || ref.get("version").asText().equals(base.profileBinding().profile().version())), "ENDPOINT_KIND_MISMATCH");
    }
    private static void validateEndpoints(SemanticRevision base, String context, JsonNode supplied, JsonNode normalized) {
        require(supplied.size() == normalized.size(), "ENDPOINT_KIND_MISMATCH");
        for (int i = 0; i < supplied.size(); i++) {
            var item = supplied.get(i); var expected = normalized.get(i); var ref = item.get("target_ref");
            require(item.get("role").equals(expected.get("role")) && item.get("ordinal").asLong() == expected.get("ordinal").asLong()
                    && ref.get("target_kind").equals(expected.at("/target_ref/target_kind")) && ref.get("target_id").equals(expected.at("/target_ref/target_id"))
                    && Objects.equals(item.get("state_qualification"), expected.get("state_qualification")), "ENDPOINT_KIND_MISMATCH");
            if (ref.has("occurrence_id")) { var occurrence = occurrence(base, context, ref.get("occurrence_id").asText());
                require(occurrence != null && occurrence.targetId().equals(ref.get("target_id").asText()) && occurrence.targetKind().name().equals(ref.get("target_kind").asText()), "ENDPOINT_KIND_MISMATCH"); }
        }
    }

    static List<String> apply(ObjectNode document, SemanticRevision after, String type, JsonNode payload) {
        var next = (ObjectNode) DraftJsonDelta.read(new SemanticRevisionJsonWriter().write(after)); var affected = new ArrayList<String>();
        if (type.equals("UPDATE_FACT")) {
            String id = payload.get("fact_id").asText(); var fact = find(document.get("facts"), "fact_id", id); var changed = find(next.get("facts"), "fact_id", id);
            var changes = payload.get("replacement");
            if (changes.has("normalized_endpoints") && !sameEndpointMeaning(fact.get("endpoints"), changed.get("endpoints"), false)) {
                var endpoints = (ArrayNode) changed.get("endpoints"); var old = fact.get("endpoints");
                for (int i = 0; i < Math.min(old.size(), endpoints.size()); i++)
                    if (sameEndpointMeaning(JSON.createArrayNode().add(old.get(i)), JSON.createArrayNode().add(endpoints.get(i)), false)) endpoints.set(i, old.get(i));
                fact.set("endpoints", endpoints);
            }
            for (String field : List.of("direction", "modifiers", "labels", "collection_completeness")) if (changes.has(field)) {
                JsonNode value = changed.get(field);
                if (value != null && !(value.isArray() && value.isEmpty() && !fact.has(field))
                        && !(field.equals("collection_completeness") && value.asText().equals("NOT_APPLICABLE") && !fact.has(field))) fact.set(field, value);
            }
            affected.add(id); return affected;
        }
        for (var entry : Map.of("elements", "element_id", "features", "feature_id", "states", "state_id", "facts", "fact_id", "occurrences", "occurrence_id", "layouts", "layout_id").entrySet())
            sync(document, next, entry.getKey(), entry.getValue(), affected);
        for (var element : document.get("elements")) for (String field : List.of("feature_ids", "state_ids")) {
            JsonNode value = find(next.get("elements"), "element_id", element.get("element_id").asText()).get(field);
            if (!element.path(field).equals(value) && (element.has(field) || !value.isEmpty())) ((ObjectNode) element).set(field, value);
        }
        for (var context : document.get("contexts")) {
            JsonNode value = find(next.get("contexts"), "context_id", context.get("context_id").asText()).get("occurrence_ids");
            if (!context.get("occurrence_ids").equals(value)) ((ObjectNode) context).set("occurrence_ids", value);
        }
        if (type.equals("CREATE_FACT")) {
            var layout = (ObjectNode) document.get("layouts").get(document.get("layouts").size() - 1);
            if (payload.get("layout").has("route_points")) layout.set("route_points", payload.at("/layout/route_points"));
        } else if (document.has("state_presentations")) {
            var presentations = (ArrayNode) document.get("state_presentations"); var ids = ids(document.get("states"), "state_id");
            for (int i = presentations.size() - 1; i >= 0; i--) if (!ids.contains(presentations.get(i).get("state_id").asText())) presentations.remove(i);
        }
        return affected;
    }
    private static boolean sameEndpointMeaning(JsonNode left, JsonNode right, boolean wire) {
        if (left.size() != right.size()) return false;
        for (int i = 0; i < left.size(); i++) {
            var a = left.get(i); var b = right.get(i); JsonNode target = wire ? b.get("target_ref") : b;
            if (!a.get("role").equals(b.get("role")) || a.get("ordinal").asLong() != b.get("ordinal").asLong()
                    || !a.get("target_id").equals(target.get("target_id")) || !a.get("target_kind").equals(target.get("target_kind"))
                    || !Objects.equals(a.get("state_qualification_id"), b.get(wire ? "state_qualification" : "state_qualification_id"))) return false;
        }
        return true;
    }
    private static void sync(ObjectNode document, ObjectNode next, String collection, String key, List<String> affected) {
        var array = (ArrayNode) document.get(collection); var wanted = ids(next.get(collection), key); var old = ids(array, key);
        for (int i = array.size() - 1; i >= 0; i--) if (!wanted.contains(array.get(i).get(key).asText())) { affected.add(array.get(i).get(key).asText()); array.remove(i); }
        for (var item : next.get(collection)) if (!old.contains(item.get(key).asText())) { array.add(item.deepCopy()); affected.add(item.get(key).asText()); }
    }
    private static Set<String> ids(JsonNode array, String key) { var ids = new HashSet<String>(); for (var item : array) ids.add(item.get(key).asText()); return ids; }
    private static ObjectNode find(JsonNode array, String key, String id) { for (var item : array) if (item.get(key).asText().equals(id)) return (ObjectNode) item; throw new IllegalStateException("目标不存在：" + id); }
    private static SemanticRevision.Occurrence occurrence(SemanticRevision base, String context, String id) { return base.occurrences().stream().filter(item -> item.contextId().equals(context) && item.id().equals(id)).findFirst().orElse(null); }
    private static boolean visible(SemanticRevision base, String context, String kind, String id) { return base.occurrences().stream().anyMatch(item -> item.contextId().equals(context) && item.targetKind().name().equals(kind) && item.targetId().equals(id)); }
    private static String capability(SemanticRevision base, String kind, String id) {
        return switch (kind) { case "ELEMENT" -> base.elements().stream().filter(item -> item.id().equals(id)).findFirst().orElseThrow().capability().capabilityId();
            case "FEATURE" -> base.features().stream().filter(item -> item.id().equals(id)).findFirst().orElseThrow().capability().capabilityId();
            case "STATE" -> base.states().stream().filter(item -> item.id().equals(id)).findFirst().orElseThrow().capability().capabilityId();
            default -> base.facts().stream().filter(item -> item.id().equals(id)).findFirst().orElseThrow().capability().capabilityId(); };
    }
    private static String coreSymbol(String capability) { return switch (capability) {
        case "CAP-OBJECT-001" -> "symbol.object.basic"; case "CAP-PROCESS-001" -> "symbol.process.basic"; case "CAP-STATE-001" -> "symbol.state.basic";
        case "CAP-FEAT-ATTRIBUTE-001" -> "symbol.feature.attribute"; case "CAP-FEAT-OPERATION-001" -> "symbol.feature.operation"; case "CAP-FEAT-STATE-001" -> "symbol.feature.state"; default -> null; }; }
    private static void require(boolean condition, String reason) { if (!condition) throw new DraftWorkspaceService.Failure("DRAFT_EDIT_REJECTED", reason); }
}
