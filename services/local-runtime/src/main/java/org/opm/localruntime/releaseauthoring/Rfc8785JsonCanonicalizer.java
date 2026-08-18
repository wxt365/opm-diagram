package org.opm.localruntime.releaseauthoring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.IdentityHashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/** 受限于本冻结契约 JSON 值域的 RFC 8785 JCS 序列化器。 */
public final class Rfc8785JsonCanonicalizer {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final long MIN_SAFE_INTEGER = -9_007_199_254_740_991L;
    private static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;

    private Rfc8785JsonCanonicalizer() { }

    public static String canonicalize(Object value) {
        StringBuilder output = new StringBuilder();
        append(toJsonNode(value), output);
        return output.toString();
    }

    public static String sha256(Object value) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonicalize(value).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot calculate JCS SHA-256.", exception);
        }
    }

    private static void append(JsonNode value, StringBuilder output) {
        if (value.isNull()) { output.append("null"); return; }
        if (value.isBoolean()) { output.append(value.asText()); return; }
        if (value.isIntegralNumber()) {
            long integer = value.longValue();
            if (integer < MIN_SAFE_INTEGER || integer > MAX_SAFE_INTEGER || !value.canConvertToLong()) {
                throw new IllegalArgumentException("JCS only accepts safe integers.");
            }
            output.append(value.asText());
            return;
        }
        if (value.isTextual()) { output.append(quote(value.textValue())); return; }
        if (value.isArray()) {
            output.append('[');
            for (int index = 0; index < value.size(); index++) { if (index > 0) output.append(','); append(value.get(index), output); }
            output.append(']');
            return;
        }
        if (value.isObject()) {
            List<Map.Entry<String, JsonNode>> fields = new ArrayList<>();
            Iterator<Map.Entry<String, JsonNode>> iterator = value.fields();
            iterator.forEachRemaining(fields::add);
            fields.sort(Map.Entry.comparingByKey(Comparator.naturalOrder()));
            output.append('{');
            for (int index = 0; index < fields.size(); index++) {
                if (index > 0) output.append(',');
                String key = fields.get(index).getKey();
                assertUnicodeScalars(key);
                output.append(quote(key)).append(':');
                append(fields.get(index).getValue(), output);
            }
            output.append('}');
            return;
        }
        throw new IllegalArgumentException("JCS only accepts null, boolean, integer, string, array, and object values.");
    }

    private static JsonNode toJsonNode(Object value) {
        if (value instanceof JsonNode node) return node;
        assertSupportedJavaValue(value, new IdentityHashMap<>());
        try {
            return OBJECT_MAPPER.valueToTree(value);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Cannot convert value to the frozen JCS domain.", exception);
        }
    }

    private static void assertSupportedJavaValue(Object value, IdentityHashMap<Object, Boolean> ancestors) {
        if (value == null || value instanceof Boolean) return;
        if (value instanceof String text) {
            assertUnicodeScalars(text);
            return;
        }
        if (value instanceof Byte || value instanceof Short || value instanceof Integer) return;
        if (value instanceof Long integer) {
            if (integer < MIN_SAFE_INTEGER || integer > MAX_SAFE_INTEGER) {
                throw new IllegalArgumentException("JCS only accepts safe integers.");
            }
            return;
        }
        if (value instanceof Number) {
            throw new IllegalArgumentException("JCS only accepts safe integers.");
        }
        if (value instanceof List<?> values) {
            assertAcyclic(values, ancestors);
            try {
                for (Object item : values) assertSupportedJavaValue(item, ancestors);
            } finally {
                ancestors.remove(values);
            }
            return;
        }
        if (value instanceof Object[] values) {
            assertAcyclic(values, ancestors);
            try {
                for (Object item : values) assertSupportedJavaValue(item, ancestors);
            } finally {
                ancestors.remove(values);
            }
            return;
        }
        if (value instanceof Map<?, ?> fields) {
            assertAcyclic(fields, ancestors);
            try {
                for (Map.Entry<?, ?> entry : fields.entrySet()) {
                    if (!(entry.getKey() instanceof String key)) {
                        throw new IllegalArgumentException("JCS object keys must be strings.");
                    }
                    assertUnicodeScalars(key);
                    assertSupportedJavaValue(entry.getValue(), ancestors);
                }
            } finally {
                ancestors.remove(fields);
            }
            return;
        }
        throw new IllegalArgumentException("JCS only accepts null, boolean, integer, string, array, and object values.");
    }

    private static void assertAcyclic(Object value, IdentityHashMap<Object, Boolean> ancestors) {
        if (ancestors.put(value, Boolean.TRUE) != null) {
            throw new IllegalArgumentException("JCS does not accept cyclic values.");
        }
    }

    private static String quote(String value) {
        assertUnicodeScalars(value);
        try {
            return OBJECT_MAPPER.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot JCS-escape a string.", exception);
        }
    }

    private static void assertUnicodeScalars(String value) {
        for (int index = 0; index < value.length(); index++) {
            char unit = value.charAt(index);
            if (Character.isHighSurrogate(unit)) {
                if (index + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(index + 1))) {
                    throw new IllegalArgumentException("JCS strings must not contain lone high surrogates.");
                }
                index++;
            } else if (Character.isLowSurrogate(unit)) {
                throw new IllegalArgumentException("JCS strings must not contain lone low surrogates.");
            }
        }
    }
}
