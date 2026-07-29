// Generated from docs/contracts/openapi/opm-local-api-v1.yaml. DO NOT EDIT.
// Contract digest: 8418a08e4d557870b685d7a669e68b6452a9af3a0b63299c335c051e5d69c2ef
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

    public record ImpactSummary(int affectedConstructCount, int affectedContextCount, int affectedSentenceCount, int affectedFindingCount) {
        public ImpactSummary { if (affectedConstructCount < 0 || affectedContextCount < 0 || affectedSentenceCount < 0 || affectedFindingCount < 0) throw new IllegalArgumentException("impact counts must not be negative"); }
    }

    public record CreateStatePayload(String contextId, TargetLocator ownerRef, String capabilityId, String nameOrValue, List<String> stateRoles, Map<String, Object> occurrence, Map<String, Object> layout, String capabilityQueryId, String selectedOptionId) {
        public CreateStatePayload { Objects.requireNonNull(contextId); Objects.requireNonNull(ownerRef); Objects.requireNonNull(capabilityId); Objects.requireNonNull(nameOrValue); stateRoles = List.copyOf(stateRoles); occurrence = Map.copyOf(occurrence); layout = Map.copyOf(layout); Objects.requireNonNull(capabilityQueryId); Objects.requireNonNull(selectedOptionId); }
    }

    public record UpdateStatePayload(String stateId, TargetLocator expectedOwnerRef, Map<String, Object> changes, String capabilityQueryId, String selectedOptionId) {
        public UpdateStatePayload { Objects.requireNonNull(stateId); Objects.requireNonNull(expectedOwnerRef); changes = Map.copyOf(changes); if (changes.isEmpty()) throw new IllegalArgumentException("state changes must not be empty"); Objects.requireNonNull(capabilityQueryId); Objects.requireNonNull(selectedOptionId); }
    }

    public record StatePresentationPayload(String contextId, String stateId, Map<String, Object> layout) {
        public StatePresentationPayload { Objects.requireNonNull(contextId); Objects.requireNonNull(stateId); layout = Map.copyOf(layout == null ? Map.of() : layout); }
    }

    public record CreateFactPayload(String contextId, String capabilityId, String factFamily, List<NormalizedEndpoint> normalizedEndpoints, String direction, List<Map<String, Object>> labels, List<Map<String, Object>> modifiers, Map<String, Object> condition, List<Map<String, Object>> logicalGroups, String collectionCompleteness, Map<String, Object> occurrence, Map<String, Object> layout, String capabilityQueryId, String selectedOptionId) {
        public CreateFactPayload { Objects.requireNonNull(contextId); Objects.requireNonNull(capabilityId); Objects.requireNonNull(factFamily); normalizedEndpoints = List.copyOf(normalizedEndpoints); if (normalizedEndpoints.size() < 2) throw new IllegalArgumentException("fact requires at least two endpoints"); Objects.requireNonNull(direction); labels = List.copyOf(labels); modifiers = List.copyOf(modifiers); logicalGroups = List.copyOf(logicalGroups); occurrence = Map.copyOf(occurrence); layout = Map.copyOf(layout); Objects.requireNonNull(capabilityQueryId); Objects.requireNonNull(selectedOptionId); }
    }

    public record UpdateFactPayload(String factId, String expectedCapabilityId, Map<String, Object> replacement, String capabilityQueryId, String selectedOptionId) {
        public UpdateFactPayload { Objects.requireNonNull(factId); Objects.requireNonNull(expectedCapabilityId); replacement = Map.copyOf(replacement); if (replacement.isEmpty()) throw new IllegalArgumentException("fact replacement must not be empty"); Objects.requireNonNull(capabilityQueryId); Objects.requireNonNull(selectedOptionId); }
    }

    public record DeleteConstructPayload(String constructKind, String constructId, String impactToken) {
        public DeleteConstructPayload { Objects.requireNonNull(constructKind); Objects.requireNonNull(constructId); Objects.requireNonNull(impactToken); if (impactToken.length() < 16) throw new IllegalArgumentException("impact token is too short"); }
    }

    public record CommandCapabilityOption(String capabilityQueryId, String optionId, CommandType commandType, String capabilityId, String baseFactCapabilityId, String displayName, List<String> groupPath, List<NormalizedEndpoint> normalizedEndpoints, List<RequiredField> requiredFields, List<AllowedModifier> allowedModifiers, AssetReference symbolDescriptor, AssetReference templateFamily, List<AssetReference> ruleRefs, boolean enabled, List<String> reasonCodes, ImpactSummary impactSummary, String impactToken, String expiresWithRevision) {
        public CommandCapabilityOption {
            Objects.requireNonNull(capabilityQueryId); Objects.requireNonNull(optionId); Objects.requireNonNull(commandType); Objects.requireNonNull(capabilityId); Objects.requireNonNull(displayName);
            groupPath = List.copyOf(groupPath); normalizedEndpoints = List.copyOf(normalizedEndpoints); requiredFields = List.copyOf(requiredFields); allowedModifiers = List.copyOf(allowedModifiers);
            Objects.requireNonNull(symbolDescriptor); Objects.requireNonNull(templateFamily); ruleRefs = List.copyOf(ruleRefs); reasonCodes = List.copyOf(reasonCodes); Objects.requireNonNull(expiresWithRevision);
            if (commandType == CommandType.DELETE_CONSTRUCT && (impactSummary == null || impactToken == null)) throw new IllegalArgumentException("delete option requires impact summary and token");
            if (commandType != CommandType.DELETE_CONSTRUCT && (impactSummary != null || impactToken != null)) throw new IllegalArgumentException("impact data is only valid for delete options");
        }

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
            if (impactSummary != null) { result.put("impact_summary", impact(impactSummary)); result.put("impact_token", impactToken); }
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

    private static Map<String, Object> impact(ImpactSummary value) { return Map.of("affected_construct_count", value.affectedConstructCount(), "affected_context_count", value.affectedContextCount(), "affected_sentence_count", value.affectedSentenceCount(), "affected_finding_count", value.affectedFindingCount()); }
}
