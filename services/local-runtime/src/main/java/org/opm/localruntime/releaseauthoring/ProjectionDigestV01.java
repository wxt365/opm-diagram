package org.opm.localruntime.releaseauthoring;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Projection Digest 0.1 的受限数据归一化与摘要计算。 */
public final class ProjectionDigestV01 {

    private static final long MIN_SAFE_INTEGER = -9_007_199_254_740_991L;
    private static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;
    private static final List<String> LAYOUT_FLOAT_FIELDS = List.of("x", "y", "width", "height");
    private static final List<String> CONSTRUCT_REQUIRED = List.of("occurrence_id", "target_id", "construct_role", "label", "layout");
    private static final List<String> CONSTRUCT_OPTIONAL = List.of(
            "source_id", "process_id", "source_occurrence_id", "target_occurrence_id", "symbol_ref", "layout_ref",
            "owner_id", "owner_target_kind", "state_roles", "explicitness", "fold_state", "capability_id", "direction",
            "endpoints", "modifiers", "labels", "collection_completeness");

    private ProjectionDigestV01() { }

    public static Map<String, Object> preimage(Map<String, Object> projectionData) {
        List<Violation> violations = new ArrayList<>();
        Map<String, Object> data = normalizeProjectionData(projectionData, "/data", violations);
        throwFirst(violations);

        Map<String, Object> preimage = new LinkedHashMap<>();
        preimage.put("schema_id", "OPM-DEV-CANVAS-06-PROJECTION-DIGEST-PREIMAGE-001");
        preimage.put("schema_version", "0.1");
        preimage.put("source_projection_contract", "API-CTX-002/0.2.0-draft");
        preimage.put("float_encoding", "IEEE754_BINARY64_BE_HEX");
        preimage.put("data", data);
        return preimage;
    }

