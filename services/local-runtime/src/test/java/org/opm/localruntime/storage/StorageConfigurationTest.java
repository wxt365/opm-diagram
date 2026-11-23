package org.opm.localruntime.storage;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.StandardEnvironment;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.assertThat;

class StorageConfigurationTest {
    @TempDir Path temporary;
    private ApplicationContextRunner context(Path root) {
        return new ApplicationContextRunner().withUserConfiguration(StorageConfiguration.class)
                .withInitializer(context -> {
                    var properties = context.getEnvironment().getPropertySources();
                    properties.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
                    properties.remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
                })
                .withPropertyValues("opm.storage.root=" + root);
    }
    @Test void 默认SQLite无需外部数据源并能重新读取配色() {
        context(temporary).run(context -> {
            assertThat(context).hasNotFailed().hasSingleBean(RuntimeStore.class).doesNotHaveBean(javax.sql.DataSource.class);
            var store = context.getBean(RuntimeStore.class);
            assertThat(store).isInstanceOf(SqliteStore.class);
            new CanvasNodeColorRepository(store).write("object", java.util.Map.of("fill", "#abcdef"));
        });
        context(temporary).run(context -> assertThat(new CanvasNodeColorRepository(context.getBean(RuntimeStore.class)).read())
                .containsEntry("object", java.util.Map.of("fill", "#abcdef")));
    }
    @Test void 未知类型或PG缺失密码直接失败且不创建本地库() {
        for (String type : java.util.List.of("mysql", "postgresql")) {
            Path root = temporary.resolve(type);
            context(root).withPropertyValues("opm.storage.type=" + type, "spring.datasource.url=jdbc:postgresql://127.0.0.1:1/test",
                    "spring.datasource.username=test", "spring.datasource.password=").run(context -> assertThat(context).hasFailed());
            assertThat(Files.exists(root)).isFalse();
        }
    }
}
