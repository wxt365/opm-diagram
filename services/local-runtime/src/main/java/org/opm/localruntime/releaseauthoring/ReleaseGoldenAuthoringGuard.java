package org.opm.localruntime.releaseauthoring;

import org.springframework.core.env.ConfigurableEnvironment;
/** release-golden-authoring 的启动 guard，所有值必须来自 commandLineArgs。 */
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
        ReleaseGoldenAuthoringLaunchMode.require(environment);
    }
}
