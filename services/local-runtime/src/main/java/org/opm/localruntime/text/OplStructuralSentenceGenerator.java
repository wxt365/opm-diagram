package org.opm.localruntime.text;

import org.opm.localruntime.semantic.SemanticRevision;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import static org.opm.localruntime.text.OplSemanticSupport.*;

/** 结构关系句型与模板选择；排序、Token 和 Trace 仍由统一流水线负责。 */
final class OplStructuralSentenceGenerator {
    private OplStructuralSentenceGenerator() { }
    static List<String> structuralElementIds(
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (SemanticRevision.Endpoint endpoint : fact.endpoints()) {
            if (endpoint.targetKind() == SemanticRevision.TargetKind.ELEMENT && elements.containsKey(endpoint.targetId())) ids.add(endpoint.targetId());
            if (endpoint.targetKind() == SemanticRevision.TargetKind.FEATURE && features.containsKey(endpoint.targetId())) ids.add(features.get(endpoint.targetId()).ownerElementId());
            if (endpoint.targetKind() == SemanticRevision.TargetKind.STATE) {
                SemanticRevision.State state = states.get(endpoint.targetId());
                if (state == null) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural state endpoint does not exist");
                if (state.ownerTargetKind() == SemanticRevision.TargetKind.ELEMENT) ids.add(state.ownerElementId());
                else {
                    SemanticRevision.Feature feature = features.get(state.ownerElementId());
                    if (feature == null) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural feature state owner does not exist");
                    ids.add(feature.ownerElementId());
                }
            }
        }
        if (ids.isEmpty()) throw failure(OplGenerationCode.TEXT_TRACE_INCOMPLETE, "Structural trace has no input elements");
        return List.copyOf(ids);
    }

    static List<StructuralSentence> structuralSentences(
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            SemanticRevision.AssetReference profile) {
        String capability = fact.capability().capabilityId();
        java.util.function.Function<String, String> name = role -> structuralName(endpoint(fact, role), elements, features, states);
        return switch (capability) {
            case "CAP-ISO-STRUCT-001" -> { requireSameThingKind(fact, elements); yield List.of(structural(fact, "opl.structural.tagged.unidirectional.v1", name.apply("STRUCTURAL_SOURCE") + " " + label(fact, "forward_tag") + " " + name.apply("STRUCTURAL_TARGET") + ".", name.apply("STRUCTURAL_SOURCE"))); }
            case "CAP-ISO-STRUCT-002" -> { requireSameThingKind(fact, elements); yield List.of(structural(fact, "opl.structural.null-tagged.unidirectional.v1", name.apply("STRUCTURAL_SOURCE") + " relates to " + name.apply("STRUCTURAL_TARGET") + ".", name.apply("STRUCTURAL_SOURCE"))); }
            case "CAP-ISO-STRUCT-003" -> { requireSameThingKind(fact, elements); yield List.of(
                    structural(fact, "opl.structural.tagged.bidirectional.forward.v1", name.apply("STRUCTURAL_SOURCE") + " " + label(fact, "forward_tag") + " " + name.apply("STRUCTURAL_TARGET") + ".", name.apply("STRUCTURAL_SOURCE")),
                    structural(fact, "opl.structural.tagged.bidirectional.reverse.v1", name.apply("STRUCTURAL_TARGET") + " " + label(fact, "reverse_tag") + " " + name.apply("STRUCTURAL_SOURCE") + ".", name.apply("STRUCTURAL_TARGET"))); }
            case "CAP-ISO-STRUCT-004" -> { requireSameThingKind(fact, elements); yield List.of(structural(fact, hasLabel(fact, "reciprocal") ? "opl.structural.tagged.reciprocal.v1" : "opl.structural.null-tagged.reciprocal.v1",
                    name.apply("STRUCTURAL_SOURCE") + " and " + name.apply("STRUCTURAL_TARGET") + (hasLabel(fact, "reciprocal") ? " are " + label(fact, "reciprocal") : " are related") + ".", name.apply("STRUCTURAL_SOURCE"))); }
            case "CAP-ISO-STRUCT-005" -> fundamentalAggregation(fact, name, elements, features, states);
            case "CAP-ISO-STRUCT-006" -> fundamentalCharacterization(fact, name, elements, features, states, profile);
            case "CAP-ISO-STRUCT-007" -> fundamentalGeneralization(fact, name, elements, features, states);
            case "CAP-ISO-STRUCT-008" -> fundamentalClassification(fact, name, elements, features, states);
            case "CAP-ISO-STRUCT-009" -> List.of(stateCharacterization(fact, name, elements, features, states));
            case "CAP-ISO-STRUCT-010" -> stateTagged(fact, name, elements, states);
            default -> throw failure(OplGenerationCode.TEXT_CAPABILITY_UNSUPPORTED, "Structural OPL does not support capability " + capability);
        };
    }

