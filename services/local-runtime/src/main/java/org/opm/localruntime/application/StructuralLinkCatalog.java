package org.opm.localruntime.application;

import org.opm.localruntime.semantic.SemanticRevision;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** ISO 草案代表性结构关系的受控运行时描述符。 */
final class StructuralLinkCatalog {

    private static final Map<String, Descriptor> DESCRIPTORS = descriptors();

    private StructuralLinkCatalog() {
    }

    static List<Descriptor> all() {
        return List.copyOf(DESCRIPTORS.values());
    }

    static Optional<Descriptor> find(String capabilityId) {
        return Optional.ofNullable(DESCRIPTORS.get(capabilityId));
    }

    private static Map<String, Descriptor> descriptors() {
        Map<String, Descriptor> result = new LinkedHashMap<>();
        register(result, descriptor("CAP-ISO-STRUCT-001", "Unidirectional Tagged", "symbol.link.structural.tagged.unidirectional", "opl.structural.tagged.unidirectional.v1", "rule.iso.struct.tagged.unidirectional.v1", Shape.BINARY_SAME_THING, SemanticRevision.Direction.DIRECTED, List.of("forward_tag"), true, false));
        register(result, descriptor("CAP-ISO-STRUCT-002", "Unidirectional Null-tagged", "symbol.link.structural.null-tagged.unidirectional", "opl.structural.null-tagged.unidirectional.v1", "rule.iso.struct.null-tagged.unidirectional.v1", Shape.BINARY_SAME_THING, SemanticRevision.Direction.DIRECTED, List.of(), false, false));
        register(result, descriptor("CAP-ISO-STRUCT-003", "Bidirectional Tagged", "symbol.link.structural.tagged.bidirectional", "opl.structural.tagged.bidirectional.v1", "rule.iso.struct.tagged.bidirectional.v1", Shape.BINARY_SAME_THING, SemanticRevision.Direction.BIDIRECTIONAL, List.of("forward_tag", "reverse_tag"), true, false));
        register(result, descriptor("CAP-ISO-STRUCT-004", "Reciprocal Tagged", "symbol.link.structural.tagged.reciprocal", "opl.structural.tagged.reciprocal.v1", "rule.iso.struct.tagged.reciprocal.v1", Shape.BINARY_SAME_THING, SemanticRevision.Direction.BIDIRECTIONAL, List.of("reciprocal"), false, false));
        register(result, descriptor("CAP-ISO-STRUCT-005", "Aggregation-participation", "symbol.link.structural.aggregation", "opl.structural.aggregation.v1", "rule.iso.struct.aggregation.v1", Shape.AGGREGATION_FAN, SemanticRevision.Direction.DIRECTED, List.of(), false, true));
        register(result, descriptor("CAP-ISO-STRUCT-006", "Exhibition-characterization", "symbol.link.structural.exhibition", "opl.structural.exhibition.v1", "rule.iso.struct.exhibition.v1", Shape.EXHIBITION_FAN, SemanticRevision.Direction.DIRECTED, List.of(), false, true));
        register(result, descriptor("CAP-ISO-STRUCT-007", "Generalization-specialization", "symbol.link.structural.generalization", "opl.structural.generalization.v1", "rule.iso.struct.generalization.v1", Shape.GENERALIZATION_FAN, SemanticRevision.Direction.DIRECTED, List.of(), false, true));
        register(result, descriptor("CAP-ISO-STRUCT-008", "Classification-instantiation", "symbol.link.structural.classification", "opl.structural.classification.v1", "rule.iso.struct.classification.v1", Shape.CLASSIFICATION_FAN, SemanticRevision.Direction.DIRECTED, List.of(), false, false));
        register(result, descriptor("CAP-ISO-STRUCT-009", "State-specified Characterization", "symbol.link.structural.exhibition.state", "opl.structural.exhibition.state.v1", "rule.iso.struct.exhibition.state.v1", Shape.STATE_CHARACTERIZATION, SemanticRevision.Direction.DIRECTED, List.of(), false, false));
        register(result, descriptor("CAP-ISO-STRUCT-010", "State-specified Tagged", "symbol.link.structural.tagged.state", "opl.structural.tagged.state.v1", "rule.iso.struct.tagged.state.v1", Shape.STATE_TAGGED, SemanticRevision.Direction.PROFILE_DEFINED, List.of("forward_tag", "reverse_tag"), true, false));
        return Map.copyOf(result);
    }

    private static Descriptor descriptor(String capabilityId, String displayName, String symbolId, String templateId, String ruleId,
                                         Shape shape, SemanticRevision.Direction direction, List<String> labelSlots,
                                         boolean labelsRequired, boolean completenessSupported) {
        return new Descriptor(capabilityId, displayName, symbolId, templateId, ruleId, shape, direction, List.copyOf(labelSlots), labelsRequired, completenessSupported);
    }

    private static void register(Map<String, Descriptor> target, Descriptor descriptor) {
        target.put(descriptor.capabilityId(), descriptor);
    }

    enum Shape { BINARY_SAME_THING, AGGREGATION_FAN, EXHIBITION_FAN, GENERALIZATION_FAN, CLASSIFICATION_FAN, STATE_CHARACTERIZATION, STATE_TAGGED }

    record Descriptor(String capabilityId, String displayName, String symbolId, String templateId, String ruleId, Shape shape,
                      SemanticRevision.Direction direction, List<String> labelSlots, boolean labelsRequired, boolean completenessSupported) {
    }
}
