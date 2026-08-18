package org.opm.localruntime.releaseauthoring;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;

/** 仅在 dedicated release profile 激活时创建启动 guard。 */
final class ReleaseGoldenAuthoringProfileCondition implements Condition {

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        return context.getEnvironment().matchesProfiles("release-golden-authoring");
    }
}
