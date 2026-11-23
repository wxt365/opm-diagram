package org.opm.localruntime.storage;

import java.io.IOException;

@FunctionalInterface
public interface RecoveryPersistenceFaultPort {

    RecoveryPersistenceFaultPort NOOP = (stage, context) -> { };

    void reach(RecoveryPersistenceStage stage, RecoveryFaultContext context) throws IOException;
}
