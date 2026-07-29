package org.opm.localruntime.command;

import java.util.List;
import java.util.Objects;

public sealed interface CommitResult permits CommitResult.Committed, CommitResult.Replayed, CommitResult.Rejected {

    record Committed(String committedRevisionId, List<String> traceIds, CommitValidationSummary validation) implements CommitResult {
        public Committed {
            requireNonBlank(committedRevisionId, "committedRevisionId");
            traceIds = List.copyOf(Objects.requireNonNull(traceIds, "traceIds must not be null"));
            validation = Objects.requireNonNull(validation, "validation must not be null");
        }
    }

    record Replayed(String committedRevisionId) implements CommitResult {
        public Replayed { requireNonBlank(committedRevisionId, "committedRevisionId"); }
    }

    record Rejected(CommitFailureCode code, List<CommitFinding> findings, String message) implements CommitResult {
        public Rejected {
            code = Objects.requireNonNull(code, "code must not be null");
            findings = List.copyOf(Objects.requireNonNull(findings, "findings must not be null"));
            requireNonBlank(message, "message");
        }
    }

    private static void requireNonBlank(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " must not be blank");
    }
}