    static void requireSameThingKind(SemanticRevision.Fact fact, Map<String, SemanticRevision.Element> elements) {
        SemanticRevision.Element source = requireElement(endpoint(fact, "STRUCTURAL_SOURCE"), elements, "structural source");
        SemanticRevision.Element target = requireElement(endpoint(fact, "STRUCTURAL_TARGET"), elements, "structural target");
        if (source.coreKind() != target.coreKind()) {
            throw structuralEndpointMismatch(fact, "Tagged Structural endpoints must have the same Thing kind");
        }
    }

    static List<StructuralSentence> fundamentalAggregation(SemanticRevision.Fact fact, java.util.function.Function<String, String> name,
                                                              Map<String, SemanticRevision.Element> elements, Map<String, SemanticRevision.Feature> features, Map<String, SemanticRevision.State> states) {
        List<SemanticRevision.Endpoint> parts = sameThingFanEndpoints(fact, "WHOLE_THING", "PART_THING", elements);
        String whole = name.apply("WHOLE_THING");
        String list = joinList(parts.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList());
        boolean incomplete = fact.collectionCompleteness() == SemanticRevision.CollectionCompleteness.INCOMPLETE;
        return List.of(structural(fact, incomplete ? "opl.structural.aggregation.incomplete.v1" : "opl.structural.aggregation.complete.v1",
                whole + " consists of " + list + (incomplete ? " and at least one other part" : "") + ".", whole));
    }

    static List<StructuralSentence> fundamentalCharacterization(SemanticRevision.Fact fact, java.util.function.Function<String, String> name,
                                                                   Map<String, SemanticRevision.Element> elements, Map<String, SemanticRevision.Feature> features,
                                                                   Map<String, SemanticRevision.State> states, SemanticRevision.AssetReference profile) {
        if ("OPL_PRODUCTION".equals(fact.source().sourceKind())) {
            return explicitExhibition(fact, elements, features, states, profile);
        }
        List<SemanticRevision.Endpoint> featuresEndpoints = fanEndpoints(fact, "EXHIBITOR_THING", "FEATURE_THING");
        String exhibitor = name.apply("EXHIBITOR_THING");
        List<SemanticRevision.Endpoint> attributes = featuresEndpoints.stream().filter(endpoint -> featureKind(endpoint, features) == SemanticRevision.FeatureKind.ATTRIBUTE).toList();
        List<SemanticRevision.Endpoint> operations = featuresEndpoints.stream().filter(endpoint -> featureKind(endpoint, features) == SemanticRevision.FeatureKind.OPERATION).toList();
        boolean incomplete = fact.collectionCompleteness() == SemanticRevision.CollectionCompleteness.INCOMPLETE;
        if (!attributes.isEmpty() && !operations.isEmpty()) {
            SemanticRevision.Element exhibitorElement = requireElement(endpoint(fact, "EXHIBITOR_THING"), elements, "exhibitor");
            boolean objectFirst = exhibitorElement.coreKind() == SemanticRevision.CoreKind.OBJECT;
            List<SemanticRevision.Endpoint> primary = objectFirst ? attributes : operations;
            List<SemanticRevision.Endpoint> secondary = objectFirst ? operations : attributes;
            String primaryKind = objectFirst ? "attribute" : "operator";
            String secondaryKind = objectFirst ? "operator" : "attribute";
            String primaryList = joinList(primary.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList());
            String secondaryList = joinList(secondary.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList());
            String suffix = incomplete ? ", and at least one other " + primaryKind + ", as well as " + secondaryList
                    + ", and at least one other " + secondaryKind : ", as well as " + secondaryList;
            return List.of(structural(fact, incomplete ? "opl.structural.characterization.mixed.incomplete.v1" : "opl.structural.characterization.mixed.complete.v1",
                    exhibitor + " exhibits " + primaryList + suffix + ".", exhibitor));
        }
        List<SemanticRevision.Endpoint> sameKind = attributes.isEmpty() ? operations : attributes;
        String kind = attributes.isEmpty() ? "operator" : "attribute";
        String list = joinList(sameKind.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList());
        return List.of(structural(fact, incomplete ? "opl.structural.characterization.incomplete.v1" : "opl.structural.characterization.complete.v1",
                exhibitor + " exhibits " + list + (incomplete ? ", and at least one other " + kind : "") + ".", exhibitor));
    }

