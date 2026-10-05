package org.opm.localruntime.semantic;

import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.releaseauthoring.ProjectionDigestV01;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.HexFormat;
import java.util.IdentityHashMap;
import java.util.Set;
import java.util.regex.Pattern;

/** 对原始持久内容求摘要；禁止经有损语义 DTO 或当前 Context 投影中转。 */
public final class SaveContentDigestV1 {
    private static final JsonMapper JSON = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build();
    private static final Set<String> CONTENT_KEYS = Set.copyOf(SaveContentSchemaV1.keys(SaveContentSchemaV1.definition("Content").required("properties")));
    private static final Set<String> CONTENT_KEYS_V2 = Set.copyOf(SaveContentSchemaV1.keys(SaveContentSchemaV1.definitionV2("Content").required("properties")));
    private static final Pattern GEOMETRY = Pattern.compile("^/layouts/[0-9]+/(?:x|y|width|height|route_points/[0-9]+/(?:x|y))$");
    private static final double MAX_INTEGER = 9_007_199_254_740_991d;

    private SaveContentDigestV1() { }

    public static ObjectNode read(String raw) {
        JsonNode result;
        try (var parser = JSON.createParser(raw)) {
            parser.nextToken();
            result = readValue(parser);
            if (parser.nextToken() != null) throw new IllegalArgumentException("JSON 后存在尾随输入");
        }
        catch (Exception exception) { throw new Invalid("SAVE_CONTENT_INPUT_INVALID", ""); }
        validate(result);
        return (ObjectNode) result;
    }

    private static JsonNode readValue(com.fasterxml.jackson.core.JsonParser parser) throws java.io.IOException {
        if (parser.currentToken() == null) throw new IllegalArgumentException("JSON 值缺失");
        return switch (parser.currentToken()) {
            case START_OBJECT -> {
                ObjectNode value = JSON.createObjectNode();
                while (parser.nextToken() != com.fasterxml.jackson.core.JsonToken.END_OBJECT) {
                    if (parser.currentToken() != com.fasterxml.jackson.core.JsonToken.FIELD_NAME) throw new IllegalArgumentException("JSON 对象字段无效");
                    String key = parser.currentName();
                    parser.nextToken();
                    value.set(key, readValue(parser));
                }
                yield value;
            }
            case START_ARRAY -> {
                var value = JSON.createArrayNode();
                while (parser.nextToken() != com.fasterxml.jackson.core.JsonToken.END_ARRAY) value.add(readValue(parser));
                yield value;
            }
            // 默认整数 reader 会把 -0 合并为 0；显式保留几何值需要的符号位。
            case VALUE_NUMBER_INT -> parser.getText().equals("-0") ? JSON.getNodeFactory().numberNode(-0d)
                    : JSON.getNodeFactory().numberNode(parser.getBigIntegerValue());
            case VALUE_NUMBER_FLOAT -> JSON.getNodeFactory().numberNode(parser.getDoubleValue());
            case VALUE_STRING -> JSON.getNodeFactory().textNode(parser.getText());
            case VALUE_TRUE -> JSON.getNodeFactory().booleanNode(true);
            case VALUE_FALSE -> JSON.getNodeFactory().booleanNode(false);
            case VALUE_NULL -> JSON.getNodeFactory().nullNode();
            default -> throw new IllegalArgumentException("JSON 值无效");
        };
    }

    public record Parts(ObjectNode content, ObjectNode metadata) { }

    public static Parts split(JsonNode document) {
        validate(document);
        Set<String> keys = contentKeys(document);
        ObjectNode content = JSON.createObjectNode(), metadata = JSON.createObjectNode();
        document.fields().forEachRemaining(field -> (keys.contains(field.getKey()) ? content : metadata)
                .set(field.getKey(), field.getValue().deepCopy()));
        return new Parts(content, metadata);
    }

    public static ObjectNode join(Parts parts) {
        if (parts == null || parts.content() == null || parts.metadata() == null) throw new Invalid("SAVE_CONTENT_INPUT_INVALID", "");
        Set<String> keys = v2(parts.metadata()) ? CONTENT_KEYS_V2 : CONTENT_KEYS;
        for (String key : SaveContentSchemaV1.keys(parts.content())) if (!keys.contains(key)) throw new Invalid("SAVE_CONTENT_INPUT_INVALID", SaveContentSchemaV1.child("/content", key));
        for (String key : SaveContentSchemaV1.keys(parts.metadata())) if (keys.contains(key)) throw new Invalid("SAVE_CONTENT_INPUT_INVALID", SaveContentSchemaV1.child("/metadata", key));
        // 先验证后复制，循环 JsonNode 不得引起递归复制溢出。
        ObjectNode document = JSON.createObjectNode().setAll(parts.content());
        document.setAll(parts.metadata());
        validate(document);
        return document.deepCopy();
    }

