package org.opm.localruntime.storage;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.releaseauthoring.ProjectionDigestV01;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/** 对原始 JSON 值生成带前置守卫的可逆增量，不经语义 DTO。 */
public final class DraftJsonDelta {
    private static final JsonMapper JSON = JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build();
    private DraftJsonDelta() { }

    public static JsonNode read(String raw) {
        try (var parser = JSON.createParser(raw)) {
            parser.nextToken(); var value = readValue(parser); require(parser.nextToken() == null);
            digest(value); return value;
        } catch (Exception exception) { throw new IllegalArgumentException("草稿 JSON 无效", exception); }
    }
    private static JsonNode readValue(JsonParser parser) throws Exception {
        require(parser.currentToken() != null);
        return switch (parser.currentToken()) {
            case START_OBJECT -> {
                var result = JSON.createObjectNode();
                while (parser.nextToken() != JsonToken.END_OBJECT) {
                    require(parser.currentToken() == JsonToken.FIELD_NAME);
                    String key = parser.currentName(); parser.nextToken(); result.set(key, readValue(parser));
                }
                yield result;
            }
            case START_ARRAY -> {
                var result = JSON.createArrayNode();
                while (parser.nextToken() != JsonToken.END_ARRAY) result.add(readValue(parser));
                yield result;
            }
            case VALUE_NUMBER_INT, VALUE_NUMBER_FLOAT -> JSON.getNodeFactory().numberNode(Double.parseDouble(parser.getText()));
            case VALUE_STRING -> JSON.getNodeFactory().textNode(parser.getText());
            case VALUE_TRUE -> JSON.getNodeFactory().booleanNode(true);
            case VALUE_FALSE -> JSON.getNodeFactory().booleanNode(false);
            case VALUE_NULL -> JSON.getNodeFactory().nullNode();
            default -> throw new IllegalArgumentException("无效 JSON 值");
        };
    }

    public static String digest(JsonNode value) {
        var preimage = JSON.createObjectNode().put("digest_version", "DraftJsonDigest/1");
        preimage.set("value", encode(value)); return Rfc8785JsonCanonicalizer.sha256(preimage);
    }
    private static JsonNode encode(JsonNode value) {
        require(value != null);
        if (value.isNumber()) return JSON.createArrayNode().add("binary64").add(ProjectionDigestV01.binary64Hex(value.doubleValue()));
        if (value.isArray()) {
            var items = JSON.createArrayNode(); value.forEach(item -> items.add(encode(item)));
            return JSON.createArrayNode().add("array").add(items);
        }
        if (value.isObject()) {
            var fields = JSON.createObjectNode(); value.fields().forEachRemaining(field -> fields.set(field.getKey(), encode(field.getValue())));
            return JSON.createArrayNode().add("object").add(fields);
        }
        require(value.isTextual() || value.isNull() || value.isBoolean()); return value.deepCopy();
    }
    private static boolean same(JsonNode left, JsonNode right) { return left == null ? right == null : right != null && digest(left).equals(digest(right)); }

    public static ObjectNode between(JsonNode before, JsonNode after) {
        require(before.isObject() && after.isObject());
        var result = JSON.createObjectNode().put("schema_id", "OPM-DRAFT-JSON-DELTA").put("schema_version", "1")
                .put("before_digest", digest(before)).put("after_digest", digest(after));
        diff(before, after, List.of(), result.putArray("operations")); return result;
    }
    private static void diff(JsonNode before, JsonNode after, List<String> path, ArrayNode operations) {
        if (same(before, after)) return;
        if (before != null && after != null && before.isObject() && after.isObject()) {
            var keys = new TreeSet<String>(); before.fieldNames().forEachRemaining(keys::add); after.fieldNames().forEachRemaining(keys::add);
            keys.forEach(key -> diff(before.get(key), after.get(key), append(path, key), operations));
        } else if (before != null && after != null && before.isArray() && after.isArray()) {
            for (int i = 0; i < Math.min(before.size(), after.size()); i++) diff(before.get(i), after.get(i), append(path, String.valueOf(i)), operations);
            for (int i = before.size() - 1; i >= after.size(); i--) diff(before.get(i), null, append(path, String.valueOf(i)), operations);
            for (int i = before.size(); i < after.size(); i++) diff(null, after.get(i), append(path, String.valueOf(i)), operations);
        } else {
            require(!path.isEmpty()); var operation = operations.addObject(); operation.set("path", JSON.valueToTree(path));
            operation.set("before", slot(before)); operation.set("after", slot(after));
        }
    }
    private static List<String> append(List<String> path, String part) { var result = new ArrayList<>(path); result.add(part); return result; }
    private static ObjectNode slot(JsonNode value) {
        var result = JSON.createObjectNode().put("present", value != null);
        if (value != null) result.set("value", value.deepCopy()); return result;
    }

