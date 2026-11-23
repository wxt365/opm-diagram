package org.opm.localruntime.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.net.URI;
import java.util.HashSet;
import java.util.Set;

final class LocalWriteRequestGuard implements HandlerInterceptor {

    private static final Set<String> ALLOWED_HOSTS = Set.of("127.0.0.1", "localhost");
    private final LocalSessionToken sessionToken;
    private final Set<String> trustedWebOrigins;
    private final EmbeddedAccessPolicy embeddedAccess;

    LocalWriteRequestGuard(LocalSessionToken sessionToken) {
        this(sessionToken, "");
    }

    LocalWriteRequestGuard(LocalSessionToken sessionToken, String configuredOrigins) {
        this(sessionToken, configuredOrigins, null);
    }

    LocalWriteRequestGuard(LocalSessionToken sessionToken, String configuredOrigins, EmbeddedAccessPolicy embeddedAccess) {
        this.sessionToken = sessionToken;
        this.embeddedAccess = embeddedAccess;
        Set<String> origins = new HashSet<>();
        for (String entry : configuredOrigins.split(",")) {
            String origin = entry.trim();
            if (origin.isEmpty()) continue;
            URI parsed = URI.create(origin);
            if (!("http".equals(parsed.getScheme()) || "https".equals(parsed.getScheme()))
                    || parsed.getHost() == null || parsed.getRawUserInfo() != null
                    || (parsed.getRawPath() != null && !parsed.getRawPath().isEmpty())
                    || parsed.getRawQuery() != null || parsed.getRawFragment() != null
                    || parsed.getPort() > 65535) {
                throw new IllegalArgumentException("可信工作台来源必须为完整 HTTP(S) 来源，不支持路径或通配符");
            }
            origins.add(origin);
        }
        trustedWebOrigins = Set.copyOf(origins);
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equals(request.getMethod())) return true;
        if (embeddedAccess != null && embeddedAccess.remoteEnabled()) return validate(request);
        if (!HttpMethod.POST.matches(request.getMethod())) {
            return true;
        }
        return validate(request);
    }

    boolean validate(HttpServletRequest request) {
        return validate(request, request.getHeader("Origin"));
    }

    boolean validateRead(HttpServletRequest request) {
        String origin = request.getHeader("Origin");
        if (origin == null) {
            String referer = request.getHeader("Referer");
            if (referer != null) try {
                URI parsed = URI.create(referer);
                if (parsed.getHost() != null && parsed.getRawUserInfo() == null) {
                    origin = new URI(parsed.getScheme(), null, parsed.getHost(), parsed.getPort(), null, null, null).toString();
                }
            } catch (IllegalArgumentException | java.net.URISyntaxException ignored) { }
        }
        return validate(request, origin);
    }

    private boolean validate(HttpServletRequest request, String origin) {
        String host = request.getServerName();
        if (embeddedAccess != null && embeddedAccess.remoteEnabled()) {
            // 浏览器同源 GET 不一定附带 Origin，使用 Referer 的来源部分。
            if (origin == null && "GET".equals(request.getMethod()) && request.getHeader("Referer") != null) {
                try { URI uri = URI.create(request.getHeader("Referer")); origin = uri.getScheme() + "://" + uri.getRawAuthority(); }
                catch (IllegalArgumentException ignored) { /* 后续拒绝无效来源。 */ }
            }
            if (!embeddedAccess.allowedOrigin(origin) || !sessionToken.matches(request.getHeader("X-OPM-Session")))
                throw new ApiException(ApiErrorCode.LOCAL_SESSION_INVALID, 403, false, "嵌入请求来源或会话无效");
            return true;
        }
        if (!ALLOWED_HOSTS.contains(host)
                || !(sameLoopbackOrigin(origin, host) || (origin != null && trustedWebOrigins.contains(origin)))
                || !sessionToken.matches(request.getHeader("X-OPM-Session"))) {
            throw new ApiException(ApiErrorCode.LOCAL_SESSION_INVALID, 403, false,
                    "本地写请求缺少有效的 Host、Origin 或会话令牌");
        }
        return true;
    }

    private boolean sameLoopbackOrigin(String origin, String host) {
        if (origin == null || origin.isBlank()) return false;
        try {
            URI parsed = URI.create(origin);
            return ("http".equals(parsed.getScheme()) || "https".equals(parsed.getScheme()))
                    && ALLOWED_HOSTS.contains(parsed.getHost()) && host.equals(parsed.getHost());
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }
}
