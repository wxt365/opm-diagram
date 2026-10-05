package org.opm.localruntime.api;

import org.opm.localruntime.application.ModelLifecycleService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/models/{modelId}")
class ModelLifecycleController {
    private final ModelLifecycleService service;
    ModelLifecycleController(ModelLifecycleService service) { this.service = service; }
    @PostMapping("/lifecycle")
    Map<String, Object> change(@PathVariable String projectId, @PathVariable String modelId, @RequestBody Map<String, Object> request) {
        return service.change(projectId, modelId, request);
    }
}
