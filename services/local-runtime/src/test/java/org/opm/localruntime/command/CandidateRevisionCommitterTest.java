package org.opm.localruntime.command;

import org.junit.jupiter.api.Test;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionReader;
import org.opm.localruntime.text.OplGrammar;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

class CandidateRevisionCommitterTest {

    @Test
    void commitsValidCandidateAndReplaysTheSameCommand() {
        RecordingRepository repository = new RecordingRepository(base());
        CandidateRevisionCommitter committer = new CandidateRevisionCommitter(repository);
        CandidateRevisionCommand command = command(base(), candidate(base()), "command.commit.001", "digest-001");

        CommitResult.Committed committed = assertInstanceOf(CommitResult.Committed.class, committer.commit(command));
        CommitResult.Replayed replayed = assertInstanceOf(CommitResult.Replayed.class, committer.commit(command));

        assertEquals("revision.demo.0002", committed.committedRevisionId());
        assertEquals(committed.committedRevisionId(), replayed.committedRevisionId());
        assertEquals(1, repository.commitCount);
        assertFalse(committed.traceIds().isEmpty());
    }

    @Test
    void rejectsDifferentRequestForUsedCommandIdWithoutWriting() {
        RecordingRepository repository = new RecordingRepository(base());
        CandidateRevisionCommitter committer = new CandidateRevisionCommitter(repository);
        committer.commit(command(base(), candidate(base()), "command.commit.002", "digest-002"));

        CommitResult.Rejected result = assertInstanceOf(CommitResult.Rejected.class,
                committer.commit(command(base(), candidate(base()), "command.commit.002", "digest-other")));

        assertEquals(CommitFailureCode.IDEMPOTENCY_MISMATCH, result.code());
        assertEquals(1, repository.commitCount);
    }

    @Test
    void blocksRevisionConflictReadOnlyRuleValidationAndTextFailuresBeforePersistence() {
        SemanticRevision base = base();
        CandidateRevisionCommitter conflictCommitter = new CandidateRevisionCommitter(new RecordingRepository(base, "revision.other", true));
        assertRejected(conflictCommitter.commit(command(base, candidate(base), "command.conflict", "digest-conflict")), CommitFailureCode.REVISION_CONFLICT);

        CandidateRevisionCommitter readOnlyCommitter = new CandidateRevisionCommitter(new RecordingRepository(base, base.revisionId(), false));
        assertRejected(readOnlyCommitter.commit(command(base, candidate(base), "command.readonly", "digest-readonly")), CommitFailureCode.READ_ONLY_REVISION);

        SemanticRevision badState = invalidStateCandidate(base);
        RecordingRepository validationRepository = new RecordingRepository(base);
        assertRejected(new CandidateRevisionCommitter(validationRepository)
                .commit(command(base, badState, "command.validation", "digest-validation")), CommitFailureCode.VALIDATION_BLOCKED);
        assertEquals(0, validationRepository.commitCount);

        RecordingRepository textRepository = new RecordingRepository(base);
        OplGrammar mismatch = new OplGrammar(new OplGrammar.Binding("grammar.other", "0.1.0", "other"),
                List.of(new OplGrammar.Template("opl.consumption.state.v1", 10)));
        CandidateRevisionCommand textCommand = new CandidateRevisionCommand(
                "project.demo", base.modelId(), "command.text", base.revisionId(), base, candidate(base), binding(base), mismatch,
                "digest-text", "EDIT", Instant.parse("2026-07-28T00:00:00Z"));
        assertRejected(new CandidateRevisionCommitter(textRepository).commit(textCommand), CommitFailureCode.TEXT_GENERATION_BLOCKED);
        assertEquals(0, textRepository.commitCount);

        SemanticRevision ruleMismatch = new SemanticRevision("revision.demo.0002", base.modelId(), 2,
                new SemanticRevision.ProfileBinding(base.profileBinding().profile(),
                        new SemanticRevision.AssetReference("rules.other", "0.1.0", "different"),
                        base.profileBinding().textGrammar(), base.profileBinding().symbolCatalog(),
                        base.profileBinding().normalizationAdapter(), base.profileBinding().bindingDigest()),
                base.rootContextId(), base.elements(), base.states(), base.facts(), base.contexts(), base.occurrences(), base.layouts());
        RecordingRepository ruleRepository = new RecordingRepository(base);
        assertRejected(new CandidateRevisionCommitter(ruleRepository)
                .commit(command(base, ruleMismatch, "command.rule", "digest-rule")), CommitFailureCode.RULE_VERSION_CONFLICT);
        assertEquals(0, ruleRepository.commitCount);
    }

