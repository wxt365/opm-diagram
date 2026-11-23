package org.opm.localruntime.storage;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Connection;
import static org.opm.localruntime.storage.DraftJournalRepository.*;

/** 持久化双向恢复链；方向切换生成逆操作，内部记录不作为用户编辑展示。 */
final class DraftOperationRecovery {
    private static final String NAMESPACE = "DRAFT_OPERATION_RECOVERY_V1";

    static ObjectNode read(Connection connection, String model) throws Exception {
        ObjectNode slot = stored(connection, model, "LATEST");
        if (slot != null && slot.path("action").asText().equals("UNDO")) return slot;
        return fromLog(connection, model, load(connection, model));
    }

    static ObjectNode redo(Connection connection, String model) throws Exception {
        return stored(connection, model, "REDO");
    }

    private static ObjectNode stored(Connection connection, String model, String key) throws Exception {
        try (var statement = connection.prepareStatement("SELECT result_json FROM idempotency_record WHERE operation_id=? AND aggregate_id=? AND command_id=?")) {
            statement.setString(1, NAMESPACE); statement.setString(2, model); statement.setString(3, key);
            try (var rows = statement.executeQuery()) { return rows.next() ? (ObjectNode) DraftJsonDelta.read(rows.getString(1)) : null; }
        }
    }

    private static ObjectNode fromLog(Connection connection, String model, Snapshot current) throws Exception {
        String operation = JdbcDialect.jsonText(connection, "i.result_json", "operation");
        String status = JdbcDialect.jsonText(connection, "i.result_json", "status");
        try (var statement = connection.prepareStatement("SELECT j.edit_seq,j.command_id,i.result_json FROM draft_journal j JOIN idempotency_record i ON i.aggregate_id=j.model_id AND i.command_id='EDIT.'||j.command_id AND i.operation_id=? WHERE j.model_id=? AND j.draft_id=? AND j.result_digest=? AND "
                + operation + "<>'RESTORE_OPERATION' AND " + status + "<>'UNDONE' ORDER BY j.edit_seq DESC LIMIT 1")) {
            statement.setString(1, OperationHistoryRepository.NAMESPACE); statement.setString(2, model);
            statement.setString(3, current.token().draft_id()); statement.setString(4, current.contentDigest());
            try (var rows = statement.executeQuery()) {
                if (!rows.next()) return null;
                long seq = rows.getLong(1);
                Snapshot target;
                try { target = load(connection, model, seq - 1); }
                catch (Failure unavailable) { return null; }
                var document = beforeDocument(current); var previous = beforeDocument(target);
                if (!document.path("schema_version").equals(previous.path("schema_version"))) return null;
                var detail = DraftJsonDelta.read(rows.getString(3));
                var slot = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
                slot.put("record_id", "history.EDIT." + rows.getString(2)).put("draft_id", current.token().draft_id())
                        .put("edit_seq", current.token().edit_seq()).put("digest", current.contentDigest())
                        .put("action", "UNDO").put("title", detail.path("title").asText()).put("target_digest", target.contentDigest());
                slot.set("target", previous); return slot;
            }
        }
    }

    static boolean current(ObjectNode slot, Snapshot snapshot) {
        return slot != null && slot.path("draft_id").asText().equals(snapshot.token().draft_id())
                && slot.path("edit_seq").asLong(-1) == snapshot.token().edit_seq()
                && slot.path("digest").asText().equals(snapshot.contentDigest());
    }

    static ObjectNode target(ObjectNode slot, Snapshot snapshot, JsonNode payload) {
        require(current(slot, snapshot) && slot.path("record_id").equals(payload.get("record_id"))
                && slot.path("action").equals(payload.get("action")), "DRAFT_CONFLICT");
        var target = ((ObjectNode) slot.required("target")).deepCopy();
        require(org.opm.localruntime.semantic.SaveContentDigestV1.sha256(target).equals(slot.path("target_digest").asText()), "DRAFT_RECOVERY_REQUIRED");
        return target;
    }