    static List<StructuralSentence> explicitExhibition(
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            SemanticRevision.AssetReference profile) {
        if (!"opl.structural.exhibition.v1".equals(fact.source().sourceEntityId())
                || !profile.id().equals(fact.source().profileId()) || !profile.version().equals(fact.source().profileVersion())
                || !profile.id().equals(fact.capability().profileId()) || !profile.version().equals(fact.capability().profileVersion())) {
            throw failure(OplGenerationCode.TEXT_PRODUCTION_IDENTITY_INVALID, "Structural Exhibition production identity is invalid");
        }
        List<SemanticRevision.Endpoint> endpoints = fact.endpoints().stream().sorted(Comparator.comparingInt(SemanticRevision.Endpoint::ordinal)).toList();
        if (endpoints.size() < 3 || fact.collectionCompleteness() != SemanticRevision.CollectionCompleteness.COMPLETE) {
            throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural Exhibition endpoints or completeness are invalid");
        }
        for (int index = 0; index < endpoints.size(); index++) {
            if (endpoints.get(index).ordinal() != index) {
                throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural Exhibition endpoint ordinals are not contiguous");
            }
        }
        SemanticRevision.Element exhibitor = requireElement(endpoints.getFirst(), elements, "exhibitor");
        List<SemanticRevision.Endpoint> featureEndpoints = endpoints.subList(1, endpoints.size());
        if (featureEndpoints.stream().map(SemanticRevision.Endpoint::targetId).distinct().count() != featureEndpoints.size()) {
            throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural Exhibition feature endpoints must be unique");
        }
        for (SemanticRevision.Endpoint endpoint : featureEndpoints) {
            SemanticRevision.Feature feature = features.get(endpoint.targetId());
            if (endpoint.targetKind() != SemanticRevision.TargetKind.FEATURE || feature == null
                    || (feature.kind() != SemanticRevision.FeatureKind.ATTRIBUTE && feature.kind() != SemanticRevision.FeatureKind.OPERATION)
                    || !exhibitor.id().equals(feature.ownerElementId())) {
                throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural Exhibition feature endpoint is invalid");
            }
        }
        SemanticRevision.Endpoint firstFeature = featureEndpoints.getFirst();
        List<SemanticRevision.Endpoint> values = featureEndpoints.subList(1, featureEndpoints.size());
        List<SemanticRevision.Endpoint> attributes = values.stream().filter(endpoint -> featureKind(endpoint, features) == SemanticRevision.FeatureKind.ATTRIBUTE).toList();
        List<SemanticRevision.Endpoint> operations = values.stream().filter(endpoint -> featureKind(endpoint, features) == SemanticRevision.FeatureKind.OPERATION).toList();
        List<SemanticRevision.Endpoint> primary = exhibitor.coreKind() == SemanticRevision.CoreKind.OBJECT ? attributes : operations;
        List<SemanticRevision.Endpoint> secondary = exhibitor.coreKind() == SemanticRevision.CoreKind.OBJECT ? operations : attributes;
        String valuesText = primary.isEmpty() || secondary.isEmpty()
                ? joinList(values.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList())
                : joinList(primary.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList()) + " as well as "
                + joinList(secondary.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList());
        return List.of(structural(fact, "opl.structural.exhibition.v1",
                structuralName(firstFeature, elements, features, states) + " of " + exhibitor.name().localName() + " is " + valuesText + ".", exhibitor.name().localName()));
    }

