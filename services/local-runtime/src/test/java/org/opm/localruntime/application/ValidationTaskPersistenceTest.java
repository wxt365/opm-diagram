package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.api.generated.DraftSaveContract.SaveRequest;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.storage.*;
import java.nio.file.Path;
import java.sql.Connection;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.*;

class ValidationTaskPersistenceTest {
    @TempDir Path storage;
    private final ObjectMapper json = new ObjectMapper();

    @Test void 混合保存版本校验可重试并在重启后保留精确身份() throws Exception {
        Path database = database(ignored -> { });
        var repository = new DraftSaveRepository(database, Clock.systemUTC());
        var before = repository.read(PROJECT, MODEL);
        String saved = repository.manual(PROJECT, MODEL, new SaveRequest("save.validation", before.token(), "MANUAL"), ignored -> { }).revision_id();
        var request = request(saved);
        var first = data(service().validate(PROJECT, MODEL, request));
        assertEquals(saved, first.get("input_revision")); assertEquals("COMPLETED", first.get("state"));
        request.put("request_id", "request.validation.retry");
        assertEquals(first, data(service().validate(PROJECT, MODEL, request)));
        var reopened = service().task("query.reopened", first.get("task_id").toString());
        assertEquals(saved, ((Map<?, ?>) reopened.get("meta")).get("read_revision"));
        assertEquals(first, data(reopened));
        assertEquals(before.token(), repository.read(PROJECT, MODEL).token());
        assertEquals(before.documentJson(), repository.read(PROJECT, MODEL).documentJson());
        assertEquals(1, scalar(database, "SELECT COUNT(*) FROM revision_document"));
        assertEquals(1, scalar(database, "SELECT COUNT(*) FROM background_task"));
        assertEquals(1, scalar(database, "SELECT COUNT(*) FROM operation_record WHERE operation_id='API-VAL-001'"));
        assertEquals("INCOMPLETE", result(database).get("coverage_state").asText());
        assertEquals(0, result(database).get("blocking").asInt());
        request.put("input_revision", json.readTree(before.documentJson()).get("revision_id").asText());
        assertThrows(ApiException.class, () -> service().validate(PROJECT, MODEL, request));
        assertEquals(1, scalar(database, "SELECT COUNT(*) FROM background_task"));
    }

    @Test void 旧版本任务保持外键且部分覆盖不能创建基线() throws Exception {
        Path database = database(ignored -> { });
        String revision = json.readTree(new DraftSaveRepository(database, Clock.systemUTC()).read(PROJECT, MODEL).documentJson()).get("revision_id").asText();
        var task = data(service().validate(PROJECT, MODEL, request(revision)));
        assertEquals(task, data(service().task("query.legacy", task.get("task_id").toString())));
        assertEquals(1, scalar(database, "SELECT COUNT(*) FROM background_task WHERE input_revision_id IS NOT NULL"));
        var baseline = new LinkedHashMap<>(request(revision)); baseline.remove("input_revision"); baseline.remove("scope");
        baseline.put("base_revision", revision); baseline.put("name", "不应创建"); baseline.put("command_id", "command.baseline");
        baseline.put("evidence_summary_token", result(database).get("evidence_summary_token").asText());
        assertThrows(ApiException.class, () -> service().baseline(PROJECT, MODEL, baseline));
        assertEquals(0, scalar(database, "SELECT COUNT(*) FROM baseline"));
    }

    @Test void 操作登记失败回滚任务和幂等记录并允许重试() throws Exception {
        Path database = database(ignored -> { });
        var repository = new DraftSaveRepository(database, Clock.systemUTC());
        String revision = repository.manual(PROJECT, MODEL, new SaveRequest("save.validation", repository.read(PROJECT, MODEL).token(), "MANUAL"), ignored -> { }).revision_id();
        try (var connection = connection(database); var statement = connection.createStatement()) {
            statement.execute("CREATE TRIGGER test_validation_failure BEFORE INSERT ON operation_record WHEN NEW.operation_id='API-VAL-001' BEGIN SELECT RAISE(ABORT,'test failure'); END");
        }
        assertThrows(ApiException.class, () -> service().validate(PROJECT, MODEL, request(revision)));
        assertEquals(0, scalar(database, "SELECT COUNT(*) FROM background_task"));
        assertEquals(0, scalar(database, "SELECT COUNT(*) FROM idempotency_record WHERE operation_id='API-VAL-001'"));
        try (var connection = connection(database); var statement = connection.createStatement()) { statement.execute("DROP TRIGGER test_validation_failure"); }
        assertEquals("COMPLETED", data(service().validate(PROJECT, MODEL, request(revision))).get("state"));
    }

