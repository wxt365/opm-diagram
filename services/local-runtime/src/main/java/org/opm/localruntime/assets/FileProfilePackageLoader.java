package org.opm.localruntime.assets;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

public final class FileProfilePackageLoader {

    private final Path assetRoot;
    private final ObjectMapper objectMapper;

    public FileProfilePackageLoader(Path assetRoot) {
        this(assetRoot, new ObjectMapper());
    }

    FileProfilePackageLoader(Path assetRoot, ObjectMapper objectMapper) {
        this.assetRoot = resolveAssetRoot(Objects.requireNonNull(assetRoot, "assetRoot must not be null"));
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
    }

    private Path resolveAssetRoot(Path configuredRoot) {
        Path resolved = configuredRoot.toAbsolutePath().normalize();
        if (configuredRoot.isAbsolute() || Files.isDirectory(resolved)) return resolved;
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            Path candidate = current.resolve(configuredRoot).normalize();
            if (Files.isDirectory(candidate)) return candidate;
            current = current.getParent();
        }
        return resolved;
    }

    public ProfileBindingSummary load(String profileId, String packageVersion, String expectedPackageDigest) {
        return loadPackage(profileId, packageVersion, expectedPackageDigest).binding();
    }

    /**
     * 加载经 manifest 验证的 Profile 包描述，供正式语义资产装配使用。
     */
    public ProfilePackageDescriptor loadPackage(String profileId, String packageVersion, String expectedPackageDigest) {
        validatePathSegment(profileId, "profile id");
        validatePathSegment(packageVersion, "package version");
        requireSha256(expectedPackageDigest, "expected package digest");

        Path packageDirectory = assetRoot.resolve(profileId).resolve(packageVersion).normalize();
        if (!packageDirectory.startsWith(assetRoot)) {
            throw new AssetLoadException("Profile package path escapes the configured asset root");
        }

        JsonNode profile = readJson(packageDirectory.resolve("profile.json"));
        JsonNode identity = requiredObject(profile, "identity", "profile");
        String actualProfileId = requiredText(identity, "profile_id", "profile identity");
        String actualPackageVersion = requiredText(identity, "package_version", "profile identity");
        if (!profileId.equals(actualProfileId) || !packageVersion.equals(actualPackageVersion)) {
            throw new AssetLoadException("Profile identity does not match the requested id and version");
        }

        JsonNode manifest = requiredObject(profile, "manifest", "profile");
        List<ManifestEntry> entries = readManifestEntries(manifest);
        Map<String, ManifestEntry> requiredEntries = entries.stream()
                .filter(ManifestEntry::required)
                .collect(Collectors.toMap(ManifestEntry::role, Function.identity(), (left, right) -> {
                    throw new AssetLoadException("Duplicate required manifest role: " + left.role());
                }));

        List<Dependency> dependencies = readDependencies(profile);
        Map<String, Dependency> requiredDependencies = dependencies.stream()
                .filter(Dependency::required)
                .collect(Collectors.toMap(Dependency::role, Function.identity(), (left, right) -> {
                    throw new AssetLoadException("Duplicate required profile dependency");
                }));
        AssetReference ruleReference = requiredDependency(requiredDependencies, "RULE_SET").reference();
        AssetReference symbolReference = readAssetReference(requiredObject(profile, "symbol_catalog_ref", "profile"));
        AssetReference grammarReference = readAssetReference(requiredObject(profile, "text_grammar_ref", "profile"));
        AssetReference normalizationReference = readAssetReference(requiredObject(profile, "normalization_adapter_ref", "profile"));

        verifyEntry(packageDirectory, requiredEntries, "RULE_SET", ruleReference, "rule_set_id", "rule_set_version");
        verifyEntry(packageDirectory, requiredEntries, "SYMBOL_ASSET", symbolReference, "asset_id", "asset_version");
        verifyEntry(packageDirectory, requiredEntries, "GRAMMAR_ASSET", grammarReference, "asset_id", "asset_version");
        verifyEntry(packageDirectory, requiredEntries, "NORMALIZATION_DATA", normalizationReference, "asset_id", "asset_version");

        String declaredPackageDigest = readDigest(requiredObject(manifest, "package_digest", "manifest"));
        String calculatedPackageDigest = calculatePackageDigest(entries);
        if (!declaredPackageDigest.equals(calculatedPackageDigest)) {
            throw new AssetLoadException("Profile package digest does not match its manifest entries");
        }
        if (!expectedPackageDigest.equals(calculatedPackageDigest)) {
            throw new AssetLoadException("Requested profile package digest does not match the installed package");
        }

        ProfileBindingSummary binding = new ProfileBindingSummary(
                new AssetReference(profileId, packageVersion, calculatedPackageDigest),
                ruleReference,
                symbolReference,
                grammarReference,
                normalizationReference);
        Map<String, AssetReference> references = Map.of(
                "RULE_SET", ruleReference,
                "SYMBOL_ASSET", symbolReference,
                "GRAMMAR_ASSET", grammarReference,
                "NORMALIZATION_DATA", normalizationReference);
        List<ProfilePackageDescriptor.RequiredAsset> requiredAssets = requiredDependencies.values().stream()
                .sorted(Comparator.comparingInt(Dependency::loadOrder))
                .map(dependency -> requiredAsset(packageDirectory, requiredEntries, dependency, references))
                .toList();
        return new ProfilePackageDescriptor(binding, requiredAssets, readCapabilities(profile));
    }

    private ProfilePackageDescriptor.RequiredAsset requiredAsset(
            Path packageDirectory,
            Map<String, ManifestEntry> entries,
            Dependency dependency,
            Map<String, AssetReference> references) {
        AssetReference expected = references.get(dependency.role());
        if (expected == null || !expected.equals(dependency.reference())) {
            throw new AssetLoadException("Profile dependency reference differs for " + dependency.role());
        }
        ManifestEntry entry = entries.get(dependency.role());
        if (entry == null) {
            throw new AssetLoadException("Missing required manifest entry for " + dependency.role());
        }
        return new ProfilePackageDescriptor.RequiredAsset(dependency.role(), resolveLogicalPath(packageDirectory, entry.logicalPath()), expected);
    }

    private void verifyEntry(
            Path packageDirectory,
            Map<String, ManifestEntry> requiredEntries,
            String role,
            AssetReference reference,
            String idField,
            String versionField) {
        ManifestEntry entry = requiredEntries.get(role);
        if (entry == null) {
            throw new AssetLoadException("Missing required manifest entry for " + role);
        }
        if (!entry.sha256().equals(reference.sha256())) {
            throw new AssetLoadException("Manifest digest and profile reference differ for " + role);
        }

        Path assetPath = resolveLogicalPath(packageDirectory, entry.logicalPath());
        byte[] bytes = readBytes(assetPath);
        if (bytes.length != entry.byteLength()) {
            throw new AssetLoadException("Manifest byte length does not match " + entry.logicalPath());
        }
        String actualDigest = sha256(bytes);
        if (!actualDigest.equals(entry.sha256())) {
            throw new AssetLoadException("Manifest digest does not match " + entry.logicalPath());
        }

        JsonNode asset = readJson(bytes, entry.logicalPath());
        String actualId = requiredText(asset, idField, entry.logicalPath());
        String actualVersion = requiredText(asset, versionField, entry.logicalPath());
        if (!reference.id().equals(actualId) || !reference.version().equals(actualVersion)) {
            throw new AssetLoadException("Asset identity does not match the profile reference for " + role);
        }
    }

    private List<Dependency> readDependencies(JsonNode profile) {
        JsonNode dependencies = profile.path("dependencies");
        if (!dependencies.isArray()) {
            throw new AssetLoadException("Profile dependencies must be an array");
        }
        List<Dependency> result = new ArrayList<>();
        for (JsonNode dependency : dependencies) {
            int loadOrder = dependency.path("load_order").asInt(-1);
            if (loadOrder < 0) throw new AssetLoadException("Profile dependency load_order must be non-negative");
            result.add(new Dependency(
                    requiredText(dependency, "role", "profile dependency"),
                    readAssetReference(requiredObject(dependency, "asset", "profile dependency")),
                    dependency.path("required").asBoolean(false),
                    loadOrder));
        }
        return List.copyOf(result);
    }

    private Dependency requiredDependency(Map<String, Dependency> dependencies, String role) {
        Dependency dependency = dependencies.get(role);
        if (dependency == null) {
            throw new AssetLoadException("Missing required profile dependency for " + role);
        }
        return dependency;
    }

    private List<ProfilePackageDescriptor.CapabilityBinding> readCapabilities(JsonNode profile) {
        JsonNode capabilities = profile.path("capability_catalog");
        if (!capabilities.isArray()) throw new AssetLoadException("Profile capability_catalog must be an array");
        List<ProfilePackageDescriptor.CapabilityBinding> result = new ArrayList<>();
        for (JsonNode capability : capabilities) {
            String capabilityId = requiredText(capability, "capability_id", "profile capability");
            String ruleRef = optionalText(capability, "rule_ref");
            String symbolRef = optionalText(capability, "symbol_ref");
            String templateRef = optionalText(capability, "template_ref");
            if (ruleRef == null && templateRef == null) continue;
            if (ruleRef == null || symbolRef == null || templateRef == null) {
                throw new AssetLoadException("Profile capability text binding is incomplete for " + capabilityId);
            }
            result.add(new ProfilePackageDescriptor.CapabilityBinding(capabilityId, ruleRef, symbolRef, templateRef));
        }
        return List.copyOf(result);
    }

    private List<ManifestEntry> readManifestEntries(JsonNode manifest) {
        JsonNode entries = manifest.path("entries");
        if (!entries.isArray() || entries.isEmpty()) {
            throw new AssetLoadException("Profile manifest entries must be a non-empty array");
        }
        List<ManifestEntry> result = new ArrayList<>();
        for (JsonNode entry : entries) {
            String role = requiredText(entry, "role", "manifest entry");
            String logicalPath = requiredText(entry, "logical_path", "manifest entry");
            long byteLength = entry.path("byte_length").asLong(-1);
            if (byteLength < 0) {
                throw new AssetLoadException("Manifest entry byte_length must be non-negative");
            }
            result.add(new ManifestEntry(role, logicalPath, byteLength,
                    readDigest(requiredObject(entry, "digest", "manifest entry")),
                    entry.path("required").asBoolean(false)));
        }
        return result;
    }

    private String calculatePackageDigest(List<ManifestEntry> entries) {
        String canonicalManifest = entries.stream()
                .sorted(Comparator.comparing(ManifestEntry::logicalPath))
                .map(entry -> entry.logicalPath() + "\n" + entry.byteLength() + "\n" + entry.sha256() + "\n")
                .collect(Collectors.joining());
        return sha256(canonicalManifest.getBytes(StandardCharsets.UTF_8));
    }

    private Path resolveLogicalPath(Path packageDirectory, String logicalPath) {
        Path candidate;
        try {
            candidate = Path.of(logicalPath);
        } catch (RuntimeException exception) {
            throw new AssetLoadException("Manifest logical path is invalid: " + logicalPath, exception);
        }
        if (candidate.isAbsolute() || logicalPath.contains("\\")) {
            throw new AssetLoadException("Manifest logical path is not a safe relative path: " + logicalPath);
        }
        Path resolved = packageDirectory.resolve(candidate).normalize();
        if (!resolved.startsWith(packageDirectory)) {
            throw new AssetLoadException("Manifest logical path escapes the profile package: " + logicalPath);
        }
        return resolved;
    }

    private JsonNode readJson(Path path) {
        return readJson(readBytes(path), path.toString());
    }

    private JsonNode readJson(byte[] bytes, String source) {
        try {
            return objectMapper.readTree(bytes);
        } catch (IOException exception) {
            throw new AssetLoadException("Asset is not valid JSON: " + source, exception);
        }
    }

    private byte[] readBytes(Path path) {
        try {
            return Files.readAllBytes(path);
        } catch (IOException exception) {
            throw new AssetLoadException("Required asset cannot be read: " + path, exception);
        }
    }

    private AssetReference readAssetReference(JsonNode reference) {
        return new AssetReference(
                requiredText(reference, "id", "asset reference"),
                requiredText(reference, "version", "asset reference"),
                readDigest(requiredObject(reference, "digest", "asset reference")));
    }

    private String readDigest(JsonNode digest) {
        if (!"sha256".equals(requiredText(digest, "algorithm", "digest"))) {
            throw new AssetLoadException("Only sha256 asset digests are supported");
        }
        String value = requiredText(digest, "digest", "digest");
        requireSha256(value, "asset digest");
        return value;
    }

    private JsonNode requiredObject(JsonNode node, String field, String source) {
        JsonNode value = node.path(field);
        if (!value.isObject()) {
            throw new AssetLoadException("Missing object field " + field + " in " + source);
        }
        return value;
    }

    private String requiredText(JsonNode node, String field, String source) {
        JsonNode value = node.path(field);
        if (!value.isTextual() || value.asText().isBlank()) {
            throw new AssetLoadException("Missing text field " + field + " in " + source);
        }
        return value.asText();
    }

    private String optionalText(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isTextual() && !value.asText().isBlank() ? value.asText() : null;
    }

    private void validatePathSegment(String value, String name) {
        if (value == null || value.isBlank() || value.contains("/") || value.contains("\\") || value.contains("..")) {
            throw new AssetLoadException("Invalid " + name);
        }
    }

    private void requireSha256(String value, String name) {
        if (value == null || !value.matches("[a-f0-9]{64}")) {
            throw new AssetLoadException("Invalid " + name);
        }
    }

    private String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private List<JsonNode> stream(JsonNode array) {
        List<JsonNode> values = new ArrayList<>();
        array.forEach(values::add);
        return values;
    }

    private record ManifestEntry(String role, String logicalPath, long byteLength, String sha256, boolean required) {
    }

    private record Dependency(String role, AssetReference reference, boolean required, int loadOrder) {
    }
}
