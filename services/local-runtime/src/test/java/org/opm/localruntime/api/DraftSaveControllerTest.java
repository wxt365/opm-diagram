package org.opm.localruntime.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.api.generated.DraftSaveContract;
import org.opm.localruntime.application.*;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.storage.*;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.file.Path;
import java.time.*;
import java.util.List;
import java.util.concurrent.Executors;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

class DraftSaveControllerTest {
    @TempDir Path temporary;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Clock CLOCK = Clock.fixed(Instant.parse(NOW), ZoneOffset.UTC);
    private static final String URL = "/api/v2/projects/" + PROJECT + "/models/" + MODEL + "/draft/";
    private DraftSaveService host;
    private MockMvc mvc;
    private Path database;
    @BeforeEach void setup() throws Exception {
        database = create(temporary, true, ignored -> { }); migrate(database); setupMvc(root().resolve("packages/profiles"));
    }
    @AfterEach void close() { if (host != null) host.close(); }
    private void setupMvc(Path profiles) {
        setupMvc(temporary, profiles);
    }
    private void setupMvc(Path storage, Path profiles) {
        if (host != null) host.close();
        var factory = new ProjectDatabaseFactory(storage); var loader = new FileProfilePackageLoader(profiles);
        var domain = new LocalApiService(factory, loader);
        host = new DraftSaveService(factory, loader, CLOCK, System::nanoTime, Executors.newScheduledThreadPool(2));
        mvc = MockMvcBuilders.standaloneSetup(new DraftSaveController(host), new DraftWorkspaceController(new DraftWorkspaceService(factory, domain, loader, CLOCK, host)), new LocalApiController(domain))
                .setControllerAdvice(new DraftSaveExceptionHandler(), new DraftWorkspaceExceptionHandler(), new ApiExceptionHandler())
                .addMappedInterceptors(new String[]{"/api/v2/**"}, new DraftWriteRequestGuard(new LocalSessionToken("test-session"))).build();
    }

    @Test void pinnedCaptureKeepsNewerEditsAndOpensImmutableHistoryAcrossRestart() throws Exception {
        var first = rename(open().get("draft_token"), "固定前名称");
        var later = rename(first, "固定后名称"); var request = pinRequest("pin.http", first, "PERMALINK");
        var pinned = postCall("pin", request, 200); DraftSaveContract.read(pinned.toString(), DraftSaveContract.PinResult.class);
        assertEquals(first, pinned.get("captured_token")); String revision = pinned.get("revision_id").asText();
        var workspace = historical("workspace", revision); var text = historical("text", revision); var projection = historical("projection", revision);
        assertEquals("READONLY_SNAPSHOT", workspace.at("/data/model/access_mode").asText());
        assertTrue(text.toString().contains("固定前名称")); assertFalse(text.toString().contains("固定后名称")); assertTrue(projection.toString().contains("固定前名称"));
        var state = perform(authorized(get(URL + "save-state")), 200);
        assertEquals(later, state.get("durable_token")); assertEquals(first, state.get("checkpoint_token"));
        assertFalse(state.get("dirty_since").isNull()); assertNull(state.get("last_manual_revision").textValue());
        assertEquals(pinned, postCall("pin", request, 200));
        assertEquals(revision, postCall("pin", pinRequest("pin.again", first, "PERMALINK"), 200).get("revision_id").asText());
        assertEquals("IDEMPOTENCY_MISMATCH", postCall("pin", pinRequest("pin.http", first, "EXPORT"), 409).get("code").asText());
        var receipt = JSON.createObjectNode().put("request_id", "request.receipt").put("operation", "PIN").put("idempotency_id", "pin.http");
        assertEquals(pinned, postCall("receipts", receipt, 200).get("result"));
        var latestPin = postCall("pin", pinRequest("pin.latest", later, "PERMALINK"), 200); assertNotEquals(revision, latestPin.get("revision_id").asText());
        var manual = postCall("save", saveRequest("pin.http", later), 200); assertEquals("SAVED", manual.get("status").asText());
        assertNotEquals(latestPin.get("revision_id"), manual.get("revision_id"));
        assertEquals(3, count(database, "draft_savepoint")); assertEquals(3, count(database, "draft_retention")); assertEquals(2, count(database, "draft_journal")); assertEquals(1, count(database, "revision_document"));
        setupMvc(root().resolve("packages/profiles")); assertEquals(text.get("data"), historical("text", revision).get("data"));
        setupMvc(temporary.resolve("absent-profile")); assertEquals(pinned, postCall("pin", request, 200));
        assertEquals("SAVE_VALIDATION_BLOCKED", postCall("pin", pinRequest("pin.no-assets", later, "PERMALINK"), 422).get("code").asText());
    }

