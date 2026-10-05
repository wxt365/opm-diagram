package org.opm.localruntime.storage;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.api.DraftCapabilityIdentity;
import org.opm.localruntime.api.generated.DraftSaveContract;
import org.opm.localruntime.api.generated.DraftSaveContract.*;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import java.nio.file.Path;
import java.sql.Connection;
import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Consumer;
import static org.opm.localruntime.storage.DraftJournalRepository.*;

/** 保存核心仅处理已激活且显式迁移 V4 的库；调用方必须提供领域校验。 */
public final class DraftSaveRepository {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final DateTimeFormatter TIME = new DateTimeFormatterBuilder().appendInstant(3).toFormatter();
    private final DraftJournalRepository journal;
    private final Clock clock;
    private final Consumer<String> stage;
    public record Checkpoint(String checkpointId, DraftToken capturedToken) { }
    public DraftSaveRepository(Path database, Clock clock) { this(database, clock, ignored -> { }); }
    DraftSaveRepository(Path database, Clock clock, Consumer<String> stage) {
        this.journal = new DraftJournalRepository(database, clock); this.clock = Objects.requireNonNull(clock); this.stage = Objects.requireNonNull(stage);
    }

    public Snapshot read(String project, String model) { return journal.read(project, model); }

    public Snapshot captured(String project, String model, DraftToken target) {
        return journal.transaction(false, connection -> {
            scope(connection, project, model); var head = load(connection, model); checkToken(head.token(), target);
            return load(connection, model, target.edit_seq());
        });
    }

    public SaveResult manual(String project, String model, SaveRequest request, Consumer<ObjectNode> validate) {
        Objects.requireNonNull(request); Objects.requireNonNull(validate);
        String digest = DraftCapabilityIdentity.save(project, model, JSON.valueToTree(request));
        return journal.transaction(true, connection -> {
            scope(connection, project, model); require(hasOverlayTable(connection), "DRAFT_RECOVERY_REQUIRED");
            try (var statement = connection.prepareStatement("SELECT request_digest,result_json FROM draft_receipt WHERE model_id=? AND operation='SAVE' AND idempotency_id=?")) {
                statement.setString(1, model); statement.setString(2, request.save_id());
                try (var rows = statement.executeQuery()) {
                    if (rows.next()) {
                        require(digest.equals(rows.getString(1)), "IDEMPOTENCY_MISMATCH");
                        SaveResult result;
                        try { result = DraftSaveContract.read(rows.getString(2), SaveResult.class); }
                        catch (Exception exception) { throw failure("DRAFT_RECOVERY_REQUIRED", exception); }
                        require(result.save_id().equals(request.save_id()) && result.captured_token().equals(request.target_draft_token()), "DRAFT_RECOVERY_REQUIRED");
                        var head = load(connection, model); verifyReceipt(connection, model, result, head); return result;
                    }
                }
            }
            var head = load(connection, model); checkToken(head.token(), request.target_draft_token());
            var captured = load(connection, model, request.target_draft_token().edit_seq());
            var document = SaveContentDigestV1.read(captured.documentJson()); validate.accept(document.deepCopy());
            String checkpoint = storeCheckpoint(connection, model, captured, document);
            String revision = null; boolean unchanged = false;
            try (var statement = connection.prepareStatement("SELECT revision_id,content_digest FROM draft_savepoint WHERE model_id=? AND purpose='MANUAL' ORDER BY history_sequence DESC LIMIT 1")) {
                statement.setString(1, model); try (var rows = statement.executeQuery()) {
                    if (rows.next() && captured.contentDigest().equals(rows.getString(2))) { revision = rows.getString(1); unchanged = true; }
                }
            }
            if (!unchanged) revision = storeHistory(connection, model, captured, "MANUAL");
            stage.accept("HISTORY"); advance(connection, model, head, captured, checkpoint); stage.accept("STREAM");
            var result = new SaveResult(request.save_id(), unchanged ? "UNCHANGED" : "SAVED", captured.token(), checkpoint, revision, head.token());
            update(connection, "INSERT INTO draft_receipt VALUES (?,'SAVE',?,?,?,?)", model, request.save_id(), digest, JSON.writeValueAsString(result), TIME.format(clock.instant()));
            stage.accept("RECEIPT"); verifyUnchangedHead(connection, model, head); stage.accept("VERIFIED"); return result;
        });
    }

