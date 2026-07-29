package org.opm.localruntime.command;

import java.util.Objects;

public final class CommitPersistenceException extends RuntimeException {

    private final CommitFailureCode code;

    public CommitPersistenceException(CommitFailureCode code, String message, Throwable cause) {
        super(message, cause);
        this.code = Objects.requireNonNull(code, "code must not be null");
    }

    public CommitFailureCode code() {
        return code;
    }
}
