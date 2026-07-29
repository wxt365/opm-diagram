package org.opm.localruntime.application;

import org.opm.localruntime.semantic.SemanticRevision;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** ISO 草案代表性过程关系的受控运行时描述符。 */
final class ProceduralLinkCatalog {

    static final String CONSUMPTION = "CAP-ISO-PROC-001";

    private static final Map<String, Descriptor> DESCRIPTORS = descriptors();

    private ProceduralLinkCatalog() {
    }

    static List<Descriptor> all() {
        return List.copyOf(DESCRIPTORS.values());
    }

    static Optional<Descriptor> find(String capabilityId) {
        return Optional.ofNullable(DESCRIPTORS.get(capabilityId));
    }

    private static Map<String, Descriptor> descriptors() {
        Map<String, Descriptor> result = new LinkedHashMap<>();
        register(result, descriptor("CAP-ISO-PROC-001", "Consumption", SemanticRevision.FactFamily.TRANSFORMATION, "symbol.link.consumption", "opl.consumption.v1", "rule.iso.proc.consumption.endpoints.v1", roles("CONSUMED_OBJECT", Kind.OBJECT, "CONSUMING_PROCESS", Kind.PROCESS)));
        register(result, descriptor("CAP-ISO-PROC-002", "Result", SemanticRevision.FactFamily.TRANSFORMATION, "symbol.link.result", "opl.result.v1", "rule.iso.proc.result.endpoints.v1", roles("RESULT_PROCESS", Kind.PROCESS, "RESULT_OBJECT", Kind.OBJECT)));
        register(result, descriptor("CAP-ISO-PROC-003", "Effect", SemanticRevision.FactFamily.TRANSFORMATION, "symbol.link.effect", "opl.effect.v1", "rule.iso.proc.effect.endpoints.v1", roles("AFFECTEE", Kind.OBJECT, "AFFECTING_PROCESS", Kind.PROCESS, "AFFECTED", Kind.OBJECT)));
        register(result, descriptor("CAP-ISO-PROC-004", "Agent", SemanticRevision.FactFamily.ENABLING, "symbol.link.agent", "opl.agent.v1", "rule.iso.proc.agent.endpoints.v1", roles("AGENT_OBJECT", Kind.OBJECT, "ENABLED_PROCESS", Kind.PROCESS)));
        register(result, descriptor("CAP-ISO-PROC-005", "Instrument", SemanticRevision.FactFamily.ENABLING, "symbol.link.instrument", "opl.instrument.v1", "rule.iso.proc.instrument.endpoints.v1", roles("INSTRUMENT_OBJECT", Kind.OBJECT, "ENABLED_PROCESS", Kind.PROCESS)));
        register(result, descriptor("CAP-ISO-PROC-006", "State-specified Consumption", SemanticRevision.FactFamily.TRANSFORMATION, "symbol.link.consumption.state", "opl.consumption.state.v1", "rule.iso.proc.state-consumption.endpoints.v1", roles("CONSUMED_STATE", Kind.STATE, "CONSUMING_PROCESS", Kind.PROCESS)));
        register(result, descriptor("CAP-ISO-PROC-007", "State-specified Result", SemanticRevision.FactFamily.TRANSFORMATION, "symbol.link.result.state", "opl.result.state.v1", "rule.iso.proc.state-result.endpoints.v1", roles("RESULT_PROCESS", Kind.PROCESS, "RESULT_STATE", Kind.STATE)));
        register(result, descriptor("CAP-ISO-PROC-008", "Input-output-specified Effect", SemanticRevision.FactFamily.TRANSFORMATION, "symbol.link.effect.state.input-output", "opl.effect.state.input-output.v1", "rule.iso.proc.state-effect.input-output.endpoints.v1", roles("AFFECTEE_INPUT_STATE", Kind.STATE, "AFFECTING_PROCESS", Kind.PROCESS, "AFFECTED_OUTPUT_STATE", Kind.STATE)));
        register(result, descriptor("CAP-ISO-PROC-009", "Input-specified Effect", SemanticRevision.FactFamily.TRANSFORMATION, "symbol.link.effect.state.input", "opl.effect.state.input.v1", "rule.iso.proc.state-effect.input.endpoints.v1", roles("AFFECTEE_INPUT_STATE", Kind.STATE, "AFFECTING_PROCESS", Kind.PROCESS, "AFFECTED_OBJECT", Kind.OBJECT)));
        register(result, descriptor("CAP-ISO-PROC-010", "Output-specified Effect", SemanticRevision.FactFamily.TRANSFORMATION, "symbol.link.effect.state.output", "opl.effect.state.output.v1", "rule.iso.proc.state-effect.output.endpoints.v1", roles("AFFECTEE_OBJECT", Kind.OBJECT, "AFFECTING_PROCESS", Kind.PROCESS, "AFFECTED_OUTPUT_STATE", Kind.STATE)));
        register(result, descriptor("CAP-ISO-PROC-011", "State-specified Agent", SemanticRevision.FactFamily.ENABLING, "symbol.link.agent.state", "opl.agent.state.v1", "rule.iso.proc.state-agent.endpoints.v1", roles("AGENT_STATE", Kind.STATE, "ENABLED_PROCESS", Kind.PROCESS)));
        register(result, descriptor("CAP-ISO-PROC-012", "State-specified Instrument", SemanticRevision.FactFamily.ENABLING, "symbol.link.instrument.state", "opl.instrument.state.v1", "rule.iso.proc.state-instrument.endpoints.v1", roles("INSTRUMENT_STATE", Kind.STATE, "ENABLED_PROCESS", Kind.PROCESS)));
        register(result, descriptor("CAP-ISO-PROC-013", "Invocation", SemanticRevision.FactFamily.PROFILE_FACT, "symbol.link.invocation", "opl.invocation.v1", "rule.iso.proc.invocation.endpoints.v1", roles("INVOKING_PROCESS", Kind.PROCESS, "INVOKED_PROCESS", Kind.PROCESS)));
        register(result, descriptor("CAP-ISO-PROC-014", "Self-invocation", SemanticRevision.FactFamily.PROFILE_FACT, "symbol.link.invocation.self", "opl.invocation.self.v1", "rule.iso.proc.self-invocation.identity.v1", roles("INVOKING_PROCESS", Kind.PROCESS, "INVOKED_PROCESS", Kind.PROCESS), false, true));
        register(result, descriptor("CAP-ISO-PROC-015", "Overtime Exception", SemanticRevision.FactFamily.PROFILE_FACT, "symbol.link.exception.overtime", "opl.exception.overtime.v1", "rule.iso.proc.overtime-exception.duration.v1", roles("MONITORED_PROCESS", Kind.PROCESS, "HANDLING_PROCESS", Kind.PROCESS), true, false));
        register(result, descriptor("CAP-ISO-PROC-016", "Undertime Exception", SemanticRevision.FactFamily.PROFILE_FACT, "symbol.link.exception.undertime", "opl.exception.undertime.v1", "rule.iso.proc.undertime-exception.duration.v1", roles("MONITORED_PROCESS", Kind.PROCESS, "HANDLING_PROCESS", Kind.PROCESS), true, false));
        return Map.copyOf(result);
    }

