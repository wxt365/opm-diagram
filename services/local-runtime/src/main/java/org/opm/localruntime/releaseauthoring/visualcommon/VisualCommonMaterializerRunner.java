package org.opm.localruntime.releaseauthoring.visualcommon;

import org.opm.localruntime.releaseauthoring.GoldenFixtureMaterializationException;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ExitCodeGenerator;
import org.springframework.context.annotation.Profile;
import org.springframework.context.annotation.Conditional;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertySource;
import org.springframework.stereotype.Component;

import java.nio.file.Path;

/** Common Visual base 的 release-only、non-web Runtime 入口。 */
@Component
@Profile("release-golden-authoring")
@Conditional(VisualCommonMaterializerRunner.BaseModeCondition.class)
public final class VisualCommonMaterializerRunner implements ApplicationRunner, ExitCodeGenerator {

    private final ConfigurableEnvironment environment;
    private volatile int exitCode;

    public VisualCommonMaterializerRunner(ConfigurableEnvironment environment) {
        this.environment = environment;
    }

    @Override
    public void run(ApplicationArguments ignored) {
        PropertySource<?> source = environment.getPropertySources().get("commandLineArgs");
        try {
            require(source, "spring.profiles.active", "release-golden-authoring");
            require(source, "opm.runtime.mode", "RELEASE_GOLDEN_COMMON_BASE");
            require(source, "opm.release.golden-authoring", "true");
            require(source, "opm.release.visual-common-materializer", "true");
            require(source, "spring.main.web-application-type", "none");
            Path fixture = path(source, "opm.release.visual-common.fixture");
            Path storage = path(source, "opm.release.visual-common.storage-root");
            Path attestation = path(source, "opm.release.visual-common.attestation-out");
            long epoch = epoch(source, "opm.release.source-date-epoch");
            new VisualCommonFixtureMaterializer().materialize(fixture, storage, attestation, epoch);
            exitCode = 0;
        } catch (GoldenFixtureMaterializationException exception) {
            exitCode = GoldenFixtureMaterializationException.exitCodeFor(exception.code());
            System.err.println(exception.code());
        } catch (Exception exception) {
            exitCode = 4;
            System.err.println("GOLDEN_COMMON_INTERNAL_ERROR");
        }
    }

    @Override
    public int getExitCode() {
        return exitCode;
    }

    private void require(PropertySource<?> source, String key, String expected) {
        Object value = source.getProperty(key);
        if (value == null || !expected.equals(value.toString())) {
            throw new GoldenFixtureMaterializationException("GOLDEN_COMMON_MODE_REJECTED", "Common Visual materializer mode is incomplete.");
        }
    }

    private Path path(PropertySource<?> source, String key) {
        Object value = source.getProperty(key);
        if (value == null || value.toString().isBlank()) throw new GoldenFixtureMaterializationException("GOLDEN_COMMON_INPUT_INVALID", "Missing " + key + ".");
        Path path = Path.of(value.toString());
        if (!path.isAbsolute() || path.normalize().equals(path.getRoot())) throw new GoldenFixtureMaterializationException("GOLDEN_COMMON_INPUT_INVALID", "Invalid absolute path: " + key);
        return path.normalize();
    }

    private long epoch(PropertySource<?> source, String key) {
        try {
            long value = Long.parseLong(String.valueOf(source.getProperty(key)));
            if (value < 0) throw new NumberFormatException();
            return value;
        } catch (Exception exception) {
            throw new GoldenFixtureMaterializationException("GOLDEN_COMMON_INPUT_INVALID", "Invalid source date epoch.", exception);
        }
    }

    public static final class BaseModeCondition implements org.springframework.context.annotation.Condition {
        @Override
        public boolean matches(org.springframework.context.annotation.ConditionContext context,
                               org.springframework.core.type.AnnotatedTypeMetadata metadata) {
            if (!(context.getEnvironment() instanceof ConfigurableEnvironment environment)) return false;
            try {
                return org.opm.localruntime.releaseauthoring.ReleaseGoldenAuthoringLaunchMode.require(environment)
                        == org.opm.localruntime.releaseauthoring.ReleaseGoldenAuthoringLaunchMode.RELEASE_GOLDEN_COMMON_BASE;
            } catch (GoldenFixtureMaterializationException exception) {
                return false;
            }
        }
    }
}
