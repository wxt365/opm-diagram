package org.opm.localruntime.storage;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.api.generated.DraftSaveContract.*;
import java.nio.file.Path;
import java.time.*;
import java.util.List;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.*;

class DraftPinRepositoryTest {
    @TempDir Path temporary;
    private static final Clock CLOCK = Clock.fixed(Instant.parse(NOW), ZoneOffset.UTC);
    private Path database(String name) throws Exception {
        var db = create(temporary.resolve(name), true, ignored -> { });
        migrate(db, "5"); return db;
    }
    private void migrate(Path db, String target) {
        org.opm.localruntime.storage.SqliteTestSupport.migrate(db);
    }
    private DraftSaveRepository repository(Path db) { return new DraftSaveRepository(db, CLOCK); }
    private PinRequest request(Path db, String id, String purpose) { return new PinRequest(id, repository(db).read(PROJECT, MODEL).token(), purpose); }
    private PinResult pin(Path db, PinRequest request) { return repository(db).pin(PROJECT, MODEL, request, ignored -> { }); }
    private void edit(Path db) throws Exception {
        var json = new com.fasterxml.jackson.databind.ObjectMapper(); var journal = new DraftJournalRepository(db, CLOCK);
        var token = journal.read(PROJECT, MODEL).token();
        com.fasterxml.jackson.databind.node.ObjectNode request = json.readTree(java.nio.file.Files.readString(root().resolve("tests/fixtures/hybrid-save/draft-workspace-v02-vectors.json"))).at("/commands/0").deepCopy();
        request.put("command_id", "command.pin." + token.edit_seq()); request.set("expected_draft_token", json.valueToTree(token));
        ((com.fasterxml.jackson.databind.node.ObjectNode) request.get("scope")).put("context_id", CONTEXT);
        journal.commit(PROJECT, MODEL, org.opm.localruntime.api.generated.DraftWorkspaceContract.read(request.toString(), org.opm.localruntime.api.generated.DraftWorkspaceContract.Type.DraftEditRequest), document -> {
            // 仅验证存储原子性；HTTP 测试通过真实改名命令验证领域和文本。
            ((com.fasterxml.jackson.databind.node.ObjectNode) document.at("/layouts/0")).put("x", 50.5 + token.edit_seq());
            return new DraftJournalRepository.Proposal(document.toString(), List.of(), List.of(), "{\"blocking\":0,\"warning\":0,\"suggestion\":0,\"coverage_state\":\"INCOMPLETE\"}");
        });
    }
    private void sql(Path db, String sql) throws Exception { try (var c = org.opm.localruntime.storage.SqliteTestSupport.create(db).getConnection(); var s = c.createStatement()) { s.execute(sql); } }
    private void code(String code, org.junit.jupiter.api.function.Executable operation) { assertEquals(code, assertThrows(DraftJournalRepository.Failure.class, operation).code()); }

    @Test void migrationPreservesLegacyRetentionAndRejectsOldSchemaWithoutChangingManualSave() throws Exception {
        var db = create(temporary.resolve("upgrade"), true, ignored -> { }); migrate(db, "4");
        var request = request(db, "pin.v4", "PERMALINK");
        sql(db, "INSERT INTO draft_retention(model_id,draft_id,retention_id,kind,checkpoint_id,revision_id,min_edit_seq) VALUES ('" + MODEL + "','draft.http','retention.old','READ',NULL,NULL,0)");
        assertEquals("SAVED", repository(db).manual(PROJECT, MODEL, new SaveRequest("save.v4", request.target_draft_token(), "MANUAL"), ignored -> { }).status());
        migrate(db, "5"); migrate(db, "5");
        try (var c = org.opm.localruntime.storage.SqliteTestSupport.create(db).getConnection(); var s = c.createStatement(); var r = s.executeQuery("SELECT * FROM draft_retention WHERE retention_id='retention.old'")) {
            assertTrue(r.next()); assertEquals(MODEL, r.getString("model_id")); assertEquals("draft.http", r.getString("draft_id"));
            assertEquals("READ", r.getString("kind")); assertNull(r.getObject("checkpoint_id")); assertNull(r.getObject("revision_id")); assertEquals(0, r.getLong("min_edit_seq"));
        }
        for (String value : List.of("NULL", "-1", "9007199254740992"))
            assertThrows(java.sql.SQLException.class, () -> sql(db, "INSERT INTO draft_retention(model_id,draft_id,retention_id,kind,checkpoint_id,revision_id,min_edit_seq) VALUES ('" + MODEL + "','draft.http','retention.invalid','READ',NULL,NULL," + value + ")"));
        assertThrows(java.sql.SQLException.class, () -> sql(db, "INSERT INTO draft_retention(model_id,draft_id,retention_id,kind,checkpoint_id,revision_id,min_edit_seq) VALUES ('" + MODEL + "','draft.http','retention.invalid','PERMALINK',NULL,'revision.missing',NULL)"));
        pin(db, request); assertEquals(2, count(db, "draft_retention"));
        try (var c = org.opm.localruntime.storage.SqliteTestSupport.create(db).getConnection(); var s = c.createStatement(); var r = s.executeQuery("SELECT 1 WHERE false")) { assertFalse(r.next()); }
    }

