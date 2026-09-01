package org.opm.localruntime.releaseauthoring.visualcommon;

import org.opm.localruntime.releaseauthoring.GoldenFixtureMaterializationException;
import org.opm.localruntime.releaseevidence.fault.E2EFaultPort;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertySource;

import java.util.List;

/** 只接受完整 command-line 受控参数，其他启动一律装配 NOOP。 */
@Configuration(proxyBeanMethods = false)
public class VisualCommonCommitFaultConfiguration {

    private static final List<Option> REQUIRED = List.of(
            new Option("spring.profiles.active", "release-golden-authoring"),
            new Option("opm.release.golden-authoring", "true"),
            new Option("spring.main.web-application-type", "servlet"),
            new Option("opm.runtime.mode", "RELEASE_GOLDEN_COMMON_WEB"),
            new Option("opm.release.visual-common.web-runtime", "true"),
            new Option("opm.release.visual-common.fault-hook", "sqlite.revision-commit.before-insert"),
            new Option("opm.release.visual-common.fault-command-id", "command.visual.blocked-feedback.persistence-failed"),
            new Option("opm.release.visual-common.fault-max-invocations", "1"));

    private static final List<String> FAULT_KEYS = REQUIRED.stream()
            .map(Option::key)
            .filter(key -> key.startsWith("opm.release.visual-common.fault-"))
            .toList();
    private static final List<String> WEB_IDENTITY_KEYS = List.of(
            "opm.release.visual-common.request-id", "opm.release.visual-common.capture-id",
            "opm.release.visual-common.subject-id", "opm.release.visual-common.attempt-ordinal",
            "opm.release.visual-common.launch-nonce", "opm.release.visual-common.clone-result",
            "opm.release.visual-common.runtime-ready-out");
    private static final List<String> ALLOWED_VISUAL_COMMON_KEYS = java.util.stream.Stream.concat(
            java.util.stream.Stream.of("opm.release.visual-common.web-runtime"),
            java.util.stream.Stream.concat(FAULT_KEYS.stream(), WEB_IDENTITY_KEYS.stream())).toList();

    @Bean
    @ConditionalOnMissingBean(VisualCommonCommitFaultPort.class)
    VisualCommonCommitFaultPort visualCommonCommitFaultPort(
            ConfigurableEnvironment environment,
            ApplicationArguments arguments,
            E2EFaultPort e2eFaultPort) {
        PropertySource<?> commandLine = environment.getPropertySources().get("commandLineArgs");
        boolean configured = FAULT_KEYS.stream().anyMatch(key -> environment.getProperty(key) != null)
                || containsVisualCommonFaultArgument(arguments.getSourceArgs());
        if (!configured) return VisualCommonCommitFaultPort.NOOP;
        if (commandLine == null || e2eFaultPort != E2EFaultPort.NOOP
                || environment.getProperty("opm.release.visual-common-materializer") != null
                || !List.of(environment.getActiveProfiles()).equals(List.of("release-golden-authoring"))) {
            throw rejected();
        }
        for (Option option : REQUIRED) requireExact(commandLine, arguments.getSourceArgs(), option);
        for (String key : WEB_IDENTITY_KEYS) requirePresentExactly(commandLine, arguments.getSourceArgs(), key);
        for (String argument : arguments.getSourceArgs()) {
            if (argument.startsWith("--opm.release.visual-common.") && !ALLOWED_VISUAL_COMMON_KEYS.contains(optionKey(argument))) {
                throw rejected();
            }
        }
        return new OneShotVisualCommonCommitFaultPort();
    }

    private void requireExact(PropertySource<?> commandLine, String[] sourceArgs, Option option) {
        Object value = commandLine.getProperty(option.key());
        long count = java.util.Arrays.stream(sourceArgs)
                .filter(argument -> argument.startsWith("--" + option.key() + "="))
                .count();
        if (count != 1 || value == null || !option.value().equals(value.toString())
                || !java.util.Arrays.asList(sourceArgs).contains("--" + option.key() + "=" + option.value())) {
            throw rejected();
        }
    }

    private void requirePresentExactly(PropertySource<?> commandLine, String[] sourceArgs, String key) {
        Object value = commandLine.getProperty(key);
        long count = java.util.Arrays.stream(sourceArgs).filter(argument -> argument.startsWith("--" + key + "=")).count();
        if (count != 1 || value == null || value.toString().isBlank()
                || !java.util.Arrays.asList(sourceArgs).contains("--" + key + "=" + value)) {
            throw rejected();
        }
    }

    private String optionKey(String argument) {
        int separator = argument.indexOf('=');
        if (separator <= 2) throw rejected();
        return argument.substring(2, separator);
    }

    private boolean containsVisualCommonFaultArgument(String[] sourceArgs) {
        return java.util.Arrays.stream(sourceArgs).anyMatch(argument -> argument.startsWith("--opm.release.visual-common.fault-"));
    }

    private GoldenFixtureMaterializationException rejected() {
        return new GoldenFixtureMaterializationException("GOLDEN_COMMON_MODE_REJECTED", "Visual Common fault hook configuration is invalid.");
    }

    private record Option(String key, String value) {
    }
}
