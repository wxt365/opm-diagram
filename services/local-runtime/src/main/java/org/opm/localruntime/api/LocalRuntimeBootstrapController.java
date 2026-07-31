package org.opm.localruntime.api;

import jakarta.servlet.http.HttpServletRequest;
import org.opm.localruntime.application.LocalApiService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.Set;

@RestController
class LocalRuntimeBootstrapController {

    private static final Set<String> ALLOWED_HOSTS = Set.of("127.0.0.1", "localhost");
    private final LocalSessionToken sessionToken;
    private final LocalApiService localApiService;

    LocalRuntimeBootstrapController(LocalSessionToken sessionToken, LocalApiService localApiService) {
        this.sessionToken = sessionToken;
        this.localApiService = localApiService;
    }

    @GetMapping(value = "/opm-bootstrap.js", produces = "application/javascript")
    ResponseEntity<String> bootstrap(HttpServletRequest request) {
        if (!ALLOWED_HOSTS.contains(request.getServerName())) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .contentType(MediaType.valueOf("application/javascript"))
                .body(bootstrapBody());
    }

    private String bootstrapBody() {
        Map<String, String> binding = localApiService.activeProfileRuleBinding();
        return "window.__OPM_LOCAL_SESSION__ = " + javascriptString(sessionToken.value()) + ";"
                + "window.__OPM_ACTIVE_PROFILE_BINDING__ = {profile_id: " + javascriptString(binding.get("profile_id"))
                + ", profile_version: " + javascriptString(binding.get("profile_version"))
                + ", rule_set_id: " + javascriptString(binding.get("rule_set_id"))
                + ", rule_version: " + javascriptString(binding.get("rule_version")) + "};";
    }

    private String javascriptString(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}