    @Test void failedSchemaTransactionPreservesRetention() throws Exception {
        var db=database("migration-rollback");
        sql(db,"INSERT INTO draft_retention(model_id,draft_id,retention_id,kind,min_edit_seq) VALUES ('"+MODEL+"','draft.http','retention.keep','READ',0)");
        try(var c=org.opm.localruntime.storage.SqliteTestSupport.connection(db)){
            c.setAutoCommit(false);try(var statement=c.createStatement()){
                statement.execute("CREATE TABLE failed_upgrade(id BIGINT)");
                assertThrows(java.sql.SQLException.class,()->statement.execute("INSERT INTO test_absent_table VALUES(1)"));
            }c.rollback();
            try(var statement=c.createStatement();var rows=statement.executeQuery(SqliteTestSupport.sqlite(c) ? "SELECT name FROM sqlite_master WHERE name='failed_upgrade'" : "SELECT to_regclass('failed_upgrade')")){if (SqliteTestSupport.sqlite(c)) assertFalse(rows.next()); else { rows.next();assertNull(rows.getString(1)); }}
        }
        assertEquals(1,count(db,"draft_retention"));assertNotNull(pin(db,request(db,"pin.after-rollback","PERMALINK")).revision_id());
    }



    @Test void allPurposesReuseExactCapturesWithSeparateRetentionAndManualHistory() throws Exception {
        var db = database("purposes"); var before = repository(db).read(PROJECT, MODEL);
        for (String purpose : List.of("PERMALINK", "SNAPSHOT", "BASELINE", "EXPORT")) {
            var first = pin(db, request(db, "pin." + purpose, purpose));
            var second = pin(db, request(db, "pin.again." + purpose, purpose)); assertEquals(first.revision_id(), second.revision_id());
            try (var c = org.opm.localruntime.storage.SqliteTestSupport.create(db).getConnection()) {
                var saved = DraftHistoryRepository.find(c, PROJECT, MODEL, first.revision_id()).orElseThrow();
                assertEquals(purpose, saved.entry().purpose());
                assertEquals(before.contentDigest(), org.opm.localruntime.semantic.SaveContentDigestV1.sha256(org.opm.localruntime.semantic.SaveContentDigestV1.read(saved.contentDocument())));
            }
        }
        assertEquals(4, count(db, "draft_savepoint")); assertEquals(8, count(db, "draft_retention")); assertEquals(8, count(db, "draft_receipt"));
        assertEquals(1, count(db, "draft_content")); assertNull(repository(db).read(PROJECT, MODEL).lastManualRevision());
        var manual = repository(db).manual(PROJECT, MODEL, new SaveRequest("pin.PERMALINK", before.token(), "MANUAL"), ignored -> { });
        assertEquals("SAVED", manual.status()); assertEquals(5, count(db, "draft_savepoint"));
        assertEquals(before.token(), repository(db).read(PROJECT, MODEL).token()); assertEquals(1, count(db, "revision_document"));
    }

    @Test void receiptReplayUsesProtectedHistoryWithoutCheckpointAndNeverRevalidatesAssets() throws Exception {
        var db = database("replay"); var request = request(db, "pin.once", "PERMALINK"); var result = pin(db, request);
        edit(db); repository(db).checkpoint(PROJECT, MODEL, ignored -> { });
        sql(db, "DELETE FROM draft_checkpoint_overlay WHERE checkpoint_id IN (SELECT checkpoint_id FROM draft_checkpoint WHERE covered_seq=0)");
        sql(db, "DELETE FROM draft_checkpoint WHERE covered_seq=0"); sql(db, "DELETE FROM draft_journal");
        assertEquals(result, repository(db).pin(PROJECT, MODEL, request, ignored -> fail("不能重验历史收据")));
        code("IDEMPOTENCY_MISMATCH", () -> pin(db, new PinRequest(request.pin_id(), request.target_draft_token(), "EXPORT")));
        assertEquals(1, count(db, "draft_savepoint")); assertEquals(1, count(db, "draft_retention")); assertEquals(2, count(db, "draft_receipt"));
    }

