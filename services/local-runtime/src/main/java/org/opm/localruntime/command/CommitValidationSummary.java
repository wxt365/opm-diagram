package org.opm.localruntime.command;

import java.util.List;
import java.util.Objects;

public record CommitValidationSummary(List<CommitFinding> findings) {

    public CommitValidationSummary {
        findings = List.copyOf(Objects.requireNonNull(findings, "findings must not be null"));
    }

    public boolean hasBlockingFindings() {
        return findings.stream().anyMatch(finding -> finding.severity() == CommitFinding.Severity.BLOCKING);
    }
}
