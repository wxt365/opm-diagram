package org.opm.localruntime.storage;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.api.DraftEditRequestIdentity;
import org.opm.localruntime.api.generated.DraftSaveContract.DraftToken;
import org.opm.localruntime.api.generated.DraftWorkspaceContract;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Clock;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.List;
import java.util.Objects;
import java.util.function.Consumer;

/** 可信应用层的草稿事务存储；不装配 HTTP，不生成领域候选或激活模式。 */
public final class DraftJournalRepository {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final DateTimeFormatter TIME = new DateTimeFormatterBuilder().appendInstant(3).toFormatter();
    private final Path database;
    private final Clock clock;
    private final Consumer<String> stage;
    @FunctionalInterface public interface Edit { Proposal apply(ObjectNode currentDocument); }
    public record Proposal(String documentJson, List<String> affectedIds, List<String> textTraceIds, String validationSummaryJson) {
        public Proposal { Objects.requireNonNull(documentJson); Objects.requireNonNull(validationSummaryJson); affectedIds = List.copyOf(affectedIds); textTraceIds = List.copyOf(textTraceIds); }
    }
    public record Snapshot(DraftToken token, String documentJson, String contentDigest, String dirtySince, String deadline,
                           DraftToken checkpointToken, String lastManualRevision) { }
    public static final class Failure extends RuntimeException {
        private final String code;
        private Failure(String code, Throwable cause) { super(code, cause); this.code = code; }
        public String code() { return code; }
    }
    public DraftJournalRepository(Path database, Clock clock) { this(database, clock, ignored -> { }); }
    DraftJournalRepository(Path database, Clock clock, Consumer<String> stage) {
        require(database != null && Files.isRegularFile(database, LinkOption.NOFOLLOW_LINKS), "INPUT_INVALID");
        this.database = database.toAbsolutePath().normalize(); this.clock = Objects.requireNonNull(clock); this.stage = Objects.requireNonNull(stage);
    }