    @Test void corruptReceiptOrRetentionOrContentIsRejectedRatherThanRepaired() throws Exception {
        for (String fault : List.of("receipt", "retention", "content")) {
            var db = database(fault); var request = request(db, "pin.corrupt", "PERMALINK"); pin(db, request);
            if (fault.equals("receipt")) { sql(db, org.opm.localruntime.storage.SqliteTestSupport.dropTriggerSql(db, "draft_receipt_no_update", "draft_receipt")); sql(db, "UPDATE draft_receipt SET result_json='{}'"); }
            if (fault.equals("retention")) sql(db, "DELETE FROM draft_retention");
            if (fault.equals("content")) { sql(db, org.opm.localruntime.storage.SqliteTestSupport.dropTriggerSql(db, "draft_content_no_update", "draft_content")); sql(db, "UPDATE draft_content SET artifact_digest='" + "a".repeat(64) + "'"); }
            code("DRAFT_RECOVERY_REQUIRED", () -> pin(db, request)); assertEquals(1, count(db, "draft_savepoint")); assertEquals(1, count(db, "draft_receipt"));
        }
    }

    @Test void everyStageAndRealSqlFaultRollBackPinAndPermitExactRetry() throws Exception {
        for (String fault : List.of("CONTENT", "CHECKPOINT", "HISTORY", "RETENTION", "STREAM", "RECEIPT", "VERIFIED", "SQL")) {
            var db = database(fault); edit(db); var request = request(db, "pin.fail", "PERMALINK"); var before = repository(db).read(PROJECT, MODEL);
            if (fault.equals("SQL")) sql(db, (org.opm.localruntime.storage.SqliteTestSupport.sqlite(db) ? "CREATE TRIGGER test_pin_failure BEFORE INSERT ON draft_retention BEGIN SELECT RAISE(ABORT, '测试故障'); END" : "CREATE OR REPLACE FUNCTION fn_test_pin_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '测试故障'; RETURN NEW; END $$; CREATE TRIGGER test_pin_failure BEFORE INSERT ON draft_retention FOR EACH ROW EXECUTE FUNCTION fn_test_pin_failure()"));
            var failing = new DraftSaveRepository(db, CLOCK, stage -> { if (stage.equals(fault)) throw new IllegalStateException("测试故障"); });
            assertThrows(RuntimeException.class, () -> failing.pin(PROJECT, MODEL, request, ignored -> { }));
            assertEquals(before, repository(db).read(PROJECT, MODEL));
            for (String table : List.of("draft_savepoint", "draft_retention", "draft_checkpoint_overlay")) assertEquals(0, count(db, table), fault + table);
            assertEquals(1, count(db, "draft_receipt"));
            assertEquals(1, count(db, "draft_content")); assertEquals(1, count(db, "draft_checkpoint"));
            if (fault.equals("SQL")) sql(db, org.opm.localruntime.storage.SqliteTestSupport.dropTriggerSql(db, "test_pin_failure", "draft_retention"));
            assertNotNull(pin(db, request).revision_id()); assertEquals(1, count(db, "draft_retention"));
        }
    }

    @Test void twoConcurrentInstancesPublishOnePinTransaction() throws Exception {
        var db = database("concurrent"); var request = request(db, "pin.concurrent", "PERMALINK");
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        var first = new DraftSaveRepository(db, CLOCK, stage -> { if (stage.equals("RETENTION")) {
            entered.countDown(); try { assertTrue(release.await(5, TimeUnit.SECONDS)); } catch (InterruptedException e) { throw new RuntimeException(e); }
        } });
        var executor = Executors.newFixedThreadPool(2);
        try {
            var a = executor.submit(() -> first.pin(PROJECT, MODEL, request, ignored -> { }));
            try { assertTrue(entered.await(5, TimeUnit.SECONDS)); var b = executor.submit(() -> pin(db, request)); release.countDown(); assertEquals(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS)); }
            finally { release.countDown(); }
        } finally { executor.shutdownNow(); }
        for (String table : List.of("draft_savepoint", "draft_retention", "draft_receipt")) assertEquals(1, count(db, table));
    }
}
