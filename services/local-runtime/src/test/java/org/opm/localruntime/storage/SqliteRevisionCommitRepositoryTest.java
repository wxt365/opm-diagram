package org.opm.localruntime.storage;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.command.CandidateRevisionCommand;
import org.opm.localruntime.command.CandidateRevisionCommitter;
import org.opm.localruntime.command.CommitFailureCode;
import org.opm.localruntime.command.CommitResult;
import org.opm.localruntime.command.ProfileRuleBinding;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionJsonWriter;
import org.opm.localruntime.semantic.SemanticRevisionReader;
import org.opm.localruntime.text.OplGrammar;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class SqliteRevisionCommitRepositoryTest {

    @TempDir
    Path temporaryDirectory;

    @Test
    void atomicallyWritesRevisionHeadOperationReceiptAndTraceIndexes() throws Exception {
        Path database = initializedDatabase();
        SemanticRevision base = base();
        CandidateRevisionCommand command = command(base, candidate(base), "command.sqlite.001", "digest.sqlite.001");

        CommitResult.Committed result = assertInstanceOf(CommitResult.Committed.class,
                new CandidateRevisionCommitter(new SqliteRevisionCommitRepository(database)).commit(command));

        assertEquals("revision.demo.0002", result.committedRevisionId());
        try (Connection connection = raw(database)) {
            assertEquals("revision.demo.0002", text(connection, "SELECT draft_head_revision_id FROM model_head WHERE model_id = 'model.demo.processing'"));
            assertEquals(2, integer(connection, "SELECT head_sequence FROM model_head WHERE model_id = 'model.demo.processing'"));
            assertEquals(2, integer(connection, "SELECT COUNT(*) FROM revision_document"));
            assertEquals(1, integer(connection, "SELECT COUNT(*) FROM revision_parent WHERE revision_id = 'revision.demo.0002'"));
            assertEquals(1, integer(connection, "SELECT COUNT(*) FROM operation_record WHERE result_revision_id = 'revision.demo.0002'"));
            assertEquals(1, integer(connection, "SELECT COUNT(*) FROM idempotency_record WHERE result_revision_id = 'revision.demo.0002'"));
            assertEquals(1, integer(connection, "SELECT COUNT(*) FROM text_trace_index WHERE source_revision_id = 'revision.demo.0002'"));
            String document = text(connection, "SELECT document_json FROM revision_document WHERE revision_id = 'revision.demo.0002'");
            SemanticRevision reread = new SemanticRevisionReader().read(new ByteArrayInputStream(document.getBytes(StandardCharsets.UTF_8)));
            assertEquals("revision.demo.0002", reread.revisionId());
            assertNotNull(document);
            assertEquals(1, integer(connection, "SELECT COUNT(*) FROM revision_document WHERE revision_id = 'revision.demo.0002' AND document_json LIKE '%\"text_artifact\"%'"));
            assertEquals(1, integer(connection, "SELECT COUNT(*) FROM revision_document WHERE revision_id = 'revision.demo.0002' AND document_json LIKE '%\"commit_validation_summary\"%'"));
        }
    }

    @Test
    void rollsBackEveryWriteWhenTheTransactionFailsAfterRevisionInsert() throws Exception {
        Path database = initializedDatabase();
        SemanticRevision base = base();
        SqliteRevisionCommitRepository repository = new SqliteRevisionCommitRepository(
                SqliteConnectionFactory.create(database), () -> { throw new SQLException("injected write failure"); });

        CommitResult.Rejected result = assertInstanceOf(CommitResult.Rejected.class,
                new CandidateRevisionCommitter(repository).commit(command(base, candidate(base), "command.sqlite.fail", "digest.sqlite.fail")));

        assertEquals(CommitFailureCode.PERSISTENCE_FAILED, result.code());
        try (Connection connection = raw(database)) {
            assertEquals("revision.demo.0001", text(connection, "SELECT draft_head_revision_id FROM model_head WHERE model_id = 'model.demo.processing'"));
            assertEquals(1, integer(connection, "SELECT COUNT(*) FROM revision_document"));
            assertEquals(0, integer(connection, "SELECT COUNT(*) FROM operation_record"));
            assertEquals(0, integer(connection, "SELECT COUNT(*) FROM idempotency_record"));
            assertEquals(0, integer(connection, "SELECT COUNT(*) FROM text_trace_index"));
        }
    }

    private Path initializedDatabase() throws Exception {
        ProjectDatabaseFactory factory = new ProjectDatabaseFactory(temporaryDirectory);
        ProjectDatabaseOpenResult.Ready ready = assertInstanceOf(ProjectDatabaseOpenResult.Ready.class, factory.open("project.demo"));
        SemanticRevision base = base();
        try (Connection connection = raw(ready.database().databasePath())) {
            seed(connection, base);
        }
        return ready.database().databasePath();
    }

    private void seed(Connection connection, SemanticRevision revision) throws Exception {
        execute(connection, """
                INSERT INTO project_metadata(project_id, name, normalized_name, status, default_profile_id, default_profile_version, created_at, updated_at)
                VALUES ('project.demo', 'Demo', 'demo', 'ACTIVE', 'profile.iso19450.2024.draft', '0.1.0', '2026-07-28T00:00:00Z', '2026-07-28T00:00:00Z')
                """);
        execute(connection, """
                INSERT INTO model_catalog(model_id, project_id, name, normalized_name, status, profile_binding_json, created_at, updated_at)
                VALUES ('model.demo.processing', 'project.demo', 'Processing', 'processing', 'ACTIVE', '{}', '2026-07-28T00:00:00Z', '2026-07-28T00:00:00Z')
                """);
        execute(connection, """
                INSERT INTO profile_package(profile_id, package_version, package_digest, lifecycle_status, package_json, installed_at)
                VALUES ('profile.iso19450.2024.draft', '0.1.0', 'profile-digest', 'DRAFT', '{}', '2026-07-28T00:00:00Z')
                """);
        execute(connection, """
                INSERT INTO rule_set_package(rule_set_id, rule_set_version, rule_set_digest, lifecycle_status, package_json, installed_at)
                VALUES ('rules.iso19450.2024.draft', '0.1.0', 'rule-digest', 'DRAFT', '{}', '2026-07-28T00:00:00Z')
                """);
        String document = new SemanticRevisionJsonWriter().write(revision);
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO revision_document(
                    revision_id, model_id, revision_sequence, schema_version, profile_id, profile_version,
                    rule_set_id, rule_set_version, schema_set_json, profile_binding_json, document_json,
                    document_digest, commit_reason, created_at)
                VALUES (?, ?, 1, '0.1', ?, '0.1.0', ?, '0.1.0', '{}', '{}', ?, 'seed-digest', 'SEED', '2026-07-28T00:00:00Z')
                """)) {
            statement.setString(1, revision.revisionId());
            statement.setString(2, revision.modelId());
            statement.setString(3, revision.profileBinding().profile().id());
            statement.setString(4, revision.profileBinding().ruleSet().id());
            statement.setString(5, document);
            statement.executeUpdate();
        }
        execute(connection, """
                INSERT INTO model_head(model_id, draft_head_revision_id, head_sequence, updated_at)
                VALUES ('model.demo.processing', 'revision.demo.0001', 1, '2026-07-28T00:00:00Z')
                """);
    }

    private CandidateRevisionCommand command(SemanticRevision base, SemanticRevision candidate, String commandId, String digest) {
        var profile = base.profileBinding().profile();
        var rules = base.profileBinding().ruleSet();
        var grammar = base.profileBinding().textGrammar();
        return new CandidateRevisionCommand("project.demo", base.modelId(), commandId, base.revisionId(), base, candidate,
                new ProfileRuleBinding(profile.id(), profile.version(), rules.id(), rules.version()),
                new OplGrammar(new OplGrammar.Binding(grammar.id(), grammar.version(), grammar.sha256()), List.of(
                        new OplGrammar.Template("opl.consumption.v1", 10), new OplGrammar.Template("opl.consumption.state.v1", 10))),
                digest, "EDIT", Instant.parse("2026-07-28T00:00:00Z"));
    }

    private SemanticRevision base() { return new SemanticRevisionReader().read(fixture()); }

    private SemanticRevision candidate(SemanticRevision base) {
        return new SemanticRevision("revision.demo.0002", base.modelId(), 2, base.profileBinding(), base.rootContextId(),
                base.elements(), base.states(), base.facts(), base.contexts(), base.occurrences(), base.layouts());
    }

    private Path fixture() {
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            Path candidate = current.resolve("docs/contracts/examples/minimal-iso-revision.json");
            if (Files.isRegularFile(candidate)) return candidate;
            current = current.getParent();
        }
        throw new IllegalStateException("Minimal ISO revision fixture is not available");
    }

    private Connection raw(Path database) throws SQLException {
        Connection connection = DriverManager.getConnection("jdbc:sqlite:" + database.toAbsolutePath() + "?foreign_keys=on");
        try (Statement statement = connection.createStatement()) { statement.execute("PRAGMA foreign_keys = ON"); }
        return connection;
    }

    private String text(Connection connection, String sql) throws SQLException {
        try (Statement statement = connection.createStatement(); ResultSet result = statement.executeQuery(sql)) {
            result.next();
            return result.getString(1);
        }
    }

    private int integer(Connection connection, String sql) throws SQLException {
        try (Statement statement = connection.createStatement(); ResultSet result = statement.executeQuery(sql)) {
            result.next();
            return result.getInt(1);
        }
    }

    private void execute(Connection connection, String sql) throws SQLException {
        try (Statement statement = connection.createStatement()) { statement.execute(sql); }
    }
}
