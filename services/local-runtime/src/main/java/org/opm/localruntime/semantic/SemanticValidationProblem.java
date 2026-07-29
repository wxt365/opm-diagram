package org.opm.localruntime.semantic;

import java.util.Objects;

public record SemanticValidationProblem(SemanticValidationCode code, String locatorId, String message) {

    public SemanticValidationProblem {
        Objects.requireNonNull(code, "code must not be null");
        Objects.requireNonNull(locatorId, "locatorId must not be null");
        Objects.requireNonNull(message, "message must not be null");
    }
}
