package org.opm.localruntime.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.application.*;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.storage.*;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.file.Path;
import java.time.Clock;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class OpdTransferControllerTest {
    @TempDir Path temporary;
    @Test void 本地会话防护与导出导入响应及错误边界() throws Exception {
        var factory = ProjectDatabaseFactory.journaledDrafts(temporary);
        var loader = new FileProfilePackageLoader(DraftWorkspaceTestDatabase.root().resolve("packages/profiles"));
        var domain = new LocalApiService(factory, loader); var service = new OpdTransferService(domain, factory, loader);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new OpdTransferController(service)).setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new LocalWriteRequestGuard(new LocalSessionToken("test-session"))).build();
        String project = ((Map<?, ?>) domain.createProject(Map.of("request_id", "request.project", "command_id", "command.project", "name", "迁移")).get("data")).get("project_id").toString();
        String model = ((Map<?, ?>) domain.createModel(project, Map.of("request_id", "request.model", "command_id", "command.model", "name", "模型", "binding", domain.activeProfileRuleBinding())).get("data")).get("model_id").toString();
        var snapshot = new DraftJournalRepository(factory.databasePath(project), Clock.systemUTC()).read(project, model);
        var json = new ObjectMapper(); String context = json.readTree(snapshot.documentJson()).at("/model_header/root_context_id").asText();
        String path = "/api/v1/projects/" + project + "/models/" + model + "/opd-json/export";
        var request = Map.of("request_id", "request.export", "context_id", context, "draft_token", snapshot.token()); String body = json.writeValueAsString(request);
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        var file = json.readTree(mvc.perform(post(path).header("Host", "127.0.0.1").header("Origin", "http://127.0.0.1:17850").header("X-OPM-Session", "test-session").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals("OPM-OPD-JSON", file.path("format").asText());
        var imported = Map.of("request_id", "request.import", "command_id", "command.import", "name", "恢复图", "binding", domain.activeProfileRuleBinding(), "opd_package", file);
        String importPath = "/api/v1/projects/" + project + "/opd-json/import";
        mvc.perform(post(importPath).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(imported))).andExpect(status().isForbidden());
        var result = json.readTree(mvc.perform(post(importPath).header("Host", "127.0.0.1").header("Origin", "http://127.0.0.1:17850").header("X-OPM-Session", "test-session").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(imported))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertNotEquals(model, result.at("/data/model_id").asText()); assertEquals(context, result.at("/data/context_id").asText());
        ((com.fasterxml.jackson.databind.node.ObjectNode) file).put("format_version", "99");
        mvc.perform(post(importPath).header("Host", "127.0.0.1").header("Origin", "http://127.0.0.1:17850").header("X-OPM-Session", "test-session").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(imported))).andExpect(status().isBadRequest());
    }
}
