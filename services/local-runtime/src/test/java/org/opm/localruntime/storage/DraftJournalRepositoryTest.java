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
        try (var connection = SqliteConnectionFactory.create(database).getConnection(); var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT delta_json FROM draft_journal ORDER BY edit_seq LIMIT 1")) {
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
        Path absent = temporary.resolve("absent.sqlite"); code("INPUT_INVALID", () -> repository(absent, 0)); assertFalse(Files.exists(absent));
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
    void sqliteReceiptFailureRollsBackAlreadyWrittenDeltaAndStream() throws Exception {
        Path database = database("sql-failure", true); var repository = repository(database, 0); var initial = repository.read(PROJECT, MODEL);
        try (var connection = SqliteConnectionFactory.create(database).getConnection()) {
            execute(connection, "CREATE TRIGGER test_receipt_failure BEFORE INSERT ON draft_receipt BEGIN SELECT RAISE(ABORT,'测试存储写入失败'); END");
        }
        code("PERSISTENCE_FAILED", () -> repository.commit(PROJECT, MODEL, request(initial, "command.1"), document -> move(document, 5)));
        assertEquals(initial, repository.read(PROJECT, MODEL)); assertEquals(0, count(database, "draft_journal")); assertEquals(0, count(database, "draft_receipt"));
    }

    @Test
    void sqliteSerializesTwoRepositoryInstancesForTheSameExpectedToken() throws Exception {
        Path database = database("concurrent", true); var normal = repository(database, 0); var initial = normal.read(PROJECT, MODEL);
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1); var secondStarted = new CountDownLatch(1);
        var first = new DraftJournalRepository(database, clock(0), stage -> {
            if (!stage.equals("JOURNAL")) return; entered.countDown();
            try { assertTrue(release.await(5, TimeUnit.SECONDS)); } catch (InterruptedException exception) { throw new RuntimeException(exception); }
        });
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var a = executor.submit(() -> first.commit(PROJECT, MODEL, request(initial, "command.first"), document -> move(document, 4)));
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            var b = executor.submit(() -> { secondStarted.countDown(); return repository(database, 1).commit(PROJECT, MODEL, request(initial, "command.second"), document -> move(document, 5)); });
            try { assertTrue(secondStarted.await(5, TimeUnit.SECONDS)); } finally { release.countDown(); }
            assertEquals("DURABLE", a.get(10, TimeUnit.SECONDS).value().get("status").asText());
            var error = assertThrows(java.util.concurrent.ExecutionException.class, () -> b.get(10, TimeUnit.SECONDS));
            assertEquals("DRAFT_CONFLICT", ((DraftJournalRepository.Failure) error.getCause()).code());
        }
        assertEquals(1, count(database, "draft_journal")); assertEquals(1, count(database, "draft_receipt"));
    }

    @Test
    void damagedCheckpointMissingJournalAndCorruptReceiptFailClosed() throws Exception {
        for (String damage : List.of("checkpoint", "gap", "delta", "receipt", "deadline")) {
            Path database = database(damage, true); var repository = repository(database, 0); var initial = repository.read(PROJECT, MODEL);
            repository.commit(PROJECT, MODEL, request(initial, "command.1"), document -> move(document, 1));
            try (var connection = SqliteConnectionFactory.create(database).getConnection()) {
                switch (damage) {
                    case "checkpoint" -> { execute(connection, "DROP TRIGGER draft_content_no_update"); execute(connection, "UPDATE draft_content SET artifact_json='{}'"); }
                    case "gap" -> execute(connection, "DELETE FROM draft_journal");
                    case "delta" -> { execute(connection, "DROP TRIGGER draft_journal_no_update"); execute(connection, "UPDATE draft_journal SET artifact_delta_json='{}'"); }
                    case "receipt" -> { execute(connection, "DROP TRIGGER draft_receipt_no_update"); execute(connection, "UPDATE draft_receipt SET result_json='{}'"); }
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
        Path database = temporary.resolve(name + ".sqlite"), root = root(); var source = SqliteConnectionFactory.create(database);
        Flyway.configure().dataSource(source).locations("filesystem:" + root.resolve("docs/contracts/migrations/sqlite")).target(String.valueOf(version)).mixed(true).load().migrate();
        String raw = Files.readString(root.resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/g-opl-proc-001-consumption-object-pass.json"));
        var document = SaveContentDigestV1.read(raw); var binding = document.get("profile_binding");
        try (var connection = source.getConnection()) {
            execute(connection, "INSERT INTO project_metadata VALUES (?,?,?,NULL,'ACTIVE',?,?,?,?)", PROJECT, "测试", "test", binding.at("/profile/id").asText(), binding.at("/profile/version").asText(), NOW, NOW);
            execute(connection, "INSERT INTO model_catalog VALUES (?,?,?,?,?,'ACTIVE',?,?,?)", MODEL, PROJECT, "模型", "model", "描述", binding.toString(), NOW, NOW);
            execute(connection, "INSERT INTO profile_package VALUES (?,?,?,'DRAFT','{}',?)", binding.at("/profile/id").asText(), binding.at("/profile/version").asText(), binding.at("/profile/digest/digest").asText(), NOW);
            execute(connection, "INSERT INTO rule_set_package VALUES (?,?,?,'DRAFT','{}',?)", binding.at("/rule_set/id").asText(), binding.at("/rule_set/version").asText(), binding.at("/rule_set/digest/digest").asText(), NOW);
            execute(connection, "INSERT INTO revision_document VALUES (?,?,?,'0.2',?,?,?,?,?,?,?,?,'TEST',1,?)", document.get("revision_id").asText(), MODEL, 2,
                    binding.at("/profile/id").asText(), binding.at("/profile/version").asText(), binding.at("/rule_set/id").asText(), binding.at("/rule_set/version").asText(),
                    document.get("schema_set_ref").toString(), binding.toString(), raw, HybridSavePreparation.hash(raw), NOW);
            execute(connection, "INSERT INTO model_head VALUES (?,?,1,?)", MODEL, document.get("revision_id").asText(), NOW);
            if (version < 3) return database;
            connection.setAutoCommit(false);
            PreparedDraftRepository.seed(connection, new DraftPreparationRequest(PROJECT, MODEL, document.get("revision_id").asText(), HybridSavePreparation.hash(raw),
                    binding.at("/binding_digest/digest").asText(), "draft.test", "checkpoint.seed", NOW), new PreparedDraftRepository.Source(raw, document), ignored -> { });
            if (activate) execute(connection, "INSERT INTO model_save_mode VALUES (?,'JOURNALED_DRAFT_V2','draft.test')", MODEL);
            connection.commit();
        }
        return database;
    }
    private static Path root() { Path path = Path.of(System.getProperty("user.dir")).toAbsolutePath(); while (path != null && !Files.isDirectory(path.resolve("docs/contracts/migrations/sqlite"))) path = path.getParent(); assertNotNull(path); return path; }
    private static long count(Path database, String table) throws Exception { try (var connection = SqliteConnectionFactory.create(database).getConnection(); var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT count(*) FROM " + table)) { rows.next(); return rows.getLong(1); } }
    private static void execute(Connection connection, String sql, Object... values) throws Exception { try (var statement = connection.prepareStatement(sql)) { for (int i = 0; i < values.length; i++) statement.setObject(i + 1, values[i]); statement.executeUpdate(); } }
}
