package org.opm.localruntime.releaseauthoring;

import org.opm.localruntime.text.OplToken;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** DEV-CANVAS-06 Token Digest 0.1 的唯一 Java preimage owner。 */
public final class TokenCanonicalWriter {

    public static final String SCHEMA_ID = "OPM-DEV-CANVAS-06-TOKEN-DIGEST-PREIMAGE-001";
    public static final String SCHEMA_VERSION = "0.1";

    private static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;
    private static final Set<String> TOKEN_KINDS = Set.of("ENTITY", "STATE", "RELATION_VERB", "CONTROL_KEYWORD", "LIST_SEPARATOR",
            "PUNCTUATION", "WHITESPACE", "KEYWORD", "PROCESS", "OBJECT");
    private static final Set<String> SOURCE_KINDS = Set.of("FACT", "CAPABILITY", "ENDPOINT", "ELEMENT", "FEATURE", "STATE",
            "MODIFIER", "OCCURRENCE", "TEMPLATE", "GRAMMAR", "RULE", "LEGACY");
    private static final Set<String> TOKEN_FIELDS = Set.of("token_id", "sentence_id", "ordinal", "text", "kind", "start_utf8_byte", "end_utf8_byte", "source_refs");
    private static final Set<String> SOURCE_FIELDS = Set.of("source_kind", "stable_id", "field_path", "endpoint_ordinal", "sentence_slot");

    public Map<String, Object> preimage(String revisionId, List<OplToken> tokens) {
        List<Map<String, Object>> rawTokens = new ArrayList<>();
        for (OplToken token : tokens) rawTokens.add(rawToken(token));
        return preimageFromRaw(revisionId, rawTokens);
    }

    /** 供向量和只读 verifier 使用，输入字段仍按冻结 preimage 逐项校验。 */
    public Map<String, Object> preimageFromRaw(String revisionId, List<? extends Map<String, ?>> tokens) {
        LinkedHashMap<String, Object> preimage = new LinkedHashMap<>();
        preimage.put("schema_id", SCHEMA_ID);
        preimage.put("schema_version", SCHEMA_VERSION);
        preimage.put("revision_id", requiredNfc(revisionId, "/revision_id"));
        if (tokens == null) throw invalid("TOKEN_DIGEST_ARGUMENT_INVALID", "/tokens", "tokens 必须是数组。");
        List<Map<String, Object>> validated = new ArrayList<>();
        for (int index = 0; index < tokens.size(); index++) validated.add(token(tokens.get(index), "/tokens/" + index));
        preimage.put("tokens", List.copyOf(validated));
        return Map.copyOf(preimage);
    }

    public byte[] canonicalBytes(String revisionId, List<OplToken> tokens) {
        return Rfc8785JsonCanonicalizer.canonicalize(preimage(revisionId, tokens)).getBytes(StandardCharsets.UTF_8);
    }

    public byte[] canonicalBytesFromRaw(String revisionId, List<? extends Map<String, ?>> tokens) {
        return Rfc8785JsonCanonicalizer.canonicalize(preimageFromRaw(revisionId, tokens)).getBytes(StandardCharsets.UTF_8);
    }

    public String sha256(String revisionId, List<OplToken> tokens) {
        return Rfc8785JsonCanonicalizer.sha256(preimage(revisionId, tokens));
    }

    public String sha256FromRaw(String revisionId, List<? extends Map<String, ?>> tokens) {
        return Rfc8785JsonCanonicalizer.sha256(preimageFromRaw(revisionId, tokens));
    }

    private Map<String, Object> rawToken(OplToken token) {
        if (token == null) throw invalid("TOKEN_DIGEST_ARGUMENT_INVALID", "/tokens", "Token 不得为空。");
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("token_id", token.tokenId());
        result.put("sentence_id", token.sentenceId());
        result.put("ordinal", token.ordinal());
        result.put("text", token.text());
        result.put("kind", token.kind().name());
        result.put("start_utf8_byte", token.startUtf8Byte());
        result.put("end_utf8_byte", token.endUtf8Byte());
        List<Map<String, Object>> references = new ArrayList<>();
        for (OplToken.SourceRef reference : token.sourceRefs()) {
            LinkedHashMap<String, Object> source = new LinkedHashMap<>();
            source.put("source_kind", reference.sourceKind().name());
            source.put("stable_id", reference.stableId());
            if (reference.fieldPath() != null) source.put("field_path", reference.fieldPath());
            if (reference.endpointOrdinal() != null) source.put("endpoint_ordinal", reference.endpointOrdinal());
            if (reference.sentenceSlot() != null) source.put("sentence_slot", reference.sentenceSlot());
            references.add(source);
        }
        result.put("source_refs", references);
        return result;
    }

