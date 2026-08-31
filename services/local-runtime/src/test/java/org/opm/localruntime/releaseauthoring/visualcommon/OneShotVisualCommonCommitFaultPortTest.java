package org.opm.localruntime.releaseauthoring.visualcommon;

import org.junit.jupiter.api.Test;
import org.opm.localruntime.command.CommitFailureCode;
import org.opm.localruntime.command.CommitPersistenceException;
import org.opm.localruntime.releaseauthoring.GoldenFixtureMaterializationException;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class OneShotVisualCommonCommitFaultPortTest {

    @Test
    void triggersOnlyTheFirstExactControlledContext() {
        OneShotVisualCommonCommitFaultPort port = new OneShotVisualCommonCommitFaultPort();
        assertDoesNotThrow(() -> port.beforeRevisionInsert(context("command.other")));
        CommitPersistenceException failure = assertThrows(CommitPersistenceException.class,
                () -> port.beforeRevisionInsert(context("command.visual.blocked-feedback.persistence-failed")));
        assertEquals(CommitFailureCode.PERSISTENCE_FAILED, failure.code());
        assertDoesNotThrow(() -> port.beforeRevisionInsert(context("command.visual.blocked-feedback.persistence-failed")));
        assertDoesNotThrow(port::destroy);
    }

    @Test
    void rejectsDriftForTheControlledCommandAndMissingTriggerAtShutdown() {
        OneShotVisualCommonCommitFaultPort drifted = new OneShotVisualCommonCommitFaultPort();
        GoldenFixtureMaterializationException drift = assertThrows(GoldenFixtureMaterializationException.class,
                () -> drifted.beforeRevisionInsert(new VisualCommonCommitFaultContext(
                        "command.visual.blocked-feedback.persistence-failed", "project.other", "model.visual.blocked-feedback",
                        "revision.visual.blocked-feedback", "revision.visual.blocked-feedback.2", 2)));
        assertEquals("GOLDEN_COMMON_UI_SETUP_FAILED", drift.code());

        OneShotVisualCommonCommitFaultPort neverTriggered = new OneShotVisualCommonCommitFaultPort();
        assertEquals("GOLDEN_COMMON_UI_SETUP_FAILED", assertThrows(GoldenFixtureMaterializationException.class,
                neverTriggered::destroy).code());
    }

    private VisualCommonCommitFaultContext context(String commandId) {
        return new VisualCommonCommitFaultContext(commandId, "project.visual.blocked-feedback", "model.visual.blocked-feedback",
                "revision.visual.blocked-feedback", "revision.visual.blocked-feedback.2", 2);
    }
}
