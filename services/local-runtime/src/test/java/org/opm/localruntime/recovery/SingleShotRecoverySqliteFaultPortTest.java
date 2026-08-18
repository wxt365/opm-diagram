package org.opm.localruntime.recovery;

import org.junit.jupiter.api.Test;
import org.opm.localruntime.storage.RecoveryFaultContext;
import org.opm.localruntime.storage.RecoverySqliteStage;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SingleShotRecoverySqliteFaultPortTest {

    @Test
    void triggersTheConfiguredStageOnceOnly() throws Exception {
        RecoveryFaultContext context = context();
        SingleShotRecoverySqliteFaultPort port = new SingleShotRecoverySqliteFaultPort(
                RecoverySqliteStage.AFTER_PARENT_INSERT, context);

        assertDoesNotThrow(() -> port.reach(RecoverySqliteStage.AFTER_REVISION_INSERT, context));
        assertThrows(IOException.class, () -> port.reach(RecoverySqliteStage.AFTER_PARENT_INSERT, context));
        assertThrows(IllegalStateException.class, () -> port.reach(RecoverySqliteStage.AFTER_PARENT_INSERT, context));
        assertDoesNotThrow(port::assertReachedExactlyOnce);
    }

    @Test
    void rejectsAnAttemptContextThatDoesNotMatchTheConfiguredFault() {
        SingleShotRecoverySqliteFaultPort port = new SingleShotRecoverySqliteFaultPort(
                RecoverySqliteStage.AFTER_RECEIPT_INSERT, context());

        assertThrows(IllegalStateException.class, () -> port.reach(RecoverySqliteStage.AFTER_RECEIPT_INSERT,
                new RecoveryFaultContext("project.other", "model.demo", "revision.demo.0002", "command.demo")));
    }

    private RecoveryFaultContext context() {
        return new RecoveryFaultContext("project.demo", "model.demo", "revision.demo.0002", "command.demo");
    }
}
