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
            new Option("opm.release.visual-common.fault-hook", "sqlite.revision-commit.before-insert"),
            new Option("opm.release.visual-common.fault-command-id", "command.visual.blocked-feedback.persistence-failed"),
            new Option("opm.release.visual-common.fault-max-invocations", "1"));

    private static final List<String> FAULT_KEYS = REQUIRED.stream()
            .map(Option::key)
            .filter(key -> key.startsWith("opm.release.visual-common.fault-"))
            .toList();

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
        for (String argument : arguments.getSourceArgs()) {
            if (argument.startsWith("--opm.release.visual-common.") && !FAULT_KEYS.stream().anyMatch(key -> argument.startsWith("--" + key + "="))) {
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

    private boolean containsVisualCommonFaultArgument(String[] sourceArgs) {
        return java.util.Arrays.stream(sourceArgs).anyMatch(argument -> argument.startsWith("--opm.release.visual-common.fault-"));
    }

    private GoldenFixtureMaterializationException rejected() {
        return new GoldenFixtureMaterializationException("GOLDEN_COMMON_MODE_REJECTED", "Visual Common fault hook configuration is invalid.");
    }

    private record Option(String key, String value) {
    }
}
