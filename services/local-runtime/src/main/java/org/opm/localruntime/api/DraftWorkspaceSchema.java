package org.opm.localruntime.api;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/** 只执行生成器审计过的封闭 Schema，不是通用 JSON Schema 引擎。 */
public final class DraftWorkspaceSchema {
    private static final JsonMapper JSON = JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build();
    private static final JsonNode DEFINITIONS;
    static {
        try (var input = DraftWorkspaceSchema.class.getResourceAsStream("/draftsave/draft-workspace-v02.schema.json")) {
            if (input == null) throw new IllegalStateException("草稿协议资源缺失");
            DEFINITIONS = JSON.readTree(input).required("$defs");
        } catch (Exception exception) { throw new ExceptionInInitializerError(exception); }
    }
    private DraftWorkspaceSchema() { }

    public static final class Invalid extends IllegalArgumentException {
        public Invalid() { super("草稿协议输入无效"); }
        public String code() { return "INPUT_INVALID"; }
    }
    private static void require(boolean allowed) { if (!allowed) throw new Invalid(); }

    public static JsonNode read(String raw, String definition) {
        try (var parser = JSON.createParser(raw)) {
            parser.nextToken();
            JsonNode result = readValue(parser);
            require(parser.nextToken() == null);
            validate(result, definition);
            return result;
        } catch (Invalid exception) { throw exception; }
        catch (Exception exception) { throw new Invalid(); }
    }

    private static JsonNode readValue(JsonParser parser) throws java.io.IOException {
        require(parser.currentToken() != null);
        return switch (parser.currentToken()) {
            case START_OBJECT -> {
                var value = JSON.createObjectNode();
                while (parser.nextToken() != JsonToken.END_OBJECT) {
                    require(parser.currentToken() == JsonToken.FIELD_NAME);
                    String key = parser.currentName(); parser.nextToken(); value.set(key, readValue(parser));
                }
                yield value;
            }
            case START_ARRAY -> {
                var value = JSON.createArrayNode();
                while (parser.nextToken() != JsonToken.END_ARRAY) value.add(readValue(parser));
                yield value;
            }
            // 与浏览器 JSON number 使用相同 binary64 语义，并保留整数词法 -0。
            case VALUE_NUMBER_INT, VALUE_NUMBER_FLOAT -> JSON.getNodeFactory().numberNode(Double.parseDouble(parser.getText()));
            case VALUE_STRING -> JSON.getNodeFactory().textNode(parser.getText());
            case VALUE_TRUE -> JSON.getNodeFactory().booleanNode(true);
            case VALUE_FALSE -> JSON.getNodeFactory().booleanNode(false);
            case VALUE_NULL -> JSON.getNodeFactory().nullNode();
            default -> throw new Invalid();
        };
    }

    public static void validate(JsonNode value, String definition) {
        require(value != null && DEFINITIONS.has(definition));
        validateRule(value, DEFINITIONS.get(definition));
        // 所有数字先编码；共享 JCS 验证 Unicode scalar，避免孤立代理项进入证据。
        try { org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer.canonicalize(DraftEditRequestIdentity.encode(value)); }
        catch (RuntimeException exception) { throw new Invalid(); }
        invariant(value, definition);
    }

