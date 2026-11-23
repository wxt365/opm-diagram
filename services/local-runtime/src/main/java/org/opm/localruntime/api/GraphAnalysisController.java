package org.opm.localruntime.api;

import com.fasterxml.jackson.databind.JsonNode;
import org.opm.localruntime.api.generated.DraftWorkspaceContract;
import org.opm.localruntime.application.GraphAnalysisService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v2/projects/{project}/models/{model}")
public final class GraphAnalysisController {
    private final GraphAnalysisService service;
    public GraphAnalysisController(GraphAnalysisService service) { this.service = service; }

    @PostMapping(value = "/draft/graph-analysis", consumes = "application/json", produces = "application/json")
    public JsonNode draft(@PathVariable String project, @PathVariable String model, @RequestBody String raw) {
        return service.query(project, model, null, DraftWorkspaceContract.read(raw, DraftWorkspaceContract.Type.GraphAnalysisRequest));
    }

    @PostMapping(value = "/revisions/{revision}/graph-analysis", consumes = "application/json", produces = "application/json")
    public JsonNode revision(@PathVariable String project, @PathVariable String model, @PathVariable String revision, @RequestBody String raw) {
        return service.query(project, model, revision, DraftWorkspaceContract.read(raw, DraftWorkspaceContract.Type.GraphAnalysisRevisionRequest));
    }
}
