package org.opm.localruntime.command;

import org.opm.localruntime.semantic.SemanticRevision;

public record ProfileRuleBinding(String profileId, String profileVersion, String ruleSetId, String ruleSetVersion) {

    public ProfileRuleBinding {
        requireNonBlank(profileId, "profileId");
        requireNonBlank(profileVersion, "profileVersion");
        requireNonBlank(ruleSetId, "ruleSetId");
        requireNonBlank(ruleSetVersion, "ruleSetVersion");
    }

    public boolean matches(SemanticRevision revision) {
        SemanticRevision.ProfileBinding binding = revision.profileBinding();
        return profileId.equals(binding.profile().id())
                && profileVersion.equals(binding.profile().version())
                && ruleSetId.equals(binding.ruleSet().id())
                && ruleSetVersion.equals(binding.ruleSet().version());
    }

    private static void requireNonBlank(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " must not be blank");
    }
}
