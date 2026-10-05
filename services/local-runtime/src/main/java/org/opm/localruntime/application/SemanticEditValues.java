package org.opm.localruntime.application;

import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.api.ApiErrorCode;
import org.opm.localruntime.api.ApiException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import static org.opm.localruntime.application.RuntimeActiveBindingProvider.*;

/** 命令值解析及语义构造基础操作；不保存请求或事务状态。 */
final class SemanticEditValues {
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private SemanticEditValues() { }

    static String newId(String prefix) { return prefix + "." + UUID.randomUUID().toString().replace("-", ""); }
    static String normalized(String value) { return value.trim().toLowerCase(java.util.Locale.ROOT); }
    static String required(Map<String, Object> values, String key) { String value = optional(values, key); if (value == null) throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "缺少字段 " + key); return value; }
    static String optional(Map<String, Object> values, String key) { Object value = values.get(key); return value instanceof String text && !text.isBlank() ? text : null; }
    static String elementName(Object value) {
        if (!(value instanceof String text) || text.isBlank() || text.codePointCount(0, text.length()) > 256) {
            throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "Element 名称必须为非空白且不超过 256 个 Unicode code point");
        }
        return text;
    }
    @SuppressWarnings("unchecked") static Map<String, Object> requiredMap(Map<String, Object> values, String key) { Object value = values.get(key); if (!(value instanceof Map<?, ?>)) throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "缺少对象字段 " + key); return (Map<String, Object>) value; }
    @SuppressWarnings("unchecked") static List<Map<String, Object>> objectList(Object value, String key) {
        if (!(value instanceof List<?> values)) throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, key + " 必须是数组");
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : values) {
            if (!(item instanceof Map<?, ?>)) throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, key + " 必须仅包含对象");
            result.add((Map<String, Object>) item);
        }
        return List.copyOf(result);
    }
    @SuppressWarnings("unchecked") static Map<String, Object> map(Object value) { if (value instanceof Map<?, ?> map) return (Map<String, Object>) map; if (value instanceof String text && !text.isBlank()) try { return objectMapper.readValue(text, new TypeReference<>() { }); } catch (Exception ignored) { return Map.of(); } return Map.of(); }
    static double decimal(Object value, double fallback) { return value instanceof Number number ? number.doubleValue() : fallback; }
    static double requiredFiniteNumber(Map<String, Object> values, String key) {
        Object value = values.get(key);
        if (!(value instanceof Number number) || !Double.isFinite(number.doubleValue())) {
            throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, key + " 必须是有限数值");
        }
        return number.doubleValue();
    }
    static List<String> append(List<String> values, String value) { List<String> result = new ArrayList<>(values); result.add(value); return result; }
    static void stableId(String value) { if (!value.matches("[A-Za-z][A-Za-z0-9._:-]{2,127}")) throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "标识不合法"); }
    static String string(Object value) { return value == null ? "" : value.toString(); }
    static SemanticRevision.CapabilityReference capability(String id) { return new SemanticRevision.CapabilityReference(id, PROFILE_ID, PROFILE_VERSION); }

    static SemanticRevision.QualifiedName qualifiedName(String localName) { return new SemanticRevision.QualifiedName("urn:opm:runtime", localName); }

    static SemanticRevision.SourceProvenance source(String kind) { return new SemanticRevision.SourceProvenance(PROFILE_ID, PROFILE_VERSION, kind, "profile." + kind.toLowerCase()); }

    static SemanticRevision.Normalization core() { return new SemanticRevision.Normalization(SemanticRevision.NormalizationLevel.CORE); }

    static ApiException profileForbidden() { return new ApiException(ApiErrorCode.PROFILE_FORBIDDEN, 422, false, "当前 Profile 不支持该 P0 命令"); }

    static ApiException modifierCombinationInvalid(String message) { return new ApiException(ApiErrorCode.MODIFIER_COMBINATION_INVALID, 422, false, message); }

}
