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
    public OperationHistoryRepository(Path database, Clock clock) { journal = new DraftJournalRepository(database, clock); }

    static void append(Connection connection, String model, String key, String digest, DraftToken token, String time, ObjectNode detail, String status) throws Exception {
        detail.put("draft_id", token.draft_id()).put("edit_seq", token.edit_seq()).put("status", status);
        try (var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT COALESCE(MAX(rowid),0) FROM draft_receipt")) {
            rows.next(); detail.put("receipt_order", rows.getLong(1)).put("after_receipt", key.startsWith("AUTO."));
        }
        update(connection, "INSERT INTO idempotency_record VALUES (?,?,?,?,?,NULL,?,?,NULL)",
                NAMESPACE, model, key, digest, status, detail.toString(), time);
    }

    public ObjectNode read(String project, String model, String revision, String before) {
        return journal.transaction(false, connection -> {
            try (var statement = connection.prepareStatement("SELECT 1 FROM model_catalog m JOIN project_metadata p ON p.project_id=m.project_id WHERE m.model_id=? AND m.project_id=? AND m.status='ACTIVE' AND p.status='ACTIVE'")) {
                statement.setString(1, model); statement.setString(2, project);
                try (var rows = statement.executeQuery()) { require(rows.next(), "NOT_FOUND"); }
            }
            boolean draftTables = table(connection, "draft_receipt");
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
                    try (var statement = connection.prepareStatement("SELECT MIN(created_at),MIN(rowid) FROM draft_receipt WHERE model_id=? AND operation IN ('SAVE','PIN') AND json_extract(result_json,'$.revision_id')=?")) {
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
            String sources = """
                SELECT 'history.legacy.'||o.operation_record_id AS id,o.occurred_at AS time,'LEGACY' AS source,
                  json_object('operation',o.operation_id,'status',o.result_status,'revision_id',o.result_revision_id) AS body,NULL AS draft,NULL AS seq,NULL AS receipt_order,0 AS after_receipt
                FROM operation_record o LEFT JOIN revision_document r ON r.revision_id=COALESCE(o.result_revision_id,o.input_revision_id)
                WHERE o.project_id=? AND o.model_id=? AND COALESCE(r.revision_sequence,0)<=?
                """;
            if (draftTables) sources += """
                UNION ALL SELECT 'history.'||command_id,created_at,'DETAIL',result_json,
                  json_extract(result_json,'$.draft_id'),json_extract(result_json,'$.edit_seq'),json_extract(result_json,'$.receipt_order'),COALESCE(json_extract(result_json,'$.after_receipt'),0)
                FROM idempotency_record WHERE aggregate_id=? AND operation_id='DRAFT_OPERATION_HISTORY_V1'
                UNION ALL SELECT 'history.'||operation||'.'||idempotency_id,created_at,operation,result_json,
                  COALESCE(json_extract(result_json,'$.result_token.draft_id'),json_extract(result_json,'$.captured_token.draft_id')),
                  COALESCE(json_extract(result_json,'$.result_token.edit_seq'),json_extract(result_json,'$.captured_token.edit_seq')),d.rowid,0
                FROM draft_receipt d WHERE model_id=? AND NOT EXISTS (SELECT 1 FROM idempotency_record i
                  WHERE i.operation_id='DRAFT_OPERATION_HISTORY_V1' AND i.aggregate_id=d.model_id AND i.command_id=d.operation||'.'||d.idempotency_id)
                """;
            String sql = "SELECT * FROM (" + sources + ") WHERE time<=? AND (seq IS NULL OR seq<=? AND (? IS NULL OR draft=?)) AND (receipt_order IS NULL OR receipt_order<? OR receipt_order=? AND after_receipt=0) AND (time<? OR time=? AND id<?) ORDER BY time DESC,id DESC LIMIT 101";
            var data = JSON.createObjectNode(); var items = data.putArray("items"); data.putNull("next_before");
            try (var statement = connection.prepareStatement(sql)) {
                int i = 1; statement.setString(i++, project); statement.setString(i++, model); statement.setLong(i++, legacySequence);
                if (draftTables) { statement.setString(i++, model); statement.setString(i++, model); }
                statement.setString(i++, cutoff); statement.setLong(i++, seq); statement.setString(i++, draft); statement.setString(i++, draft);
                statement.setLong(i++, receiptLimit); statement.setLong(i++, receiptLimit);
                statement.setString(i++, cursorTime); statement.setString(i++, cursorTime); statement.setString(i, cursorId);
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
                    }
                }
            }
            return data;
        });
    }
    private static boolean table(Connection connection, String name) throws Exception {
        try (var statement = connection.prepareStatement("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")) {
            statement.setString(1, name); try (var rows = statement.executeQuery()) { return rows.next(); }
        }
    }
}
