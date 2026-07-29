package org.opm.localruntime.assets;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(AssetProperties.class)
class AssetLoaderConfiguration {

    @Bean
    FileProfilePackageLoader fileProfilePackageLoader(AssetProperties properties) {
        return new FileProfilePackageLoader(properties.root());
    }
}
