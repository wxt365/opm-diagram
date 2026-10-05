package org.opm.localruntime.semantic;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.opm.localruntime.releaseauthoring.ProjectionDigestV01;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.function.Consumer;
import static org.junit.jupiter.api.Assertions.*;

class SaveContentDigestV1Test {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static Path root() {
        Path path = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (path != null && !Files.isDirectory(path.resolve("docs/contracts/schemas"))) path = path.getParent();
        assertNotNull(path);
        return path;
    }
    private static JsonNode vectors() throws Exception {
        byte[] raw = Files.readAllBytes(root().resolve("tests/fixtures/hybrid-save/save-content-v1-vectors.json"));
        assertEquals("ebb5b0a34dde5e06ba417bc43a1c19326be14dfed82abb23eee217739afd625c", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw)));
        return JSON.readTree(raw);
    }
    private static ObjectNode input(String id) throws Exception {
        for (var vector : vectors().required("positive_vectors")) if (vector.get("id").asText().equals(id)) return (ObjectNode) materialize(vector.required("input"));
        throw new AssertionError(id);
    }
    private static JsonNode materialize(JsonNode value) {
        if (value.has("$input_binary64")) return JSON.getNodeFactory().numberNode(ByteBuffer.wrap(HexFormat.of().parseHex(value.get("$input_binary64").asText())).getDouble());
        if (value.isArray()) { ArrayNode result = JSON.createArrayNode(); value.forEach(item -> result.add(materialize(item))); return result; }
        if (value.isObject()) { ObjectNode result = JSON.createObjectNode(); value.fields().forEachRemaining(field -> result.set(field.getKey(), materialize(field.getValue()))); return result; }
        return value.deepCopy();
    }
    private static void mutate(ObjectNode input, JsonNode mutation) {
        String path = mutation.get("path").asText();
        int separator = path.lastIndexOf('/');
        ObjectNode parent = (ObjectNode) input.at(path.substring(0, separator));
        String key = path.substring(separator + 1);
        if (mutation.get("op").asText().equals("delete")) parent.remove(key);
        else parent.set(key, materialize(mutation.get("value")));
    }

    @Test
    void matchesFrozenPreimageCanonicalBytesAndShaWithoutMutatingInput() throws Exception {
        for (var vector : vectors().required("positive_vectors")) {
            var document = input(vector.get("id").asText());
            var copy = document.deepCopy();
            for (int repeat = 0; repeat < 2; repeat++) {
                assertEquals(vector.get("expected_preimage"), JSON.readTree(SaveContentDigestV1.preimage(document).toString()), vector.get("id").asText());
                assertEquals(vector.get("expected_canonical_utf8_hex").asText(), HexFormat.of().formatHex(SaveContentDigestV1.canonicalBytes(document)));
                assertEquals(vector.get("expected_sha256").asText(), SaveContentDigestV1.sha256(document));
            }
            assertEquals(copy, document);
        }
    }

    @Test
    void rejectsFrozenNegativeVectorsWithExactCodeAndPointer() throws Exception {
        for (var vector : vectors().required("negative_vectors")) {
            var document = input(vector.get("base").asText());
            mutate(document, vector.get("mutation"));
            var error = assertThrows(SaveContentDigestV1.Invalid.class, () -> SaveContentDigestV1.sha256(document), vector.get("id").asText());
            assertEquals(vector.get("expected_code").asText(), error.code(), vector.get("id").asText());
            assertEquals(vector.get("expected_pointer").asText(), error.jsonPointer(), vector.get("id").asText());
        }
    }

    @Test
    void preservesEverySourceFieldOnSplitJoinAndDoesNotAliasCaller() throws Exception {
        var catalog = vectors();
        var raw = Files.readAllBytes(root().resolve(catalog.get("source_fixture").asText()));
        assertEquals(catalog.get("source_raw_sha256").asText(), HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw)));
        for (var document : List.of(JSON.readTree(raw), input("FULL"))) assertEquals(document, SaveContentDigestV1.join(SaveContentDigestV1.split(document)));
        var document = input("FULL");
        var parts = SaveContentDigestV1.split(document);
        ((ObjectNode) parts.content().get("model_header")).put("description", "修改副本");
        assertNotEquals(document.get("model_header").get("description"), parts.content().get("model_header").get("description"));
        parts.metadata().put("model_id", document.get("model_id").asText());
        assertThrows(SaveContentDigestV1.Invalid.class, () -> SaveContentDigestV1.join(parts));
    }

    @Test
    void deduplicatesOnlyMetadataChangesAndDetectsSemanticLayoutBindingAndOrderChanges() throws Exception {
        var document = input("FULL");
        var digest = SaveContentDigestV1.sha256(document);
        var metadata = document.deepCopy();
        metadata.put("revision_id", "revision.saved").put("revision_sequence", 10).put("parent_revision_id", "revision.previous");
        ((ObjectNode) metadata.get("text_artifact")).put("artifact_id", "artifact.new");
        ((ObjectNode) metadata.get("revision_digest")).put("digest", "b".repeat(64));
        assertEquals(digest, SaveContentDigestV1.sha256(metadata));
        List<Consumer<ObjectNode>> changes = List.of(
                value -> ((ObjectNode) value.at("/model_header")).put("description", "描述已变"),
                value -> ((ObjectNode) value.at("/elements/0/name")).put("local_name", "新名称"),
                value -> ((ObjectNode) value.at("/elements/0")).put("essence", "INFORMATICAL"),
                value -> ((ObjectNode) value.at("/profile_binding/rule_set/digest")).put("digest", "b".repeat(64)),
                value -> ((ObjectNode) value.at("/layouts/0")).put("x", 0d),
                value -> ((ObjectNode) value.at("/layouts/0/route_points/0")).put("y", 1d),
                value -> { ArrayNode items = (ArrayNode) value.get("elements"); var first = items.remove(0); items.add(first); },
                value -> { ArrayNode items = (ArrayNode) value.get("contexts"); var first = items.remove(0); items.add(first); },
                value -> value.remove("features"),
                value -> ((ObjectNode) value.get("model_header")).put("name", java.text.Normalizer.normalize(value.at("/model_header/name").asText(), java.text.Normalizer.Form.NFC)));
        for (var change : changes) { var changed = document.deepCopy(); change.accept(changed); assertNotEquals(digest, SaveContentDigestV1.sha256(changed)); }
        // JSON Schema integer 的 1.0 与 1 均合法，但不得把 double 交给整数 JCS。
        var integerShape = document.deepCopy();
        ((ObjectNode) integerShape.at("/layouts/0")).put("z_order", document.at("/layouts/0/z_order").doubleValue());
        assertEquals(digest, SaveContentDigestV1.sha256(integerShape));
    }

    @Test
    void rejectsRawDuplicateTrailingAndNullAndProtectsFiniteEncoding() throws Exception {
        String raw = input("BASE").toString();
        assertEquals(SaveContentDigestV1.sha256(input("BASE")), SaveContentDigestV1.sha256(SaveContentDigestV1.read(raw)));
        for (var invalid : List.of(raw + " {}", raw.replace("\"schema_id\":", "\"schema_id\":\"duplicate\",\"schema_id\":"), "null", "{}")) {
            assertThrows(SaveContentDigestV1.Invalid.class, () -> SaveContentDigestV1.read(invalid));
        }
        assertEquals("8000000000000000", ProjectionDigestV01.binary64Hex(-0d));
        for (double invalid : new double[]{Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY}) assertThrows(IllegalArgumentException.class, () -> ProjectionDigestV01.binary64Hex(invalid));
        var cyclic = input("BASE"); cyclic.set("extra", cyclic);
        assertThrows(SaveContentDigestV1.Invalid.class, () -> SaveContentDigestV1.sha256(cyclic));
    }

    @Test
    void preservesRawNegativeZeroAndRejectsMalformedJsonWithoutFallback() throws Exception {
        var document = input("FULL");
        String raw = document.toString().replace("\"x\":-0.0", "\"x\":-0");
        assertTrue(raw.contains("\"x\":-0,"));
        assertEquals(SaveContentDigestV1.sha256(document), SaveContentDigestV1.sha256(SaveContentDigestV1.read(raw)));
        assertNotEquals(SaveContentDigestV1.sha256(document), SaveContentDigestV1.sha256(SaveContentDigestV1.read(raw.replace("\"x\":-0,", "\"x\":0,"))));
        for (String invalid : new String[]{"", "[", "{", "{\"x\":", "[1,]", "{\"x\":1,}", "{\"x\":NaN}"}) {
            var error = assertThrows(SaveContentDigestV1.Invalid.class, () -> SaveContentDigestV1.read(invalid));
            assertEquals("SAVE_CONTENT_INPUT_INVALID", error.code());
        }
    }
}
