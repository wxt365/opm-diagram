package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.api.generated.DraftSaveContract;
import org.opm.localruntime.api.generated.DraftSaveContract.*;
import org.opm.localruntime.api.generated.DraftWorkspaceContract;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.storage.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.function.Consumer;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.root;

class HybridSaveActivationTest {
    @TempDir Path temporary;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String TIME = "2026-09-14T00:00:00.000Z";
    private record Input(Path prepared, HybridSavePreparationTest.Source source, DraftActivationRequest request) { }

    @Test void activatesBothLegacyVersionsAndPreservesAllContextsAndHistoricalReferences() throws Exception {
        for (String version : List.of("1", "2")) {
            var input = input("version" + version, version, document -> DraftWorkspaceTestDatabase.addOwnedContext(document, "context.second", "MODEL_VIEW"));
            String original = hash(input.source.path());
            Path output = temporary.resolve("active" + version); var service = service();
            var report = service.activate(input.prepared, output, migrations(), input.request);
            assertEquals("ACTIVATED_COPY", report.status()); assertEquals(2L, report.context_count());
            assertEquals(0L, report.preparation().token().edit_seq());
            assertEquals(report, service.verify(output)); assertEquals(report, service.activate(input.prepared, output, migrations(), input.request));
            assertEquals(original, hash(input.source.path()));
            assertEquals(report.preparation(), new HybridSavePreparation().verify(input.prepared));
            Path database = database(output, report);
            assertEquals("2", scalar(database, "SELECT count(*) FROM revision_document"));
            assertEquals("0", scalar(database, "SELECT count(*) FROM draft_journal"));
            assertEquals("0", scalar(database, "SELECT count(*) FROM draft_savepoint"));
            assertEquals("revision.before", scalar(database, "SELECT revision_id FROM named_snapshot"));
            assertEquals("revision.before", scalar(database, "SELECT revision_id FROM baseline"));
            assertEquals(input.source.raw(), scalar(database, "SELECT document_json FROM revision_document WHERE revision_sequence=2"));
            assertEquals(report.database_sha256(), hash(database));
        }
    }

    @Test void rejectsUntrustedInputsAndNeverOverwritesAnExistingOrLinkedRoot() throws Exception {
        var input = input("guards", "2", ignored -> { }); var service = service();
        Path output = temporary.resolve("guards-output");
        assertCode("PREPARATION_MISMATCH", () -> service.activate(input.prepared, output, migrations(), new DraftActivationRequest("a".repeat(64), TIME)));
        assertFalse(Files.exists(output));
        assertCode("INPUT_INVALID", () -> service.activate(input.prepared, output, migrations(), new DraftActivationRequest(input.request.preparation_report_sha256(), "2026-01-01T00:00:00.000Z")));
        assertCode("INPUT_INVALID", () -> service.activate(input.prepared, input.prepared.resolve("child"), migrations(), input.request));
        Files.createDirectory(output); Files.writeString(output.resolve("keep.txt"), "保留");
        assertCode("OUTPUT_EXISTS", () -> service.activate(input.prepared, output, migrations(), input.request));
        assertEquals("保留", Files.readString(output.resolve("keep.txt")));
        Path link = temporary.resolve("link"); Files.createSymbolicLink(link, output);
        assertCode("INPUT_INVALID", () -> service.activate(input.prepared, link, migrations(), input.request));
        Path linkedInput = temporary.resolve("linked-input"); Files.createSymbolicLink(linkedInput, input.prepared);
        assertCode("INPUT_INVALID", () -> service.activate(linkedInput, temporary.resolve("unused"), migrations(), input.request));
    }

    @Test void missingAssetsOrUnsupportedContextRejectBeforeOutputCreation() throws Exception {
        var input = input("assets", "2", ignored -> { });
        var missing = new FileProfilePackageLoader(temporary.resolve("missing-assets"));
        var service = new HybridSaveActivation(new LocalApiService(new ProjectDatabaseFactory(temporary), missing), missing);
        Path output = temporary.resolve("asset-output");
        assertCode("VALIDATION_BLOCKED", () -> service.activate(input.prepared, output, migrations(), input.request)); assertFalse(Files.exists(output));
        var unsupported = input("unsupported", "2", document -> DraftWorkspaceTestDatabase.addOwnedContext(document, "context.unsupported", "PROFILE_CONTEXT"));
        assertCode("VALIDATION_BLOCKED", () -> service().activate(unsupported.prepared, output, migrations(), unsupported.request)); assertFalse(Files.exists(output));
    }

    @Test void missingMigrationLeavesUnconsumableCopyAndOriginalModeUntouched() throws Exception {
        var input = input("migration", "2", ignored -> { }); Path output = temporary.resolve("migration-output");
        assertCode("SCHEMA_MISMATCH", () -> service().activate(input.prepared, output, temporary, input.request));
        assertFalse(Files.exists(output.resolve("report.json")));
        assertEquals("0", scalar(output.resolve("storage/projects/project.preparation/project.db"), "SELECT count(*) FROM model_save_mode"));
        assertCode("OUTPUT_EXISTS", () -> service().activate(input.prepared, output, migrations(), input.request));
        assertNotNull(new HybridSavePreparation().verify(input.prepared));
    }

