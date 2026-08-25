package org.opm.localruntime.releaseevidence;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class E2EFixtureMaterializerJarIT {

    private static final ObjectMapper JSON = new ObjectMapper();

    @TempDir
    Path temporaryDirectory;

    @Test
    void materializesFamilyFixtureOnlyThroughTheExactAttemptLocalSpringBootJar() throws Exception {
        Path builtJar = Path.of("target", "local-runtime-0.1.0-SNAPSHOT.jar").toAbsolutePath().normalize();
        assertTrue(Files.isRegularFile(builtJar), "集成测试必须在 Spring Boot JAR 打包完成后执行。");
        E2EFixtureMaterializerCliTest.Fixture fixture = E2EFixtureMaterializerCliTest.Fixture.createMaterializable(temporaryDirectory.toRealPath());
        Path runtimeJar = fixture.attemptRoot().resolve("inputs/build/local-runtime.jar");
        Files.createDirectories(runtimeJar.getParent());
        Files.copy(builtJar, runtimeJar, StandardCopyOption.REPLACE_EXISTING);
        updateManifestRuntimeJarRef(fixture.manifest(), runtimeJar);

        List<String> command = new ArrayList<>(List.of(javaExecutable().toString(),
                "-Dloader.main=org.opm.localruntime.releaseevidence.E2EFixtureMaterializerCli",
                "-cp", runtimeJar.toString(), "org.springframework.boot.loader.launch.PropertiesLauncher"));
        for (String value : fixture.arguments()) command.add(value);
        Process process = new ProcessBuilder(command).directory(fixture.attemptRoot().toFile()).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);

        assertEquals(0, process.waitFor(), output);
        JsonNode artifact = JSON.readTree(Files.readAllBytes(fixture.out()));
        JsonNode identity = artifact.required("materializer_identity");
        String runtimeSha = sha256(Files.readAllBytes(runtimeJar));
        assertEquals(runtimeSha, identity.required("source_sha256").asText());
        assertEquals(runtimeSha, identity.required("runtime_jar_ref").required("sha256").asText());
        assertTrue(Files.isRegularFile(fixture.attemptRoot().resolve(artifact.required("storage").required("project_db_ref").required("path").asText())));
    }

    @Test
    void materializesCommonFixtureOnlyThroughTheExactAttemptLocalSpringBootJar() throws Exception {
        Path builtJar = Path.of("target", "local-runtime-0.1.0-SNAPSHOT.jar").toAbsolutePath().normalize();
        assertTrue(Files.isRegularFile(builtJar), "集成测试必须在 Spring Boot JAR 打包完成后执行。");
        E2EFixtureMaterializerCliTest.Fixture fixture = E2EFixtureMaterializerCliTest.Fixture.createCommonMaterializable(temporaryDirectory.toRealPath());
        Path runtimeJar = fixture.attemptRoot().resolve("inputs/build/local-runtime.jar");
        Files.createDirectories(runtimeJar.getParent());
        Files.copy(builtJar, runtimeJar, StandardCopyOption.REPLACE_EXISTING);
        updateManifestRuntimeJarRef(fixture.manifest(), runtimeJar);

        JsonNode artifact = runMaterializer(fixture, runtimeJar, fixture.commonArguments());

        String caseId = "E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN";
        String seed = sha256(caseId.getBytes(StandardCharsets.UTF_8)).substring(0, 16);
        assertEquals("COMMON", artifact.required("fixture_kind").asText());
        assertEquals("project.e2e." + seed, artifact.required("identity").required("project_id").asText());
        assertEquals("model.e2e." + seed, artifact.required("identity").required("model_id").asText());
        assertEquals("context.e2e." + seed, artifact.required("identity").required("context_id").asText());
        assertEquals("revision.e2e.common", artifact.required("identity").required("base_revision").asText());
        assertTrue(Files.isRegularFile(fixture.attemptRoot().resolve(artifact.required("storage").required("project_db_ref").required("path").asText())));
    }

    private static JsonNode runMaterializer(E2EFixtureMaterializerCliTest.Fixture fixture, Path runtimeJar, String[] arguments) throws Exception {
        List<String> command = new ArrayList<>(List.of(javaExecutable().toString(),
                "-Dloader.main=org.opm.localruntime.releaseevidence.E2EFixtureMaterializerCli",
                "-cp", runtimeJar.toString(), "org.springframework.boot.loader.launch.PropertiesLauncher"));
        for (String value : arguments) command.add(value);
        Process process = new ProcessBuilder(command).directory(fixture.attemptRoot().toFile()).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertEquals(0, process.waitFor(), output);
        return JSON.readTree(Files.readAllBytes(fixture.out()));
    }

    private static void updateManifestRuntimeJarRef(Path manifestPath, Path runtimeJar) throws Exception {
        ObjectNode manifest = (ObjectNode) JSON.readTree(Files.readAllBytes(manifestPath));
        ObjectNode sourceBuild = manifest.putObject("source_build");
        ObjectNode ref = sourceBuild.putObject("local_runtime_jar");
        ref.put("kind", "LOCAL_RUNTIME_JAR");
        ref.put("path", "inputs/build/local-runtime.jar");
        ref.put("byte_length", Files.size(runtimeJar));
        ref.put("sha256", sha256(Files.readAllBytes(runtimeJar)));
        Files.writeString(manifestPath, JSON.writeValueAsString(manifest), StandardCharsets.UTF_8);
    }

    private static Path javaExecutable() {
        return Path.of(System.getProperty("java.home"), "bin", "java");
    }

    private static String sha256(byte[] bytes) throws Exception {
        return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }
}