    public DraftWorkspaceContract.Document commit(String projectId, String modelId, DraftWorkspaceContract.Document request, Edit effect) {
        require(request != null && request.type() == DraftWorkspaceContract.Type.DraftEditRequest && effect != null, "INPUT_INVALID");
        JsonNode input = request.value(); String commandId = input.get("command_id").asText();
        String requestDigest = DraftEditRequestIdentity.digest(projectId, modelId, input.toString());
        return transaction(true, connection -> {
            scope(connection, projectId, modelId);
            ObjectNode stored = storedReceipt(connection, modelId, "EDIT", commandId, requestDigest);
            if (stored != null) {
                require(DraftJsonDelta.digest(stored.get("base_token")).equals(DraftJsonDelta.digest(input.get("expected_draft_token"))), "DRAFT_RECOVERY_REQUIRED");
                load(connection, modelId);
                stored.put("request_id", input.get("request_id").asText());
                return checked(stored, DraftWorkspaceContract.Type.DraftEditResult);
            }
            Snapshot current = load(connection, modelId);
            JsonNode expected = input.get("expected_draft_token");
            require(current.token().binding_digest().equals(expected.get("binding_digest").asText()), "RULE_VERSION_CONFLICT");
            require(current.token().draft_id().equals(expected.get("draft_id").asText()) && current.token().edit_seq() == expected.get("edit_seq").longValue(), "DRAFT_CONFLICT");
            ObjectNode before = SaveContentDigestV1.read(current.documentJson());
            String context = input.at("/scope/context_id").asText(); boolean contextExists = false;
            for (var item : before.get("contexts")) if (item.path("context_id").asText().equals(context)) contextExists = true;
            require(contextExists, "NOT_FOUND");
            Proposal proposal = effect.apply(before.deepCopy());
            ObjectNode after;
            JsonNode validationSummary;
            try {
                after = SaveContentDigestV1.read(proposal.documentJson()); immutable(before, after);
                validationSummary = org.opm.localruntime.api.DraftWorkspaceSchema.read(proposal.validationSummaryJson(), "ValidationSummary");
            }
            catch (RuntimeException exception) { throw failure("INPUT_INVALID", exception); }
            String contentDigest = SaveContentDigestV1.sha256(after);
            boolean changed = !current.contentDigest().equals(contentDigest);
            require(!changed || current.token().edit_seq() < 9007199254740991L, "DRAFT_CONFLICT");
            long resultSeq = current.token().edit_seq() + (changed ? 1 : 0);
            var resultToken = new DraftToken(current.token().draft_id(), resultSeq, current.token().binding_digest());
            ObjectNode result = JSON.createObjectNode().put("request_id", input.get("request_id").asText()).put("command_id", commandId)
                    .put("status", changed ? "DURABLE" : "UNCHANGED").put("content_digest", current.contentDigest());
            result.set("base_token", JSON.valueToTree(current.token())); result.set("result_token", JSON.valueToTree(resultToken));
            result.set("affected_ids", JSON.valueToTree(changed ? proposal.affectedIds() : List.of()));
            result.set("text_trace_ids", JSON.valueToTree(changed ? proposal.textTraceIds() : List.of()));
            result.set("validation_summary", validationSummary);
            result.put("content_digest", contentDigest); checked(result, DraftWorkspaceContract.Type.DraftEditResult);
            var instant = clock.instant(); String now = TIME.format(instant);
            if (changed) {
                var oldParts = SaveContentDigestV1.split(before); var newParts = SaveContentDigestV1.split(after);
                update(connection, "INSERT INTO draft_journal VALUES (?,?,?,?,?,?,?,?,?)", modelId, resultToken.draft_id(), resultSeq,
                        commandId, requestDigest, DraftJsonDelta.between(oldParts.content(), newParts.content()).toString(),
                        DraftJsonDelta.between(oldParts.metadata(), newParts.metadata()).toString(), contentDigest, now);
                stage.accept("JOURNAL");
                update(connection, """
                        UPDATE draft_stream SET edit_seq=?,dirty_since=COALESCE(dirty_since,?),deadline=COALESCE(deadline,?)
                        WHERE model_id=? AND draft_id=? AND edit_seq=? AND binding_digest=?
                        """, resultSeq, now, TIME.format(instant.plusSeconds(10)), modelId, current.token().draft_id(), current.token().edit_seq(), current.token().binding_digest());
                stage.accept("STREAM");
            }
            update(connection, "INSERT INTO draft_receipt VALUES (?,'EDIT',?,?,?,?)", modelId, commandId, requestDigest, result.toString(), now);
            stage.accept("RECEIPT");
            Snapshot verified = load(connection, modelId);
            require(verified.token().equals(resultToken) && verified.contentDigest().equals(contentDigest), "DRAFT_RECOVERY_REQUIRED");
            stage.accept("VERIFIED");
            return checked(result, DraftWorkspaceContract.Type.DraftEditResult);
        });
    }

    public Snapshot read(String projectId, String modelId) { return transaction(false, connection -> { scope(connection, projectId, modelId); return load(connection, modelId); }); }

    public DraftWorkspaceContract.Document receipt(String projectId, String modelId, DraftWorkspaceContract.Document request) {
        require(request != null && request.type() == DraftWorkspaceContract.Type.DraftReceiptRequest, "INPUT_INVALID");
        var input = request.value();
        return transaction(false, connection -> {
            scope(connection, projectId, modelId); String operation = input.get("operation").asText(), id = input.get("idempotency_id").asText();
            ObjectNode result = JSON.createObjectNode().put("request_id", input.get("request_id").asText()).put("operation", operation).put("idempotency_id", id);
            try (var statement = connection.prepareStatement("SELECT request_digest,result_json FROM draft_receipt WHERE model_id=? AND operation=? AND idempotency_id=?")) {
                statement.setString(1, modelId); statement.setString(2, operation); statement.setString(3, id);
                try (var rows = statement.executeQuery()) {
                    if (rows.next()) { result.put("status", "FOUND").put("request_digest", rows.getString(1)); result.set("result", DraftJsonDelta.read(rows.getString(2))); }
                    else { result.put("status", "NOT_FOUND").putNull("request_digest").putNull("result"); }
                }
            }
            try { return checked(result, DraftWorkspaceContract.Type.DraftReceiptResult); }
            catch (RuntimeException exception) { throw failure("DRAFT_RECOVERY_REQUIRED", exception); }
        });
    }

