package org.opm.localruntime.text;

import org.opm.localruntime.assets.NormalizationAssetLoader;
import org.opm.localruntime.assets.OplSymbolCatalogAssetLoader;
import org.opm.localruntime.assets.ProfilePackageDescriptor;
import org.opm.localruntime.assets.RuleSetAssetLoader;
import org.opm.localruntime.semantic.SemanticRevision;

import java.util.Map;
import java.util.Objects;

/** 一次 Revision 提交中使用的不可变文本资产集合。 */
public record TextGenerationAssets(
        SemanticRevision.ProfileBinding binding,
        OplGrammar grammar,
        RuleSetAssetLoader.RuleSet ruleSet,
        OplSymbolCatalogAssetLoader.Catalog symbolCatalog,
        NormalizationAssetLoader.Policy normalizationPolicy,
        Map<String, ProfilePackageDescriptor.CapabilityBinding> capabilities) {

    public TextGenerationAssets {
        binding = Objects.requireNonNull(binding, "binding must not be null");
        grammar = Objects.requireNonNull(grammar, "grammar must not be null");
        ruleSet = Objects.requireNonNull(ruleSet, "ruleSet must not be null");
        symbolCatalog = Objects.requireNonNull(symbolCatalog, "symbolCatalog must not be null");
        normalizationPolicy = Objects.requireNonNull(normalizationPolicy, "normalizationPolicy must not be null");
        capabilities = Map.copyOf(Objects.requireNonNull(capabilities, "capabilities must not be null"));
        if (!grammar.matches(binding.textGrammar())) throw new IllegalArgumentException("Grammar must match text grammar binding");
    }

    public String bindingDigest() {
        return binding.bindingDigest();
    }

    public ProfilePackageDescriptor.CapabilityBinding capability(String capabilityId) {
        ProfilePackageDescriptor.CapabilityBinding capability = capabilities.get(capabilityId);
        if (capability == null) throw new IllegalArgumentException("Profile does not bind capability " + capabilityId);
        return capability;
    }
}
