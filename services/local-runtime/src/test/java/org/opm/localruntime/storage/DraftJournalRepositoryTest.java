package org.opm.localruntime.storage;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.api.generated.DraftSaveContract.DraftPreparationRequest;
import org.opm.localruntime.api.generated.DraftWorkspaceContract;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;

class DraftJournalRepositoryTest {
    @TempDir Path temporary;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String PROJECT = "project.journal", MODEL = "model.golden.proc", NOW = "2026-09-11T00:00:00.000Z";
    // 仅存储测试结果，不作为实际语义生成证据。
    private static final String SUMMARY = "{\"blocking\":0,\"warning\":0,\"suggestion\":0,\"coverage_state\":\"EVIDENCE_MISSING\"}";

    @Test void recoveryStateIgnoresLongHistoryAndTracksBothDirectionsAndBranches() throws Exception {
        Path database = database("recovery-state", true); var repository = repository(database, 0);
        var history = new OperationHistoryRepository(SqliteSnapshots.scope(database), clock(0));
        var initial = repository.read(PROJECT, MODEL);
        assertEquals(0, history.recovery(PROJECT, MODEL, JSON.valueToTree(initial.token())).path("items").size());
        repository.commit(PROJECT, MODEL, request(initial, "command.first"), document -> move(document, 111));
        var first = repository.read(PROJECT, MODEL);
        repository.commit(PROJECT, MODEL, request(first, "command.second"), document -> move(document, 222));
        try (var connection = SqliteTestSupport.connection(database)) {
            for (int i = 0; i < 350; i++) execute(connection,
                "INSERT INTO idempotency_record(operation_id,aggregate_id,command_id,request_digest,result_status,result_revision_id,result_json,created_at,expires_at) SELECT operation_id,aggregate_id,?,request_digest,result_status,result_revision_id,result_json,created_at,expires_at FROM idempotency_record WHERE operation_id='DRAFT_OPERATION_HISTORY_V1' AND aggregate_id=? AND command_id='EDIT.command.first'",
                "EDIT.padding." + i, MODEL);
        }
        var second = repository.read(PROJECT, MODEL);
        var state = history.recovery(PROJECT, MODEL, JSON.valueToTree(second.token()));
        assertEquals(1, state.path("items").size()); assertTrue(state.path("next_before").isNull());
        assertEquals("history.EDIT.command.second", state.at("/items/0/record_id").asText());
        code("DRAFT_CONFLICT", () -> history.recovery(PROJECT, MODEL, JSON.valueToTree(first.token())));
        repository.commit(PROJECT, MODEL, recoveryRequest(second, "command.undo.second", "history.EDIT.command.second", "UNDO"), DraftJournalRepositoryTest::proposal);
        var undone = repository.read(PROJECT, MODEL);
        state = history.recovery(PROJECT, MODEL, JSON.valueToTree(undone.token()));
        assertEquals(2, state.path("items").size());
        assertEquals("UNDO", state.at("/items/0/recovery_action").asText()); assertEquals("REDO", state.at("/items/1/recovery_action").asText());
        new DraftSaveRepository(database, clock(10)).checkpoint(PROJECT, MODEL, ignored -> { });
        assertEquals(2, history.recovery(PROJECT, MODEL, JSON.valueToTree(undone.token())).path("items").size());
        repository.commit(PROJECT, MODEL, recoveryRequest(undone, "command.undo.first", "history.EDIT.command.first", "UNDO"), DraftJournalRepositoryTest::proposal);
        assertEquals("REDO", history.recovery(PROJECT, MODEL, JSON.valueToTree(repository.read(PROJECT, MODEL).token())).at("/items/0/recovery_action").asText());
        repository.commit(PROJECT, MODEL, request(repository.read(PROJECT, MODEL), "command.branch"), document -> move(document, 333));
        state = history.recovery(PROJECT, MODEL, JSON.valueToTree(repository.read(PROJECT, MODEL).token()));
        assertEquals(1, state.path("items").size()); assertEquals("UNDO", state.at("/items/0/recovery_action").asText());
    }