    public PinResult pin(String project, String model, PinRequest request, Consumer<ObjectNode> validate) {
        Objects.requireNonNull(request); Objects.requireNonNull(validate);
        String digest = DraftCapabilityIdentity.pin(project, model, JSON.valueToTree(request));
        return journal.transaction(true, connection -> {
            scope(connection, project, model); require(hasOverlayTable(connection), "DRAFT_RECOVERY_REQUIRED");
            try (var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT sql FROM sqlite_master WHERE type='table' AND name='draft_retention'")) {
                require(rows.next() && rows.getString(1).contains("CONSTRAINT draft_retention_nullable_seq_v5"), "DRAFT_RECOVERY_REQUIRED");
            }
            try (var statement = connection.prepareStatement("SELECT request_digest,result_json FROM draft_receipt WHERE model_id=? AND operation='PIN' AND idempotency_id=?")) {
                statement.setString(1, model); statement.setString(2, request.pin_id());
                try (var rows = statement.executeQuery()) {
                    if (rows.next()) {
                        require(digest.equals(rows.getString(1)), "IDEMPOTENCY_MISMATCH");
                        PinResult result;
                        try { result = DraftSaveContract.read(rows.getString(2), PinResult.class); }
                        catch (Exception exception) { throw failure("DRAFT_RECOVERY_REQUIRED", exception); }
                        verifyPin(connection, project, model, request, digest, result); return result;
                    }
                }
            }
            var head = load(connection, model); checkToken(head.token(), request.target_draft_token());
            var captured = load(connection, model, request.target_draft_token().edit_seq());
            var document = SaveContentDigestV1.read(captured.documentJson()); validate.accept(document.deepCopy());
            String checkpoint = storeCheckpoint(connection, model, captured, document), revision = null;
            try (var statement = connection.prepareStatement("SELECT revision_id,content_digest FROM draft_savepoint WHERE model_id=? AND draft_id=? AND captured_seq=? AND purpose=? ORDER BY history_sequence LIMIT 1")) {
                statement.setString(1, model); statement.setString(2, captured.token().draft_id()); statement.setLong(3, captured.token().edit_seq()); statement.setString(4, request.purpose());
                try (var rows = statement.executeQuery()) { if (rows.next()) {
                    require(captured.contentDigest().equals(rows.getString(2)), "DRAFT_RECOVERY_REQUIRED"); revision = rows.getString(1);
                } }
            }
            if (revision == null) revision = storeHistory(connection, model, captured, request.purpose());
            stage.accept("HISTORY");
            update(connection, "INSERT INTO draft_retention VALUES (?,?,?,?,NULL,?,NULL)", model, captured.token().draft_id(), "retention.pin." + digest, request.purpose(), revision);
            stage.accept("RETENTION"); advance(connection, model, head, captured, checkpoint); stage.accept("STREAM");
            var result = new PinResult(request.pin_id(), revision, captured.token());
            update(connection, "INSERT INTO draft_receipt VALUES (?,'PIN',?,?,?,?)", model, request.pin_id(), digest, JSON.writeValueAsString(result), TIME.format(clock.instant()));
            stage.accept("RECEIPT"); verifyUnchangedHead(connection, model, head); verifyPin(connection, project, model, request, digest, result);
            stage.accept("VERIFIED"); return result;
        });
    }

    private String storeHistory(Connection connection, String model, Snapshot captured, String purpose) throws Exception {
        long sequence;
        try (var statement = connection.prepareStatement("SELECT COALESCE(MAX(history_sequence),0)+1 FROM draft_savepoint WHERE model_id=?")) {
            statement.setString(1, model); try (var rows = statement.executeQuery()) { rows.next(); sequence = rows.getLong(1); }
        }
        long legacySequence = DraftHistoryRepository.legacySequence(connection, model);
        require(legacySequence > 0 && sequence > 0 && sequence <= Integer.MAX_VALUE - legacySequence, "DRAFT_CONFLICT");
        String revision = id("revision");
        update(connection, "INSERT INTO draft_savepoint VALUES (?,?,?,?,?,?,?,?)", revision, model, captured.token().draft_id(),
                captured.token().edit_seq(), sequence, purpose, captured.contentDigest(), TIME.format(clock.instant()));
        return revision;
    }

