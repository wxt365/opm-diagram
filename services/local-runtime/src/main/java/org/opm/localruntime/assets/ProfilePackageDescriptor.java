package org.opm.localruntime.assets;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Profile manifest 通过校验后可供装配器使用的只读描述。 */
public record ProfilePackageDescriptor(
        ProfileBindingSummary binding,
        List<RequiredAsset> requiredAssets,
        List<CapabilityBinding> capabilities) {

    public ProfilePackageDescriptor {
        binding = Objects.requireNonNull(binding, "binding must not be null");
        requiredAssets = List.copyOf(Objects.requireNonNull(requiredAssets, "requiredAssets must not be null"));
        capabilities = List.copyOf(Objects.requireNonNull(capabilities, "capabilities must not be null"));
        unique(requiredAssets, RequiredAsset::role, "required asset role");
        unique(capabilities, CapabilityBinding::capabilityId, "capability id");
    }

    public RequiredAsset requiredAsset(String role) {
        return requiredAssets.stream().filter(asset -> asset.role().equals(role)).findFirst()
                .orElseThrow(() -> new AssetLoadException("Missing required asset " + role));
    }

    public Map<String, CapabilityBinding> capabilityIndex() {
        return capabilities.stream().collect(Collectors.toUnmodifiableMap(CapabilityBinding::capabilityId, Function.identity()));
    }

    private static <T> void unique(List<T> values, Function<T, String> key, String name) {
        if (values.stream().map(key).collect(Collectors.toSet()).size() != values.size()) {
            throw new AssetLoadException("Duplicate " + name);
        }
    }

    public record RequiredAsset(String role, Path path, AssetReference reference) {
        public RequiredAsset {
            if (role == null || role.isBlank()) throw new IllegalArgumentException("role must not be blank");
            path = Objects.requireNonNull(path, "path must not be null");
            reference = Objects.requireNonNull(reference, "reference must not be null");
        }
    }

    public record CapabilityBinding(String capabilityId, String ruleRef, String symbolRef, String templateRef) {
        public CapabilityBinding {
            require(capabilityId, "capabilityId");
            require(ruleRef, "ruleRef");
            require(symbolRef, "symbolRef");
            require(templateRef, "templateRef");
        }

        private static void require(String value, String name) {
            if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " must not be blank");
        }
    }
}