    public static ObjectNode reverse(JsonNode delta) {
        validate(delta); var result = (ObjectNode) delta.deepCopy();
        result.put("before_digest", delta.get("after_digest").asText()).put("after_digest", delta.get("before_digest").asText());
        var operations = result.putArray("operations");
        for (int i = delta.get("operations").size() - 1; i >= 0; i--) {
            var old = delta.get("operations").get(i); var item = operations.addObject();
            item.set("path", old.get("path").deepCopy()); item.set("before", old.get("after").deepCopy()); item.set("after", old.get("before").deepCopy());
        }
        return result;
    }

    public static ObjectNode apply(JsonNode before, JsonNode delta) {
        validate(delta); require(before.isObject() && digest(before).equals(delta.get("before_digest").asText()));
        ObjectNode result = before.deepCopy();
        for (var operation : delta.get("operations")) {
            var path = operation.get("path"); JsonNode parent = result;
            for (int i = 0; i < path.size() - 1; i++) { parent = get(parent, path.get(i).asText()); require(parent != null); }
            String key = path.get(path.size() - 1).asText(); var old = operation.get("before"); var next = operation.get("after");
            JsonNode current = get(parent, key);
            require(old.get("present").asBoolean() == (current != null) && (!old.get("present").asBoolean() || same(current, old.get("value"))));
            if (parent.isObject()) {
                if (next.get("present").asBoolean()) ((ObjectNode) parent).set(key, next.get("value").deepCopy()); else ((ObjectNode) parent).remove(key);
            } else {
                require(parent.isArray()); int index = index(key); var array = (ArrayNode) parent;
                if (!next.get("present").asBoolean()) { require(index < array.size()); array.remove(index); }
                else if (index == array.size()) array.add(next.get("value").deepCopy());
                else { require(index < array.size()); array.set(index, next.get("value").deepCopy()); }
            }
        }
        require(digest(result).equals(delta.get("after_digest").asText())); return result;
    }
    private static JsonNode get(JsonNode parent, String key) {
        require(parent.isObject() || parent.isArray()); return parent.isObject() ? parent.get(key) : parent.get(index(key));
    }
    private static int index(String key) { require(key.matches("0|[1-9][0-9]*")); try { return Integer.parseInt(key); } catch (Exception exception) { throw new IllegalArgumentException("数组下标无效"); } }

    static void validate(JsonNode delta) {
        keys(delta, Set.of("schema_id", "schema_version", "before_digest", "after_digest", "operations"));
        require(delta.get("schema_id").isTextual() && delta.get("schema_version").isTextual()
                && delta.get("schema_id").asText().equals("OPM-DRAFT-JSON-DELTA") && delta.get("schema_version").asText().equals("1"));
        for (String key : List.of("before_digest", "after_digest")) require(delta.get(key).isTextual() && delta.get(key).asText().matches("[0-9a-f]{64}"));
        require(delta.get("operations").isArray());
        for (var operation : delta.get("operations")) {
            keys(operation, Set.of("path", "before", "after")); require(operation.get("path").isArray() && !operation.get("path").isEmpty());
            for (var part : operation.get("path")) require(part.isTextual());
            for (String key : List.of("before", "after")) {
                var slot = operation.get(key); require(slot.isObject() && slot.has("present") && slot.get("present").isBoolean());
                keys(slot, slot.get("present").asBoolean() ? Set.of("present", "value") : Set.of("present"));
            }
        }
        digest(delta);
    }
    private static void keys(JsonNode value, Set<String> expected) { require(value.isObject()); var keys = new TreeSet<String>(); value.fieldNames().forEachRemaining(keys::add); require(keys.equals(expected)); }
    private static void require(boolean value) { if (!value) throw new IllegalArgumentException("草稿增量校验失败"); }
}
