package org.opm.localruntime.storage;

import java.io.IOException;

@FunctionalInterface
public interface RecoverySqliteFaultPort {

    RecoverySqliteFaultPort NOOP = (stage, context) -> { };

    void reach(RecoverySqliteStage stage, RecoveryFaultContext context) throws IOException;
}
