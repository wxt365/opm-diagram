package org.opm.localruntime.assets;

import java.util.Objects;

public record AssetReference(String id, String version, String sha256) {

    public AssetReference {
        Objects.requireNonNull(id, "id must not be null");
        Objects.requireNonNull(version, "version must not be null");
        Objects.requireNonNull(sha256, "sha256 must not be null");
    }
}
