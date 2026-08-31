package org.opm.localruntime.releaseauthoring.visualcommon;

import org.junit.jupiter.api.Test;
import org.opm.localruntime.releaseauthoring.GoldenFixtureMaterializationException;
import org.opm.localruntime.releaseevidence.fault.E2EFaultPort;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.core.env.MapPropertySource;
import org.springframework.mock.env.MockEnvironment;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

class VisualCommonCommitFaultConfigurationTest {

    private final VisualCommonCommitFaultConfiguration configuration = new VisualCommonCommitFaultConfiguration();

    @Test
    void defaultsToNoopWhenAllFaultArgumentsAreAbsent() {
        assertSame(VisualCommonCommitFaultPort.NOOP, configuration.visualCommonCommitFaultPort(environment(), arguments(), E2EFaultPort.NOOP));
    }

    @Test
    void acceptsOnlyTheCompleteExactCommandLineConfiguration() {
        String[] source = requiredArguments();
        assertInstanceOf(OneShotVisualCommonCommitFaultPort.class,
                configuration.visualCommonCommitFaultPort(environment(source), arguments(source), E2EFaultPort.NOOP));
    }

    @Test
    void rejectsPartialOrNonCommandLineFaultConfiguration() {
        String[] partial = {"--opm.release.visual-common.fault-hook=sqlite.revision-commit.before-insert"};
        assertRejected(() -> configuration.visualCommonCommitFaultPort(environment(partial), arguments(partial), E2EFaultPort.NOOP));

        MockEnvironment nonCommandLine = environment();
        nonCommandLine.setProperty("opm.release.visual-common.fault-hook", "sqlite.revision-commit.before-insert");
        assertRejected(() -> configuration.visualCommonCommitFaultPort(nonCommandLine, arguments(), E2EFaultPort.NOOP));
    }

    private MockEnvironment environment(String... source) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("release-golden-authoring");
        Map<String, Object> values = new LinkedHashMap<>();
        for (String argument : source) {
            int separator = argument.indexOf('=');
            if (separator > 2) values.put(argument.substring(2, separator), argument.substring(separator + 1));
        }
        environment.getPropertySources().addFirst(new MapPropertySource("commandLineArgs", values));
        return environment;
    }

    private DefaultApplicationArguments arguments(String... source) {
        return new DefaultApplicationArguments(source);
    }

    private String[] requiredArguments() {
        return new String[]{
                "--spring.profiles.active=release-golden-authoring",
                "--opm.release.golden-authoring=true",
                "--spring.main.web-application-type=servlet",
                "--opm.release.visual-common.fault-hook=sqlite.revision-commit.before-insert",
                "--opm.release.visual-common.fault-command-id=command.visual.blocked-feedback.persistence-failed",
                "--opm.release.visual-common.fault-max-invocations=1"
        };
    }

    private void assertRejected(org.junit.jupiter.api.function.Executable executable) {
        assertEquals("GOLDEN_COMMON_MODE_REJECTED", assertThrows(GoldenFixtureMaterializationException.class, executable).code());
    }
}
