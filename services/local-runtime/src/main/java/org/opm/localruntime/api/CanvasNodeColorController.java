package org.opm.localruntime.api;

import org.opm.localruntime.application.CanvasNodeColorService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/canvas/node-colors")
class CanvasNodeColorController {
    private final CanvasNodeColorService service;
    CanvasNodeColorController(CanvasNodeColorService service) { this.service = service; }

    @GetMapping
    ResponseEntity<?> read() { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("data", service.read())); }

    @PostMapping("/{kind}")
    Map<String, Object> write(@PathVariable String kind, @RequestBody Map<String, Object> request) {
        return Map.of("data", service.write(kind, request));
    }
}
