package org.opm.localruntime.assets;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.semantic.SemanticRevision;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/** 只加载与 Revision binding 精确匹配的 Rule Set。 */
public final class RuleSetAssetLoader {

    private final ObjectMapper objectMapper;

    public RuleSetAssetLoader() {
        this(new ObjectMapper());
    }

    RuleSetAssetLoader(ObjectMapper objectMapper) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
    }

    public RuleSet load(Path path, SemanticRevision.AssetReference reference) {
        Objects.requireNonNull(path, "path must not be null");
        Objects.requireNonNull(reference, "reference must not be null");
        byte[] bytes = read(path);
        if (!sha256(bytes).equals(reference.sha256())) throw new AssetLoadException("Rule set digest does not match the revision binding");
        JsonNode root = parse(bytes, path);
        if (!reference.id().equals(requiredText(root, "rule_set_id"))
                || !reference.version().equals(requiredText(root, "rule_set_version"))) {
            throw new AssetLoadException("Rule set identity does not match the revision binding");
        }
        JsonNode rules = root.path("rules");
        if (!rules.isArray() || rules.isEmpty()) throw new AssetLoadException("Rule set must declare rules");
        List<String> values = new ArrayList<>();
        for (JsonNode rule : rules) {
            if (!rule.isTextual() || rule.asText().isBlank()) throw new AssetLoadException("Rule set contains an invalid rule id");
            values.add(rule.asText());
        }
        if (new LinkedHashSet<>(values).size() != values.size()) throw new AssetLoadException("Rule set contains duplicate rule ids");
        return new RuleSet(List.copyOf(values));
    }

    private byte[] read(Path path) {
        try {
            return Files.readAllBytes(path);
        } catch (IOException exception) {
            throw new AssetLoadException("Rule set cannot be read: " + path, exception);
        }
    }

    private JsonNode parse(byte[] bytes, Path path) {
        try {
            return objectMapper.readTree(bytes);
        } catch (IOException exception) {
            throw new AssetLoadException("Rule set is not valid JSON: " + path, exception);
        }
    }

    private String requiredText(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (!value.isTextual() || value.asText().isBlank()) throw new AssetLoadException("Rule set is missing " + field);
        return value.asText();
    }

    private String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public record RuleSet(List<String> ruleIds) {
        public RuleSet {
            ruleIds = List.copyOf(Objects.requireNonNull(ruleIds, "ruleIds must not be null"));
        }

        public boolean contains(String ruleId) {
            return ruleIds.contains(ruleId);
        }

        public Set<String> index() {
            return Set.copyOf(ruleIds);
        }
    }
}
