package org.opm.localruntime.releaseauthoring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ProjectionDigestV01Test {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Test
    void matchesAllFrozenPositiveVectors() throws Exception {
        JsonNode vectors = readVectors();
        for (JsonNode vector : vectors.get("positive_vectors")) {
            Map<String, Object> input = inputProjection(vector.get("input_projection_data"));
            assertEquals(plainValue(vector.get("expected_preimage")), ProjectionDigestV01.preimage(input), vector.get("vector_id").asText());
            assertEquals(vector.get("expected_canonical_utf8_hex").asText(), HexFormat.of().formatHex(ProjectionDigestV01.canonicalBytes(input)), vector.get("vector_id").asText());
            assertEquals(vector.get("expected_projection_sha256").asText(), ProjectionDigestV01.sha256(input), vector.get("vector_id").asText());
        }
    }

    @Test
    void matchesAllFrozenNegativeVectors() throws Exception {
        JsonNode vectors = readVectors();
        JsonNode base = null;
        for (JsonNode vector : vectors.get("positive_vectors")) {
            if ("PDV01-FULL-ORDERED".equals(vector.get("vector_id").asText())) base = vector;
        }
        for (JsonNode vector : vectors.get("negative_vectors")) {
            Map<String, Object> input = inputProjection(base.get("input_projection_data"));
            applyMutation(input, vector.get("mutation"));
            ProjectionDigestV01.ProjectionDigestV01Exception exception = assertThrows(ProjectionDigestV01.ProjectionDigestV01Exception.class, () -> ProjectionDigestV01.preimage(input), vector.get("vector_id").asText());
            assertEquals(vector.get("expected_error_code").asText(), exception.code(), vector.get("vector_id").asText());
            assertEquals(vector.get("expected_error_pointer").asText(), exception.jsonPointer(), vector.get("vector_id").asText());
        }
    }

    private static JsonNode readVectors() throws Exception {
        String raw = Files.readString(Path.of("../../tests/e2e/release/dev-canvas-06/fixtures/projection-digest-v01-parity-vectors.json"));
        return OBJECT_MAPPER.readTree(raw);
    }

    @SuppressWarnings("unchecked")
    private static void applyMutation(Map<String, Object> projection, JsonNode mutation) {
        String[] segments = mutation.get("json_pointer").asText().substring(1).split("/");
        Object parent = projection;
        for (int index = 0; index < segments.length - 1; index++) {
            parent = parent instanceof Map<?, ?> map ? ((Map<String, Object>) map).get(segments[index]) : ((List<Object>) parent).get(Integer.parseInt(segments[index]));
        }
        String field = segments[segments.length - 1];
        String operation = mutation.get("operation").asText();
        String token = mutation.get("value_token").asText();
        if ("REMOVE_PROPERTY".equals(operation)) {
            ((Map<String, Object>) parent).remove(field);
            return;
        }
        Object value = switch (token) {
            case "NAN" -> Double.NaN;
            case "POSITIVE_INFINITY" -> Double.POSITIVE_INFINITY;
            case "NEGATIVE_INFINITY" -> Double.NEGATIVE_INFINITY;
            case "UTF16_LONE_HIGH_D800" -> "\ud800";
            default -> token.startsWith("STRING:") ? token.substring("STRING:".length()) : Double.parseDouble(token.substring("NUMBER:".length()));
        };
        ((Map<String, Object>) parent).put(field, value);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> inputProjection(JsonNode node) {
        return (Map<String, Object>) value(node, true);
    }

    private static Object plainValue(JsonNode node) {
        return value(node, false);
    }

    private static Object value(JsonNode node, boolean materializeInputBinary64) {
        if (node.isNull()) return null;
        if (node.isBoolean()) return node.booleanValue();
        if (node.isIntegralNumber()) return node.longValue();
        if (node.isFloatingPointNumber()) return node.doubleValue();
        if (node.isTextual()) return node.textValue();
        if (node.isArray()) {
            List<Object> values = new ArrayList<>();
            node.forEach(item -> values.add(value(item, materializeInputBinary64)));
            return values;
        }
        if (materializeInputBinary64 && node.size() == 1 && node.has("$input_binary64")) {
            return ByteBuffer.wrap(HexFormat.of().parseHex(node.get("$input_binary64").asText())).order(ByteOrder.BIG_ENDIAN).getDouble();
        }
        Map<String, Object> fields = new LinkedHashMap<>();
        node.fields().forEachRemaining(entry -> fields.put(entry.getKey(), value(entry.getValue(), materializeInputBinary64)));
        return fields;
    }
}
