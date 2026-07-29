package org.opm.localruntime.storage;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(StorageProperties.class)
class StorageConfiguration {

    @Bean
    ProjectDatabaseFactory projectDatabaseFactory(StorageProperties properties) {
        return new ProjectDatabaseFactory(properties.root());
    }
}
