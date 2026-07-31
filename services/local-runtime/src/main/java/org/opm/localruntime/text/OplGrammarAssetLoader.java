package org.opm.localruntime.text;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.assets.AssetLoadException;
import org.opm.localruntime.semantic.SemanticRevision;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;

/** 只加载已由 Profile manifest 绑定的具体 Grammar 资产。 */
public final class OplGrammarAssetLoader {

    private final ObjectMapper objectMapper;

    public OplGrammarAssetLoader() {
        this(new ObjectMapper());
    }

    OplGrammarAssetLoader(ObjectMapper objectMapper) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
    }

    public OplGrammar load(Path path, SemanticRevision.AssetReference reference) {
        Objects.requireNonNull(path, "path must not be null");
        Objects.requireNonNull(reference, "reference must not be null");
        byte[] bytes;
        try {
            bytes = Files.readAllBytes(path);
        } catch (IOException exception) {
            throw new AssetLoadException("Grammar asset cannot be read: " + path, exception);
        }
        if (!digest(bytes).equals(reference.sha256())) {
            throw new AssetLoadException("Grammar asset digest does not match the revision binding");
        }

        JsonNode root;
        try {
            root = objectMapper.readTree(bytes);
        } catch (IOException exception) {
            throw new AssetLoadException("Grammar asset is not valid JSON: " + path, exception);
        }
        if (!reference.id().equals(requiredText(root, "asset_id"))
                || !reference.version().equals(requiredText(root, "asset_version"))) {
            throw new AssetLoadException("Grammar asset identity does not match the revision binding");
        }
        JsonNode templatesNode = root.path("templates");
        if (!templatesNode.isArray() || templatesNode.isEmpty()) {
            throw new AssetLoadException("Grammar asset must declare concrete templates");
        }
        List<OplGrammar.Template> templates = new ArrayList<>();
        for (JsonNode node : templatesNode) {
            templates.add(new OplGrammar.Template(
                    requiredText(node, "template_id"),
                    requiredText(node, "capability_id"),
                    requiredInt(node, "family_rank"),
                    requiredText(node, "sentence_slot"),
                    requiredText(node, "pattern")));
        }
        try {
            return new OplGrammar(new OplGrammar.Binding(reference.id(), reference.version(), reference.sha256()), templates);
        } catch (IllegalArgumentException exception) {
            throw new AssetLoadException("Grammar asset has invalid concrete templates", exception);
        }
    }

    private String requiredText(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (!value.isTextual() || value.asText().isBlank()) {
            throw new AssetLoadException("Grammar asset is missing " + field);
        }
        return value.asText();
    }

    private int requiredInt(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (!value.canConvertToInt() || value.asInt() < 0) {
            throw new AssetLoadException("Grammar asset has invalid " + field);
        }
        return value.asInt();
    }

    private String digest(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