    @Test void multipleOperationsUndoToInitialAcrossSaveReopenAndBranch() throws Exception {
        Path database = database("recovery", true); var repository = repository(database, 0);
        var initial = repository.read(PROJECT, MODEL);
        for (int step = 1; step <= 3; step++) {
            final int value = step;
            repository.commit(PROJECT, MODEL, request(repository.read(PROJECT, MODEL), "command.step" + step), document -> move(document, 100 + value));
        }
        new DraftSaveRepository(database, clock(10)).checkpoint(PROJECT, MODEL, ignored -> { });
        for (int step = 3; step >= 1; step--) {
            repository = repository(database, 12);
            var current = repository.read(PROJECT, MODEL);
            var undo = recoveryRequest(current, "command.undo" + step, "history.EDIT.command.step" + step, "UNDO");
            repository.commit(PROJECT, MODEL, undo, DraftJournalRepositoryTest::proposal);
            var after = repository.read(PROJECT, MODEL);
            repository.commit(PROJECT, MODEL, undo, ignored -> { fail("Idempotent replay must not execute"); return null; });
            assertEquals(after.token(), repository.read(PROJECT, MODEL).token());
            var entries = new OperationHistoryRepository(SqliteSnapshots.scope(database), clock(12)).read(PROJECT, MODEL, "HEAD", null).get("items");
            for (var entry : entries) {
                if (entry.path("record_id").asText().equals("history.EDIT.command.step" + step)) assertEquals("REDO", entry.path("recovery_action").asText());
                assertNotEquals("RESTORE_OPERATION", entry.path("operation").asText());
            }
            if (step > 1) assertTrue(entries.toString().contains("history.EDIT.command.step" + (step - 1)));
        }
        assertEquals(initial.documentJson(), repository.read(PROJECT, MODEL).documentJson());
        repository.commit(PROJECT, MODEL, request(repository.read(PROJECT, MODEL), "command.branch"), document -> move(document, 456));
        var branched = repository.read(PROJECT, MODEL);
        var stale = recoveryRequest(branched, "command.stale", "history.EDIT.command.step3", "UNDO");
        final var active = repository;
        code("DRAFT_CONFLICT", () -> active.commit(PROJECT, MODEL, stale, DraftJournalRepositoryTest::proposal));
        repository.commit(PROJECT, MODEL, recoveryRequest(branched, "command.undo.branch", "history.EDIT.command.branch", "UNDO"), DraftJournalRepositoryTest::proposal);
        assertEquals(initial.documentJson(), repository.read(PROJECT, MODEL).documentJson());
    }
    @Test void oldJournalCanReconnectUndoHistoryWithoutStoredRecoverySlots() throws Exception {
        Path database = database("old-recovery", true); var repository = repository(database, 0);
        var initial = repository.read(PROJECT, MODEL);
        repository.commit(PROJECT, MODEL, request(initial, "command.old1"), document -> move(document, 111));
        repository.commit(PROJECT, MODEL, request(repository.read(PROJECT, MODEL), "command.old2"), document -> move(document, 222));
        try (var connection = SqliteTestSupport.connection(database)) {
            execute(connection, "DELETE FROM idempotency_record WHERE operation_id='DRAFT_OPERATION_RECOVERY_V1'");
        }
        for (int step = 2; step >= 1; step--) {
            var history = new OperationHistoryRepository(SqliteSnapshots.scope(database), clock(0)).read(PROJECT, MODEL, "HEAD", null);
            assertTrue(history.toString().contains("\"recovery_action\":\"UNDO\""));
            repository.commit(PROJECT, MODEL, recoveryRequest(repository.read(PROJECT, MODEL), "command.old.undo" + step,
                    "history.EDIT.command.old" + step, "UNDO"), DraftJournalRepositoryTest::proposal);
        }
        assertEquals(initial.documentJson(), repository.read(PROJECT, MODEL).documentJson());
    }

