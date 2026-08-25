package org.opm.localruntime.command;

import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.assets.ProfilePackageAssemblyException;
import org.opm.localruntime.releaseevidence.fault.E2EFaultContext;
import org.opm.localruntime.releaseevidence.fault.E2EFaultPort;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionValidator;
import org.opm.localruntime.semantic.SemanticValidationProblem;
import org.opm.localruntime.text.OplGenerationException;
import org.opm.localruntime.text.OplGenerationResult;
import org.opm.localruntime.text.OplGrammar;
import org.opm.localruntime.text.OplTextGenerationService;
import org.opm.localruntime.text.TextGenerationAssets;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.Objects;

public final class CandidateRevisionCommitter {

    private static final String OPERATION_ID = "API-EDT-002";

    private final RevisionCommitRepository repository;
    private final SemanticRevisionValidator semanticValidator;
    private final OplTextGenerationService textGenerationService;
    private final ProfilePackageAssembler profilePackageAssembler;
    private final E2EFaultPort e2eFaultPort;

    public CandidateRevisionCommitter(RevisionCommitRepository repository) {
        this(repository, new SemanticRevisionValidator(), new OplTextGenerationService(), null, E2EFaultPort.NOOP);
    }

    public CandidateRevisionCommitter(RevisionCommitRepository repository, ProfilePackageAssembler profilePackageAssembler) {
        this(repository, new SemanticRevisionValidator(), new OplTextGenerationService(), profilePackageAssembler, E2EFaultPort.NOOP);
    }

    public CandidateRevisionCommitter(RevisionCommitRepository repository, ProfilePackageAssembler profilePackageAssembler, E2EFaultPort e2eFaultPort) {
        this(repository, new SemanticRevisionValidator(), new OplTextGenerationService(), profilePackageAssembler, e2eFaultPort);
    }

    CandidateRevisionCommitter(
            RevisionCommitRepository repository,
            SemanticRevisionValidator semanticValidator,
            OplTextGenerationService textGenerationService,
            ProfilePackageAssembler profilePackageAssembler) {
        this(repository, semanticValidator, textGenerationService, profilePackageAssembler, E2EFaultPort.NOOP);
    }

    CandidateRevisionCommitter(
            RevisionCommitRepository repository,
            SemanticRevisionValidator semanticValidator,
            OplTextGenerationService textGenerationService,
            ProfilePackageAssembler profilePackageAssembler,
            E2EFaultPort e2eFaultPort) {
        this.repository = Objects.requireNonNull(repository, "repository must not be null");
        this.semanticValidator = Objects.requireNonNull(semanticValidator, "semanticValidator must not be null");
        this.textGenerationService = Objects.requireNonNull(textGenerationService, "textGenerationService must not be null");
        this.profilePackageAssembler = profilePackageAssembler;
        this.e2eFaultPort = Objects.requireNonNull(e2eFaultPort, "e2eFaultPort must not be null");
    }

    public CommitResult commit(CandidateRevisionCommand command) {
        Objects.requireNonNull(command, "command must not be null");
        try {
            return commitInternal(command);
        } catch (CommitPersistenceException exception) {
            return rejected(exception.code(), List.of(), exception.getMessage());
        } catch (RuntimeException exception) {
            return rejected(CommitFailureCode.PERSISTENCE_FAILED, List.of(), "Revision commit infrastructure is unavailable");
        }
    }

    private CommitResult commitInternal(CandidateRevisionCommand command) {
        E2EFaultContext context = e2eFaultPort.contextFor(command);
        CommitResult replay = replay(command);
        if (replay != null) return replay;
        CommitResult.Rejected guardFailure = guards(command, context);
        if (guardFailure != null) return guardFailure;

        final TextGenerationAssets assets;
        final OplGrammar grammar;
        try {
            assets = profilePackageAssembler == null ? null : profilePackageAssembler.assemble(command.candidateRevision().profileBinding(), context);
            grammar = assets == null ? command.grammar() : assets.grammar();
        } catch (ProfilePackageAssemblyException exception) {
            return rejected(CommitFailureCode.TEXT_GENERATION_BLOCKED, List.of(), exception.code().name());
        }

        List<CommitFinding> findings = semanticValidator.validate(command.candidateRevision()).stream()
                .map(problem -> finding(command.candidateRevision(), problem))
                .toList();
        CommitValidationSummary validation = new CommitValidationSummary(findings);
        if (validation.hasBlockingFindings()) {
            return rejected(CommitFailureCode.VALIDATION_BLOCKED, findings, "Candidate revision violates semantic invariants");
        }

        final OplGenerationResult text;
        try {
            text = assets == null
                    ? textGenerationService.generate(command.candidateRevision(), command.candidateRevision().rootContextId(), grammar)
                    : textGenerationService.generate(command.candidateRevision(), command.candidateRevision().rootContextId(), assets);
            if (assets != null) {
                textGenerationService.validateActiveWriteEvidence(command.candidateRevision(), assets, text);
            }
        } catch (OplGenerationException exception) {
            if (exception.code() == org.opm.localruntime.text.OplGenerationCode.MODIFIER_COMBINATION_INVALID) {
                return rejected(CommitFailureCode.MODIFIER_COMBINATION_INVALID, List.of(), exception.code().name());
            }
            return rejected(CommitFailureCode.TEXT_GENERATION_BLOCKED, List.of(), exception.code().name());
        }
        return repository.commit(new RevisionCommitBundle(command, command.candidateRevision(), text, validation), context);
    }

