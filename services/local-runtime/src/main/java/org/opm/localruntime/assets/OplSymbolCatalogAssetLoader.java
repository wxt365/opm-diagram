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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** 加载已由 Revision 绑定的 OPL 符号目录，并解析 Fact 的规范投影。 */
public final class OplSymbolCatalogAssetLoader {

    private final ObjectMapper objectMapper;

    public OplSymbolCatalogAssetLoader() {
        this(new ObjectMapper());
    }

    OplSymbolCatalogAssetLoader(ObjectMapper objectMapper) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
    }

    public Catalog load(Path path, SemanticRevision.AssetReference reference) {
        Objects.requireNonNull(path, "path must not be null");
        Objects.requireNonNull(reference, "reference must not be null");
        byte[] bytes;
        try {
            bytes = Files.readAllBytes(path);
        } catch (IOException exception) {
            throw new AssetLoadException("Symbol catalog asset cannot be read: " + path, exception);
        }
        if (!digest(bytes).equals(reference.sha256())) {
            throw new AssetLoadException("Symbol catalog digest does not match the revision binding");
        }
        try {
            JsonNode root = objectMapper.readTree(bytes);
            if (!reference.id().equals(requiredText(root, "asset_id"))
                    || !reference.version().equals(requiredText(root, "asset_version"))) {
                throw new AssetLoadException("Symbol catalog identity does not match the revision binding");
            }
            JsonNode symbols = root.path("symbols");
            if (!symbols.isArray() || symbols.isEmpty()) {
                throw new AssetLoadException("Symbol catalog must declare symbols");
            }
            Map<String, Projection> projections = new LinkedHashMap<>();
            Set<String> symbolIds = new java.util.LinkedHashSet<>();
            for (JsonNode symbol : symbols) {
                String symbolId = requiredText(symbol, "symbol_id");
                if (!symbolIds.add(symbolId)) {
                    throw new AssetLoadException("Symbol catalog contains duplicate symbol id: " + symbolId);
                }
                String capabilityId = optionalText(symbol, "capability_id");
                if (capabilityId == null) continue;
                Projection projection = new Projection(symbolId, optionalText(symbol, "line"),
                        optionalText(symbol, "source_marker"), optionalText(symbol, "target_marker"), optionalText(symbol, "junction_marker"),
                        optionalText(symbol, "annotation"), optionalText(symbol, "completeness_annotation"), strings(symbol.path("label_slots")),
                        requiredText(symbol, "route_family"));
                if (projections.putIfAbsent(capabilityId, projection) != null) {
                    throw new AssetLoadException("Symbol catalog contains duplicate capability projection: " + capabilityId);
                }
            }
            return new Catalog(projections, symbolIds);
        } catch (IOException exception) {
            throw new AssetLoadException("Symbol catalog asset is not valid JSON: " + path, exception);
        }
    }

    private String requiredText(JsonNode node, String field) {
        String value = optionalText(node, field);
        if (value == null) throw new AssetLoadException("Symbol catalog is missing " + field);
        return value;
    }

    private String optionalText(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isTextual() && !value.asText().isBlank() ? value.asText() : null;
    }

    private List<String> strings(JsonNode node) {
        if (node.isMissingNode()) return List.of();
        if (!node.isArray()) throw new AssetLoadException("Symbol catalog label_slots must be an array");
        List<String> values = new ArrayList<>();
        for (JsonNode value : node) {
            if (!value.isTextual() || value.asText().isBlank()) throw new AssetLoadException("Symbol catalog label_slots contains an invalid value");
            values.add(value.asText());
        }
        return List.copyOf(values);
    }

    private String digest(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public record Catalog(Map<String, Projection> projections, Set<String> symbolIds) {
        public Catalog {
            projections = Map.copyOf(Objects.requireNonNull(projections, "projections must not be null"));
            symbolIds = Set.copyOf(Objects.requireNonNull(symbolIds, "symbolIds must not be null"));
        }

        public boolean containsSymbol(String symbolId) {
            return symbolIds.contains(symbolId);
        }

        public Projection resolve(SemanticRevision.Fact fact) {
            Objects.requireNonNull(fact, "fact must not be null");
            String baseCapability = fact.capability().capabilityId();
            Projection base = require(baseCapability);
            String controlCapability = fact.modifiers().stream()
                    .filter(item -> "control.capability".equals(item.id()))
                    .map(SemanticRevision.Modifier::value)
                    .findFirst().orElse(null);
            if (controlCapability == null) return base;
            Projection control = require(controlCapability);
            return new Projection(control.symbolId(), inherit(control.line(), base.line()), inherit(control.sourceMarker(), base.sourceMarker()),
                    inherit(control.targetMarker(), base.targetMarker()), inherit(control.junctionMarker(), base.junctionMarker()),
                    inherit(control.annotation(), base.annotation()), inherit(control.completenessAnnotation(), base.completenessAnnotation()),
                    control.labelSlots().isEmpty() ? base.labelSlots() : control.labelSlots(), inherit(control.routeFamily(), base.routeFamily()));
        }

        private Projection require(String capabilityId) {
            Projection projection = projections.get(capabilityId);
            if (projection == null) throw new AssetLoadException("Symbol catalog has no projection for capability " + capabilityId);
            return projection;
        }

        private String inherit(String value, String inherited) {
            return "inherit-base".equals(value) ? inherited : value;
        }
    }

    public record Projection(String symbolId, String line, String sourceMarker, String targetMarker, String junctionMarker,
                             String annotation, String completenessAnnotation, List<String> labelSlots, String routeFamily) {
        public Projection {
            Objects.requireNonNull(symbolId, "symbolId must not be null");
            labelSlots = List.copyOf(Objects.requireNonNull(labelSlots, "labelSlots must not be null"));
            Objects.requireNonNull(routeFamily, "routeFamily must not be null");
        }
    }
}