    private static void verifyPin(Connection connection, String project, String model, PinRequest request, String digest, PinResult result) throws Exception {
        require(result.pin_id().equals(request.pin_id()) && result.captured_token().equals(request.target_draft_token()), "DRAFT_RECOVERY_REQUIRED");
        try (var statement = connection.prepareStatement("""
                SELECT p.draft_id,p.captured_seq,p.purpose,r.draft_id AS retained_draft,r.kind,r.checkpoint_id,r.min_edit_seq
                FROM draft_savepoint p JOIN draft_retention r ON r.model_id=p.model_id AND r.revision_id=p.revision_id
                WHERE p.model_id=? AND p.revision_id=? AND r.retention_id=?
                """)) {
            statement.setString(1, model); statement.setString(2, result.revision_id()); statement.setString(3, "retention.pin." + digest);
            try (var rows = statement.executeQuery()) {
                require(rows.next() && result.captured_token().draft_id().equals(rows.getString("draft_id"))
                        && result.captured_token().draft_id().equals(rows.getString("retained_draft"))
                        && result.captured_token().edit_seq() == rows.getLong("captured_seq") && request.purpose().equals(rows.getString("purpose"))
                        && request.purpose().equals(rows.getString("kind")) && rows.getObject("checkpoint_id") == null && rows.getObject("min_edit_seq") == null, "DRAFT_RECOVERY_REQUIRED");
            }
        }
        var saved = DraftHistoryRepository.find(connection, project, model, result.revision_id()); require(saved.isPresent(), "DRAFT_RECOVERY_REQUIRED");
        // 验证历史绑定，不读取可被压缩的旧 Journal 或检查点。
        require(org.opm.localruntime.assets.ProfilePackageAssembler.bindingDigest(org.opm.localruntime.semantic.DraftSemanticView.read(
                SaveContentDigestV1.read(saved.orElseThrow().contentDocument())).profileBinding()).equals(result.captured_token().binding_digest()), "DRAFT_RECOVERY_REQUIRED");
    }

    public Checkpoint checkpoint(String project, String model, Consumer<ObjectNode> validate) {
        Objects.requireNonNull(validate);
        return journal.transaction(true, connection -> {
            scope(connection, project, model); require(hasOverlayTable(connection), "DRAFT_RECOVERY_REQUIRED");
            var head = load(connection, model); var document = SaveContentDigestV1.read(head.documentJson()); validate.accept(document.deepCopy());
            String checkpoint = storeCheckpoint(connection, model, head, document);
            if (head.dirtySince() != null) {
                var detail = JSON.createObjectNode().put("operation", "AUTO_SAVE").put("title", "自动保存草稿").putNull("context_id").putNull("context_name");
                OperationHistoryRepository.append(connection, model, "AUTO." + checkpoint, head.contentDigest(), head.token(), TIME.format(clock.instant()), detail, "SAVED");
            }
            advance(connection, model, head, head, checkpoint); stage.accept("STREAM");
            verifyUnchangedHead(connection, model, head); stage.accept("VERIFIED"); return new Checkpoint(checkpoint, head.token());
        });
    }

    private String storeCheckpoint(Connection connection, String model, Snapshot captured, ObjectNode document) throws Exception {
        var parts = SaveContentDigestV1.split(document); SaveContentDigestV1.Parts stored = null;
        try (var statement = connection.prepareStatement("SELECT * FROM draft_content WHERE model_id=? AND content_digest=?")) {
            statement.setString(1, model); statement.setString(2, captured.contentDigest());
            try (var rows = statement.executeQuery()) {
                if (rows.next()) {
                    require(SaveContentDigestV1.version(document).equals(rows.getString("digest_version")) && HybridSavePreparation.hash(rows.getString("artifact_json")).equals(rows.getString("artifact_digest")), "DRAFT_RECOVERY_REQUIRED");
                    stored = new SaveContentDigestV1.Parts((ObjectNode) DraftJsonDelta.read(rows.getString("model_json")), (ObjectNode) DraftJsonDelta.read(rows.getString("artifact_json")));
                    require(SaveContentDigestV1.sha256(SaveContentDigestV1.join(stored)).equals(captured.contentDigest()), "DRAFT_RECOVERY_REQUIRED");
                }
            }
        }
        if (stored == null) {
            stored = parts; String metadata = parts.metadata().toString();
            update(connection, "INSERT INTO draft_content VALUES (?,?,?,?,?,?)", model, captured.contentDigest(),
                    SaveContentDigestV1.version(document), parts.content().toString(), metadata, HybridSavePreparation.hash(metadata));
        }
        stage.accept("CONTENT");
        String checkpoint = null;
        try (var statement = connection.prepareStatement("SELECT checkpoint_id,content_digest FROM draft_checkpoint WHERE model_id=? AND draft_id=? AND covered_seq=? ORDER BY checkpoint_id LIMIT 1")) {
            statement.setString(1, model); statement.setString(2, captured.token().draft_id()); statement.setLong(3, captured.token().edit_seq());
            try (var rows = statement.executeQuery()) {
                if (rows.next()) {
                    require(captured.contentDigest().equals(rows.getString(2)), "DRAFT_RECOVERY_REQUIRED"); checkpoint = rows.getString(1);
                    var existing = load(connection, model, captured.token().edit_seq());
                    require(DraftJsonDelta.digest(document).equals(DraftJsonDelta.digest(SaveContentDigestV1.read(existing.documentJson()))), "DRAFT_RECOVERY_REQUIRED");
                }
            }
        }
        if (checkpoint == null) {
            checkpoint = id("checkpoint");
            update(connection, "INSERT INTO draft_checkpoint VALUES (?,?,?,?,?,?)", model, captured.token().draft_id(), checkpoint,
                    captured.token().edit_seq(), captured.contentDigest(), TIME.format(clock.instant()));
            update(connection, "INSERT INTO draft_checkpoint_overlay VALUES (?,?,?,?)", checkpoint,
                    DraftJsonDelta.between(stored.content(), parts.content()).toString(), DraftJsonDelta.between(stored.metadata(), parts.metadata()).toString(), DraftJsonDelta.digest(document));
        }
        stage.accept("CHECKPOINT"); return checkpoint;
    }

