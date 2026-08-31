package org.opm.localruntime.releaseauthoring.visualcommon;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class VisualCommonRuntimeReadyWriterTest {

    private static final long EPOCH = 1782864000L;
    private static final ObjectMapper JSON = new ObjectMapper();

    @TempDir
    Path temporaryDirectory;

    @Test
    void publishesReadyOnlyAfterBothDynamicPortsAndApplicationReady() throws Exception {
        Path base = temporaryDirectory.resolve("base/storage");
        Path attestation = temporaryDirectory.resolve("base/attestation.json");
        new VisualCommonFixtureMaterializer().materialize(fixture("STATE_ROLES"), base, attestation, EPOCH);
        Path storage = temporaryDirectory.resolve("attempt/storage");
        Path cloneResult = temporaryDirectory.resolve("attempt/clone.json");
        Files.createDirectories(cloneResult.getParent());
        clone(base, attestation, storage, cloneResult);
        Path assets = assets();
        Path ready = temporaryDirectory.resolve("attempt/runtime-ready.json");
        Path jar = temporaryDirectory.resolve("runtime.jar");
        Files.writeString(jar, "controlled-runtime");

        VisualCommonRuntimeReadyWriter writer = writer(storage, assets, cloneResult, ready, jar);
        writer.recordApplicationPort(18111);
        writer.markApplicationReady();
        assertTrue(Files.notExists(ready));
        writer.recordManagementPort(18112);
        writer.markApplicationReady();

        JsonNode result = JSON.readTree(Files.readAllBytes(ready));
        assertEquals("READY", result.required("status").asText());
        assertEquals(18111, result.required("server_port").intValue());
        assertEquals(18112, result.required("management_server_port").intValue());
        assertEquals("127.0.0.1", result.required("server_address").asText());
        assertEquals(5, result.required("profile_asset_refs").size());
    }

    @Test
    void resolvesOuterJarFromSpringBootNestedCodeSource() {
        assertEquals(Path.of("/private/tmp/runtime.jar"), VisualCommonRuntimeReadyWriter.runtimeJarFromCodeSourceLocation(
                "jar:nested:/private/tmp/runtime.jar/!BOOT-INF/classes/!/org/opm/localruntime/LocalRuntimeApplication.class"));
    }

    private void clone(Path base, Path attestation, Path storage, Path result) {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("spring.profiles.active", "release-golden-authoring");
        properties.put("spring.main.web-application-type", "none");
        properties.put("opm.runtime.mode", "RELEASE_GOLDEN_COMMON_CLONE");
        properties.put("opm.release.golden-authoring", "true");
        properties.put("opm.release.visual-common.clone", "true");
        properties.put("opm.release.visual-common.request-id", "dev-canvas-06.common-visual-adapter.ready-test");
        properties.put("opm.release.visual-common.capture-id", "capture.state-roles");
        properties.put("opm.release.visual-common.subject-id", "STATE_ROLES");
        properties.put("opm.release.visual-common.attempt-ordinal", "1");
        properties.put("opm.release.visual-common.base-root", base.toString());
        properties.put("opm.release.visual-common.base-attestation", attestation.toString());
        properties.put("opm.release.visual-common.attempt-storage-root", storage.toString());
        properties.put("opm.release.visual-common.clone-result-out", result.toString());
        properties.put("opm.release.source-date-epoch", String.valueOf(EPOCH));
        StandardEnvironment environment = environment(properties);
        String[] args = arguments(properties);
        VisualCommonCloneRunner runner = new VisualCommonCloneRunner(environment, new DefaultApplicationArguments(args));
        runner.run(null);
        assertEquals(0, runner.getExitCode());
    }

    private VisualCommonRuntimeReadyWriter writer(Path storage, Path assets, Path cloneResult, Path ready, Path jar) {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("spring.profiles.active", "release-golden-authoring");
        properties.put("spring.main.web-application-type", "servlet");
        properties.put("opm.runtime.mode", "RELEASE_GOLDEN_COMMON_WEB");
        properties.put("opm.release.golden-authoring", "true");
        properties.put("opm.release.visual-common.web-runtime", "true");
        properties.put("server.address", "127.0.0.1");
        properties.put("server.port", "0");
        properties.put("management.server.address", "127.0.0.1");
        properties.put("management.server.port", "0");
        properties.put("management.endpoints.web.exposure.include", "health");
        properties.put("management.endpoint.health.probes.enabled", "true");
        properties.put("opm.storage.root", storage.toString());
        properties.put("opm.assets.root", assets.toString());
        properties.put("opm.release.visual-common.request-id", "dev-canvas-06.common-visual-adapter.ready-test");
        properties.put("opm.release.visual-common.capture-id", "capture.state-roles");
        properties.put("opm.release.visual-common.subject-id", "STATE_ROLES");
        properties.put("opm.release.visual-common.attempt-ordinal", "1");
        properties.put("opm.release.visual-common.launch-nonce", "a".repeat(64));
        properties.put("opm.release.visual-common.clone-result", cloneResult.toString());
        properties.put("opm.release.visual-common.runtime-ready-out", ready.toString());
        return new VisualCommonRuntimeReadyWriter(environment(properties), new DefaultApplicationArguments(arguments(properties)), () -> jar);
    }

    private Path assets() throws Exception {
        Path root = temporaryDirectory.resolve("profile-assets");
        for (String relative : new String[] {"grammar/representative-opl-grammar.json", "normalization/representative-normalization.json",
                "profile.json", "rules/representative-rule-set.json", "symbols/representative-symbol-catalog.json"}) {
            Path file = root.resolve(relative);
            Files.createDirectories(file.getParent());
            Files.writeString(file, "{}\n");
        }
        return root;
    }

    private StandardEnvironment environment(Map<String, Object> properties) {
        StandardEnvironment environment = new StandardEnvironment();
        environment.setActiveProfiles("release-golden-authoring");
        environment.getPropertySources().addFirst(new MapPropertySource("commandLineArgs", properties));
        return environment;
    }

    private String[] arguments(Map<String, Object> properties) {
        return properties.entrySet().stream().map(entry -> "--" + entry.getKey() + "=" + entry.getValue()).toArray(String[]::new);
    }

    private Path fixture(String subject) {
        return Path.of("..", "..", "packages", "profiles", "profile.iso19450.2024.draft", "0.2.0", "handoff", "releases", "clean-37c5412a9c12", "dev-canvas-06", "common-fixtures", "0.2.0", "visual", subject + ".json");
    }
}
