package org.opm.localruntime.api;

import org.opm.localruntime.api.generated.DraftSaveContract;
import org.opm.localruntime.api.generated.DraftSaveContract.*;
import org.opm.localruntime.application.DraftSaveService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v2/projects/{project}/models/{model}/draft")
public final class DraftSaveController {
    private final DraftSaveService service;
    public DraftSaveController(DraftSaveService service) { this.service = service; }
    @PostMapping(value = "/save", consumes = "application/json", produces = "application/json")
    public SaveResult save(@PathVariable String project, @PathVariable String model, @RequestBody String raw) throws com.fasterxml.jackson.core.JsonProcessingException {
        return service.save(project, model, DraftSaveContract.read(raw, SaveRequest.class));
    }
    @PostMapping(value = "/pin", consumes = "application/json", produces = "application/json")
    public PinResult pin(@PathVariable String project, @PathVariable String model, @RequestBody String raw) throws com.fasterxml.jackson.core.JsonProcessingException {
        return service.pin(project, model, DraftSaveContract.read(raw, PinRequest.class));
    }
    @GetMapping(value = "/save-state", produces = "application/json")
    public SaveState state(@PathVariable String project, @PathVariable String model) { return service.state(project, model); }
}
