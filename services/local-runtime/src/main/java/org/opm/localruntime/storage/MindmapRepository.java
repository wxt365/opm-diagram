package org.opm.localruntime.storage;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.application.MindmapDocuments;
import org.opm.localruntime.api.generated.DraftWorkspaceContract;
import java.nio.file.Path;
import java.sql.Connection;
import java.time.Clock;
import java.util.UUID;

/** 分析 CAS 与转换来源共用项目 SQLite，正式提交可在原 Journal 事务内调用。 */
public final class MindmapRepository {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final DraftJournalRepository journal;
    public MindmapRepository(Path database, Clock clock) { journal = new DraftJournalRepository(database, clock); }
    public JsonNode execute(String project, String model, JsonNode input) {
        return journal.transaction(true, connection -> {
            DraftJournalRepository.scope(connection, project, model);
            var snapshot = DraftJournalRepository.load(connection, model);
            var token = input.get("draft_token");
            DraftJournalRepository.require(snapshot.token().draft_id().equals(token.get("draft_id").asText()) && snapshot.token().edit_seq() == token.get("edit_seq").asLong()
                    && snapshot.token().binding_digest().equals(token.get("binding_digest").asText()), "DRAFT_CONFLICT");
            var current = find(connection, model);
            if (current == null) {
                var document = initial(model);
                DraftJournalRepository.update(connection, "INSERT INTO mindmap_document VALUES (?,?,?,?,?)", model, document.get("id").asText(), 0,
                        document.toString(), DraftJsonDelta.digest(document));
                current = document;
            }
            if (input.get("action").asText().equals("SAVE")) {
                MindmapDocuments.require(input.has("document") && input.has("expected_revision"));
                var document = (ObjectNode) input.get("document").deepCopy(); MindmapDocuments.validate(document);
                DraftJournalRepository.require(input.get("expected_revision").asLong() == current.get("revision").asLong()
                        && document.get("revision").asLong() == current.get("revision").asLong() && document.get("id").equals(current.get("id")), "DRAFT_CONFLICT");
                document.put("revision", current.get("revision").asLong() + 1);
                DraftJournalRepository.update(connection, "UPDATE mindmap_document SET revision=?,document_json=?,digest=? WHERE model_id=?", document.get("revision").asLong(),
                        document.toString(), DraftJsonDelta.digest(document), model);
                current = document;
            }
            var result = JSON.createObjectNode().put("request_id", input.get("request_id").asText()).put("digest", DraftJsonDelta.digest(current));
            result.set("document", current); var conversions = result.putArray("conversions");
            try (var query = connection.prepareStatement("SELECT * FROM mindmap_conversion WHERE model_id=? ORDER BY rowid")) {
                query.setString(1, model); try (var rows = query.executeQuery()) { while (rows.next()) {
                    var item = conversions.addObject().put("command_id", rows.getString("command_id")).put("context_id", rows.getString("context_id")).put("revision", rows.getLong("source_revision"));
                    item.set("mappings", DraftJsonDelta.read(rows.getString("mappings_json")));
                    var savedSource = DraftJsonDelta.read(rows.getString("source_json"));
                    item.set("excluded_ids", savedSource.has("analysis_source") ? savedSource.get("analysis_source").get("excluded_ids") : JSON.createArrayNode());
                } }
            }
            return DraftWorkspaceContract.read(result.toString(), DraftWorkspaceContract.Type.MindmapResult).value();
        });
    }
    public void check(String project, String model, JsonNode source) {
        source(project, model, source);
    }
    public JsonNode source(String project, String model, JsonNode source) {
        return journal.transaction(false, connection -> { DraftJournalRepository.scope(connection, project, model); return checkSource(connection, model, source); });
    }
    static JsonNode checkSource(Connection connection, String model, JsonNode source) throws Exception {
        var document = find(connection, model);
        DraftJournalRepository.require(document != null && document.get("id").equals(source.get("mindmap_id"))
                && document.get("revision").asLong() == source.get("revision").asLong() && DraftJsonDelta.digest(document).equals(source.get("digest").asText()), "DRAFT_CONFLICT");
        return document;
    }
    static void record(Connection connection, String model, String command, String context, JsonNode source, String mappings) throws Exception {
        var document = checkSource(connection, model, source);
        var snapshot = JSON.createObjectNode(); snapshot.set("document", document); snapshot.set("analysis_source", source);
        DraftJournalRepository.update(connection, "INSERT INTO mindmap_conversion VALUES (?,?,?,?,?,?,?)", model, command, context,
                source.get("mindmap_id").asText(), source.get("revision").asLong(), snapshot.toString(), mappings);
    }
    private static ObjectNode find(Connection connection, String model) throws Exception {
        try (var query = connection.prepareStatement("SELECT document_json FROM mindmap_document WHERE model_id=?")) {
            query.setString(1, model); try (var rows = query.executeQuery()) { return rows.next() ? (ObjectNode) DraftJsonDelta.read(rows.getString(1)) : null; }
        }
    }
    private static ObjectNode initial(String model) {
        var document = JSON.createObjectNode().put("format_version", 1).put("id", "mindmap." + UUID.randomUUID()).put("revision", 0).put("root_id", "node.root");
        var nodes = document.putArray("nodes");
        String[] labels = { "模型分析", "目标与范围", "对象", "过程", "状态与条件", "待确认问题" };
        for (int i = 0; i < labels.length; i++) {
            var node = nodes.addObject().put("id", i == 0 ? "node.root" : "node.group." + i).put("order", i).put("label", labels[i]).put("note", "").put("kind", "TOPIC").put("collapsed", false);
            if (i == 0) node.putNull("parent_id"); else node.put("parent_id", "node.root");
            node.putNull("owner_id").putNull("entity_ref").putNull("target_id");
        }
        document.putArray("relations"); return document;
    }
}