    @Test void pinRejectsUnsafeRawRequestsSecurityScopeAndTokensWithoutWrites() throws Exception {
        var token = open().get("draft_token"); var request = pinRequest("pin.guard", token, "PERMALINK"); String raw = request.toString();
        for (String bad : List.of("null", raw + " {}", raw.replace("\"PERMALINK\"", "\"AUTO\""), raw.replace("\"pin_id\":", "\"extra\":1,\"pin_id\":"),
                raw.replace("\"pin_id\":", "\"pin_id\":\"pin.duplicate\",\"pin_id\":"), raw.replace("\"edit_seq\":0", "\"edit_seq\":0.0"))) {
            var error = perform(authorized(post(URL + "pin")).contentType(MediaType.APPLICATION_JSON).content(bad), 400);
            assertEquals("INPUT_INVALID", error.get("code").asText()); DraftSaveContract.read(error.toString(), DraftSaveContract.SaveError.class);
        }
        for (String failure : List.of("host", "origin", "session")) {
            var call = post(URL + "pin").contentType(MediaType.APPLICATION_JSON).content(raw)
                    .header("Origin", failure.equals("origin") ? "http://evil.invalid" : "http://localhost:5173")
                    .header("X-OPM-Session", failure.equals("session") ? "wrong" : "test-session");
            if (failure.equals("host")) call.with(value -> { value.setServerName("evil.invalid"); return value; });
            assertEquals("LOCAL_SESSION_INVALID", perform(call, 403).get("code").asText());
        }
        for (String id : List.of("draft", "seq", "binding")) {
            ObjectNode bad = token.deepCopy(); if (id.equals("draft")) bad.put("draft_id", "draft.other");
            if (id.equals("seq")) bad.put("edit_seq", 99); if (id.equals("binding")) bad.put("binding_digest", "a".repeat(64));
            assertEquals(id.equals("binding") ? "RULE_VERSION_CONFLICT" : "DRAFT_CONFLICT", postCall("pin", pinRequest("pin." + id, bad, "PERMALINK"), 409).get("code").asText());
        }
        for (String path : List.of(URL.replace(PROJECT, "project.absent"), URL.replace(MODEL, "model.absent")))
            assertEquals("NOT_FOUND", perform(authorized(post(path + "pin")).contentType(MediaType.APPLICATION_JSON).content(raw), 404).get("code").asText());
        assertEquals(0, count(database, "draft_savepoint")); assertEquals(0, count(database, "draft_retention")); assertEquals(0, count(database, "draft_receipt"));
    }

    @Test void pinSqlFailureRetainsDirtyDraftAndRetryReturnsProtectedVersion() throws Exception {
        var request = pinRequest("pin.sql", rename(open().get("draft_token"), "待固定"), "EXPORT");
        var before = perform(authorized(get(URL + "save-state")), 200);
        try (var c = java.sql.DriverManager.getConnection("jdbc:sqlite:" + database); var s = c.createStatement()) {
            s.execute("CREATE TRIGGER test_pin_failure BEFORE INSERT ON draft_receipt WHEN NEW.operation='PIN' BEGIN SELECT RAISE(ABORT,'测试故障'); END");
        }
        var error = postCall("pin", request, 503); assertEquals("PERSISTENCE_FAILED", error.get("code").asText()); assertTrue(error.get("retryable").asBoolean());
        var after = perform(authorized(get(URL + "save-state")), 200); assertEquals(before.get("checkpoint_token"), after.get("checkpoint_token")); assertEquals(before.get("dirty_since"), after.get("dirty_since"));
        assertEquals(0, count(database, "draft_savepoint")); assertEquals(0, count(database, "draft_retention"));
        try (var c = java.sql.DriverManager.getConnection("jdbc:sqlite:" + database); var s = c.createStatement()) { s.execute("DROP TRIGGER test_pin_failure"); }
        assertTrue(postCall("pin", request, 200).hasNonNull("revision_id"));
    }

