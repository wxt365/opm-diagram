package org.opm.localruntime.api;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.application.LocalApiService;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class EmbeddedWorkspaceControllerTest {
    @TempDir Path storage;
    private final String origin = "http://192.168.1.20:3000";
    private final LocalSessionToken session = new LocalSessionToken("embedded-test-session");

    @Test void importTextFailureIncludesContextAndReasonInsteadOfAnInternalServerError() throws Exception {
        var service = org.mockito.Mockito.mock(LocalApiService.class);
        org.mockito.Mockito.when(service.ensureEmbeddedWorkspace(org.mockito.ArgumentMatchers.anyMap()))
                .thenThrow(new ApiException(ApiErrorCode.TEXT_GENERATION_BLOCKED, 422, false,
                        "子图「计算」无法生成 OPL [ENDPOINT_KIND_MISMATCH]：fact.example"));
        var mvc = MockMvcBuilders.standaloneSetup(new EmbeddedWorkspaceController(service, session,
                new EmbeddedAccessPolicy(false, "", ""))).setControllerAdvice(new ApiExceptionHandler()).build();
        mvc.perform(post("/api/v1/integration/workspace").contentType("application/json").content("{}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("TEXT_GENERATION_BLOCKED"))
                .andExpect(jsonPath("$.error.message").value(org.hamcrest.Matchers.containsString("fact.example")));
    }

    @Test void 远程JSON会话需凭证且支持预检随后使用会话创建资源() throws Exception {
        var access = new EmbeddedAccessPolicy(true, "deployment-key", origin);
        var service = new LocalApiService(ProjectDatabaseFactory.journaledDrafts(storage));
        var mvc = MockMvcBuilders.standaloneSetup(new EmbeddedWorkspaceController(service, session, access))
                .setControllerAdvice(new ApiExceptionHandler())
                .addFilters(new EmbeddedCorsConfiguration().embeddedCorsFilter(access)).build();
        mvc.perform(options("/api/v1/integration/session").header("Origin", origin)
                        .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "authorization,content-type"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", origin));
        mvc.perform(post("/api/v1/integration/session").header("Origin", origin))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/integration/session").header("Origin", origin).header("Authorization", "Bearer deployment-key"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.sessionToken").value(session.value()))
                .andExpect(jsonPath("$.profileBinding.profile_id").exists()).andExpect(header().string("Cache-Control", "no-store"));
        mvc.perform(post("/api/v1/integration/session").with(value -> { value.setServerName("opm.example.com"); return value; })
                        .header("Origin", origin).header("Authorization", "Bearer deployment-key"))
                .andExpect(status().isOk());
        mvc.perform(options("/opm/api/v1/integration/session").contextPath("/opm").header("Origin", origin)
                        .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "authorization,content-type"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", origin));
        mvc.perform(post("/api/v1/integration/session").header("Origin", "https://untrusted.test").header("Authorization", "Bearer deployment-key"))
                .andExpect(status().isForbidden());
        var guard = new LocalWriteRequestGuard(session, origin, access);
        var request = new MockHttpServletRequest("GET", "/api/v1/projects");
        request.setServerName("192.168.1.10"); request.addHeader("Origin", origin);
        assertThrows(ApiException.class, () -> guard.preHandle(request, new MockHttpServletResponse(), new Object()));
        request.addHeader("X-OPM-Session", session.value());
        assertTrue(guard.preHandle(request, new MockHttpServletResponse(), new Object()));
        request.removeHeader("Origin"); request.addHeader("Referer", origin + "/opm-workbench");
        assertTrue(guard.validate(request));
        request.setMethod("POST"); assertThrows(ApiException.class, () -> guard.validate(request));
    }

    @Test void 本机默认JSON接入与远程bootstrap防护() throws Exception {
        var local = new EmbeddedAccessPolicy(false, "", "");
        var request = new MockHttpServletRequest("POST", "/api/v1/integration/session");
        request.setServerName("127.0.0.1"); request.addHeader("Origin", "http://127.0.0.1:3000");
        assertDoesNotThrow(() -> local.authorizeSession(request));
        request.setServerName("192.168.1.10"); assertThrows(ApiException.class, () -> local.authorizeSession(request));
        assertThrows(IllegalArgumentException.class, () -> new EmbeddedAccessPolicy(true, "", origin));
        assertThrows(IllegalArgumentException.class, () -> new EmbeddedAccessPolicy(true, "key", "https://*.example.com"));
        var access = new EmbeddedAccessPolicy(true, "key", origin);
        var mvc = MockMvcBuilders.standaloneSetup(new LocalRuntimeBootstrapController(session, new LocalApiService(new ProjectDatabaseFactory(storage)), access)).build();
        mvc.perform(get("/opm-bootstrap.js").with(value -> {
            value.setServerName("127.0.0.1"); value.setRemoteAddr("192.168.1.20"); return value;
        })).andExpect(status().isForbidden());
    }
}
