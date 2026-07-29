package org.opm.localruntime.api;

import java.util.Objects;

public final class ApiException extends RuntimeException {

    private final ApiErrorCode code;
    private final int status;
    private final boolean retryable;

    public ApiException(ApiErrorCode code, int status, boolean retryable, String message) {
        super(message);
        this.code = Objects.requireNonNull(code, "code must not be null");
        this.status = status;
        this.retryable = retryable;
    }

    public ApiErrorCode code() { return code; }

    public int status() { return status; }

    public boolean retryable() { return retryable; }
}
