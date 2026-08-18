package org.opm.localruntime.releaseauthoring;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.type.AnnotatedTypeMetadata;

/** 仅在五项 release guard 全部有效时装配实际 Materializer runner。 */
final class ReleaseGoldenAuthoringCondition implements Condition {

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        return context.getEnvironment() instanceof ConfigurableEnvironment environment
                && ReleaseGoldenAuthoringGuard.matches(environment);
    }
}