    private Map<String, Object> token(Map<String, ?> source, String pointer) {
        exactFields(source, TOKEN_FIELDS, pointer);
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("token_id", requiredNfc(source.get("token_id"), pointer + "/token_id"));
        result.put("sentence_id", requiredNfc(source.get("sentence_id"), pointer + "/sentence_id"));
        result.put("ordinal", safeInteger(source.get("ordinal"), pointer + "/ordinal"));
        String text = requiredNfc(source.get("text"), pointer + "/text");
        result.put("text", text);
        String kind = requiredNfc(source.get("kind"), pointer + "/kind");
        if (!TOKEN_KINDS.contains(kind)) throw invalid("TOKEN_DIGEST_ENUM_INVALID", pointer + "/kind", "Token kind 不受支持。");
        result.put("kind", kind);
        long start = safeInteger(source.get("start_utf8_byte"), pointer + "/start_utf8_byte");
        long end = safeInteger(source.get("end_utf8_byte"), pointer + "/end_utf8_byte");
        if (end <= start || end - start != text.getBytes(StandardCharsets.UTF_8).length) {
            throw invalid("TOKEN_DIGEST_RANGE_INVALID", pointer + "/end_utf8_byte", "Token UTF-8 byte range 未闭合。");
        }
        result.put("start_utf8_byte", start);
        result.put("end_utf8_byte", end);
        Object references = source.get("source_refs");
        if (!(references instanceof List<?> values) || values.isEmpty()) {
            throw invalid("TOKEN_DIGEST_ARGUMENT_INVALID", pointer + "/source_refs", "source_refs 必须是非空数组。");
        }
        List<Map<String, Object>> validated = new ArrayList<>();
        for (int index = 0; index < values.size(); index++) {
            if (!(values.get(index) instanceof Map<?, ?> value)) {
                throw invalid("TOKEN_DIGEST_ARGUMENT_INVALID", pointer + "/source_refs/" + index, "SourceRef 必须是对象。");
            }
            @SuppressWarnings("unchecked") Map<String, ?> raw = (Map<String, ?>) value;
            validated.add(source(raw, pointer + "/source_refs/" + index));
        }
        result.put("source_refs", List.copyOf(validated));
        return Map.copyOf(result);
    }

    private Map<String, Object> source(Map<String, ?> value, String pointer) {
        exactFields(value, SOURCE_FIELDS, pointer);
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        String kind = requiredNfc(value.get("source_kind"), pointer + "/source_kind");
        if (!SOURCE_KINDS.contains(kind)) throw invalid("TOKEN_DIGEST_ENUM_INVALID", pointer + "/source_kind", "Source kind 不受支持。");
        result.put("source_kind", kind);
        result.put("stable_id", requiredNfc(value.get("stable_id"), pointer + "/stable_id"));
        optionalNfc(value, "field_path", pointer, result);
        if (value.containsKey("endpoint_ordinal")) result.put("endpoint_ordinal", safeInteger(value.get("endpoint_ordinal"), pointer + "/endpoint_ordinal"));
        optionalNfc(value, "sentence_slot", pointer, result);
        return Map.copyOf(result);
    }

    private void exactFields(Map<String, ?> value, Set<String> allowed, String pointer) {
        if (value == null || value.keySet().stream().anyMatch(key -> !allowed.contains(key)) || !value.keySet().containsAll(requiredFields(allowed))) {
            throw invalid("TOKEN_DIGEST_ARGUMENT_INVALID", pointer, "Token preimage 字段不符合契约。");
        }
    }

    private Set<String> requiredFields(Set<String> allowed) {
        return allowed == SOURCE_FIELDS ? Set.of("source_kind", "stable_id") : TOKEN_FIELDS;
    }

    private void optionalNfc(Map<String, ?> source, String field, String pointer, Map<String, Object> target) {
        if (source.containsKey(field)) target.put(field, requiredNfc(source.get(field), pointer + "/" + field));
    }

    private String requiredNfc(Object value, String pointer) {
        if (!(value instanceof String text) || text.isEmpty()) throw invalid("TOKEN_DIGEST_ARGUMENT_INVALID", pointer, "字符串字段不能为空。");
        if (!Normalizer.isNormalized(text, Normalizer.Form.NFC)) throw invalid("TOKEN_DIGEST_UNICODE_INVALID", pointer, "字符串必须为 NFC。");
        return text;
    }

    private long safeInteger(Object value, String pointer) {
        if (!(value instanceof Byte || value instanceof Short || value instanceof Integer || value instanceof Long)) {
            throw invalid("TOKEN_DIGEST_NUMBER_DOMAIN_INVALID", pointer, "字段必须是安全整数。");
        }
        long number = ((Number) value).longValue();
        if (number < 0 || number > MAX_SAFE_INTEGER) throw invalid("TOKEN_DIGEST_NUMBER_DOMAIN_INVALID", pointer, "字段必须是非负安全整数。");
        return number;
    }

    private TokenCanonicalException invalid(String code, String pointer, String message) {
        return new TokenCanonicalException(code, pointer, message);
    }

    public static final class TokenCanonicalException extends RuntimeException {
        private final String code;
        private final String jsonPointer;

        private TokenCanonicalException(String code, String jsonPointer, String message) {
            super(message);
            this.code = code;
            this.jsonPointer = jsonPointer;
        }

        public String code() { return code; }
        public String jsonPointer() { return jsonPointer; }
    }
}
