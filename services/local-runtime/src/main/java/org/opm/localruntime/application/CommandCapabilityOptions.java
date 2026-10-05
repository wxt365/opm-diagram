package org.opm.localruntime.application;

import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.api.generated.ApiEdtContract;
import java.util.ArrayList;
import java.util.List;
import static org.opm.localruntime.application.RuntimeActiveBindingProvider.*;
import static org.opm.localruntime.application.SemanticViewSupport.digest;

/** 候选构建和端点规范化；不执行命令，不拥有事务或授权状态。 */
final class CommandCapabilityOptions {
    private CommandCapabilityOptions() { }

    static String capabilityQueryId(String projectId, String modelId, String revisionId, String selectionId, String intent, List<String> endpointIds) {
        List<String> canonicalEndpoints = endpointIds.stream().sorted().toList();
        return "capability.query." + digest(projectId + ":" + modelId + ":" + revisionId + ":" + (selectionId == null ? "" : selectionId)
                + ":" + (intent == null ? "" : intent) + ":" + String.join(":", canonicalEndpoints)).substring(0, 32);
    }

    static List<ApiEdtContract.CommandCapabilityOption> factOptions(String queryId, SemanticRevision revision, List<String> endpointIds) {
        List<ApiEdtContract.CommandCapabilityOption> options = new ArrayList<>(proceduralFactOptions(queryId, revision, endpointIds));
        options.addAll(structuralFactOptions(queryId, revision, endpointIds));
        return List.copyOf(options);
    }

    static List<ApiEdtContract.CommandCapabilityOption> proceduralFactOptions(String queryId, SemanticRevision revision, List<String> endpointIds) {
        List<ProceduralTarget> selected = endpointIds.stream().map(id -> proceduralTarget(revision, id)).toList();
        if (selected.stream().anyMatch(java.util.Objects::isNull)) return List.of();
        return ProceduralLinkCatalog.all().stream()
                .flatMap(descriptor -> normalizeProceduralEndpoints(descriptor, selected).stream()
                        .map(endpoints -> proceduralFactOption(queryId, revision.revisionId(), ApiEdtContract.CommandType.CREATE_FACT, descriptor, endpoints)))
                .toList();
    }

    static List<ApiEdtContract.CommandCapabilityOption> proceduralFactUpdateOptions(String queryId, SemanticRevision revision,
                                                                                       SemanticRevision.Fact fact, List<String> endpointIds) {
        if (fact == null) return List.of();
        ProceduralLinkCatalog.Descriptor descriptor = ProceduralLinkCatalog.find(fact.capability().capabilityId()).orElse(null);
        if (descriptor == null) return structuralFactUpdateOptions(queryId, revision, fact, endpointIds);
        List<ProceduralTarget> selected = endpointIds.stream().map(id -> proceduralTarget(revision, id)).toList();
        if (selected.stream().anyMatch(java.util.Objects::isNull)) return List.of();
        return normalizeProceduralEndpoints(descriptor, selected).map(endpoints -> {
            List<ApiEdtContract.CommandCapabilityOption> options = new ArrayList<>();
            options.add(proceduralFactOption(queryId, revision.revisionId(), ApiEdtContract.CommandType.UPDATE_FACT, descriptor, endpoints));
            if (hasValidControlPair(fact.modifiers())) options.add(removeControlOption(queryId, revision.revisionId(), fact, descriptor, endpoints));
            ControlLinkCatalog.forBase(descriptor.capabilityId()).forEach(control -> options.add(controlFactOption(queryId, revision.revisionId(), control, descriptor.capabilityId(), endpoints)));
            return List.copyOf(options);
        }).orElseGet(List::of);
    }

    static List<ApiEdtContract.CommandCapabilityOption> structuralFactOptions(String queryId, SemanticRevision revision, List<String> endpointIds) {
        List<StructuralTarget> selected = endpointIds.stream().map(id -> structuralTarget(revision, id)).toList();
        if (selected.stream().anyMatch(java.util.Objects::isNull)) return List.of();
        return StructuralLinkCatalog.all().stream()
                .flatMap(descriptor -> normalizeStructuralEndpoints(descriptor, selected).stream()
                        .map(endpoints -> structuralFactOption(queryId, revision.revisionId(), ApiEdtContract.CommandType.CREATE_FACT, descriptor, endpoints)))
                .toList();
    }

