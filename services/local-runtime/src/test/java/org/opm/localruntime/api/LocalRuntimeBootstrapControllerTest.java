package org.opm.localruntime.api;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LocalRuntimeBootstrapControllerTest {

    @Test
    void returnsTheInMemorySessionOnlyToLoopbackBootstrapRequests() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new LocalRuntimeBootstrapController(new LocalSessionToken("session-test-value"))).build();

        mvc.perform(get("/opm-bootstrap.js"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/javascript"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(content().string("window.__OPM_LOCAL_SESSION__ = \"session-test-value\";"));
        mvc.perform(get("/opm-bootstrap.js").with(request -> { request.setServerName("example.test"); return request; }))
                .andExpect(status().isForbidden());
    }
}
