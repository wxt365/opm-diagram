package org.opm.localruntime.releaseevidence.fault;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class E2EFaultLauncherArgumentsTest {
    @Test
    void acceptsOnlyTheCompleteFaultTupleAndLeavesNormalStartUnarmed() {
        assertFalse(E2EFaultLauncherArguments.scanRaw(new String[] {"--server.port=8080"}).isPresent());
        assertTrue(E2EFaultLauncherArguments.scanRaw(complete()).isPresent());
    }

    @Test
    void rejectsPartialDuplicateAndUnknownFaultInputsBeforeSpring() {
        assertThrows(E2EFaultLauncherException.class, () -> E2EFaultLauncherArguments.scanRaw(new String[] {"--spring.profiles.active=release-e2e-fault"}));
        assertThrows(E2EFaultLauncherException.class, () -> E2EFaultLauncherArguments.scanRaw(new String[] {"--opm.release.e2e.unknown=true"}));
        String[] duplicate = java.util.Arrays.copyOf(complete(), complete().length + 1);
        duplicate[duplicate.length - 1] = "--opm.release.e2e.enabled=true";
        assertThrows(E2EFaultLauncherException.class, () -> E2EFaultLauncherArguments.scanRaw(duplicate));
    }

    private static String[] complete() {
        return new String[] {"--spring.profiles.active=release-e2e-fault", "--opm.release.e2e.enabled=true", "--opm.release.e2e.guard=RELEASE_E2E_FAULT_ONLY",
                "--opm.release.e2e.plan=/tmp/fault-plan.json", "--opm.release.e2e.plan-raw-sha256=" + "a".repeat(64),
                "--opm.release.e2e.case-id=E2E-CANVAS-007.ASSET_MISSING", "--opm.release.e2e.attempt-ordinal=1",
                "--opm.release.e2e.parent-nonce=" + "b".repeat(64), "--opm.release.e2e.challenge=/tmp/challenge",
                "--opm.release.e2e.challenge-response=" + "c".repeat(64)};
    }
}
