package org.opm.localruntime.text;

import java.util.Objects;

public final class OplGenerationException extends RuntimeException {

    private final OplGenerationCode code;

    public OplGenerationException(OplGenerationCode code, String message) {
        super(message);
        this.code = Objects.requireNonNull(code, "code must not be null");
    }

    public OplGenerationCode code() {
        return code;
    }
}
