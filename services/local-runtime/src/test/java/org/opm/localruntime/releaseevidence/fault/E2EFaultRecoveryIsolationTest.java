package org.opm.localruntime.releaseevidence.fault;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.assets.ProfilePackageDescriptor;
import org.opm.localruntime.command.CandidateRevisionCommand;
import org.opm.localruntime.command.CandidateRevisionCommitter;
import org.opm.localruntime.command.CommitFailureCode;
import org.opm.localruntime.command.CommitPersistenceException;
import org.opm.localruntime.command.CommitResult;
import org.opm.localruntime.command.ProfileRuleBinding;
import org.opm.localruntime.command.RevisionCommitRepository;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionJsonWriter;
import org.opm.localruntime.semantic.SemanticRevisionReader;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.opm.localruntime.storage.ProjectDatabaseOpenResult;
import org.opm.localruntime.storage.SqliteRevisionCommitRepository;
import org.opm.localruntime.text.OplGrammar;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

class E2EFaultRecoveryIsolationTest {

    @TempDir
    Path temporaryDirectory;

    @Test
    void e2ePersistenceFailureRunsBeforeRecoveryAndRecoveryFailureDoesNotEnterE2eHooks() throws Exception {
        AtomicInteger e2eCalls = new AtomicInteger();
        AtomicInteger recoveryCalls = new AtomicInteger();
        Path e2eDatabase = initializedDatabase("e2e");
        SemanticRevision base = base();
        CandidateRevisionCommand e2eCommand = command(base, "command.e2e");
        E2EFaultPort e2ePort = activePersistencePort(e2eCalls);
        SqliteRevisionCommitRepository e2eRepository = new SqliteRevisionCommitRepository(dataSource(e2eDatabase),
                (stage, context) -> recoveryCalls.incrementAndGet(), e2ePort);

        assertRejected(new CandidateRevisionCommitter(e2eRepository, null, e2ePort).commit(e2eCommand), CommitFailureCode.PERSISTENCE_FAILED);
        assertEquals(1, e2eCalls.get());
        assertEquals(0, recoveryCalls.get());
        assertDatabaseUnchanged(e2eDatabase);

        AtomicInteger recoveryE2eCalls = new AtomicInteger();
        AtomicInteger recoveryFailureCalls = new AtomicInteger();
        Path recoveryDatabase = initializedDatabase("recovery");
        SqliteRevisionCommitRepository recoveryRepository = new SqliteRevisionCommitRepository(dataSource(recoveryDatabase),
                (stage, context) -> {
                    recoveryFailureCalls.incrementAndGet();
                    throw new java.io.IOException("controlled recovery failure");
                }, countingNoopPort(recoveryE2eCalls));

        assertRejected(new CandidateRevisionCommitter(recoveryRepository).commit(command(base, "command.recovery")), CommitFailureCode.PERSISTENCE_FAILED);
        assertEquals(0, recoveryE2eCalls.get());
        assertEquals(1, recoveryFailureCalls.get());
        assertDatabaseUnchanged(recoveryDatabase);
    }

    private E2EFaultPort activePersistencePort(AtomicInteger calls) {
        return new E2EFaultPort() {
            @Override public E2EFaultContext contextFor(CandidateRevisionCommand command) {
                return new E2EFaultContext.Active("E2E-CANVAS-007.PERSISTENCE_FAILED", 1, command.projectId(), command.modelId(),
                        command.baseRevisionId(), command.candidateRevision().revisionId(), command.commandId(), "profile", "0.2", "a".repeat(64));
            }
            @Override public void beforeSymbolAssetLoad(E2EFaultContext context, ProfilePackageDescriptor.RequiredAsset asset) { }
            @Override public void beforeRevisionInsert(E2EFaultContext context) {
                calls.incrementAndGet();
                throw new CommitPersistenceException(CommitFailureCode.PERSISTENCE_FAILED, "controlled E2E failure", null);
            }
            @Override public RevisionCommitRepository.Head projectCurrentHead(E2EFaultContext context, RevisionCommitRepository.Head head) { return head; }
        };
    }

    private E2EFaultPort countingNoopPort(AtomicInteger calls) {
        return new E2EFaultPort() {
            @Override public E2EFaultContext contextFor(CandidateRevisionCommand command) { return E2EFaultContext.Disabled.INSTANCE; }
            @Override public void beforeSymbolAssetLoad(E2EFaultContext context, ProfilePackageDescriptor.RequiredAsset asset) {
                if (context instanceof E2EFaultContext.Active) calls.incrementAndGet();
            }
            @Override public void beforeRevisionInsert(E2EFaultContext context) {
                if (context instanceof E2EFaultContext.Active) calls.incrementAndGet();
            }
            @Override public RevisionCommitRepository.Head projectCurrentHead(E2EFaultContext context, RevisionCommitRepository.Head head) {
                if (context instanceof E2EFaultContext.Active) calls.incrementAndGet();
                return head;
            }
        };
    }

    private void assertRejected(CommitResult result, CommitFailureCode code) {
        assertEquals(code, assertInstanceOf(CommitResult.Rejected.class, result).code());
    }

    private void assertDatabaseUnchanged(Path database) throws Exception {
        try (Connection connection = raw(database)) {
            assertEquals("revision.demo.0001", text(connection, "SELECT draft_head_revision_id FROM model_head WHERE model_id = 'model.demo.processing'"));
            assertEquals(1, integer(connection, "SELECT COUNT(*) FROM revision_document"));
            assertEquals(0, integer(connection, "SELECT COUNT(*) FROM revision_parent"));
            assertEquals(0, integer(connection, "SELECT COUNT(*) FROM text_trace_index"));
            assertEquals(0, integer(connection, "SELECT COUNT(*) FROM finding_index"));
            assertEquals(0, integer(connection, "SELECT COUNT(*) FROM operation_record"));
            assertEquals(0, integer(connection, "SELECT COUNT(*) FROM idempotency_record"));
        }
    }

