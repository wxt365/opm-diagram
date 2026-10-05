package org.opm.localruntime.storage;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.api.generated.DraftSaveContract.*;
import org.opm.localruntime.api.generated.DraftWorkspaceContract;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.*;

class DraftSaveRepositoryTest {
    @TempDir Path temporary;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static Clock clock(int seconds) { return Clock.fixed(Instant.parse(NOW).plusSeconds(seconds), ZoneOffset.UTC); }
    private Path database(String name) throws Exception {
        Path storage = temporary.resolve(name), db = create(storage, true, ignored -> { }); migrate(db); return db;
    }
    private void migrate(Path db) {
        Flyway.configure().dataSource(SqliteConnectionFactory.create(db)).locations("filesystem:" + root().resolve("docs/contracts/migrations/sqlite"),
                        "filesystem:" + root().resolve("docs/contracts/migrations/sqlite-checkpoint"))
                .target("4").mixed(true).load().migrate();
    }
    private DraftSaveRepository saves(Path db, int seconds) { return new DraftSaveRepository(db, clock(seconds)); }
    private DraftJournalRepository.Snapshot edit(Path db, int seconds, double x, String metadata) throws Exception {
        var journal = new DraftJournalRepository(db, clock(seconds)); var before = journal.read(PROJECT, MODEL);
        ObjectNode request = JSON.readTree(Files.readString(root().resolve("tests/fixtures/hybrid-save/draft-workspace-v02-vectors.json"))).at("/commands/0").deepCopy();
        request.put("command_id", "command.save-test." + (before.token().edit_seq() + 1)); request.set("expected_draft_token", JSON.valueToTree(before.token()));
        ((ObjectNode) request.get("scope")).put("context_id", CONTEXT);
        journal.commit(PROJECT, MODEL, DraftWorkspaceContract.read(request.toString(), DraftWorkspaceContract.Type.DraftEditRequest), document -> {
            // 此处仅测试存储：领域校验另有真实 Profile/OPL 测试，不将本 helper 当合法 UI 命令。
            ((ObjectNode) document.at("/layouts/0")).put("x", x);
            document.putObject("revision_digest").put("algorithm", "sha256").put("digest", HybridSavePreparation.hash(metadata));
            return new DraftJournalRepository.Proposal(document.toString(), List.of(), List.of(), "{\"blocking\":0,\"warning\":0,\"suggestion\":0,\"coverage_state\":\"INCOMPLETE\"}");
        });
        return journal.read(PROJECT, MODEL);
    }
    private SaveRequest request(String id, DraftToken token) { return new SaveRequest(id, token, "MANUAL"); }
    private SaveResult manual(Path db, String id, DraftToken token) { return saves(db, 20).manual(PROJECT, MODEL, request(id, token), ignored -> { }); }
    private void code(String code, org.junit.jupiter.api.function.Executable operation) {
        assertEquals(code, assertThrows(DraftJournalRepository.Failure.class, operation).code());
    }

    @Test void migrationIsRepeatableAndV3SavingNeverCreatesSchemaImplicitly() throws Exception {
        Path db = create(temporary.resolve("v3"), true, ignored -> { }); var original = saves(db, 0).read(PROJECT, MODEL);
        code("DRAFT_RECOVERY_REQUIRED", () -> manual(db, "save.old", original.token()));
        try (var c = SqliteConnectionFactory.create(db).getConnection()) { assertFalse(DraftJournalRepository.hasOverlayTable(c)); }
        migrate(db); migrate(db);
        assertEquals(original, saves(db, 0).read(PROJECT, MODEL));
        try (var c = SqliteConnectionFactory.create(db).getConnection()) { PreparedDraftRepository.integrity(c); }
    }

    @Test void manualAutoNoopAndAbaUseOnlyNecessaryContentAndHistory() throws Exception {
        Path db = database("aba"); var initial = saves(db, 0).read(PROJECT, MODEL);
        double a = SaveContentDigestV1.read(initial.documentJson()).at("/layouts/0/x").doubleValue();
        var first = manual(db, "save.first", initial.token()); assertEquals("SAVED", first.status());
        var duplicate = manual(db, "save.same", initial.token()); assertEquals("UNCHANGED", duplicate.status()); assertEquals(first.revision_id(), duplicate.revision_id());
        var b = edit(db, 2, a + 100, "2026-09-13T00:00:02.000Z");
        var auto = saves(db, 12).checkpoint(PROJECT, MODEL, ignored -> { });
        assertEquals(b.token(), auto.capturedToken()); assertEquals(1, count(db, "draft_savepoint")); assertEquals(1, count(db, "revision_document"));
        assertNull(saves(db, 12).read(PROJECT, MODEL).dirtySince());
        var savedB = manual(db, "save.b", b.token()); assertEquals("SAVED", savedB.status()); assertEquals(auto.checkpointId(), savedB.checkpoint_id());
        var returned = edit(db, 13, a, "2026-09-13T00:00:13.000Z");
        var savedA = manual(db, "save.a", returned.token()); assertEquals("SAVED", savedA.status()); assertNotEquals(first.revision_id(), savedA.revision_id());
        assertEquals(2, count(db, "draft_content")); assertEquals(3, count(db, "draft_savepoint"));
        assertEquals(returned.documentJson(), saves(db, 25).read(PROJECT, MODEL).documentJson());
        assertEquals(3, count(db, "draft_checkpoint")); assertEquals(2, count(db, "draft_journal"));
        var after = edit(db, 26, a + 200, "2026-09-13T00:00:26.000Z");
        assertEquals(after.documentJson(), saves(db, 27).read(PROJECT, MODEL).documentJson());
    }

