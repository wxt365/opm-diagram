package org.opm.localruntime.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.application.CanvasNodeColorService;
import org.opm.localruntime.storage.CanvasNodeColorRepository;
import org.opm.localruntime.storage.SqliteSnapshots;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.file.Path;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CanvasNodeColorControllerTest {
    @TempDir Path temporary;
    private static final String URL = "/api/v1/canvas/node-colors";
    private final ObjectMapper json = new ObjectMapper();

    private MockMvc mvc() {
        var repository = new CanvasNodeColorRepository(org.opm.localruntime.storage.StorageStores.tools(temporary));
        return MockMvcBuilders.standaloneSetup(new CanvasNodeColorController(new CanvasNodeColorService(repository)))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new LocalWriteRequestGuard(new LocalSessionToken("test-session"))).build();
    }

    @Test void 按类型保存重启恢复及重置不影响其他类型() throws Exception {
        var mvc = mvc();
        mvc.perform(get(URL)).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
        mvc.perform(post(URL + "/object").header("X-OPM-Session", "test-session").header("Origin", "http://localhost")
                .contentType(MediaType.APPLICATION_JSON).content("{\"stroke\":\"#1976D2\",\"fill\":\"#222222\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.stroke").value("#1976d2"));
        mvc.perform(post(URL + "/process").header("X-OPM-Session", "test-session").header("Origin", "http://localhost")
                .contentType(MediaType.APPLICATION_JSON).content("{\"stroke\":\"#123456\"}")).andExpect(status().isOk());
        var reloaded = mvc();
        reloaded.perform(get(URL)).andExpect(status().isOk()).andExpect(jsonPath("$.data.object.fill").value("#222222"))
                .andExpect(jsonPath("$.data.process.stroke").value("#123456"));
        reloaded.perform(post(URL + "/object").header("X-OPM-Session", "test-session").header("Origin", "http://localhost")
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());
        var result = json.readTree(reloaded.perform(get(URL)).andReturn().getResponse().getContentAsString());
        assertTrue(result.at("/data/object").isEmpty());
        assertEquals("#123456", result.at("/data/process/stroke").asText());
        // Flyway 重复启动保持已保存设置。
        org.opm.localruntime.storage.StorageStores.tools(temporary).migrate();
        mvc().perform(get(URL)).andExpect(jsonPath("$.data.process.stroke").value("#123456"));
    }

    @Test void 无会话及非法类型字段颜色拒绝且不改变已保存设置() throws Exception {
        var mvc = mvc();
        mvc.perform(post(URL + "/object").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        for (var input : new String[]{"{\"fill\":null}", "{\"fill\":\"blue\"}", "{\"fill\":\"#123\"}", "{\"extra\":\"#123456\"}"})
            mvc.perform(post(URL + "/object").header("X-OPM-Session", "test-session").header("Origin", "http://localhost")
                    .contentType(MediaType.APPLICATION_JSON).content(input)).andExpect(status().isBadRequest());
        mvc.perform(post(URL + "/unknown").header("X-OPM-Session", "test-session").header("Origin", "http://localhost")
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
        assertTrue(json.readTree(mvc.perform(get(URL)).andReturn().getResponse().getContentAsString()).get("data").isEmpty());
    }
}
