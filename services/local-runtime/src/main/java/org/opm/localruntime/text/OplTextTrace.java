package org.opm.localruntime.text;

import java.util.List;
import java.util.Objects;

public record OplTextTrace(
        String traceId,
        String contextId,
        List<String> factIds,
        List<String> inputElementIds,
        List<String> occurrenceIds,
        List<String> sentenceIds,
        List<String> ruleIds,
        List<TokenRange> tokenRanges) {

    public OplTextTrace {
        requireNonBlank(traceId, "traceId");
        requireNonBlank(contextId, "contextId");
        factIds = immutableNonEmpty(factIds, "factIds");
        inputElementIds = immutableNonEmpty(inputElementIds, "inputElementIds");
        occurrenceIds = immutableNonEmpty(occurrenceIds, "occurrenceIds");
        sentenceIds = immutableNonEmpty(sentenceIds, "sentenceIds");
        ruleIds = immutableNonEmpty(ruleIds, "ruleIds");
        tokenRanges = List.copyOf(Objects.requireNonNull(tokenRanges, "tokenRanges must not be null"));
        if (tokenRanges.isEmpty()) {
            throw new IllegalArgumentException("tokenRanges must not be empty");
        }
    }

    public record TokenRange(String inputId, int startInclusive, int endExclusive) {
        public TokenRange {
            requireNonBlank(inputId, "inputId");
            if (startInclusive < 0 || endExclusive <= startInclusive) {
                throw new IllegalArgumentException("token range is invalid");
            }
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
