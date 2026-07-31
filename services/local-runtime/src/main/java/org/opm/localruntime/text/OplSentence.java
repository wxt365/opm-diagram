package org.opm.localruntime.text;

import java.util.List;
import java.util.Objects;

public record OplSentence(String sentenceId, String text, int ordinal, List<OplToken> tokens, List<String> generationRuleIds, List<String> inputFactIds) {

    public OplSentence {
        requireNonBlank(sentenceId, "sentenceId");
        requireNonBlank(text, "text");
        if (ordinal < 0) {
            throw new IllegalArgumentException("ordinal must not be negative");
        }
        tokens = List.copyOf(Objects.requireNonNull(tokens, "tokens must not be null"));
        if (tokens.isEmpty()) {
            throw new IllegalArgumentException("tokens must not be empty");
        }
        generationRuleIds = immutableNonEmpty(generationRuleIds, "generationRuleIds");
        inputFactIds = immutableNonEmpty(inputFactIds, "inputFactIds");
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
