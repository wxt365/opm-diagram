package org.opm.localruntime.releaseauthoring.visualcommon;

import org.opm.localruntime.command.CommitFailureCode;
import org.opm.localruntime.command.CommitPersistenceException;
import org.opm.localruntime.releaseauthoring.GoldenFixtureMaterializationException;
import org.springframework.beans.factory.DisposableBean;

import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;

/** 仅在受控 BLOCKED_FEEDBACK 命令首次写入 Revision 前触发一次。 */
public final class OneShotVisualCommonCommitFaultPort implements VisualCommonCommitFaultPort, DisposableBean {

    private enum State { ARMED, TRIGGERED }

    private static final String COMMAND_ID = "command.visual.blocked-feedback.persistence-failed";
    private static final String PROJECT_ID = "project.visual.blocked-feedback";
    private static final String MODEL_ID = "model.visual.blocked-feedback";
    private static final String BASE_REVISION_ID = "revision.visual.blocked-feedback";

    private final AtomicReference<State> state = new AtomicReference<>(State.ARMED);

    @Override
    public void beforeRevisionInsert(VisualCommonCommitFaultContext context) {
        Objects.requireNonNull(context, "context must not be null");
        if (!COMMAND_ID.equals(context.commandId())) return;
        if (!matches(context)) {
            throw setupFailure("Visual Common fault command context drifted.");
        }
        if (state.compareAndSet(State.ARMED, State.TRIGGERED)) {
            throw new CommitPersistenceException(
                    CommitFailureCode.PERSISTENCE_FAILED,
                    "Visual Common controlled persistence failure",
                    null);
        }
    }

    @Override
    public void destroy() {
        if (state.get() != State.TRIGGERED) {
            throw setupFailure("Visual Common fault hook was not triggered exactly once.");
        }
    }

    private boolean matches(VisualCommonCommitFaultContext context) {
        return PROJECT_ID.equals(context.projectId())
                && MODEL_ID.equals(context.modelId())
                && BASE_REVISION_ID.equals(context.baseRevisionId())
                && context.candidateRevisionId() != null
                && !context.candidateRevisionId().isBlank()
                && !BASE_REVISION_ID.equals(context.candidateRevisionId())
                && context.candidateRevisionSequence() == 2;
    }

    private GoldenFixtureMaterializationException setupFailure(String message) {
        return new GoldenFixtureMaterializationException("GOLDEN_COMMON_UI_SETUP_FAILED", message);
    }
}
