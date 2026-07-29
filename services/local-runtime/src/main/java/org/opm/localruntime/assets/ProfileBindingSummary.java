package org.opm.localruntime.assets;

import java.util.Objects;

public record ProfileBindingSummary(
        AssetReference profile,
        AssetReference ruleSet,
        AssetReference symbolCatalog,
        AssetReference grammar,
        AssetReference normalization) {

    public ProfileBindingSummary {
        Objects.requireNonNull(profile, "profile must not be null");
        Objects.requireNonNull(ruleSet, "ruleSet must not be null");
        Objects.requireNonNull(symbolCatalog, "symbolCatalog must not be null");
        Objects.requireNonNull(grammar, "grammar must not be null");
        Objects.requireNonNull(normalization, "normalization must not be null");
    }
}
