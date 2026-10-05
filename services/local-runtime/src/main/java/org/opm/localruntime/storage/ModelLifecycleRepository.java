package org.opm.localruntime.storage;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Instant;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** 生命周期与收据共同提交；清理范围始终限定为一个项目中的一个模型。 */
public final class ModelLifecycleRepository {
    private static final String OPERATION = "API-PRJ-013";
    private static final ObjectMapper JSON = new ObjectMapper();
    private final Path database;
    public ModelLifecycleRepository(Path database) { this.database = database; }
    public static final class Failure extends RuntimeException {
        private final String code;
        public Failure(String code, String message) { super(message); this.code = code; }
        public String code() { return code; }
    }

    public Map<String, String> change(String project, String model, String command, String digest,
                                      String action, String expectedState, String confirmationName) {
        try (var connection = SqliteConnectionFactory.create(database).getConnection()) {
            execute(connection, "BEGIN IMMEDIATE");
            try {
                try (var statement = connection.prepareStatement("SELECT request_digest,result_json FROM idempotency_record WHERE operation_id=? AND aggregate_id=? AND command_id=?")) {
                    statement.setString(1, OPERATION); statement.setString(2, model); statement.setString(3, command);
                    try (var rows = statement.executeQuery()) {
                        if (rows.next()) {
                            if (!digest.equals(rows.getString(1))) throw new Failure("IDEMPOTENCY_MISMATCH", "该操作标识已用于不同请求");
                            var result = JSON.readTree(rows.getString(2)); execute(connection, "COMMIT");
                            return Map.of("project_id", result.get("project_id").asText(), "model_id", result.get("model_id").asText(), "lifecycle_state", result.get("lifecycle_state").asText());
                        }
                    }
                }
                String name;
                try (var statement = connection.prepareStatement("SELECT m.name,m.status FROM model_catalog m JOIN project_metadata p ON p.project_id=m.project_id WHERE m.project_id=? AND m.model_id=? AND p.status='ACTIVE'")) {
                    statement.setString(1, project); statement.setString(2, model);
                    try (var rows = statement.executeQuery()) {
                        if (!rows.next()) throw new Failure("NOT_FOUND", "模型不存在或项目已归档");
                        name = rows.getString(1);
                        if (!expectedState.equals(rows.getString(2))) throw new Failure("REVISION_CONFLICT", "模型状态已变化，请刷新列表");
                    }
                }
                if (action.equals("PURGE") && !name.equals(confirmationName)) throw new Failure("INVALID_ARGUMENT", "请输入完整模型名称确认永久删除");
                String state = action.equals("RESTORE") ? "ACTIVE" : action.equals("TRASH") ? "ARCHIVED" : "PURGED";
                String now = Instant.now().toString();
                if (action.equals("PURGE")) purge(connection, model);
                else update(connection, "UPDATE model_catalog SET status=?,updated_at=? WHERE model_id=?", state, now, model);
                update(connection, "UPDATE project_metadata SET updated_at=? WHERE project_id=?", now, project);
                var result = Map.of("project_id", project, "model_id", model, "lifecycle_state", state);
                update(connection, "INSERT INTO idempotency_record(operation_id,aggregate_id,command_id,request_digest,result_status,result_json,created_at) VALUES (?,?,?,?,'COMMITTED',?,?)",
                        OPERATION, model, command, digest, JSON.writeValueAsString(result), now);
                // 项目级审计保留模型 ID，但不持有将被清理的外键。
                update(connection, "INSERT INTO operation_record(operation_record_id,project_id,operation_id,aggregate_id,command_id,result_status,occurred_at) VALUES (?,?,?,?,?,'COMMITTED',?)",
                        "operation." + UUID.randomUUID().toString().replace("-", ""), project, OPERATION, model, command, now);
                execute(connection, "COMMIT"); return result;
            } catch (Exception exception) {
                try { execute(connection, "ROLLBACK"); } catch (SQLException rollback) { exception.addSuppressed(rollback); }
                if (exception instanceof Failure failure) throw failure;
                throw new StorageAccessException("模型生命周期事务失败", exception);
            }
        } catch (SQLException exception) { throw new StorageAccessException("无法打开模型生命周期事务", exception); }
    }

    private static void purge(Connection connection, String model) throws SQLException {
        execute(connection, "PRAGMA defer_foreign_keys=ON");
        update(connection, "INSERT INTO model_purge_authorization(model_id) VALUES (?)", model);
        Set<String> tables = new HashSet<>();
        try (var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT name FROM sqlite_master WHERE type='table'")) {
            while (rows.next()) tables.add(rows.getString(1));
        }
        if (tables.contains("draft_checkpoint_overlay")) update(connection,
                "DELETE FROM draft_checkpoint_overlay WHERE checkpoint_id IN (SELECT checkpoint_id FROM draft_checkpoint WHERE model_id=?)", model);
        update(connection, "DELETE FROM background_task WHERE input_revision_id IN (SELECT revision_id FROM revision_document WHERE model_id=?)", model);
        update(connection, "DELETE FROM background_task WHERE task_type='VALIDATE_MODEL' AND input_revision_id IS NULL AND json_extract(request_json,'$.model_id')=?", model);
        update(connection, "DELETE FROM operation_record WHERE model_id=? OR input_revision_id IN (SELECT revision_id FROM revision_document WHERE model_id=?) OR result_revision_id IN (SELECT revision_id FROM revision_document WHERE model_id=?)", model, model, model);
        update(connection, "DELETE FROM idempotency_record WHERE operation_id <> 'API-PRJ-013' AND (aggregate_id=? OR result_revision_id IN (SELECT revision_id FROM revision_document WHERE model_id=?) OR (operation_id='API-PRJ-007' AND json_extract(result_json,'$.model_id')=?))", model, model, model);
        for (String table : java.util.List.of("draft_retention", "draft_receipt", "draft_savepoint", "draft_journal", "draft_checkpoint", "model_save_mode", "draft_stream", "draft_content",
                "element_index", "fact_endpoint_index", "occurrence_index", "finding_index", "text_trace_index", "named_snapshot", "baseline", "revision_parent", "model_head", "revision_document")) {
            if (tables.contains(table)) update(connection, "DELETE FROM " + table + " WHERE model_id=?", model);
        }
        update(connection, "DELETE FROM model_purge_authorization WHERE model_id=?", model);
        update(connection, "DELETE FROM model_catalog WHERE model_id=?", model);
    }

    private static void update(Connection connection, String sql, String... values) throws SQLException {
        try (var statement = connection.prepareStatement(sql)) {
            for (int i = 0; i < values.length; i++) statement.setString(i + 1, values[i]);
            statement.executeUpdate();
        }
    }
    private static void execute(Connection connection, String sql) throws SQLException {
        try (var statement = connection.createStatement()) { statement.execute(sql); }
    }
}
