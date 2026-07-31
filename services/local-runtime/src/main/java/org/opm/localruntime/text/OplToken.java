package org.opm.localruntime.text;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Objects;

public record OplToken(
        String tokenId,
        String sentenceId,
        int ordinal,
        String text,
        Kind kind,
        int startUtf8Byte,
        int endUtf8Byte,
        List<SourceRef> sourceRefs) {

    public OplToken {
        requireNonBlank(tokenId, "tokenId");
        requireNonBlank(sentenceId, "sentenceId");
        if (ordinal < 0) {
            throw new IllegalArgumentException("ordinal must not be negative");
        }
        kind = Objects.requireNonNull(kind, "kind must not be null");
        if (text == null || text.isEmpty()) {
            throw new IllegalArgumentException("text must not be empty");
        }
        if (startUtf8Byte < 0 || endUtf8Byte <= startUtf8Byte) {
            throw new IllegalArgumentException("token UTF-8 byte range is invalid");
        }
        sourceRefs = List.copyOf(Objects.requireNonNull(sourceRefs, "sourceRefs must not be null"));
        if (sourceRefs.isEmpty()) {
            throw new IllegalArgumentException("sourceRefs must not be empty");
        }
    }

    public OplToken(Kind kind, String text) {
        this("token.legacy", "sentence.legacy", 0, text, kind, 0, text.getBytes(StandardCharsets.UTF_8).length,
                List.of(new SourceRef(SourceKind.LEGACY, "legacy", null, null, null)));
    }

    public record SourceRef(SourceKind sourceKind, String stableId, String fieldPath, Integer endpointOrdinal, String sentenceSlot) {
        public SourceRef {
            sourceKind = Objects.requireNonNull(sourceKind, "sourceKind must not be null");
            requireNonBlank(stableId, "stableId");
            if (fieldPath != null) requireNonBlank(fieldPath, "fieldPath");
            if (endpointOrdinal != null && endpointOrdinal < 0) {
                throw new IllegalArgumentException("endpointOrdinal must not be negative");
            }
            if (sentenceSlot != null) requireNonBlank(sentenceSlot, "sentenceSlot");
        }
    }

    public enum Kind { ENTITY, STATE, RELATION_VERB, CONTROL_KEYWORD, LIST_SEPARATOR, PUNCTUATION, WHITESPACE, KEYWORD, PROCESS, OBJECT }

    public enum SourceKind { FACT, CAPABILITY, ENDPOINT, ELEMENT, FEATURE, STATE, MODIFIER, OCCURRENCE, TEMPLATE, GRAMMAR, RULE, LEGACY }

    private static void requireNonBlank(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
    }
}
