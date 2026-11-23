package org.opm.localruntime.storage;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.api.generated.DraftSaveContract.DraftToken;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.time.Clock;
import java.util.Base64;
import static org.opm.localruntime.storage.DraftJournalRepository.*;

/** 历史独立于可压缩的 Journal，沿用现有事务与内部幂等详情存储。 */
public final class OperationHistoryRepository {
    private static final ObjectMapper JSON = new ObjectMapper();
    static final String NAMESPACE = "DRAFT_OPERATION_HISTORY_V1";
    private final DraftJournalRepository journal;
    public OperationHistoryRepository(ProjectScope database, Clock clock) { journal = new DraftJournalRepository(database, clock); }

    static void append(Connection connection, String model, String key, String digest, DraftToken token, String time, ObjectNode detail, String status) throws Exception {
        detail.put("draft_id", token.draft_id()).put("edit_seq", token.edit_seq()).put("status", status);
        try (var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT COALESCE(MAX(receipt_order),0) FROM draft_receipt")) {
            rows.next(); detail.put("receipt_order", rows.getLong(1)).put("after_receipt", key.startsWith("AUTO."));
        }
        update(connection, "INSERT INTO idempotency_record(operation_id,aggregate_id,command_id,request_digest,result_status,result_revision_id,result_json,created_at,expires_at) VALUES (?,?,?,?,?,NULL,?,?,NULL)",
                NAMESPACE, model, key, digest, status, detail.toString(), time);
    }