    static Snapshot load(Connection connection, String modelId) throws Exception { return load(connection, modelId, null); }

    static Snapshot load(Connection connection, String modelId, Long target) throws Exception {
        try (var statement = connection.prepareStatement("""
                SELECT s.*,c.checkpoint_id AS selected_checkpoint,c.covered_seq,d.content_digest,d.model_json,d.artifact_json,d.artifact_digest,d.digest_version,
                       m.profile_binding_json FROM draft_stream s
                JOIN draft_checkpoint c ON c.model_id=s.model_id AND c.draft_id=s.draft_id AND c.checkpoint_id=
                  CASE WHEN ? IS NULL THEN s.checkpoint_id ELSE
                    (SELECT checkpoint_id FROM draft_checkpoint WHERE model_id=s.model_id AND draft_id=s.draft_id AND covered_seq<=?
                     ORDER BY covered_seq DESC,created_at DESC,checkpoint_id DESC LIMIT 1) END
                JOIN draft_content d ON d.model_id=s.model_id AND d.content_digest=c.content_digest
                JOIN model_catalog m ON m.model_id=s.model_id WHERE s.model_id=?
                """)) {
            statement.setObject(1, target); statement.setObject(2, target); statement.setString(3, modelId);
            try (var rows = statement.executeQuery()) {
                require(rows.next(), "DRAFT_RECOVERY_REQUIRED");
                String draft = rows.getString("draft_id"), binding = rows.getString("binding_digest");
                long head = rows.getLong("edit_seq"), covered = rows.getLong("covered_seq");
                require(target == null || target >= 0 && target <= head, "DRAFT_CONFLICT");
                long replayTarget = target == null ? head : target;
                DraftToken checkpointToken = new DraftToken(draft, covered, binding);
                String dirty = rows.getString("dirty_since"), deadline = rows.getString("deadline");
                require(covered <= head && "SaveContentDigest/1".equals(rows.getString("digest_version")), "DRAFT_RECOVERY_REQUIRED");
                require((dirty == null) == (deadline == null), "DRAFT_RECOVERY_REQUIRED");
                require(target != null || head == covered || dirty != null, "DRAFT_RECOVERY_REQUIRED");
                if (dirty != null) require(TIME.format(java.time.Instant.parse(dirty)).equals(dirty) && TIME.format(java.time.Instant.parse(deadline)).equals(deadline)
                        && java.time.Duration.between(java.time.Instant.parse(dirty), java.time.Instant.parse(deadline)).toMillis() == 10000, "DRAFT_RECOVERY_REQUIRED");
                String artifact = rows.getString("artifact_json");
                require(HybridSavePreparation.hash(artifact).equals(rows.getString("artifact_digest")), "DRAFT_RECOVERY_REQUIRED");
                ObjectNode content = (ObjectNode) DraftJsonDelta.read(rows.getString("model_json"));
                ObjectNode metadata = (ObjectNode) DraftJsonDelta.read(artifact);
                require(SaveContentDigestV1.sha256(SaveContentDigestV1.join(new SaveContentDigestV1.Parts(content, metadata)))
                        .equals(rows.getString("content_digest")), "DRAFT_RECOVERY_REQUIRED");
                if (hasOverlayTable(connection)) {
                    try (var overlay = connection.prepareStatement("SELECT * FROM draft_checkpoint_overlay WHERE checkpoint_id=?")) {
                        overlay.setString(1, rows.getString("selected_checkpoint"));
                        try (var captured = overlay.executeQuery()) {
                            if (captured.next()) {
                                content = DraftJsonDelta.apply(content, DraftJsonDelta.read(captured.getString("content_delta_json")));
                                metadata = DraftJsonDelta.apply(metadata, DraftJsonDelta.read(captured.getString("artifact_delta_json")));
                                require(DraftJsonDelta.digest(SaveContentDigestV1.join(new SaveContentDigestV1.Parts(content, metadata)))
                                        .equals(captured.getString("document_digest")), "DRAFT_RECOVERY_REQUIRED");
                            } else require(covered == 0, "DRAFT_RECOVERY_REQUIRED");
                        }
                    }
                } else require(covered == 0, "DRAFT_RECOVERY_REQUIRED");
                ObjectNode document = SaveContentDigestV1.join(new SaveContentDigestV1.Parts(content, metadata));
                String digest = SaveContentDigestV1.sha256(document);
                require(digest.equals(rows.getString("content_digest")) && modelId.equals(document.path("model_id").asText())
                        && rows.getString("base_revision_id").equals(document.path("revision_id").asText())
                        && binding.equals(document.at("/profile_binding/binding_digest/digest").asText())
                        && DraftJsonDelta.digest(document.get("profile_binding")).equals(DraftJsonDelta.digest(DraftJsonDelta.read(rows.getString("profile_binding_json")))), "DRAFT_RECOVERY_REQUIRED");
                ObjectNode seed = document.deepCopy();
                try (var journal = connection.prepareStatement("SELECT * FROM draft_journal WHERE model_id=? AND draft_id=? AND edit_seq>? AND (? IS NULL OR edit_seq<=?) ORDER BY edit_seq")) {
                    journal.setString(1, modelId); journal.setString(2, draft); journal.setLong(3, covered);
                    journal.setObject(4, target); journal.setObject(5, target);
                    try (var entries = journal.executeQuery()) {
                        while (entries.next()) {
                            require(entries.getLong("edit_seq") == covered + 1 && covered < replayTarget, "DRAFT_RECOVERY_REQUIRED");
                            content = DraftJsonDelta.apply(content, DraftJsonDelta.read(entries.getString("delta_json")));
                            metadata = DraftJsonDelta.apply(metadata, DraftJsonDelta.read(entries.getString("artifact_delta_json")));
                            document = SaveContentDigestV1.join(new SaveContentDigestV1.Parts(content, metadata)); immutable(seed, document);
                            digest = SaveContentDigestV1.sha256(document); require(digest.equals(entries.getString("result_digest")), "DRAFT_RECOVERY_REQUIRED");
                            ObjectNode receipt = storedReceipt(connection, modelId, "EDIT", entries.getString("command_id"), entries.getString("request_digest"));
                            require(receipt != null && receipt.path("status").asText().equals("DURABLE") && receipt.path("content_digest").asText().equals(digest)
                                    && receipt.at("/base_token/edit_seq").longValue() == covered && receipt.at("/result_token/edit_seq").longValue() == covered + 1
                                    && receipt.at("/result_token/draft_id").asText().equals(draft) && receipt.at("/result_token/binding_digest").asText().equals(binding), "DRAFT_RECOVERY_REQUIRED");
                            covered++;
                        }
                    }
                }
                require(covered == replayTarget, "DRAFT_RECOVERY_REQUIRED");
                String manual = null;
                try (var saved = connection.prepareStatement("SELECT revision_id FROM draft_savepoint WHERE model_id=? AND purpose='MANUAL' ORDER BY history_sequence DESC LIMIT 1")) {
                    saved.setString(1, modelId); try (var savedRows = saved.executeQuery()) { if (savedRows.next()) manual = savedRows.getString(1); }
                }
                return new Snapshot(new DraftToken(draft, replayTarget, binding), document.toString(), digest, dirty, deadline, checkpointToken, manual);
            }
        } catch (Exception exception) { throw failure("DRAFT_RECOVERY_REQUIRED", exception); }
    }

