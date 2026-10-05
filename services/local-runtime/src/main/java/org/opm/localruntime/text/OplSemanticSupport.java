package org.opm.localruntime.text;

import org.opm.localruntime.semantic.SemanticRevision;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/** 生成与复核共用的语义身份、Context 归属和 UTF-8 基础操作。 */
final class OplSemanticSupport {
    private OplSemanticSupport() { }

    static Map<String, List<SemanticRevision.Occurrence>> scopedOwnedOccurrences(
            SemanticRevision.Context context,
            Map<String, SemanticRevision.Occurrence> occurrences) {
        return context.occurrenceIds().stream().map(occurrences::get)
                .filter(Objects::nonNull)
                .filter(occurrence -> context.id().equals(occurrence.contextId()))
                .filter(occurrence -> occurrence.ownership() == SemanticRevision.OccurrenceOwnership.OWNED)
                .collect(Collectors.groupingBy(SemanticRevision.Occurrence::targetId));
    }

    static List<String> occurrenceIds(
            SemanticRevision.Fact fact,
            Map<String, List<SemanticRevision.Occurrence>> occurrencesByTarget,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        List<String> occurrenceIds = new ArrayList<>();
        appendOccurrenceIds(occurrenceIds, occurrencesByTarget, fact.id());
        for (SemanticRevision.Endpoint endpoint : fact.endpoints()) {
            appendOptionalOccurrenceIds(occurrenceIds, occurrencesByTarget, endpoint.targetId());
            if (endpoint.stateQualificationId() != null) {
                appendOptionalOccurrenceIds(occurrenceIds, occurrencesByTarget, endpoint.stateQualificationId());
            }
            for (String ownerId : finalOwningElementIds(endpoint, elements, features, states)) {
                appendOccurrenceIds(occurrenceIds, occurrencesByTarget, ownerId);
            }
        }
        return List.copyOf(new LinkedHashSet<>(occurrenceIds));
    }

    static List<String> finalOwningElementIds(
            SemanticRevision.Endpoint endpoint,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        if (endpoint.targetKind() == SemanticRevision.TargetKind.ELEMENT) return List.of(endpoint.targetId());
        if (endpoint.targetKind() == SemanticRevision.TargetKind.FEATURE) {
            SemanticRevision.Feature feature = features.get(endpoint.targetId());
            return feature == null ? List.of() : List.of(feature.ownerElementId());
        }
        if (endpoint.targetKind() == SemanticRevision.TargetKind.STATE) {
            SemanticRevision.State state = states.get(endpoint.targetId());
            if (state == null) return List.of();
            if (state.ownerTargetKind() == SemanticRevision.TargetKind.ELEMENT) return List.of(state.ownerElementId());
            SemanticRevision.Feature feature = features.get(state.ownerElementId());
            return feature == null ? List.of() : List.of(feature.ownerElementId());
        }
        return List.of();
    }

    static void appendOccurrenceIds(
            List<String> target,
            Map<String, List<SemanticRevision.Occurrence>> occurrencesByTarget,
            String targetId) {
        List<SemanticRevision.Occurrence> occurrences = occurrencesByTarget.get(targetId);
        if (occurrences == null || occurrences.isEmpty()) {
            throw failure(OplGenerationCode.TEXT_TRACE_INCOMPLETE, "Trace is missing occurrence for " + targetId);
        }
        occurrences.stream().map(SemanticRevision.Occurrence::id).sorted().forEach(target::add);
    }

    static void appendOptionalOccurrenceIds(
            List<String> target,
            Map<String, List<SemanticRevision.Occurrence>> occurrencesByTarget,
            String targetId) {
        List<SemanticRevision.Occurrence> occurrences = occurrencesByTarget.get(targetId);
        if (occurrences != null) {
            occurrences.stream().map(SemanticRevision.Occurrence::id).sorted().forEach(target::add);
        }
    }

    static <T> Map<String, T> index(List<T> values, java.util.function.Function<T, String> key) {
        Map<String, T> result = new HashMap<>();
        for (T value : values) {
            result.put(key.apply(value), value);
        }
        return result;
    }

    static OplGenerationException failure(OplGenerationCode code, String message) {
        return new OplGenerationException(code, message);
    }

    static String identifier(String prefix, String... values) {
        return prefix + "." + digest(String.join("\u001f", values)).substring(0, 32);
    }

    static String digest(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(bytes.length * 2);
            for (byte valueByte : bytes) {
                result.append(String.format("%02x", valueByte));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }

    static int utf8Offset(String text, int characterIndex) {
        return text.substring(0, characterIndex).getBytes(StandardCharsets.UTF_8).length;
    }

    static OplGenerationException incomplete(String message) {
        return failure(OplGenerationCode.TEXT_TRACE_INCOMPLETE, message);
    }

    static OplGenerationException legacyValueForbidden(String message) {
        return failure(OplGenerationCode.TEXT_LEGACY_VALUE_FORBIDDEN, message);
    }

}
