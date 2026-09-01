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
        String[] source = fullWebRuntimeFaultArguments();
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
                "--opm.runtime.mode=RELEASE_GOLDEN_COMMON_WEB",
                "--opm.release.visual-common.web-runtime=true",
                "--opm.release.visual-common.fault-hook=sqlite.revision-commit.before-insert",
                "--opm.release.visual-common.fault-command-id=command.visual.blocked-feedback.persistence-failed",
                "--opm.release.visual-common.fault-max-invocations=1"
        };
    }

    private String[] fullWebRuntimeFaultArguments() {
        String[] required = requiredArguments();
        String[] source = java.util.Arrays.copyOf(required, required.length + 7);
        source[required.length] = "--opm.release.visual-common.request-id=dev-canvas-06.common-visual-adapter.test";
        source[required.length + 1] = "--opm.release.visual-common.capture-id=capture.blocked-feedback";
        source[required.length + 2] = "--opm.release.visual-common.subject-id=BLOCKED_FEEDBACK";
        source[required.length + 3] = "--opm.release.visual-common.attempt-ordinal=1";
        source[required.length + 4] = "--opm.release.visual-common.launch-nonce=" + "a".repeat(64);
        source[required.length + 5] = "--opm.release.visual-common.clone-result=/tmp/clone-result.json";
        source[required.length + 6] = "--opm.release.visual-common.runtime-ready-out=/tmp/runtime-ready.json";
        return source;
    }

    private void assertRejected(org.junit.jupiter.api.function.Executable executable) {
        assertEquals("GOLDEN_COMMON_MODE_REJECTED", assertThrows(GoldenFixtureMaterializationException.class, executable).code());
    }
}
