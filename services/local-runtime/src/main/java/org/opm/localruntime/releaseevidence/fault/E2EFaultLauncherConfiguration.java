package org.opm.localruntime.releaseevidence.fault;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertySource;

/** 只消费 guard 写入的具名 source，普通启动只能得到 NOOP。 */
@Configuration(proxyBeanMethods = false)
public class E2EFaultLauncherConfiguration {
    @Bean
    @ConditionalOnMissingBean(E2EFaultPort.class)
    E2EFaultPort e2eFaultPort(ConfigurableEnvironment environment) {
        PropertySource<?> source = environment.getPropertySources().get(E2EFaultLauncherEnvironmentPostProcessor.VERIFIED_SOURCE);
        if (source == null) return E2EFaultPort.NOOP;
        Object verified = source.getProperty(E2EFaultLauncherEnvironmentPostProcessor.VERIFIED_KEY);
        if (!(verified instanceof E2EFaultPlanVerifier.VerifiedPlan plan)) {
            throw E2EFaultPlanVerifier.failure(E2EFaultLauncherErrorCode.E2E_FAULT_INTERNAL_ERROR, "PORT_ARM", null, null, "Verified plan source is malformed");
        }
        System.out.println("E2E_FAULT_LAUNCHER_READY\t" + plan.plan().caseId() + "\t" + plan.plan().attemptOrdinal() + "\t" + plan.rawSha256());
        return new AttemptLocalE2EFaultPort(plan, Runtime.getRuntime()::halt);
    }
}
