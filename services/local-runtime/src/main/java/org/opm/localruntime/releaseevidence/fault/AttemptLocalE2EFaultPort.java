package org.opm.localruntime.releaseevidence.fault;

import org.opm.localruntime.assets.ProfilePackageAssemblyException;
import org.opm.localruntime.assets.ProfilePackageDescriptor;
import org.opm.localruntime.command.CandidateRevisionCommand;
import org.opm.localruntime.command.CommitFailureCode;
import org.opm.localruntime.command.CommitPersistenceException;
import org.opm.localruntime.command.RevisionCommitRepository;
import org.springframework.beans.factory.DisposableBean;

import java.util.Objects;
import java.util.function.IntConsumer;

/** 每个完整 fault child 唯一的内存 port；状态绝不跨进程或跨 REOPEN 共享。 */
public final class AttemptLocalE2EFaultPort implements E2EFaultPort, DisposableBean {
    private enum State { CREATED, VERIFIED, ARMED, TRIGGERED, VERIFIED_AT_SHUTDOWN }
    private final E2EFaultPlanVerifier.VerifiedPlan verifiedPlan;
    private final IntConsumer terminator;
    private State state = State.CREATED;

    public AttemptLocalE2EFaultPort(E2EFaultPlanVerifier.VerifiedPlan verifiedPlan, IntConsumer terminator) {
        this.verifiedPlan = Objects.requireNonNull(verifiedPlan, "verifiedPlan must not be null");
        this.terminator = Objects.requireNonNull(terminator, "terminator must not be null");
        state = State.VERIFIED;
        state = State.ARMED;
    }

    @Override public E2EFaultContext contextFor(CandidateRevisionCommand command) {
        var binding = command.candidateRevision().profileBinding();
        return new E2EFaultContext.Active(verifiedPlan.plan().caseId(), verifiedPlan.plan().attemptOrdinal(), command.projectId(), command.modelId(),
                command.baseRevisionId(), command.candidateRevision().revisionId(), command.commandId(), binding.profile().id(), binding.profile().version(), binding.symbolCatalog().sha256());
    }

    @Override public void beforeSymbolAssetLoad(E2EFaultContext context, ProfilePackageDescriptor.RequiredAsset asset) {
        if (verifiedPlan.plan().target() != E2EFaultPlan.Target.SYMBOL_CATALOG_ASSET) return;
        trigger(context, () -> { throw new ProfilePackageAssemblyException(ProfilePackageAssemblyException.Code.PROFILE_ASSET_MISSING, "E2E fault: symbol asset missing"); });
    }

    @Override public void beforeRevisionInsert(E2EFaultContext context) {
        if (verifiedPlan.plan().target() != E2EFaultPlan.Target.SQLITE_BEFORE_REVISION_INSERT) return;
        trigger(context, () -> { throw new CommitPersistenceException(CommitFailureCode.PERSISTENCE_FAILED, "E2E fault: persistence failed", null); });
    }

    @Override public RevisionCommitRepository.Head projectCurrentHead(E2EFaultContext context, RevisionCommitRepository.Head head) {
        if (verifiedPlan.plan().target() != E2EFaultPlan.Target.PROJECT_STORAGE_READ_ONLY) return head;
        trigger(context, () -> { });
        return new RevisionCommitRepository.Head(head.revisionId(), head.revisionSequence(), false);
    }

    private synchronized void trigger(E2EFaultContext context, Runnable failure) {
        if (!(context instanceof E2EFaultContext.Active active) || !matches(active)) protocol(E2EFaultLauncherErrorCode.E2E_FAULT_CONTEXT_MISMATCH, "TARGET_HOOK");
        if (state == State.TRIGGERED) protocol(E2EFaultLauncherErrorCode.E2E_FAULT_ALREADY_TRIGGERED, "TARGET_HOOK");
        if (state != State.ARMED) protocol(E2EFaultLauncherErrorCode.E2E_FAULT_INTERNAL_ERROR, "TARGET_HOOK");
        verifiedPlan.verifyNoDrift("TRIGGER_PRECHECK");
        state = State.TRIGGERED;
        failure.run();
    }

    private boolean matches(E2EFaultContext.Active context) {
        E2EFaultPlan plan = verifiedPlan.plan();
        return context.caseId().equals(plan.caseId()) && context.attemptOrdinal() == plan.attemptOrdinal()
                && context.candidateRevisionId() != null && context.commandId().equals(commandId(plan));
    }

    private String commandId(E2EFaultPlan plan) {
        return "command.e2e." + plan.caseId().toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "")
                + ".attempt-" + plan.attemptOrdinal() + ".action-001";
    }

    private void protocol(E2EFaultLauncherErrorCode code, String stage) {
        E2EFaultLauncherException exception = E2EFaultPlanVerifier.failure(code, stage, verifiedPlan.plan().caseId(), verifiedPlan.plan().attemptOrdinal(), "Fault port protocol failed");
        exception.reportOnce(); terminator.accept(exception.exitCode()); throw exception;
    }

    @Override public synchronized void destroy() {
        try {
            verifiedPlan.verifyNoDrift("SHUTDOWN_VERIFY");
            if (state != State.TRIGGERED || verifiedPlan.plan().triggerCount() != 1) protocol(E2EFaultLauncherErrorCode.E2E_FAULT_NOT_TRIGGERED, "SHUTDOWN_VERIFY");
            state = State.VERIFIED_AT_SHUTDOWN;
        } catch (E2EFaultLauncherException exception) { exception.reportOnce(); terminator.accept(exception.exitCode()); }
    }
}
