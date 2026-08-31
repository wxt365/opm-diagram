package org.opm.localruntime.releaseevidence;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionReader;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/** 从已停止的attempt Runtime存储重建subject前后的事务快照。 */
public final class E2ETransactionSnapshotCli {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String GUARD = "RELEASE_E2E_TRANSACTION_SNAPSHOT_ONLY";
    private static final Set<String> OPTIONS = Set.of("guard", "storage", "project-id", "model-id",
            "before-revision-id", "after-revision-id", "fixture-materialization");

    private E2ETransactionSnapshotCli() { }

    public static void main(String[] args) {
        int exitCode = run(args);
        if (exitCode != 0) System.exit(exitCode);
    }

    static int run(String[] args) {
        try {
            System.out.print(Rfc8785JsonCanonicalizer.canonicalize(snapshot(Arguments.parse(args))));
            System.out.print('\n');
            return 0;
        } catch (E2EAttemptSnapshotSupport.SnapshotException exception) {
            System.err.println(exception.code + ": " + exception.getMessage());
            return exception.exitCode;
        } catch (Exception exception) {
            System.err.println("E2E_UNEXPECTED_RUNTIME_ERROR: " + exception.getMessage());
            return 4;
        }
    }

    static Map<String, Object> snapshot(Arguments arguments) throws Exception {
        E2EAttemptSnapshotSupport.VerifiedAttempt verified = E2EAttemptSnapshotSupport.verifyAttempt(
                arguments.storage(), arguments.fixtureMaterialization(), arguments.projectId(), arguments.modelId(),
                null, E2ETransactionSnapshotCli.class);
        return E2EAttemptSnapshotSupport.withImmutableConnection(verified.database(), connection -> {
            verifyModelIdentity(connection, arguments);
            RevisionCutoff before = revisionCutoff(connection, arguments.modelId(), arguments.beforeRevisionId());
            RevisionCutoff after = revisionCutoff(connection, arguments.modelId(), arguments.afterRevisionId());
            if (before.sequence() > after.sequence()) throw input("Transaction Snapshot Revision cutoff 顺序不合法。");
            verifyHead(connection, arguments.modelId(), after);
            return Map.of(
                    "before", transactionSnapshot(connection, arguments, before),
                    "after", transactionSnapshot(connection, arguments, after));
        });
    }