    static List<ApiEdtContract.CommandCapabilityOption> structuralFactUpdateOptions(String queryId, SemanticRevision revision,
                                                                                       SemanticRevision.Fact fact, List<String> endpointIds) {
        StructuralLinkCatalog.Descriptor descriptor = StructuralLinkCatalog.find(fact.capability().capabilityId()).orElse(null);
        if (descriptor == null) return List.of();
        List<StructuralTarget> selected = endpointIds.stream().map(id -> structuralTarget(revision, id)).toList();
        if (selected.stream().anyMatch(java.util.Objects::isNull)) return List.of();
        return normalizeStructuralEndpoints(descriptor, selected)
                .map(endpoints -> List.of(structuralFactOption(queryId, revision.revisionId(), ApiEdtContract.CommandType.UPDATE_FACT, descriptor, endpoints)))
                .orElseGet(List::of);
    }

    static ProceduralTarget proceduralTarget(SemanticRevision revision, String id) {
        SemanticRevision.Element element = revision.elements().stream().filter(item -> item.id().equals(id)).findFirst().orElse(null);
        if (element != null) {
            return new ProceduralTarget(element.coreKind() == SemanticRevision.CoreKind.OBJECT ? ProceduralLinkCatalog.Kind.OBJECT : ProceduralLinkCatalog.Kind.PROCESS,
                    SemanticRevision.TargetKind.ELEMENT, element.id());
        }
        SemanticRevision.State state = revision.states().stream().filter(item -> item.id().equals(id)).findFirst().orElse(null);
        return state == null ? null : new ProceduralTarget(ProceduralLinkCatalog.Kind.STATE, SemanticRevision.TargetKind.STATE, state.id());
    }

    static StructuralTarget structuralTarget(SemanticRevision revision, String id) {
        SemanticRevision.Element element = revision.elements().stream().filter(item -> item.id().equals(id)).findFirst().orElse(null);
        if (element != null && (element.coreKind() == SemanticRevision.CoreKind.OBJECT || element.coreKind() == SemanticRevision.CoreKind.PROCESS)) {
            return new StructuralTarget(element.coreKind(), SemanticRevision.TargetKind.ELEMENT, element.id(), false);
        }
        SemanticRevision.Feature feature = revision.features().stream().filter(item -> item.id().equals(id)).findFirst().orElse(null);
        if (feature != null && (feature.kind() == SemanticRevision.FeatureKind.ATTRIBUTE || feature.kind() == SemanticRevision.FeatureKind.OPERATION)) {
            return new StructuralTarget(null, SemanticRevision.TargetKind.FEATURE, feature.id(), false);
        }
        SemanticRevision.State state = revision.states().stream().filter(item -> item.id().equals(id)).findFirst().orElse(null);
        if (state == null) return null;
        if (state.ownerTargetKind() == SemanticRevision.TargetKind.FEATURE) {
            return new StructuralTarget(null, SemanticRevision.TargetKind.STATE, state.id(), true);
        }
        SemanticRevision.Element owner = revision.elements().stream().filter(item -> item.id().equals(state.ownerElementId())).findFirst().orElse(null);
        if (owner == null || (owner.coreKind() != SemanticRevision.CoreKind.OBJECT && owner.coreKind() != SemanticRevision.CoreKind.PROCESS)) return null;
        return new StructuralTarget(owner.coreKind(), SemanticRevision.TargetKind.STATE, state.id(), false);
    }

