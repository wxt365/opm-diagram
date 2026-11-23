package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.api.generated.DraftSaveContract.*;
import org.opm.localruntime.api.generated.DraftWorkspaceContract;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.storage.*;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.time.Clock;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class NewDraftModelTest {
    @TempDir Path temporary;
    private static final ObjectMapper JSON = new ObjectMapper();

    @Test void createsIndependentDraftsAndEditsSavesAndReopensWithoutPerEditRevisions() throws Exception {
        var factory = ProjectDatabaseFactory.journaledDrafts(temporary);
        var loader = new FileProfilePackageLoader(DraftWorkspaceTestDatabase.root().resolve("packages/profiles"));
        var domain = new LocalApiService(factory, loader);
        String project = data(domain.createProject(Map.of("request_id", "request.project", "command_id", "command.project", "name", "项目"))).get("project_id").toString();
        var first = data(domain.createModel(project, modelRequest(domain, "first")));
        var second = data(domain.createModel(project, modelRequest(domain, "second")));
        String model = first.get("model_id").toString(), other = second.get("model_id").toString();
        assertEquals(first, data(domain.createModel(project, modelRequest(domain, "first"))));
        var database = factory.snapshot(project);
        assertEquals(database.getFileName().toString().equals("project.db") ? "1" : "6", scalar(database, "SELECT count(*) FROM flyway_schema_history WHERE success"));
        assertInstanceOf(ProjectDatabaseOpenResult.Ready.class, factory.open(project));
        assertEquals("2", scalar(database, "SELECT count(*) FROM draft_stream"));
        var repository = new DraftJournalRepository(database, Clock.systemUTC());
        var initial = repository.read(project, model); var otherInitial = repository.read(project, other);
        assertNotEquals(initial.token().draft_id(), otherInitial.token().draft_id());
        assertEquals(0, initial.token().edit_seq());
        var workspace = new DraftWorkspaceService(factory, domain, loader);
        var opened = workspace.execute(project, model, DraftWorkspaceContract.read("{\"request_id\":\"request.open\",\"context_id\":null}", DraftWorkspaceContract.Type.OpenDraftRequest));
        assertEquals("JOURNALED_DRAFT_V2", opened.get("mode").asText());
        String context = opened.get("context_id").asText();
        var query = JSON.createObjectNode().put("request_id", "request.query"); query.set("draft_token", JSON.valueToTree(initial.token()));
        query.putObject("scope").put("context_id", context).putNull("selection_id").put("intent", "CREATE_ELEMENT").putArray("endpoints");
        var option = workspace.execute(project, model, DraftWorkspaceContract.read(query.toString(), DraftWorkspaceContract.Type.DraftCapabilitiesRequest)).at("/data/options/0");
        var edit = JSON.createObjectNode().put("request_id", "request.edit").put("command_id", "command.edit");
        edit.set("expected_draft_token", JSON.valueToTree(initial.token())); edit.set("scope", query.get("scope"));
        var authorization = edit.putObject("authorization"); authorization.set("capability_query_id", option.get("capability_query_id")); authorization.set("selected_option_id", option.get("option_id"));
        var payload = edit.putObject("command").put("command_type", "CREATE_ELEMENT").putObject("payload").put("kind", "OBJECT").put("name", "新对象").put("element_id", "element.new");
        payload.putObject("layout").put("x", 100.5).put("y", 80);
        workspace.execute(project, model, DraftWorkspaceContract.read(edit.toString(), DraftWorkspaceContract.Type.DraftEditRequest));
        var edited = repository.read(project, model); assertEquals(1, edited.token().edit_seq());
        assertEquals(otherInitial, repository.read(project, other));
        assertEquals("2", scalar(database, "SELECT count(*) FROM revision_document"));
        try (var saves = new DraftSaveService(factory, loader, Clock.systemUTC(), System::nanoTime, java.util.concurrent.Executors.newSingleThreadScheduledExecutor())) {
            var saved = saves.save(project, model, new SaveRequest("save.first", edited.token(), "MANUAL"));
            assertEquals(saved.revision_id(), saves.save(project, model, new SaveRequest("save.repeat", edited.token(), "MANUAL")).revision_id());
            var pinned = saves.pin(project, model, new PinRequest("pin.first", edited.token(), "PERMALINK"));
            assertTrue(domain.projection("request.exact", project, model, context, pinned.revision_id()).toString().contains("新对象"));
        }
        assertEquals(edited.documentJson(), new DraftJournalRepository(database, Clock.systemUTC()).read(project, model).documentJson());
        assertEquals("2", scalar(database, "SELECT count(*) FROM revision_document"));
        assertEquals("2", scalar(database, "SELECT count(*) FROM draft_savepoint"));
    }

    @Test void failedModeInsertionRollsBackTheWholeModelAndRetryCreatesOnlyOne() throws Exception {
        var factory = ProjectDatabaseFactory.journaledDrafts(temporary); var domain = new LocalApiService(factory);
        String project = data(domain.createProject(Map.of("request_id", "request.project", "command_id", "command.project", "name", "回滚"))).get("project_id").toString();
        var database = factory.snapshot(project);
        execute(database, factory.store() instanceof SqliteStore ? "CREATE TRIGGER test_fail_mode BEFORE INSERT ON model_save_mode BEGIN SELECT RAISE(ABORT, 'test failure'); END" : "CREATE OR REPLACE FUNCTION fn_test_fail_mode() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; RETURN NEW; END $$; CREATE TRIGGER test_fail_mode BEFORE INSERT ON model_save_mode FOR EACH ROW EXECUTE FUNCTION fn_test_fail_mode()");
        assertThrows(ApiException.class, () -> domain.createModel(project, modelRequest(domain, "rollback")));
        for (String table : java.util.List.of("model_catalog", "model_head", "revision_document", "draft_content", "draft_stream", "draft_checkpoint", "model_save_mode"))
            assertEquals("0", scalar(database, "SELECT count(*) FROM " + table), table);
        assertEquals("1", scalar(database, "SELECT count(*) FROM idempotency_record"));
        execute(database, factory.store() instanceof SqliteStore ? "DROP TRIGGER test_fail_mode" : "DROP TRIGGER test_fail_mode ON model_save_mode");
        domain.createModel(project, modelRequest(domain, "rollback"));
        assertEquals("1", scalar(database, "SELECT count(*) FROM model_save_mode"));
    }

    @Test void factoriesShareOneMigratedSchemaWithoutCreatingModelRows() throws Exception {
        var legacy=new ProjectDatabaseFactory(temporary);assertInstanceOf(ProjectDatabaseOpenResult.Ready.class,legacy.open("project.legacy"));
        assertFalse(legacy.usesJournaledDrafts());assertInstanceOf(ProjectDatabaseOpenResult.Ready.class,ProjectDatabaseFactory.journaledDrafts(temporary).open("project.legacy"));
        assertEquals(legacy.store() instanceof SqliteStore ? "1" : "6",scalar(legacy.snapshot("project.legacy"),"SELECT count(*) FROM flyway_schema_history WHERE success"));
        assertEquals("0",scalar(legacy.snapshot("project.legacy"),"SELECT count(*) FROM model_save_mode"));
    }
    private Map<String,Object> modelRequest(LocalApiService service,String suffix) {
        return Map.of("request_id","request."+suffix,"command_id","command."+suffix,
                "name",suffix,"binding",service.activeProfileRuleBinding());
    }
    @SuppressWarnings("unchecked") private static Map<String,Object> data(Map<String,Object> value) {
        return (Map<String,Object>)value.get("data");
    }
    private static String scalar(Path database,String sql)throws Exception {
        try(var connection=SqliteTestSupport.connection(database);var statement=connection.createStatement();var rows=statement.executeQuery(sql)) {
            assertTrue(rows.next());return rows.getString(1);
        }
    }
    private static void execute(Path database,String sql)throws Exception {
        try(var connection=SqliteTestSupport.connection(database);var statement=connection.createStatement()){statement.execute(sql);}
    }
}
