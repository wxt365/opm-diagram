package org.opm.localruntime.api;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Objects;

public final class LocalSessionToken {

    private final String value;

    public LocalSessionToken() {
        this(newToken());
    }

    LocalSessionToken(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("value must not be blank");
        }
        this.value = value;
    }

    public boolean matches(String candidate) {
        return candidate != null && value.length() == candidate.length()
                && java.security.MessageDigest.isEqual(value.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                candidate.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    public String value() {
        return value;
    }

    private static String newToken() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
