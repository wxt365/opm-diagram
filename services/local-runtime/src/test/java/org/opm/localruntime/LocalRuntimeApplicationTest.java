package org.opm.localruntime;

import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

class LocalRuntimeApplicationTest {

    @Test
    void contextLoads() {
        try (ConfigurableApplicationContext context = new SpringApplicationBuilder(LocalRuntimeApplication.class)
                .web(WebApplicationType.NONE)
                .run()) {
            org.junit.jupiter.api.Assertions.assertNotNull(context.getBean("localSessionToken"));
        }
    }
}
