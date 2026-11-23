package org.opm.localruntime.api;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.filter.CorsFilter;

import java.util.List;

@Configuration(proxyBeanMethods = false)
class EmbeddedCorsConfiguration {
    @Bean
    CorsFilter embeddedCorsFilter(EmbeddedAccessPolicy access) {
        return new CorsFilter(request -> {
            String path = request.getRequestURI().substring(request.getContextPath().length());
            if (!path.startsWith("/api/")) return null;
            String origin = request.getHeader("Origin");
            CorsConfiguration config = new CorsConfiguration();
            if (access.allowedOrigin(origin)) config.setAllowedOrigins(List.of(origin));
            config.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
            config.setAllowedHeaders(List.of("Content-Type", "X-OPM-Session", "Authorization"));
            config.setMaxAge(600L);
            return config;
        });
    }
}
