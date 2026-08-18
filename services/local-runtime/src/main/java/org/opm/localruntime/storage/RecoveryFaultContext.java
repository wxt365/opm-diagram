package org.opm.localruntime.storage;

import java.util.Objects;

public record RecoveryFaultContext(String projectId, String modelId, String revisionId, String commandId) {

    public RecoveryFaultContext {
        projectId = required(projectId, "projectId");
        modelId = required(modelId, "modelId");
        revisionId = required(revisionId, "revisionId");
        commandId = required(commandId, "commandId");
    }

    private static String required(String value, String name) {
        Objects.requireNonNull(value, name + " must not be null");
        if (value.isBlank()) throw new IllegalArgumentException(name + " must not be blank");
        return value;
    }
}