    @Test void redoChainSurvivesReopenDirectionChangesAndNewBranch() throws Exception {
        Path database = database("redo-chain", true); var repository = repository(database, 0);
        var states = new java.util.ArrayList<String>(); states.add(repository.read(PROJECT, MODEL).documentJson());
        for (int i = 1; i <= 3; i++) {
            final int x = i * 100;
            repository.commit(PROJECT, MODEL, request(repository.read(PROJECT, MODEL), "command.edit" + i), document -> move(document, x));
            states.add(repository.read(PROJECT, MODEL).documentJson());
        }
        for (int i = 3; i >= 1; i--) {
            repository = repository(database, i + 10);
            repository.commit(PROJECT, MODEL, recoveryRequest(repository.read(PROJECT, MODEL), "command.undo" + i, "history.EDIT.command.edit" + i, "UNDO"), DraftJournalRepositoryTest::proposal);
            assertEquals(states.get(i - 1), repository.read(PROJECT, MODEL).documentJson());
        }
        new DraftSaveRepository(database, clock(20)).checkpoint(PROJECT, MODEL, ignored -> { });
        for (int i = 1; i <= 3; i++) {
            repository = repository(database, i + 20);
            var history = new OperationHistoryRepository(SqliteSnapshots.scope(database), clock(25)).read(PROJECT, MODEL, "HEAD", null);
            assertTrue(history.toString().contains("\"recovery_action\":\"REDO\""));
            var redo = recoveryRequest(repository.read(PROJECT, MODEL), "command.redo" + i, "history.EDIT.command.edit" + i, "REDO");
            repository.commit(PROJECT, MODEL, redo, DraftJournalRepositoryTest::proposal);
            var after = repository.read(PROJECT, MODEL);
            assertEquals(states.get(i), after.documentJson());
            repository.commit(PROJECT, MODEL, redo, ignored -> { fail("Replay must not execute"); return null; });
            assertEquals(after.token(), repository.read(PROJECT, MODEL).token());
        }
        repository.commit(PROJECT, MODEL, recoveryRequest(repository.read(PROJECT, MODEL), "command.undo-again", "history.EDIT.command.edit3", "UNDO"), DraftJournalRepositoryTest::proposal);
        var beforeFailure = repository.read(PROJECT, MODEL);
        var failed = recoveryRequest(beforeFailure, "command.failed-redo", "history.EDIT.command.edit3", "REDO");
        final var active = repository;
        assertThrows(IllegalStateException.class, () -> active.commit(PROJECT, MODEL, failed, document -> { throw new IllegalStateException("reject"); }));
        assertEquals(beforeFailure.token(), repository.read(PROJECT, MODEL).token());
        repository.commit(PROJECT, MODEL, failed, DraftJournalRepositoryTest::proposal);
        assertEquals(states.get(3), repository.read(PROJECT, MODEL).documentJson());
        repository.commit(PROJECT, MODEL, recoveryRequest(repository.read(PROJECT, MODEL), "command.undo-branch", "history.EDIT.command.edit3", "UNDO"), DraftJournalRepositoryTest::proposal);
        repository.commit(PROJECT, MODEL, request(repository.read(PROJECT, MODEL), "command.new-branch"), document -> move(document, 999));
        var stale = recoveryRequest(repository.read(PROJECT, MODEL), "command.stale-redo", "history.EDIT.command.edit3", "REDO");
        code("DRAFT_CONFLICT", () -> active.commit(PROJECT, MODEL, stale, DraftJournalRepositoryTest::proposal));
        assertFalse(new OperationHistoryRepository(SqliteSnapshots.scope(database), clock(30)).read(PROJECT, MODEL, "HEAD", null).toString().contains("\"recovery_action\":\"REDO\""));
    }

    @Test void failedRecoveryLeavesModelAndRecoveryPointUnchanged() throws Exception {
        Path database = database("recovery-failed", true); var repository = repository(database, 0);
        repository.commit(PROJECT, MODEL, request(repository.read(PROJECT, MODEL), "command.change"), document -> move(document, 123));
        var changed = repository.read(PROJECT, MODEL);
        var undo = recoveryRequest(changed, "command.undo", "history.EDIT.command.change", "UNDO");
        assertThrows(IllegalStateException.class, () -> repository.commit(PROJECT, MODEL, undo, document -> { throw new IllegalStateException("reject"); }));
        assertEquals(changed.token(), repository.read(PROJECT, MODEL).token());
        repository.commit(PROJECT, MODEL, undo, DraftJournalRepositoryTest::proposal);
        assertEquals(changed.token().edit_seq() + 1, repository.read(PROJECT, MODEL).token().edit_seq());
    }

