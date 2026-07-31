package org.opm.localruntime.assets;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.semantic.SemanticRevision;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Objects;

/** 加载不可变的 normalization policy，拒绝未绑定的文件。 */
public final class NormalizationAssetLoader {

    private final ObjectMapper objectMapper;

    public NormalizationAssetLoader() {
        this(new ObjectMapper());
    }

    NormalizationAssetLoader(ObjectMapper objectMapper) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
    }

    public Policy load(Path path, SemanticRevision.AssetReference reference) {
        Objects.requireNonNull(path, "path must not be null");
        Objects.requireNonNull(reference, "reference must not be null");
        byte[] bytes;
        try {
            bytes = Files.readAllBytes(path);
        } catch (IOException exception) {
            throw new AssetLoadException("Normalization asset cannot be read: " + path, exception);
        }
        if (!sha256(bytes).equals(reference.sha256())) throw new AssetLoadException("Normalization asset digest does not match the revision binding");
        try {
            JsonNode root = objectMapper.readTree(bytes);
            if (!reference.id().equals(requiredText(root, "asset_id"))
                    || !reference.version().equals(requiredText(root, "asset_version"))) {
                throw new AssetLoadException("Normalization asset identity does not match the revision binding");
            }
            if (!"NORMALIZATION_DATA".equals(requiredText(root, "asset_type"))) {
                throw new AssetLoadException("Normalization asset has an invalid asset_type");
            }
            return new Policy(reference.id(), reference.version(), reference.sha256(), requiredText(root, "policy"));
        } catch (IOException exception) {
            throw new AssetLoadException("Normalization asset is not valid JSON: " + path, exception);
        }
    }

    private String requiredText(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (!value.isTextual() || value.asText().isBlank()) throw new AssetLoadException("Normalization asset is missing " + field);
        return value.asText();
    }

    private String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public record Policy(String id, String version, String sha256, String name) {
        public Policy {
            require(id, "id");
            require(version, "version");
            require(sha256, "sha256");
            require(name, "name");
        }

        private static void require(String value, String field) {
            if (value == null || value.isBlank()) throw new IllegalArgumentException(field + " must not be blank");
        }
    }
}
