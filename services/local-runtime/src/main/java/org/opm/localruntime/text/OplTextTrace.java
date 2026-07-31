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
        String bindingDigest,
        List<TokenRange> tokenRanges,
        List<OplToken.SourceRef> sourceRefs) {

    public OplTextTrace {
        requireNonBlank(traceId, "traceId");
        requireNonBlank(contextId, "contextId");
        factIds = immutableNonEmpty(factIds, "factIds");
        inputElementIds = immutableNonEmpty(inputElementIds, "inputElementIds");
        occurrenceIds = immutableNonEmpty(occurrenceIds, "occurrenceIds");
        sentenceIds = immutableNonEmpty(sentenceIds, "sentenceIds");
        ruleIds = immutableNonEmpty(ruleIds, "ruleIds");
        requireNonBlank(bindingDigest, "bindingDigest");
        tokenRanges = List.copyOf(Objects.requireNonNull(tokenRanges, "tokenRanges must not be null"));
        if (tokenRanges.isEmpty()) {
            throw new IllegalArgumentException("tokenRanges must not be empty");
        }
        sourceRefs = List.copyOf(Objects.requireNonNull(sourceRefs, "sourceRefs must not be null"));
        if (sourceRefs.isEmpty()) {
            throw new IllegalArgumentException("sourceRefs must not be empty");
        }
    }

    public OplTextTrace(
            String traceId,
            String contextId,
            List<String> factIds,
            List<String> inputElementIds,
            List<String> occurrenceIds,
            List<String> sentenceIds,
            List<String> ruleIds,
            String bindingDigest,
            List<TokenRange> tokenRanges) {
        this(traceId, contextId, factIds, inputElementIds, occurrenceIds, sentenceIds, ruleIds, bindingDigest, tokenRanges,
                List.of(new OplToken.SourceRef(OplToken.SourceKind.LEGACY, "legacy", null, null, null)));
    }

    public record TokenRange(String inputId, int startUtf8Byte, int endUtf8Byte) {
        public TokenRange {
            requireNonBlank(inputId, "inputId");
            if (startUtf8Byte < 0 || endUtf8Byte <= startUtf8Byte) {
                throw new IllegalArgumentException("token range is invalid");
            }
        }

        /** 兼容旧调用方；偏移口径始终是 UTF-8 byte。 */
        public int startInclusive() { return startUtf8Byte; }

        /** 兼容旧调用方；偏移口径始终是 UTF-8 byte。 */
        public int endExclusive() { return endUtf8Byte; }
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
