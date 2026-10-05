package org.opm.localruntime.semantic;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Objects;

public final class SemanticRevisionJsonWriter {

    private final ObjectMapper objectMapper;

    public SemanticRevisionJsonWriter() {
        this(new ObjectMapper());
    }

    SemanticRevisionJsonWriter(ObjectMapper objectMapper) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
    }

    public String write(SemanticRevision revision) {
        Objects.requireNonNull(revision, "revision must not be null");
        try {
            return objectMapper.writeValueAsString(tree(revision));
        } catch (JsonProcessingException exception) {
            throw new SemanticReadException("Cannot write semantic revision JSON", exception);
        }
    }

    private ObjectNode tree(SemanticRevision revision) {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("schema_id", "MS-REV-001");
        boolean classified = revision.contexts().stream().anyMatch(context -> context.architectureLevel() != null);
        boolean linked = revision.contexts().stream().anyMatch(context -> !context.architectureLinks().isEmpty());
        root.put("schema_version", linked ? "0.5" : classified ? "0.4" : revision.refinementEdges().isEmpty() ? "0.2" : "0.3");
        root.put("revision_id", revision.revisionId());
        root.put("model_id", revision.modelId());
        root.put("revision_sequence", revision.revisionSequence());
        root.set("profile_binding", profileBinding(revision.profileBinding()));
        ObjectNode header = root.putObject("model_header");
        header.put("model_id", revision.modelId());
        header.putObject("identity_namespace").put("namespace", "urn:opm:runtime").put("local_name", revision.modelId());
        header.put("root_context_id", revision.rootContextId());
        root.set("elements", elements(revision));
        root.set("features", features(revision));
        root.set("states", states(revision));
        root.set("facts", facts(revision));
        root.set("contexts", contexts(revision));
        if (linked || classified || !revision.refinementEdges().isEmpty()) root.set("refinement_edges", refinementEdges(revision));
        root.set("occurrences", occurrences(revision));
        root.set("layouts", layouts(revision));
        root.set("state_presentations", statePresentations(revision));
        return root;
    }

    private ObjectNode profileBinding(SemanticRevision.ProfileBinding binding) {
        ObjectNode node = objectMapper.createObjectNode();
        node.set("profile", asset(binding.profile()));
        node.set("rule_set", asset(binding.ruleSet()));
        node.set("text_grammar", asset(binding.textGrammar()));
        node.set("symbol_catalog", asset(binding.symbolCatalog()));
        node.set("normalization_adapter", asset(binding.normalizationAdapter()));
        node.set("binding_digest", digest(binding.bindingDigest()));
        return node;
    }

    private ArrayNode elements(SemanticRevision revision) {
        ArrayNode result = objectMapper.createArrayNode();
        for (SemanticRevision.Element element : revision.elements()) {
            ObjectNode node = result.addObject();
            node.put("element_id", element.id());
            node.put("core_kind", element.coreKind().name());
            node.set("capability_ref", capability(element.capability()));
            node.set("name", name(element.name()));
            strings(node.putArray("feature_ids"), element.featureIds());
            strings(node.putArray("state_ids"), element.stateIds());
            node.set("source", source(element.source()));
            node.set("normalization", normalization(element.normalization()));
        }
        return result;
    }

    private ArrayNode features(SemanticRevision revision) {
        ArrayNode result = objectMapper.createArrayNode();
        for (SemanticRevision.Feature feature : revision.features()) {
            ObjectNode node = result.addObject();
            node.put("feature_id", feature.id());
            node.put("owner_element_id", feature.ownerElementId());
            node.put("feature_kind", feature.kind().name());
            node.set("capability_ref", capability(feature.capability()));
            node.set("name", name(feature.name()));
            node.set("source", source(feature.source()));
            node.set("normalization", normalization(feature.normalization()));
        }
        return result;
    }

    private ArrayNode states(SemanticRevision revision) {
        ArrayNode result = objectMapper.createArrayNode();
        for (SemanticRevision.State state : revision.states()) {
            ObjectNode node = result.addObject();
            node.put("state_id", state.id());
            node.put("owner_target_kind", state.ownerTargetKind().name());
            node.put("owner_element_id", state.ownerElementId());
            node.set("capability_ref", capability(state.capability()));
            node.set("name", name(state.name()));
            ArrayNode roles = node.putArray("state_roles");
            state.roles().forEach(role -> roles.add(role.name()));
            node.set("source", source(state.source()));
            node.set("normalization", normalization(state.normalization()));
        }
        return result;
    }

    private ArrayNode facts(SemanticRevision revision) {
        ArrayNode result = objectMapper.createArrayNode();
        for (SemanticRevision.Fact fact : revision.facts()) {
            ObjectNode node = result.addObject();
            node.put("fact_id", fact.id());
            node.put("fact_family", fact.family().name());
            node.set("capability_ref", capability(fact.capability()));
            ArrayNode endpoints = node.putArray("endpoints");
            for (SemanticRevision.Endpoint endpoint : fact.endpoints()) {
                ObjectNode endpointNode = endpoints.addObject();
                endpointNode.put("endpoint_id", endpoint.id());
                endpointNode.put("role", endpoint.role());
                endpointNode.put("target_kind", endpoint.targetKind().name());
                endpointNode.put("target_id", endpoint.targetId());
                endpointNode.put("ordinal", endpoint.ordinal());
                if (endpoint.stateQualificationId() != null) endpointNode.put("state_qualification_id", endpoint.stateQualificationId());
            }
            node.put("direction", fact.direction().name());
            ArrayNode modifiers = node.putArray("modifiers");
            for (SemanticRevision.Modifier modifier : fact.modifiers()) {
                modifiers.addObject().put("modifier_id", modifier.id()).put("value", modifier.value());
            }
            ArrayNode labels = node.putArray("labels");
            for (SemanticRevision.Label label : fact.labels()) {
                labels.addObject().put("slot_id", label.slotId()).put("text", label.text());
            }
            node.put("collection_completeness", fact.collectionCompleteness().name());
            node.set("source", source(fact.source()));
            node.set("normalization", normalization(fact.normalization()));
        }
        return result;
    }

    private ArrayNode statePresentations(SemanticRevision revision) {
        ArrayNode result = objectMapper.createArrayNode();
        for (SemanticRevision.StatePresentation presentation : revision.statePresentations()) {
            ObjectNode node = result.addObject();
            node.put("context_id", presentation.contextId());
            node.put("state_id", presentation.stateId());
            node.put("explicitness", presentation.explicitness().name());
            node.put("fold_state", presentation.foldState().name());
        }
        return result;
    }

    private ArrayNode contexts(SemanticRevision revision) {
        ArrayNode result = objectMapper.createArrayNode();
        for (SemanticRevision.Context context : revision.contexts()) {
            ObjectNode node = result.addObject();
            node.put("context_id", context.id());
            node.put("context_kind", context.kind().name());
            node.set("capability_ref", capability(context.capability()));
            node.set("name", name(context.name()));
            strings(node.putArray("occurrence_ids"), context.occurrenceIds());
            node.set("source", source(context.source()));
            if (context.architectureLevel() != null) node.put("architecture_level", context.architectureLevel().name());
            if (!context.architectureLinks().isEmpty()) {
                var links = node.putArray("architecture_links");
                for (var link : context.architectureLinks()) links.addObject().put("link_id", link.id())
                        .put("target_context_id", link.targetContextId()).put("kind", link.kind().name());
            }
        }
        return result;
    }

    private ArrayNode refinementEdges(SemanticRevision revision) {
        ArrayNode result = objectMapper.createArrayNode();
        for (SemanticRevision.RefinementEdge edge : revision.refinementEdges()) {
            result.addObject().put("refinement_id", edge.id())
                    .put("parent_context_id", edge.parentContextId())
                    .put("child_context_id", edge.childContextId())
                    .put("refinee_element_id", edge.refineeElementId())
                    .put("refinement_kind", edge.kind().name());
        }
        return result;
    }

    private ArrayNode occurrences(SemanticRevision revision) {
        ArrayNode result = objectMapper.createArrayNode();
        for (SemanticRevision.Occurrence occurrence : revision.occurrences()) {
            ObjectNode node = result.addObject();
            node.put("occurrence_id", occurrence.id());
            node.put("context_id", occurrence.contextId());
            node.put("target_kind", occurrence.targetKind().name());
            node.put("target_id", occurrence.targetId());
            node.put("ownership", occurrence.ownership().name());
            node.put("construct_role", occurrence.constructRole());
            node.put("layout_id", occurrence.layoutId());
        }
        return result;
    }

    private ArrayNode layouts(SemanticRevision revision) {
        ArrayNode result = objectMapper.createArrayNode();
        for (SemanticRevision.Layout layout : revision.layouts()) {
            ObjectNode node = result.addObject();
            node.put("layout_id", layout.id());
            node.put("x", layout.x());
            node.put("y", layout.y());
            node.put("width", layout.width());
            node.put("height", layout.height());
            node.put("z_order", layout.zOrder());
        }
        return result;
    }

    private ObjectNode asset(SemanticRevision.AssetReference reference) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("id", reference.id());
        node.put("version", reference.version());
        node.set("digest", digest(reference.sha256()));
        return node;
    }

    private ObjectNode capability(SemanticRevision.CapabilityReference reference) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("capability_id", reference.capabilityId());
        node.put("profile_id", reference.profileId());
        node.put("profile_version", reference.profileVersion());
        return node;
    }

    private ObjectNode name(SemanticRevision.QualifiedName name) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("namespace", name.namespace());
        node.put("local_name", name.localName());
        return node;
    }

    private ObjectNode source(SemanticRevision.SourceProvenance source) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("source_profile_id", source.profileId());
        node.put("source_profile_version", source.profileVersion());
        node.put("source_kind", source.sourceKind());
        node.put("source_entity_id", source.sourceEntityId());
        return node;
    }

    private ObjectNode normalization(SemanticRevision.Normalization normalization) {
        return objectMapper.createObjectNode().put("level", normalization.level().name());
    }

    private ObjectNode digest(String value) {
        return objectMapper.createObjectNode().put("algorithm", "sha256").put("digest", value);
    }

    private void strings(ArrayNode target, Iterable<String> values) {
        values.forEach(target::add);
    }
}
