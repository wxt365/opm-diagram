package org.opm.localruntime.command;

import java.util.Objects;

public record CommitFinding(String findingId, String ruleId, String ruleVersion, Severity severity, String locatorId, String message) {

    public CommitFinding {
        requireNonBlank(findingId, "findingId");
        requireNonBlank(ruleId, "ruleId");
        requireNonBlank(ruleVersion, "ruleVersion");
        severity = Objects.requireNonNull(severity, "severity must not be null");
        requireNonBlank(locatorId, "locatorId");
        requireNonBlank(message, "message");
    }

    public enum Severity { BLOCKING, WARNING, SUGGESTION }

    private static void requireNonBlank(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " must not be blank");
    }
}
