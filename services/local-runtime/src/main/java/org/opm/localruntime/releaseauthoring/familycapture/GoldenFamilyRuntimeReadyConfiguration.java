package org.opm.localruntime.releaseauthoring.familycapture;

import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.releaseauthoring.GoldenFixtureMaterializationException;
import org.opm.localruntime.releaseauthoring.ReleaseGoldenAuthoringLaunchMode;
import org.springframework.boot.ApplicationArguments;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.ConfigurableEnvironment;

/** Family Web Runtime 的受控装配，仅在封闭 Family Web mode 生效。 */
@Configuration(proxyBeanMethods = false)
@Profile("release-golden-authoring")
@Conditional(GoldenFamilyRuntimeReadyConfiguration.WebModeCondition.class)
public class GoldenFamilyRuntimeReadyConfiguration {

    @Bean
    GoldenFamilyRuntimeReadyWriter goldenFamilyRuntimeReadyWriter(ConfigurableEnvironment environment,
                                                                   ApplicationArguments arguments) {
        return new GoldenFamilyRuntimeReadyWriter(environment, arguments,
                GoldenFamilyRuntimeReadyWriter::runtimeJarFromCodeSource);
    }

    @Bean
    @Primary
    FileProfilePackageLoader goldenFamilyVerifiedProfilePackageLoader(ConfigurableEnvironment environment) {
        return GoldenFamilyRuntimeReadyWriter.verifiedProfilePackageLoader(environment);
    }

    public static final class WebModeCondition implements org.springframework.context.annotation.Condition {
        @Override
        public boolean matches(org.springframework.context.annotation.ConditionContext context,
                               org.springframework.core.type.AnnotatedTypeMetadata metadata) {
            if (!(context.getEnvironment() instanceof ConfigurableEnvironment environment)) return false;
            try {
                return ReleaseGoldenAuthoringLaunchMode.require(environment)
                        == ReleaseGoldenAuthoringLaunchMode.RELEASE_GOLDEN_FAMILY_WEB;
            } catch (GoldenFixtureMaterializationException exception) {
                return false;
            }
        }
    }
}
