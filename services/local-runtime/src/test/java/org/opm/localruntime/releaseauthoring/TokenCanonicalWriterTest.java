package org.opm.localruntime.releaseauthoring;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class TokenCanonicalWriterTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private final TokenCanonicalWriter writer = new TokenCanonicalWriter();

    @Test
    void matchesEveryFrozenPositiveVector() throws Exception {
        JsonNode catalog = readCatalog();
        for (JsonNode vector : catalog.required("positive_vectors")) {
            List<Map<String, ?>> tokens = tokens(vector.required("input_tokens"));
            assertEquals(value(vector.required("expected_preimage")), writer.preimageFromRaw(vector.required("input_revision_id").asText(), tokens), vector.required("vector_id").asText());
            assertEquals(vector.required("expected_canonical_utf8_hex").asText(), java.util.HexFormat.of().formatHex(
                    writer.canonicalBytesFromRaw(vector.required("input_revision_id").asText(), tokens)), vector.required("vector_id").asText());
            assertEquals(vector.required("expected_token_sha256").asText(), writer.sha256FromRaw(
                    vector.required("input_revision_id").asText(), tokens), vector.required("vector_id").asText());
        }
    }

    @Test
    void matchesEveryFrozenNegativeVector() throws Exception {
        JsonNode catalog = readCatalog();
        for (JsonNode vector : catalog.required("negative_vectors")) {
            JsonNode base = positive(catalog, vector.required("base_positive_vector_id").asText());
            List<Map<String, ?>> tokens = tokens(base.required("input_tokens"));
            applyMutation(tokens, vector.required("mutation"));
            TokenCanonicalWriter.TokenCanonicalException exception = assertThrows(TokenCanonicalWriter.TokenCanonicalException.class,
                    () -> writer.preimageFromRaw(base.required("input_revision_id").asText(), tokens), vector.required("vector_id").asText());
            assertEquals(vector.required("expected_error_code").asText(), exception.code(), vector.required("vector_id").asText());
            assertEquals(vector.required("expected_error_pointer").asText(), exception.jsonPointer(), vector.required("vector_id").asText());
        }
    }

    private JsonNode readCatalog() throws Exception {
        return OBJECT_MAPPER.readTree(Files.readString(Path.of("../../tests/e2e/release/dev-canvas-06/fixtures/token-digest-v01-parity-vectors.json")));
    }

    private JsonNode positive(JsonNode catalog, String vectorId) {
        for (JsonNode vector : catalog.required("positive_vectors")) {
            if (vectorId.equals(vector.required("vector_id").asText())) return vector;
        }
        throw new IllegalArgumentException("Positive vector is absent: " + vectorId);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, ?>> tokens(JsonNode node) {
        return (List<Map<String, ?>>) (List<?>) value(node);
    }

    @SuppressWarnings("unchecked")
    private void applyMutation(List<Map<String, ?>> tokens, JsonNode mutation) {
        String[] segments = mutation.required("json_pointer").asText().substring(1).split("/");
        Object parent = Map.of("tokens", tokens);
        for (int index = 0; index < segments.length - 1; index++) {
            parent = parent instanceof Map<?, ?> map ? map.get(segments[index]) : ((List<Object>) parent).get(Integer.parseInt(segments[index]));
        }
        String field = segments[segments.length - 1];
        Object replacement = switch (mutation.required("value_token").asText()) {
            case "NON_NFC_E\u0301" -> "E\u0301";
            case "END_BEFORE_START" -> 0;
            case "NUMBER:9007199254740992" -> 9_007_199_254_740_992L;
            case "UNKNOWN_KIND" -> "UNKNOWN_KIND";
            default -> throw new IllegalArgumentException("Unknown mutation value.");
        };
        ((Map<String, Object>) parent).put(field, replacement);
    }

    private Object value(JsonNode node) {
        if (node.isNull()) return null;
        if (node.isBoolean()) return node.booleanValue();
        if (node.isIntegralNumber()) return node.longValue();
        if (node.isTextual()) return node.textValue();
        if (node.isArray()) {
            List<Object> result = new ArrayList<>();
            node.forEach(item -> result.add(value(item)));
            return result;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        node.fields().forEachRemaining(entry -> result.put(entry.getKey(), value(entry.getValue())));
        return result;
    }
}
