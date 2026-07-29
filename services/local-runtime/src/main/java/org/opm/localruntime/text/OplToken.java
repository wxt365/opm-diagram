package org.opm.localruntime.text;

import java.util.Objects;

public record OplToken(Kind kind, String text) {

    public OplToken {
        kind = Objects.requireNonNull(kind, "kind must not be null");
        if (text == null || text.isEmpty()) {
            throw new IllegalArgumentException("text must not be empty");
        }
    }

    public enum Kind { PROCESS, KEYWORD, STATE, OBJECT, PUNCTUATION }
}
