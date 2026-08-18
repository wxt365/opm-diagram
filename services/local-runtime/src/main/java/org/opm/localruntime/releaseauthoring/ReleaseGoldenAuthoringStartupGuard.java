package org.opm.localruntime.releaseauthoring;

import org.springframework.context.annotation.Profile;
import org.springframework.context.annotation.Conditional;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.stereotype.Component;

/** profile 被启用时在 context 创建阶段拒绝缺失或冲突的 release guard。 */
@Component
@Profile("release-golden-authoring")
@Conditional(ReleaseGoldenAuthoringProfileCondition.class)
final class ReleaseGoldenAuthoringStartupGuard {

    ReleaseGoldenAuthoringStartupGuard(ConfigurableEnvironment environment) {
        ReleaseGoldenAuthoringGuard.require(environment);
    }
}
