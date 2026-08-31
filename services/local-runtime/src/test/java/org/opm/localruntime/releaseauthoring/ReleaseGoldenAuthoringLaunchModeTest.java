package org.opm.localruntime.releaseauthoring;

import org.junit.jupiter.api.Test;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ReleaseGoldenAuthoringLaunchModeTest {

    @Test
    void acceptsTheThreeFiniteModesAndKeepsCommonWebRunning() {
        assertTrue(ReleaseGoldenAuthoringLaunchMode.isFiniteReleaseInvocation(environment(
                "RELEASE_GOLDEN_FIXTURE_MATERIALIZE", "none", Map.of(
                        "opm.release-authoring.materializer.enabled", "true",
                        "opm.release-authoring.contract-version", "0.1.0"))));
        assertTrue(ReleaseGoldenAuthoringLaunchMode.isFiniteReleaseInvocation(environment(
                "RELEASE_GOLDEN_COMMON_BASE", "none", Map.of("opm.release.visual-common-materializer", "true"))));
        assertTrue(ReleaseGoldenAuthoringLaunchMode.isFiniteReleaseInvocation(environment(
                "RELEASE_GOLDEN_COMMON_CLONE", "none", Map.of("opm.release.visual-common.clone", "true"))));
        assertFalse(ReleaseGoldenAuthoringLaunchMode.isFiniteReleaseInvocation(environment(
                "RELEASE_GOLDEN_COMMON_WEB", "servlet", Map.of("opm.release.visual-common.web-runtime", "true"))));
    }

    @Test
    void rejectsWebTypeMismatchAndMultipleCommonModesBeforeAnyRunnerCanStart() {
        GoldenFixtureMaterializationException typeMismatch = assertThrows(GoldenFixtureMaterializationException.class,
                () -> ReleaseGoldenAuthoringLaunchMode.require(environment(
                        "RELEASE_GOLDEN_COMMON_WEB", "none", Map.of("opm.release.visual-common.web-runtime", "true"))));
        assertEquals("GOLDEN_COMMON_MODE_REJECTED", typeMismatch.code());

        GoldenFixtureMaterializationException multipleModes = assertThrows(GoldenFixtureMaterializationException.class,
                () -> ReleaseGoldenAuthoringLaunchMode.require(environment(
                        "RELEASE_GOLDEN_COMMON_BASE", "none", Map.of(
                                "opm.release.visual-common-materializer", "true",
                                "opm.release.visual-common.clone", "true"))));
        assertEquals("GOLDEN_COMMON_MODE_REJECTED", multipleModes.code());
    }

    private StandardEnvironment environment(String mode, String webApplicationType, Map<String, String> additions) {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("opm.runtime.mode", mode);
        properties.put("spring.main.web-application-type", webApplicationType);
        if (!"RELEASE_GOLDEN_FIXTURE_MATERIALIZE".equals(mode)) {
            properties.put("opm.release.golden-authoring", "true");
        }
        properties.putAll(additions);
        StandardEnvironment environment = new StandardEnvironment();
        environment.setActiveProfiles("release-golden-authoring");
        environment.getPropertySources().addFirst(new MapPropertySource("commandLineArgs", properties));
        return environment;
    }
}
