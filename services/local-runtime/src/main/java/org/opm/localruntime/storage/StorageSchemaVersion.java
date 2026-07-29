package org.opm.localruntime.storage;

import java.util.Objects;

public record StorageSchemaVersion(String value) {

    public StorageSchemaVersion {
        Objects.requireNonNull(value, "value must not be null");
        if (value.isBlank()) {
            throw new IllegalArgumentException("value must not be blank");
        }
    }
}
