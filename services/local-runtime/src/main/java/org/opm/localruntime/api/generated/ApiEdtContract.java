// Generated from docs/contracts/openapi/opm-local-api-v1.yaml. DO NOT EDIT.
// Contract digest: 887d4e09a62d47e06ec8584bce01635c35c78f9a007c1f528e828cd6325fef4c
package org.opm.localruntime.api.generated;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class ApiEdtContract {

    private ApiEdtContract() { }

    public enum CommandType {
        CREATE_ELEMENT,
        CREATE_FEATURE,
        CREATE_FACT,
        CREATE_STATE,
        UPDATE_STATE,
        UPDATE_FACT,
        UPDATE_PROPERTY,
        DELETE_CONSTRUCT,
        CREATE_CONTEXT,
        UPDATE_LAYOUT,
        UPDATE_SEMANTIC_LAYOUT,
        STATE_EXPLICIT,
        STATE_SUPPRESS,
        UNFOLD,
        FOLD,
        SEMANTIC_IN_ZOOM,
        SEMANTIC_OUT_ZOOM
    }

    public record AssetReference(String id, String version, String digest) {
        public AssetReference { Objects.requireNonNull(id); Objects.requireNonNull(version); Objects.requireNonNull(digest); }
    }

    public record TargetLocator(String targetKind, String targetId, String occurrenceId) {
        public TargetLocator { Objects.requireNonNull(targetKind); Objects.requireNonNull(targetId); }
    }

    public record NormalizedEndpoint(String role, TargetLocator targetRef, int ordinal, String stateQualification) {
        public NormalizedEndpoint { Objects.requireNonNull(role); Objects.requireNonNull(targetRef); if (ordinal < 0) throw new IllegalArgumentException("ordinal must not be negative"); }
    }

    public record RequiredField(String fieldId, String fieldKind, boolean required, List<String> allowedValues) {
        public RequiredField { Objects.requireNonNull(fieldId); Objects.requireNonNull(fieldKind); allowedValues = List.copyOf(allowedValues == null ? List.of() : allowedValues); }
    }

    public record AllowedModifier(String modifierId, List<String> valueOptions, int minOccurs, int maxOccurs, String atomicGroupId) {
        public AllowedModifier { Objects.requireNonNull(modifierId); valueOptions = List.copyOf(valueOptions == null ? List.of() : valueOptions); if (minOccurs < 0 || maxOccurs < minOccurs) throw new IllegalArgumentException("modifier occurrences are invalid"); }
    }

    public record RelationEndpointRoleSummary(String role, List<String> targetKinds, int minOccurs, Integer maxOccurs, boolean stateQualificationAllowed) {
        public RelationEndpointRoleSummary { Objects.requireNonNull(role); targetKinds = List.copyOf(targetKinds); if (targetKinds.isEmpty() || minOccurs < 0 || (maxOccurs != null && maxOccurs < minOccurs)) throw new IllegalArgumentException("relation endpoint role is invalid"); }
        public Map<String, Object> toWire() { Map<String, Object> result = new LinkedHashMap<>(); result.put("role", role); result.put("target_kinds", targetKinds); result.put("min_occurs", minOccurs); if (maxOccurs != null) result.put("max_occurs", maxOccurs); result.put("state_qualification_allowed", stateQualificationAllowed); return Map.copyOf(result); }
    }

    public record RelationEndpointSummary(int minEndpoints, Integer maxEndpoints, List<RelationEndpointRoleSummary> roles) {
        public RelationEndpointSummary { roles = List.copyOf(roles); if (minEndpoints < 0 || (maxEndpoints != null && maxEndpoints < minEndpoints)) throw new IllegalArgumentException("relation endpoint summary is invalid"); }
        public Map<String, Object> toWire() { Map<String, Object> result = new LinkedHashMap<>(); result.put("min_endpoints", minEndpoints); if (maxEndpoints != null) result.put("max_endpoints", maxEndpoints); result.put("roles", roles.stream().map(RelationEndpointRoleSummary::toWire).toList()); return Map.copyOf(result); }
    }

    public record RelationCatalogItem(String family, String capabilityId, String displayName, String symbolId, String interactionMode, AssetReference symbolDescriptor, RelationEndpointSummary endpointSummary, boolean enabled, List<String> reasonCodes) {
        public RelationCatalogItem { Objects.requireNonNull(family); Objects.requireNonNull(capabilityId); Objects.requireNonNull(displayName); Objects.requireNonNull(symbolId); Objects.requireNonNull(interactionMode); Objects.requireNonNull(symbolDescriptor); Objects.requireNonNull(endpointSummary); reasonCodes = List.copyOf(reasonCodes); }
        public Map<String, Object> toWire() { return Map.of("family", family, "capability_id", capabilityId, "display_name", displayName, "symbol_id", symbolId, "interaction_mode", interactionMode, "symbol_descriptor", asset(symbolDescriptor), "endpoint_summary", endpointSummary.toWire(), "enabled", enabled, "reason_codes", reasonCodes); }
    }

    public record DeleteTarget(String kind, String id) { public DeleteTarget { Objects.requireNonNull(kind); Objects.requireNonNull(id); } }

    public record DeleteImpactItem(String kind, String id, String contextId, String effect) { public DeleteImpactItem { Objects.requireNonNull(kind); Objects.requireNonNull(id); Objects.requireNonNull(effect); } }

    public record DeleteImpactCounts(int contexts, int occurrences, int elements, int features, int states, int facts, int oplSentences, int traces, int findings) { public DeleteImpactCounts { if (contexts < 0 || occurrences < 0 || elements < 0 || features < 0 || states < 0 || facts < 0 || oplSentences < 0 || traces < 0 || findings < 0) throw new IllegalArgumentException("impact counts must not be negative"); } }

    public record ImpactSummary(String inputRevision, String selectedOccurrenceId, String deleteMode, DeleteTarget target, List<DeleteImpactItem> items, DeleteImpactCounts counts) { public ImpactSummary { Objects.requireNonNull(inputRevision); Objects.requireNonNull(selectedOccurrenceId); Objects.requireNonNull(deleteMode); Objects.requireNonNull(target); items = List.copyOf(items); Objects.requireNonNull(counts); } }

    public record CreateStatePayload(String contextId, TargetLocator ownerRef, String capabilityId, String nameOrValue, List<String> stateRoles, Map<String, Object> occurrence, Map<String, Object> layout, String capabilityQueryId, String selectedOptionId) {
        public CreateStatePayload { Objects.requireNonNull(contextId); Objects.requireNonNull(ownerRef); Objects.requireNonNull(capabilityId); Objects.requireNonNull(nameOrValue); stateRoles = List.copyOf(stateRoles); occurrence = Map.copyOf(occurrence); layout = Map.copyOf(layout); Objects.requireNonNull(capabilityQueryId); Objects.requireNonNull(selectedOptionId); }
    }

    public record UpdateStatePayload(String stateId, TargetLocator expectedOwnerRef, Map<String, Object> changes, String capabilityQueryId, String selectedOptionId) {
        public UpdateStatePayload { Objects.requireNonNull(stateId); Objects.requireNonNull(expectedOwnerRef); changes = Map.copyOf(changes); if (changes.isEmpty()) throw new IllegalArgumentException("state changes must not be empty"); Objects.requireNonNull(capabilityQueryId); Objects.requireNonNull(selectedOptionId); }
    }

    public record StatePresentationPayload(String contextId, String stateId, Map<String, Object> layout) {
        public StatePresentationPayload { Objects.requireNonNull(contextId); Objects.requireNonNull(stateId); layout = Map.copyOf(layout == null ? Map.of() : layout); }
    }

    public record UpdatePropertyPayload(TargetLocator targetRef, String propertyName, String value, String capabilityQueryId, String selectedOptionId) {
        public UpdatePropertyPayload { Objects.requireNonNull(targetRef); Objects.requireNonNull(propertyName); Objects.requireNonNull(value); Objects.requireNonNull(capabilityQueryId); Objects.requireNonNull(selectedOptionId); }
    }

    public record UpdateLayoutPayload(String occurrenceId, Map<String, Object> layout) {
        public UpdateLayoutPayload { Objects.requireNonNull(occurrenceId); layout = Map.copyOf(layout); }
    }

    public record CreateFactPayload(String contextId, String capabilityId, String factFamily, List<NormalizedEndpoint> normalizedEndpoints, String direction, List<Map<String, Object>> labels, List<Map<String, Object>> modifiers, Map<String, Object> condition, List<Map<String, Object>> logicalGroups, String collectionCompleteness, Map<String, Object> occurrence, Map<String, Object> layout, String capabilityQueryId, String selectedOptionId) {
        public CreateFactPayload { Objects.requireNonNull(contextId); Objects.requireNonNull(capabilityId); Objects.requireNonNull(factFamily); normalizedEndpoints = List.copyOf(normalizedEndpoints); if (normalizedEndpoints.size() < 2) throw new IllegalArgumentException("fact requires at least two endpoints"); Objects.requireNonNull(direction); labels = List.copyOf(labels); modifiers = List.copyOf(modifiers); logicalGroups = List.copyOf(logicalGroups); occurrence = Map.copyOf(occurrence); layout = Map.copyOf(layout); Objects.requireNonNull(capabilityQueryId); Objects.requireNonNull(selectedOptionId); }
    }

    public record UpdateFactPayload(String factId, String expectedCapabilityId, Map<String, Object> replacement, String capabilityQueryId, String selectedOptionId) {
        public UpdateFactPayload { Objects.requireNonNull(factId); Objects.requireNonNull(expectedCapabilityId); replacement = Map.copyOf(replacement); if (replacement.isEmpty()) throw new IllegalArgumentException("fact replacement must not be empty"); Objects.requireNonNull(capabilityQueryId); Objects.requireNonNull(selectedOptionId); }
    }

    public record DeleteConstructPayload(String selectionId, String constructKind, String constructId, String deleteMode, String impactToken) {
        public DeleteConstructPayload { Objects.requireNonNull(selectionId); Objects.requireNonNull(constructKind); Objects.requireNonNull(constructId); Objects.requireNonNull(deleteMode); Objects.requireNonNull(impactToken); if (impactToken.length() < 16) throw new IllegalArgumentException("impact token is too short"); }
    }

    public record CommandCapabilityOption(String capabilityQueryId, String optionId, CommandType commandType, String capabilityId, String baseFactCapabilityId, String displayName, List<String> groupPath, List<NormalizedEndpoint> normalizedEndpoints, List<RequiredField> requiredFields, List<AllowedModifier> allowedModifiers, AssetReference symbolDescriptor, AssetReference templateFamily, List<AssetReference> ruleRefs, boolean enabled, List<String> reasonCodes, ImpactSummary impactSummary, String impactToken, String deleteMode, DeleteTarget deleteTarget, String expiresWithRevision) {
        public CommandCapabilityOption {
            Objects.requireNonNull(capabilityQueryId); Objects.requireNonNull(optionId); Objects.requireNonNull(commandType); Objects.requireNonNull(capabilityId); Objects.requireNonNull(displayName);
            groupPath = List.copyOf(groupPath); normalizedEndpoints = List.copyOf(normalizedEndpoints); requiredFields = List.copyOf(requiredFields); allowedModifiers = List.copyOf(allowedModifiers);
            Objects.requireNonNull(symbolDescriptor); Objects.requireNonNull(templateFamily); ruleRefs = List.copyOf(ruleRefs); reasonCodes = List.copyOf(reasonCodes); Objects.requireNonNull(expiresWithRevision);
            if (commandType == CommandType.DELETE_CONSTRUCT && (impactSummary == null || impactToken == null || deleteMode == null || deleteTarget == null)) throw new IllegalArgumentException("delete option requires impact summary and token");
            if (commandType != CommandType.DELETE_CONSTRUCT && (impactSummary != null || impactToken != null || deleteMode != null || deleteTarget != null)) throw new IllegalArgumentException("impact data is only valid for delete options");
        }

        public CommandCapabilityOption(String capabilityQueryId, String optionId, CommandType commandType, String capabilityId, String baseFactCapabilityId, String displayName, List<String> groupPath, List<NormalizedEndpoint> normalizedEndpoints, List<RequiredField> requiredFields, List<AllowedModifier> allowedModifiers, AssetReference symbolDescriptor, AssetReference templateFamily, List<AssetReference> ruleRefs, boolean enabled, List<String> reasonCodes, ImpactSummary impactSummary, String impactToken, String expiresWithRevision) { this(capabilityQueryId, optionId, commandType, capabilityId, baseFactCapabilityId, displayName, groupPath, normalizedEndpoints, requiredFields, allowedModifiers, symbolDescriptor, templateFamily, ruleRefs, enabled, reasonCodes, impactSummary, impactToken, null, null, expiresWithRevision); }

        public Map<String, Object> toWire() {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("capability_query_id", capabilityQueryId);
            result.put("option_id", optionId);
            result.put("command_type", commandType.name());
            result.put("capability_ref", Map.of("capability_id", capabilityId));
            if (baseFactCapabilityId != null) result.put("base_fact_capability_ref", Map.of("capability_id", baseFactCapabilityId));
            result.put("display_name", displayName);
            result.put("group_path", groupPath);
            result.put("normalized_endpoints", normalizedEndpoints.stream().map(ApiEdtContract::endpoint).toList());
            result.put("required_fields", requiredFields.stream().map(field -> Map.of("field_id", field.fieldId(), "field_kind", field.fieldKind(), "required", field.required(), "allowed_values", field.allowedValues())).toList());
            result.put("allowed_modifiers", allowedModifiers.stream().map(modifier -> { Map<String, Object> value = new LinkedHashMap<>(); value.put("modifier_id", modifier.modifierId()); value.put("value_options", modifier.valueOptions()); value.put("min_occurs", modifier.minOccurs()); value.put("max_occurs", modifier.maxOccurs()); if (modifier.atomicGroupId() != null) value.put("atomic_group_id", modifier.atomicGroupId()); return Map.copyOf(value); }).toList());
            result.put("symbol_descriptor", asset(symbolDescriptor));
            result.put("template_family", asset(templateFamily));
            result.put("rule_refs", ruleRefs.stream().map(ApiEdtContract::asset).toList());
            result.put("enabled", enabled);
            result.put("reason_codes", reasonCodes);
            result.put("expires_with_revision", expiresWithRevision);
            if (impactSummary != null) { result.put("impact_summary", impact(impactSummary)); result.put("impact_token", impactToken); result.put("delete_mode", deleteMode); result.put("delete_target", Map.of("kind", deleteTarget.kind(), "id", deleteTarget.id())); }
            return Map.copyOf(result);
        }
    }

    public record ForbiddenCommand(CommandType commandType, String reasonCode) {
        public ForbiddenCommand { Objects.requireNonNull(commandType); Objects.requireNonNull(reasonCode); }
        public Map<String, Object> toWire() { return Map.of("command_type", commandType.name(), "reason_code", reasonCode); }
    }

    public record CommandCapabilitiesData(List<CommandType> allowed, List<ForbiddenCommand> forbidden, String capabilityQueryId, List<CommandCapabilityOption> options) {
        public CommandCapabilitiesData { allowed = List.copyOf(allowed); forbidden = List.copyOf(forbidden); Objects.requireNonNull(capabilityQueryId); options = List.copyOf(options); }
        public Map<String, Object> toWire() { return Map.of("allowed", allowed.stream().map(Enum::name).toList(), "forbidden", forbidden.stream().map(ForbiddenCommand::toWire).toList(), "capability_query_id", capabilityQueryId, "options", options.stream().map(CommandCapabilityOption::toWire).toList()); }
    }

    private static Map<String, Object> asset(AssetReference value) { return Map.of("id", value.id(), "version", value.version(), "digest", value.digest()); }

    private static Map<String, Object> endpoint(NormalizedEndpoint value) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("role", value.role());
        result.put("target_ref", Map.of("target_kind", value.targetRef().targetKind(), "target_id", value.targetRef().targetId()));
        result.put("ordinal", value.ordinal());
        if (value.stateQualification() != null) result.put("state_qualification", value.stateQualification());
        return Map.copyOf(result);
    }

    private static Map<String, Object> impact(ImpactSummary value) { Map<String, Object> result = new LinkedHashMap<>(); result.put("input_revision", value.inputRevision()); result.put("selected_occurrence_id", value.selectedOccurrenceId()); result.put("delete_mode", value.deleteMode()); result.put("target", Map.of("kind", value.target().kind(), "id", value.target().id())); result.put("items", value.items().stream().map(item -> { Map<String, Object> wire = new LinkedHashMap<>(); wire.put("kind", item.kind()); wire.put("id", item.id()); if (item.contextId() != null) wire.put("context_id", item.contextId()); wire.put("effect", item.effect()); return Map.copyOf(wire); }).toList()); result.put("counts", Map.of("contexts", value.counts().contexts(), "occurrences", value.counts().occurrences(), "elements", value.counts().elements(), "features", value.counts().features(), "states", value.counts().states(), "facts", value.counts().facts(), "opl_sentences", value.counts().oplSentences(), "traces", value.counts().traces(), "findings", value.counts().findings())); return Map.copyOf(result); }
}