    @Test void 旧任务摘要可以重放但错误的完整覆盖标记不能作为基线证据() throws Exception {
        Path database = database(ignored -> { });
        String revision = json.readTree(new DraftSaveRepository(database, Clock.systemUTC()).read(PROJECT, MODEL).documentJson()).get("revision_id").asText();
        var request = request(revision); var task = data(service().validate(PROJECT, MODEL, request));
        var oldResult = (com.fasterxml.jackson.databind.node.ObjectNode) result(database);
        oldResult.remove("findings"); oldResult.put("coverage_state", "COMPLETE");
        String rawDigest = java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(request)));
        try (var connection = connection(database)) {
            try (var statement = connection.prepareStatement("UPDATE background_task SET result_json=?")) { statement.setString(1, oldResult.toString()); statement.executeUpdate(); }
            try (var statement = connection.prepareStatement("UPDATE idempotency_record SET request_digest=? WHERE operation_id='API-VAL-001'")) { statement.setString(1, rawDigest); statement.executeUpdate(); }
        }
        assertEquals(task, data(service().validate(PROJECT, MODEL, request)));
        var baseline = new LinkedHashMap<>(request); baseline.remove("input_revision"); baseline.remove("scope");
        baseline.put("base_revision", revision); baseline.put("name", "旧汇总不能放行"); baseline.put("command_id", "command.old.baseline");
        baseline.put("evidence_summary_token", oldResult.get("evidence_summary_token").asText());
        assertThrows(ApiException.class, () -> service().baseline(PROJECT, MODEL, baseline));
        assertEquals(0, scalar(database, "SELECT COUNT(*) FROM baseline"));
    }

    @Test void 固定版本检查复用OPL规则并持久化问题() throws Exception {
        Path database = database(document -> {
            var modifiers = ((com.fasterxml.jackson.databind.node.ObjectNode) document.at("/facts/0")).putArray("modifiers");
            modifiers.addObject().put("modifier_id", "control.capability").put("value", "CAP-ISO-CTRL-007");
            modifiers.addObject().put("modifier_id", "control.segment").put("value", "PROCESS_INPUT");
        });
        String revision = json.readTree(new DraftSaveRepository(database, Clock.systemUTC()).read(PROJECT, MODEL).documentJson()).get("revision_id").asText();
        service().validate(PROJECT, MODEL, request(revision));
        var result = result(database); assertEquals(1, result.get("blocking").asInt());
        assertTrue(result.get("findings").toString().contains("rule.opl."));
        assertEquals("INCOMPLETE", result.get("coverage_state").asText());
    }

    private Path database(java.util.function.Consumer<com.fasterxml.jackson.databind.node.ObjectNode> arrange) throws Exception {
        Path database = create(storage, true, arrange);
        org.flywaydb.core.Flyway.configure().dataSource("jdbc:sqlite:" + database, "", "").locations(
                "filesystem:" + root().resolve("docs/contracts/migrations/sqlite"),
                "filesystem:" + root().resolve("docs/contracts/migrations/sqlite-checkpoint"),
                "filesystem:" + root().resolve("docs/contracts/migrations/sqlite-pin"), "classpath:db/digestv2")
                .target("6").mixed(true).load().migrate();
        return database;
    }
    private LocalApiService service() { return new LocalApiService(new ProjectDatabaseFactory(storage), new FileProfilePackageLoader(root().resolve("packages/profiles"))); }
    private Map<String, Object> request(String revision) {
        return new LinkedHashMap<>(Map.of("request_id", "request.validation", "command_id", "command.validation", "input_revision", revision, "scope", "FULL",
                "binding", Map.of("profile_id", "profile.iso19450.2024.draft", "profile_version", "0.2.0", "rule_set_id", "rules.iso19450.2024.draft", "rule_version", "0.1.0")));
    }
    @SuppressWarnings("unchecked") private Map<String, Object> data(Map<String, Object> response) { return (Map<String, Object>) response.get("data"); }
    private Connection connection(Path database) throws Exception { return java.sql.DriverManager.getConnection("jdbc:sqlite:" + database + "?foreign_keys=on"); }
    private long scalar(Path database, String sql) throws Exception {
        try (var connection = connection(database); var statement = connection.createStatement(); var rows = statement.executeQuery(sql)) { rows.next(); return rows.getLong(1); }
    }
    private com.fasterxml.jackson.databind.JsonNode result(Path database) throws Exception {
        try (var connection = connection(database); var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT result_json FROM background_task")) { assertTrue(rows.next()); return json.readTree(rows.getString(1)); }
    }
}