    public static String sha256(Map<String, Object> projectionData) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonicalBytes(projectionData)));
        } catch (ProjectionDigestV01Exception exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ProjectionDigestV01Exception("PROJECTION_DIGEST_HASH_FAILED", "/", "Projection Digest SHA-256 不可用。", exception);
        }
    }

    public static byte[] canonicalBytes(Map<String, Object> projectionData) {
        try {
            return Rfc8785JsonCanonicalizer.canonicalize(preimage(projectionData)).getBytes(StandardCharsets.UTF_8);
        } catch (ProjectionDigestV01Exception exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new ProjectionDigestV01Exception("PROJECTION_DIGEST_CANONICALIZATION_FAILED", "/", "共享 JCS owner 拒绝 Projection Digest preimage。", exception);
        }
    }

    private static Map<String, Object> normalizeProjectionData(Object value, String pointer, List<Violation> violations) {
        Map<String, Object> source = object(value, pointer, List.of("context_id", "constructs"), List.of("context_id", "constructs"), violations);
        if (source == null) return Map.of();
        Map<String, Object> normalized = new LinkedHashMap<>();
        Object contextId = string(source, "context_id", pointer, true, violations);
        if (contextId != null) normalized.put("context_id", contextId);
        List<?> constructs = array(source, "constructs", pointer, violations);
        if (constructs != null) {
            List<Object> normalizedConstructs = new ArrayList<>();
            for (int index = 0; index < constructs.size(); index++) {
                normalizedConstructs.add(normalizeConstruct(constructs.get(index), pointer + "/constructs/" + index, violations));
            }
            normalized.put("constructs", normalizedConstructs);
        }
        return normalized;
    }

    private static Map<String, Object> normalizeConstruct(Object value, String pointer, List<Violation> violations) {
        List<String> allowed = new ArrayList<>(CONSTRUCT_REQUIRED);
        allowed.addAll(CONSTRUCT_OPTIONAL);
        Map<String, Object> source = object(value, pointer, allowed, CONSTRUCT_REQUIRED, violations);
        if (source == null) return Map.of();
        Map<String, Object> normalized = new LinkedHashMap<>();
        for (String key : List.of("occurrence_id", "target_id", "construct_role")) {
            Object field = string(source, key, pointer, true, violations);
            if (field != null) normalized.put(key, field);
        }
        Object label = string(source, "label", pointer, false, violations);
        if (label != null) normalized.put("label", label);
        Map<String, Object> layout = normalizeLayout(source.get("layout"), pointer + "/layout", violations);
        if (layout != null) normalized.put("layout", layout);

        for (String key : List.of("source_id", "process_id", "source_occurrence_id", "target_occurrence_id", "symbol_ref", "layout_ref", "owner_id", "capability_id")) {
            if (source.containsKey(key)) {
                Object field = string(source, key, pointer, true, violations);
                if (field != null) normalized.put(key, field);
            }
        }
        normalizeOptionalEnum(source, normalized, "owner_target_kind", List.of("ELEMENT", "FEATURE"), pointer, violations);
        normalizeOptionalEnum(source, normalized, "explicitness", List.of("EXPLICIT", "SUPPRESSED"), pointer, violations);
        normalizeOptionalEnum(source, normalized, "fold_state", List.of("UNFOLDED", "FOLDED"), pointer, violations);
        normalizeOptionalEnum(source, normalized, "direction", List.of("DIRECTED", "BIDIRECTIONAL", "UNDIRECTED", "PROFILE_DEFINED"), pointer, violations);
        normalizeOptionalEnum(source, normalized, "collection_completeness", List.of("COMPLETE", "INCOMPLETE", "NOT_APPLICABLE"), pointer, violations);
        if (source.containsKey("state_roles")) normalized.put("state_roles", normalizeStringArray(source.get("state_roles"), pointer + "/state_roles", List.of("INITIAL", "DEFAULT", "FINAL"), violations));
        if (source.containsKey("endpoints")) normalized.put("endpoints", normalizeEndpoints(source.get("endpoints"), pointer + "/endpoints", violations));
        if (source.containsKey("modifiers")) normalized.put("modifiers", normalizeStringPairs(source.get("modifiers"), pointer + "/modifiers", "modifier_id", "value", false, violations));
        if (source.containsKey("labels")) normalized.put("labels", normalizeStringPairs(source.get("labels"), pointer + "/labels", "slot_id", "text", false, violations));
        return normalized;
    }

    private static Map<String, Object> normalizeLayout(Object value, String pointer, List<Violation> violations) {
        Map<String, Object> source = object(value, pointer, concat(LAYOUT_FLOAT_FIELDS, List.of("z_order")), concat(LAYOUT_FLOAT_FIELDS, List.of("z_order")), violations);
        if (source == null) return null;
        Map<String, Object> normalized = new LinkedHashMap<>();
        for (String key : LAYOUT_FLOAT_FIELDS) {
            if (!source.containsKey(key)) continue;
            Object raw = source.get(key);
            if (!(raw instanceof Number number)) {
                issue(violations, "PROJECTION_DIGEST_SCHEMA_MISMATCH", 2, pointer + "/" + key, "布局几何值必须为 number。");
            } else {
                double valueAsDouble = number.doubleValue();
                if (!Double.isFinite(valueAsDouble)) {
                    issue(violations, "PROJECTION_DIGEST_NON_FINITE_FLOAT", 4, pointer + "/" + key, "布局几何值必须是有限 binary64。");
                } else {
                    normalized.put(key, Map.of("$binary64", binary64Hex(valueAsDouble)));
                }
            }
        }
        if (source.containsKey("z_order")) {
            Long zOrder = safeInteger(source.get("z_order"), pointer + "/z_order", violations);
            if (zOrder != null) normalized.put("z_order", zOrder);
        }
        return normalized;
    }

    private static List<Object> normalizeEndpoints(Object value, String pointer, List<Violation> violations) {
        if (!(value instanceof List<?> endpoints)) {
            issue(violations, "PROJECTION_DIGEST_SCHEMA_MISMATCH", 2, pointer, "endpoints 必须为数组。");
            return List.of();
        }
        List<Object> normalized = new ArrayList<>();
        for (int index = 0; index < endpoints.size(); index++) {
            String itemPointer = pointer + "/" + index;
            Map<String, Object> source = object(endpoints.get(index), itemPointer, List.of("role", "target_kind", "target_id", "ordinal"), List.of("role", "target_kind", "target_id", "ordinal"), violations);
            if (source == null) {
                normalized.add(Map.of());
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            for (String key : List.of("role", "target_id")) {
                Object field = string(source, key, itemPointer, true, violations);
                if (field != null) item.put(key, field);
            }
            Object targetKind = enumString(source, "target_kind", itemPointer, List.of("ELEMENT", "STATE", "FEATURE", "FACT"), violations);
            if (targetKind != null) item.put("target_kind", targetKind);
            if (source.containsKey("ordinal")) {
                Long ordinal = safeInteger(source.get("ordinal"), itemPointer + "/ordinal", violations);
                if (ordinal != null) item.put("ordinal", ordinal);
            }
            normalized.add(item);
        }
        return normalized;
    }

    private static List<Object> normalizeStringPairs(Object value, String pointer, String firstKey, String secondKey, boolean secondNonEmpty, List<Violation> violations) {
        if (!(value instanceof List<?> pairs)) {
            issue(violations, "PROJECTION_DIGEST_SCHEMA_MISMATCH", 2, pointer, "Projection 字段必须为数组。");
            return List.of();
        }
        List<Object> normalized = new ArrayList<>();
        for (int index = 0; index < pairs.size(); index++) {
            String itemPointer = pointer + "/" + index;
            Map<String, Object> source = object(pairs.get(index), itemPointer, List.of(firstKey, secondKey), List.of(firstKey, secondKey), violations);
            if (source == null) {
                normalized.add(Map.of());
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            Object first = string(source, firstKey, itemPointer, true, violations);
            Object second = string(source, secondKey, itemPointer, secondNonEmpty, violations);
            if (first != null) item.put(firstKey, first);
            if (second != null) item.put(secondKey, second);
            normalized.add(item);
        }
        return normalized;
    }

    private static List<Object> normalizeStringArray(Object value, String pointer, List<String> allowed, List<Violation> violations) {
        if (!(value instanceof List<?> values)) {
            issue(violations, "PROJECTION_DIGEST_SCHEMA_MISMATCH", 2, pointer, "Projection 字段必须为数组。");
            return List.of();
        }
        List<Object> normalized = new ArrayList<>();
        for (int index = 0; index < values.size(); index++) {
            Object valueAtIndex = values.get(index);
            String itemPointer = pointer + "/" + index;
            if (!(valueAtIndex instanceof String text) || !allowed.contains(text)) {
                issue(violations, "PROJECTION_DIGEST_SCHEMA_MISMATCH", 2, itemPointer, "Projection 枚举无效。");
                normalized.add(null);
            } else {
                unicode(text, itemPointer, violations);
                normalized.add(text);
            }
        }
        return normalized;
    }

    private static void normalizeOptionalEnum(Map<String, Object> source, Map<String, Object> normalized, String key, List<String> allowed, String pointer, List<Violation> violations) {
        if (!source.containsKey(key)) return;
        Object field = enumString(source, key, pointer, allowed, violations);
        if (field != null) normalized.put(key, field);
    }

    private static Map<String, Object> object(Object value, String pointer, List<String> allowed, List<String> required, List<Violation> violations) {
        if (!(value instanceof Map<?, ?> raw)) {
            issue(violations, "PROJECTION_DIGEST_SCHEMA_MISMATCH", 2, pointer, "Projection 对象无效。");
            return null;
        }
        Map<String, Object> source = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : raw.entrySet()) {
            if (!(entry.getKey() instanceof String key)) {
                issue(violations, "PROJECTION_DIGEST_SCHEMA_MISMATCH", 2, pointer, "Projection 对象 key 必须为 string。");
                continue;
            }
            unicode(key, pointer + "/" + escapePointer(key), violations);
            source.put(key, entry.getValue());
            if (!allowed.contains(key)) issue(violations, "PROJECTION_DIGEST_SCHEMA_MISMATCH", 2, pointer + "/" + escapePointer(key), "Projection 含有未知字段。");
        }
        for (String key : required) {
            if (!source.containsKey(key)) issue(violations, "PROJECTION_DIGEST_SCHEMA_MISMATCH", 2, pointer + "/" + key, "Projection 缺少必填字段。");
        }
        return source;
    }

    private static Object string(Map<String, Object> source, String key, String parentPointer, boolean nonEmpty, List<Violation> violations) {
        if (!source.containsKey(key)) return null;
        Object value = source.get(key);
        String pointer = parentPointer + "/" + key;
        if (!(value instanceof String text) || nonEmpty && text.isEmpty()) {
            issue(violations, "PROJECTION_DIGEST_SCHEMA_MISMATCH", 2, pointer, "Projection string 字段无效。");
            return null;
        }
        unicode(text, pointer, violations);
        return text;
    }

    private static Object enumString(Map<String, Object> source, String key, String parentPointer, List<String> allowed, List<Violation> violations) {
        Object value = string(source, key, parentPointer, true, violations);
        if (value instanceof String text && !allowed.contains(text)) issue(violations, "PROJECTION_DIGEST_SCHEMA_MISMATCH", 2, parentPointer + "/" + key, "Projection 枚举字段无效。");
        return value;
    }

    private static List<?> array(Map<String, Object> source, String key, String parentPointer, List<Violation> violations) {
        if (!source.containsKey(key)) return null;
        Object value = source.get(key);
        if (!(value instanceof List<?> values)) {
            issue(violations, "PROJECTION_DIGEST_SCHEMA_MISMATCH", 2, parentPointer + "/" + key, "Projection array 字段无效。");
            return null;
        }
        return values;
    }

    private static Long safeInteger(Object value, String pointer, List<Violation> violations) {
        if (!(value instanceof Number number)) {
            issue(violations, "PROJECTION_DIGEST_SCHEMA_MISMATCH", 2, pointer, "Projection integer 字段必须为 number。");
            return null;
        }
        double candidate = number.doubleValue();
        if (!Double.isFinite(candidate) || candidate != Math.rint(candidate) || candidate < MIN_SAFE_INTEGER || candidate > MAX_SAFE_INTEGER) {
            issue(violations, "PROJECTION_DIGEST_NUMBER_DOMAIN_INVALID", 5, pointer, "Projection integer 必须为 safe integer。");
            return null;
        }
        return (long) candidate;
    }

    private static void unicode(String value, String pointer, List<Violation> violations) {
        for (int index = 0; index < value.length(); index++) {
            char unit = value.charAt(index);
            if (Character.isHighSurrogate(unit)) {
                if (index + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(index + 1))) {
                    issue(violations, "PROJECTION_DIGEST_UNICODE_INVALID", 3, pointer, "Projection string 含有孤立高代理项。");
                    return;
                }
                index++;
            } else if (Character.isLowSurrogate(unit)) {
                issue(violations, "PROJECTION_DIGEST_UNICODE_INVALID", 3, pointer, "Projection string 含有孤立低代理项。");
                return;
            }
        }
    }

    private static String binary64Hex(double value) {
        long bits = Double.doubleToRawLongBits(value);
        byte[] bytes = ByteBuffer.allocate(Long.BYTES).order(ByteOrder.BIG_ENDIAN).putLong(bits).array();
        return HexFormat.of().formatHex(bytes);
    }

    private static void issue(List<Violation> violations, String code, int priority, String pointer, String message) {
        violations.add(new Violation(code, priority, pointer, message));
    }

    private static void throwFirst(List<Violation> violations) {
        if (violations.isEmpty()) return;
        violations.sort(Comparator.comparingInt(Violation::priority).thenComparing(violation -> violation.pointer().getBytes(java.nio.charset.StandardCharsets.UTF_8), ProjectionDigestV01::compareBytes));
        Violation first = violations.getFirst();
        throw new ProjectionDigestV01Exception(first.code(), first.pointer(), first.message());
    }

    private static int compareBytes(byte[] left, byte[] right) {
        int length = Math.min(left.length, right.length);
        for (int index = 0; index < length; index++) {
            int comparison = Byte.compareUnsigned(left[index], right[index]);
            if (comparison != 0) return comparison;
        }
        return Integer.compare(left.length, right.length);
    }

    private static List<String> concat(List<String> left, List<String> right) {
        List<String> values = new ArrayList<>(left);
        values.addAll(right);
        return values;
    }

    private static String escapePointer(String value) {
        return value.replace("~", "~0").replace("/", "~1");
    }

    public static final class ProjectionDigestV01Exception extends IllegalArgumentException {
        private final String code;
        private final String jsonPointer;

        public ProjectionDigestV01Exception(String code, String jsonPointer, String message) {
            super(message);
            this.code = code;
            this.jsonPointer = jsonPointer;
        }

        public ProjectionDigestV01Exception(String code, String jsonPointer, String message, Throwable cause) {
            super(message, cause);
            this.code = code;
            this.jsonPointer = jsonPointer;
        }

        public String code() { return code; }

        public String jsonPointer() { return jsonPointer; }
    }

    private record Violation(String code, int priority, String pointer, String message) { }
}