    private static Descriptor descriptor(String capabilityId, String displayName, SemanticRevision.FactFamily family, String symbolId, String templateId, String ruleId, List<EndpointRole> endpoints) {
        return descriptor(capabilityId, displayName, family, symbolId, templateId, ruleId, endpoints, false, false);
    }

    private static Descriptor descriptor(String capabilityId, String displayName, SemanticRevision.FactFamily family, String symbolId, String templateId, String ruleId, List<EndpointRole> endpoints, boolean durationRequired, boolean sameProcessRequired) {
        return new Descriptor(capabilityId, displayName, family, symbolId, templateId, ruleId, endpoints, durationRequired, sameProcessRequired);
    }

    private static List<EndpointRole> roles(Object... values) {
        java.util.ArrayList<EndpointRole> result = new java.util.ArrayList<>();
        for (int index = 0; index < values.length; index += 2) result.add(new EndpointRole((String) values[index], (Kind) values[index + 1]));
        return List.copyOf(result);
    }

    private static void register(Map<String, Descriptor> target, Descriptor descriptor) {
        target.put(descriptor.capabilityId(), descriptor);
    }

    enum Kind { OBJECT, STATE, PROCESS }

    record EndpointRole(String role, Kind kind) {
    }

    record Descriptor(
            String capabilityId,
            String displayName,
            SemanticRevision.FactFamily family,
            String symbolId,
            String templateId,
            String ruleId,
            List<EndpointRole> endpointRoles,
            boolean durationRequired,
            boolean sameProcessRequired) {
    }
}
