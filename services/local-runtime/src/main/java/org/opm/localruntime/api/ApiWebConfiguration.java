package org.opm.localruntime.api;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods = false)
class ApiWebConfiguration implements WebMvcConfigurer {

    private final LocalSessionToken sessionToken;

    ApiWebConfiguration(LocalSessionToken sessionToken) {
        this.sessionToken = sessionToken;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new LocalWriteRequestGuard(sessionToken)).addPathPatterns("/api/v1/**");
        registry.addInterceptor(new DraftWriteRequestGuard(sessionToken)).addPathPatterns("/api/v2/**");
    }
}
