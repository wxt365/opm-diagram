package org.opm.localruntime.semantic;

import java.util.List;
import java.util.Objects;
import java.util.Set;

public record SemanticRevision(
        String revisionId,
        String modelId,
        int revisionSequence,
        ProfileBinding profileBinding,
        String rootContextId,
        List<Element> elements,
        List<Feature> features,
        List<State> states,
        List<Fact> facts,
        List<Context> contexts,
        List<Occurrence> occurrences,
        List<Layout> layouts,
        List<StatePresentation> statePresentations,
        List<RefinementEdge> refinementEdges) {

    public SemanticRevision {
        requireStableId(revisionId, "revisionId");
        requireStableId(modelId, "modelId");
        if (revisionSequence < 1) {
            throw new IllegalArgumentException("revisionSequence must be positive");
        }
        profileBinding = Objects.requireNonNull(profileBinding, "profileBinding must not be null");
        requireStableId(rootContextId, "rootContextId");
        elements = List.copyOf(Objects.requireNonNull(elements, "elements must not be null"));
        features = List.copyOf(Objects.requireNonNull(features, "features must not be null"));
        states = List.copyOf(Objects.requireNonNull(states, "states must not be null"));
        facts = List.copyOf(Objects.requireNonNull(facts, "facts must not be null"));
        contexts = List.copyOf(Objects.requireNonNull(contexts, "contexts must not be null"));
        occurrences = List.copyOf(Objects.requireNonNull(occurrences, "occurrences must not be null"));
        layouts = List.copyOf(Objects.requireNonNull(layouts, "layouts must not be null"));
        statePresentations = List.copyOf(Objects.requireNonNull(statePresentations, "statePresentations must not be null"));
        refinementEdges = List.copyOf(Objects.requireNonNull(refinementEdges, "refinementEdges must not be null"));
    }

    public SemanticRevision(String revisionId, String modelId, int revisionSequence, ProfileBinding profileBinding,
                            String rootContextId, List<Element> elements, List<Feature> features, List<State> states,
                            List<Fact> facts, List<Context> contexts, List<Occurrence> occurrences, List<Layout> layouts,
                            List<StatePresentation> statePresentations) {
        this(revisionId, modelId, revisionSequence, profileBinding, rootContextId, elements, features, states,
                facts, contexts, occurrences, layouts, statePresentations, List.of());
    }

    public SemanticRevision(String revisionId, String modelId, int revisionSequence, ProfileBinding profileBinding,
                            String rootContextId, List<Element> elements, List<State> states, List<Fact> facts,
                            List<Context> contexts, List<Occurrence> occurrences, List<Layout> layouts) {
        this(revisionId, modelId, revisionSequence, profileBinding, rootContextId, elements, List.of(), states, facts,
                contexts, occurrences, layouts, List.of());
    }

    public SemanticRevision(String revisionId, String modelId, int revisionSequence, ProfileBinding profileBinding,
                            String rootContextId, List<Element> elements, List<State> states, List<Fact> facts,
                            List<Context> contexts, List<Occurrence> occurrences, List<Layout> layouts,
                            List<StatePresentation> statePresentations) {
        this(revisionId, modelId, revisionSequence, profileBinding, rootContextId, elements, List.of(), states, facts,
                contexts, occurrences, layouts, statePresentations);
    }

    public record ProfileBinding(
            AssetReference profile,
            AssetReference ruleSet,
            AssetReference textGrammar,
            AssetReference symbolCatalog,
            AssetReference normalizationAdapter,
            String bindingDigest) {

        public ProfileBinding {
            profile = Objects.requireNonNull(profile, "profile must not be null");
            ruleSet = Objects.requireNonNull(ruleSet, "ruleSet must not be null");
            textGrammar = Objects.requireNonNull(textGrammar, "textGrammar must not be null");
            symbolCatalog = Objects.requireNonNull(symbolCatalog, "symbolCatalog must not be null");
            normalizationAdapter = Objects.requireNonNull(normalizationAdapter, "normalizationAdapter must not be null");
            requireNonBlank(bindingDigest, "bindingDigest");
        }
    }

    public record AssetReference(String id, String version, String sha256) {

        public AssetReference {
            requireStableId(id, "id");
            requireNonBlank(version, "version");
            requireNonBlank(sha256, "sha256");
        }
    }

    public record CapabilityReference(String capabilityId, String profileId, String profileVersion) {

        public CapabilityReference {
            requireNonBlank(capabilityId, "capabilityId");
            requireStableId(profileId, "profileId");
            requireNonBlank(profileVersion, "profileVersion");
        }
    }

    public record QualifiedName(String namespace, String localName) {

        public QualifiedName {
            requireNonBlank(namespace, "namespace");
            requireNonBlank(localName, "localName");
        }
    }

    public record SourceProvenance(String profileId, String profileVersion, String sourceKind, String sourceEntityId) {

        public SourceProvenance {
            requireStableId(profileId, "profileId");
            requireNonBlank(profileVersion, "profileVersion");
            requireNonBlank(sourceKind, "sourceKind");
            requireStableId(sourceEntityId, "sourceEntityId");
        }
    }

    public record Normalization(NormalizationLevel level) {

        public Normalization {
            Objects.requireNonNull(level, "level must not be null");
        }
    }

    public record Element(
            String id,
            CoreKind coreKind,
            CapabilityReference capability,
            QualifiedName name,
            List<String> featureIds,
            List<String> stateIds,
            SourceProvenance source,
            Normalization normalization) {

        public Element {
            requireStableId(id, "element id");
            Objects.requireNonNull(coreKind, "coreKind must not be null");
            capability = Objects.requireNonNull(capability, "capability must not be null");
            name = Objects.requireNonNull(name, "name must not be null");
            featureIds = immutableStableIds(featureIds, "featureIds");
            stateIds = immutableStableIds(stateIds, "stateIds");
            source = Objects.requireNonNull(source, "source must not be null");
            normalization = Objects.requireNonNull(normalization, "normalization must not be null");
        }

        public Element(String id, CoreKind coreKind, CapabilityReference capability, QualifiedName name,
                       List<String> stateIds, SourceProvenance source, Normalization normalization) {
            this(id, coreKind, capability, name, List.of(), stateIds, source, normalization);
        }
    }

    public record Feature(
            String id,
            String ownerElementId,
            FeatureKind kind,
            CapabilityReference capability,
            QualifiedName name,
            SourceProvenance source,
            Normalization normalization) {

        public Feature {
            requireStableId(id, "feature id");
            requireStableId(ownerElementId, "feature ownerElementId");
            Objects.requireNonNull(kind, "feature kind must not be null");
            capability = Objects.requireNonNull(capability, "feature capability must not be null");
            name = Objects.requireNonNull(name, "feature name must not be null");
            source = Objects.requireNonNull(source, "feature source must not be null");
            normalization = Objects.requireNonNull(normalization, "feature normalization must not be null");
        }
    }

    public record State(
            String id,
            TargetKind ownerTargetKind,
            String ownerElementId,
            CapabilityReference capability,
            QualifiedName name,
            List<StateRole> roles,
            SourceProvenance source,
            Normalization normalization) {

        public State {
            requireStableId(id, "state id");
            Objects.requireNonNull(ownerTargetKind, "state ownerTargetKind must not be null");
            if (ownerTargetKind != TargetKind.ELEMENT && ownerTargetKind != TargetKind.FEATURE) {
                throw new IllegalArgumentException("state ownerTargetKind must be ELEMENT or FEATURE");
            }
            requireStableId(ownerElementId, "ownerElementId");
            capability = Objects.requireNonNull(capability, "capability must not be null");
            name = Objects.requireNonNull(name, "name must not be null");
            roles = List.copyOf(Objects.requireNonNull(roles, "roles must not be null"));
            if (roles.size() != Set.copyOf(roles).size()) {
                throw new IllegalArgumentException("roles must not contain duplicates");
            }
            source = Objects.requireNonNull(source, "source must not be null");
            normalization = Objects.requireNonNull(normalization, "normalization must not be null");
        }

        public State(String id, String ownerElementId, CapabilityReference capability, QualifiedName name,
                     List<StateRole> roles, SourceProvenance source, Normalization normalization) {
            this(id, TargetKind.ELEMENT, ownerElementId, capability, name, roles, source, normalization);
        }
    }

    public record Fact(
            String id,
            FactFamily family,
            CapabilityReference capability,
            List<Endpoint> endpoints,
            Direction direction,
            List<Modifier> modifiers,
            List<Label> labels,
            CollectionCompleteness collectionCompleteness,
            SourceProvenance source,
            Normalization normalization) {

        public Fact {
            requireStableId(id, "fact id");
            Objects.requireNonNull(family, "family must not be null");
            capability = Objects.requireNonNull(capability, "capability must not be null");
            endpoints = List.copyOf(Objects.requireNonNull(endpoints, "endpoints must not be null"));
            Objects.requireNonNull(direction, "direction must not be null");
            modifiers = List.copyOf(Objects.requireNonNull(modifiers, "modifiers must not be null"));
            labels = List.copyOf(Objects.requireNonNull(labels, "labels must not be null"));
            if (labels.size() != labels.stream().map(Label::slotId).distinct().count()) {
                throw new IllegalArgumentException("labels must not contain duplicate slots");
            }
            Objects.requireNonNull(collectionCompleteness, "collectionCompleteness must not be null");
            source = Objects.requireNonNull(source, "source must not be null");
            normalization = Objects.requireNonNull(normalization, "normalization must not be null");
        }

        public Fact(
                String id,
                FactFamily family,
                CapabilityReference capability,
                List<Endpoint> endpoints,
                Direction direction,
                List<Modifier> modifiers,
                SourceProvenance source,
                Normalization normalization) {
            this(id, family, capability, endpoints, direction, modifiers, List.of(), CollectionCompleteness.NOT_APPLICABLE, source, normalization);
        }

        public Fact(
                String id,
                FactFamily family,
                CapabilityReference capability,
                List<Endpoint> endpoints,
                Direction direction,
                SourceProvenance source,
                Normalization normalization) {
            this(id, family, capability, endpoints, direction, List.of(), source, normalization);
        }
    }

    public record Label(String slotId, String text) {

        public Label {
            requireNonBlank(slotId, "label slotId");
            requireNonBlank(text, "label text");
        }
    }

    public record Modifier(String id, String value) {

        public Modifier {
            requireNonBlank(id, "modifier id");
            requireNonBlank(value, "modifier value");
        }
    }

    public record Endpoint(String id, String role, TargetKind targetKind, String targetId, int ordinal, String stateQualificationId) {

        public Endpoint {
            requireStableId(id, "endpoint id");
            requireNonBlank(role, "role");
            Objects.requireNonNull(targetKind, "targetKind must not be null");
            requireStableId(targetId, "targetId");
            if (ordinal < 0) {
                throw new IllegalArgumentException("ordinal must not be negative");
            }
            if (stateQualificationId != null) {
                requireStableId(stateQualificationId, "stateQualificationId");
            }
        }
    }

    public enum ArchitectureLinkKind { INPUT, GENERATES, TRACE }
    public record ArchitectureLink(String id, String targetContextId, ArchitectureLinkKind kind) {
        public ArchitectureLink {
            requireStableId(id, "architecture link id"); requireStableId(targetContextId, "architecture target context id");
            Objects.requireNonNull(kind, "architecture link kind must not be null");
        }
    }

    public enum ArchitectureLevel { MISSION, FUNCTION, PRODUCT }

    public record Context(
            String id,
            ContextKind kind,
            CapabilityReference capability,
            QualifiedName name,
            List<String> occurrenceIds,
            SourceProvenance source,
            ArchitectureLevel architectureLevel,
            List<ArchitectureLink> architectureLinks) {

        public Context(String id, ContextKind kind, CapabilityReference capability, QualifiedName name,
                       List<String> occurrenceIds, SourceProvenance source) {
            this(id, kind, capability, name, occurrenceIds, source, null, List.of());
        }

        public Context(String id, ContextKind kind, CapabilityReference capability, QualifiedName name,
                       List<String> occurrenceIds, SourceProvenance source, ArchitectureLevel level) {
            this(id, kind, capability, name, occurrenceIds, source, level, List.of());
        }

        public Context {
            architectureLinks = List.copyOf(architectureLinks);
            requireStableId(id, "context id");
            Objects.requireNonNull(kind, "kind must not be null");
            capability = Objects.requireNonNull(capability, "capability must not be null");
            name = Objects.requireNonNull(name, "name must not be null");
            occurrenceIds = immutableStableIds(occurrenceIds, "occurrenceIds");
            source = Objects.requireNonNull(source, "source must not be null");
        }
    }

    public record RefinementEdge(String id, String parentContextId, String childContextId,
                                 String refineeElementId, CoreKind kind) {
        public RefinementEdge {
            requireStableId(id, "refinement id");
            requireStableId(parentContextId, "refinement parentContextId");
            requireStableId(childContextId, "refinement childContextId");
            requireStableId(refineeElementId, "refinement refineeElementId");
            if (kind != CoreKind.OBJECT && kind != CoreKind.PROCESS) {
                throw new IllegalArgumentException("refinement kind must be OBJECT or PROCESS");
            }
        }
    }

    public record Occurrence(
            String id,
            String contextId,
            TargetKind targetKind,
            String targetId,
            OccurrenceOwnership ownership,
            String constructRole,
            String layoutId) {

        public Occurrence {
            requireStableId(id, "occurrence id");
            requireStableId(contextId, "contextId");
            Objects.requireNonNull(targetKind, "targetKind must not be null");
            requireStableId(targetId, "targetId");
            Objects.requireNonNull(ownership, "ownership must not be null");
            requireNonBlank(constructRole, "constructRole");
            requireStableId(layoutId, "layoutId");
        }
    }

    public record StatePresentation(String contextId, String stateId, StateExplicitness explicitness, StateFoldState foldState) {

        public StatePresentation {
            requireStableId(contextId, "contextId");
            requireStableId(stateId, "stateId");
            Objects.requireNonNull(explicitness, "explicitness must not be null");
            Objects.requireNonNull(foldState, "foldState must not be null");
        }
    }

    public record Layout(String id, double x, double y, double width, double height, int zOrder) {

        public Layout {
            requireStableId(id, "layout id");
            if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(width) || !Double.isFinite(height)) {
                throw new IllegalArgumentException("layout geometry must be finite");
            }
        }
    }

    public enum CoreKind { OBJECT, PROCESS, PROFILE_ELEMENT }

    public enum FeatureKind { ATTRIBUTE, OPERATION, PROFILE_FEATURE }

    public enum StateRole { INITIAL, DEFAULT, FINAL }

    public enum FactFamily { TRANSFORMATION, ENABLING, STRUCTURAL, CONTROL, LOGICAL, PROFILE_FACT }

    public enum Direction { DIRECTED, BIDIRECTIONAL, UNDIRECTED, PROFILE_DEFINED }

    public enum CollectionCompleteness { COMPLETE, INCOMPLETE, NOT_APPLICABLE }

    public enum TargetKind { ELEMENT, STATE, FEATURE, FACT }

    public enum ContextKind { SYSTEM_DIAGRAM, PROCESS_REFINEMENT, OBJECT_REFINEMENT, MODEL_VIEW, PROFILE_CONTEXT }

    public enum OccurrenceOwnership { OWNED, REFERENCED, VIEW_DERIVED }

    public enum StateExplicitness { EXPLICIT, SUPPRESSED }

    public enum StateFoldState { UNFOLDED, FOLDED }

    public enum NormalizationLevel { CORE, CONDITIONAL, DERIVED, PROFILE_ONLY, LOSSY, UNMAPPABLE }

    private static List<String> immutableStableIds(List<String> values, String name) {
        List<String> result = List.copyOf(Objects.requireNonNull(values, name + " must not be null"));
        for (String value : result) {
            requireStableId(value, name + " item");
        }
        if (result.size() != Set.copyOf(result).size()) {
            throw new IllegalArgumentException(name + " must not contain duplicates");
        }
        return result;
    }

    private static void requireStableId(String value, String name) {
        if (value == null || !value.matches("[A-Za-z][A-Za-z0-9._:-]{2,127}")) {
            throw new IllegalArgumentException(name + " must be a stable identifier");
        }
    }

    private static void requireNonBlank(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
    }
}