    @Test void undoToLastManualUpdatesCoverageWithoutDuplicatingContentOrHistory() throws Exception {
        Path db = database("undo"); var initial = saves(db, 0).read(PROJECT, MODEL);
        double a = SaveContentDigestV1.read(initial.documentJson()).at("/layouts/0/x").doubleValue();
        var first = manual(db, "save.first", initial.token());
        edit(db, 1, a + 1, "2026-09-13T00:00:01.000Z"); var back = edit(db, 2, a, "2026-09-13T00:00:02.000Z");
        var result = manual(db, "save.undo", back.token());
        assertEquals("UNCHANGED", result.status()); assertEquals(first.revision_id(), result.revision_id());
        assertEquals(1, count(db, "draft_content")); assertEquals(1, count(db, "draft_savepoint")); assertEquals(2, count(db, "draft_checkpoint"));
        assertEquals(back.token(), saves(db, 4).read(PROJECT, MODEL).checkpointToken());
        assertEquals(back.documentJson(), saves(db, 4).read(PROJECT, MODEL).documentJson());
    }

    @Test void savingOlderCapturePreservesNewEditsAndNeverMovesCheckpointBackwards() throws Exception {
        Path db = database("capture"); var first = edit(db, 1, -0d, "2026-09-13T00:00:01.000Z");
        var second = edit(db, 5, 4.5, "2026-09-13T00:00:05.000Z");
        var result = manual(db, "save.first", first.token());
        assertEquals(second.token(), result.head_token()); assertEquals(first.token(), result.captured_token());
        var head = saves(db, 7).read(PROJECT, MODEL); assertEquals(second.documentJson(), head.documentJson());
        assertEquals("2026-09-13T00:00:05.000Z", head.dirtySince()); assertEquals("2026-09-13T00:00:15.000Z", head.deadline());
        assertEquals(first.documentJson(), saves(db, 7).captured(PROJECT, MODEL, first.token()).documentJson());
        saves(db, 15).checkpoint(PROJECT, MODEL, ignored -> { }); manual(db, "save.old.again", first.token());
        assertEquals(second.token(), saves(db, 17).read(PROJECT, MODEL).checkpointToken()); assertNull(saves(db, 17).read(PROJECT, MODEL).deadline());
    }

    @Test void receiptReplayAndInvalidScopeTokenOrIdNeverRepeatSave() throws Exception {
        Path db = database("receipt"); var before = edit(db, 1, -0d, "2026-09-13T00:00:01.000Z");
        var saved = manual(db, "save.once", before.token()); var later = edit(db, 3, 12.5, "2026-09-13T00:00:03.000Z");
        assertEquals(saved, saves(db, 4).manual(PROJECT, MODEL, request("save.once", before.token()), ignored -> fail("收据重试不能重验")));
        code("IDEMPOTENCY_MISMATCH", () -> manual(db, "save.once", later.token()));
        code("DRAFT_CONFLICT", () -> manual(db, "save.future", new DraftToken(later.token().draft_id(), 999L, later.token().binding_digest())));
        code("RULE_VERSION_CONFLICT", () -> manual(db, "save.binding", new DraftToken("draft.other", 999L, "a".repeat(64))));
        code("DRAFT_CONFLICT", () -> manual(db, "save.draft", new DraftToken("draft.other", 0L, later.token().binding_digest())));
        code("NOT_FOUND", () -> saves(db, 4).manual("project.other", MODEL, request("save.bad", later.token()), ignored -> { }));
        assertEquals(1, count(db, "draft_savepoint")); assertEquals(3, count(db, "draft_receipt"));
        var receipt = JSON.createObjectNode().put("request_id", "request.receipt").put("operation", "SAVE").put("idempotency_id", "save.once");
        var wire = new DraftJournalRepository(db, clock(4)).receipt(PROJECT, MODEL, DraftWorkspaceContract.read(receipt.toString(), DraftWorkspaceContract.Type.DraftReceiptRequest));
        assertEquals(saved.revision_id(), wire.value().at("/result/revision_id").asText());
    }