    private static void validateRule(JsonNode value, JsonNode rule) {
        if (rule.has("$ref")) { validateRule(value, DEFINITIONS.required(rule.get("$ref").asText().substring("#/$defs/".length()))); return; }
        for (String union : new String[]{"oneOf", "anyOf"}) if (rule.has(union)) {
            int matches = 0;
            for (var branch : rule.get(union)) {
                try { validateRule(value, branch); matches++; } catch (Invalid ignored) { /* 只统计完整通过的分支。 */ }
            }
            require(union.equals("oneOf") ? matches == 1 : matches > 0);
        }
        if (rule.has("const")) require(rule.get("const").equals(value));
        if (rule.has("enum")) {
            boolean found = false;
            for (var option : rule.get("enum")) if (option.equals(value)) found = true;
            require(found);
        }
        if (!rule.has("type")) return;
        if (rule.get("type").isArray()) {
            boolean found = false;
            for (var type : rule.get("type")) if (matches(value, type.asText())) found = true;
            require(found); return;
        }
        String type = rule.get("type").asText(); require(matches(value, type));
        switch (type) {
            case "object" -> {
                require(value.size() >= rule.path("minProperties").asInt(0));
                for (var key : rule.path("required")) require(value.has(key.asText()));
                value.fields().forEachRemaining(field -> {
                    require(rule.path("properties").has(field.getKey()));
                    validateRule(field.getValue(), rule.get("properties").get(field.getKey()));
                });
            }
            case "array" -> {
                require(value.size() >= rule.path("minItems").asInt(0) && value.size() <= rule.path("maxItems").asInt(Integer.MAX_VALUE));
                Set<JsonNode> seen = new HashSet<>();
                for (var item : value) {
                    validateRule(item, rule.required("items"));
                    if (rule.path("uniqueItems").asBoolean()) require(seen.add(item));
                }
            }
            case "string" -> {
                String text = value.textValue(); int length = text.codePointCount(0, text.length());
                require(length >= rule.path("minLength").asInt(0) && length <= rule.path("maxLength").asInt(Integer.MAX_VALUE));
                if (rule.has("pattern")) require(Pattern.compile(rule.get("pattern").asText()).matcher(text).find());
                if (rule.has("format")) {
                    require(rule.get("format").asText().equals("date-time"));
                    try { java.time.Instant.parse(text); } catch (RuntimeException exception) { throw new Invalid(); }
                }
            }
            case "integer", "number" -> {
                double number = value.doubleValue();
                if (rule.has("minimum")) require(number >= rule.get("minimum").doubleValue());
                if (rule.has("maximum")) require(number <= rule.get("maximum").doubleValue());
                if (rule.has("exclusiveMinimum")) require(number > rule.get("exclusiveMinimum").doubleValue());
            }
            default -> { /* boolean/null 由 matches 完成。 */ }
        }
    }
    private static boolean matches(JsonNode value, String type) {
        return switch (type) {
            case "object" -> value.isObject(); case "array" -> value.isArray(); case "string" -> value.isTextual();
            case "boolean" -> value.isBoolean(); case "null" -> value.isNull();
            case "number" -> value.isNumber() && Double.isFinite(value.doubleValue());
            case "integer" -> value.isNumber() && Double.isFinite(value.doubleValue()) && Math.rint(value.doubleValue()) == value.doubleValue();
            default -> throw new IllegalStateException("未支持 Schema 类型：" + type);
        };
    }
    private static boolean tokenEquals(JsonNode left, JsonNode right) {
        return left.path("draft_id").equals(right.path("draft_id")) && left.path("binding_digest").equals(right.path("binding_digest"))
                && left.path("edit_seq").doubleValue() == right.path("edit_seq").doubleValue();
    }
    private static void invariant(JsonNode value, String name) {
        if (name.equals("DraftEditRequest")) {
            var scope = value.get("scope"); var command = value.get("command"); var payload = command.get("payload");
            require(scope.get("intent").equals(command.get("command_type")));
            if (payload.has("context_id")) require(payload.get("context_id").equals(scope.get("context_id")));
            if (command.get("command_type").asText().equals("DELETE_CONSTRUCT")) require(payload.get("selection_id").equals(scope.get("selection_id")));
        }
        if (name.equals("DraftEditResult")) {
            var base = value.get("base_token"); var result = value.get("result_token");
            require(base.get("draft_id").equals(result.get("draft_id")) && base.get("binding_digest").equals(result.get("binding_digest")));
            require(value.get("status").asText().equals("UNCHANGED") ? tokenEquals(base, result)
                    : base.get("edit_seq").doubleValue() < 9007199254740991d && result.get("edit_seq").doubleValue() == base.get("edit_seq").doubleValue() + 1);
        }
        if (name.equals("SaveState")) {
            var head = value.get("durable_token");
            for (String key : new String[]{"checkpoint_token", "pending_manual_target"}) {
                var token = value.get(key);
                if (!token.isNull()) require(token.get("draft_id").equals(head.get("draft_id")) && token.get("binding_digest").equals(head.get("binding_digest"))
                        && token.get("edit_seq").doubleValue() <= head.get("edit_seq").doubleValue());
            }
            require(value.get("dirty_since").isNull() == value.get("deadline").isNull());
            if (!value.get("dirty_since").isNull()) require(java.time.Duration.between(java.time.Instant.parse(value.get("dirty_since").asText()), java.time.Instant.parse(value.get("deadline").asText())).toMillis() == 10000);
        }
        if (name.equals("OpenDraftResult")) {
            require(tokenEquals(value.get("draft_token"), value.at("/save_state/durable_token")));
            invariant(value.get("save_state"), "SaveState");
        }
        if (name.equals("DraftProjectionResult")) require(value.at("/meta/context_id").equals(value.at("/data/context_id")));
        if (name.equals("DraftFindingsResult")) {
            var items = value.at("/data/items"); var ids = new HashSet<String>();
            require(items.size() == value.at("/data/validation_summary/blocking").doubleValue());
            for (var item : items) require(ids.add(item.get("finding_id").asText()));
        }
        if (name.equals("DraftCapabilitiesResult")) {
            var meta = value.get("meta"); var data = value.get("data"); var scope = data.get("scope");
            require(scope.get("context_id").equals(meta.get("context_id")));
            var ids = new HashSet<String>();
            for (var option : data.get("options")) {
                require(tokenEquals(option.get("expires_with_token"), meta.get("draft_token"))
                        && option.get("capability_query_id").equals(data.get("capability_query_id")) && ids.add(option.get("option_id").asText())
                        && option.get("command_type").equals(scope.get("intent")));
                if (option.get("command_type").asText().equals("DELETE_CONSTRUCT")) {
                    var impact = option.get("impact_summary");
                    require(tokenEquals(impact.get("input_token"), meta.get("draft_token")) && impact.get("selected_occurrence_id").equals(scope.get("selection_id"))
                            && impact.get("delete_mode").equals(option.get("delete_mode")) && impact.get("target").equals(option.get("delete_target")));
                }
            }
        }
        if (name.equals("DraftReceiptResult") && value.get("status").asText().equals("FOUND")) {
            String operation = value.get("operation").asText(); var result = value.get("result");
            String key = switch (operation) { case "EDIT" -> "command_id"; case "SAVE" -> "save_id"; default -> "pin_id"; };
            require(Objects.equals(result.get(key), value.get("idempotency_id")));
            invariant(result, switch (operation) { case "EDIT" -> "DraftEditResult"; case "SAVE" -> "SaveResult"; default -> "PinResult"; });
        }
    }
}
