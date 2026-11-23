package org.opm.localruntime.desktop;

import jakarta.annotation.PreDestroy;
import org.opm.localruntime.application.LocalApiService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.web.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import java.nio.file.Path;
import java.time.Duration;

@Component
@ConditionalOnProperty(name = "opm.desktop.enabled", havingValue = "true")
final class DesktopLifecycle {
    private final ConfigurableApplicationContext context;
    private final LocalApiService service;
    private AutoCloseable monitor;

    DesktopLifecycle(ConfigurableApplicationContext context, LocalApiService service) {
        this.context = context; this.service = service;
    }

    @EventListener(ApplicationReadyEvent.class)
    void ready() throws Exception {
        // 先验证核心资产绑定，不能把单纯监听端口当成工作台就绪。
        service.activeProfileRuleBinding();
        DesktopProcessProtocol.ready(Path.of(System.getenv("OPM_DESKTOP_READY_FILE")),
                System.getenv("OPM_DESKTOP_NONCE"), ((WebServerApplicationContext) context).getWebServer().getPort());
        monitor = DesktopProcessProtocol.watch(System.in, context::close, Duration.ofSeconds(15));
    }

    @PreDestroy
    void dispose() throws Exception { if (monitor != null) monitor.close(); }
}
