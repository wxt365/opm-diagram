package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.api.ApiErrorCode;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.storage.LocalApiRepository;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

/** 宿主关联编排，复用既有创建事务和幂等记录；无数据库 schema 变化。 */
final class EmbeddedWorkspaceService {
    private final LocalCatalogService catalog;
    private final LocalApiRepository repository;
    EmbeddedWorkspaceService(LocalCatalogService catalog, LocalApiRepository repository) {
        this.catalog = catalog; this.repository = repository;
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> ensure(Map<String, Object> request, Map<String, String> profileBinding) {
        String requestId = text(request, "request_id");
        Object supplied = request.get("binding");
        String projectId, modelId;
        if (supplied instanceof Map<?, ?> binding) {
            projectId = stableId(binding, "projectId"); modelId = stableId(binding, "modelId");
        } else {
            if (supplied != null) throw invalid("binding 必须为对象");
            if (!(request.get("source") instanceof Map<?, ?> source)) throw invalid("首次进入需要 source");
            String system = source.containsKey("systemId") ? text(source, "systemId") : "default";
            String hostProject = text(source, "projectId"), hostModel = text(source, "modelId");
            String projectName = text(source, "projectName"), modelName = text(source, "modelName");
            String projectKey = key(List.of(system, hostProject)), modelKey = key(List.of(system, hostProject, hostModel));
            String projectCommand = "command.embedded.project." + projectKey;
            Map<String, Object> project = repository.findEmbeddedProject(projectCommand);
            if (project == null) project = (Map<String, Object>) catalog.createProject(Map.of(
                    "request_id", "request.embedded.project." + projectKey, "command_id", projectCommand,
                    "name", projectName, "description", "")).get("data");
            projectId = (String) project.get("project_id");
            requireActiveProject(requestId, projectId);
            String modelCommand = "command.embedded.model." + modelKey;
            Map<String, Object> model = repository.findEmbeddedModel(projectId, modelCommand);
            if (model == null) model = (Map<String, Object>) catalog.createEmbeddedModel(projectId, Map.of(
                    "request_id", "request.embedded.model." + modelKey, "command_id", modelCommand,
                    "name", availableModelName(projectId, modelName, modelKey), "binding", profileBinding), request.get("initial_document")).get("data");
            repository.rememberEmbeddedModel(projectId, modelCommand, model);
            modelId = (String) model.get("model_id");
        }
        requireActiveProject(requestId, projectId);
        List<Map<String, Object>> models = (List<Map<String, Object>>) catalog.listModels(requestId, projectId).get("data");
        String target = modelId;
        if (models.stream().noneMatch(item -> target.equals(item.get("model_id"))))
            throw new ApiException(ApiErrorCode.NOT_FOUND, 404, false, "关联模型不存在、已归档或不可打开，请检查宿主保存的关联");
        return Map.of("projectId", projectId, "modelId", modelId);
    }

    private void requireActiveProject(String request, String project) {
        Map<?, ?> item = (Map<?, ?>) catalog.getProject(request, project).get("data");
        if (!"ACTIVE".equals(item.get("archive_state")))
            throw new ApiException(ApiErrorCode.NOT_FOUND, 404, false, "关联项目已归档");
    }
    private String availableModelName(String project, String name, String identity) {
        String candidate = name;
        int attempt = 0;
        while (repository.modelNameExists(project, SemanticEditValues.normalized(candidate)))
            candidate = name + " [" + identity + "]" + (attempt++ == 0 ? "" : "." + attempt);
        return candidate;
    }
    private String stableId(Map<?, ?> value, String field) {
        String id = text(value, field);
        if (!id.matches("[A-Za-z][A-Za-z0-9._:-]{2,127}")) throw invalid(field + " 不是有效 OPM ID");
        return id;
    }
    private String text(Map<?, ?> value, String field) {
        if (!(value.get(field) instanceof String text) || text.isBlank() || text.length() > 512)
            throw invalid(field + " 必须为非空字符串且长度不超过 512");
        return text;
    }
    private String key(List<String> identity) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(
                new ObjectMapper().writeValueAsString(identity).getBytes(StandardCharsets.UTF_8))); }
        catch (Exception exception) { throw new IllegalStateException("无法计算宿主关联身份", exception); }
    }
    private ApiException invalid(String message) { return new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, message); }
}
