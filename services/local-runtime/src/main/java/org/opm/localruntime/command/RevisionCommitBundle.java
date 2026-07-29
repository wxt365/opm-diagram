package org.opm.localruntime.command;

import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.text.OplGenerationResult;

import java.util.Objects;

public record RevisionCommitBundle(CandidateRevisionCommand command, SemanticRevision revision,
                                   OplGenerationResult text, CommitValidationSummary validation) {
    public RevisionCommitBundle {
        command = Objects.requireNonNull(command, "command must not be null");
        revision = Objects.requireNonNull(revision, "revision must not be null");
        text = Objects.requireNonNull(text, "text must not be null");
        validation = Objects.requireNonNull(validation, "validation must not be null");
    }
}
