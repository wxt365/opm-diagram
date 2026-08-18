package org.opm.localruntime.releaseauthoring;

import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertySource;

/** release-golden-authoring 的五项启动 guard，所有值必须来自 commandLineArgs。 */
final class ReleaseGoldenAuthoringGuard {

    private ReleaseGoldenAuthoringGuard() {
    }

    static boolean matches(ConfigurableEnvironment environment) {
        try {
            require(environment);
            return true;
        } catch (GoldenFixtureMaterializationException exception) {
            return false;
        }
    }

    static void require(ConfigurableEnvironment environment) {
        String[] profiles = environment.getActiveProfiles();
        if (profiles.length != 1 || !"release-golden-authoring".equals(profiles[0])) {
            throw failure("GFM_PROFILE_INVALID", "Only release-golden-authoring profile is permitted.");
        }
        PropertySource<?> source = environment.getPropertySources().get("commandLineArgs");
        if (source == null) throw failure("GFM_ARGUMENT_INVALID", "Required authoring options must originate from command line.");
        if (!"none".equals(value(source, "spring.main.web-application-type"))) {
            throw failure("GFM_WEB_MODE_FORBIDDEN", "Authoring Materializer must be non-web.");
        }
        if (!"RELEASE_GOLDEN_FIXTURE_MATERIALIZE".equals(value(source, "opm.runtime.mode"))
                || !"true".equals(value(source, "opm.release-authoring.materializer.enabled"))) {
            throw failure("GFM_MODE_DISABLED", "Authoring mode guard is incomplete.");
        }
        if (!"0.1.0".equals(value(source, "opm.release-authoring.contract-version"))) {
            throw failure("GFM_CONTRACT_VERSION_UNSUPPORTED", "Materializer contract version is unsupported.");
        }
    }

    private static String value(PropertySource<?> source, String key) {
        Object value = source.getProperty(key);
        return value == null ? null : value.toString();
    }

    private static GoldenFixtureMaterializationException failure(String code, String message) {
        return new GoldenFixtureMaterializationException(code, message);
    }
}