    private Path initializedDatabase(String name) throws Exception {
        ProjectDatabaseOpenResult.Ready ready = assertInstanceOf(ProjectDatabaseOpenResult.Ready.class,
                new ProjectDatabaseFactory(temporaryDirectory.resolve(name)).open("project.demo"));
        try (Connection connection = raw(ready.database().databasePath())) {
            SemanticRevision revision = base();
            execute(connection, "INSERT INTO project_metadata(project_id, name, normalized_name, status, default_profile_id, default_profile_version, created_at, updated_at) VALUES ('project.demo', 'Demo', 'demo', 'ACTIVE', 'profile.iso19450.2024.draft', '0.1.0', '2026-07-28T00:00:00Z', '2026-07-28T00:00:00Z')");
            execute(connection, "INSERT INTO model_catalog(model_id, project_id, name, normalized_name, status, profile_binding_json, created_at, updated_at) VALUES ('model.demo.processing', 'project.demo', 'Processing', 'processing', 'ACTIVE', '{}', '2026-07-28T00:00:00Z', '2026-07-28T00:00:00Z')");
            execute(connection, "INSERT INTO profile_package(profile_id, package_version, package_digest, lifecycle_status, package_json, installed_at) VALUES ('profile.iso19450.2024.draft', '0.1.0', 'profile-digest', 'DRAFT', '{}', '2026-07-28T00:00:00Z')");
            execute(connection, "INSERT INTO rule_set_package(rule_set_id, rule_set_version, rule_set_digest, lifecycle_status, package_json, installed_at) VALUES ('rules.iso19450.2024.draft', '0.1.0', 'rule-digest', 'DRAFT', '{}', '2026-07-28T00:00:00Z')");
            String document = new SemanticRevisionJsonWriter().write(revision);
            try (PreparedStatement statement = connection.prepareStatement("INSERT INTO revision_document(revision_id, model_id, revision_sequence, schema_version, profile_id, profile_version, rule_set_id, rule_set_version, schema_set_json, profile_binding_json, document_json, document_digest, commit_reason, created_at) VALUES (?, ?, 1, '0.1', ?, '0.1.0', ?, '0.1.0', '{}', '{}', ?, 'seed-digest', 'SEED', '2026-07-28T00:00:00Z')")) {
                statement.setString(1, revision.revisionId());
                statement.setString(2, revision.modelId());
                statement.setString(3, revision.profileBinding().profile().id());
                statement.setString(4, revision.profileBinding().ruleSet().id());
                statement.setString(5, document);
                statement.executeUpdate();
            }
            execute(connection, "INSERT INTO model_head(model_id, draft_head_revision_id, head_sequence, updated_at) VALUES ('model.demo.processing', 'revision.demo.0001', 1, '2026-07-28T00:00:00Z')");
        }
        return ready.database().databasePath();
    }

    private CandidateRevisionCommand command(SemanticRevision base, String commandId) {
        var profile = base.profileBinding().profile();
        var rules = base.profileBinding().ruleSet();
        var grammar = base.profileBinding().textGrammar();
        SemanticRevision candidate = new SemanticRevision("revision.demo.0002", base.modelId(), 2, base.profileBinding(), base.rootContextId(),
                base.elements(), base.features(), base.states(), base.facts(), base.contexts(), base.occurrences(), base.layouts(), base.statePresentations());
        return new CandidateRevisionCommand("project.demo", base.modelId(), commandId, base.revisionId(), base, candidate,
                new ProfileRuleBinding(profile.id(), profile.version(), rules.id(), rules.version()),
                new OplGrammar(new OplGrammar.Binding(grammar.id(), grammar.version(), grammar.sha256()), List.of(
                        new OplGrammar.Template("opl.consumption.v1", 10), new OplGrammar.Template("opl.consumption.state.v1", 10))),
                "digest." + commandId, "EDIT", Instant.parse("2026-07-28T00:00:00Z"));
    }

    private SemanticRevision base() {
        try {
            return new SemanticRevisionReader().read(new ByteArrayInputStream(Files.readAllBytes(fixture())));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
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

    private Connection raw(Path database) throws Exception {
        Connection connection = DriverManager.getConnection("jdbc:sqlite:" + database.toAbsolutePath() + "?foreign_keys=on");
        try (Statement statement = connection.createStatement()) { statement.execute("PRAGMA foreign_keys = ON"); }
        return connection;
    }

    private SQLiteDataSource dataSource(Path database) {
        SQLiteConfig config = new SQLiteConfig();
        config.enforceForeignKeys(true);
        SQLiteDataSource dataSource = new SQLiteDataSource(config);
        dataSource.setUrl("jdbc:sqlite:" + database.toAbsolutePath());
        return dataSource;
    }

    private void execute(Connection connection, String sql) throws Exception {
        try (Statement statement = connection.createStatement()) { statement.execute(sql); }
    }

    private String text(Connection connection, String sql) throws Exception {
        try (Statement statement = connection.createStatement(); ResultSet result = statement.executeQuery(sql)) {
            result.next();
            return result.getString(1);
        }
    }

    private int integer(Connection connection, String sql) throws Exception {
        try (Statement statement = connection.createStatement(); ResultSet result = statement.executeQuery(sql)) {
            result.next();
            return result.getInt(1);
        }
    }
}
