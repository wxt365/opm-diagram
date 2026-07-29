package org.opm.localruntime.command;

import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.text.OplGrammar;

import java.time.Instant;
import java.util.Objects;

public record CandidateRevisionCommand(
        String projectId,
        String modelId,
        String commandId,
        String baseRevisionId,
        SemanticRevision baseRevision,
        SemanticRevision candidateRevision,
        ProfileRuleBinding expectedBinding,
        OplGrammar grammar,
        String requestDigest,
        String commitReason,
        Instant occurredAt) {

    public CandidateRevisionCommand {
        requireNonBlank(projectId, "projectId");
        requireNonBlank(modelId, "modelId");
        requireNonBlank(commandId, "commandId");
        requireNonBlank(baseRevisionId, "baseRevisionId");
        baseRevision = Objects.requireNonNull(baseRevision, "baseRevision must not be null");
        candidateRevision = Objects.requireNonNull(candidateRevision, "candidateRevision must not be null");
        expectedBinding = Objects.requireNonNull(expectedBinding, "expectedBinding must not be null");
        grammar = Objects.requireNonNull(grammar, "grammar must not be null");
        requireNonBlank(requestDigest, "requestDigest");
        requireNonBlank(commitReason, "commitReason");
        occurredAt = Objects.requireNonNull(occurredAt, "occurredAt must not be null");
    }

    private static void requireNonBlank(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " must not be blank");
    }
}