    static java.util.Optional<List<ApiEdtContract.NormalizedEndpoint>> normalizeStructuralEndpoints(
            StructuralLinkCatalog.Descriptor descriptor, List<StructuralTarget> selected) {
        if (descriptor.shape() == StructuralLinkCatalog.Shape.EXHIBITION_FAN) {
            List<StructuralTarget> exhibitors = selected.stream()
                    .filter(item -> item.targetKind() == SemanticRevision.TargetKind.ELEMENT)
                    .toList();
            if (selected.size() < 2 || exhibitors.size() != 1
                    || selected.stream().anyMatch(item -> item.targetKind() != SemanticRevision.TargetKind.ELEMENT
                    && item.targetKind() != SemanticRevision.TargetKind.FEATURE)) return java.util.Optional.empty();
            List<ApiEdtContract.NormalizedEndpoint> endpoints = new ArrayList<>();
            endpoints.add(endpoint("EXHIBITOR_THING", exhibitors.getFirst(), 0));
            selected.stream().filter(item -> item.targetKind() == SemanticRevision.TargetKind.FEATURE)
                    .forEach(item -> endpoints.add(endpoint("FEATURE_THING", item, endpoints.size())));
            return java.util.Optional.of(List.copyOf(endpoints));
        }
        if (descriptor.shape() == StructuralLinkCatalog.Shape.STATE_CHARACTERIZATION) {
            List<StructuralTarget> valueStates = selected.stream().filter(StructuralTarget::featureValueState).toList();
            List<StructuralTarget> exhibitors = selected.stream().filter(item -> !item.featureValueState()).toList();
            if (selected.size() != 2 || valueStates.size() != 1 || exhibitors.size() != 1
                    || (exhibitors.getFirst().targetKind() != SemanticRevision.TargetKind.ELEMENT
                    && exhibitors.getFirst().targetKind() != SemanticRevision.TargetKind.STATE)) return java.util.Optional.empty();
            return java.util.Optional.of(List.of(endpoint("EXHIBITOR_THING_OR_STATE", exhibitors.getFirst(), 0),
                    endpoint("VALUE_STATE", valueStates.getFirst(), 1)));
        }
        if (descriptor.shape() == StructuralLinkCatalog.Shape.BINARY_SAME_THING) {
            if (selected.size() != 2 || selected.stream().anyMatch(item -> item.targetKind() != SemanticRevision.TargetKind.ELEMENT)
                    || selected.getFirst().coreKind() != selected.get(1).coreKind()) return java.util.Optional.empty();
            return java.util.Optional.of(List.of(endpoint("STRUCTURAL_SOURCE", selected.getFirst(), 0), endpoint("STRUCTURAL_TARGET", selected.get(1), 1)));
        }
        if (descriptor.shape() == StructuralLinkCatalog.Shape.STATE_TAGGED) {
            if (selected.size() != 2 || selected.stream().anyMatch(StructuralTarget::featureValueState) || selected.stream().noneMatch(item -> item.targetKind() == SemanticRevision.TargetKind.STATE)
                    || selected.getFirst().coreKind() != selected.get(1).coreKind()) return java.util.Optional.empty();
            return java.util.Optional.of(List.of(endpoint("STATE_TAGGED_SOURCE", selected.getFirst(), 0), endpoint("STATE_TAGGED_TARGET", selected.get(1), 1)));
        }
        if (selected.size() < 2 || selected.stream().anyMatch(item -> item.targetKind() != SemanticRevision.TargetKind.ELEMENT)
                || selected.stream().map(StructuralTarget::coreKind).distinct().count() != 1) return java.util.Optional.empty();
        String rootRole = switch (descriptor.shape()) {
            case AGGREGATION_FAN -> "WHOLE_THING";
            case GENERALIZATION_FAN -> "GENERAL_THING";
            case CLASSIFICATION_FAN -> "CLASS_THING";
            default -> throw new IllegalStateException("Unsupported structural fan shape");
        };
        String memberRole = switch (descriptor.shape()) {
            case AGGREGATION_FAN -> "PART_THING";
            case GENERALIZATION_FAN -> "SPECIALIZED_THING";
            case CLASSIFICATION_FAN -> "INSTANCE_THING";
            default -> throw new IllegalStateException("Unsupported structural fan shape");
        };
        List<ApiEdtContract.NormalizedEndpoint> endpoints = new ArrayList<>();
        endpoints.add(endpoint(rootRole, selected.getFirst(), 0));
        for (int index = 1; index < selected.size(); index++) endpoints.add(endpoint(memberRole, selected.get(index), index));
        return java.util.Optional.of(List.copyOf(endpoints));
    }

    static ApiEdtContract.NormalizedEndpoint endpoint(String role, StructuralTarget target, int ordinal) {
        return new ApiEdtContract.NormalizedEndpoint(role, new ApiEdtContract.TargetLocator(target.targetKind().name(), target.id(), null), ordinal, null);
    }