    @Test void everyStageFailureAndSqlFailureRollBackAllSaveRows() throws Exception {
        for (String stage : List.of("CONTENT", "CHECKPOINT", "HISTORY", "STREAM", "RECEIPT", "VERIFIED")) {
            Path db = database(stage); var before = edit(db, 1, 22.5, "2026-09-13T00:00:01.000Z");
            var broken = new DraftSaveRepository(db, clock(2), reached -> { if (reached.equals(stage)) throw new IllegalStateException("测试故障"); });
            assertThrows(IllegalStateException.class, () -> broken.manual(PROJECT, MODEL, request("save.fail", before.token()), ignored -> { }));
            assertEquals(before, saves(db, 2).read(PROJECT, MODEL)); assertEquals(1, count(db, "draft_checkpoint")); assertEquals(1, count(db, "draft_content"));
            assertEquals(0, count(db, "draft_savepoint")); assertEquals(1, count(db, "draft_receipt")); assertEquals(0, overlayCount(db));
        }
        Path db = database("sql"); var before = edit(db, 1, 33.5, "2026-09-13T00:00:01.000Z");
        try (var c = SqliteConnectionFactory.create(db).getConnection(); var s = c.createStatement()) {
            s.execute("CREATE TRIGGER test_save_fail BEFORE INSERT ON draft_receipt WHEN NEW.operation='SAVE' BEGIN SELECT RAISE(ABORT,'测试失败'); END");
        }
        code("PERSISTENCE_FAILED", () -> manual(db, "save.sql", before.token()));
        assertEquals(before, saves(db, 3).read(PROJECT, MODEL)); assertEquals(0, count(db, "draft_savepoint")); assertEquals(0, overlayCount(db));
    }