    @Test
    void publicCommandApiDoesNotExposeInfrastructureOrMutableCollections() {
        List<Class<?>> apiTypes = List.of(CandidateRevisionCommand.class, CandidateRevisionCommitter.class, CommitFailureCode.class,
                CommitFinding.class, CommitValidationSummary.class, CommitResult.class, CommitResult.Committed.class,
                CommitResult.Rejected.class, CommitResult.Replayed.class, ProfileRuleBinding.class, RevisionCommitBundle.class,
                RevisionCommitRepository.class, RevisionCommitRepository.Head.class, RevisionCommitRepository.Receipt.class);
        for (Class<?> apiType : apiTypes) assertNoInfrastructureTypes(apiType);
        CommitResult.Committed result = assertInstanceOf(CommitResult.Committed.class,
                new CandidateRevisionCommitter(new RecordingRepository(base())).commit(command(base(), candidate(base()), "command.immutable", "digest-immutable")));
        assertThrowsUnsupported(() -> result.traceIds().clear());
    }

    private void assertRejected(CommitResult result, CommitFailureCode code) {
        assertEquals(code, assertInstanceOf(CommitResult.Rejected.class, result).code());
    }

    private CandidateRevisionCommand command(SemanticRevision base, SemanticRevision candidate, String commandId, String requestDigest) {
        return new CandidateRevisionCommand("project.demo", base.modelId(), commandId, base.revisionId(), base, candidate,
                binding(base), grammar(base), requestDigest, "EDIT", Instant.parse("2026-07-28T00:00:00Z"));
    }

    private SemanticRevision base() {
        return new SemanticRevisionReader().read(fixture());
    }

    private SemanticRevision candidate(SemanticRevision base) {
        return new SemanticRevision("revision.demo.0002", base.modelId(), base.revisionSequence() + 1, base.profileBinding(),
                base.rootContextId(), base.elements(), base.states(), base.facts(), base.contexts(), base.occurrences(), base.layouts());
    }

    private SemanticRevision invalidStateCandidate(SemanticRevision base) {
        SemanticRevision.State state = base.states().getFirst();
        SemanticRevision.State invalid = new SemanticRevision.State(state.id(), "element.processing", state.capability(), state.name(),
                state.roles(), state.source(), state.normalization());
        return new SemanticRevision("revision.demo.0002", base.modelId(), 2, base.profileBinding(), base.rootContextId(),
                base.elements(), List.of(invalid), base.facts(), base.contexts(), base.occurrences(), base.layouts());
    }

    private ProfileRuleBinding binding(SemanticRevision revision) {
        return new ProfileRuleBinding(revision.profileBinding().profile().id(), revision.profileBinding().profile().version(),
                revision.profileBinding().ruleSet().id(), revision.profileBinding().ruleSet().version());
    }

    private OplGrammar grammar(SemanticRevision revision) {
        SemanticRevision.AssetReference grammar = revision.profileBinding().textGrammar();
        return new OplGrammar(new OplGrammar.Binding(grammar.id(), grammar.version(), grammar.sha256()), List.of(
                new OplGrammar.Template("opl.consumption.v1", 10), new OplGrammar.Template("opl.consumption.state.v1", 10)));
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

    private void assertNoInfrastructureTypes(Class<?> type) {
        assertFalse(type.getPackageName().startsWith("com.fasterxml.jackson"));
        assertFalse(type.getPackageName().startsWith("java.sql") || type.getPackageName().startsWith("javax.sql"));
        for (Method method : type.getMethods()) {
            assertFalse(infrastructure(method.getReturnType()));
            for (Class<?> parameter : method.getParameterTypes()) assertFalse(infrastructure(parameter));
        }
        for (Constructor<?> constructor : type.getConstructors()) {
            for (Class<?> parameter : constructor.getParameterTypes()) assertFalse(infrastructure(parameter));
        }
    }

    private boolean infrastructure(Class<?> type) {
        return type.getPackageName().startsWith("com.fasterxml.jackson")
                || type.getPackageName().startsWith("java.sql") || type.getPackageName().startsWith("javax.sql");
    }

    private void assertThrowsUnsupported(Runnable operation) {
        try {
            operation.run();
            throw new AssertionError("Expected immutable collection");
        } catch (UnsupportedOperationException expected) {
            // 集合由领域记录复制，调用方不得修改。
        }
    }

    private static final class RecordingRepository implements RevisionCommitRepository {
        private Head head;
        private final Map<String, Receipt> receipts = new HashMap<>();
        private int commitCount;

        private RecordingRepository(SemanticRevision revision) { this(revision, revision.revisionId(), true); }

        private RecordingRepository(SemanticRevision revision, String headRevisionId, boolean writable) {
            head = new Head(headRevisionId, revision.revisionSequence(), writable);
        }

        @Override public Optional<Head> currentHead(String modelId) { return Optional.of(head); }

        @Override public Optional<Receipt> receipt(String operationId, String aggregateId, String commandId) {
            return Optional.ofNullable(receipts.get(commandId));
        }

        @Override public CommitResult.Committed commit(RevisionCommitBundle bundle) {
            commitCount++;
            head = new Head(bundle.revision().revisionId(), bundle.revision().revisionSequence(), true);
            receipts.put(bundle.command().commandId(), new Receipt(bundle.command().requestDigest(), bundle.revision().revisionId()));
            return new CommitResult.Committed(bundle.revision().revisionId(),
                    bundle.text().traces().stream().map(trace -> trace.traceId()).toList(), bundle.validation());
        }
    }
}