    private CommitResult replay(CandidateRevisionCommand command) {
        return repository.receipt(OPERATION_ID, command.modelId(), command.commandId())
                .map(receipt -> receipt.requestDigest().equals(command.requestDigest())
                        ? new CommitResult.Replayed(receipt.committedRevisionId())
                        : rejected(CommitFailureCode.IDEMPOTENCY_MISMATCH, List.of(), "commandId is bound to a different request digest"))
                .orElse(null);
    }

    private CommitResult.Rejected guards(CandidateRevisionCommand command, E2EFaultContext context) {
        RevisionCommitRepository.Head head = repository.currentHead(command.modelId(), context)
                .orElse(null);
        if (head == null || !head.revisionId().equals(command.baseRevisionId())
                || !command.baseRevisionId().equals(command.baseRevision().revisionId())) {
            return rejected(CommitFailureCode.REVISION_CONFLICT, List.of(), "baseRevisionId is not the current draft head");
        }
        if (!head.writable()) {
            return rejected(CommitFailureCode.READ_ONLY_REVISION, List.of(), "Current revision is read-only");
        }
        if (!command.modelId().equals(command.baseRevision().modelId())
                || !command.modelId().equals(command.candidateRevision().modelId())
                || command.candidateRevision().revisionSequence() != head.revisionSequence() + 1) {
            return rejected(CommitFailureCode.DOMAIN_REJECTED, List.of(), "Candidate revision does not follow the current model head");
        }
        if (!command.expectedBinding().matches(command.baseRevision()) || !command.expectedBinding().matches(command.candidateRevision())
                || !sameBinding(command.baseRevision(), command.candidateRevision())) {
            return rejected(CommitFailureCode.RULE_VERSION_CONFLICT, List.of(), "PROFILE_MIGRATION_REQUIRED");
        }
        return null;
    }

    private boolean sameBinding(SemanticRevision base, SemanticRevision candidate) {
        SemanticRevision.ProfileBinding left = base.profileBinding();
        SemanticRevision.ProfileBinding right = candidate.profileBinding();
        return same(left.profile(), right.profile()) && same(left.ruleSet(), right.ruleSet())
                && same(left.textGrammar(), right.textGrammar()) && same(left.symbolCatalog(), right.symbolCatalog())
                && same(left.normalizationAdapter(), right.normalizationAdapter())
                && left.bindingDigest().equals(right.bindingDigest());
    }

    private boolean same(SemanticRevision.AssetReference left, SemanticRevision.AssetReference right) {
        return left.id().equals(right.id()) && left.version().equals(right.version()) && left.sha256().equals(right.sha256());
    }

    private CommitFinding finding(SemanticRevision revision, SemanticValidationProblem problem) {
        String ruleId = "core." + problem.code().name().toLowerCase();
        return new CommitFinding(
                "finding." + digest(revision.revisionId() + "\u001f" + ruleId + "\u001f" + problem.locatorId()).substring(0, 32),
                ruleId,
                "0.1",
                CommitFinding.Severity.BLOCKING,
                problem.locatorId(),
                problem.message());
    }

    private CommitResult.Rejected rejected(CommitFailureCode code, List<CommitFinding> findings, String message) {
        return new CommitResult.Rejected(code, findings, message);
    }

    private static String digest(String input) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(bytes.length * 2);
            for (byte value : bytes) result.append(String.format("%02x", value));
            return result.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }
}
