package org.opm.localruntime.semantic;

public final class SemanticReadException extends RuntimeException {

    public SemanticReadException(String message) {
        super(message);
    }

    public SemanticReadException(String message, Throwable cause) {
        super(message, cause);
    }
}