    static java.util.Optional<List<ApiEdtContract.NormalizedEndpoint>> normalizeProceduralEndpoints(
            ProceduralLinkCatalog.Descriptor descriptor,
            List<ProceduralTarget> selected) {
        if (descriptor.endpointRoles().size() != selected.size()) return java.util.Optional.empty();
        List<ProceduralTarget> remaining = new ArrayList<>(selected);
        List<ApiEdtContract.NormalizedEndpoint> normalized = new ArrayList<>();
        for (int ordinal = 0; ordinal < descriptor.endpointRoles().size(); ordinal++) {
            ProceduralLinkCatalog.EndpointRole role = descriptor.endpointRoles().get(ordinal);
            int index = -1;
            for (int candidate = 0; candidate < remaining.size(); candidate++) {
                if (remaining.get(candidate).kind() == role.kind()) {
                    index = candidate;
                    break;
                }
            }
            if (index < 0) return java.util.Optional.empty();
            ProceduralTarget target = remaining.remove(index);
            normalized.add(new ApiEdtContract.NormalizedEndpoint(role.role(), new ApiEdtContract.TargetLocator(target.targetKind().name(), target.id(), null), ordinal, null));
        }
        if (descriptor.sameProcessRequired() && !normalized.getFirst().targetRef().targetId().equals(normalized.get(1).targetRef().targetId())) {
            return java.util.Optional.empty();
        }
        return java.util.Optional.of(List.copyOf(normalized));
    }

    static ApiEdtContract.CommandCapabilityOption proceduralFactOption(
            String queryId,
            String revisionId,
            ApiEdtContract.CommandType commandType,
            ProceduralLinkCatalog.Descriptor descriptor,
            List<ApiEdtContract.NormalizedEndpoint> endpoints) {
        List<ApiEdtContract.RequiredField> fields = new ArrayList<>(List.of(
                new ApiEdtContract.RequiredField("normalized_endpoints", "ENDPOINT", true, List.of()),
                new ApiEdtContract.RequiredField("layout", "LAYOUT", true, List.of())));
        if (descriptor.durationRequired()) fields.add(new ApiEdtContract.RequiredField("duration", "TEXT", true, List.of()));
        List<ApiEdtContract.AllowedModifier> modifiers = descriptor.durationRequired()
                ? List.of(new ApiEdtContract.AllowedModifier("duration", List.of(), 1, 1, null)) : List.of();
        return new ApiEdtContract.CommandCapabilityOption(queryId, proceduralFactOptionId(queryId, descriptor.capabilityId()),
                commandType, descriptor.capabilityId(), null, descriptor.displayName(), List.of("过程关系"), endpoints, fields, modifiers,
                new ApiEdtContract.AssetReference(descriptor.symbolId(), SYMBOL_VERSION, SYMBOL_DIGEST),
                new ApiEdtContract.AssetReference(GRAMMAR_ID, GRAMMAR_VERSION, GRAMMAR_DIGEST),
                List.of(new ApiEdtContract.AssetReference(descriptor.ruleId(), RULE_VERSION, RULE_DIGEST)), true, List.of(), null, null, revisionId);
    }

    static ApiEdtContract.CommandCapabilityOption structuralFactOption(
            String queryId,
            String revisionId,
            ApiEdtContract.CommandType commandType,
            StructuralLinkCatalog.Descriptor descriptor,
            List<ApiEdtContract.NormalizedEndpoint> endpoints) {
        List<ApiEdtContract.RequiredField> fields = new ArrayList<>(List.of(
                new ApiEdtContract.RequiredField("normalized_endpoints", "ENDPOINT", true, List.of()),
                new ApiEdtContract.RequiredField("direction", "ENUM", true, structuralDirections(descriptor)),
                new ApiEdtContract.RequiredField("layout", "LAYOUT", commandType == ApiEdtContract.CommandType.CREATE_FACT, List.of())));
        if (!descriptor.labelSlots().isEmpty()) {
            fields.add(new ApiEdtContract.RequiredField("labels", "LIST", descriptor.labelsRequired(), descriptor.labelSlots()));
        }
        if (descriptor.completenessSupported()) {
            fields.add(new ApiEdtContract.RequiredField("collection_completeness", "ENUM", true, List.of("COMPLETE", "INCOMPLETE")));
        }
        return new ApiEdtContract.CommandCapabilityOption(queryId, structuralFactOptionId(queryId, descriptor.capabilityId()), commandType,
                descriptor.capabilityId(), null, descriptor.displayName(), List.of("结构关系"), endpoints, fields, List.of(),
                new ApiEdtContract.AssetReference(descriptor.symbolId(), SYMBOL_VERSION, SYMBOL_DIGEST),
                new ApiEdtContract.AssetReference(descriptor.templateId(), GRAMMAR_VERSION, GRAMMAR_DIGEST),
                List.of(new ApiEdtContract.AssetReference(descriptor.ruleId(), RULE_VERSION, RULE_DIGEST)), true, List.of(), null, null, revisionId);
    }

