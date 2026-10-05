package org.opm.localruntime.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.opm.localruntime.application.DraftWorkspaceService;
import org.springframework.web.servlet.HandlerInterceptor;

/** 复用本地安全判断，错误转换为 v2 协议，避免改变 v1 错误体。 */
final class DraftWriteRequestGuard implements HandlerInterceptor {
    private final LocalWriteRequestGuard delegate;
    DraftWriteRequestGuard(LocalSessionToken session) { delegate = new LocalWriteRequestGuard(session); }
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        try {
            if ("GET".equals(request.getMethod()) && handler instanceof org.springframework.web.method.HandlerMethod method
                    && method.getBeanType() == DraftSaveController.class) return delegate.validate(request);
            return delegate.preHandle(request, response, handler);
        }
        catch (ApiException exception) { throw new DraftWorkspaceService.Failure("LOCAL_SESSION_INVALID", null); }
    }
}
