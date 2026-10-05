package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.api.ApiErrorCode;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.storage.ModelLifecycleRepository;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.opm.localruntime.storage.ProjectDatabaseOpenResult;
import org.opm.localruntime.storage.StorageAccessException;
import org.springframework.stereotype.Service;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import static org.opm.localruntime.application.SemanticEditValues.*;

@Service
public final class ModelLifecycleService {
    private final ProjectDatabaseFactory databases;
    private final DraftSaveService saves;
    public ModelLifecycleService(ProjectDatabaseFactory databases, DraftSaveService saves) { this.databases = databases; this.saves = saves; }

    public Map<String, Object> change(String project, String model, Map<String, Object> request) {
        stableId(project); stableId(model);
        if (!Set.of("request_id", "command_id", "action", "expected_state", "confirmation_name").containsAll(request.keySet())) invalid("模型操作包含未知字段");
        String requestId = required(request, "request_id"), commandId = required(request, "command_id");
        stableId(requestId); stableId(commandId);
        String action = required(request, "action"), state = required(request, "expected_state");
        if (!Set.of("TRASH", "RESTORE", "PURGE").contains(action)
                || !state.equals(action.equals("TRASH") ? "ACTIVE" : "ARCHIVED")) invalid("模型操作或预期状态不合法");
        String name = optional(request, "confirmation_name");
        if (action.equals("PURGE") ? name == null || name.codePointCount(0, name.length()) > 256 : request.containsKey("confirmation_name")) invalid("永久删除需要模型名称确认");
        var path = databases.databasePath(project);
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)) throw new ApiException(ApiErrorCode.NOT_FOUND, 404, false, "项目不存在");
        if (!(databases.openForModelLifecycle(project) instanceof ProjectDatabaseOpenResult.Ready))
            throw new ApiException(ApiErrorCode.PERSISTENCE_FAILED, 503, false, "项目库需要恢复，模型操作未执行");
        try {
            var identity = new TreeMap<String, Object>(request); identity.remove("request_id"); identity.put("project_id", project); identity.put("model_id", model);
            String digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(new ObjectMapper().writeValueAsString(identity).getBytes(StandardCharsets.UTF_8)));
            var result = new ModelLifecycleRepository(path).change(project, model, commandId, digest, action, state, name);
            if (!action.equals("RESTORE") && saves != null) saves.forget(project, model);
            var meta = new LinkedHashMap<String, Object>(); meta.put("request_id", requestId); meta.put("command_id", commandId);
            meta.put("status", "COMMITTED"); meta.put("committed_revision", null); meta.put("autosave_state", "not-applicable");
            return Map.of("meta", meta, "data", result);
        } catch (ModelLifecycleRepository.Failure exception) {
            ApiErrorCode code = ApiErrorCode.valueOf(exception.code());
            throw new ApiException(code, code == ApiErrorCode.NOT_FOUND ? 404 : code == ApiErrorCode.INVALID_ARGUMENT ? 400 : 409, false, exception.getMessage());
        } catch (StorageAccessException exception) {
            throw new ApiException(ApiErrorCode.PERSISTENCE_FAILED, 503, false, "模型操作未完成，数据已回滚");
        } catch (java.security.NoSuchAlgorithmException | com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new ApiException(ApiErrorCode.PERSISTENCE_FAILED, 503, false, "无法生成模型操作标识");
        }
    }
    private static void invalid(String message) { throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, message); }
}
