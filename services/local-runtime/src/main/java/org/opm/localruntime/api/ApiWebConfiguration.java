package org.opm.localruntime.api;

import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods = false)
class ApiWebConfiguration implements WebMvcConfigurer {

    private final LocalSessionToken sessionToken;
    private final String trustedWebOrigins;
    private final EmbeddedAccessPolicy access;

    ApiWebConfiguration(LocalSessionToken sessionToken,
                        @Value("${opm.security.trusted-web-origins:}") String trustedWebOrigins,
                        ObjectProvider<EmbeddedAccessPolicy> access) {
        this.sessionToken = sessionToken;
        this.trustedWebOrigins = trustedWebOrigins;
        this.access = access.getIfAvailable(() -> new EmbeddedAccessPolicy(false, "", trustedWebOrigins));
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new LocalWriteRequestGuard(sessionToken, trustedWebOrigins, access)).addPathPatterns("/api/v1/**")
                .excludePathPatterns("/api/v1/integration/session");
        registry.addInterceptor(new DraftWriteRequestGuard(sessionToken, trustedWebOrigins, access)).addPathPatterns("/api/v2/**");
    }
}
