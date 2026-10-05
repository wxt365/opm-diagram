package org.opm.localruntime.api;

import org.opm.localruntime.application.OpdTransferService;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/projects/{projectId}")
class OpdTransferController {
    private final OpdTransferService service;
    OpdTransferController(OpdTransferService service) { this.service = service; }
    @PostMapping("/models/{modelId}/opd-json/export")
    ObjectNode exportJson(@PathVariable String projectId, @PathVariable String modelId, @RequestBody Map<String, Object> request) {
        return service.exportJson(projectId, modelId, request);
    }
    @PostMapping("/opd-json/import")
    ResponseEntity<Map<String, Object>> importJson(@PathVariable String projectId, @RequestBody Map<String, Object> request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.importJson(projectId, request));
    }
}