    private static DraftWorkspaceContract.Document recoveryRequest(DraftJournalRepository.Snapshot snapshot, String command, String record, String action) {
        var input = (ObjectNode) request(snapshot, command).value();
        ((ObjectNode) input.get("scope")).put("intent", "RESTORE_OPERATION");
        input.putObject("command").put("command_type", "RESTORE_OPERATION").putObject("payload").put("record_id", record).put("action", action);
        return checked(input);
    }

    @Test void stateReadsMetadataWithoutReplayingDocumentAndRetainsScopeGuards() throws Exception {
        Path database = database("state", true); var repository = repository(database, 0);
        var initial = repository.read(PROJECT, MODEL);
        assertState(initial, repository.readState(PROJECT, MODEL));
        repository.commit(PROJECT, MODEL, request(initial, "command.state"), document -> move(document, 2));
        var edited = repository.read(PROJECT, MODEL);
        assertState(edited, repository.readState(PROJECT, MODEL));
        code("NOT_FOUND", () -> repository.readState("project.other", MODEL));
        try (var connection = org.opm.localruntime.storage.SqliteTestSupport.create(database).getConnection()) {
            execute(connection, org.opm.localruntime.storage.SqliteTestSupport.dropTriggerSql(connection, "draft_content_no_update", "draft_content"));
            execute(connection, "UPDATE draft_content SET artifact_json='{}'");
        }
        // 状态无须装载 JSON；真正打开草稿仍完整校验并拒绝损坏的内容。
        assertState(edited, repository.readState(PROJECT, MODEL));
        code("DRAFT_RECOVERY_REQUIRED", () -> repository.read(PROJECT, MODEL));
        try (var coordinator = new org.opm.localruntime.application.DraftSaveCoordinator(PROJECT, MODEL,
                new DraftSaveRepository(database, clock(0)), clockDocument -> fail("期限前不得读取或保存文档"), clock(0), System::nanoTime)) {
            assertEquals(edited.token(), coordinator.state().durable_token());
            coordinator.poll(); assertNull(coordinator.state().last_error());
        }
        Path old = database("state-old", false);
        code("DRAFT_MODE_REQUIRED", () -> repository(old, 0).readState(PROJECT, MODEL));
    }

    private static void assertState(DraftJournalRepository.Snapshot full, DraftJournalRepository.StateSnapshot state) {
        assertEquals(full.token(), state.token()); assertEquals(full.checkpointToken(), state.checkpointToken());
        assertEquals(full.dirtySince(), state.dirtySince()); assertEquals(full.deadline(), state.deadline());
        assertEquals(full.lastManualRevision(), state.lastManualRevision());
    }

    @Test
    void persistsDeltasAndReceiptsWithoutGrowingRevisionOrContentBlobs() throws Exception {
        Path database = database("main", true); var first = repository(database, 0); var initial = first.read(PROJECT, MODEL);
        var request = request(initial, "command.1");
        var result = first.commit(PROJECT, MODEL, request, document -> move(document, -0d));
        assertEquals("DURABLE", result.value().get("status").asText()); assertEquals(1, result.value().at("/result_token/edit_seq").intValue());
        var later = repository(database, 5); var next = later.read(PROJECT, MODEL);
        assertEquals(Double.doubleToRawLongBits(-0d), Double.doubleToRawLongBits(SaveContentDigestV1.read(next.documentJson()).at("/layouts/0/x").doubleValue()));
        later.commit(PROJECT, MODEL, request(next, "command.2"), document -> move(document, 2.25));
        var reopened = repository(database, 9).read(PROJECT, MODEL);
        assertEquals(2, reopened.token().edit_seq()); assertEquals(NOW, reopened.dirtySince()); assertEquals("2026-09-11T00:00:10.000Z", reopened.deadline());
        assertEquals(2.25, SaveContentDigestV1.read(reopened.documentJson()).at("/layouts/0/x").doubleValue());
        assertEquals(initial.token().draft_id(), reopened.token().draft_id());
        assertEquals(1, count(database, "revision_document")); assertEquals(1, count(database, "draft_content")); assertEquals(1, count(database, "draft_checkpoint"));
        assertEquals(0, count(database, "draft_savepoint")); assertEquals(2, count(database, "draft_journal")); assertEquals(2, count(database, "draft_receipt"));
        try (var connection = org.opm.localruntime.storage.SqliteTestSupport.create(database).getConnection(); var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT delta_json FROM draft_journal ORDER BY edit_seq LIMIT 1")) {
            assertTrue(rows.next()); assertTrue(rows.getString(1).contains("\"path\":[\"layouts\",\"0\",\"x\"]")); assertFalse(rows.getString(1).contains("profile_binding"));
            assertTrue(rows.getString(1).length() < initial.documentJson().length() / 4);
        }
    }

