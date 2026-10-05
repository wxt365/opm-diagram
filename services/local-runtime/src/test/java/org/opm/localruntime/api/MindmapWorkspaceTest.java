package org.opm.localruntime.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.application.DraftWorkspaceService;
import org.opm.localruntime.application.LocalApiService;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import java.sql.DriverManager;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.file.Path;
import java.time.Clock;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** 真实 SQLite 和 HTTP 契约验证，脑图保存不改变正式模型的编辑序号。 */
class MindmapWorkspaceTest {
    @TempDir Path temporary;
    private static final ObjectMapper JSON = new ObjectMapper();
    private Path database;
    private MockMvc mvc;
    @BeforeEach void setup() throws Exception { database = create(temporary, true, ignored -> { });
        org.flywaydb.core.Flyway.configure().dataSource(new org.sqlite.SQLiteDataSource() {{ setUrl("jdbc:sqlite:" + database); }})
                .locations("classpath:db/migration", "classpath:db/hybrid-save", "classpath:db/checkpoint", "classpath:db/pin", "classpath:db/digestv2")
                .javaMigrations(new org.opm.localruntime.storage.migration.V7__Model_lifecycle_delete_guards()).mixed(true).load().migrate();
        reopen(); }
    private void reopen() {
        var factory = ProjectDatabaseFactory.journaledDrafts(temporary); var loader = new FileProfilePackageLoader(root().resolve("packages/profiles"));
        mvc = MockMvcBuilders.standaloneSetup(new DraftWorkspaceController(new DraftWorkspaceService(factory, new LocalApiService(factory, loader), loader, Clock.systemUTC())))
                .setControllerAdvice(new DraftWorkspaceExceptionHandler(), new ApiExceptionHandler()).addInterceptors(new DraftWriteRequestGuard(new LocalSessionToken("test-session"))).build();
    }
    @Test void savesIndependentlyRejectsStaleAndInvalidTreesAndReopens() throws Exception {
        var token = token(); var opened = brain(token); var document = (ObjectNode) opened.get("document").deepCopy();
        ((ObjectNode) document.at("/nodes/1")).put("label", "目标分析");
        var saved = save(token, document, 200); assertEquals(1, saved.at("/document/revision").asInt()); assertEquals(token, token());
        call("mindmap", saveInput(token, document), 409); assertEquals(0, count(database, "draft_journal"));
        for (String defect : List.of("cycle", "duplicate", "owner", "root")) {
            var invalid = (ObjectNode) saved.get("document").deepCopy();
            switch (defect) {
                case "cycle" -> ((ObjectNode) invalid.at("/nodes/1")).put("parent_id", "node.group.1");
                case "duplicate" -> ((com.fasterxml.jackson.databind.node.ArrayNode) invalid.get("nodes")).add(invalid.at("/nodes/1"));
                case "owner" -> ((ObjectNode) invalid.at("/nodes/1")).put("owner_id", "absent");
                case "root" -> ((ObjectNode) invalid.at("/nodes/1")).putNull("parent_id");
            }
            save(token, invalid, 400);
        }
        reopen(); assertEquals(saved.get("document"), brain(token).get("document"));
        // 旧 V3 库升级到 V8 并生成备份；再次打开不会重复迁移。
        var factory = ProjectDatabaseFactory.journaledDrafts(temporary);
        assertInstanceOf(org.opm.localruntime.storage.ProjectDatabaseOpenResult.Ready.class, factory.open(PROJECT));
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + database); var rows = connection.createStatement().executeQuery("SELECT count(*) FROM flyway_schema_history WHERE version='8' AND success=1")) { rows.next(); assertEquals(1, rows.getInt(1)); }
        assertTrue(java.nio.file.Files.list(database.getParent()).anyMatch(path -> path.toString().contains("before-migration")));
    }
    @Test void conversionSourceAndReceiptCommitAtomicallyAndRetryAfterSourceChanges() throws Exception {
        var token = token(); var data = coffee(token); var document = (ObjectNode) data.get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("nodes")).addObject().put("id", "question").put("parent_id", "node.root").put("order", 5)
                .put("label", "待确认业务问题").put("note", "").put("kind", "UNCLASSIFIED").put("collapsed", false).putNull("owner_id").putNull("entity_ref").putNull("target_id");
        data = save(token, document, 200); var steps = steps(); var source = source(data); ((com.fasterxml.jackson.databind.node.ArrayNode) source.get("excluded_ids")).add("question");
        var preview = preview(token, steps); preview.put("finalize", true).set("analysis_source", source);
        assertEquals(0, call("plan-preview", preview, 200).at("/findings/validation_summary/blocking").asInt());
        assertEquals(0, brain(token).get("conversions").size());
        var request = command(token, steps, "command.mindmap"); request.set("analysis_source", source);
        var result = call("commands", request, 200); var nextToken = result.get("result_token");
        assertEquals(1, nextToken.get("edit_seq").asInt());
        var stored = brain(nextToken); assertEquals(5, stored.at("/conversions/0/mappings").size());
        assertEquals("question", stored.at("/conversions/0/excluded_ids/0").asText());
        assertTrue(call("text", query(nextToken), 200).toString().contains("烘焙 changes 咖啡豆 from 待烘焙 to 已烘焙"));
        save(nextToken, (ObjectNode) stored.get("document").deepCopy(), 200);
        request.put("request_id", "request.retry"); assertEquals(nextToken, call("commands", request, 200).get("result_token"));
        reopen(); assertEquals(1, brain(nextToken).get("conversions").size()); assertEquals("question", brain(nextToken).at("/conversions/0/excluded_ids/0").asText()); assertEquals(1, count(database, "draft_journal"));
    }
    @Test void staleSourceMissingBindingsAndMappingWriteFailureHaveNoPartialModelWrites() throws Exception {
        var token = token(); var data = coffee(token); var source = source(data); var request = command(token, steps(), "command.rejected");
        request.set("analysis_source", source);
        var malformed = request.deepCopy(); ((com.fasterxml.jackson.databind.node.ArrayNode) malformed.at("/analysis_source/bindings")).remove(4);
        call("commands", malformed, 400); assertEquals(token, token());
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + database); var statement = connection.createStatement()) {
            statement.execute("CREATE TRIGGER fail_mapping BEFORE INSERT ON mindmap_conversion BEGIN SELECT RAISE(ABORT, 'test mapping failure'); END");
        }
        call("commands", request, 503); assertEquals(token, token()); assertEquals(0, count(database, "draft_journal")); assertEquals(0, count(database, "draft_receipt"));
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + database); var statement = connection.createStatement()) { statement.execute("DROP TRIGGER fail_mapping"); }
        save(token, (ObjectNode) data.get("document").deepCopy(), 200);
        call("commands", request, 409); assertEquals(token, token()); assertEquals(0, brain(token).get("conversions").size());
    }
    @Test void manualRenameCanBeReusedButUnmappedUpdatesAreRejected() throws Exception {
        var token = token(); var data = coffee(token); var request = command(token, steps(), "command.initial"); request.set("analysis_source", source(data));
        token = call("commands", request, 200).get("result_token"); var mappings = brain(token).at("/conversions/0/mappings");
        String beans = mappings.get(0).get("target_id").asText();
        var rename = JSON.createArrayNode().addObject().put("local_id", "local.rename").put("command_type", "UPDATE_PROPERTY").put("target", beans).put("name", "手工咖啡豆");
        token = call("commands", command(token, JSON.createArrayNode().add(rename), "command.manual"), 200).get("result_token");
        var source = source(data); var bindings = (com.fasterxml.jackson.databind.node.ArrayNode) source.get("bindings");
        for (int i = 0; i < bindings.size(); i++) ((ObjectNode) bindings.get(i)).set("target_ref", mappings.get(i).get("target_id"));
        var move = JSON.createArrayNode().addObject().put("local_id", "local.move").put("command_type", "UPDATE_LAYOUT").put("target", beans); move.putObject("layout").put("x", 50).put("y", 50);
        var permitted = preview(token, JSON.createArrayNode().add(move)).put("finalize", true); permitted.set("analysis_source", source);
        call("plan-preview", permitted, 200);
        var unrelated = JSON.createArrayNode().addObject().put("local_id", "local.unrelated").put("command_type", "UPDATE_PROPERTY").put("target", "element.raw.material").put("name", "无关修改");
        var denied = command(token, JSON.createArrayNode().add(unrelated), "command.unrelated"); denied.set("analysis_source", source);
        call("commands", denied, 400); assertEquals(token, token());
    }
    private JsonNode coffee(JsonNode token) throws Exception {
        var document = (ObjectNode) brain(token).get("document").deepCopy(); var nodes = document.putArray("nodes");
        String[] ids = { "node.root", "beans", "raw", "done", "roast" }, names = { "咖啡分析", "咖啡豆", "待烘焙", "已烘焙", "烘焙" }, kinds = { "TOPIC", "OBJECT", "STATE", "STATE", "PROCESS" };
        for (int i = 0; i < ids.length; i++) {
            var node = nodes.addObject().put("id", ids[i]).put("label", names[i]).put("kind", kinds[i]).put("note", "").put("order", i).put("collapsed", false).putNull("entity_ref").putNull("target_id");
            if (i == 0) node.putNull("parent_id"); else node.put("parent_id", "node.root");
            if (i == 2 || i == 3) node.put("owner_id", "beans"); else node.putNull("owner_id");
        }
        document.putArray("relations").addObject().put("id", "effect").put("label", "烘焙状态变化").put("capability_id", "CAP-ISO-PROC-008").putArray("endpoints").add("raw").add("roast").add("done");
        return save(token, document, 200);
    }
    private JsonNode steps() throws Exception { return JSON.readTree("""
      [{"local_id":"local.beans","command_type":"CREATE_ELEMENT","kind":"OBJECT","name":"咖啡豆","layout":{"x":150,"y":200}},
       {"local_id":"local.raw","command_type":"CREATE_STATE","target":"local.beans","name":"待烘焙"},
       {"local_id":"local.done","command_type":"CREATE_STATE","target":"local.beans","name":"已烘焙"},
       {"local_id":"local.roast","command_type":"CREATE_ELEMENT","kind":"PROCESS","name":"烘焙","layout":{"x":450,"y":220}},
       {"local_id":"local.effect","command_type":"CREATE_FACT","capability_id":"CAP-ISO-PROC-008","endpoints":["local.raw","local.roast","local.done"]}]
      """); }
    private ObjectNode source(JsonNode data) {
        var source = JSON.createObjectNode().put("mindmap_id", data.at("/document/id").asText()).put("revision", data.at("/document/revision").asInt()).put("digest", data.get("digest").asText());
        source.putArray("excluded_ids"); var bindings = source.putArray("bindings");
        for (String id : List.of("beans", "raw", "done", "roast", "effect")) bindings.addObject().put("source_id", id).put("target_ref", "local." + id);
        return source;
    }
    private ObjectNode command(JsonNode token, JsonNode steps, String id) throws Exception {
        var scope = JSON.createObjectNode().put("context_id", CONTEXT).putNull("selection_id").put("intent", "APPLY_MODEL_PLAN"); scope.putArray("endpoints");
        var capabilities = JSON.createObjectNode().put("request_id", "request.cap"); capabilities.set("scope", scope); capabilities.set("draft_token", token);
        var option = call("capabilities", capabilities, 200).at("/data/options/0");
        var request = JSON.createObjectNode().put("request_id", "request.edit").put("command_id", id); request.set("scope", scope); request.set("expected_draft_token", token);
        var auth = request.putObject("authorization"); auth.set("capability_query_id", option.get("capability_query_id")); auth.set("selected_option_id", option.get("option_id"));
        var payload = request.putObject("command").put("command_type", "APPLY_MODEL_PLAN").putObject("payload").put("context_id", CONTEXT); payload.set("steps", steps); return request;
    }
    private ObjectNode preview(JsonNode token, JsonNode steps) { var request = query(token).put("plan_id", "command.mindmap").putNull("next_scope"); request.set("steps", steps); return request; }
    private ObjectNode query(JsonNode token) { var value = JSON.createObjectNode().put("request_id", "request.query").put("context_id", CONTEXT); value.set("draft_token", token); return value; }
    private JsonNode token() throws Exception { return call("open", JSON.createObjectNode().put("request_id", "request.open").put("context_id", CONTEXT), 200).get("draft_token"); }
    private JsonNode brain(JsonNode token) throws Exception { var value = JSON.createObjectNode().put("request_id", "request.brain").put("action", "OPEN"); value.set("draft_token", token); return call("mindmap", value, 200); }
    private ObjectNode saveInput(JsonNode token, ObjectNode document) { var value = JSON.createObjectNode().put("request_id", "request.save").put("action", "SAVE"); value.set("draft_token", token); value.set("document", document); value.set("expected_revision", document.get("revision")); return value; }
    private JsonNode save(JsonNode token, ObjectNode document, int status) throws Exception { return call("mindmap", saveInput(token, document), status); }
    private JsonNode call(String operation, JsonNode input, int status) throws Exception {
        var result = mvc.perform(post("/api/v2/projects/" + PROJECT + "/models/" + MODEL + "/draft/" + operation).contentType("application/json").header("Origin", "http://localhost:5173").header("X-OPM-Session", "test-session").content(input.toString())).andReturn();
        assertEquals(status, result.getResponse().getStatus(), result.getResponse().getContentAsString()); return JSON.readTree(result.getResponse().getContentAsString());
    }
}
