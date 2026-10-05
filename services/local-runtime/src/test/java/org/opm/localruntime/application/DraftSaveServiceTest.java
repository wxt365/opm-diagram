package org.opm.localruntime.application;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.api.generated.DraftWorkspaceContract;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.storage.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Path;
import java.time.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.*;

class DraftSaveServiceTest {
    @TempDir Path temporary;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Clock EDIT_CLOCK = Clock.fixed(Instant.parse(NOW), ZoneOffset.UTC);

    @Test void springWiresTheSharedHostAndClosesItWithTheContext() throws Exception {
        create(temporary, true, ignored -> { });
        DraftSaveService host;
        try (var context = new org.springframework.context.annotation.AnnotationConfigApplicationContext()) {
            var factory = new ProjectDatabaseFactory(temporary); var loader = new FileProfilePackageLoader(root().resolve("packages/profiles"));
            context.registerBean(ProjectDatabaseFactory.class, () -> factory); context.registerBean(FileProfilePackageLoader.class, () -> loader);
            context.registerBean(LocalApiService.class, () -> new LocalApiService(factory, loader));
            context.register(DraftSaveService.class, DraftWorkspaceService.class); context.refresh();
            host = context.getBean(DraftSaveService.class);
            var open = JSON.createObjectNode().put("request_id", "request.open").putNull("context_id");
            var result = context.getBean(DraftWorkspaceService.class).execute(PROJECT, MODEL,
                    DraftWorkspaceContract.read(open.toString(), DraftWorkspaceContract.Type.OpenDraftRequest));
            assertEquals(host.state(PROJECT, MODEL).durable_token().draft_id(), result.at("/draft_token/draft_id").asText());
        }
        assertThrows(DraftWorkspaceService.Failure.class, () -> host.state(PROJECT, MODEL));
    }

    @Test void lazyRegistrationAutoCheckpointAndRestartUseDurableDeadline() throws Exception {
        Path database = create(temporary, true, ignored -> { });
        Flyway.configure().dataSource("jdbc:sqlite:" + database, "", "").locations("filesystem:" + root().resolve("docs/contracts/migrations/sqlite"),
                "filesystem:" + root().resolve("docs/contracts/migrations/sqlite-checkpoint")).target("4").mixed(true).load().migrate();
        var factory = new ProjectDatabaseFactory(temporary); var loader = new FileProfilePackageLoader(root().resolve("packages/profiles"));
        var workspace = new DraftWorkspaceService(factory, new LocalApiService(factory, loader), loader, EDIT_CLOCK);
        var token = rename(workspace, new DraftJournalRepository(database, EDIT_CLOCK).read(PROJECT, MODEL).token(), "自动保存对象");
        var clock = Clock.fixed(Instant.parse(NOW).plusSeconds(20), ZoneOffset.UTC);
        var executor = Executors.newSingleThreadScheduledExecutor();
        try (var host = new DraftSaveService(factory, loader, clock, System::nanoTime, executor)) {
            assertEquals(0, count(database, "draft_savepoint"));
            host.state(PROJECT, MODEL); host.state(PROJECT, MODEL);
            awaitCheckpoint(host, token); assertEquals(2, count(database, "draft_checkpoint"));
            assertEquals(0, count(database, "draft_savepoint")); assertEquals(1, count(database, "revision_document"));
        }
        assertTrue(executor.isTerminated());
        token = rename(workspace, new DraftJournalRepository(database, EDIT_CLOCK).read(PROJECT, MODEL).token(), "重启后自动保存");
        var second = Executors.newSingleThreadScheduledExecutor();
        var host = new DraftSaveService(factory, loader, clock, System::nanoTime, second);
        host.state(PROJECT, MODEL); awaitCheckpoint(host, token); host.close(); host.close();
        assertTrue(second.isTerminated()); assertThrows(DraftWorkspaceService.Failure.class, () -> host.state(PROJECT, MODEL));
        assertEquals(3, count(database, "draft_checkpoint")); assertEquals(0, count(database, "draft_savepoint"));
    }

    private void awaitCheckpoint(DraftSaveService host, JsonNodeToken target) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            var state = host.state(PROJECT, MODEL);
            if (state.checkpoint_token().edit_seq() == target.seq()) { assertNull(state.last_error()); assertNull(state.dirty_since()); return; }
            Thread.sleep(20);
        }
        fail("真实调度未完成：" + host.state(PROJECT, MODEL));
    }
    private record JsonNodeToken(long seq) { }
    private JsonNodeToken rename(DraftWorkspaceService workspace, org.opm.localruntime.api.generated.DraftSaveContract.DraftToken token, String name) {
        var query = JSON.createObjectNode().put("request_id", "request.capabilities"); query.set("draft_token", JSON.valueToTree(token));
        query.putObject("scope").put("context_id", CONTEXT).put("selection_id", "element.raw.material").put("intent", "UPDATE_PROPERTY").putArray("endpoints");
        var option = workspace.execute(PROJECT, MODEL, DraftWorkspaceContract.read(query.toString(), DraftWorkspaceContract.Type.DraftCapabilitiesRequest)).at("/data/options/0");
        var edit = JSON.createObjectNode().put("request_id", "request.edit").put("command_id", "command." + java.util.UUID.randomUUID());
        edit.set("expected_draft_token", JSON.valueToTree(token)); edit.set("scope", query.get("scope"));
        edit.putObject("authorization").set("capability_query_id", option.get("capability_query_id")); ((ObjectNode) edit.get("authorization")).set("selected_option_id", option.get("option_id"));
        var payload = edit.putObject("command").put("command_type", "UPDATE_PROPERTY").putObject("payload").put("property_name", "name").put("value", name);
        payload.putObject("target_ref").put("target_kind", "ELEMENT").put("target_id", "element.raw.material");
        return new JsonNodeToken(workspace.execute(PROJECT, MODEL, DraftWorkspaceContract.read(edit.toString(), DraftWorkspaceContract.Type.DraftEditRequest)).at("/result_token/edit_seq").asLong());
    }
}
