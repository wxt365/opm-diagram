package org.opm.localruntime.api;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;

/** 远程模式显式启用；来源 allowlist 与接入凭证分别验证。 */
@Component
public final class EmbeddedAccessPolicy {
    private final boolean remoteEnabled;
    private final String accessToken;
    private final Set<String> trustedOrigins;

    public EmbeddedAccessPolicy(@Value("${opm.security.remote-enabled:false}") boolean remoteEnabled,
                                @Value("${opm.security.embedded-access-token:}") String accessToken,
                                @Value("${opm.security.trusted-web-origins:}") String origins) {
        this.remoteEnabled = remoteEnabled; this.accessToken = accessToken;
        Set<String> trusted = new HashSet<>();
        for (String entry : origins.split(",")) {
            String origin = entry.trim();
            if (origin.isEmpty()) continue;
            URI uri = URI.create(origin);
            if (!validOrigin(origin, uri)) throw new IllegalArgumentException("可信来源必须为精确 HTTP(S) 来源");
            trusted.add(origin);
        }
        this.trustedOrigins = Set.copyOf(trusted);
        if (remoteEnabled && accessToken.isBlank()) throw new IllegalArgumentException("远程模式必须配置 embedded-access-token");
    }

    public boolean remoteEnabled() { return remoteEnabled; }
    public boolean allowedOrigin(String origin) {
        if (origin == null) return false;
        try {
            URI uri = URI.create(origin);
            return validOrigin(origin, uri) && (trustedOrigins.contains(origin) || isLoopback(uri.getHost()));
        } catch (IllegalArgumentException exception) { return false; }
    }
    public boolean allowedSessionOrigin(String origin, String host) {
        if (remoteEnabled) return allowedOrigin(origin);
        if (!isLoopback(host) || origin == null) return false;
        if (trustedOrigins.contains(origin)) return true;
        try { URI uri = URI.create(origin); return validOrigin(origin, uri) && host.equals(uri.getHost()); }
        catch (IllegalArgumentException exception) { return false; }
    }
    public void authorizeSession(HttpServletRequest request) {
        if (!allowedSessionOrigin(request.getHeader("Origin"), request.getServerName())) reject();
        if (remoteEnabled && !matches("Bearer " + accessToken, request.getHeader("Authorization"))) reject();
    }
    public static boolean isLoopback(String host) { return "127.0.0.1".equals(host) || "localhost".equals(host); }
    private boolean validOrigin(String value, URI uri) {
        return ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) && uri.getHost() != null
                && !value.contains("*") && uri.getRawUserInfo() == null
                && (uri.getRawPath() == null || uri.getRawPath().isEmpty()) && uri.getRawQuery() == null
                && uri.getRawFragment() == null && uri.getPort() <= 65535;
    }
    private boolean matches(String expected, String actual) {
        return actual != null && MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), actual.getBytes(StandardCharsets.UTF_8));
    }
    private void reject() { throw new ApiException(ApiErrorCode.LOCAL_SESSION_INVALID, 403, false, "来源或接入凭证无效，请检查部署配置"); }
}
