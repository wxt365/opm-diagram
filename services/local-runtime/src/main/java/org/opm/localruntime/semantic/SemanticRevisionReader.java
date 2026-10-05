package org.opm.localruntime.semantic;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public final class SemanticRevisionReader {

    private final ObjectMapper objectMapper;

    public SemanticRevisionReader() {
        this(new ObjectMapper());
    }

    SemanticRevisionReader(ObjectMapper objectMapper) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
    }

    public SemanticRevision read(Path source) {
        Objects.requireNonNull(source, "source must not be null");
        try (InputStream input = Files.newInputStream(source)) {
            return read(input);
        } catch (IOException exception) {
            throw new SemanticReadException("Cannot read semantic revision source", exception);
        }
    }

    public SemanticRevision read(InputStream input) {
        Objects.requireNonNull(input, "input must not be null");
        try {
            JsonNode root = objectMapper.readTree(input);
            if (root == null || !root.isObject()) {
                throw new SemanticReadException("Revision document must be a JSON object");
            }
            requireExactText(root, "schema_id", "MS-REV-001", "revision");
            requireSupportedSchemaVersion(root, "revision");
            JsonNode modelHeader = requiredObject(root, "model_header", "revision");
            return new SemanticRevision(
                    requiredText(root, "revision_id", "revision"),
                    requiredText(root, "model_id", "revision"),
                    requiredPositiveInteger(root, "revision_sequence", "revision"),
                    profileBinding(requiredObject(root, "profile_binding", "revision")),
                    requiredText(modelHeader, "root_context_id", "model_header"),
                    elements(requiredArray(root, "elements", "revision")),
                    features(requiredArrayOrEmpty(root, "features", "revision")),
                    states(requiredArray(root, "states", "revision")),
                    facts(requiredArray(root, "facts", "revision")),
                    contexts(requiredArray(root, "contexts", "revision")),
                    occurrences(requiredArray(root, "occurrences", "revision")),
                    layouts(requiredArray(root, "layouts", "revision")),
                    statePresentations(requiredArrayOrEmpty(root, "state_presentations", "revision")),
                    refinementEdges(requiredArrayOrEmpty(root, "refinement_edges", "revision")));
        } catch (IOException exception) {
            throw new SemanticReadException("Revision document is not valid JSON", exception);
        } catch (IllegalArgumentException exception) {
            throw new SemanticReadException("Revision document violates the DEV-03 domain shape: " + exception.getMessage(), exception);
        }
    }

    private SemanticRevision.ProfileBinding profileBinding(JsonNode node) {
        return new SemanticRevision.ProfileBinding(
                assetReference(requiredObject(node, "profile", "profile_binding")),
                assetReference(requiredObject(node, "rule_set", "profile_binding")),
                assetReference(requiredObject(node, "text_grammar", "profile_binding")),
                assetReference(requiredObject(node, "symbol_catalog", "profile_binding")),
                assetReference(requiredObject(node, "normalization_adapter", "profile_binding")),
                digest(requiredObject(node, "binding_digest", "profile_binding")));
    }

    private void requireSupportedSchemaVersion(JsonNode node, String scope) {
        String schemaVersion = requiredText(node, "schema_version", scope);
        if (!"0.1".equals(schemaVersion) && !"0.2".equals(schemaVersion) && !"0.3".equals(schemaVersion) && !"0.4".equals(schemaVersion) && !"0.5".equals(schemaVersion)) {
            throw new SemanticReadException(scope + " field schema_version must be 0.1, 0.2, 0.3, 0.4 or 0.5");
        }
        if ("0.3".equals(schemaVersion) || "0.4".equals(schemaVersion) || "0.5".equals(schemaVersion)) requiredArray(node, "refinement_edges", scope);
    }

    private List<SemanticRevision.RefinementEdge> refinementEdges(JsonNode nodes) {
        List<SemanticRevision.RefinementEdge> result = new ArrayList<>();
        for (JsonNode node : nodes) result.add(new SemanticRevision.RefinementEdge(
                requiredText(node, "refinement_id", "refinement"),
                requiredText(node, "parent_context_id", "refinement"),
                requiredText(node, "child_context_id", "refinement"),
                requiredText(node, "refinee_element_id", "refinement"),
                enumValue(SemanticRevision.CoreKind.class, requiredText(node, "refinement_kind", "refinement"), "refinement kind")));
        return result;
    }

    private SemanticRevision.AssetReference assetReference(JsonNode node) {
        return new SemanticRevision.AssetReference(
                requiredText(node, "id", "asset reference"),
                requiredText(node, "version", "asset reference"),
                digest(requiredObject(node, "digest", "asset reference")));
    }

    private List<SemanticRevision.Element> elements(JsonNode nodes) {
        List<SemanticRevision.Element> result = new ArrayList<>();
        for (JsonNode node : nodes) {
            result.add(new SemanticRevision.Element(
                    requiredText(node, "element_id", "element"),
                    enumValue(SemanticRevision.CoreKind.class, requiredText(node, "core_kind", "element"), "element core_kind"),
                    capability(requiredObject(node, "capability_ref", "element")),
                    qualifiedName(requiredObject(node, "name", "element")),
                    stableIdList(requiredArrayOrEmpty(node, "feature_ids", "element"), "element feature_ids"),
                    stableIdList(requiredArrayOrEmpty(node, "state_ids", "element"), "element state_ids"),
                    source(requiredObject(node, "source", "element")),
                    normalization(requiredObject(node, "normalization", "element"))));
        }
        return result;
    }

    private List<SemanticRevision.Feature> features(JsonNode nodes) {
        List<SemanticRevision.Feature> result = new ArrayList<>();
        for (JsonNode node : nodes) {
            result.add(new SemanticRevision.Feature(
                    requiredText(node, "feature_id", "feature"),
                    requiredText(node, "owner_element_id", "feature"),
                    enumValue(SemanticRevision.FeatureKind.class, requiredText(node, "feature_kind", "feature"), "feature kind"),
                    capability(requiredObject(node, "capability_ref", "feature")),
                    qualifiedName(requiredObject(node, "name", "feature")),
                    source(requiredObject(node, "source", "feature")),
                    normalization(requiredObject(node, "normalization", "feature"))));
        }
        return result;
    }

    private List<SemanticRevision.State> states(JsonNode nodes) {
        List<SemanticRevision.State> result = new ArrayList<>();
        for (JsonNode node : nodes) {
            result.add(new SemanticRevision.State(
                    requiredText(node, "state_id", "state"),
                    enumValue(SemanticRevision.TargetKind.class,
                            optionalText(node, "owner_target_kind", "state") == null ? "ELEMENT" : optionalText(node, "owner_target_kind", "state"),
                            "state owner_target_kind"),
                    requiredText(node, "owner_element_id", "state"),
                    capability(requiredObject(node, "capability_ref", "state")),
                    qualifiedName(requiredObject(node, "name", "state")),
                    enumList(SemanticRevision.StateRole.class, requiredArrayOrEmpty(node, "state_roles", "state"), "state_roles"),
                    source(requiredObject(node, "source", "state")),
                    normalization(requiredObject(node, "normalization", "state"))));
        }
        return result;
    }

    private List<SemanticRevision.Fact> facts(JsonNode nodes) {
        List<SemanticRevision.Fact> result = new ArrayList<>();
        for (JsonNode node : nodes) {
            result.add(new SemanticRevision.Fact(
                    requiredText(node, "fact_id", "fact"),
                    enumValue(SemanticRevision.FactFamily.class, requiredText(node, "fact_family", "fact"), "fact family"),
                    capability(requiredObject(node, "capability_ref", "fact")),
                    endpoints(requiredArray(node, "endpoints", "fact")),
                    enumValue(SemanticRevision.Direction.class, requiredText(node, "direction", "fact"), "fact direction"),
                    modifiers(requiredArrayOrEmpty(node, "modifiers", "fact")),
                    labels(requiredArrayOrEmpty(node, "labels", "fact")),
                    enumValue(SemanticRevision.CollectionCompleteness.class,
                            optionalText(node, "collection_completeness", "fact") == null ? "NOT_APPLICABLE" : optionalText(node, "collection_completeness", "fact"),
                            "fact collection_completeness"),
                    source(requiredObject(node, "source", "fact")),
                    normalization(requiredObject(node, "normalization", "fact"))));
        }
        return result;
    }

    private List<SemanticRevision.Modifier> modifiers(JsonNode nodes) {
        List<SemanticRevision.Modifier> result = new ArrayList<>();
        for (JsonNode node : nodes) {
            result.add(new SemanticRevision.Modifier(
                    requiredText(node, "modifier_id", "modifier"),
                    requiredText(node, "value", "modifier")));
        }
        return result;
    }

    private List<SemanticRevision.Label> labels(JsonNode nodes) {
        List<SemanticRevision.Label> result = new ArrayList<>();
        for (JsonNode node : nodes) {
            result.add(new SemanticRevision.Label(
                    requiredText(node, "slot_id", "label"),
                    requiredText(node, "text", "label")));
        }
        return result;
    }

    private List<SemanticRevision.Endpoint> endpoints(JsonNode nodes) {
        List<SemanticRevision.Endpoint> result = new ArrayList<>();
        for (JsonNode node : nodes) {
            result.add(new SemanticRevision.Endpoint(
                    requiredText(node, "endpoint_id", "endpoint"),
                    requiredText(node, "role", "endpoint"),
                    enumValue(SemanticRevision.TargetKind.class, requiredText(node, "target_kind", "endpoint"), "endpoint target_kind"),
                    requiredText(node, "target_id", "endpoint"),
                    requiredNonNegativeInteger(node, "ordinal", "endpoint"),
                    optionalText(node, "state_qualification_id", "endpoint")));
        }
        return result;
    }

    private List<SemanticRevision.ArchitectureLink> architectureLinks(JsonNode nodes) {
        var links = new ArrayList<SemanticRevision.ArchitectureLink>();
        for (var node : nodes) links.add(new SemanticRevision.ArchitectureLink(requiredText(node, "link_id", "architecture link"),
                requiredText(node, "target_context_id", "architecture link"),
                enumValue(SemanticRevision.ArchitectureLinkKind.class, requiredText(node, "kind", "architecture link"), "architecture link kind")));
        return links;
    }

    private List<SemanticRevision.Context> contexts(JsonNode nodes) {
        List<SemanticRevision.Context> result = new ArrayList<>();
        for (JsonNode node : nodes) {
            result.add(new SemanticRevision.Context(
                    requiredText(node, "context_id", "context"),
                    enumValue(SemanticRevision.ContextKind.class, requiredText(node, "context_kind", "context"), "context kind"),
                    capability(requiredObject(node, "capability_ref", "context")),
                    qualifiedName(requiredObject(node, "name", "context")),
                    stableIdList(requiredArray(node, "occurrence_ids", "context"), "context occurrence_ids"),
                    source(requiredObject(node, "source", "context")),
                    node.has("architecture_level") ? enumValue(SemanticRevision.ArchitectureLevel.class,
                            requiredText(node, "architecture_level", "context"), "architecture level") : null, architectureLinks(requiredArrayOrEmpty(node, "architecture_links", "context"))));
        }
        return result;
    }

    private List<SemanticRevision.Occurrence> occurrences(JsonNode nodes) {
        List<SemanticRevision.Occurrence> result = new ArrayList<>();
        for (JsonNode node : nodes) {
            result.add(new SemanticRevision.Occurrence(
                    requiredText(node, "occurrence_id", "occurrence"),
                    requiredText(node, "context_id", "occurrence"),
                    enumValue(SemanticRevision.TargetKind.class, requiredText(node, "target_kind", "occurrence"), "occurrence target_kind"),
                    requiredText(node, "target_id", "occurrence"),
                    enumValue(SemanticRevision.OccurrenceOwnership.class, requiredText(node, "ownership", "occurrence"), "occurrence ownership"),
                    requiredText(node, "construct_role", "occurrence"),
                    requiredText(node, "layout_id", "occurrence")));
        }
        return result;
    }

    private List<SemanticRevision.Layout> layouts(JsonNode nodes) {
        List<SemanticRevision.Layout> result = new ArrayList<>();
        for (JsonNode node : nodes) {
            result.add(new SemanticRevision.Layout(
                    requiredText(node, "layout_id", "layout"),
                    requiredFiniteDouble(node, "x", "layout"),
                    requiredFiniteDouble(node, "y", "layout"),
                    requiredFiniteDouble(node, "width", "layout"),
                    requiredFiniteDouble(node, "height", "layout"),
                    requiredInteger(node, "z_order", "layout")));
        }
        return result;
    }

    private List<SemanticRevision.StatePresentation> statePresentations(JsonNode nodes) {
        List<SemanticRevision.StatePresentation> result = new ArrayList<>();
        for (JsonNode node : nodes) {
            result.add(new SemanticRevision.StatePresentation(
                    requiredText(node, "context_id", "state presentation"),
                    requiredText(node, "state_id", "state presentation"),
                    enumValue(SemanticRevision.StateExplicitness.class, requiredText(node, "explicitness", "state presentation"), "state presentation explicitness"),
                    enumValue(SemanticRevision.StateFoldState.class, requiredText(node, "fold_state", "state presentation"), "state presentation fold state")));
        }
        return result;
    }

    private SemanticRevision.CapabilityReference capability(JsonNode node) {
        return new SemanticRevision.CapabilityReference(
                requiredText(node, "capability_id", "capability reference"),
                requiredText(node, "profile_id", "capability reference"),
                requiredText(node, "profile_version", "capability reference"));
    }

    private SemanticRevision.QualifiedName qualifiedName(JsonNode node) {
        return new SemanticRevision.QualifiedName(
                requiredText(node, "namespace", "qualified name"),
                requiredText(node, "local_name", "qualified name"));
    }

    private SemanticRevision.SourceProvenance source(JsonNode node) {
        return new SemanticRevision.SourceProvenance(
                requiredText(node, "source_profile_id", "source"),
                requiredText(node, "source_profile_version", "source"),
                requiredText(node, "source_kind", "source"),
                requiredText(node, "source_entity_id", "source"));
    }

    private SemanticRevision.Normalization normalization(JsonNode node) {
        return new SemanticRevision.Normalization(enumValue(
                SemanticRevision.NormalizationLevel.class, requiredText(node, "level", "normalization"), "normalization level"));
    }

    private String digest(JsonNode node) {
        requireExactText(node, "algorithm", "sha256", "digest");
        return requiredText(node, "digest", "digest");
    }

    private JsonNode requiredObject(JsonNode node, String field, String owner) {
        JsonNode value = node.get(field);
        if (value == null || !value.isObject()) {
            throw new SemanticReadException(owner + "." + field + " must be an object");
        }
        return value;
    }

    private JsonNode requiredArray(JsonNode node, String field, String owner) {
        JsonNode value = node.get(field);
        if (value == null || !value.isArray()) {
            throw new SemanticReadException(owner + "." + field + " must be an array");
        }
        return value;
    }

    private JsonNode requiredArrayOrEmpty(JsonNode node, String field, String owner) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            return objectMapper.createArrayNode();
        }
        if (!value.isArray()) {
            throw new SemanticReadException(owner + "." + field + " must be an array");
        }
        return value;
    }

    private String requiredText(JsonNode node, String field, String owner) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual() || value.asText().isBlank()) {
            throw new SemanticReadException(owner + "." + field + " must be non-blank text");
        }
        return value.asText();
    }

    private String optionalText(JsonNode node, String field, String owner) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        if (!value.isTextual() || value.asText().isBlank()) {
            throw new SemanticReadException(owner + "." + field + " must be non-blank text when present");
        }
        return value.asText();
    }

    private void requireExactText(JsonNode node, String field, String expected, String owner) {
        if (!expected.equals(requiredText(node, field, owner))) {
            throw new SemanticReadException(owner + "." + field + " must equal " + expected);
        }
    }

    private int requiredPositiveInteger(JsonNode node, String field, String owner) {
        int value = requiredInteger(node, field, owner);
        if (value < 1) {
            throw new SemanticReadException(owner + "." + field + " must be positive");
        }
        return value;
    }

    private int requiredNonNegativeInteger(JsonNode node, String field, String owner) {
        int value = requiredInteger(node, field, owner);
        if (value < 0) {
            throw new SemanticReadException(owner + "." + field + " must not be negative");
        }
        return value;
    }

    private int requiredInteger(JsonNode node, String field, String owner) {
        JsonNode value = node.get(field);
        if (value == null || !value.canConvertToInt() || !value.isIntegralNumber()) {
            throw new SemanticReadException(owner + "." + field + " must be an integer");
        }
        return value.intValue();
    }

    private double requiredFiniteDouble(JsonNode node, String field, String owner) {
        JsonNode value = node.get(field);
        if (value == null || !value.isNumber() || !Double.isFinite(value.doubleValue())) {
            throw new SemanticReadException(owner + "." + field + " must be a finite number");
        }
        return value.doubleValue();
    }

    private List<String> stableIdList(JsonNode nodes, String owner) {
        List<String> result = new ArrayList<>();
        for (JsonNode node : nodes) {
            if (!node.isTextual()) {
                throw new SemanticReadException(owner + " items must be text");
            }
            result.add(node.asText());
        }
        return result;
    }

    private <T extends Enum<T>> List<T> enumList(Class<T> enumType, JsonNode nodes, String owner) {
        List<T> result = new ArrayList<>();
        for (JsonNode node : nodes) {
            if (!node.isTextual()) {
                throw new SemanticReadException(owner + " items must be text");
            }
            result.add(enumValue(enumType, node.asText(), owner));
        }
        return result;
    }

    private <T extends Enum<T>> T enumValue(Class<T> enumType, String value, String owner) {
        try {
            return Enum.valueOf(enumType, value);
        } catch (IllegalArgumentException exception) {
            throw new SemanticReadException(owner + " contains unsupported value " + value, exception);
        }
    }
}
