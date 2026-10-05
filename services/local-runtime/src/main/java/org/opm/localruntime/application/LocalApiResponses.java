package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.api.ApiErrorCode;
import java.time.Instant;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Map;
import java.util.LinkedHashMap;
import static org.opm.localruntime.application.RuntimeActiveBindingProvider.*;
import static org.opm.localruntime.application.SemanticEditValues.*;
import static org.opm.localruntime.application.SemanticViewSupport.*;

/** 无状态的响应装配与绑定校验，保持历史 API 的字段和错误兼容。 */
final class LocalApiResponses {
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private LocalApiResponses() { }
    static Map<String, Object> queryResult(String requestId, String revision, String profile, String rule, String freshness, Object data, boolean page) {
        Map<String, Object> meta = new LinkedHashMap<>(); meta.put("request_id", requestId); meta.put("read_revision", revision); meta.put("profile_version", profile); meta.put("rule_version", rule); meta.put("freshness", freshness); meta.put("generated_at", Instant.now().toString()); if (page) { Map<String, Object> pageInfo = new LinkedHashMap<>(); pageInfo.put("next_cursor", null); pageInfo.put("has_more", false); meta.put("page_info", pageInfo); }
        return Map.of("meta", meta, "data", data);
    }

    static Map<String, Object> commandResult(String requestId, String commandId, String status, String revision, String autosave, Object data) {
        Map<String, Object> meta = new LinkedHashMap<>(); meta.put("request_id", requestId); meta.put("command_id", commandId); meta.put("status", status); meta.put("committed_revision", revision); meta.put("autosave_state", autosave); meta.put("projection_state", Map.of("opd", "current", "text", "current", "validation", "current")); return Map.of("meta", meta, "data", data);
    }

    static void validateBinding(Map<String, Object> binding) { if (!PROFILE_ID.equals(required(binding, "profile_id")) || !PROFILE_VERSION.equals(required(binding, "profile_version")) || !RULE_ID.equals(required(binding, "rule_set_id")) || !RULE_VERSION.equals(required(binding, "rule_version"))) throw new ApiException(ApiErrorCode.RULE_VERSION_CONFLICT, 409, false, "Profile 或 Rule 版本不匹配"); }
    static ApiException persistence(Exception exception) { return new ApiException(ApiErrorCode.PERSISTENCE_FAILED, 500, true, "本地持久化失败"); }
    static String requestDigest(Map<String, Object> request) { try { return digest(objectMapper.writeValueAsString(request)); } catch (Exception exception) { throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "请求无法序列化"); } }

    static Map<String, Object> model(ResultSet result) throws SQLException { return Map.of("model_id", result.getString(1), "project_id", result.getString(2), "name", result.getString(3), "head_revision", result.getString(4), "profile_id", result.getString(5), "profile_version", result.getString(6), "rule_version", result.getString(7), "access_mode", "EDITABLE_DRAFT"); }
}
