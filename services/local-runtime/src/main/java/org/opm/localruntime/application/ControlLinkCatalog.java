package org.opm.localruntime.application;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** ISO 草案 Control Link 对基础 Procedural Fact 的受控修饰描述符。 */
final class ControlLinkCatalog {

    static final String CONTROL_CAPABILITY_MODIFIER = "control.capability";
    static final String CONTROL_SEGMENT_MODIFIER = "control.segment";
    static final String PROCESS_INPUT = "PROCESS_INPUT";

    private static final Map<String, Descriptor> DESCRIPTORS = descriptors();

    private ControlLinkCatalog() {
    }

    static Optional<Descriptor> find(String capabilityId) {
        return Optional.ofNullable(DESCRIPTORS.get(capabilityId));
    }

    static List<Descriptor> forBase(String baseCapabilityId) {
        return DESCRIPTORS.values().stream()
                .filter(descriptor -> descriptor.baseCapabilityIds().contains(baseCapabilityId))
                .toList();
    }

    private static Map<String, Descriptor> descriptors() {
        Map<String, Descriptor> result = new LinkedHashMap<>();
        register(result, event("CAP-ISO-CTRL-001", "Transforming Event", false, false, List.of("CAP-ISO-PROC-001", "CAP-ISO-PROC-003")));
        register(result, event("CAP-ISO-CTRL-002", "Enabling Event", true, false, List.of("CAP-ISO-PROC-004", "CAP-ISO-PROC-005")));
        register(result, event("CAP-ISO-CTRL-003", "State-specified Transforming Event", false, true, List.of("CAP-ISO-PROC-006", "CAP-ISO-PROC-008", "CAP-ISO-PROC-009", "CAP-ISO-PROC-010")));
        register(result, event("CAP-ISO-CTRL-004", "State-specified Enabling Event", true, true, List.of("CAP-ISO-PROC-011", "CAP-ISO-PROC-012")));
        register(result, condition("CAP-ISO-CTRL-005", "Transforming Condition", false, false, List.of("CAP-ISO-PROC-001", "CAP-ISO-PROC-003")));
        register(result, condition("CAP-ISO-CTRL-006", "Enabling Condition", true, false, List.of("CAP-ISO-PROC-004", "CAP-ISO-PROC-005")));
        register(result, condition("CAP-ISO-CTRL-007", "State-specified Transforming Condition", false, true, List.of("CAP-ISO-PROC-006", "CAP-ISO-PROC-008", "CAP-ISO-PROC-009", "CAP-ISO-PROC-010")));
        register(result, condition("CAP-ISO-CTRL-008", "State-specified Enabling Condition", true, true, List.of("CAP-ISO-PROC-011", "CAP-ISO-PROC-012")));
        return Map.copyOf(result);
    }

    private static Descriptor event(String capabilityId, String displayName, boolean enabling, boolean stateSpecified, List<String> baseCapabilityIds) {
        return descriptor(capabilityId, displayName, "e", "event", enabling, stateSpecified, baseCapabilityIds);
    }

    private static Descriptor condition(String capabilityId, String displayName, boolean enabling, boolean stateSpecified, List<String> baseCapabilityIds) {
        return descriptor(capabilityId, displayName, "c", "condition", enabling, stateSpecified, baseCapabilityIds);
    }

    private static Descriptor descriptor(String capabilityId, String displayName, String annotation, String controlKind,
                                         boolean enabling, boolean stateSpecified, List<String> baseCapabilityIds) {
        String family = "opl.control." + controlKind + "." + (enabling ? "enabling" : "transforming") + (stateSpecified ? ".state" : "") + ".v1";
        String symbolId = "symbol.control." + controlKind + "." + (enabling ? "enabling" : "transforming") + (stateSpecified ? ".state" : "");
        return new Descriptor(capabilityId, displayName, annotation, symbolId, family, "rule.iso.control." + controlKind + "." + capabilityId.substring(capabilityId.length() - 3) + ".v1", List.copyOf(baseCapabilityIds));
    }

    private static void register(Map<String, Descriptor> target, Descriptor descriptor) {
        target.put(descriptor.capabilityId(), descriptor);
    }

    record Descriptor(String capabilityId, String displayName, String annotation, String symbolId, String templateId, String ruleId,
                      List<String> baseCapabilityIds) {
    }
}