    @Test void saveExactReadAndLaterRealEditPreserveHistoryWithoutPerEditRevision() throws Exception {
        var token = rename(open().get("draft_token"), "第一名称");
        var request = saveRequest("save.first", token); var saved = postCall("save", request, 200);
        DraftSaveContract.read(saved.toString(), DraftSaveContract.SaveResult.class);
        String revision = saved.get("revision_id").asText();
        var workspace = historical("workspace", revision);
        assertEquals("READONLY_SNAPSHOT", workspace.at("/data/model/access_mode").asText());
        var text = historical("text", revision); var projection = historical("projection", revision);
        assertTrue(text.toString().contains("第一名称")); assertTrue(projection.toString().contains("第一名称"));
        var draftText = JSON.createObjectNode().put("request_id", "request.text").put("context_id", CONTEXT); draftText.set("draft_token", token);
        assertNotEquals(postCall("text", draftText, 200).at("/data/artifact_id"), text.at("/data/artifact_id"));
        var second = rename(token, "第二名称");
        assertEquals(text.get("data"), historical("text", revision).get("data")); assertEquals(projection.get("data"), historical("projection", revision).get("data"));
        assertEquals(saved, postCall("save", request, 200));
        var repeated = postCall("save", saveRequest("save.same", token), 200); assertEquals("UNCHANGED", repeated.get("status").asText());
        assertEquals(revision, repeated.get("revision_id").asText());
        var secondSave = postCall("save", saveRequest("save.second", second), 200); assertNotEquals(revision, secondSave.get("revision_id").asText());
        var history = perform(get("/api/v1/projects/" + PROJECT + "/models/" + MODEL + "/revisions").param("request_id", "request.history"), 200);
        assertEquals(3, history.get("data").size()); assertEquals(4, history.at("/data/0/sequence").asInt()); assertEquals(3, history.at("/data/1/sequence").asInt());
        assertEquals(1, count(database, "revision_document")); assertEquals(2, count(database, "draft_journal")); assertEquals(2, count(database, "draft_savepoint"));
        var state = perform(authorized(get(URL + "save-state")), 200); DraftSaveContract.read(state.toString(), DraftSaveContract.SaveState.class);
        assertEquals(secondSave.get("revision_id"), state.get("last_manual_revision")); assertEquals(state, open().get("save_state"));
        setupMvc(root().resolve("packages/profiles")); assertEquals(text.get("data"), historical("text", revision).get("data")); assertEquals(state, open().get("save_state"));
        setupMvc(temporary.resolve("missing-assets-after-save")); assertEquals(saved, postCall("save", request, 200));
    }

    @Test void saveAndStateRequireHostOriginAndSessionWithClosedSaveError() throws Exception {
        var request = saveRequest("save.guard", open().get("draft_token"));
        for (boolean state : List.of(false, true)) for (String failure : List.of("host", "origin", "session")) {
            var call = state ? get(URL + "save-state") : post(URL + "save").contentType(MediaType.APPLICATION_JSON).content(request.toString());
            call.header("Origin", failure.equals("origin") ? "http://evil.invalid" : "http://localhost:5173");
            call.header("X-OPM-Session", failure.equals("session") ? "wrong" : "test-session");
            if (failure.equals("host")) call.with(value -> { value.setServerName("evil.invalid"); return value; });
            var result = perform(call, 403); assertEquals("LOCAL_SESSION_INVALID", result.get("code").asText());
            assertEquals(3, result.size()); DraftSaveContract.read(result.toString(), DraftSaveContract.SaveError.class);
        }
        assertEquals(0, count(database, "draft_savepoint"));
    }