    @Test
    void unchangedAndResponseLossReplayDoNotEvaluateEffectAgain() throws Exception {
        Path database = database("retry", true); var repository = repository(database, 0); var initial = repository.read(PROJECT, MODEL);
        repository.commit(PROJECT, MODEL, request(initial, "command.clean.noop"), DraftJournalRepositoryTest::proposal);
        assertEquals(initial, repository.read(PROJECT, MODEL)); assertNull(repository.read(PROJECT, MODEL).deadline());
        var original = request(initial, "command.1"); var committed = repository.commit(PROJECT, MODEL, original, document -> move(document, 1));
        ObjectNode retry = (ObjectNode) original.value(); retry.put("request_id", "request.retry");
        var replay = repository.commit(PROJECT, MODEL, checked(retry), document -> { fail("重试不得重复执行领域修改"); return null; });
        assertEquals("request.retry", replay.value().get("request_id").asText()); assertEquals(committed.value().get("result_token"), replay.value().get("result_token"));
        var next = repository.read(PROJECT, MODEL); var noop = repository.commit(PROJECT, MODEL, request(next, "command.noop"), DraftJournalRepositoryTest::proposal);
        assertEquals("UNCHANGED", noop.value().get("status").asText()); assertEquals(1, count(database, "draft_journal")); assertEquals(3, count(database, "draft_receipt"));
        assertEquals(next, repository.read(PROJECT, MODEL));
        assertEquals("FOUND", receipt(repository, "command.1").value().get("status").asText());
        assertEquals("NOT_FOUND", receipt(repository, "command.absent").value().get("status").asText());
        ObjectNode different = (ObjectNode) original.value(); ((ObjectNode) different.at("/command/payload/layout")).put("x", 99);
        code("IDEMPOTENCY_MISMATCH", () -> repository.commit(PROJECT, MODEL, checked(different), DraftJournalRepositoryTest::proposal));
        code("DRAFT_CONFLICT", () -> repository.commit(PROJECT, MODEL, request(initial, "command.stale"), DraftJournalRepositoryTest::proposal));
    }

    @Test
    void rejectsWrongModeProjectBindingAndIllegalProposalWithoutWrites() throws Exception {
        Path database = database("guards", true); var repository = repository(database, 0); var initial = repository.read(PROJECT, MODEL);
        code("NOT_FOUND", () -> repository.read("project.other", MODEL));
        ObjectNode wrong = (ObjectNode) request(initial, "command.1").value(); ((ObjectNode) wrong.get("expected_draft_token")).put("binding_digest", "b".repeat(64));
        code("RULE_VERSION_CONFLICT", () -> repository.commit(PROJECT, MODEL, checked(wrong), DraftJournalRepositoryTest::proposal));
        code("INPUT_INVALID", () -> repository.commit(PROJECT, MODEL, request(initial, "command.1"), document -> { document.put("revision_id", "revision.fake"); return proposal(document); }));
        assertEquals(0, count(database, "draft_journal")); assertEquals(0, count(database, "draft_receipt")); assertEquals(initial, repository.read(PROJECT, MODEL));
        Path old = database("old", false); code("DRAFT_MODE_REQUIRED", () -> repository(old, 0).read(PROJECT, MODEL));
        Path legacy = database("legacy-v2", false, 2); code("DRAFT_MODE_REQUIRED", () -> repository(legacy, 0).read(PROJECT, MODEL));
        Path absent = temporary.resolve("absent.snapshot.json"); assertThrows(IllegalArgumentException.class, () -> repository(absent, 0)); assertFalse(Files.exists(absent));
    }