    public static ObjectNode preimage(JsonNode document) {
        ObjectNode content = split(document).content();
        for (JsonNode item : content.required("layouts")) {
            ObjectNode layout = (ObjectNode) item;
            for (String key : new String[]{"x", "y", "width", "height"}) encode(layout, key);
            for (JsonNode point : layout.path("route_points")) for (String key : new String[]{"x", "y"}) encode((ObjectNode) point, key);
        }
        normalizeIntegers(content);
        ObjectNode result = JSON.createObjectNode();
        result.put("schema_id", "OPM-SAVE-CONTENT-DIGEST");
        boolean v2 = v2(document);
        result.put("schema_version", v2 ? "2" : "1");
        result.put("float_encoding", "IEEE754_BINARY64_BE_HEX");
        result.set("content", content);
        if ("0.5".equals(document.path("schema_version").asText())) SaveContentSchemaV1.validateTrace(result, "Preimage");
        else if ("0.4".equals(document.path("schema_version").asText())) SaveContentSchemaV1.validateMethod(result, "Preimage");
        else if (v2) SaveContentSchemaV1.validateV2(result, "Preimage");
        else SaveContentSchemaV1.validate(result, "Preimage");
        return result;
    }

    public static byte[] canonicalBytes(JsonNode document) {
        var preimage = preimage(document);
        try { return Rfc8785JsonCanonicalizer.canonicalize(preimage).getBytes(StandardCharsets.UTF_8); }
        catch (RuntimeException exception) { throw new Invalid("SAVE_CONTENT_CANONICALIZATION_FAILED", ""); }
    }

    public static String sha256(JsonNode document) {
        byte[] bytes = canonicalBytes(document);
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (java.security.NoSuchAlgorithmException exception) { throw new IllegalStateException("SHA-256 不可用", exception); }
    }

    private static void encode(ObjectNode object, String key) {
        object.set(key, JSON.createObjectNode().put("$binary64", ProjectionDigestV01.binary64Hex(object.required(key).doubleValue())));
    }

    private static void normalizeIntegers(JsonNode value) {
        if (value.isObject()) for (String key : SaveContentSchemaV1.keys(value)) {
            JsonNode child = value.get(key);
            if (child.isNumber()) ((ObjectNode) value).put(key, child.longValue());
            else normalizeIntegers(child);
        } else if (value.isArray()) for (JsonNode child : value) normalizeIntegers(child);
    }

    private static void validate(JsonNode value) {
        if (value == null) throw new Invalid("SAVE_CONTENT_INPUT_INVALID", "");
        scan(value, "", Collections.newSetFromMap(new IdentityHashMap<>()));
        if ("0.5".equals(value.path("schema_version").asText())) SaveContentSchemaV1.validateTrace(value, "Document");
        else if ("0.4".equals(value.path("schema_version").asText())) SaveContentSchemaV1.validateMethod(value, "Document");
        else if ("0.3".equals(value.path("schema_version").asText())) SaveContentSchemaV1.validateV2(value, "Document");
        else SaveContentSchemaV1.validate(value, "Document");
        if (!value.get("model_id").equals(value.get("model_header").get("model_id"))) throw new Invalid("SAVE_CONTENT_INPUT_INVALID", "/model_header/model_id");
    }

    public static String version(JsonNode document) {
        validate(document);
        return v2(document) ? "SaveContentDigest/2" : "SaveContentDigest/1";
    }

    private static boolean v2(JsonNode document) { return Set.of("0.3", "0.4", "0.5").contains(document.path("schema_version").asText()); }

    private static Set<String> contentKeys(JsonNode document) {
        return v2(document) ? CONTENT_KEYS_V2 : CONTENT_KEYS;
    }

    private static void scan(JsonNode value, String pointer, Set<JsonNode> ancestors) {
        if (value.isTextual()) unicode(value.textValue(), pointer);
        else if (value.isNumber()) {
            double number = value.doubleValue();
            if (!Double.isFinite(number)) throw new Invalid("SAVE_CONTENT_NON_FINITE_FLOAT", pointer);
            if (!GEOMETRY.matcher(pointer).matches() && (Math.abs(number) > MAX_INTEGER || Math.rint(number) != number)) throw new Invalid("SAVE_CONTENT_NUMBER_DOMAIN_INVALID", pointer);
        } else if (value.isContainerNode()) {
            if (!ancestors.add(value)) throw new Invalid("SAVE_CONTENT_INPUT_INVALID", pointer);
            if (value.isArray()) for (int i = 0; i < value.size(); i++) scan(value.get(i), SaveContentSchemaV1.child(pointer, String.valueOf(i)), ancestors);
            else for (String key : SaveContentSchemaV1.keys(value)) {
                String child = SaveContentSchemaV1.child(pointer, key);
                unicode(key, child);
                scan(value.get(key), child, ancestors);
            }
            ancestors.remove(value);
        } else if (!value.isNull() && !value.isBoolean()) throw new Invalid("SAVE_CONTENT_INPUT_INVALID", pointer);
    }

    private static void unicode(String value, String pointer) {
        for (int i = 0; i < value.length(); i++) {
            char unit = value.charAt(i);
            if (Character.isHighSurrogate(unit)) {
                if (++i >= value.length() || !Character.isLowSurrogate(value.charAt(i))) throw new Invalid("SAVE_CONTENT_UNICODE_INVALID", pointer);
            } else if (Character.isLowSurrogate(unit)) throw new Invalid("SAVE_CONTENT_UNICODE_INVALID", pointer);
        }
    }

    public static final class Invalid extends IllegalArgumentException {
        private final String code;
        private final String jsonPointer;
        public Invalid(String code, String jsonPointer) { super(code + ": " + jsonPointer); this.code = code; this.jsonPointer = jsonPointer; }
        public String code() { return code; }
        public String jsonPointer() { return jsonPointer; }
    }
}
