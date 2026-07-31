package org.opm.localruntime.compatibility;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RevisionCompatibilityRunnerTest {

    @Test
    void recordsTwoDeterministicAttemptsAndDoesNotTreatUnimplementedModesAsMatched() throws Exception {
        Path manifest = repositoryFile("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/compatibility/opm-revision-compatibility-manifest.json");
        RevisionCompatibilityReportWriter.Report report = new RevisionCompatibilityRunner().run(manifest, Files.createTempDirectory("opm-compatibility-"));

        assertEquals(13, report.cases().size());
        assertEquals(6, report.cases().stream().filter(item -> item.status() == RevisionCompatibilityReportWriter.Status.PASS_MATCHED).count());
        assertEquals(7, report.cases().stream().filter(item -> item.status() == RevisionCompatibilityReportWriter.Status.BLOCKED_MATCHED).count());
        assertEquals(0, report.cases().stream().filter(item -> item.status() == RevisionCompatibilityReportWriter.Status.FAILED).count());
        report.cases().forEach(item -> assertEquals(2, item.attempts().size()));
        assertEquals(RevisionCompatibilityReportWriter.Status.PASS_MATCHED, report.cases().stream()
                .filter(item -> item.caseId().equals("COMPAT-005.V01_TO_V02_SAME_BINDING.PASS"))
                .findFirst()
                .orElseThrow()
                .status());
        assertEquals(RevisionCompatibilityReportWriter.Status.PASS_MATCHED, report.cases().stream()
                .filter(item -> item.caseId().equals("COMPAT-006.V02_ROUNDTRIP_REPLAY.PASS"))
                .findFirst()
                .orElseThrow()
                .status());
        RevisionCompatibilityReportWriter.Attempt migrated = report.cases().stream()
                .filter(item -> item.caseId().equals("COMPAT-005.V01_TO_V02_SAME_BINDING.PASS"))
                .findFirst().orElseThrow().attempts().getFirst();
        assertEquals(new RevisionCompatibilityReportWriter.Transaction(1, 1, 1, 2, 0, 1, 1, true), migrated.transaction());
        assertEquals("revision.base.golden.struct.003", migrated.headBefore());
        assertEquals("revision.compatibility.005.0002", migrated.headAfter());
    }

    private Path repositoryFile(String relativePath) {
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            Path candidate = current.resolve(relativePath);
            if (Files.isRegularFile(candidate)) return candidate;
            current = current.getParent();
        }
        throw new IllegalStateException("Repository file is not available: " + relativePath);
    }
}
