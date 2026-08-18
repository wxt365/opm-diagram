package org.opm.localruntime.recovery;

import org.opm.localruntime.storage.RecoveryFaultContext;
import org.opm.localruntime.storage.RecoverySqliteFaultPort;
import org.opm.localruntime.storage.RecoverySqliteStage;

import java.io.IOException;
import java.util.Objects;

public final class SingleShotRecoverySqliteFaultPort implements RecoverySqliteFaultPort {

    private final RecoverySqliteStage expectedStage;
    private final RecoveryFaultContext expectedContext;
    private int reachCount;

    public SingleShotRecoverySqliteFaultPort(RecoverySqliteStage expectedStage, RecoveryFaultContext expectedContext) {
        this.expectedStage = Objects.requireNonNull(expectedStage, "expectedStage must not be null");
        this.expectedContext = Objects.requireNonNull(expectedContext, "expectedContext must not be null");
    }

    @Override
    public void reach(RecoverySqliteStage stage, RecoveryFaultContext context) throws IOException {
        if (stage != expectedStage) return;
        if (!expectedContext.equals(context)) throw new IllegalStateException("Recovery fault context does not match the attempt");
        if (reachCount != 0) throw new IllegalStateException("Recovery SQLite fault reached more than once");
        reachCount++;
        throw new IOException("Injected recovery SQLite fault at " + stage);
    }

    public void assertReachedExactlyOnce() {
        if (reachCount != 1) throw new AssertionError("Recovery SQLite fault was not reached exactly once");
    }
}
