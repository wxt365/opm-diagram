package org.opm.localruntime.api;

import org.junit.jupiter.api.Test;
import org.opm.localruntime.application.LocalApiService;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.file.Files;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LocalRuntimeBootstrapControllerTest {

    @Test
    void returnsTheInMemorySessionOnlyToLoopbackBootstrapRequests() throws Exception {
        var service = new LocalApiService(new ProjectDatabaseFactory(Files.createTempDirectory("opm-bootstrap-test")));
        var mvc = MockMvcBuilders.standaloneSetup(new LocalRuntimeBootstrapController(new LocalSessionToken("session-test-value"), service)).build();

        mvc.perform(get("/opm-bootstrap.js"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/javascript"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("window.__OPM_LOCAL_SESSION__ = \"session-test-value\";")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("window.__OPM_ACTIVE_PROFILE_BINDING__ = {profile_id: \"profile.iso19450.2024.draft\", profile_version: \"0.2.0\", rule_set_id: \"rules.iso19450.2024.draft\", rule_version: \"0.1.0\"};")));
        mvc.perform(get("/opm-bootstrap.js").with(request -> { request.setServerName("example.test"); return request; }))
                .andExpect(status().isForbidden());
    }
}
