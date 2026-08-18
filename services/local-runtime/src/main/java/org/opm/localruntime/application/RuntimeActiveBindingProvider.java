package org.opm.localruntime.application;

import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.semantic.SemanticRevision;

/** Runtime 与 release authoring 共用的活动五角色 binding 唯一来源。 */
public final class RuntimeActiveBindingProvider {

    public static final String PROFILE_ID = "profile.iso19450.2024.draft";
    public static final String PROFILE_VERSION = "0.2.0";
    public static final String PROFILE_DIGEST = "5287d3ceb77c4c664b88c6e34a3a5d1c34f85c36037ab2f587705f9d607f899c";
    public static final String RULE_ID = "rules.iso19450.2024.draft";
    public static final String RULE_VERSION = "0.1.0";
    public static final String RULE_DIGEST = "4293cb22cf2e2e92fe212ed3c31119992509c8a675daa554c64a2ccf10457d64";
    public static final String GRAMMAR_ID = "grammar.opl.iso19450.2024.draft";
    public static final String GRAMMAR_VERSION = "0.2.0";
    public static final String GRAMMAR_DIGEST = "c88e672bd9db7f0405a7ef3fc464043f15cae844931192e3412c94ce05339e7d";
    public static final String SYMBOL_ID = "symbols.iso19450.2024.draft";
    public static final String SYMBOL_VERSION = "0.1.0";
    public static final String SYMBOL_DIGEST = "511dbaec2adb6f49ed6a4d28844e69d1310eb7a67f213e4a30b0ddfc21ef6098";
    public static final String NORMALIZATION_ID = "normalization.iso19450.2024.draft";
    public static final String NORMALIZATION_VERSION = "0.1.0";
    public static final String NORMALIZATION_DIGEST = "6401336ad4b63127047ccd5d50cc418554f0c8490547a6024939b4da5774194c";

    private RuntimeActiveBindingProvider() {
    }

    public static SemanticRevision.ProfileBinding current() {
        SemanticRevision.ProfileBinding draft = new SemanticRevision.ProfileBinding(
                asset(PROFILE_ID, PROFILE_VERSION, PROFILE_DIGEST),
                asset(RULE_ID, RULE_VERSION, RULE_DIGEST),
                asset(GRAMMAR_ID, GRAMMAR_VERSION, GRAMMAR_DIGEST),
                asset(SYMBOL_ID, SYMBOL_VERSION, SYMBOL_DIGEST),
                asset(NORMALIZATION_ID, NORMALIZATION_VERSION, NORMALIZATION_DIGEST),
                "pending");
        return new SemanticRevision.ProfileBinding(draft.profile(), draft.ruleSet(), draft.textGrammar(), draft.symbolCatalog(),
                draft.normalizationAdapter(), ProfilePackageAssembler.bindingDigest(draft));
    }

    private static SemanticRevision.AssetReference asset(String id, String version, String sha256) {
        return new SemanticRevision.AssetReference(id, version, sha256);
    }
}
