package org.opm.localruntime.api;

import jakarta.servlet.http.HttpServletRequest;
import org.opm.localruntime.application.LocalApiService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/integration")
public final class EmbeddedWorkspaceController {
    private final LocalApiService service;
    private final LocalSessionToken session;
    private final EmbeddedAccessPolicy access;
    public EmbeddedWorkspaceController(LocalApiService service, LocalSessionToken session, EmbeddedAccessPolicy access) {
        this.service = service; this.session = session; this.access = access;
    }

    @PostMapping("/session")
    public ResponseEntity<Map<String, Object>> session(HttpServletRequest request) {
        access.authorizeSession(request);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of(
                "sessionToken", session.value(), "profileBinding", service.activeProfileRuleBinding()));
    }

    @PostMapping("/workspace")
    public Map<String, Object> workspace(@RequestBody Map<String, Object> request) {
        return service.ensureEmbeddedWorkspace(request);
    }
    @GetMapping("/model-template")
    public Object modelTemplate() { return service.embeddedModelTemplate(); }
}
