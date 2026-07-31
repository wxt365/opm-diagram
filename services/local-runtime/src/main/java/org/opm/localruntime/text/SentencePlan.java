package org.opm.localruntime.text;

import java.util.List;
import java.util.Objects;

public record SentencePlan(
        String sentenceId,
        String contextId,
        String templateId,
        List<String> inputFactIds,
        List<String> inputElementIds,
        List<String> occurrenceIds,
        SortKey sortKey,
        String grammarVersion,
        String processName,
        String objectName,
        String stateId,
        String stateName) {

    public SentencePlan {
        requireNonBlank(sentenceId, "sentenceId");
        requireNonBlank(contextId, "contextId");
        requireNonBlank(templateId, "templateId");
        inputFactIds = immutableNonEmpty(inputFactIds, "inputFactIds");
        inputElementIds = immutableNonEmpty(inputElementIds, "inputElementIds");
        occurrenceIds = immutableNonEmpty(occurrenceIds, "occurrenceIds");
        sortKey = Objects.requireNonNull(sortKey, "sortKey must not be null");
        requireNonBlank(grammarVersion, "grammarVersion");
        requireNonBlank(processName, "processName");
        requireNonBlank(objectName, "objectName");
        if ((stateId == null) != (stateName == null)) {
            throw new IllegalArgumentException("stateId and stateName must either both be present or both be absent");
        }
        if (stateId != null && stateId.isBlank()) {
            throw new IllegalArgumentException("stateId must not be blank when present");
        }
        if (stateName != null && stateName.isBlank()) {
            throw new IllegalArgumentException("stateName must not be blank when present");
        }
    }

    public record SortKey(
            int contextPathOrdinal,
            int grammarPrecedence,
            String processStableId,
            String factStableId,
            int sentenceSlotRank,
            String templateId,
            String sentenceId)
            implements Comparable<SortKey> {
        public SortKey {
            requireNonBlank(processStableId, "processStableId");
            requireNonBlank(factStableId, "factStableId");
            if (sentenceSlotRank < 0) {
                throw new IllegalArgumentException("sentenceSlotRank must not be negative");
            }
            requireNonBlank(templateId, "templateId");
            requireNonBlank(sentenceId, "sentenceId");
        }

        public SortKey(int contextPathOrdinal, int grammarPrecedence, String processStableId, String factStableId, String sentenceId) {
            this(contextPathOrdinal, grammarPrecedence, processStableId, factStableId, 0, "legacy", sentenceId);
        }

        @Override
        public int compareTo(SortKey other) {
            int comparison = Integer.compare(contextPathOrdinal, other.contextPathOrdinal);
            if (comparison == 0) comparison = Integer.compare(grammarPrecedence, other.grammarPrecedence);
            if (comparison == 0) comparison = processStableId.compareTo(other.processStableId);
            if (comparison == 0) comparison = factStableId.compareTo(other.factStableId);
            if (comparison == 0) comparison = Integer.compare(sentenceSlotRank, other.sentenceSlotRank);
            if (comparison == 0) comparison = templateId.compareTo(other.templateId);
            return comparison == 0 ? sentenceId.compareTo(other.sentenceId) : comparison;
        }
    }

    private static List<String> immutableNonEmpty(List<String> values, String name) {
        List<String> result = List.copyOf(Objects.requireNonNull(values, name + " must not be null"));
        if (result.isEmpty() || result.stream().anyMatch(value -> value == null || value.isBlank())) {
            throw new IllegalArgumentException(name + " must contain non-blank values");
        }
        return result;
    }

    private static void requireNonBlank(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
    }
}
