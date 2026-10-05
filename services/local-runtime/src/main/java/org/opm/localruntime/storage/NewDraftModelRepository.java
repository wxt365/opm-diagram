package org.opm.localruntime.storage;

import org.opm.localruntime.api.generated.DraftSaveContract.DraftPreparationRequest;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import java.sql.Connection;
import java.time.Instant;
import java.time.format.DateTimeFormatterBuilder;
import java.util.UUID;

/** 新模型在创建事务内初始化草稿；不迁移旧模型，不开启第二个事务。 */
public final class NewDraftModelRepository {
    private NewDraftModelRepository() { }

    public static void initialize(Connection connection, String projectId, String modelId, String revisionId, String now) throws Exception {
        if (connection.getAutoCommit()) throw new IllegalStateException("草稿初始化必须属于新模型事务");
        String raw;
        try (var statement = connection.prepareStatement("SELECT document_json FROM revision_document WHERE model_id=? AND revision_id=?")) {
            statement.setString(1, modelId); statement.setString(2, revisionId);
            try (var rows = statement.executeQuery()) {
                if (!rows.next()) throw new IllegalStateException("初始模型版本不存在");
                raw = rows.getString(1);
            }
        }
        var document = SaveContentDigestV1.read(raw);
        var request = new DraftPreparationRequest(projectId, modelId, revisionId, HybridSavePreparation.hash(raw),
                document.at("/profile_binding/binding_digest/digest").asText(), id("draft"), id("checkpoint"),
                new DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(Instant.parse(now)));
        var source = PreparedDraftRepository.source(connection, request);
        PreparedDraftRepository.seed(connection, request, source, ignored -> { });
        try (var statement = connection.prepareStatement("INSERT INTO model_save_mode VALUES (?,'JOURNALED_DRAFT_V2',?)")) {
            statement.setString(1, modelId); statement.setString(2, request.draft_id());
            if (statement.executeUpdate() != 1) throw new IllegalStateException("草稿模式初始化失败");
        }
        DraftJournalRepository.scope(connection, projectId, modelId);
        var snapshot = DraftJournalRepository.load(connection, modelId);
        if (snapshot.token().edit_seq() != 0 || !snapshot.token().equals(snapshot.checkpointToken())
                || !SaveContentDigestV1.sha256(document).equals(snapshot.contentDigest())) {
            throw new IllegalStateException("草稿初始检查点不一致");
        }
    }

    private static String id(String prefix) { return prefix + "." + UUID.randomUUID().toString().replace("-", ""); }
}