    public ObjectNode read(String project, String model, String revision, String before) {
        return journal.transaction(false, connection -> {
            try (var statement = connection.prepareStatement("SELECT 1 FROM model_catalog m JOIN project_metadata p ON p.project_id=m.project_id WHERE m.model_id=? AND m.project_id=? AND m.status='ACTIVE' AND p.status='ACTIVE'")) {
                statement.setString(1, model); statement.setString(2, project);
                try (var rows = statement.executeQuery()) { require(rows.next(), "NOT_FOUND"); }
            }
            boolean draftTables = table(connection, "draft_receipt");
            ObjectNode recovery = draftTables && revision.equals("HEAD") ? DraftOperationRecovery.read(connection, model) : null;
            if (recovery != null && !DraftOperationRecovery.current(recovery, DraftJournalRepository.load(connection, model))) recovery = null;
            ObjectNode redo = draftTables && revision.equals("HEAD") ? DraftOperationRecovery.redo(connection, model) : null;
            if (redo != null && !DraftOperationRecovery.current(redo, DraftJournalRepository.load(connection, model))) redo = null;
            String draft = null, cutoff = "9999-12-31T23:59:59.999Z";
            long seq = Long.MAX_VALUE, legacySequence = Long.MAX_VALUE, receiptLimit = Long.MAX_VALUE;
            if (!revision.equals("HEAD")) {
                boolean found = false;
                if (draftTables) try (var statement = connection.prepareStatement("SELECT draft_id,captured_seq,created_at FROM draft_savepoint WHERE model_id=? AND revision_id=?")) {
                    statement.setString(1, model); statement.setString(2, revision);
                    try (var rows = statement.executeQuery()) { if (rows.next()) {
                        found = true; draft = rows.getString(1); seq = rows.getLong(2); cutoff = rows.getString(3);
                    } }
                }
                if (found) {
                    // 保存收据可能比 savepoint 晚一个时钟刻度；以产生该版本的第一条收据为截止。
                    try (var statement = connection.prepareStatement("SELECT MIN(created_at),MIN(receipt_order) FROM draft_receipt WHERE model_id=? AND operation IN ('SAVE','PIN') AND " + JdbcDialect.jsonText(connection, "result_json", "revision_id") + "=?")) {
                        statement.setString(1, model); statement.setString(2, revision);
                        try (var rows = statement.executeQuery()) { if (rows.next() && rows.getString(1) != null) {
                            receiptLimit = rows.getLong(2);
                            if (rows.getString(1).compareTo(cutoff) > 0) cutoff = rows.getString(1);
                        } }
                    }
                    try (var statement = connection.prepareStatement("SELECT r.revision_sequence FROM draft_stream s JOIN revision_document r ON r.revision_id=s.base_revision_id WHERE s.model_id=? AND s.draft_id=?")) {
                        statement.setString(1, model); statement.setString(2, draft);
                        try (var rows = statement.executeQuery()) { require(rows.next(), "DRAFT_RECOVERY_REQUIRED"); legacySequence = rows.getLong(1); }
                    }
                } else try (var statement = connection.prepareStatement("SELECT revision_sequence,created_at FROM revision_document WHERE model_id=? AND revision_id=?")) {
                    statement.setString(1, model); statement.setString(2, revision);
                    try (var rows = statement.executeQuery()) { require(rows.next(), "NOT_FOUND"); legacySequence = rows.getLong(1); cutoff = rows.getString(2); seq = -1; }
                }
            }
            String cursorTime = "9999-12-31T23:59:59.999Z", cursorId = "~";
            if (before != null) {
                try {
                    require(before.length() <= 2048, "INPUT_INVALID");
                    var cursor = JSON.readTree(Base64.getUrlDecoder().decode(before));
                    require(cursor.isObject() && cursor.size() == 5 && cursor.path("project").asText().equals(project)
                            && cursor.path("model").asText().equals(model) && cursor.path("revision").asText().equals(revision), "INPUT_INVALID");
                    cursorTime = cursor.required("time").asText(); cursorId = cursor.required("id").asText();
                    java.time.Instant.parse(cursorTime); require(!cursorId.isBlank(), "INPUT_INVALID");
                } catch (Exception error) { throw failure("INPUT_INVALID", error); }
            }
            String legacyBody = JdbcDialect.sqlite(connection)
                    ? "json_object('operation',o.operation_id,'status',o.result_status,'revision_id',o.result_revision_id)"
                    : "json_build_object('operation',o.operation_id,'status',o.result_status,'revision_id',o.result_revision_id)::text";
            String sources = """
                SELECT 'history.legacy.'||o.operation_record_id AS id,o.occurred_at AS time,'LEGACY' AS source,
                  %s AS body,CAST(NULL AS TEXT) AS draft,CAST(NULL AS BIGINT) AS seq,CAST(NULL AS BIGINT) AS receipt_order,0 AS after_receipt
                FROM operation_record o LEFT JOIN revision_document r ON r.revision_id=COALESCE(o.result_revision_id,o.input_revision_id)
                WHERE o.project_id=? AND o.model_id=? AND COALESCE(r.revision_sequence,0)<=?
                """.formatted(legacyBody);
            if (draftTables) sources += """
                UNION ALL SELECT 'history.'||command_id,created_at,'DETAIL',result_json,
                  %s,CAST(CAST(%s AS NUMERIC) AS BIGINT),CAST(CAST(%s AS NUMERIC) AS BIGINT),CASE WHEN CAST(%s AS BOOLEAN) THEN 1 ELSE 0 END
                FROM idempotency_record WHERE aggregate_id=? AND operation_id='DRAFT_OPERATION_HISTORY_V1'
                UNION ALL SELECT 'history.'||operation||'.'||idempotency_id,created_at,operation,result_json,
                  COALESCE(%s,%s),CAST(CAST(COALESCE(%s,%s) AS NUMERIC) AS BIGINT),d.receipt_order,0
                FROM draft_receipt d WHERE model_id=? AND NOT EXISTS (SELECT 1 FROM idempotency_record i
                  WHERE i.operation_id='DRAFT_OPERATION_HISTORY_V1' AND i.aggregate_id=d.model_id AND i.command_id=d.operation||'.'||d.idempotency_id)
                """.formatted(JdbcDialect.jsonText(connection, "result_json", "draft_id"),
                    JdbcDialect.jsonText(connection, "result_json", "edit_seq"), JdbcDialect.jsonText(connection, "result_json", "receipt_order"),
                    JdbcDialect.jsonText(connection, "result_json", "after_receipt"), JdbcDialect.jsonText(connection, "result_json", "result_token,draft_id"),
                    JdbcDialect.jsonText(connection, "result_json", "captured_token,draft_id"), JdbcDialect.jsonText(connection, "result_json", "result_token,edit_seq"),
                    JdbcDialect.jsonText(connection, "result_json", "captured_token,edit_seq"));
            String sql = "SELECT * FROM (" + sources + ") history WHERE time<=? AND (seq IS NULL OR seq<=? AND (CAST(? AS TEXT) IS NULL OR draft=?)) AND (receipt_order IS NULL OR receipt_order<? OR receipt_order=? AND after_receipt=0) AND (time<? OR time=? AND id<?) ORDER BY time DESC,id DESC LIMIT 101";
            sql = sql.replace(" ORDER BY time DESC", " AND COALESCE(" + JdbcDialect.jsonText(connection, "body", "operation") + ",'')<>'AUTO_SAVE' ORDER BY time DESC");
            if (revision.equals("HEAD")) {
                String visible = " AND (COALESCE(" + JdbcDialect.jsonText(connection, "body", "status") + ",'')<>'UNDONE' OR id=?) AND COALESCE("
                        + JdbcDialect.jsonText(connection, "body", "operation") + ",'')<>'RESTORE_OPERATION'";
                sql = sql.replace(" ORDER BY time DESC", visible + " ORDER BY time DESC");
            }
            var data = JSON.createObjectNode(); var items = data.putArray("items"); data.putNull("next_before");
            try (var statement = connection.prepareStatement(sql)) {
                int i = 1; statement.setString(i++, project); statement.setString(i++, model); statement.setLong(i++, legacySequence);
                if (draftTables) { statement.setString(i++, model); statement.setString(i++, model); }
                statement.setString(i++, cutoff); statement.setLong(i++, seq); statement.setString(i++, draft); statement.setString(i++, draft);
                statement.setLong(i++, receiptLimit); statement.setLong(i++, receiptLimit);
                statement.setString(i++, cursorTime); statement.setString(i++, cursorTime); statement.setString(i++, cursorId);
                if (revision.equals("HEAD")) statement.setString(i, redo == null ? "" : redo.path("record_id").asText());
                try (var rows = statement.executeQuery()) {
                    while (rows.next()) {
                        if (items.size() == 100) {
                            var last = items.get(99);
                            var cursor = JSON.createObjectNode().put("project", project).put("model", model).put("revision", revision)
                                    .put("time", last.path("occurred_at").asText()).put("id", last.path("record_id").asText());
                            data.put("next_before", Base64.getUrlEncoder().withoutPadding().encodeToString(cursor.toString().getBytes(StandardCharsets.UTF_8))); break;
                        }
                        var body = DraftJsonDelta.read(rows.getString("body")); String source = rows.getString("source");
                        boolean detail = source.equals("DETAIL"), oldEdit = source.equals("EDIT"), legacy = source.equals("LEGACY");
                        String title = detail ? body.path("title").asText() : switch (source) {
                            case "EDIT" -> "编辑模型（旧记录未保留操作详情）";
                            case "SAVE" -> "手动保存模型";
                            case "PIN" -> "固定模型版本";
                            default -> switch (body.path("operation").asText()) {
                                case "API-PRJ-007" -> "创建模型";
                                case "API-OPD-002" -> "导入 OPD 并创建模型";
                                default -> "模型操作（旧记录未保留操作详情）";
                            };
                        };
                        var item = items.addObject().put("record_id", rows.getString("id")).put("occurred_at", rows.getString("time"))
                                .put("title", title).put("operation", detail || legacy ? body.path("operation").asText() : source)
                                .put("status", body.path("status").asText(source.equals("PIN") ? "SAVED" : "COMPLETED"))
                                .put("detail_available", detail || !oldEdit && !legacy);
                        item.put("context_id", detail ? body.path("context_id").asText(null) : null);
                        item.put("context_name", detail ? body.path("context_name").asText(null) : null);
                        String saved = body.path("revision_id").asText(null);
                        item.put("revision_id", saved);
                        if (recovery != null && recovery.path("record_id").asText().equals(rows.getString("id")))
                            item.put("recovery_action", recovery.path("action").asText());
                        if (redo != null && redo.path("record_id").asText().equals(rows.getString("id"))) item.put("recovery_action", "REDO");
                    }
                }
            }
            return data;
        });
    }
    /** 工具栏只读取当前恢复槽及对应详情，不扫描历史分页。 */
    public ObjectNode recovery(String project, String model, com.fasterxml.jackson.databind.JsonNode token) {
        return journal.transaction(false, connection -> {
            scope(connection, project, model);
            var snapshot = DraftJournalRepository.load(connection, model);
            require(snapshot.token().binding_digest().equals(token.path("binding_digest").asText()), "RULE_VERSION_CONFLICT");
            require(snapshot.token().draft_id().equals(token.path("draft_id").asText())
                    && snapshot.token().edit_seq() == token.path("edit_seq").asLong(-1), "DRAFT_CONFLICT");
            var data = JSON.createObjectNode(); var items = data.putArray("items"); data.putNull("next_before");
            for (var action : java.util.List.of("UNDO", "REDO")) {
                var slot = action.equals("UNDO") ? DraftOperationRecovery.read(connection, model) : DraftOperationRecovery.redo(connection, model);
                if (!DraftOperationRecovery.current(slot, snapshot)) continue;
                String record = slot.path("record_id").asText();
                require(record.startsWith("history."), "DRAFT_RECOVERY_REQUIRED");
                try (var statement = connection.prepareStatement("SELECT result_json,created_at FROM idempotency_record WHERE operation_id=? AND aggregate_id=? AND command_id=?")) {
                    statement.setString(1, NAMESPACE); statement.setString(2, model); statement.setString(3, record.substring("history.".length()));
                    try (var rows = statement.executeQuery()) {
                        require(rows.next(), "DRAFT_RECOVERY_REQUIRED");
                        var body = DraftJsonDelta.read(rows.getString(1));
                        var item = items.addObject().put("record_id", record).put("occurred_at", rows.getString(2))
                                .put("title", body.path("title").asText()).put("operation", body.path("operation").asText())
                                .put("status", body.path("status").asText()).put("detail_available", true).put("recovery_action", action);
                        item.put("context_id", body.path("context_id").asText(null)); item.put("context_name", body.path("context_name").asText(null));
                        item.put("revision_id", body.path("revision_id").asText(null));
                    }
                }
            }
            return data;
        });
    }
    private static boolean table(Connection connection, String name) throws Exception {
        return ProjectConnectionFactory.hasTable(connection, name);
    }
}
