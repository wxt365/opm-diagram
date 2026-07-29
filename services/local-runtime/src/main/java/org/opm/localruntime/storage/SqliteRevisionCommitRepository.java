package org.opm.localruntime.storage;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.command.CommitFailureCode;
import org.opm.localruntime.command.CommitPersistenceException;
import org.opm.localruntime.command.CommitResult;
import org.opm.localruntime.command.RevisionCommitBundle;
import org.opm.localruntime.command.RevisionCommitRepository;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionJsonWriter;
import org.opm.localruntime.text.OplParagraph;
import org.opm.localruntime.text.OplSentence;
import org.opm.localruntime.text.OplTextTrace;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class SqliteRevisionCommitRepository implements RevisionCommitRepository {

    private static final String OPERATION_ID = "API-EDT-002";

    private final DataSource dataSource;
    private final SemanticRevisionJsonWriter revisionWriter;
    private final ObjectMapper objectMapper;
    private final CommitWriteHook writeHook;

    public SqliteRevisionCommitRepository(Path databasePath) {
        this(SqliteConnectionFactory.create(databasePath), new SemanticRevisionJsonWriter(), new ObjectMapper(), () -> { });
    }

    SqliteRevisionCommitRepository(DataSource dataSource, CommitWriteHook writeHook) {
        this(dataSource, new SemanticRevisionJsonWriter(), new ObjectMapper(), writeHook);
    }

    private SqliteRevisionCommitRepository(
            DataSource dataSource,
            SemanticRevisionJsonWriter revisionWriter,
            ObjectMapper objectMapper,
            CommitWriteHook writeHook) {
        this.dataSource = Objects.requireNonNull(dataSource, "dataSource must not be null");
        this.revisionWriter = Objects.requireNonNull(revisionWriter, "revisionWriter must not be null");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
        this.writeHook = Objects.requireNonNull(writeHook, "writeHook must not be null");
    }

    @Override
    public Optional<Head> currentHead(String modelId) {
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement("""
                     SELECT draft_head_revision_id, head_sequence
                     FROM model_head WHERE model_id = ?
                     """)) {
            statement.setString(1, modelId);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? Optional.of(new Head(result.getString(1), result.getInt(2), true)) : Optional.empty();
            }
        } catch (SQLException exception) {
            throw persistence("Cannot read model head", exception);
        }
    }

    @Override
    public Optional<Receipt> receipt(String operationId, String aggregateId, String commandId) {
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement("""
                     SELECT request_digest, result_revision_id FROM idempotency_record
                     WHERE operation_id = ? AND aggregate_id = ? AND command_id = ?
                     """)) {
            statement.setString(1, operationId);
            statement.setString(2, aggregateId);
            statement.setString(3, commandId);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? Optional.of(new Receipt(result.getString(1), result.getString(2))) : Optional.empty();
            }
        } catch (SQLException exception) {
            throw persistence("Cannot read idempotency receipt", exception);
        }
    }

    @Override
    public CommitResult.Committed commit(RevisionCommitBundle bundle) {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                Optional<Receipt> existing = receipt(connection, bundle);
                if (existing.isPresent()) {
                    if (!existing.get().requestDigest().equals(bundle.command().requestDigest())) {
                        throw new CommitPersistenceException(CommitFailureCode.IDEMPOTENCY_MISMATCH,
                                "commandId is bound to a different request digest", null);
                    }
                    connection.rollback();
                    return new CommitResult.Committed(existing.get().committedRevisionId(), traceIds(bundle), bundle.validation());
                }
                Head head = head(connection, bundle.command().modelId());
                if (head == null || !head.revisionId().equals(bundle.command().baseRevisionId())
                        || head.revisionSequence() + 1 != bundle.revision().revisionSequence()) {
                    throw new CommitPersistenceException(CommitFailureCode.REVISION_CONFLICT,
                            "baseRevisionId is not the current draft head", null);
                }
                writeRevision(connection, bundle);
                writeParent(connection, bundle);
                writeTraces(connection, bundle);
                writeFindings(connection, bundle);
                writeHook.beforeHeadUpdate();
                updateHead(connection, bundle);
                writeOperation(connection, bundle);
                writeReceipt(connection, bundle);
                connection.commit();
                return new CommitResult.Committed(bundle.revision().revisionId(), traceIds(bundle), bundle.validation());
            } catch (CommitPersistenceException exception) {
                rollback(connection, exception);
                throw exception;
            } catch (Exception exception) {
                rollback(connection, exception);
                throw persistence("Atomic revision commit failed", exception);
            }
        } catch (SQLException exception) {
            throw persistence("Cannot open SQLite transaction", exception);
        }
    }

    private Optional<Receipt> receipt(Connection connection, RevisionCommitBundle bundle) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT request_digest, result_revision_id FROM idempotency_record
                WHERE operation_id = ? AND aggregate_id = ? AND command_id = ?
                """)) {
            statement.setString(1, OPERATION_ID);
            statement.setString(2, bundle.command().modelId());
            statement.setString(3, bundle.command().commandId());
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? Optional.of(new Receipt(result.getString(1), result.getString(2))) : Optional.empty();
            }
        }
    }

    private Head head(Connection connection, String modelId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT draft_head_revision_id, head_sequence FROM model_head WHERE model_id = ?
                """)) {
            statement.setString(1, modelId);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? new Head(result.getString(1), result.getInt(2), true) : null;
            }
        }
    }

    private void writeRevision(Connection connection, RevisionCommitBundle bundle) throws Exception {
        SemanticRevision revision = bundle.revision();
        String document = document(bundle);
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO revision_document(
                    revision_id, model_id, revision_sequence, schema_version, profile_id, profile_version,
                    rule_set_id, rule_set_version, schema_set_json, profile_binding_json, document_json,
                    document_digest, commit_reason, created_at)
                VALUES (?, ?, ?, '0.1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """)) {
            statement.setString(1, revision.revisionId());
            statement.setString(2, revision.modelId());
            statement.setInt(3, revision.revisionSequence());
            statement.setString(4, revision.profileBinding().profile().id());
            statement.setString(5, revision.profileBinding().profile().version());
            statement.setString(6, revision.profileBinding().ruleSet().id());
            statement.setString(7, revision.profileBinding().ruleSet().version());
            statement.setString(8, "{\"core_metamodel_version\":\"0.1\",\"storage_schema_version\":\"1.0\"}");
            statement.setString(9, objectMapper.writeValueAsString(objectMapper.readTree(revisionWriter.write(revision)).get("profile_binding")));
            statement.setString(10, document);
            statement.setString(11, digest(document));
            statement.setString(12, bundle.command().commitReason());
            statement.setString(13, DateTimeFormatter.ISO_INSTANT.format(bundle.command().occurredAt()));
            statement.executeUpdate();
        }
    }

    private void writeParent(Connection connection, RevisionCommitBundle bundle) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO revision_parent(model_id, revision_id, parent_revision_id) VALUES (?, ?, ?)
                """)) {
            statement.setString(1, bundle.command().modelId());
            statement.setString(2, bundle.revision().revisionId());
            statement.setString(3, bundle.command().baseRevisionId());
            statement.executeUpdate();
        }
    }

    private void writeTraces(Connection connection, RevisionCommitBundle bundle) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO text_trace_index(source_revision_id, model_id, trace_id, fact_id, sentence_id, context_id)
                VALUES (?, ?, ?, ?, ?, ?)
                """)) {
            for (OplTextTrace trace : bundle.text().traces()) {
                for (String factId : trace.factIds()) for (String sentenceId : trace.sentenceIds()) {
                    statement.setString(1, bundle.revision().revisionId());
                    statement.setString(2, bundle.command().modelId());
                    statement.setString(3, trace.traceId());
                    statement.setString(4, factId);
                    statement.setString(5, sentenceId);
                    statement.setString(6, trace.contextId());
                    statement.addBatch();
                }
            }
            statement.executeBatch();
        }
    }

    private void writeFindings(Connection connection, RevisionCommitBundle bundle) throws SQLException {
        if (bundle.validation().findings().isEmpty()) return;
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO finding_index(source_revision_id, model_id, finding_id, rule_id, severity, category, context_id, entity_id)
                VALUES (?, ?, ?, ?, ?, 'LANGUAGE', ?, ?)
                """)) {
            for (var finding : bundle.validation().findings()) {
                statement.setString(1, bundle.revision().revisionId());
                statement.setString(2, bundle.command().modelId());
                statement.setString(3, finding.findingId());
                statement.setString(4, finding.ruleId());
                statement.setString(5, finding.severity().name());
                statement.setString(6, bundle.revision().rootContextId());
                statement.setString(7, finding.locatorId());
                statement.addBatch();
            }
            statement.executeBatch();
        }
    }

    private void updateHead(Connection connection, RevisionCommitBundle bundle) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                UPDATE model_head SET draft_head_revision_id = ?, head_sequence = ?, updated_at = ? WHERE model_id = ?
                """)) {
            statement.setString(1, bundle.revision().revisionId());
            statement.setInt(2, bundle.revision().revisionSequence());
            statement.setString(3, DateTimeFormatter.ISO_INSTANT.format(bundle.command().occurredAt()));
            statement.setString(4, bundle.command().modelId());
            if (statement.executeUpdate() != 1) throw new SQLException("model head is missing");
        }
    }

    private void writeOperation(Connection connection, RevisionCommitBundle bundle) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO operation_record(
                    operation_record_id, project_id, model_id, operation_id, aggregate_id, command_id,
                    input_revision_id, result_revision_id, result_status, occurred_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMMITTED', ?)
                """)) {
            statement.setString(1, "operation." + digest(bundle.command().commandId()).substring(0, 32));
            statement.setString(2, bundle.command().projectId());
            statement.setString(3, bundle.command().modelId());
            statement.setString(4, OPERATION_ID);
            statement.setString(5, bundle.command().modelId());
            statement.setString(6, bundle.command().commandId());
            statement.setString(7, bundle.command().baseRevisionId());
            statement.setString(8, bundle.revision().revisionId());
            statement.setString(9, DateTimeFormatter.ISO_INSTANT.format(bundle.command().occurredAt()));
            statement.executeUpdate();
        }
    }

    private void writeReceipt(Connection connection, RevisionCommitBundle bundle) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO idempotency_record(
                    operation_id, aggregate_id, command_id, request_digest, result_status, result_revision_id, result_json, created_at)
                VALUES (?, ?, ?, ?, 'COMMITTED', ?, ?, ?)
                """)) {
            statement.setString(1, OPERATION_ID);
            statement.setString(2, bundle.command().modelId());
            statement.setString(3, bundle.command().commandId());
            statement.setString(4, bundle.command().requestDigest());
            statement.setString(5, bundle.revision().revisionId());
            statement.setString(6, "{\"committed_revision\":\"" + bundle.revision().revisionId() + "\"}");
            statement.setString(7, DateTimeFormatter.ISO_INSTANT.format(bundle.command().occurredAt()));
            statement.executeUpdate();
        }
    }

    private String document(RevisionCommitBundle bundle) throws Exception {
        ObjectNode root = (ObjectNode) objectMapper.readTree(revisionWriter.write(bundle.revision()));
        ObjectNode text = root.putObject("text_artifact");
        text.put("artifact_id", bundle.text().artifact().artifactId());
        text.put("context_id", bundle.text().artifact().contextId());
        text.put("artifact_digest", bundle.text().artifact().artifactDigest());
        ArrayNode sentences = text.putArray("sentences");
        for (OplParagraph paragraph : bundle.text().artifact().paragraphs()) for (OplSentence sentence : paragraph.sentences()) {
            ObjectNode item = sentences.addObject();
            item.put("sentence_id", sentence.sentenceId());
            item.put("text", sentence.text());
            item.put("ordinal", sentence.ordinal());
        }
        ArrayNode traces = root.putArray("text_traces");
        for (OplTextTrace trace : bundle.text().traces()) {
            ObjectNode item = traces.addObject();
            item.put("trace_id", trace.traceId());
            item.put("context_id", trace.contextId());
            array(item.putArray("fact_ids"), trace.factIds());
            array(item.putArray("sentence_ids"), trace.sentenceIds());
        }
        ObjectNode validation = root.putObject("commit_validation_summary");
        validation.put("blocking", bundle.validation().findings().stream().filter(f -> f.severity().name().equals("BLOCKING")).count());
        return objectMapper.writeValueAsString(root);
    }

    private void array(ArrayNode target, List<String> values) { values.forEach(target::add); }

    private List<String> traceIds(RevisionCommitBundle bundle) {
        return bundle.text().traces().stream().map(OplTextTrace::traceId).toList();
    }

    private void rollback(Connection connection, Exception exception) {
        try { connection.rollback(); } catch (SQLException rollbackException) { exception.addSuppressed(rollbackException); }
    }

    private CommitPersistenceException persistence(String message, Throwable cause) {
        return new CommitPersistenceException(CommitFailureCode.PERSISTENCE_FAILED, message, cause);
    }

    private String digest(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(bytes.length * 2);
            for (byte item : bytes) result.append(String.format("%02x", item));
            return result.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }

    @FunctionalInterface
    interface CommitWriteHook { void beforeHeadUpdate() throws Exception; }
}
