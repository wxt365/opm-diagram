package org.opm.localruntime.text;

import java.util.List;
import java.util.Objects;

public record OplTextArtifact(
        String artifactId,
        String inputRevisionId,
        OplGrammar.Binding grammarBinding,
        String contextId,
        List<OplParagraph> paragraphs,
        String artifactDigest) {

    public OplTextArtifact {
        requireNonBlank(artifactId, "artifactId");
        requireNonBlank(inputRevisionId, "inputRevisionId");
        grammarBinding = Objects.requireNonNull(grammarBinding, "grammarBinding must not be null");
        requireNonBlank(contextId, "contextId");
        paragraphs = List.copyOf(Objects.requireNonNull(paragraphs, "paragraphs must not be null"));
        requireNonBlank(artifactDigest, "artifactDigest");
    }

    private static void requireNonBlank(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
    }
}
