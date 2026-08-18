package org.opm.localruntime.releaseauthoring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class Rfc8785JsonCanonicalizerTest {

    @Test
    void matchesTheFrozenNodeJcsVectorForReportValues() {
        Map<String, Object> value = Map.of("z", "text", "a", java.util.Arrays.asList(true, null, 7), "nested", Map.of("b", "x", "a", 2));

        assertEquals("{\"a\":[true,null,7],\"nested\":{\"a\":2,\"b\":\"x\"},\"z\":\"text\"}", Rfc8785JsonCanonicalizer.canonicalize(value));
        assertEquals("53529bac71e82a64fa29952b0cd8c45a959992457eb453dac5b1be89c853adbc", Rfc8785JsonCanonicalizer.sha256(value));
    }

    @Test
    void matchesTheSharedNodeJavaParityVectors() throws Exception {
        String raw = Files.readString(Path.of("../../tests/e2e/release/dev-canvas-06/fixtures/common-visual-jcs-vectors.json"));
        assertTrue(raw.endsWith("\n"));
        assertFalse(raw.contains("\r"));
        JsonNode vectors = new ObjectMapper().readTree(raw);
        assertEquals(10, vectors.size());
        for (JsonNode vector : vectors) {
            JsonNode input = vector.get("input");
            assertEquals(vector.get("canonical_utf8").asText(), Rfc8785JsonCanonicalizer.canonicalize(input), vector.get("vector_id").asText());
            assertEquals(vector.get("sha256").asText(), Rfc8785JsonCanonicalizer.sha256(input), vector.get("vector_id").asText());
        }
    }

    @Test
    void rejectsValuesOutsideTheFrozenJcsDomain() {
        assertThrows(IllegalArgumentException.class, () -> Rfc8785JsonCanonicalizer.canonicalize(0.1d));
        assertThrows(IllegalArgumentException.class, () -> Rfc8785JsonCanonicalizer.canonicalize(Long.MAX_VALUE));
        assertThrows(IllegalArgumentException.class, () -> Rfc8785JsonCanonicalizer.canonicalize(BigInteger.valueOf(-9_007_199_254_740_992L)));
        assertThrows(IllegalArgumentException.class, () -> Rfc8785JsonCanonicalizer.canonicalize("\ud800"));
        assertThrows(IllegalArgumentException.class, () -> Rfc8785JsonCanonicalizer.canonicalize(Map.of("\udc00", 1)));
        Map<String, Object> circular = new LinkedHashMap<>();
        circular.put("self", circular);
        assertThrows(IllegalArgumentException.class, () -> Rfc8785JsonCanonicalizer.canonicalize(circular));
    }
}
