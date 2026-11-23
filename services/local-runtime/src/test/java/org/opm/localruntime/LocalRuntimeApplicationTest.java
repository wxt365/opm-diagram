package org.opm.localruntime;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

class LocalRuntimeApplicationTest {
    @TempDir Path temporaryDirectory;

    @Test
    void contextLoads() {
        try (ConfigurableApplicationContext context = new SpringApplicationBuilder(LocalRuntimeApplication.class)
                .web(WebApplicationType.NONE)
                .run("--opm.storage.isolated-tools=true", "--opm.storage.root=" + temporaryDirectory.resolve("context"))) {
            org.junit.jupiter.api.Assertions.assertNotNull(context.getBean("localSessionToken"));
        }
    }
}
