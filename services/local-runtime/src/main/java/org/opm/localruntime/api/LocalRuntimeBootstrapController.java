package org.opm.localruntime.api;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Set;

@RestController
class LocalRuntimeBootstrapController {

    private static final Set<String> ALLOWED_HOSTS = Set.of("127.0.0.1", "localhost");
    private final LocalSessionToken sessionToken;

    LocalRuntimeBootstrapController(LocalSessionToken sessionToken) {
        this.sessionToken = sessionToken;
    }

    @GetMapping(value = "/opm-bootstrap.js", produces = "application/javascript")
    ResponseEntity<String> bootstrap(HttpServletRequest request) {
        if (!ALLOWED_HOSTS.contains(request.getServerName())) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .contentType(MediaType.valueOf("application/javascript"))
                .body("window.__OPM_LOCAL_SESSION__ = " + javascriptString(sessionToken.value()) + ";");
    }

    private String javascriptString(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}
