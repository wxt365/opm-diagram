package org.opm.localruntime.api;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class LocalSessionConfiguration {

    @Bean
    LocalSessionToken localSessionToken() {
        return new LocalSessionToken();
    }
}
