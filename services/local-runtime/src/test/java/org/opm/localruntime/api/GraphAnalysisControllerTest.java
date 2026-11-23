package org.opm.localruntime.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.application.GraphAnalysisService;
import org.opm.localruntime.application.LocalApiService;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.storage.DraftJournalRepository;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.file.Path;
import java.time.Clock;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class GraphAnalysisControllerTest {
    @TempDir Path temporary;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String BASE = "/api/v2/projects/" + PROJECT + "/models/" + MODEL;
    private MockMvc mvc(ProjectDatabaseFactory factory) {
        var domain = new LocalApiService(factory, new FileProfilePackageLoader(root().resolve("packages/profiles")));
        return MockMvcBuilders.standaloneSetup(new GraphAnalysisController(new GraphAnalysisService(factory, domain)))
            .setControllerAdvice(new DraftWorkspaceExceptionHandler(), new ApiExceptionHandler())
            .addInterceptors(new DraftWriteRequestGuard(new LocalSessionToken("graph-test-session"))).build();
    }
    private ObjectNode input() {
        return JSON.createObjectNode().put("request_id", "request.graph.test").put("context_id", CONTEXT).put("scope", "MODEL")
            .put("include_hidden_states", false).put("include_boundary_nodes", false).put("include_state_ownership", true);
    }
    private JsonNode call(MockMvc mvc, String path, ObjectNode input, int expected, boolean authorized) throws Exception {
        var request = post(BASE + path).contentType("application/json").content(input.toString()).header("Host", "localhost:17850").header("Origin", "http://localhost:5173");
        if (authorized) request.header("X-OPM-Session", "graph-test-session");
        var exchange = mvc.perform(request).andReturn();
        if (exchange.getResponse().getStatus() != expected && exchange.getResolvedException() != null) exchange.getResolvedException().printStackTrace();
        var response = exchange.getResponse();
        assertEquals(expected, response.getStatus(), response.getContentAsString());
        return JSON.readTree(response.getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    @Test void draftHistoricalConflictAndGuardLeaveContentAndHistoryUntouched() throws Exception {
        var database = create(temporary, true, ignored -> { }); var factory = new ProjectDatabaseFactory(temporary); var mvc = mvc(factory);
        var repository = new DraftJournalRepository(factory.databaseScope(PROJECT), Clock.systemUTC());
        var before = repository.read(PROJECT, MODEL); var token = JSON.valueToTree(before.token());
        var request = input(); request.set("draft_token", token);
        var result = call(mvc, "/draft/graph-analysis", request, 200, true);
        DraftWorkspaceSchema.validate(result, "GraphAnalysisResult"); assertEquals(1, result.at("/statistics/fact_count").asInt());
        assertEquals(token.path("draft_id"), result.at("/source/draft_token/draft_id"));
        call(mvc, "/draft/graph-analysis", request, 403, false);
        var stale = request.deepCopy(); ((ObjectNode) stale.get("draft_token")).put("edit_seq", 999);
        assertEquals("DRAFT_CONFLICT", call(mvc, "/draft/graph-analysis", stale, 409, true).path("code").asText());
        ((ObjectNode) stale.get("draft_token")).put("binding_digest", "b".repeat(64));
        assertEquals("RULE_VERSION_CONFLICT", call(mvc, "/draft/graph-analysis", stale, 409, true).path("code").asText());
        request.put("unknown", true); call(mvc, "/draft/graph-analysis", request, 400, true);
        String revision = JSON.readTree(before.documentJson()).path("revision_id").asText();
        long count = count(database, "revision_document");
        var historic = call(mvc, "/revisions/" + revision + "/graph-analysis", input(), 200, true);
        assertTrue(historic.at("/source/draft_token").isNull()); assertEquals(revision, historic.at("/source/revision_id").asText());
        call(mvc, "/revisions/" + revision + "/graph-analysis", input(), 403, false);
        call(mvc, "/revisions/revision.missing/graph-analysis", input(), 404, true);
        var after = repository.read(PROJECT, MODEL); assertEquals(before.documentJson(), after.documentJson()); assertEquals(before.token(), after.token());
        assertEquals(count, count(database, "revision_document"));
    }
}
