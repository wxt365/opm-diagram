package org.opm.localruntime.storage;

public final class StorageAccessException extends RuntimeException {

    public StorageAccessException(String message) {
        super(message);
    }

    public StorageAccessException(String message, Throwable cause) {
        super(message, cause);
    }
}