    @Test void verifierRejectsLogicalTamperingEvenWithNewFileHashAndClosedReportShape() throws Exception {
        var input = input("tamper", "2", ignored -> { }); Path output = temporary.resolve("tamper-output");
        var service = service(); var report = service.activate(input.prepared, output, migrations(), input.request);
        String raw = Files.readString(output.resolve("report.json"));
        for (Consumer<ObjectNode> mutation : List.<Consumer<ObjectNode>>of(value -> value.put("unexpected", true),
                value -> value.put("context_count", 999), value -> value.put("status", "INSTALLED"), value -> value.put("readback_digest", "0".repeat(64)))) {
            ObjectNode changed = (ObjectNode) JSON.readTree(raw); mutation.accept(changed); Files.writeString(output.resolve("report.json"), changed.toString());
            assertCode("CONTENT_MISMATCH", () -> service.verify(output));
        }
        Files.writeString(output.resolve("report.json"), raw);
        Path database = database(output, report);
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + database); var statement = connection.createStatement()) {
            statement.executeUpdate("UPDATE project_metadata SET description='篡改旧行'");
        }
        ObjectNode changed = (ObjectNode) JSON.readTree(raw); changed.put("database_sha256", hash(database)).put("database_bytes", Files.size(database));
        Files.writeString(output.resolve("report.json"), changed.toString());
        assertCode("CONTENT_MISMATCH", () -> service.verify(output));
    }

    @Test void activatedCopyCanEditSavePinAndReopenWithoutTestModeInjection() throws Exception {
        var input = input("runtime", "2", document -> DraftWorkspaceTestDatabase.addOwnedContext(document, "context.second", "MODEL_VIEW"));
        Path output = temporary.resolve("runtime-output"); var report = service().activate(input.prepared, output, migrations(), input.request);
        String project = report.preparation().request().project_id(), model = report.preparation().request().model_id();
        Path runtime = temporary.resolve("runtime-store"); Path db = runtime.resolve("projects/" + project + "/project.db");
        Files.createDirectories(db.getParent()); Files.copy(database(output, report), db);
        var factory = new ProjectDatabaseFactory(runtime); var loader = loader(); var domain = new LocalApiService(factory, loader);
        var clock = Clock.fixed(Instant.parse(TIME), ZoneOffset.UTC);
        var workspace = new DraftWorkspaceService(factory, domain, loader, clock);
        var legacy = new LinkedHashMap<String, Object>(); legacy.put("request_id", "request.legacy"); legacy.put("command_id", "command.legacy");
        legacy.put("base_revision", report.preparation().request().expected_revision_id()); legacy.put("binding", domain.activeProfileRuleBinding());
        legacy.put("command_type", "CREATE_ELEMENT"); legacy.put("payload", Map.of("kind", "OBJECT", "name", "旧协议不能写入", "x", 12d, "y", 15d));
        var rejected = assertThrows(org.opm.localruntime.api.ApiException.class, () -> domain.edit(project, model, "context.sd.root", legacy));
        assertEquals(org.opm.localruntime.api.ApiErrorCode.PERSISTENCE_FAILED, rejected.code());
        assertEquals("2", scalar(db, "SELECT count(*) FROM revision_document"));
        var open = workspace.execute(project, model, DraftWorkspaceContract.read("{\"request_id\":\"request.activation\",\"context_id\":null}", DraftWorkspaceContract.Type.OpenDraftRequest));
        assertEquals(report.preparation().token().draft_id(), open.at("/draft_token/draft_id").asText());
        assertEquals(report.preparation().token().binding_digest(), open.at("/draft_token/binding_digest").asText());
        assertEquals(0L, open.at("/draft_token/edit_seq").longValue());
        ObjectNode query = JSON.createObjectNode().put("request_id", "query.rename"); query.set("draft_token", open.get("draft_token"));
        var scope = query.putObject("scope").put("context_id", "context.sd.root").put("selection_id", "element.raw.material").put("intent", "UPDATE_PROPERTY"); scope.putArray("endpoints");
        var options = workspace.execute(project, model, DraftWorkspaceContract.read(query.toString(), DraftWorkspaceContract.Type.DraftCapabilitiesRequest));
        var option = options.at("/data/options/0"); assertTrue(option.get("enabled").asBoolean());
        var edit = JSON.createObjectNode().put("request_id", "request.rename").put("command_id", "command.rename");
        edit.set("expected_draft_token", open.get("draft_token")); edit.set("scope", scope);
        edit.putObject("authorization").put("capability_query_id", option.get("capability_query_id").asText()).put("selected_option_id", option.get("option_id").asText());
        var payload = edit.putObject("command").put("command_type", "UPDATE_PROPERTY").putObject("payload").put("property_name", "name").put("value", "迁移后对象");
        payload.putObject("target_ref").put("target_kind", "ELEMENT").put("target_id", "element.raw.material");
        var result = workspace.execute(project, model, DraftWorkspaceContract.read(edit.toString(), DraftWorkspaceContract.Type.DraftEditRequest));
        var token = new DraftToken(result.at("/result_token/draft_id").asText(), result.at("/result_token/edit_seq").longValue(), result.at("/result_token/binding_digest").asText()); assertEquals(1L, token.edit_seq());
        try (var saves = new DraftSaveService(factory, loader, clock, System::nanoTime, java.util.concurrent.Executors.newSingleThreadScheduledExecutor())) {
            var saved = saves.save(project, model, new SaveRequest("save.activation", token, "MANUAL"));
            var pinned = saves.pin(project, model, new PinRequest("pin.activation", token, "PERMALINK"));
            assertNotEquals(saved.revision_id(), pinned.revision_id());
            assertEquals(pinned.revision_id(), saves.pin(project, model, new PinRequest("pin.activation.repeat", token, "PERMALINK")).revision_id());
            for (String context : List.of("context.sd.root", "context.second")) {
                var text = JSON.valueToTree(domain.text("request.text", project, model, context, pinned.revision_id()));
                assertTrue(text.toString().contains("迁移后对象"));
                assertNotNull(domain.projection("request.projection", project, model, context, pinned.revision_id()).get("data"));
            }
            assertNotNull(domain.projection("request.old", project, model, "context.sd.root", "revision.before").get("data"));
        }
        assertEquals("2", scalar(db, "SELECT count(*) FROM revision_document")); assertEquals("2", scalar(db, "SELECT count(*) FROM draft_savepoint"));
        // 数据库底层也拒绝旧HEAD写入，不依赖前端隐藏按钮。
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + db); var statement = connection.createStatement()) {
            assertThrows(java.sql.SQLException.class, () -> statement.executeUpdate("UPDATE model_head SET head_sequence=head_sequence+1"));
        }
        assertEquals(report, service().verify(output));
    }

    @Test void readbackDigestPreservesSignedZeroAndFullReportDecoderRejectsUnknownFields() throws Exception {
        var negative = input("negative", "2", ignored -> { });
        var positive = input("positive", "2", document -> ((ObjectNode) document.at("/layouts/0")).put("x", 0d));
        var left = service().activate(negative.prepared, temporary.resolve("negative-output"), migrations(), negative.request);
        var right = service().activate(positive.prepared, temporary.resolve("positive-output"), migrations(), positive.request);
        assertNotEquals(left.readback_digest(), right.readback_digest());
        assertEquals(left, DraftSaveContract.read(JSON.writeValueAsString(left), DraftActivationReport.class));
        ObjectNode raw = JSON.valueToTree(left); raw.put("extra", true);
        assertThrows(Exception.class, () -> DraftSaveContract.read(raw.toString(), DraftActivationReport.class));
        assertThrows(Exception.class, () -> DraftSaveContract.read("{\"preparation_report_sha256\":\"" + "a".repeat(64) + "\",\"activated_at\":\"2026-09-14T00:00:00.000Z\",\"source\":null}", DraftActivationRequest.class));
    }

    private Input input(String name, String version, Consumer<ObjectNode> arrange) throws Exception {
        var source = HybridSavePreparationTest.source(temporary, name, version, arrange); Path prepared = temporary.resolve(name + "-prepared");
        new HybridSavePreparation().prepare(source.path(), prepared, migrations().resolve("sqlite"), source.request());
        return new Input(prepared, source, new DraftActivationRequest(hash(prepared.resolve("report.json")), TIME));
    }
    private HybridSaveActivation service() { var loader = loader(); return new HybridSaveActivation(new LocalApiService(new ProjectDatabaseFactory(temporary), loader), loader); }
    private FileProfilePackageLoader loader() { return new FileProfilePackageLoader(root().resolve("packages/profiles")); }
    private Path migrations() { return root().resolve("docs/contracts/migrations"); }
    private static Path database(Path output, DraftActivationReport report) { return output.resolve("storage/projects/" + report.preparation().request().project_id() + "/project.db"); }
    private static String hash(Path path) throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path))); }
    private static String scalar(Path database, String sql) throws Exception {
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + database); var statement = connection.createStatement(); var rows = statement.executeQuery(sql)) { assertTrue(rows.next()); return rows.getString(1); }
    }
    private static void assertCode(String code, Runnable action) {
        var error = assertThrows(HybridSaveActivation.Failure.class, action::run); assertEquals("DRAFT_ACTIVATION_" + code, error.code(), () -> String.valueOf(error.getCause()));
    }
}