    private static void immutable(JsonNode before, JsonNode after) {
        for (String pointer : List.of("/schema_id", "/schema_version", "/model_id", "/profile_binding", "/schema_set_ref", "/revision_id", "/revision_sequence", "/parent_revision_id", "/model_header/model_id", "/model_header/root_context_id")) {
            JsonNode left = before.at(pointer), right = after.at(pointer);
            require(left.isMissingNode() ? right.isMissingNode() : !right.isMissingNode() && DraftJsonDelta.digest(left).equals(DraftJsonDelta.digest(right)), "INPUT_INVALID");
        }
    }
    private static ObjectNode storedReceipt(Connection connection, String model, String operation, String id, String expectedDigest) throws Exception {
        try (var statement = connection.prepareStatement("SELECT request_digest,result_json FROM draft_receipt WHERE model_id=? AND operation=? AND idempotency_id=?")) {
            statement.setString(1, model); statement.setString(2, operation); statement.setString(3, id);
            try (var rows = statement.executeQuery()) {
                if (!rows.next()) return null;
                require(expectedDigest.equals(rows.getString(1)), "IDEMPOTENCY_MISMATCH");
                try {
                    var result = checked(DraftJsonDelta.read(rows.getString(2)), DraftWorkspaceContract.Type.DraftEditResult).value();
                    require(result.path("command_id").asText().equals(id), "DRAFT_RECOVERY_REQUIRED"); return (ObjectNode) result;
                } catch (RuntimeException exception) { throw failure("DRAFT_RECOVERY_REQUIRED", exception); }
            }
        }
    }
    static boolean hasOverlayTable(Connection connection) throws SQLException {
        try (var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT 1 FROM sqlite_master WHERE type='table' AND name='draft_checkpoint_overlay'")) { return rows.next(); }
    }

    static void scope(Connection connection, String project, String model) throws SQLException {
        try (var statement = connection.prepareStatement("SELECT 1 FROM model_catalog m JOIN project_metadata p ON p.project_id=m.project_id WHERE m.model_id=? AND m.project_id=? AND p.status='ACTIVE' AND m.status='ACTIVE'")) {
            statement.setString(1, model); statement.setString(2, project); try (var rows = statement.executeQuery()) { require(rows.next(), "NOT_FOUND"); }
        }
        try (var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT 1 FROM sqlite_master WHERE type='table' AND name='model_save_mode'")) { require(rows.next(), "DRAFT_MODE_REQUIRED"); }
        try (var statement = connection.prepareStatement("SELECT 1 FROM model_save_mode m JOIN draft_stream s ON s.model_id=m.model_id AND s.draft_id=m.active_draft_id WHERE m.model_id=? AND m.mode='JOURNALED_DRAFT_V2'")) {
            statement.setString(1, model); try (var rows = statement.executeQuery()) { require(rows.next(), "DRAFT_MODE_REQUIRED"); }
        }
    }

    @FunctionalInterface interface Transaction<T> { T run(Connection connection) throws Exception; }
    <T> T transaction(boolean write, Transaction<T> action) {
        require(Files.isRegularFile(database, LinkOption.NOFOLLOW_LINKS), "INPUT_INVALID");
        try (Connection connection = SqliteConnectionFactory.create(database).getConnection()) {
            try (var statement = connection.createStatement()) { statement.execute(write ? "BEGIN IMMEDIATE" : "BEGIN"); }
            try {
                T result = action.run(connection);
                try (var statement = connection.createStatement()) { statement.execute("COMMIT"); }
                return result;
            } catch (Exception exception) {
                try (var statement = connection.createStatement()) { statement.execute("ROLLBACK"); } catch (SQLException rollback) { exception.addSuppressed(rollback); }
                if (exception instanceof RuntimeException runtime) throw runtime;
                throw failure("PERSISTENCE_FAILED", exception);
            }
        } catch (SQLException exception) { throw failure("PERSISTENCE_FAILED", exception); }
    }
    static void update(Connection connection, String sql, Object... values) throws SQLException {
        try (var statement = connection.prepareStatement(sql)) {
            for (int i = 0; i < values.length; i++) statement.setObject(i + 1, values[i]);
            require(statement.executeUpdate() == 1, "PERSISTENCE_FAILED");
        }
    }
    private static DraftWorkspaceContract.Document checked(JsonNode value, DraftWorkspaceContract.Type type) { return DraftWorkspaceContract.read(value.toString(), type); }
    static Failure failure(String code, Throwable cause) { return new Failure(code, cause); }
    static void require(boolean condition, String code) { if (!condition) throw failure(code, null); }
}
