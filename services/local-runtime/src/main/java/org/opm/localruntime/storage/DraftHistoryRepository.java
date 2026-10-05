package org.opm.localruntime.storage;

import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import static org.opm.localruntime.storage.DraftJournalRepository.*;

/** 历史仅依赖不可变保存点和内容；不读取当前草稿或可回收检查点。 */
public final class DraftHistoryRepository {
    private DraftHistoryRepository() { }
    public record Entry(String revisionId, int sequence, String purpose, String createdAt) { }
    public record Saved(Entry entry, String contentDocument) { }

    public static Optional<Saved> find(Connection connection, String project, String model, String revision) throws SQLException {
        if (!available(connection)) return Optional.empty();
        try (var statement = connection.prepareStatement("""
                SELECT p.*,c.digest_version,c.model_json,c.artifact_json,c.artifact_digest,
                       (SELECT MAX(revision_sequence) FROM revision_document WHERE model_id=p.model_id) AS legacy_sequence
                FROM draft_savepoint p JOIN model_catalog m ON m.model_id=p.model_id
                LEFT JOIN draft_content c ON c.model_id=p.model_id AND c.content_digest=p.content_digest
                WHERE m.project_id=? AND p.model_id=? AND p.revision_id=?
                """)) {
            statement.setString(1, project); statement.setString(2, model); statement.setString(3, revision);
            try (var rows = statement.executeQuery()) {
                if (!rows.next()) return Optional.empty();
                try {
                    require("SaveContentDigest/1".equals(rows.getString("digest_version")), "DRAFT_RECOVERY_REQUIRED");
                    String metadata = rows.getString("artifact_json");
                    require(metadata != null && HybridSavePreparation.hash(metadata).equals(rows.getString("artifact_digest")), "DRAFT_RECOVERY_REQUIRED");
                    var document = SaveContentDigestV1.join(new SaveContentDigestV1.Parts(
                            (ObjectNode) DraftJsonDelta.read(rows.getString("model_json")), (ObjectNode) DraftJsonDelta.read(metadata)));
                    require(model.equals(document.path("model_id").asText())
                            && SaveContentDigestV1.sha256(document).equals(rows.getString("content_digest")), "DRAFT_RECOVERY_REQUIRED");
                    var entry = new Entry(revision, sequence(rows.getLong("legacy_sequence"), rows.getLong("history_sequence")), rows.getString("purpose"), rows.getString("created_at"));
                    return Optional.of(new Saved(entry, document.toString()));
                } catch (RuntimeException exception) { throw failure("DRAFT_RECOVERY_REQUIRED", exception); }
            }
        }
    }

    public static List<Entry> list(Connection connection, String project, String model) throws SQLException {
        if (!available(connection)) return List.of();
        var result = new ArrayList<Entry>();
        try (var statement = connection.prepareStatement("""
                SELECT p.*,(SELECT MAX(revision_sequence) FROM revision_document WHERE model_id=p.model_id) AS legacy_sequence,
                       (SELECT COUNT(*) FROM revision_document WHERE revision_id=p.revision_id) AS collision
                FROM draft_savepoint p JOIN model_catalog m ON m.model_id=p.model_id
                WHERE m.project_id=? AND p.model_id=? ORDER BY p.history_sequence DESC
                """)) {
            statement.setString(1, project); statement.setString(2, model);
            try (var rows = statement.executeQuery()) { while (rows.next()) {
                require(rows.getInt("collision") == 0, "DRAFT_RECOVERY_REQUIRED");
                result.add(new Entry(rows.getString("revision_id"), sequence(rows.getLong("legacy_sequence"), rows.getLong("history_sequence")), rows.getString("purpose"), rows.getString("created_at")));
            } }
        }
        return List.copyOf(result);
    }
    public static long legacySequence(Connection connection, String model) throws SQLException {
        try (var statement = connection.prepareStatement("SELECT COALESCE(MAX(revision_sequence),0) FROM revision_document WHERE model_id=?")) {
            statement.setString(1, model); try (var rows = statement.executeQuery()) { rows.next(); return rows.getLong(1); }
        }
    }
    private static int sequence(long legacy, long saved) {
        require(legacy > 0 && saved > 0 && legacy <= Integer.MAX_VALUE && saved <= Integer.MAX_VALUE - legacy, "DRAFT_RECOVERY_REQUIRED");
        return (int) (legacy + saved);
    }
    private static boolean available(Connection connection) throws SQLException {
        try (var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT 1 FROM sqlite_master WHERE type='table' AND name='draft_savepoint'")) { return rows.next(); }
    }
}