    static List<String> structuralDirections(StructuralLinkCatalog.Descriptor descriptor) {
        return descriptor.direction() == SemanticRevision.Direction.PROFILE_DEFINED
                ? List.of("DIRECTED", "BIDIRECTIONAL") : List.of(descriptor.direction().name());
    }

    static ApiEdtContract.CommandCapabilityOption controlFactOption(
            String queryId,
            String revisionId,
            ControlLinkCatalog.Descriptor descriptor,
            String baseCapabilityId,
            List<ApiEdtContract.NormalizedEndpoint> endpoints) {
        List<ApiEdtContract.AllowedModifier> modifiers = List.of(
                new ApiEdtContract.AllowedModifier(ControlLinkCatalog.CONTROL_CAPABILITY_MODIFIER, List.of(descriptor.capabilityId()), 1, 1, "iso-control"),
                new ApiEdtContract.AllowedModifier(ControlLinkCatalog.CONTROL_SEGMENT_MODIFIER, List.of(ControlLinkCatalog.PROCESS_INPUT), 1, 1, "iso-control"));
        List<ApiEdtContract.RequiredField> fields = List.of(new ApiEdtContract.RequiredField("modifiers", "LIST", true, List.of()));
        return new ApiEdtContract.CommandCapabilityOption(queryId, controlFactOptionId(queryId, descriptor.capabilityId()), ApiEdtContract.CommandType.UPDATE_FACT,
                descriptor.capabilityId(), baseCapabilityId, descriptor.displayName(), List.of("控制关系"), endpoints, fields, modifiers,
                new ApiEdtContract.AssetReference(descriptor.symbolId(), SYMBOL_VERSION, SYMBOL_DIGEST),
                new ApiEdtContract.AssetReference(descriptor.templateId(), GRAMMAR_VERSION, GRAMMAR_DIGEST),
                List.of(new ApiEdtContract.AssetReference(descriptor.ruleId(), RULE_VERSION, RULE_DIGEST)), true, List.of(), null, null, revisionId);
    }

    static ApiEdtContract.CommandCapabilityOption stateCreateOption(String queryId, String revisionId, SemanticRevision.Element owner, SemanticRevision.Feature featureOwner, boolean enabled) {
        boolean featureState = featureOwner != null;
        List<ApiEdtContract.NormalizedEndpoint> endpoints = owner != null ? List.of(new ApiEdtContract.NormalizedEndpoint("STATE_OWNER", new ApiEdtContract.TargetLocator("ELEMENT", owner.id(), null), 0, null))
                : featureOwner == null ? List.of() : List.of(new ApiEdtContract.NormalizedEndpoint("STATE_OWNER", new ApiEdtContract.TargetLocator("FEATURE", featureOwner.id(), null), 0, null));
        List<ApiEdtContract.RequiredField> fields = List.of(
                new ApiEdtContract.RequiredField("name_or_value", "TEXT", true, List.of()),
                new ApiEdtContract.RequiredField("state_roles", "LIST", true, List.of("INITIAL", "DEFAULT", "FINAL")),
                new ApiEdtContract.RequiredField("layout", "LAYOUT", true, List.of()));
        ApiEdtContract.AssetReference symbol = new ApiEdtContract.AssetReference(featureState ? "symbol.feature.state" : "symbol.state.basic", SYMBOL_VERSION, SYMBOL_DIGEST);
        ApiEdtContract.AssetReference template = new ApiEdtContract.AssetReference(GRAMMAR_ID, GRAMMAR_VERSION, GRAMMAR_DIGEST);
        ApiEdtContract.AssetReference rule = new ApiEdtContract.AssetReference(RULE_ID, RULE_VERSION, RULE_DIGEST);
        String reason = owner == null && featureOwner == null ? "ENDPOINT_KIND_MISMATCH" : "PROFILE_CAPABILITY_DISABLED";
        boolean stateEnabled = featureState || enabled;
        return new ApiEdtContract.CommandCapabilityOption(queryId, "option.state." + digest(queryId).substring(0, 24), ApiEdtContract.CommandType.CREATE_STATE,
                featureState ? "CAP-FEAT-STATE-001" : "CAP-STATE-001", null, featureState ? "创建 Feature Value State" : "创建 Object State", featureState ? List.of("Feature", "Value State") : List.of("Object", "State"), endpoints, fields, List.of(), symbol, template, List.of(rule), stateEnabled,
                stateEnabled ? List.of() : List.of(reason), null, null, revisionId);
    }

