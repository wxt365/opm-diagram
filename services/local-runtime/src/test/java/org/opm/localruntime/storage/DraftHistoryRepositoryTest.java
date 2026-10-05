package org.opm.localruntime.storage;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.api.generated.DraftSaveContract.SaveRequest;
import org.opm.localruntime.application.LocalApiService;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.semantic.DraftSemanticView;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import java.nio.file.Path;
import java.time.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.*;

class DraftHistoryRepositoryTest {
    @TempDir Path temporary;
    private static final Clock CLOCK = Clock.fixed(Instant.parse(NOW), ZoneOffset.UTC);

    @Test void historicalContentDoesNotDependOnCurrentJournalOrCheckpoint() throws Exception {
        var database = database(); var saves = new DraftSaveRepository(database, CLOCK);
        var json = new com.fasterxml.jackson.databind.ObjectMapper();
        com.fasterxml.jackson.databind.node.ObjectNode request = json.readTree(java.nio.file.Files.readString(root().resolve("tests/fixtures/hybrid-save/draft-workspace-v02-vectors.json"))).at("/commands/0").deepCopy();
        request.set("expected_draft_token", json.valueToTree(saves.read(PROJECT, MODEL).token()));
        ((com.fasterxml.jackson.databind.node.ObjectNode) request.get("scope")).put("context_id", CONTEXT);
        new DraftJournalRepository(database, CLOCK).commit(PROJECT, MODEL, org.opm.localruntime.api.generated.DraftWorkspaceContract.read(request.toString(),
                org.opm.localruntime.api.generated.DraftWorkspaceContract.Type.DraftEditRequest), document -> {
            // 仅注入存储增量；真实命令与 OPL 闭环在 HTTP 测试中验证。
            ((com.fasterxml.jackson.databind.node.ObjectNode) document.at("/layouts/0")).put("x", -0d);
            return new DraftJournalRepository.Proposal(document.toString(), java.util.List.of(), java.util.List.of(),
                    "{\"blocking\":0,\"warning\":0,\"suggestion\":0,\"coverage_state\":\"INCOMPLETE\"}");
        });
        assertEquals(1, count(database, "draft_journal")); var token = saves.read(PROJECT, MODEL).token();
        var saved = saves.manual(PROJECT, MODEL, new SaveRequest("save.history", token, "MANUAL"), ignored -> { });
        try (var c = SqliteConnectionFactory.create(database).getConnection()) {
            var before = DraftHistoryRepository.find(c, PROJECT, MODEL, saved.revision_id()).orElseThrow();
            assertEquals(3, before.entry().sequence()); assertEquals(1, DraftHistoryRepository.list(c, PROJECT, MODEL).size());
            var document = SaveContentDigestV1.read(before.contentDocument()); var original = document.deepCopy();
            var revision = DraftSemanticView.read(document, before.entry().revisionId(), before.entry().sequence());
            assertEquals(original, document); assertEquals(saved.revision_id(), revision.revisionId()); assertEquals(3, revision.revisionSequence());
            // 模拟检查点不可用；历史读取必须仍仅依赖永久内容，不触发草稿恢复。
            try (var statement = c.createStatement()) {
                statement.execute("PRAGMA foreign_keys=OFF"); statement.executeUpdate("DELETE FROM draft_checkpoint"); statement.executeUpdate("DELETE FROM draft_journal");
            }
            assertEquals(before, DraftHistoryRepository.find(c, PROJECT, MODEL, saved.revision_id()).orElseThrow());
            assertTrue(DraftHistoryRepository.find(c, "project.other", MODEL, saved.revision_id()).isEmpty());
            assertTrue(DraftHistoryRepository.find(c, PROJECT, "model.other", saved.revision_id()).isEmpty());
            assertTrue(DraftHistoryRepository.find(c, PROJECT, MODEL, "revision.missing").isEmpty());
        }
        var domain = domain(); assertTrue(domain.text("request.text", PROJECT, MODEL, CONTEXT, saved.revision_id()).containsKey("data"));
    }

    @Test void corruptBlobFailsClosedInsteadOfReturningLegacyHead() throws Exception {
        var database = database(); var saves = new DraftSaveRepository(database, CLOCK);
        var result = saves.manual(PROJECT, MODEL, new SaveRequest("save.corrupt", saves.read(PROJECT, MODEL).token(), "MANUAL"), ignored -> { });
        try (var c = SqliteConnectionFactory.create(database).getConnection(); var s = c.createStatement()) {
            s.execute("DROP TRIGGER draft_content_no_update"); s.executeUpdate("UPDATE draft_content SET artifact_digest='" + "a".repeat(64) + "'");
            var error = assertThrows(DraftJournalRepository.Failure.class, () -> DraftHistoryRepository.find(c, PROJECT, MODEL, result.revision_id()));
            assertEquals("DRAFT_RECOVERY_REQUIRED", error.code());
        }
        var error = assertThrows(ApiException.class, () -> domain().projection("request.exact", PROJECT, MODEL, CONTEXT, result.revision_id()));
        assertEquals(503, error.status()); assertFalse(error.retryable());
    }

    @Test void globalSequenceOverflowRollsBackBeforePublishingUnopenableRevision() throws Exception {
        var database = database(); var saves = new DraftSaveRepository(database, CLOCK);
        try (var c = SqliteConnectionFactory.create(database).getConnection(); var s = c.createStatement()) {
            // 增加合法存储形状的前序保存点，模拟已经到达旧语义整数边界。
            s.executeUpdate("INSERT INTO draft_savepoint SELECT 'revision.limit',model_id,draft_id,0,2147483645,'EXPORT',content_digest,'" + NOW + "' FROM draft_checkpoint");
        }
        var error = assertThrows(DraftJournalRepository.Failure.class, () -> saves.manual(PROJECT, MODEL,
                new SaveRequest("save.limit", saves.read(PROJECT, MODEL).token(), "MANUAL"), ignored -> { }));
        assertEquals("DRAFT_CONFLICT", error.code()); assertEquals(1, count(database, "draft_savepoint")); assertEquals(0, count(database, "draft_receipt"));
    }

    private LocalApiService domain() { return new LocalApiService(new ProjectDatabaseFactory(temporary), new FileProfilePackageLoader(root().resolve("packages/profiles"))); }
    private Path database() throws Exception {
        Path db = create(temporary, true, ignored -> { });
        Flyway.configure().dataSource(SqliteConnectionFactory.create(db)).locations("filesystem:" + root().resolve("docs/contracts/migrations/sqlite"),
                "filesystem:" + root().resolve("docs/contracts/migrations/sqlite-checkpoint")).target("4").mixed(true).load().migrate(); return db;
    }
}
