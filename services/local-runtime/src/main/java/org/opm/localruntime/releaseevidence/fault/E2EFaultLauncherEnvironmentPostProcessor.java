package org.opm.localruntime.releaseevidence.fault;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.config.ConfigDataEnvironmentPostProcessor;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertySource;

import java.util.LinkedHashMap;
import java.util.Map;

/** Config Data 后验证 fault tuple 的唯一 Spring guard。 */
public final class E2EFaultLauncherEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {
    static final String VERIFIED_SOURCE = "opmE2EFaultVerifiedState";
    static final String VERIFIED_KEY = "opm.internal.release.e2e.verified-plan";

    @Override public int getOrder() { return ConfigDataEnvironmentPostProcessor.ORDER + 1; }

    @Override public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        try {
            MutablePropertySources sources = environment.getPropertySources();
            boolean configured = hasFaultConfiguration(sources);
            if (!configured) return;
            PropertySource<?> commandLine = sources.get("commandLineArgs");
            if (commandLine == null || sources.contains(VERIFIED_SOURCE)) {
                throw E2EFaultLauncherArguments.invalid("ARGS_SOURCE", null, null, "Fault configuration has no unique commandLineArgs source");
            }
            Map<String, String> values = new LinkedHashMap<>();
            for (String key : E2EFaultLauncherArguments.FAULT_KEYS) values.put(key, onlyCommandLine(sources, commandLine, key));
            values.put(E2EFaultLauncherArguments.PROFILE, onlyCommandLine(sources, commandLine, E2EFaultLauncherArguments.PROFILE));
            Object storageRoot = commandLine.getProperty("opm.storage.root");
            if (!(storageRoot instanceof String storage) || storage.isBlank()) {
                throw E2EFaultLauncherArguments.invalid("ARGS_SOURCE", values.get(E2EFaultLauncherArguments.CASE_ID), null, "Fault child requires commandLineArgs storage root");
            }
            values.put("opm.storage.root", storage);
            if (!"release-e2e-fault".equals(values.get(E2EFaultLauncherArguments.PROFILE))) {
                throw E2EFaultLauncherArguments.invalid("MODE_AND_PROFILE", values.get(E2EFaultLauncherArguments.CASE_ID), null, "Fault profile is invalid");
            }
            E2EFaultPlanVerifier.VerifiedPlan plan = E2EFaultPlanVerifier.verify(new E2EFaultLauncherArguments(values));
            sources.addLast(new MapPropertySource(VERIFIED_SOURCE, Map.of(VERIFIED_KEY, plan)));
        } catch (E2EFaultLauncherException exception) {
            exception.reportOnce();
            throw exception;
        }
    }

    private static boolean hasFaultConfiguration(MutablePropertySources sources) {
        for (PropertySource<?> source : sources) {
            if (source.containsProperty(E2EFaultLauncherArguments.PROFILE)
                    && String.valueOf(source.getProperty(E2EFaultLauncherArguments.PROFILE)).contains("release-e2e-fault")) return true;
            for (String key : E2EFaultLauncherArguments.FAULT_KEYS) if (source.containsProperty(key)) return true;
        }
        return false;
    }

    private static String onlyCommandLine(MutablePropertySources sources, PropertySource<?> commandLine, String key) {
        String value = null;
        for (PropertySource<?> source : sources) {
            // Spring 的 configurationProperties 是对全部 Environment 的聚合视图，不是配置来源。
            if ("configurationProperties".equals(source.getName())) continue;
            if (!source.containsProperty(key)) continue;
            if (source != commandLine) throw E2EFaultLauncherArguments.invalid("ARGS_SOURCE", null, null, "Fault property drifted from commandLineArgs");
            Object candidate = source.getProperty(key);
            if (!(candidate instanceof String text) || text.isBlank()) throw E2EFaultLauncherArguments.invalid("ARGS_SOURCE", null, null, "Fault property is blank");
            value = text;
        }
        if (value == null) throw E2EFaultLauncherArguments.invalid("ARGS_SOURCE", null, null, "Fault property is missing");
        return value;
    }
}