    static ApiEdtContract.CommandCapabilityOption propertyUpdateOption(String queryId, String revisionId, SemanticRevision.Element element, String reason) {
        String symbolId = element.coreKind() == SemanticRevision.CoreKind.OBJECT ? "symbol.object.basic" : "symbol.process.basic";
        String kind = element.coreKind() == SemanticRevision.CoreKind.OBJECT ? "Object" : "Process";
        return propertyUpdateOption(queryId, revisionId, "ELEMENT", element.id(), element.capability().capabilityId(), symbolId, kind, reason);
    }

    static ApiEdtContract.CommandCapabilityOption propertyUpdateOption(String queryId, String revisionId, SemanticRevision.Feature feature, String reason) {
        String symbolId = feature.kind() == SemanticRevision.FeatureKind.ATTRIBUTE ? "symbol.feature.attribute" : "symbol.feature.operation";
        String kind = feature.kind() == SemanticRevision.FeatureKind.ATTRIBUTE ? "Attribute" : "Operation";
        return propertyUpdateOption(queryId, revisionId, "FEATURE", feature.id(), feature.capability().capabilityId(), symbolId, kind, reason);
    }

    private static ApiEdtContract.CommandCapabilityOption propertyUpdateOption(String queryId, String revisionId, String targetKind,
                                                                                String targetId, String capabilityId, String symbolId,
                                                                                String kind, String reason) {
        List<ApiEdtContract.RequiredField> fields = List.of(
                new ApiEdtContract.RequiredField("target_ref", "ENDPOINT", true, List.of()),
                new ApiEdtContract.RequiredField("property_name", "ENUM", true, List.of("name")),
                new ApiEdtContract.RequiredField("value", "TEXT", true, List.of()));
        List<ApiEdtContract.NormalizedEndpoint> endpoints = List.of(new ApiEdtContract.NormalizedEndpoint(
                "PROPERTY_TARGET", new ApiEdtContract.TargetLocator(targetKind, targetId, null), 0, null));
        return new ApiEdtContract.CommandCapabilityOption(queryId, propertyOptionId(queryId), ApiEdtContract.CommandType.UPDATE_PROPERTY,
                capabilityId, null, "编辑 " + kind + " 名称",
                List.of(targetKind.equals("ELEMENT") ? "Element" : "Feature", "名称"), endpoints, fields, List.of(),
                new ApiEdtContract.AssetReference(symbolId, SYMBOL_VERSION, SYMBOL_DIGEST),
                new ApiEdtContract.AssetReference(GRAMMAR_ID, GRAMMAR_VERSION, GRAMMAR_DIGEST),
                List.of(new ApiEdtContract.AssetReference(RULE_ID, RULE_VERSION, RULE_DIGEST)), reason == null,
                reason == null ? List.of() : List.of(reason), null, null, revisionId);
    }

    static List<ApiEdtContract.CommandCapabilityOption> featureCreateOptions(String queryId, String revisionId, SemanticRevision.Element owner) {
        if (owner == null) return List.of();
        List<ApiEdtContract.NormalizedEndpoint> endpoints = List.of(new ApiEdtContract.NormalizedEndpoint("FEATURE_OWNER", new ApiEdtContract.TargetLocator("ELEMENT", owner.id(), null), 0, null));
        List<ApiEdtContract.RequiredField> fields = List.of(new ApiEdtContract.RequiredField("feature_kind", "ENUM", true, List.of("ATTRIBUTE", "OPERATION")), new ApiEdtContract.RequiredField("name", "TEXT", true, List.of()), new ApiEdtContract.RequiredField("layout", "LAYOUT", true, List.of()));
        return List.of(
                featureCreateOption(queryId, revisionId, "ATTRIBUTE", "CAP-FEAT-ATTRIBUTE-001", "symbol.feature.attribute", endpoints, fields),
                featureCreateOption(queryId, revisionId, "OPERATION", "CAP-FEAT-OPERATION-001", "symbol.feature.operation", endpoints, fields));
    }