    static List<StructuralSentence> fundamentalGeneralization(SemanticRevision.Fact fact, java.util.function.Function<String, String> name,
                                                                 Map<String, SemanticRevision.Element> elements, Map<String, SemanticRevision.Feature> features, Map<String, SemanticRevision.State> states) {
        List<SemanticRevision.Endpoint> specialized = sameThingFanEndpoints(fact, "GENERAL_THING", "SPECIALIZED_THING", elements);
        String general = name.apply("GENERAL_THING");
        List<String> values = specialized.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList();
        boolean incomplete = fact.collectionCompleteness() == SemanticRevision.CollectionCompleteness.INCOMPLETE;
        String template = incomplete ? "opl.structural.generalization.incomplete.v1" : values.size() == 1
                ? generalizationSingleTemplate(specialized.getFirst(), endpoint(fact, "GENERAL_THING"), elements) : "opl.structural.generalization.multiple.v1";
        String text = values.size() == 1 && !incomplete ? values.getFirst() + ("opl.structural.generalization.object.single.v1".equals(template) ? " is a " : " is ") + general + "."
                : joinList(values) + (incomplete ? " and other specializations are " : " are ") + general + ".";
        return List.of(structural(fact, template, text, general));
    }

    static List<StructuralSentence> fundamentalClassification(SemanticRevision.Fact fact, java.util.function.Function<String, String> name,
                                                                 Map<String, SemanticRevision.Element> elements, Map<String, SemanticRevision.Feature> features, Map<String, SemanticRevision.State> states) {
        if (fact.collectionCompleteness() != SemanticRevision.CollectionCompleteness.NOT_APPLICABLE) throw failure(OplGenerationCode.MODIFIER_COMBINATION_INVALID, "Classification does not support completeness");
        List<SemanticRevision.Endpoint> instances = sameThingFanEndpoints(fact, "CLASS_THING", "INSTANCE_THING", elements);
        String type = name.apply("CLASS_THING");
        List<String> values = instances.stream().map(endpoint -> structuralName(endpoint, elements, features, states)).toList();
        String template = values.size() == 1 ? "opl.structural.classification.single.v1" : "opl.structural.classification.multiple.v1";
        String text = values.size() == 1 ? values.getFirst() + " is an instance of " + type + "." : joinList(values) + " are instances of " + type + ".";
        return List.of(structural(fact, template, text, type));
    }

