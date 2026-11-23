package org.opm.localruntime.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.application.LocalApiService;
import org.opm.localruntime.application.ModelLifecycleService;
import org.opm.localruntime.api.generated.DraftSaveContract.SaveRequest;
import org.opm.localruntime.storage.*;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.time.Clock;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ModelLifecycleControllerTest {
    @TempDir Path temporary;
    private static final ObjectMapper JSON = new ObjectMapper();
    private ProjectDatabaseFactory factory;
    private LocalApiService domain;
    private MockMvc mvc;
    private String project, model;
    private int sequence;

    @Test void 回收恢复保留同一模型与完整草稿并阻断旧地址() throws Exception {
        setup(true);
        var journal = new DraftJournalRepository(factory.snapshot(project), Clock.systemUTC());
        var before = journal.read(project, model);
        var history = new DraftSaveRepository(factory.snapshot(project), Clock.systemUTC());
        history.manual(project, model, new SaveRequest("save.lifecycle", before.token(), "MANUAL"), ignored -> { });
        var retained = journal.read(project, model);
        assertEquals("ARCHIVED", change("TRASH", "command.trash", null, 200).at("/data/lifecycle_state").asText());
        assertEquals(0, domain.listModels("request.list", project).get("data") instanceof java.util.List<?> list ? list.size() : -1);
        assertEquals(1, ((java.util.List<?>) domain.listModels("request.trash", project, "ARCHIVED").get("data")).size());
        mvc.perform(get("/api/v1/projects/{p}/models/{m}/workspace-session", project, model).param("request_id", "request.open")).andExpect(status().isNotFound());
        assertThrows(DraftJournalRepository.Failure.class, () -> journal.read(project, model));
        assertThrows(DraftJournalRepository.Failure.class, () -> history.manual(project, model, new SaveRequest("save.archived", before.token(), "MANUAL"), ignored -> { }));
        assertEquals("ACTIVE", change("RESTORE", "command.restore", null, 200).at("/data/lifecycle_state").asText());
        assertEquals(retained.documentJson(), journal.read(project, model).documentJson());
        assertEquals(retained.token(), journal.read(project, model).token());
        assertEquals(1, count("draft_savepoint", model));
        mvc.perform(get("/api/v1/projects/{p}/models/{m}/workspace-session", project, model).param("request_id", "request.restored")).andExpect(status().isOk());
    }

    @Test void 永久删除清理单模型并保留其他模型共享包与幂等收据() throws Exception {
        setup(true);
        String other = createModel("另一个模型");
        seedAnalysis(model); seedAnalysis(other);
        var history = new DraftSaveRepository(factory.snapshot(project), Clock.systemUTC());
        String saved = history.manual(project, model, new SaveRequest("save.purge", history.read(project, model).token(), "MANUAL"), ignored -> { }).revision_id();
        String otherSaved = history.manual(project, other, new SaveRequest("save.other", history.read(project, other).token(), "MANUAL"), ignored -> { }).revision_id();
        var removedTask = (Map<?, ?>) domain.validate(project, model, Map.of("request_id", "request.validate.purge", "command_id", "command.validate.purge",
                "input_revision", saved, "binding", domain.activeProfileRuleBinding(), "scope", "FULL")).get("data");
        var retainedTask = (Map<?, ?>) domain.validate(project, other, Map.of("request_id", "request.validate.other", "command_id", "command.validate.other",
                "input_revision", otherSaved, "binding", domain.activeProfileRuleBinding(), "scope", "FULL")).get("data");
        assertEquals(2, scalar("SELECT COUNT(*) FROM background_task"));
        change("TRASH", "command.trash", null, 200);
        change("PURGE", "command.purge", "错误名称", 400);
        assertEquals(1, count("model_catalog", model));
        var first = change("PURGE", "command.purge", "测试模型", 200);
        assertEquals(first.get("data"), change("PURGE", "command.purge", "测试模型", 200).get("data"));
        for (String table : java.util.List.of("model_catalog", "model_head", "revision_document", "revision_parent", "draft_stream", "draft_checkpoint", "draft_journal", "draft_savepoint", "draft_retention", "draft_receipt", "draft_content", "model_save_mode", "mindmap_document", "mindmap_conversion")) assertEquals(0, count(table, model), table);
        assertEquals(1, count("model_catalog", other));
        assertEquals(1, count("mindmap_document", other)); assertEquals(1, count("mindmap_conversion", other));
        assertEquals(1, scalar("SELECT COUNT(*) FROM background_task"));
        assertThrows(ApiException.class, () -> domain.task("query.removed", removedTask.get("task_id").toString()));
        assertEquals(retainedTask, domain.task("query.retained", retainedTask.get("task_id").toString()).get("data"));
        assertTrue(scalar("SELECT COUNT(*) FROM profile_package") > 0);
        assertEquals(0, scalar("SELECT COUNT(*) FROM model_purge_authorization"));
        try (var c = connection(); var s = c.createStatement(); var rows = s.executeQuery("SELECT 1 WHERE false")) { assertFalse(rows.next()); }
        mvc.perform(get("/api/v1/projects/{p}/models/{m}/workspace-session", project, other).param("request_id", "request.other")).andExpect(status().isOk());
        assertEquals(2, scalar("SELECT COUNT(*) FROM idempotency_record WHERE operation_id='API-PRJ-013'"));
    }

    @Test void 清理中途失败回滚全部数据和授权() throws Exception {
        setup(true);
        change("TRASH", "command.trash", null, 200);
        try (var c = connection(); var s = c.createStatement()) {
            s.execute((org.opm.localruntime.storage.SqliteTestSupport.sqlite(c) ? "CREATE TRIGGER test_purge_failure BEFORE DELETE ON model_catalog BEGIN SELECT RAISE(ABORT, 'test failure'); END" : "CREATE OR REPLACE FUNCTION fn_test_purge_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; RETURN OLD; END $$; CREATE TRIGGER test_purge_failure BEFORE DELETE ON model_catalog FOR EACH ROW EXECUTE FUNCTION fn_test_purge_failure()"));
        }
        change("PURGE", "command.purge", "测试模型", 503);
        assertEquals(1, count("model_catalog", model));
        assertEquals(1, count("revision_document", model));
        assertEquals(1, count("draft_stream", model));
        assertEquals(0, scalar("SELECT COUNT(*) FROM model_purge_authorization"));
        try (var c = connection(); var s = c.createStatement()) { s.execute(org.opm.localruntime.storage.SqliteTestSupport.dropTriggerSql(c, "test_purge_failure", "model_catalog")); }
        change("PURGE", "command.purge", "测试模型", 200);
    }

    @Test void 活动和已归档模型的历史均拒绝直接删除() throws Exception {
        setup(true);
        assertProtected();
        change("TRASH", "command.trash", null, 200);
        assertProtected();
        assertEquals(1, count("revision_document", model));
    }

    @Test void 检查写守卫状态冲突错项目与命令摘要() throws Exception {
        setup(true);
        mvc.perform(post(path()).contentType(MediaType.APPLICATION_JSON).content(body("TRASH", "command.unauthorized", null))).andExpect(status().isForbidden());
        change("RESTORE", "command.restore-active", null, 409);
        change("TRASH", "command.trash", null, 200);
        change("TRASH", "command.trash", null, 200);
        change("RESTORE", "command.trash", null, 409);
        change("TRASH", "command.stale", null, 409);
        mvc.perform(write("/api/v1/projects/" + project + "/models/model.wrong/lifecycle", body("RESTORE", "command.wrong", null))).andExpect(status().isNotFound());
        String otherProject = ((Map<?, ?>) domain.createProject(Map.of("request_id", "request.other-project", "command_id", "command.other-project", "name", "另一个项目")).get("data")).get("project_id").toString();
        mvc.perform(write("/api/v1/projects/" + otherProject + "/models/" + model + "/lifecycle", body("PURGE", "command.wrong-project", "测试模型"))).andExpect(status().isNotFound());
        assertEquals(1, count("model_catalog", model));
        mvc.perform(get("/api/v1/projects/{p}/models", project).param("request_id", "request.invalid").param("archive_state", "OTHER")).andExpect(status().isBadRequest());
    }

    @Test void 旧式模型同样可回收恢复和永久删除() throws Exception {
        setup(false);
        String original = domain.workspace("request.before", project, model).get("data").toString();
        change("TRASH", "command.trash", null, 200);
        change("RESTORE", "command.restore", null, 200);
        assertEquals(original, domain.workspace("request.after", project, model).get("data").toString());
        change("TRASH", "command.trash-again", null, 200);
        change("PURGE", "command.purge", "测试模型", 200);
        assertEquals(0, count("model_catalog", model));
    }

    @Test void logicalSnapshotRestoresAnIsolatedProjectAndMigrationIsRepeatable() throws Exception {
        setup(true);
        var before=new DraftJournalRepository(factory.databaseScope(project),Clock.systemUTC()).read(project,model);
        Path restoredRoot=temporary.resolve("restored");
        var target=org.opm.localruntime.storage.StorageStores.tools(restoredRoot).project(project);
        if (target.store() instanceof org.opm.localruntime.storage.SqliteStore sqlite) {
            java.nio.file.Files.createDirectories(sqlite.path(project).getParent());
            try (var c = connection(); var statement = c.createStatement()) {
                statement.execute("VACUUM INTO '" + sqlite.path(project).toString().replace("'", "''") + "'");
            }
        }
        assertEquals(before,new DraftJournalRepository(target,Clock.systemUTC()).read(project,model));
        factory.store().migrate();factory.store().migrate();
        assertEquals(1,scalar("SELECT count(*) FROM flyway_schema_history WHERE success"));
        assertProtected();
    }

    private void setup(boolean journaled) {
        factory = journaled ? ProjectDatabaseFactory.journaledDrafts(temporary) : new ProjectDatabaseFactory(temporary);
        domain = new LocalApiService(factory);
        mvc = MockMvcBuilders.standaloneSetup(new LocalApiController(domain), new ModelLifecycleController(new ModelLifecycleService(factory, null)))
                .setControllerAdvice(new ApiExceptionHandler()).addInterceptors(new LocalWriteRequestGuard(new LocalSessionToken("test-session"))).build();
        project = ((Map<?, ?>) domain.createProject(Map.of("request_id", "request.project", "command_id", "command.project", "name", "测试项目")).get("data")).get("project_id").toString();
        model = createModel("测试模型");
    }
    private String createModel(String name) {
        return ((Map<?, ?>) domain.createModel(project, Map.of("request_id", "request.model." + ++sequence, "command_id", "command.model." + sequence, "name", name, "binding", domain.activeProfileRuleBinding())).get("data")).get("model_id").toString();
    }
    private void seedAnalysis(String id) throws Exception {
        var token = new DraftJournalRepository(factory.snapshot(project), Clock.systemUTC()).read(project, id).token();
        var input = JSON.createObjectNode().put("request_id", "request.analysis." + ++sequence).put("action", "OPEN"); input.set("draft_token", JSON.valueToTree(token));
        var analysis = new MindmapRepository(factory.snapshot(project), Clock.systemUTC()).execute(project, id, input);
        try (var c = connection(); var insert = c.prepareStatement("INSERT INTO mindmap_conversion(model_id,command_id,context_id,mindmap_id,source_revision,source_json,mappings_json,conversion_order) VALUES (?,?,?,?,?,?,?,1)")) {
            insert.setString(1, id); insert.setString(2, "command.analysis"); insert.setString(3, "context.fixture"); insert.setString(4, analysis.at("/document/id").asText());
            insert.setLong(5, 0); insert.setString(6, analysis.get("document").toString()); insert.setString(7, "[]"); insert.executeUpdate();
        }
    }
    private JsonNode change(String action, String command, String name, int status) throws Exception {
        var result=mvc.perform(write(path(),body(action,command,name))).andReturn();
        if(result.getResponse().getStatus()!=status)throw new AssertionError(result.getResponse().getContentAsString(),result.getResolvedException());
        return JSON.readTree(result.getResponse().getContentAsString());
    }
    private String body(String action, String command, String name) throws Exception {
        var data = JSON.createObjectNode().put("request_id", "request.lifecycle." + ++sequence).put("command_id", command).put("action", action).put("expected_state", action.equals("TRASH") ? "ACTIVE" : "ARCHIVED");
        if (name != null) data.put("confirmation_name", name); return data.toString();
    }
    private String path() { return "/api/v1/projects/" + project + "/models/" + model + "/lifecycle"; }
    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder write(String path, String body) {
        return post(path).header("X-OPM-Session", "test-session").header("Origin", "http://localhost").contentType(MediaType.APPLICATION_JSON).content(body);
    }
    private java.sql.Connection connection() throws Exception { return org.opm.localruntime.storage.SqliteTestSupport.connection(factory.snapshot(project)); }
    private int count(String table, String id) throws Exception {
        try (var c = connection(); var s = c.prepareStatement("SELECT COUNT(*) FROM " + table + " WHERE model_id=?")) { s.setString(1, id); try (var r = s.executeQuery()) { r.next(); return r.getInt(1); } }
    }
    private int scalar(String sql) throws Exception { try (var c = connection(); var s = c.createStatement(); var r = s.executeQuery(sql)) { r.next(); return r.getInt(1); } }
    private void assertProtected() throws Exception {
        try (var c = connection(); var s = c.prepareStatement("DELETE FROM revision_document WHERE model_id=?")) { s.setString(1, model); assertThrows(java.sql.SQLException.class, s::executeUpdate); }
    }
}
