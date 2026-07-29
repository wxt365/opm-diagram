package org.opm.localruntime.text;

import java.util.List;
import java.util.Objects;

public record OplParagraph(String paragraphId, String contextId, int ordinal, List<OplSentence> sentences) {

    public OplParagraph {
        requireNonBlank(paragraphId, "paragraphId");
        requireNonBlank(contextId, "contextId");
        if (ordinal < 0) {
            throw new IllegalArgumentException("ordinal must not be negative");
        }
        sentences = List.copyOf(Objects.requireNonNull(sentences, "sentences must not be null"));
    }

    private static void requireNonBlank(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
    }
}