    private static void verifyModelIdentity(Connection connection, Arguments arguments) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT model_id FROM model_catalog WHERE project_id = ? ORDER BY model_id")) {
            statement.setString(1, arguments.projectId());
            try (ResultSet rows = statement.executeQuery()) {
                if (!rows.next() || !arguments.modelId().equals(rows.getString(1)) || rows.next()) {
                    throw input("Transaction Snapshot Project/Model identity 不唯一。");
                }
            }
        }
    }

    private static RevisionCutoff revisionCutoff(Connection connection, String modelId, String revisionId) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT revision_sequence FROM revision_document WHERE model_id = ? AND revision_id = ?")) {
            statement.setString(1, modelId);
            statement.setString(2, revisionId);
            try (ResultSet rows = statement.executeQuery()) {
                if (!rows.next()) throw input("Transaction Snapshot cutoff Revision 不存在。");
                int sequence = rows.getInt(1);
                if (sequence < 1 || rows.next()) throw input("Transaction Snapshot cutoff Revision 不唯一。");
                return new RevisionCutoff(revisionId, sequence);
            }
        }
    }

    private static void verifyHead(Connection connection, String modelId, RevisionCutoff expected) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT draft_head_revision_id, head_sequence FROM model_head WHERE model_id = ?")) {
            statement.setString(1, modelId);
            try (ResultSet rows = statement.executeQuery()) {
                if (!rows.next() || !expected.revisionId().equals(rows.getString(1))
                        || expected.sequence() != rows.getInt(2) || rows.next()) {
                    throw input("Transaction Snapshot after cutoff 不等于实际Head。");
                }
            }
        }
    }

    private static Map<String, Object> transactionSnapshot(Connection connection, Arguments arguments,
                                                            RevisionCutoff cutoff) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("revision_document_count", count(connection, """
                SELECT COUNT(*) FROM revision_document d
                WHERE d.model_id = ? AND d.revision_sequence <= ?
                """, arguments.modelId(), cutoff.sequence()));
        result.put("revision_parent_count", count(connection, """
                SELECT COUNT(*) FROM revision_parent p
                JOIN revision_document d ON d.revision_id = p.revision_id
                WHERE d.model_id = ? AND d.revision_sequence <= ?
                """, arguments.modelId(), cutoff.sequence()));
        result.put("text_artifact_count", textArtifactCount(connection, arguments.modelId(), cutoff.sequence()));
        result.put("text_trace_count", count(connection, """
                SELECT COUNT(*) FROM text_trace_index t
                JOIN revision_document d ON d.revision_id = t.source_revision_id
                WHERE d.model_id = ? AND d.revision_sequence <= ?
                """, arguments.modelId(), cutoff.sequence()));
        result.put("finding_count", count(connection, """
                SELECT COUNT(*) FROM finding_index f
                JOIN revision_document d ON d.revision_id = f.source_revision_id
                WHERE d.model_id = ? AND d.revision_sequence <= ?
                """, arguments.modelId(), cutoff.sequence()));
        result.put("operation_count", projectCount(connection, """
                SELECT COUNT(*) FROM operation_record o
                JOIN revision_document d ON d.revision_id = o.result_revision_id
                WHERE o.project_id = ? AND o.model_id = ? AND d.model_id = ? AND d.revision_sequence <= ?
                """, arguments.projectId(), arguments.modelId(), cutoff.sequence()));
        result.put("receipt_count", count(connection, """
                SELECT COUNT(*) FROM idempotency_record i
                JOIN revision_document d ON d.revision_id = i.result_revision_id
                WHERE d.model_id = ? AND d.revision_sequence <= ?
                """, arguments.modelId(), cutoff.sequence()));
        result.put("draft_head_revision_id", cutoff.revisionId());
        result.put("head_sequence", cutoff.sequence());
        return Map.copyOf(result);
    }

    private static int textArtifactCount(Connection connection, String modelId, int cutoffSequence) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT revision_id, revision_sequence, document_json, document_digest
                FROM revision_document
                WHERE model_id = ? AND revision_sequence <= ?
                ORDER BY revision_sequence
                """)) {
            statement.setString(1, modelId);
            statement.setInt(2, cutoffSequence);
            int count = 0;
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    byte[] bytes = rows.getString(3).getBytes(StandardCharsets.UTF_8);
                    if (!E2EAttemptSnapshotSupport.sha256(bytes).equals(rows.getString(4))) {
                        throw input("Transaction Snapshot Revision document digest 不匹配。");
                    }
                    SemanticRevision revision = new SemanticRevisionReader().read(new ByteArrayInputStream(bytes));
                    if (!modelId.equals(revision.modelId()) || !rows.getString(1).equals(revision.revisionId())
                            || rows.getInt(2) != revision.revisionSequence()) {
                        throw input("Transaction Snapshot Revision document identity 不匹配。");
                    }
                    JsonNode document = JSON.readTree(bytes);
                    if (document.path("text_artifact").isObject()) count += 1;
                }
            }
            return count;
        }
    }

    private static int count(Connection connection, String sql, String modelId, int sequence) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, modelId);
            statement.setInt(2, sequence);
            return singleCount(statement);
        }
    }

    private static int projectCount(Connection connection, String sql, String projectId, String modelId,
                                    int sequence) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, projectId);
            statement.setString(2, modelId);
            statement.setString(3, modelId);
            statement.setInt(4, sequence);
            return singleCount(statement);
        }
    }

    private static int singleCount(PreparedStatement statement) throws Exception {
        try (ResultSet rows = statement.executeQuery()) {
            if (!rows.next()) throw input("Transaction Snapshot count 缺失。");
            int value = rows.getInt(1);
            if (value < 0 || rows.next()) throw input("Transaction Snapshot count 不合法。");
            return value;
        }
    }

    private static E2EAttemptSnapshotSupport.SnapshotException input(String message) {
        return E2EAttemptSnapshotSupport.input(message);
    }

    record Arguments(Path storage, String projectId, String modelId, String beforeRevisionId,
                     String afterRevisionId, Path fixtureMaterialization) {
        static Arguments parse(String[] args) {
            if (args == null || args.length != OPTIONS.size() * 2) throw input("Transaction Snapshot CLI 参数数量不合法。");
            Map<String, String> values = new LinkedHashMap<>();
            for (int index = 0; index < args.length; index += 2) {
                if (!args[index].startsWith("--") || args[index].length() < 3 || args[index + 1].isBlank()) {
                    throw input("Transaction Snapshot CLI 参数形状不合法。");
                }
                String key = args[index].substring(2);
                if (!OPTIONS.contains(key) || values.putIfAbsent(key, args[index + 1]) != null) {
                    throw input("Transaction Snapshot CLI 参数未知或重复。");
                }
            }
            if (!OPTIONS.equals(values.keySet()) || !GUARD.equals(values.get("guard"))) {
                throw input("Transaction Snapshot CLI guard或参数集合不合法。");
            }
            return new Arguments(path(values, "storage"), required(values, "project-id"), required(values, "model-id"),
                    required(values, "before-revision-id"), required(values, "after-revision-id"),
                    path(values, "fixture-materialization"));
        }

        private static Path path(Map<String, String> values, String key) {
            try {
                Path path = Path.of(required(values, key));
                if (!path.isAbsolute() || !path.equals(path.normalize())) {
                    throw input("Transaction Snapshot CLI path必须是规范绝对路径。");
                }
                return path;
            } catch (E2EAttemptSnapshotSupport.SnapshotException exception) {
                throw exception;
            } catch (Exception exception) {
                throw input("Transaction Snapshot CLI path不合法。");
            }
        }

        private static String required(Map<String, String> values, String key) {
            String value = values.get(key);
            if (value == null || value.isBlank()) throw input("Transaction Snapshot CLI 参数缺失。");
            return value;
        }
    }

    private record RevisionCutoff(String revisionId, int sequence) { }
}
