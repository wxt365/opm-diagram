package org.opm.localruntime.assets;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;
import java.util.Objects;

@ConfigurationProperties(prefix = "opm.assets")
public record AssetProperties(Path root) {

    public AssetProperties {
        Objects.requireNonNull(root, "root must not be null");
    }
}