    static ApiEdtContract.CommandCapabilityOption featureCreateOption(String queryId, String revisionId, String kind, String capabilityId, String symbolId,
                                                                         List<ApiEdtContract.NormalizedEndpoint> endpoints, List<ApiEdtContract.RequiredField> fields) {
        return new ApiEdtContract.CommandCapabilityOption(queryId, "option.feature." + kind.toLowerCase() + "." + digest(queryId).substring(0, 16), ApiEdtContract.CommandType.CREATE_FEATURE,
                capabilityId, null, "创建" + ("ATTRIBUTE".equals(kind) ? "属性" : "操作"), List.of("Feature", "ATTRIBUTE".equals(kind) ? "Attribute" : "Operation"), endpoints, fields, List.of(),
                new ApiEdtContract.AssetReference(symbolId, SYMBOL_VERSION, SYMBOL_DIGEST), new ApiEdtContract.AssetReference(GRAMMAR_ID, GRAMMAR_VERSION, GRAMMAR_DIGEST),
                List.of(new ApiEdtContract.AssetReference(RULE_ID, RULE_VERSION, RULE_DIGEST)), true, List.of(), null, null, revisionId);
    }

    static String propertyOptionId(String queryId) {
        return "option.property.name." + digest(queryId).substring(0, 20);
    }

    static String proceduralFactOptionId(String queryId, String capabilityId) {
        return "option.fact." + digest(queryId + ":" + capabilityId).substring(0, 24);
    }

    static String structuralFactOptionId(String queryId, String capabilityId) {
        return "option.structural." + digest(queryId + ":" + capabilityId).substring(0, 24);
    }

    static String controlFactOptionId(String queryId, String capabilityId) {
        return "option.control." + digest(queryId + ":" + capabilityId).substring(0, 24);
    }

    static String removeControlOptionId(String queryId, String factId) {
        return "option.control.remove." + digest(queryId + ":" + factId).substring(0, 24);
    }

    static ApiEdtContract.CommandCapabilityOption removeControlOption(String queryId, String revisionId, SemanticRevision.Fact fact,
                                                                         ProceduralLinkCatalog.Descriptor descriptor, List<ApiEdtContract.NormalizedEndpoint> endpoints) {
        return new ApiEdtContract.CommandCapabilityOption(queryId, removeControlOptionId(queryId, fact.id()), ApiEdtContract.CommandType.UPDATE_FACT,
                descriptor.capabilityId(), descriptor.capabilityId(), "移除 Control", List.of("Control", "Remove"), endpoints,
                List.of(new ApiEdtContract.RequiredField("replacement.modifiers", "LIST", true, List.of())), List.of(),
                new ApiEdtContract.AssetReference("symbol.control.remove", SYMBOL_VERSION, SYMBOL_DIGEST),
                new ApiEdtContract.AssetReference(GRAMMAR_ID, GRAMMAR_VERSION, GRAMMAR_DIGEST),
                List.of(new ApiEdtContract.AssetReference(RULE_ID, RULE_VERSION, RULE_DIGEST)), true, List.of(), null, null, revisionId);
    }

    static boolean hasValidControlPair(List<SemanticRevision.Modifier> modifiers) {
        if (modifiers.size() != 2) return false;
        String capabilityId = modifiers.stream().filter(value -> ControlLinkCatalog.CONTROL_CAPABILITY_MODIFIER.equals(value.id())).map(SemanticRevision.Modifier::value).findFirst().orElse(null);
        String segment = modifiers.stream().filter(value -> ControlLinkCatalog.CONTROL_SEGMENT_MODIFIER.equals(value.id())).map(SemanticRevision.Modifier::value).findFirst().orElse(null);
        return capabilityId != null && ControlLinkCatalog.find(capabilityId).isPresent() && ControlLinkCatalog.PROCESS_INPUT.equals(segment);
    }

    record ProceduralTarget(ProceduralLinkCatalog.Kind kind, SemanticRevision.TargetKind targetKind, String id) { }

    record StructuralTarget(SemanticRevision.CoreKind coreKind, SemanticRevision.TargetKind targetKind, String id, boolean featureValueState) { }
}