    @Test void strictRawRequestAndTokenErrorsHaveNoPartialSave() throws Exception {
        var token = open().get("draft_token"); var request = saveRequest("save.raw", token); String raw = request.toString();
        for (String bad : List.of("null", raw + " {}", raw.replace("\"MANUAL\"", "\"AUTO\""), raw.replace("\"save_id\":", "\"unknown\":1,\"save_id\":"),
                raw.replace("\"save_id\":", "\"save_id\":\"save.duplicate\",\"save_id\":"), raw.replace("\"edit_seq\":0", "\"edit_seq\":0.5"))) {
            var result = perform(authorized(post(URL + "save")).contentType(MediaType.APPLICATION_JSON).content(bad), 400);
            assertEquals("INPUT_INVALID", result.get("code").asText()); DraftSaveContract.read(result.toString(), DraftSaveContract.SaveError.class);
        }
        var future = token.deepCopy(); ((ObjectNode) future).put("edit_seq", 99); error(saveRequest("save.future", future), 409, "DRAFT_CONFLICT");
        ((ObjectNode) future).put("binding_digest", "a".repeat(64)); error(saveRequest("save.binding", future), 409, "RULE_VERSION_CONFLICT");
        assertEquals(0, count(database, "draft_savepoint")); assertEquals(0, count(database, "draft_receipt")); assertEquals(1, count(database, "draft_checkpoint"));
    }

    @Test void missingAssetsRejectRealSaveAndExposeNonretryableState() throws Exception {
        var token = open().get("draft_token"); setupMvc(temporary.resolve("missing-profiles"));
        error(saveRequest("save.asset", token), 422, "SAVE_VALIDATION_BLOCKED");
        var state = perform(authorized(get(URL + "save-state")), 200);
        assertEquals("SAVE_VALIDATION_BLOCKED", state.at("/last_error/code").asText()); assertFalse(state.at("/last_error/retryable").asBoolean());
        assertEquals(state, open().get("save_state"));
        assertEquals(0, count(database, "draft_savepoint")); assertEquals(0, count(database, "draft_receipt")); assertEquals(1, count(database, "draft_checkpoint"));
    }

