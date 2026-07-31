package org.opm.localruntime.api;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.application.LocalApiService;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LocalApiControllerTest {

    private static final String SESSION = "test-local-session";

    @TempDir
    Path temporaryDirectory;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        mvc = MockMvcBuilders.standaloneSetup(new LocalApiController(service))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new LocalWriteRequestGuard(new LocalSessionToken(SESSION)))
                .build();
    }

    @Test
    void coversEveryFrozenP0OperationIdThroughMvc() throws Exception {
        perform(get("/api/v1/projects").param("request_id", "request.projects.001")).andExpect(status().isOk());

        Map<String, Object> projectResult = response(perform(write(post("/api/v1/projects"), map("request_id", "request.project.001", "command_id", "command.project.001", "name", "MVC Project"))).andExpect(status().isCreated()).andReturn());
        String projectId = string(data(projectResult).get("project_id"));
        perform(get("/api/v1/projects/{projectId}", projectId).param("request_id", "request.project.get.001")).andExpect(status().isOk());
        perform(get("/api/v1/projects/{projectId}/models", projectId).param("request_id", "request.models.001")).andExpect(status().isOk());

        Map<String, Object> modelResult = response(perform(write(post("/api/v1/projects/{projectId}/models", projectId), modelRequest("request.model.001", "command.model.001"))).andExpect(status().isCreated()).andReturn());
        Map<String, Object> model = data(modelResult);
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        Map<String, Object> workspaceResult = response(perform(get("/api/v1/projects/{projectId}/models/{modelId}/workspace-session", projectId, modelId).param("request_id", "request.workspace.001")).andExpect(status().isOk()).andReturn());
        String contextId = string(data(workspaceResult).get("root_context_id"));

        perform(get("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/navigation", projectId, modelId, contextId).param("request_id", "request.navigation.001").param("revision", revision)).andExpect(status().isOk());
        perform(get("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/projection", projectId, modelId, contextId).param("request_id", "request.projection.001").param("revision", revision)).andExpect(status().isOk());
        perform(get("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/command-capabilities", projectId, modelId, contextId).param("request_id", "request.capabilities.001").param("revision", revision)).andExpect(status().isOk());

        revision = committed(response(perform(write(post("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/commands", projectId, modelId, contextId), editRequest("request.object.001", "command.object.001", revision, "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.raw.material", "name", "Raw Material")))).andExpect(status().isOk()).andReturn()));
        revision = committed(response(perform(write(post("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/commands", projectId, modelId, contextId), editRequest("request.process.001", "command.process.001", revision, "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", "element.processing", "name", "Processing")))).andExpect(status().isOk()).andReturn()));
        revision = committed(response(perform(write(post("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/commands", projectId, modelId, contextId), editRequest("request.fact.001", "command.fact.001", revision, "CREATE_FACT", map("kind", "CONSUMPTION", "object_id", "element.raw.material", "process_id", "element.processing")))).andExpect(status().isOk()).andReturn()));

        perform(get("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/text-projection", projectId, modelId, contextId).param("request_id", "request.text.001").param("revision", revision)).andExpect(status().isOk());
        Map<String, Object> validation = response(perform(write(post("/api/v1/projects/{projectId}/models/{modelId}/validation-tasks", projectId, modelId), validationRequest("request.validation.001", "command.validation.001", revision))).andExpect(status().isAccepted()).andReturn());
        String taskId = string(data(validation).get("task_id"));
        perform(get("/api/v1/projects/{projectId}/models/{modelId}/revisions", projectId, modelId).param("request_id", "request.revisions.001")).andExpect(status().isOk());

        String token = "evidence." + digest(taskId + revision).substring(0, 32);
        perform(write(post("/api/v1/projects/{projectId}/models/{modelId}/baselines", projectId, modelId), baselineRequest("request.baseline.001", "command.baseline.001", revision, token))).andExpect(status().isCreated());
        perform(get("/api/v1/tasks/{taskId}", taskId).param("request_id", "request.task.001")).andExpect(status().isOk());
        perform(get("/api/v1/tasks/{taskId}/events", taskId).param("request_id", "request.events.001")).andExpect(status().isOk());
    }

    @Test
    void rejectsWriteWithoutTheLocalSessionToken() throws Exception {
        for (String path : java.util.List.of(
                "/api/v1/projects",
                "/api/v1/projects/project.test/models",
                "/api/v1/projects/project.test/models/model.test/contexts/context.test/commands",
                "/api/v1/projects/project.test/models/model.test/validation-tasks",
                "/api/v1/projects/project.test/models/model.test/baselines")) {
            mvc.perform(post(path).header("Origin", "http://localhost").contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(post("/api/v1/projects").header("X-OPM-Session", SESSION).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/projects").header("Origin", "http://localhost").header("X-OPM-Session", SESSION).contentType(MediaType.APPLICATION_JSON).content("{}")
                        .with(request -> { request.setServerName("example.test"); return request; }))
                .andExpect(status().isForbidden());
    }

    private MockHttpServletRequestBuilder write(MockHttpServletRequestBuilder request, Map<String, Object> body) throws Exception {
        return request.header("Origin", "http://localhost").header("X-OPM-Session", SESSION).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body));
    }

    private ResultActions perform(MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request);
    }

    private Map<String, Object> modelRequest(String requestId, String commandId) { return map("request_id", requestId, "command_id", commandId, "name", "MVC Model", "binding", binding()); }
    private Map<String, Object> validationRequest(String requestId, String commandId, String revision) { return map("request_id", requestId, "command_id", commandId, "input_revision", revision, "binding", binding(), "scope", "FULL"); }
    private Map<String, Object> baselineRequest(String requestId, String commandId, String revision, String token) { return map("request_id", requestId, "command_id", commandId, "base_revision", revision, "binding", binding(), "name", "MVC Baseline", "evidence_summary_token", token); }
    private Map<String, Object> editRequest(String requestId, String commandId, String revision, String type, Map<String, Object> payload) { return map("request_id", requestId, "command_id", commandId, "base_revision", revision, "binding", binding(), "command_type", type, "payload", payload); }
    private Map<String, Object> binding() { return map("profile_id", "profile.iso19450.2024.draft", "profile_version", "0.2.0", "rule_set_id", "rules.iso19450.2024.draft", "rule_version", "0.1.0"); }
    private Map<String, Object> map(Object... pairs) { Map<String, Object> result = new LinkedHashMap<>(); for (int index = 0; index < pairs.length; index += 2) result.put((String) pairs[index], pairs[index + 1]); return result; }
    @SuppressWarnings("unchecked") private Map<String, Object> response(MvcResult result) throws Exception { return objectMapper.readValue(result.getResponse().getContentAsString(), new TypeReference<>() { }); }
    @SuppressWarnings("unchecked") private Map<String, Object> data(Map<String, Object> response) { return (Map<String, Object>) response.get("data"); }
    @SuppressWarnings("unchecked") private String committed(Map<String, Object> response) { return string(((Map<String, Object>) response.get("meta")).get("committed_revision")); }
    private String string(Object value) { return value == null ? null : value.toString(); }
    private String digest(String value) { try { byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)); StringBuilder result = new StringBuilder(bytes.length * 2); for (byte item : bytes) result.append(String.format("%02x", item)); return result.toString(); } catch (Exception exception) { throw new IllegalStateException(exception); } }
}