    static void replace(Connection connection, String model, String command, String now, Snapshot before,
                        ObjectNode document, ObjectNode detail, ObjectNode previous, boolean restore, boolean supported) throws Exception {
        ObjectNode oppositeBefore = restore ? (previous.path("action").asText().equals("UNDO") ? redo(connection, model) : read(connection, model)) : null;
        try (var statement = connection.prepareStatement("DELETE FROM idempotency_record WHERE operation_id=? AND aggregate_id=? AND command_id='LATEST'")) {
            statement.setString(1, NAMESPACE); statement.setString(2, model); statement.executeUpdate();
        }
        if (restore) {
            boolean undo = previous.path("action").asText().equals("UNDO");
            String source = undo ? "LATEST" : "REDO", opposite = undo ? "REDO" : "LATEST";
            ObjectNode other = oppositeBefore;
            ObjectNode inverse = previous.deepCopy(); inverse.remove("previous_key");
            inverse.put("action", undo ? "REDO" : "UNDO").put("edit_seq", before.token().edit_seq() + 1)
                    .put("digest", org.opm.localruntime.semantic.SaveContentDigestV1.sha256(document)).put("target_digest", before.contentDigest());
            inverse.set("target", beforeDocument(before));
            if (current(other, before)) {
                String key = "STEP.OPPOSITE." + command; save(connection, model, key, now, other); inverse.put("previous_key", key);
            }
            ObjectNode next = previous.has("previous_key") ? stored(connection, model, previous.path("previous_key").asText())
                    : undo ? fromLog(connection, model, new Snapshot(before.token(), document.toString(), org.opm.localruntime.semantic.SaveContentDigestV1.sha256(document), null, null, before.checkpointToken(), before.lastManualRevision())) : null;
            clear(connection, model, "REDO");
            if (next != null) {
                next.put("edit_seq", before.token().edit_seq() + 1).put("digest", org.opm.localruntime.semantic.SaveContentDigestV1.sha256(document));
                save(connection, model, source, now, next);
            }
            save(connection, model, opposite, now, inverse);
            return;
        }
        clear(connection, model, "REDO");
        if (!supported) return;
        String title = detail.path("title").asText();
        ObjectNode slot = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
        slot.put("record_id", "history.EDIT." + command).put("draft_id", before.token().draft_id())
                .put("edit_seq", before.token().edit_seq() + 1).put("digest", org.opm.localruntime.semantic.SaveContentDigestV1.sha256(document))
                .put("action", "UNDO").put("title", title).put("target_digest", before.contentDigest());
        slot.set("target", beforeDocument(before));
        if (current(previous, before)) {
            String key = "STEP." + command;
            save(connection, model, key, now, previous); slot.put("previous_key", key);
        }
        save(connection, model, "LATEST", now, slot);
    }

    private static void clear(Connection connection, String model, String key) throws Exception {
        try (var statement = connection.prepareStatement("DELETE FROM idempotency_record WHERE operation_id=? AND aggregate_id=? AND command_id=?")) {
            statement.setString(1, NAMESPACE); statement.setString(2, model); statement.setString(3, key); statement.executeUpdate();
        }
    }

    private static void save(Connection connection, String model, String key, String now, ObjectNode slot) throws Exception {
        update(connection, "INSERT INTO idempotency_record(operation_id,aggregate_id,command_id,request_digest,result_status,result_revision_id,result_json,created_at,expires_at) VALUES (?,?,?,?,'DURABLE',NULL,?,?,NULL)",
                NAMESPACE, model, key, slot.path("digest").asText(), slot.toString(), now);
    }

    static void markUndone(Connection connection, String model, ObjectNode slot) throws Exception {
        String key = slot.path("record_id").asText().substring("history.".length());
        try (var statement = connection.prepareStatement("SELECT result_json FROM idempotency_record WHERE operation_id=? AND aggregate_id=? AND command_id=?")) {
            statement.setString(1, OperationHistoryRepository.NAMESPACE); statement.setString(2, model); statement.setString(3, key);
            try (var rows = statement.executeQuery()) {
                if (rows.next()) {
                    var detail = (ObjectNode) DraftJsonDelta.read(rows.getString(1)); detail.put("status", slot.path("action").asText().equals("UNDO") ? "UNDONE" : "DURABLE");
                    update(connection, "UPDATE idempotency_record SET result_json=? WHERE operation_id=? AND aggregate_id=? AND command_id=?",
                            detail.toString(), OperationHistoryRepository.NAMESPACE, model, key);
                }
            }
        }
    }

    private static ObjectNode beforeDocument(Snapshot snapshot) {
        return org.opm.localruntime.semantic.SaveContentDigestV1.read(snapshot.documentJson());
    }
}
