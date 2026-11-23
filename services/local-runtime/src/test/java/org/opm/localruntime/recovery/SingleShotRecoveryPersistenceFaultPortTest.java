package org.opm.localruntime.recovery;

import org.junit.jupiter.api.Test;
import org.opm.localruntime.storage.RecoveryFaultContext;
import org.opm.localruntime.storage.RecoveryPersistenceStage;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SingleShotRecoveryPersistenceFaultPortTest {

    @Test
    void triggersTheConfiguredStageOnceOnly() throws Exception {
        RecoveryFaultContext context = context();
        SingleShotRecoveryPersistenceFaultPort port = new SingleShotRecoveryPersistenceFaultPort(
                RecoveryPersistenceStage.AFTER_PARENT_INSERT, context);

        assertDoesNotThrow(() -> port.reach(RecoveryPersistenceStage.AFTER_REVISION_INSERT, context));
        assertThrows(IOException.class, () -> port.reach(RecoveryPersistenceStage.AFTER_PARENT_INSERT, context));
        assertThrows(IllegalStateException.class, () -> port.reach(RecoveryPersistenceStage.AFTER_PARENT_INSERT, context));
        assertDoesNotThrow(port::assertReachedExactlyOnce);
    }

    @Test
    void rejectsAnAttemptContextThatDoesNotMatchTheConfiguredFault() {
        SingleShotRecoveryPersistenceFaultPort port = new SingleShotRecoveryPersistenceFaultPort(
                RecoveryPersistenceStage.AFTER_RECEIPT_INSERT, context());

        assertThrows(IllegalStateException.class, () -> port.reach(RecoveryPersistenceStage.AFTER_RECEIPT_INSERT,
                new RecoveryFaultContext("project.other", "model.demo", "revision.demo.0002", "command.demo")));
    }

    private RecoveryFaultContext context() {
        return new RecoveryFaultContext("project.demo", "model.demo", "revision.demo.0002", "command.demo");
    }
}