    @Test void inactiveModeAndMissingV4NeverMigrateOrWrite() throws Exception {
        var initial = open().get("draft_token"); host.close();
        Path inactiveRoot = temporary.resolve("inactive"); var inactive = create(inactiveRoot, false, ignored -> { });
        setupMvc(inactiveRoot, root().resolve("packages/profiles"));
        error(saveRequest("save.inactive", initial), 409, "DRAFT_MODE_REQUIRED");
        assertEquals("DRAFT_MODE_REQUIRED", postCall("pin", pinRequest("pin.inactive", initial, "PERMALINK"), 409).get("code").asText());
        assertEquals("DRAFT_MODE_REQUIRED", perform(authorized(get(URL + "save-state")), 409).get("code").asText());
        Path v3Root = temporary.resolve("v3"); var v3 = create(v3Root, true, ignored -> { });
        setupMvc(v3Root, root().resolve("packages/profiles"));
        error(saveRequest("save.v3", open().get("draft_token")), 503, "DRAFT_RECOVERY_REQUIRED");
        assertEquals("DRAFT_RECOVERY_REQUIRED", postCall("pin", pinRequest("pin.v3", open().get("draft_token"), "PERMALINK"), 503).get("code").asText());
        assertEquals(0, count(v3, "draft_savepoint"));
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + v3); var s = connection.createStatement(); var r = s.executeQuery("SELECT COUNT(*) FROM sqlite_master WHERE name='draft_checkpoint_overlay'")) { r.next(); assertEquals(0, r.getInt(1)); }
        assertEquals(0, count(inactive, "draft_savepoint"));
    }

    @Test void sqlFailureReturnsRetryableErrorAndSameRequestCanRecover() throws Exception {
        var request = saveRequest("save.sql", rename(open().get("draft_token"), "待保存"));
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + database); var statement = connection.createStatement()) {
            statement.execute("CREATE TRIGGER test_save_failure BEFORE INSERT ON draft_receipt WHEN NEW.operation='SAVE' BEGIN SELECT RAISE(ABORT,'测试失败'); END");
        }
        var result = postCall("save", request, 503); assertEquals("PERSISTENCE_FAILED", result.get("code").asText()); assertTrue(result.get("retryable").asBoolean());
        assertEquals(0, count(database, "draft_savepoint")); assertEquals(1, count(database, "draft_checkpoint")); assertEquals(1, count(database, "draft_content"));
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + database); var statement = connection.createStatement()) { statement.execute("DROP TRIGGER test_save_failure"); }
        assertEquals("SAVED", postCall("save", request, 200).get("status").asText());
        assertTrue(perform(authorized(get(URL + "save-state")), 200).get("last_error").isNull());
    }

    @Test void absentProjectAndWrongModelNeverCreateStorage() throws Exception {
        for (String path : List.of(URL.replace(PROJECT, "project.absent"), URL.replace(MODEL, "model.absent"))) {
            var result = perform(authorized(get(path + "save-state")), 404); assertEquals("NOT_FOUND", result.get("code").asText());
        }
        assertFalse(java.nio.file.Files.exists(temporary.resolve("projects/project.absent")));
        assertEquals(0, count(database, "draft_savepoint"));
    }

    @Test void allContextsAndExactBindingAreCheckedByTheSaveValidator() throws Exception {
        Path multiple = temporary.resolve("multiple");
        Path multiDb = create(multiple, true, document -> {
            var context = ((ObjectNode) document.at("/contexts/0")).deepCopy().put("context_id", "context.second");
            context.putArray("occurrence_ids"); ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("contexts")).add(context);
        }); migrate(multiDb); setupMvc(multiple, root().resolve("packages/profiles"));
        var saved = postCall("save", saveRequest("save.multiple", open().get("draft_token")), 200);
        var child = perform(get("/api/v1/projects/" + PROJECT + "/models/" + MODEL + "/contexts/context.second/text-projection")
                .param("request_id", "request.child").param("revision", saved.get("revision_id").asText()), 200);
        assertTrue(child.at("/data/sentences").isEmpty()); assertEquals(1, count(multiDb, "draft_savepoint"));
        Path other = temporary.resolve("old-binding");
        Path otherDb = create(other, true, document -> ((ObjectNode) document.at("/profile_binding/symbol_catalog/digest")).put("digest", "a".repeat(64)));
        migrate(otherDb); setupMvc(other, root().resolve("packages/profiles"));
        error(saveRequest("save.old-binding", open().get("draft_token")), 409, "RULE_VERSION_CONFLICT");
        assertEquals(0, count(otherDb, "draft_savepoint")); assertEquals(0, count(otherDb, "draft_receipt"));
    }

    @Test void rootWithoutFactsCanBeSavedAndReadWithEmptyText() throws Exception {
        Path empty = temporary.resolve("empty");
        Path emptyDb = create(empty, true, document -> {
            var layouts = new java.util.HashSet<String>(); var ids = new java.util.HashSet<String>();
            var occurrences = (com.fasterxml.jackson.databind.node.ArrayNode) document.get("occurrences");
            for (int i = occurrences.size() - 1; i >= 0; i--) if (occurrences.get(i).get("target_kind").asText().equals("FACT")) {
                ids.add(occurrences.get(i).get("occurrence_id").asText()); layouts.add(occurrences.get(i).get("layout_id").asText()); occurrences.remove(i);
            }
            var values = (com.fasterxml.jackson.databind.node.ArrayNode) document.get("layouts");
            for (int i = values.size() - 1; i >= 0; i--) if (layouts.contains(values.get(i).get("layout_id").asText())) values.remove(i);
            for (var context : document.get("contexts")) {
                values = (com.fasterxml.jackson.databind.node.ArrayNode) context.get("occurrence_ids");
                for (int i = values.size() - 1; i >= 0; i--) if (ids.contains(values.get(i).asText())) values.remove(i);
            }
            document.putArray("facts"); document.remove("text_artifact"); document.putArray("text_traces");
        }); migrate(emptyDb); setupMvc(empty, root().resolve("packages/profiles"));
        var result = postCall("save", saveRequest("save.empty", open().get("draft_token")), 200);
        assertTrue(historical("text", result.get("revision_id").asText()).at("/data/sentences").isEmpty()); assertEquals(1, count(emptyDb, "draft_savepoint"));
    }

    @Test void multipleNonemptyOpdsSaveOnceAndHistoricalChildSurvivesSharedElementRename() throws Exception {
        Path multiple = temporary.resolve("shared-opds");
        Path multiDb = create(multiple, true, document -> {
            addOwnedContext(document, "context.child", "PROCESS_REFINEMENT");
            addOwnedContext(document, "context.other", "OBJECT_REFINEMENT");
        }); migrate(multiDb); setupMvc(multiple, root().resolve("packages/profiles"));
        var token = open().get("draft_token");
        var query = JSON.createObjectNode().put("request_id", "request.child").put("context_id", "context.child"); query.set("draft_token", token);
        var draftText = postCall("text", query, 200).get("data"); assertFalse(draftText.get("sentences").isEmpty());
        var saved = postCall("save", saveRequest("save.opds", token), 200); String revision = saved.get("revision_id").asText();
        var before = historicalContext("text", revision, "context.child").get("data");
        var projection = historicalContext("projection", revision, "context.child").get("data");
        var updated = rename(token, "多图共享新名称"); query.set("draft_token", updated);
        assertTrue(postCall("text", query, 200).toString().contains("多图共享新名称"));
        var after = postCall("save", saveRequest("save.opds.second", updated), 200);
        assertEquals(before, historicalContext("text", revision, "context.child").get("data"));
        assertEquals(projection, historicalContext("projection", revision, "context.child").get("data"));
        assertTrue(historicalContext("text", after.get("revision_id").asText(), "context.other").toString().contains("多图共享新名称"));
        assertEquals(2, count(multiDb, "draft_savepoint")); assertEquals(1, count(multiDb, "draft_journal")); assertEquals(1, count(multiDb, "revision_document"));
        setupMvc(multiple, root().resolve("packages/profiles"));
        assertEquals(before, historicalContext("text", revision, "context.child").get("data"));
    }

    @Test void invalidChildAndOrphanFactCannotBecomeSuccessfulWholeModelSave() throws Exception {
        for (String fault : List.of("child-owner", "orphan")) {
            Path storage = temporary.resolve(fault);
            Path db = create(storage, true, document -> {
                addOwnedContext(document, "context.child", "PROCESS_REFINEMENT");
                if (fault.equals("child-owner")) {
                    for (var occurrence : document.get("occurrences")) if (occurrence.get("occurrence_id").asText().equals("context.child.occurrence.raw"))
                        ((ObjectNode) occurrence).put("ownership", "REFERENCED");
                } else {
                    var removed = new java.util.HashSet<String>();
                    var occurrences = (com.fasterxml.jackson.databind.node.ArrayNode) document.get("occurrences");
                    for (int i = occurrences.size() - 1; i >= 0; i--) if (occurrences.get(i).get("target_kind").asText().equals("FACT")) {
                        removed.add(occurrences.get(i).get("occurrence_id").asText()); occurrences.remove(i);
                    }
                    for (var context : document.get("contexts")) {
                        var ids = (com.fasterxml.jackson.databind.node.ArrayNode) context.get("occurrence_ids");
                        for (int i = ids.size() - 1; i >= 0; i--) if (removed.contains(ids.get(i).asText())) ids.remove(i);
                    }
                }
            }); migrate(db); setupMvc(storage, root().resolve("packages/profiles"));
            error(saveRequest("save." + fault, open().get("draft_token")), 422, "SAVE_VALIDATION_BLOCKED");
            assertEquals(0, count(db, "draft_savepoint")); assertEquals(0, count(db, "draft_receipt")); assertEquals(1, count(db, "draft_content")); assertEquals(1, count(db, "draft_checkpoint"));
        }
    }

    private JsonNode historical(String endpoint, String revision) throws Exception {
        return historicalContext(endpoint, revision, CONTEXT);
    }
    private JsonNode historicalContext(String endpoint, String revision, String context) throws Exception {
        String path = "/api/v1/projects/" + PROJECT + "/models/" + MODEL + "/"
                + (endpoint.equals("workspace") ? "workspace-session" : "contexts/" + context + "/" + (endpoint.equals("text") ? "text-projection" : endpoint));
        var response = perform(get(path).param("request_id", "request.history").param("revision", revision).param("context", context), 200);
        assertEquals(revision, response.at("/meta/read_revision").asText()); return response;
    }
    private JsonNode open() throws Exception { return postCall("open", JSON.createObjectNode().put("request_id", "request.open").putNull("context_id"), 200); }
    private JsonNode rename(JsonNode token, String name) throws Exception {
        var query = JSON.createObjectNode().put("request_id", "request.capabilities"); query.set("draft_token", token);
        query.putObject("scope").put("context_id", CONTEXT).put("selection_id", "element.raw.material").put("intent", "UPDATE_PROPERTY").putArray("endpoints");
        var option = postCall("capabilities", query, 200).at("/data/options/0"); assertTrue(option.isObject());
        var edit = JSON.createObjectNode().put("request_id", "request.edit").put("command_id", "command." + java.util.UUID.randomUUID());
        edit.set("expected_draft_token", token); edit.set("scope", query.get("scope"));
        edit.putObject("authorization").set("capability_query_id", option.get("capability_query_id")); ((ObjectNode) edit.get("authorization")).set("selected_option_id", option.get("option_id"));
        var payload = edit.putObject("command").put("command_type", "UPDATE_PROPERTY").putObject("payload").put("property_name", "name").put("value", name);
        payload.putObject("target_ref").put("target_kind", "ELEMENT").put("target_id", "element.raw.material");
        return postCall("commands", edit, 200).get("result_token");
    }
    private ObjectNode pinRequest(String id, JsonNode token, String purpose) { var value = JSON.createObjectNode().put("pin_id", id).put("purpose", purpose); value.set("target_draft_token", token); return value; }
    private ObjectNode saveRequest(String id, JsonNode token) { var value = JSON.createObjectNode().put("save_id", id).put("reason", "MANUAL"); value.set("target_draft_token", token); return value; }
    private void error(JsonNode request, int status, String code) throws Exception { var result = postCall("save", request, status); assertEquals(code, result.get("code").asText()); DraftSaveContract.read(result.toString(), DraftSaveContract.SaveError.class); }
    private JsonNode postCall(String operation, JsonNode request, int status) throws Exception { return perform(authorized(post(URL + operation)).contentType(MediaType.APPLICATION_JSON).content(request.toString()), status); }
    private MockHttpServletRequestBuilder authorized(MockHttpServletRequestBuilder request) { return request.header("Origin", "http://localhost:5173").header("X-OPM-Session", "test-session"); }
    private JsonNode perform(MockHttpServletRequestBuilder request, int status) throws Exception {
        var result = mvc.perform(request).andReturn();
        if (result.getResponse().getStatus() != status && result.getResolvedException() != null)
            throw new AssertionError(result.getResponse().getContentAsString(), result.getResolvedException());
        assertEquals(status, result.getResponse().getStatus(), result.getResponse().getContentAsString());
        return JSON.readTree(result.getResponse().getContentAsString());
    }
    private static void migrate(Path database) {
        Flyway.configure().dataSource("jdbc:sqlite:" + database, "", "").locations("filesystem:" + root().resolve("docs/contracts/migrations/sqlite"),
                "filesystem:" + root().resolve("docs/contracts/migrations/sqlite-checkpoint"),
                "filesystem:" + root().resolve("docs/contracts/migrations/sqlite-pin")).target("5").mixed(true).load().migrate();
    }
}
