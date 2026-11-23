package org.opm.localruntime.storage;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(StorageProperties.class)
class StorageConfiguration {
    @Bean
    ProjectDatabaseFactory projectDatabaseFactory(StorageProperties properties, RuntimeStore store) {
        return new ProjectDatabaseFactory(properties.root(), store, true);
    }

    @Bean
    RuntimeStore runtimeStore(Environment environment, StorageProperties properties) {
        String type = environment.getProperty("opm.storage.type", "sqlite");
        if (!"sqlite".equals(type)) throw new StorageAccessException("此版本仅支持 SQLite：" + type);
        RuntimeStore store = new SqliteStore(properties.root());
        try { store.migrate(); return store; }
        catch (RuntimeException error) { store.close(); throw error; }
    }
}
