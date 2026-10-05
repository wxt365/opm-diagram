package org.opm.localruntime.application;

import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.api.generated.ApiEdtContract;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import static org.opm.localruntime.application.RuntimeActiveBindingProvider.*;

/** 关系目录及端点说明，供历史修订和 V2 草稿共用。 */
final class RelationCatalogQuery {
    Map<String, Object> relationCatalogData(SemanticRevision revision, String contextId, String selectionId, String revisionReason) {
        SemanticRevision.Fact selectedFact = selectionId == null ? null : revision.facts().stream()
                .filter(fact -> fact.id().equals(selectionId)).findFirst().orElse(null);
        boolean factInContext = selectedFact != null && revision.occurrences().stream().anyMatch(occurrence -> occurrence.contextId().equals(contextId)
                && occurrence.targetKind() == SemanticRevision.TargetKind.FACT && occurrence.targetId().equals(selectedFact.id()));
        String baseCapabilityId = factInContext ? selectedFact.capability().capabilityId() : null;
        boolean proceduralBase = baseCapabilityId != null && ProceduralLinkCatalog.find(baseCapabilityId).isPresent();
        List<String> availableControls = proceduralBase ? ControlLinkCatalog.forBase(baseCapabilityId).stream().map(ControlLinkCatalog.Descriptor::capabilityId).toList() : List.of();
        List<ApiEdtContract.RelationCatalogItem> items = new ArrayList<>();
        ProceduralLinkCatalog.all().forEach(descriptor -> items.add(relationCatalogItem("PROCEDURAL", descriptor.capabilityId(), descriptor.displayName(), descriptor.symbolId(),
                "CREATE_FACT", proceduralEndpointSummary(descriptor), revisionReason == null, revisionReason == null ? List.of() : List.of(revisionReason))));
        ControlLinkCatalog.all().forEach(descriptor -> {
            boolean enabled = revisionReason == null && availableControls.contains(descriptor.capabilityId());
            String reason = revisionReason != null ? revisionReason : !proceduralBase ? "CONTROL_REQUIRES_BASE_FACT" : "MODIFIER_COMBINATION_INVALID";
            items.add(relationCatalogItem("CONTROL", descriptor.capabilityId(), descriptor.displayName(), descriptor.symbolId(),
                    "UPDATE_SELECTED_FACT", controlEndpointSummary(), enabled, enabled ? List.of() : List.of(reason)));
        });
        StructuralLinkCatalog.all().forEach(descriptor -> items.add(relationCatalogItem("STRUCTURAL", descriptor.capabilityId(), descriptor.displayName(), descriptor.symbolId(),
                "CREATE_FACT", structuralEndpointSummary(descriptor), revisionReason == null, revisionReason == null ? List.of() : List.of(revisionReason))));
        items.sort(Comparator.comparingInt(this::relationCatalogFamilyOrder).thenComparing(ApiEdtContract.RelationCatalogItem::capabilityId));
        return Map.of("items", items.stream().map(ApiEdtContract.RelationCatalogItem::toWire).toList());
    }

    private ApiEdtContract.RelationCatalogItem relationCatalogItem(String family, String capabilityId, String displayName, String symbolId,
                                                                   String interactionMode, ApiEdtContract.RelationEndpointSummary endpointSummary,
                                                                   boolean enabled, List<String> reasonCodes) {
        return new ApiEdtContract.RelationCatalogItem(family, capabilityId, displayName, symbolId, interactionMode,
                new ApiEdtContract.AssetReference(symbolId, SYMBOL_VERSION, SYMBOL_DIGEST), endpointSummary, enabled, reasonCodes);
    }

    private int relationCatalogFamilyOrder(ApiEdtContract.RelationCatalogItem item) {
        return switch (item.family()) {
            case "PROCEDURAL" -> 0;
            case "CONTROL" -> 1;
            case "STRUCTURAL" -> 2;
            default -> throw new IllegalStateException("未知关系目录分组");
        };
    }

    private ApiEdtContract.RelationEndpointSummary proceduralEndpointSummary(ProceduralLinkCatalog.Descriptor descriptor) {
        List<ApiEdtContract.RelationEndpointRoleSummary> roles = descriptor.endpointRoles().stream().map(role ->
                endpointRole(role.role(), List.of(role.kind() == ProceduralLinkCatalog.Kind.OBJECT || role.kind() == ProceduralLinkCatalog.Kind.PROCESS ? "ELEMENT" : "STATE"), 1, 1,
                        role.kind() == ProceduralLinkCatalog.Kind.STATE)).toList();
        return new ApiEdtContract.RelationEndpointSummary(roles.size(), roles.size(), roles);
    }

    private ApiEdtContract.RelationEndpointSummary structuralEndpointSummary(StructuralLinkCatalog.Descriptor descriptor) {
        return switch (descriptor.shape()) {
            case BINARY_SAME_THING -> endpointSummary(2, 2,
                    endpointRole("STRUCTURAL_SOURCE", List.of("ELEMENT"), 1, 1, false),
                    endpointRole("STRUCTURAL_TARGET", List.of("ELEMENT"), 1, 1, false));
            case AGGREGATION_FAN -> endpointSummary(2, null,
                    endpointRole("WHOLE_THING", List.of("ELEMENT"), 1, 1, false),
                    endpointRole("PART_THING", List.of("ELEMENT"), 1, null, false));
            case EXHIBITION_FAN -> endpointSummary(2, null,
                    endpointRole("EXHIBITOR_THING", List.of("ELEMENT"), 1, 1, false),
                    endpointRole("FEATURE_THING", List.of("FEATURE"), 1, null, false));
            case GENERALIZATION_FAN -> endpointSummary(2, null,
                    endpointRole("GENERAL_THING", List.of("ELEMENT"), 1, 1, false),
                    endpointRole("SPECIALIZED_THING", List.of("ELEMENT"), 1, null, false));
            case CLASSIFICATION_FAN -> endpointSummary(2, null,
                    endpointRole("CLASS_THING", List.of("ELEMENT"), 1, 1, false),
                    endpointRole("INSTANCE_THING", List.of("ELEMENT"), 1, null, false));
            case STATE_CHARACTERIZATION -> endpointSummary(2, 2,
                    endpointRole("EXHIBITOR_THING_OR_STATE", List.of("ELEMENT", "STATE"), 1, 1, true),
                    endpointRole("VALUE_STATE", List.of("STATE"), 1, 1, true));
            case STATE_TAGGED -> endpointSummary(2, 2,
                    endpointRole("STATE_TAGGED_SOURCE", List.of("ELEMENT", "STATE"), 1, 1, true),
                    endpointRole("STATE_TAGGED_TARGET", List.of("ELEMENT", "STATE"), 1, 1, true));
        };
    }

    private ApiEdtContract.RelationEndpointSummary controlEndpointSummary() {
        return endpointSummary(1, 1, endpointRole("BASE_PROCEDURAL_FACT", List.of("FACT"), 1, 1, false));
    }

    private ApiEdtContract.RelationEndpointSummary endpointSummary(int min, Integer max, ApiEdtContract.RelationEndpointRoleSummary... roles) {
        return new ApiEdtContract.RelationEndpointSummary(min, max, List.of(roles));
    }

    private ApiEdtContract.RelationEndpointRoleSummary endpointRole(String role, List<String> targetKinds, int min, Integer max, boolean stateQualificationAllowed) {
        return new ApiEdtContract.RelationEndpointRoleSummary(role, targetKinds, min, max, stateQualificationAllowed);
    }

}