    @Test void concurrentInstancesShareReceiptAndOneHistoricalEvent() throws Exception {
        Path db = database("concurrent"); var before = edit(db, 1, 44.5, "2026-09-13T00:00:01.000Z");
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        var first = new DraftSaveRepository(db, clock(2), stage -> {
            if (stage.equals("CONTENT")) { entered.countDown(); try { assertTrue(release.await(5, TimeUnit.SECONDS)); } catch (InterruptedException e) { throw new RuntimeException(e); } }
        });
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var a = executor.submit(() -> first.manual(PROJECT, MODEL, request("save.concurrent", before.token()), ignored -> { }));
            assertTrue(entered.await(5, TimeUnit.SECONDS)); var b = executor.submit(() -> manual(db, "save.concurrent", before.token())); release.countDown();
            assertEquals(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS));
        } finally { release.countDown(); }
        assertEquals(1, count(db, "draft_savepoint")); assertEquals(2, count(db, "draft_receipt"));
    }

    @Test void overlaysAreImmutableAndMissingOrCorruptCaptureBlocksRecovery() throws Exception {
        for (boolean missing : List.of(false, true)) {
            Path db = database("corrupt" + missing); var before = edit(db, 1, 55.5, "2026-09-13T00:00:01.000Z"); manual(db, "save.once", before.token());
            try (var c = SqliteConnectionFactory.create(db).getConnection(); var s = c.createStatement()) {
                assertThrows(java.sql.SQLException.class, () -> s.executeUpdate("UPDATE draft_checkpoint_overlay SET document_digest='" + "a".repeat(64) + "'"));
                assertThrows(java.sql.SQLException.class, () -> s.executeUpdate("INSERT OR REPLACE INTO draft_checkpoint_overlay SELECT * FROM draft_checkpoint_overlay"));
                if (missing) s.executeUpdate("DELETE FROM draft_checkpoint_overlay");
                else { s.execute("DROP TRIGGER draft_checkpoint_overlay_no_update"); s.executeUpdate("UPDATE draft_checkpoint_overlay SET document_digest='" + "a".repeat(64) + "'"); }
            }
            code("DRAFT_RECOVERY_REQUIRED", () -> saves(db, 3).read(PROJECT, MODEL));
        }
    }

    @Test void realProfileAndTextValidationRunsBeforeAnyCheckpointCommit() throws Exception {
        Path db = database("real-validation");
        var result = saves(db, 0).checkpoint(PROJECT, MODEL, document -> {
            document.put("revision_sequence", document.get("revision_sequence").asInt());
            for (var layout : document.get("layouts")) ((ObjectNode) layout).put("z_order", layout.get("z_order").asInt());
            for (var fact : document.get("facts")) for (var endpoint : fact.get("endpoints")) ((ObjectNode) endpoint).put("ordinal", endpoint.get("ordinal").asInt());
            var revision = new org.opm.localruntime.semantic.SemanticRevisionReader().read(new java.io.ByteArrayInputStream(document.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)));
            assertTrue(new org.opm.localruntime.semantic.SemanticRevisionValidator().validate(revision).isEmpty());
            var assets = new org.opm.localruntime.assets.ProfilePackageAssembler(new org.opm.localruntime.assets.FileProfilePackageLoader(root().resolve("packages/profiles"))).assemble(revision.profileBinding());
            var text = new org.opm.localruntime.text.OplTextGenerationService(); var generated = text.generate(revision, revision.rootContextId(), assets);
            text.validateActiveWriteEvidence(revision, assets, generated); assertFalse(generated.traces().isEmpty());
        });
        assertEquals(0L, result.capturedToken().edit_seq());
        var before = edit(db, 1, 7.5, "2026-09-13T00:00:01.000Z");
        assertThrows(IllegalStateException.class, () -> saves(db, 2).checkpoint(PROJECT, MODEL, ignored -> { throw new IllegalStateException("领域或资产拒绝"); }));
        assertEquals(before, saves(db, 3).read(PROJECT, MODEL));
    }

    @Test void coordinatorAdapterCompletesAutoThenManualAgainstRealSqlite() throws Exception {
        Path db = database("coordinator"); var edited = edit(db, 1, 62.5, "2026-09-13T00:00:01.000Z");
        try (var coordinator = new org.opm.localruntime.application.DraftSaveCoordinator(PROJECT, MODEL, saves(db, 11), ignored -> { }, clock(11), () -> 0L)) {
            coordinator.poll(); assertEquals(0, count(db, "draft_savepoint")); assertNull(coordinator.state().dirty_since());
            var manual = coordinator.requestManual(request("save.coordinator", edited.token())); coordinator.poll();
            assertEquals("SAVED", manual.join().status()); assertEquals(1, count(db, "draft_savepoint")); assertEquals(1, count(db, "revision_document"));
            assertEquals(manual.join().revision_id(), coordinator.state().last_manual_revision());
            org.opm.localruntime.api.DraftWorkspaceSchema.read(JSON.writeValueAsString(coordinator.state()), "SaveState");
        }
    }

    @Test void saveRequestDigestMatchesIndependentNodeVectorAndAllIdentityFields() {
        var token = new DraftToken("draft.test", 7L, "a".repeat(64)); var request = request("save.test", token);
        String digest = org.opm.localruntime.api.DraftCapabilityIdentity.save("project.test", "model.test", JSON.valueToTree(request));
        assertEquals("b854de91795e6f523c99c7d04ffe3d6a67d7526fa2ec01b7e13359ba960ba653", digest);
        assertNotEquals(digest, org.opm.localruntime.api.DraftCapabilityIdentity.save("project.other", "model.test", JSON.valueToTree(request)));
        assertNotEquals(digest, org.opm.localruntime.api.DraftCapabilityIdentity.save("project.test", "model.other", JSON.valueToTree(request)));
        assertNotEquals(digest, org.opm.localruntime.api.DraftCapabilityIdentity.save("project.test", "model.test", JSON.valueToTree(request("save.other", token))));
        assertNotEquals(digest, org.opm.localruntime.api.DraftCapabilityIdentity.save("project.test", "model.test", JSON.valueToTree(request("save.test", new DraftToken("draft.test", 8L, "a".repeat(64))))));
    }

    @Test void receiptWithUnrelatedHistoryReferenceIsNeverReturnedAsSuccessfulSave() throws Exception {
        Path db = database("receipt-corrupt"); var before = saves(db, 0).read(PROJECT, MODEL); manual(db, "save.a", before.token());
        var changed = edit(db, 1, 99.5, "2026-09-13T00:00:01.000Z"); var other = manual(db, "save.b", changed.token());
        try (var c = SqliteConnectionFactory.create(db).getConnection()) {
            try (var s = c.createStatement()) { s.execute("DROP TRIGGER draft_receipt_no_update"); }
            try (var s = c.prepareStatement("UPDATE draft_receipt SET result_json=json_set(result_json,'$.revision_id',?) WHERE operation='SAVE' AND idempotency_id='save.a'")) {
                s.setString(1, other.revision_id()); assertEquals(1, s.executeUpdate());
            }
        }
        code("DRAFT_RECOVERY_REQUIRED", () -> manual(db, "save.a", before.token()));
    }

    private long overlayCount(Path db) throws Exception {
        try (var c = SqliteConnectionFactory.create(db).getConnection(); var s = c.createStatement(); var rows = s.executeQuery("SELECT COUNT(*) FROM draft_checkpoint_overlay")) { rows.next(); return rows.getLong(1); }
    }
}
