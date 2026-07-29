package org.opm.localruntime.storage;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;
import java.util.Objects;

@ConfigurationProperties(prefix = "opm.storage")
public record StorageProperties(Path root) {

    public StorageProperties {
        Objects.requireNonNull(root, "root must not be null");
    }
}
