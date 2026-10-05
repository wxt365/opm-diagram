package org.opm.localruntime.semantic;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.regex.Pattern;

/** 仅校验生成的保存内容 Schema；关键词集合由生成器封闭。 */
final class SaveContentSchemaV1 {
    private static final JsonNode SCHEMA;
    private static final JsonNode SCHEMA_V2;
    private static final JsonNode SCHEMA_METHOD;
    private static final JsonNode SCHEMA_TRACE;
    static {
        try (var input = SaveContentSchemaV1.class.getResourceAsStream("/draftsave/save-content-v1.schema.json")) {
            if (input == null) throw new IllegalStateException("保存内容 Schema 资源缺失");
            SCHEMA = new ObjectMapper().readTree(input);
        } catch (Exception exception) { throw new ExceptionInInitializerError(exception); }
        try (var input = SaveContentSchemaV1.class.getResourceAsStream("/draftsave/save-content-v2.schema.json")) {
            if (input == null) throw new IllegalStateException("新版保存内容 Schema 资源缺失");
            SCHEMA_V2 = new ObjectMapper().readTree(input);
        } catch (Exception exception) { throw new ExceptionInInitializerError(exception); }
        try (var input = SaveContentSchemaV1.class.getResourceAsStream("/draftsave/save-content-v2-method.schema.json")) {
            if (input == null) throw new IllegalStateException("方法分类保存内容 Schema 资源缺失");
            SCHEMA_METHOD = new ObjectMapper().readTree(input);
        } catch (Exception exception) { throw new ExceptionInInitializerError(exception); }
    }

    static {
        try (var input = SaveContentSchemaV1.class.getResourceAsStream("/draftsave/save-content-v2-trace.schema.json")) {
            if (input == null) throw new IllegalStateException("架构关联保存内容 Schema 资源缺失");
            SCHEMA_TRACE = new ObjectMapper().readTree(input);
        } catch (Exception exception) { throw new ExceptionInInitializerError(exception); }
    }
    static void validateTrace(JsonNode value, String definition) { validate(value, SCHEMA_TRACE.required("$defs").required(definition), "", SCHEMA_TRACE.required("$defs")); }

    private SaveContentSchemaV1() { }

    static void validateMethod(JsonNode value, String definition) { validate(value, SCHEMA_METHOD.required("$defs").required(definition), "", SCHEMA_METHOD.required("$defs")); }

    static JsonNode definition(String name) { return SCHEMA.required("$defs").required(name); }
    static List<String> keys(JsonNode value) {
        var keys = new ArrayList<String>();
        value.fieldNames().forEachRemaining(keys::add);
        keys.sort(String::compareTo);
        return keys;
    }

    static JsonNode definitionV2(String name) { return SCHEMA_V2.required("$defs").required(name); }
    static void validate(JsonNode value, String definition) { validate(value, definition(definition), "", SCHEMA.required("$defs")); }
    static void validateV2(JsonNode value, String definition) { validate(value, definitionV2(definition), "", SCHEMA_V2.required("$defs")); }

    private static void validate(JsonNode value, JsonNode rule, String pointer, JsonNode definitions) {
        if (rule.has("$ref")) { validate(value, definitions.required(rule.get("$ref").asText().substring("#/$defs/".length())), pointer, definitions); return; }
        if (rule.has("const") && !rule.get("const").equals(value)) invalid(pointer);
        if (rule.has("enum")) {
            boolean found = false;
            for (var option : rule.get("enum")) if (option.equals(value)) found = true;
            if (!found) invalid(pointer);
        }
        switch (rule.path("type").asText()) {
            case "object" -> {
                if (!value.isObject()) invalid(pointer);
                for (var key : rule.path("required")) if (!value.has(key.asText())) invalid(child(pointer, key.asText()));
                for (var key : keys(value)) {
                    var property = rule.path("properties").get(key);
                    if (property == null) invalid(child(pointer, key));
                    validate(value.get(key), property, child(pointer, key), definitions);
                }
            }
            case "array" -> {
                if (!value.isArray() || value.size() < rule.path("minItems").asInt(0)) invalid(pointer);
                for (int index = 0; index < value.size(); index++) validate(value.get(index), rule.required("items"), child(pointer, String.valueOf(index)), definitions);
                if (rule.path("uniqueItems").asBoolean()) {
                    var seen = new HashSet<JsonNode>();
                    for (var item : value) if (!seen.add(item)) invalid(pointer);
                }
            }
            case "string" -> {
                if (!value.isTextual()) invalid(pointer);
                var text = value.textValue();
                int length = text.codePointCount(0, text.length());
                if (length < rule.path("minLength").asInt(0) || length > rule.path("maxLength").asInt(Integer.MAX_VALUE)) invalid(pointer);
                if (rule.has("pattern") && !Pattern.compile(rule.get("pattern").asText()).matcher(text).find()) invalid(pointer);
            }
            case "number", "integer" -> {
                if (!value.isNumber()) invalid(pointer);
                double number = value.doubleValue();
                if (!Double.isFinite(number) || (rule.get("type").asText().equals("integer") && Math.rint(number) != number)) invalid(pointer);
                if (rule.has("minimum") && number < rule.get("minimum").doubleValue()) invalid(pointer);
                if (rule.has("maximum") && number > rule.get("maximum").doubleValue()) invalid(pointer);
                if (rule.has("exclusiveMinimum") && number <= rule.get("exclusiveMinimum").doubleValue()) invalid(pointer);
            }
            case "" -> { /* const/enum 已完成验证。 */ }
            default -> throw new IllegalStateException("未支持的保存 Schema 类型");
        }
    }

    static String child(String pointer, String key) { return pointer + "/" + key.replace("~", "~0").replace("/", "~1"); }
    private static void invalid(String pointer) { throw new SaveContentDigestV1.Invalid("SAVE_CONTENT_INPUT_INVALID", pointer); }
}
