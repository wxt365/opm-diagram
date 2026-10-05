package org.opm.localruntime.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.net.URI;
import java.util.Set;

final class LocalWriteRequestGuard implements HandlerInterceptor {

    private static final Set<String> ALLOWED_HOSTS = Set.of("127.0.0.1", "localhost");
    private final LocalSessionToken sessionToken;

    LocalWriteRequestGuard(LocalSessionToken sessionToken) {
        this.sessionToken = sessionToken;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!HttpMethod.POST.matches(request.getMethod())) {
            return true;
        }
        return validate(request);
    }

    boolean validate(HttpServletRequest request) {
        String host = request.getServerName();
        String origin = request.getHeader("Origin");
        if (!ALLOWED_HOSTS.contains(host) || !sameLoopbackOrigin(origin, host) || !sessionToken.matches(request.getHeader("X-OPM-Session"))) {
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