    @Test
    void everyCommitStageRollsBackJournalStreamAndReceipt() throws Exception {
        for (String stage : List.of("JOURNAL", "STREAM", "RECEIPT", "VERIFIED")) {
            Path database = database(stage, true); var normal = repository(database, 0); var initial = normal.read(PROJECT, MODEL);
            var broken = new DraftJournalRepository(database, clock(0), reached -> { if (stage.equals(reached)) throw new IllegalStateException("测试故障 " + stage); });
            var request = request(initial, "command.1");
            assertThrows(IllegalStateException.class, () -> broken.commit(PROJECT, MODEL, request, document -> move(document, 3)));
            assertEquals(initial, normal.read(PROJECT, MODEL)); assertEquals(0, count(database, "draft_journal")); assertEquals(0, count(database, "draft_receipt"));
            assertEquals("DURABLE", normal.commit(PROJECT, MODEL, request, document -> move(document, 3)).value().get("status").asText());
        }
    }

    @Test
    void postgresReceiptFailureRollsBackAlreadyWrittenDeltaAndStream() throws Exception {
        Path database = database("sql-failure", true); var repository = repository(database, 0); var initial = repository.read(PROJECT, MODEL);
        try (var connection = org.opm.localruntime.storage.SqliteTestSupport.create(database).getConnection()) {
            execute(connection, (org.opm.localruntime.storage.SqliteTestSupport.sqlite(connection) ? "CREATE TRIGGER test_receipt_failure BEFORE INSERT ON draft_receipt BEGIN SELECT RAISE(ABORT, '测试存储写入失败'); END" : "CREATE OR REPLACE FUNCTION fn_test_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '测试存储写入失败'; RETURN NEW; END $$; CREATE TRIGGER test_receipt_failure BEFORE INSERT ON draft_receipt FOR EACH ROW EXECUTE FUNCTION fn_test_receipt_failure()"));
        }
        code("PERSISTENCE_FAILED", () -> repository.commit(PROJECT, MODEL, request(initial, "command.1"), document -> move(document, 5)));
        assertEquals(initial, repository.read(PROJECT, MODEL)); assertEquals(0, count(database, "draft_journal")); assertEquals(0, count(database, "draft_receipt"));
    }