    static List<StructuralSentence> stateTagged(
            SemanticRevision.Fact fact,
            java.util.function.Function<String, String> name,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.State> states) {
        requireStateTaggedObject(endpoint(fact, "STATE_TAGGED_SOURCE"), elements, states);
        requireStateTaggedObject(endpoint(fact, "STATE_TAGGED_TARGET"), elements, states);
        String source = name.apply("STATE_TAGGED_SOURCE"); String target = name.apply("STATE_TAGGED_TARGET");
        return switch (fact.direction()) {
            case DIRECTED -> List.of(structural(fact, "opl.structural.tagged.state.unidirectional.v1", source + " " + (hasLabel(fact, "forward_tag") ? label(fact, "forward_tag") : "relates to") + " " + target + ".", source));
            case BIDIRECTIONAL -> List.of(structural(fact, "opl.structural.tagged.state.bidirectional.forward.v1", source + " " + label(fact, "forward_tag") + " " + target + ".", source),
                    structural(fact, "opl.structural.tagged.state.bidirectional.reverse.v1", target + " " + label(fact, "reverse_tag") + " " + source + ".", target));
            case UNDIRECTED -> List.of(structural(fact, "opl.structural.tagged.state.reciprocal.v1", source + " and " + target + (hasLabel(fact, "reciprocal_tag") ? " are " + label(fact, "reciprocal_tag") : " are related") + ".", source));
            default -> throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "State-tagged Structural direction is unsupported");
        };
    }

    static void requireStateTaggedObject(
            SemanticRevision.Endpoint endpoint,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.State> states) {
        SemanticRevision.Element object = endpoint.targetKind() == SemanticRevision.TargetKind.ELEMENT ? elements.get(endpoint.targetId())
                : states.containsKey(endpoint.targetId()) ? elements.get(states.get(endpoint.targetId()).ownerElementId()) : null;
        if (object == null || object.coreKind() != SemanticRevision.CoreKind.OBJECT) {
            throw structuralEndpointMismatch(null, "State-specified Tagged Structural only accepts Objects or owned Object States");
        }
    }

    static StructuralSentence stateCharacterization(
            SemanticRevision.Fact fact,
            java.util.function.Function<String, String> name,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        SemanticRevision.Endpoint specializedObject = endpoint(fact, "EXHIBITOR_THING_OR_STATE");
        SemanticRevision.Element object = specializedObject.targetKind() == SemanticRevision.TargetKind.ELEMENT ? elements.get(specializedObject.targetId()) : null;
        if (object == null || object.coreKind() != SemanticRevision.CoreKind.OBJECT) {
            throw structuralEndpointMismatch(fact, "State Characterization source must be an Object");
        }
        SemanticRevision.Endpoint valueState = endpoint(fact, "VALUE_STATE");
        SemanticRevision.State state = valueState.targetKind() == SemanticRevision.TargetKind.STATE ? states.get(valueState.targetId()) : null;
        SemanticRevision.Feature attribute = state != null && state.ownerTargetKind() == SemanticRevision.TargetKind.FEATURE ? features.get(state.ownerElementId()) : null;
        if (attribute == null || attribute.kind() != SemanticRevision.FeatureKind.ATTRIBUTE) {
            throw structuralEndpointMismatch(fact, "State Characterization requires an Attribute Value State");
        }
        if (!object.id().equals(attribute.ownerElementId())) {
            throw failure(OplGenerationCode.STATE_OWNER_MISMATCH, "State Characterization value state must belong to the specialized Object");
        }
        return structural(fact, "opl.structural.characterization.state.v1",
                name.apply("EXHIBITOR_THING_OR_STATE") + " exhibits " + state.name().localName() + " " + attribute.name().localName() + ".",
                name.apply("EXHIBITOR_THING_OR_STATE"));
    }

    static SemanticRevision.FeatureKind featureKind(SemanticRevision.Endpoint endpoint, Map<String, SemanticRevision.Feature> features) {
        SemanticRevision.Feature feature = features.get(endpoint.targetId());
        if (feature == null || (feature.kind() != SemanticRevision.FeatureKind.ATTRIBUTE && feature.kind() != SemanticRevision.FeatureKind.OPERATION)) {
            throw structuralEndpointMismatch(null, "Characterization endpoint must be an Attribute or Operation");
        }
        return feature.kind();
    }

    static String generalizationSingleTemplate(
            SemanticRevision.Endpoint specialized,
            SemanticRevision.Endpoint general,
            Map<String, SemanticRevision.Element> elements) {
        SemanticRevision.Element specializedElement = requireElement(specialized, elements, "specialized thing");
        SemanticRevision.Element generalElement = requireElement(general, elements, "general thing");
        if (specializedElement.coreKind() != generalElement.coreKind()) {
            throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Generalization endpoints must have the same Thing kind");
        }
        return specializedElement.coreKind() == SemanticRevision.CoreKind.OBJECT
                ? "opl.structural.generalization.object.single.v1" : "opl.structural.generalization.process.single.v1";
    }

    static StructuralSentence structural(SemanticRevision.Fact fact, String templateId, String text, String ignoredPrimarySubjectName) {
        String primarySubjectStableId = fact.endpoints().stream().min(Comparator.comparingInt(SemanticRevision.Endpoint::ordinal))
                .map(SemanticRevision.Endpoint::targetId)
                .orElseThrow(() -> failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural Fact has no endpoints"));
        return new StructuralSentence(templateId, text, primarySubjectStableId);
    }
    static String label(SemanticRevision.Fact fact, String slot) { return fact.labels().stream().filter(item -> slot.equals(item.slotId())).map(SemanticRevision.Label::text).findFirst().orElseThrow(() -> failure(OplGenerationCode.MODIFIER_COMBINATION_INVALID, "Structural label " + slot + " is missing")); }
    static boolean hasLabel(SemanticRevision.Fact fact, String slot) { return fact.labels().stream().anyMatch(item -> slot.equals(item.slotId())); }
    static List<SemanticRevision.Endpoint> fanEndpoints(SemanticRevision.Fact fact, String rootRole, String memberRole) { List<SemanticRevision.Endpoint> endpoints = fact.endpoints().stream().sorted(Comparator.comparingInt(SemanticRevision.Endpoint::ordinal)).toList(); if (endpoints.size() < 2 || !rootRole.equals(endpoints.getFirst().role()) || endpoints.getFirst().ordinal() != 0 || endpoints.stream().skip(1).anyMatch(endpoint -> !memberRole.equals(endpoint.role()) || endpoint.ordinal() < 1)) throw structuralEndpointMismatch(fact, "Structural fan endpoints are invalid"); for (int i = 0; i < endpoints.size(); i++) if (endpoints.get(i).ordinal() != i) throw structuralEndpointMismatch(fact, "Structural fan endpoint ordinals are not contiguous"); return endpoints.subList(1, endpoints.size()); }
    static List<SemanticRevision.Endpoint> sameThingFanEndpoints(SemanticRevision.Fact fact, String rootRole, String memberRole, Map<String, SemanticRevision.Element> elements) { List<SemanticRevision.Endpoint> members = fanEndpoints(fact, rootRole, memberRole); SemanticRevision.Element root = requireElement(endpoint(fact, rootRole), elements, rootRole); for (SemanticRevision.Endpoint member : members) if (requireElement(member, elements, memberRole).coreKind() != root.coreKind()) throw structuralEndpointMismatch(fact, "Structural fan endpoints must have the same Thing kind"); return members; }
    static String joinList(List<String> values) { if (values.isEmpty()) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural list is empty"); if (values.size() == 1) return values.getFirst(); if (values.size() == 2) return values.getFirst() + " and " + values.get(1); return String.join(", ", values.subList(0, values.size() - 1)) + " and " + values.getLast(); }
    static String structuralName(SemanticRevision.Endpoint endpoint, Map<String, SemanticRevision.Element> elements, Map<String, SemanticRevision.Feature> features, Map<String, SemanticRevision.State> states) { if (endpoint.targetKind() == SemanticRevision.TargetKind.ELEMENT) return requireElement(endpoint, elements, endpoint.role()).name().localName(); if (endpoint.targetKind() == SemanticRevision.TargetKind.FEATURE) { SemanticRevision.Feature feature = features.get(endpoint.targetId()); if (feature == null) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural feature does not exist"); return feature.name().localName(); } if (endpoint.targetKind() == SemanticRevision.TargetKind.STATE) { SemanticRevision.State state = states.get(endpoint.targetId()); if (state == null) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural state does not exist"); if (state.ownerTargetKind() == SemanticRevision.TargetKind.ELEMENT) { SemanticRevision.Element owner = elements.get(state.ownerElementId()); if (owner == null) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural state owner does not exist"); return state.name().localName() + " " + owner.name().localName(); } return state.name().localName(); } throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Structural endpoint kind is unsupported"); }
    static String ownerFeatureName(SemanticRevision.Endpoint endpoint, Map<String, SemanticRevision.State> states, Map<String, SemanticRevision.Feature> features) { SemanticRevision.State state = states.get(endpoint.targetId()); SemanticRevision.Feature feature = state == null ? null : features.get(state.ownerElementId()); if (feature == null) throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Value state feature owner does not exist"); return feature.name().localName(); }

    static OplGenerationException structuralEndpointMismatch(SemanticRevision.Fact fact, String reason) {
        return failure(OplGenerationCode.ENDPOINT_KIND_MISMATCH, "Structural endpoint mismatch" + (fact == null ? "" : " for " + fact.id()) + ": " + reason);
    }

    private static SemanticRevision.Endpoint endpoint(SemanticRevision.Fact fact, String role) {
        return fact.endpoints().stream().filter(endpoint -> role.equals(endpoint.role())).findFirst()
                .orElseThrow(() -> failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, "Consumption endpoint " + role + " is missing"));
    }

    private static SemanticRevision.Element requireElement(
            SemanticRevision.Endpoint endpoint,
            Map<String, SemanticRevision.Element> elements,
            String meaning) {
        if (endpoint.targetKind() != SemanticRevision.TargetKind.ELEMENT) {
            throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, meaning + " must be an Element");
        }
        SemanticRevision.Element element = elements.get(endpoint.targetId());
        if (element == null) {
            throw failure(OplGenerationCode.TEXT_PLAN_UNSUPPORTED, meaning + " does not exist");
        }
        return element;
    }

    record StructuralSentence(String templateId, String text, String primarySubjectId) { }
}