    private void advance(Connection connection, String model, Snapshot head, Snapshot captured, String checkpoint) throws Exception {
        if (captured.token().edit_seq() < head.checkpointToken().edit_seq()) return;
        String dirty = null, deadline = null;
        if (captured.token().edit_seq() < head.token().edit_seq()) {
            try (var statement = connection.prepareStatement("SELECT occurred_at FROM draft_journal WHERE model_id=? AND draft_id=? AND edit_seq=?")) {
                statement.setString(1, model); statement.setString(2, captured.token().draft_id()); statement.setLong(3, captured.token().edit_seq() + 1);
                try (var rows = statement.executeQuery()) { require(rows.next(), "DRAFT_RECOVERY_REQUIRED"); dirty = rows.getString(1); deadline = TIME.format(Instant.parse(dirty).plusSeconds(10)); }
            }
        }
        update(connection, "UPDATE draft_stream SET checkpoint_id=?,dirty_since=?,deadline=? WHERE model_id=? AND draft_id=? AND edit_seq=?", checkpoint, dirty, deadline, model, head.token().draft_id(), head.token().edit_seq());
    }

    private static void verifyUnchangedHead(Connection connection, String model, Snapshot before) throws Exception {
        var after = load(connection, model);
        require(before.token().equals(after.token()) && DraftJsonDelta.digest(SaveContentDigestV1.read(before.documentJson()))
                .equals(DraftJsonDelta.digest(SaveContentDigestV1.read(after.documentJson()))), "DRAFT_RECOVERY_REQUIRED");
    }

    private static void verifyReceipt(Connection connection, String model, SaveResult result, Snapshot head) throws Exception {
        var captured = result.captured_token(); var savedHead = result.head_token();
        require(captured.draft_id().equals(head.token().draft_id()) && captured.binding_digest().equals(head.token().binding_digest())
                && savedHead.draft_id().equals(captured.draft_id()) && savedHead.binding_digest().equals(captured.binding_digest())
                && captured.edit_seq() <= savedHead.edit_seq() && savedHead.edit_seq() <= head.token().edit_seq(), "DRAFT_RECOVERY_REQUIRED");
        try (var statement = connection.prepareStatement("""
                SELECT c.draft_id,c.covered_seq,c.content_digest,p.content_digest AS saved_digest
                FROM draft_checkpoint c JOIN draft_savepoint p ON p.model_id=c.model_id AND p.revision_id=?
                WHERE c.model_id=? AND c.checkpoint_id=?
                """)) {
            statement.setString(1, result.revision_id()); statement.setString(2, model); statement.setString(3, result.checkpoint_id());
            try (var rows = statement.executeQuery()) {
                require(rows.next() && rows.getString("draft_id").equals(captured.draft_id()) && rows.getLong("covered_seq") == captured.edit_seq()
                        && rows.getString("content_digest").equals(rows.getString("saved_digest")), "DRAFT_RECOVERY_REQUIRED");
                require(load(connection, model, captured.edit_seq()).contentDigest().equals(rows.getString("content_digest")), "DRAFT_RECOVERY_REQUIRED");
            }
        }
    }
    private static void checkToken(DraftToken head, DraftToken target) {
        require(target != null, "INPUT_INVALID"); require(head.binding_digest().equals(target.binding_digest()), "RULE_VERSION_CONFLICT");
        require(head.draft_id().equals(target.draft_id()) && target.edit_seq() <= head.edit_seq(), "DRAFT_CONFLICT");
    }
    private static String id(String prefix) { return prefix + "." + UUID.randomUUID().toString().replace("-", ""); }
}