    @Test
    void postgresSerializesTwoRepositoryInstancesForTheSameExpectedToken() throws Exception {
        Path database = database("concurrent", true); var normal = repository(database, 0); var initial = normal.read(PROJECT, MODEL);
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1); var secondStarted = new CountDownLatch(1);
        var first = new DraftJournalRepository(database, clock(0), stage -> {
            if (!stage.equals("JOURNAL")) return; entered.countDown();
            try { assertTrue(release.await(5, TimeUnit.SECONDS)); } catch (InterruptedException exception) { throw new RuntimeException(exception); }
        });
        var executor = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var a = executor.submit(() -> first.commit(PROJECT, MODEL, request(initial, "command.first"), document -> move(document, 4)));
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            var b = executor.submit(() -> { secondStarted.countDown(); return repository(database, 1).commit(PROJECT, MODEL, request(initial, "command.second"), document -> move(document, 5)); });
            try { assertTrue(secondStarted.await(5, TimeUnit.SECONDS)); } finally { release.countDown(); }
            assertEquals("DURABLE", a.get(10, TimeUnit.SECONDS).value().get("status").asText());
            var error = assertThrows(java.util.concurrent.ExecutionException.class, () -> b.get(10, TimeUnit.SECONDS));
            assertEquals("DRAFT_CONFLICT", ((DraftJournalRepository.Failure) error.getCause()).code());
        } finally { release.countDown(); executor.shutdownNow(); }
        assertEquals(1, count(database, "draft_journal")); assertEquals(1, count(database, "draft_receipt"));
    }

    @Test
    void damagedCheckpointMissingJournalAndCorruptReceiptFailClosed() throws Exception {
        for (String damage : List.of("checkpoint", "gap", "delta", "receipt", "deadline")) {
            Path database = database(damage, true); var repository = repository(database, 0); var initial = repository.read(PROJECT, MODEL);
            repository.commit(PROJECT, MODEL, request(initial, "command.1"), document -> move(document, 1));
            try (var connection = org.opm.localruntime.storage.SqliteTestSupport.create(database).getConnection()) {
                switch (damage) {
                    case "checkpoint" -> { execute(connection, org.opm.localruntime.storage.SqliteTestSupport.dropTriggerSql(connection, "draft_content_no_update", "draft_content")); execute(connection, "UPDATE draft_content SET artifact_json='{}'"); }
                    case "gap" -> execute(connection, "DELETE FROM draft_journal");
                    case "delta" -> { execute(connection, org.opm.localruntime.storage.SqliteTestSupport.dropTriggerSql(connection, "draft_journal_no_update", "draft_journal")); execute(connection, "UPDATE draft_journal SET artifact_delta_json='{}'"); }
                    case "receipt" -> { execute(connection, org.opm.localruntime.storage.SqliteTestSupport.dropTriggerSql(connection, "draft_receipt_no_update", "draft_receipt")); execute(connection, "UPDATE draft_receipt SET result_json='{}'"); }
                    case "deadline" -> execute(connection, "UPDATE draft_stream SET dirty_since=NULL,deadline=NULL");
                }
            }
            code("DRAFT_RECOVERY_REQUIRED", () -> repository.read(PROJECT, MODEL));
        }
    }

    private static DraftJournalRepository.Proposal move(ObjectNode document, double x) { ((ObjectNode) document.at("/layouts/0")).put("x", x); return proposal(document); }
    private static DraftJournalRepository.Proposal proposal(ObjectNode document) { return new DraftJournalRepository.Proposal(document.toString(), List.of("occurrence.object"), List.of(), SUMMARY); }
    private static Clock clock(long seconds) { return Clock.fixed(Instant.parse(NOW).plusSeconds(seconds), ZoneOffset.UTC); }
    private static DraftJournalRepository repository(Path database, long seconds) { return new DraftJournalRepository(database, clock(seconds)); }
    private static DraftWorkspaceContract.Document checked(JsonNode request) { return DraftWorkspaceContract.read(request.toString(), DraftWorkspaceContract.Type.DraftEditRequest); }
    private static DraftWorkspaceContract.Document request(DraftJournalRepository.Snapshot snapshot, String command) {
        var value = JSON.createObjectNode().put("request_id", "request.1").put("command_id", command);
        value.set("expected_draft_token", JSON.valueToTree(snapshot.token()));
        value.putObject("scope").put("context_id", "context.sd.root").putNull("selection_id").put("intent", "UPDATE_LAYOUT").putArray("endpoints");
        value.putObject("authorization").put("capability_query_id", "query.test").put("selected_option_id", "option.test");
        value.putObject("command").put("command_type", "UPDATE_LAYOUT").putObject("payload").put("occurrence_id", "occurrence.object").putObject("layout").put("x", 1).put("y", 2);
        return checked(value);
    }
    private static DraftWorkspaceContract.Document receipt(DraftJournalRepository repository, String id) {
        var request = JSON.createObjectNode().put("request_id", "request.receipt").put("operation", "EDIT").put("idempotency_id", id);
        return repository.receipt(PROJECT, MODEL, DraftWorkspaceContract.read(request.toString(), DraftWorkspaceContract.Type.DraftReceiptRequest));
    }
    private static void code(String expected, org.junit.jupiter.api.function.Executable call) { assertEquals(expected, assertThrows(DraftJournalRepository.Failure.class, call).code()); }
    private Path database(String name, boolean activate) throws Exception { return database(name, activate, 3); }
    private Path database(String name, boolean activate, int version) throws Exception {
        Path root=root(); var factory=new ProjectDatabaseFactory(temporary.resolve(name)); var source=factory.databaseScope(PROJECT);
        String raw = Files.readString(root.resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/g-opl-proc-001-consumption-object-pass.json"));
        var document = SaveContentDigestV1.read(raw); var binding = document.get("profile_binding");
        try (var connection = source.getConnection()) {
            execute(connection, "INSERT INTO project_metadata(project_id,name,normalized_name,description,status,default_profile_id,default_profile_version,created_at,updated_at) VALUES (?,?,?,NULL,'ACTIVE',?,?,?,?)", PROJECT, "测试", "test", binding.at("/profile/id").asText(), binding.at("/profile/version").asText(), NOW, NOW);
            execute(connection, "INSERT INTO model_catalog(model_id,project_id,name,normalized_name,description,status,profile_binding_json,created_at,updated_at) VALUES (?,?,?,?,?,'ACTIVE',?,?,?)", MODEL, PROJECT, "模型", "model", "描述", binding.toString(), NOW, NOW);
            execute(connection, "INSERT INTO profile_package(profile_id,package_version,package_digest,lifecycle_status,package_json,installed_at) VALUES (?,?,?,'DRAFT','{}',?)", binding.at("/profile/id").asText(), binding.at("/profile/version").asText(), binding.at("/profile/digest/digest").asText(), NOW);
            execute(connection, "INSERT INTO rule_set_package(rule_set_id,rule_set_version,rule_set_digest,lifecycle_status,package_json,installed_at) VALUES (?,?,?,'DRAFT','{}',?)", binding.at("/rule_set/id").asText(), binding.at("/rule_set/version").asText(), binding.at("/rule_set/digest/digest").asText(), NOW);
            execute(connection, "INSERT INTO revision_document(revision_id,model_id,revision_sequence,schema_version,profile_id,profile_version,rule_set_id,rule_set_version,schema_set_json,profile_binding_json,document_json,document_digest,commit_reason,immutable,created_at) VALUES (?,?,?,'0.2',?,?,?,?,?,?,?,?,'TEST',1,?)", document.get("revision_id").asText(), MODEL, 2,
                    binding.at("/profile/id").asText(), binding.at("/profile/version").asText(), binding.at("/rule_set/id").asText(), binding.at("/rule_set/version").asText(),
                    document.get("schema_set_ref").toString(), binding.toString(), raw, org.opm.localruntime.storage.StorageDigests.hash(raw), NOW);
            execute(connection, "INSERT INTO model_head(model_id,draft_head_revision_id,head_sequence,updated_at) VALUES (?,?,1,?)", MODEL, document.get("revision_id").asText(), NOW);
            if (version < 3) return factory.snapshot(PROJECT);
            connection.setAutoCommit(false);
            DraftSeedRepository.seed(connection, new DraftPreparationRequest(PROJECT, MODEL, document.get("revision_id").asText(), org.opm.localruntime.storage.StorageDigests.hash(raw),
                    binding.at("/binding_digest/digest").asText(), "draft.test", "checkpoint.seed", NOW), new DraftSeedRepository.Source(raw, document), ignored -> { });
            if (activate) execute(connection, "INSERT INTO model_save_mode(model_id,mode,active_draft_id) VALUES (?,'JOURNALED_DRAFT_V2','draft.test')", MODEL);
            connection.commit();
        }
        return factory.snapshot(PROJECT);
    }
    private static Path root() { Path path = Path.of(System.getProperty("user.dir")).toAbsolutePath(); while (path != null && !Files.isDirectory(path.resolve("packages/profiles"))) path = path.getParent(); assertNotNull(path); return path; }
    private static long count(Path database, String table) throws Exception { try (var connection = org.opm.localruntime.storage.SqliteTestSupport.create(database).getConnection(); var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT count(*) FROM " + table)) { rows.next(); return rows.getLong(1); } }
    private static void execute(Connection connection, String sql, Object... values) throws Exception { try (var statement = connection.prepareStatement(sql)) { for (int i = 0; i < values.length; i++) statement.setObject(i + 1, values[i]); statement.executeUpdate(); } }
}
