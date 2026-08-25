package org.opm.localruntime.releaseevidence.fault;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.command.CommitPersistenceException;

import java.nio.file.Path;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AttemptLocalE2EFaultPortTest {
    @TempDir Path temporaryDirectory;

    @Test
    void injectsPersistenceFailureExactlyOnce() throws Exception {
        E2EFaultPlan plan = new E2EFaultPlan("OPM-DEV-CANVAS-06-E2E-FAULT-PLAN-001", "0.2", "E2E-CANVAS-007.PERSISTENCE_FAILED", 1,
                E2EFaultPlan.FaultKind.PERSISTENCE_FAILED, E2EFaultPlan.Target.SQLITE_BEFORE_REVISION_INSERT, 1, "1".repeat(64), "2".repeat(64), "3".repeat(64));
        Path planPath = temporaryDirectory.resolve("fault-plan.json");
        byte[] raw = "x\n".getBytes(java.nio.charset.StandardCharsets.UTF_8); Files.write(planPath, raw);
        var attributes = Files.readAttributes(planPath, java.nio.file.attribute.BasicFileAttributes.class, java.nio.file.LinkOption.NOFOLLOW_LINKS);
        E2EFaultPlanVerifier.VerifiedPlan verified = new E2EFaultPlanVerifier.VerifiedPlan(plan, planPath,
                java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(raw)),
                new E2EFaultPlanVerifier.FileStamp(attributes.fileKey(), attributes.size(), attributes.lastModifiedTime().toMillis()));
        AtomicInteger exits = new AtomicInteger();
        AttemptLocalE2EFaultPort port = new AttemptLocalE2EFaultPort(verified, exits::set);
        E2EFaultContext.Active context = new E2EFaultContext.Active(plan.caseId(), 1, "project.001", "model.001", "revision.001", "revision.002",
                "command.e2e.e2e-canvas-007-persistence-failed.attempt-1.action-001", "profile.001", "0.2", "5".repeat(64));
        assertThrows(CommitPersistenceException.class, () -> port.beforeRevisionInsert(context));
        E2EFaultLauncherException exception = assertThrows(E2EFaultLauncherException.class, () -> port.beforeRevisionInsert(context));
        assertEquals(E2EFaultLauncherErrorCode.E2E_FAULT_ALREADY_TRIGGERED, exception.code());
        assertEquals(3, exits.get());
    }
}
