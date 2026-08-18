package org.opm.localruntime.releaseauthoring;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.MapPropertySource;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ReleaseGoldenAuthoringConditionTest {

    @Test
    void doesNotCreateAuthoringBeansOutsideTheDedicatedProfile() {
        new ApplicationContextRunner().withUserConfiguration(ReleaseAuthoringConfiguration.class).run(context -> {
            assertTrue(context.isRunning());
            assertTrue(context.getBeansOfType(GoldenFixtureMaterializerRunner.class).isEmpty());
            assertTrue(context.getBeansOfType(ReleaseGoldenAuthoringStartupGuard.class).isEmpty());
        });
    }

    @Test
    void createsTheRunnerOnlyWhenAllFiveCommandLineGuardsAreValid() {
        context(commandLine(true, "none", "RELEASE_GOLDEN_FIXTURE_MATERIALIZE", "true", "0.1.0"))
                .run(context -> {
                    assertTrue(context.isRunning());
                    assertFalse(context.getBeansOfType(GoldenFixtureMaterializerRunner.class).isEmpty());
                    assertFalse(context.getBeansOfType(ReleaseGoldenAuthoringStartupGuard.class).isEmpty());
                });
    }

    @Test
    void rejectsIncompleteOrConflictingReleaseProfileBeforeRunnerCreation() {
        context(commandLine(true, "servlet", "RELEASE_GOLDEN_FIXTURE_MATERIALIZE", "true", "0.1.0"))
                .run(context -> {
                    assertNotNull(context.getStartupFailure());
                    assertTrue(hasCode(context.getStartupFailure(), "GFM_WEB_MODE_FORBIDDEN"));
                });
    }

    @Test
    void rejectsReleaseGuardsFromNonCommandLinePropertySources() {
        new ApplicationContextRunner()
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("release-golden-authoring"))
                .withPropertyValues("spring.main.web-application-type=none", "opm.runtime.mode=RELEASE_GOLDEN_FIXTURE_MATERIALIZE",
                        "opm.release-authoring.materializer.enabled=true", "opm.release-authoring.contract-version=0.1.0")
                .withUserConfiguration(ReleaseAuthoringConfiguration.class)
                .run(context -> {
                    assertNotNull(context.getStartupFailure());
                    assertTrue(hasCode(context.getStartupFailure(), "GFM_ARGUMENT_INVALID"));
                });
    }

    private ApplicationContextRunner context(Map<String, Object> commandLine) {
        return new ApplicationContextRunner()
                .withInitializer(context -> {
                    context.getEnvironment().setActiveProfiles("release-golden-authoring");
                    if (!commandLine.isEmpty()) {
                        context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("commandLineArgs", commandLine));
                    }
                })
                .withUserConfiguration(ReleaseAuthoringConfiguration.class);
    }

    private Map<String, Object> commandLine(boolean enabled, String web, String mode, String materializerEnabled, String contractVersion) {
        return Map.of("spring.main.web-application-type", web, "opm.runtime.mode", mode,
                "opm.release-authoring.materializer.enabled", materializerEnabled,
                "opm.release-authoring.contract-version", contractVersion);
    }

    private boolean hasCode(Throwable failure, String code) {
        Throwable current = failure;
        while (current != null) {
            if (current instanceof GoldenFixtureMaterializationException materialization && code.equals(materialization.code())) return true;
            current = current.getCause();
        }
        return false;
    }

    @Configuration(proxyBeanMethods = false)
    @Import({GoldenFixtureMaterializerRunner.class, ReleaseGoldenAuthoringStartupGuard.class})
    static class ReleaseAuthoringConfiguration { }
}
