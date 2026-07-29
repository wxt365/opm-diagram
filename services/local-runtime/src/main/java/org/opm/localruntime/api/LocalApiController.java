package org.opm.localruntime.api;

import org.opm.localruntime.application.LocalApiService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
class LocalApiController {

    private final LocalApiService service;

    LocalApiController(LocalApiService service) {
        this.service = service;
    }

    @GetMapping("/projects")
    Map<String, Object> listProjects(@RequestParam("request_id") String requestId, @RequestParam(required = false) String query) {
        return service.listProjects(requestId, query);
    }

    @PostMapping("/projects")
    ResponseEntity<Map<String, Object>> createProject(@RequestBody Map<String, Object> request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createProject(request));
    }

    @GetMapping("/projects/{projectId}")
    Map<String, Object> getProject(@PathVariable String projectId, @RequestParam("request_id") String requestId) {
        return service.getProject(requestId, projectId);
    }

    @GetMapping("/projects/{projectId}/models")
    Map<String, Object> listModels(@PathVariable String projectId, @RequestParam("request_id") String requestId) {
        return service.listModels(requestId, projectId);
    }

    @PostMapping("/projects/{projectId}/models")
    ResponseEntity<Map<String, Object>> createModel(@PathVariable String projectId, @RequestBody Map<String, Object> request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createModel(projectId, request));
    }

    @GetMapping("/projects/{projectId}/models/{modelId}/workspace-session")
    Map<String, Object> workspace(@PathVariable String projectId, @PathVariable String modelId, @RequestParam("request_id") String requestId) {
        return service.workspace(requestId, projectId, modelId);
    }

    @GetMapping("/projects/{projectId}/models/{modelId}/contexts/{contextId}/navigation")
    Map<String, Object> navigation(@PathVariable String projectId, @PathVariable String modelId, @PathVariable String contextId,
                                   @RequestParam("request_id") String requestId, @RequestParam("revision") String revision) {
        return service.navigation(requestId, projectId, modelId, contextId, revision);
    }

    @GetMapping("/projects/{projectId}/models/{modelId}/contexts/{contextId}/projection")
    Map<String, Object> projection(@PathVariable String projectId, @PathVariable String modelId, @PathVariable String contextId,
                                   @RequestParam("request_id") String requestId, @RequestParam("revision") String revision) {
        return service.projection(requestId, projectId, modelId, contextId, revision);
    }

    @GetMapping("/projects/{projectId}/models/{modelId}/contexts/{contextId}/command-capabilities")
    Map<String, Object> capabilities(@PathVariable String projectId, @PathVariable String modelId, @PathVariable String contextId,
                                     @RequestParam("request_id") String requestId, @RequestParam("revision") String revision,
                                     @RequestParam(value = "selection_id", required = false) String selectionId,
                                     @RequestParam(value = "intent", required = false) String intent,
                                     @RequestParam(value = "endpoint", required = false) List<String> endpoints) {
        return service.capabilities(requestId, projectId, modelId, revision, selectionId, intent, endpoints == null ? List.of() : endpoints);
    }

    @PostMapping("/projects/{projectId}/models/{modelId}/contexts/{contextId}/commands")
    Map<String, Object> edit(@PathVariable String projectId, @PathVariable String modelId, @PathVariable String contextId,
                             @RequestBody Map<String, Object> request) {
        return service.edit(projectId, modelId, contextId, request);
    }

    @GetMapping("/projects/{projectId}/models/{modelId}/contexts/{contextId}/text-projection")
    Map<String, Object> text(@PathVariable String projectId, @PathVariable String modelId, @PathVariable String contextId,
                             @RequestParam("request_id") String requestId, @RequestParam("revision") String revision) {
        return service.text(requestId, projectId, modelId, contextId, revision);
    }

    @PostMapping("/projects/{projectId}/models/{modelId}/validation-tasks")
    ResponseEntity<Map<String, Object>> validate(@PathVariable String projectId, @PathVariable String modelId, @RequestBody Map<String, Object> request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(service.validate(projectId, modelId, request));
    }

    @GetMapping("/projects/{projectId}/models/{modelId}/revisions")
    Map<String, Object> revisions(@PathVariable String projectId, @PathVariable String modelId, @RequestParam("request_id") String requestId) {
        return service.revisions(requestId, projectId, modelId);
    }

    @PostMapping("/projects/{projectId}/models/{modelId}/baselines")
    ResponseEntity<Map<String, Object>> baseline(@PathVariable String projectId, @PathVariable String modelId, @RequestBody Map<String, Object> request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.baseline(projectId, modelId, request));
    }

    @GetMapping("/tasks/{taskId}")
    Map<String, Object> task(@PathVariable String taskId, @RequestParam("request_id") String requestId) {
        return service.task(requestId, taskId);
    }

    @GetMapping(value = "/tasks/{taskId}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter taskEvents(@PathVariable String taskId, @RequestParam("request_id") String requestId) {
        SseEmitter emitter = new SseEmitter(0L);
        try {
            emitter.send(SseEmitter.event().name("task-progress").data(service.task(requestId, taskId)));
            emitter.complete();
        } catch (IOException exception) {
            emitter.completeWithError(exception);
        }
        return emitter;
    }
}
