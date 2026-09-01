package org.opm.localruntime.releaseauthoring;

import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertySource;

import java.util.List;

/** release-golden-authoring 隔离域内唯一决定启动形态和生命周期的模式。 */
public enum ReleaseGoldenAuthoringLaunchMode {
    RELEASE_GOLDEN_FIXTURE_MATERIALIZE("none", true, null),
    RELEASE_GOLDEN_COMMON_BASE("none", true, "opm.release.visual-common-materializer"),
    RELEASE_GOLDEN_COMMON_CLONE("none", true, "opm.release.visual-common.clone"),
    RELEASE_GOLDEN_COMMON_WEB("servlet", false, "opm.release.visual-common.web-runtime"),
    RELEASE_GOLDEN_FAMILY_CLONE("none", true, "opm.release.golden-family.clone"),
    RELEASE_GOLDEN_FAMILY_WEB("servlet", false, "opm.release.golden-family.web-runtime");

    private static final String RELEASE_PROFILE = "release-golden-authoring";

    private final String webApplicationType;
    private final boolean finite;
    private final String releaseSwitch;

    ReleaseGoldenAuthoringLaunchMode(String webApplicationType, boolean finite, String releaseSwitch) {
        this.webApplicationType = webApplicationType;
        this.finite = finite;
        this.releaseSwitch = releaseSwitch;
    }

    public boolean finite() {
        return finite;
    }

    public boolean guarded() {
        return releaseSwitch != null;
    }

    public static ReleaseGoldenAuthoringLaunchMode require(ConfigurableEnvironment environment) {
        if (!List.of(environment.getActiveProfiles()).equals(List.of(RELEASE_PROFILE))) {
            throw new GoldenFixtureMaterializationException("GFM_PROFILE_INVALID", "Only release-golden-authoring profile is permitted.");
        }
        PropertySource<?> source = environment.getPropertySources().get("commandLineArgs");
        if (source == null) throw new GoldenFixtureMaterializationException("GFM_ARGUMENT_INVALID", "Required authoring options must originate from command line.");
        String rawMode = value(source, "opm.runtime.mode");
        ReleaseGoldenAuthoringLaunchMode mode;
        try {
            mode = ReleaseGoldenAuthoringLaunchMode.valueOf(rawMode);
        } catch (Exception exception) {
            throw new GoldenFixtureMaterializationException("GOLDEN_COMMON_MODE_REJECTED", "Release launch mode is missing or unsupported.");
        }
        if (mode == RELEASE_GOLDEN_FIXTURE_MATERIALIZE) {
            if (!"none".equals(value(source, "spring.main.web-application-type"))) {
                throw new GoldenFixtureMaterializationException("GFM_WEB_MODE_FORBIDDEN", "Authoring Materializer must be non-web.");
            }
            if (!"true".equals(value(source, "opm.release-authoring.materializer.enabled"))) {
                throw new GoldenFixtureMaterializationException("GFM_MODE_DISABLED", "Authoring materializer mode is incomplete.");
            }
            if (!"0.1.0".equals(value(source, "opm.release-authoring.contract-version"))) {
                throw new GoldenFixtureMaterializationException("GFM_CONTRACT_VERSION_UNSUPPORTED", "Materializer contract version is unsupported.");
            }
            return mode;
        }
        if (!"true".equals(value(source, "opm.release.golden-authoring"))
                || !mode.webApplicationType.equals(value(source, "spring.main.web-application-type"))) {
            throw rejected(mode, "Release launch mode and web application type do not match.");
        }
        for (ReleaseGoldenAuthoringLaunchMode candidate : values()) {
            if (!candidate.guarded()) continue;
            boolean present = value(source, candidate.releaseSwitch) != null;
            if (candidate == mode) {
                if (!"true".equals(value(source, candidate.releaseSwitch))) {
                    throw rejected(mode, "Required release launch switch is missing.");
                }
            } else if (present) {
                throw rejected(mode, "More than one release launch switch is present.");
            }
        }
        return mode;
    }

    public static boolean isFiniteReleaseInvocation(ConfigurableEnvironment environment) {
        return List.of(environment.getActiveProfiles()).equals(List.of(RELEASE_PROFILE)) && require(environment).finite;
    }

    private static String value(PropertySource<?> source, String key) {
        Object value = source.getProperty(key);
        return value == null ? null : value.toString();
    }

    private static GoldenFixtureMaterializationException rejected(ReleaseGoldenAuthoringLaunchMode mode, String message) {
        String code = mode == RELEASE_GOLDEN_FAMILY_CLONE || mode == RELEASE_GOLDEN_FAMILY_WEB
                ? "GOLDEN_FAMILY_MODE_REJECTED" : "GOLDEN_COMMON_MODE_REJECTED";
        return new GoldenFixtureMaterializationException(code, message);
    }
}
