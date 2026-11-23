package org.opm.localruntime.api;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Path;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "opm.security.trusted-web-origins=http://192.168.2.182:5177")
@AutoConfigureMockMvc
class TrustedWebOriginConfigurationTest {
    @TempDir static Path dataRoot;
    @Autowired MockMvc mvc;
    @Autowired LocalSessionToken session;

    @DynamicPropertySource
    static void storage(DynamicPropertyRegistry registry) {
        registry.add("opm.storage.root", () -> dataRoot.toString());
        registry.add("opm.storage.isolated-tools", () -> "true");
    }

    @Test
    void 配置装配到两版守卫并保留来源和会话检查() throws Exception {
        for (String path : new String[]{"/api/v1/projects", "/api/v2/projects/project.test/models/model.test/draft/open"}) {
            // 无业务参数的请求应到达业务校验；不创建项目或草稿。
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content("{}")
                            .header("Origin", "http://192.168.2.182:5177").header("X-OPM-Session", session.value())
                            .with(request -> { request.setServerName("127.0.0.1"); return request; }))
                    .andExpect(status().isBadRequest());
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content("{}")
                            .header("Origin", "http://192.168.2.182:5178").header("X-OPM-Session", session.value())
                            .with(request -> { request.setServerName("127.0.0.1"); return request; }))
                    .andExpect(status().isForbidden());
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content("{}")
                            .header("Origin", "http://192.168.2.182:5177").header("X-OPM-Session", "forged")
                            .with(request -> { request.setServerName("127.0.0.1"); return request; }))
                    .andExpect(status().isForbidden());
        }
    }
}
