package org.opm.localruntime.releaseevidence;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.application.LocalApiService;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.storage.ProjectDatabaseFactory;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

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
        assertMaterializedBaseAndWorking(fixture, artifact);
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
        assertMaterializedBaseAndWorking(fixture, artifact);
    }

    @Test
    void snapshotsMaterializedStateOnlyThroughTheExactAttemptLocalSpringBootJar() throws Exception {
        Path builtJar = Path.of("target", "local-runtime-0.1.0-SNAPSHOT.jar").toAbsolutePath().normalize();
        assertTrue(Files.isRegularFile(builtJar), "集成测试必须在 Spring Boot JAR 打包完成后执行。");
        E2EFixtureMaterializerCliTest.Fixture fixture = E2EFixtureMaterializerCliTest.Fixture.createMaterializable(temporaryDirectory.toRealPath());
        Path runtimeJar = fixture.attemptRoot().resolve("inputs/build/local-runtime.jar");
        Files.createDirectories(runtimeJar.getParent());
        Files.copy(builtJar, runtimeJar, StandardCopyOption.REPLACE_EXISTING);
        updateManifestRuntimeJarRef(fixture.manifest(), runtimeJar);
        JsonNode artifact = runMaterializer(fixture, runtimeJar, fixture.arguments());
        JsonNode identity = artifact.required("identity");
        Path baseDatabase = fixture.attemptRoot().resolve(artifact.required("storage").required("project_db_ref").required("path").asText());
        Path workingDatabase = fixture.attemptRoot().resolve(artifact.required("storage").required("working_project_db_path").asText());
        String baseShaBeforeEdit = sha256(Files.readAllBytes(baseDatabase));
        assertEquals(baseShaBeforeEdit, sha256(Files.readAllBytes(workingDatabase)));

        Set<FileProfilePackageLoader.DirectPackageFile> profileFiles = new HashSet<>();
        for (JsonNode ref : artifact.required("profile_asset_refs")) {
            String path = ref.required("path").asText();
            profileFiles.add(new FileProfilePackageLoader.DirectPackageFile(ref.required("kind").asText(),
                    path.substring("profile/assets/".length()), ref.required("byte_length").asLong(), ref.required("sha256").asText()));
        }
        LocalApiService api = new LocalApiService(new ProjectDatabaseFactory(fixture.attemptRoot().resolve("storage")),
                FileProfilePackageLoader.forVerifiedDirectPackageRoot(fixture.attemptRoot().resolve("profile/assets"), profileFiles));
        Map<String, Object> response = api.projection("e2e-snapshot", identity.required("project_id").asText(),
                identity.required("model_id").asText(), identity.required("context_id").asText(), identity.required("head_revision").asText());
        Path projection = fixture.attemptRoot().resolve("api-exchanges/projection.response.json");
        Files.createDirectories(projection.getParent());
        Files.write(projection, JSON.writeValueAsBytes(response));

        List<String> command = new ArrayList<>(List.of(javaExecutable().toString(),
                "-Dloader.main=org.opm.localruntime.releaseevidence.E2EAttemptSnapshotCli",
                "-cp", runtimeJar.toString(), "org.springframework.boot.loader.launch.PropertiesLauncher",
                "--guard", "RELEASE_E2E_SNAPSHOT_ONLY",
                "--storage", fixture.attemptRoot().resolve("storage").toString(),
                "--project-id", identity.required("project_id").asText(),
                "--model-id", identity.required("model_id").asText(),
                "--context-id", identity.required("context_id").asText(),
                "--revision-id", identity.required("head_revision").asText(),
                "--profile-asset-root", fixture.attemptRoot().resolve("profile/assets").toString(),
                "--fixture-materialization", fixture.out().toString(),
                "--projection-response", projection.toString()));
        Process process = new ProcessBuilder(command).directory(fixture.attemptRoot().toFile()).start();
        byte[] stdout = process.getInputStream().readAllBytes();
        byte[] stderr = process.getErrorStream().readAllBytes();

        assertEquals(0, process.waitFor(), new String(stderr, StandardCharsets.UTF_8));
        assertEquals(0, stderr.length);
        assertEquals(artifact.required("state_digests"), JSON.readTree(stdout));
        assertEquals(JSON.writeValueAsString(JSON.readTree(stdout)) + "\n", new String(stdout, StandardCharsets.UTF_8));

        String beforeRevision = identity.required("head_revision").asText();
        Map<String, Object> edit = api.edit(identity.required("project_id").asText(), identity.required("model_id").asText(),
                identity.required("context_id").asText(), Map.of(
                        "request_id", "request.transaction.snapshot.001",
                        "command_id", "command.transaction.snapshot.001",
                        "base_revision", beforeRevision,
                        "binding", Map.of(
                                "profile_id", "profile.iso19450.2024.draft",
                                "profile_version", "0.2.0",
                                "rule_set_id", "rules.iso19450.2024.draft",
                                "rule_version", "0.1.0"),
                        "command_type", "CREATE_ELEMENT",
                        "payload", Map.of(
                                "kind", "OBJECT",
                                "element_id", "element.transaction.snapshot.001",
                                "name", "Transaction Snapshot Object",
                                "layout", Map.of("x", 80, "y", 120))));
        String afterRevision = ((Map<?, ?>) edit.get("meta")).get("committed_revision").toString();
        assertEquals(baseShaBeforeEdit, sha256(Files.readAllBytes(baseDatabase)));
        assertTrue(!baseShaBeforeEdit.equals(sha256(Files.readAllBytes(workingDatabase))), "正式提交必须只改变working SQLite。");
        JsonNode transaction = runTransactionSnapshot(fixture, runtimeJar, identity, beforeRevision, afterRevision);
        JsonNode before = transaction.required("before");
        JsonNode after = transaction.required("after");
        assertEquals(before.required("revision_document_count").asInt() + 1, after.required("revision_document_count").asInt());
        assertEquals(before.required("revision_parent_count").asInt() + 1, after.required("revision_parent_count").asInt());
        assertEquals(before.required("text_artifact_count").asInt() + 1, after.required("text_artifact_count").asInt());
        assertEquals(before.required("text_trace_count").asInt() + 1, after.required("text_trace_count").asInt());
        assertEquals(before.required("finding_count").asInt(), after.required("finding_count").asInt());
        assertEquals(before.required("operation_count").asInt() + 1, after.required("operation_count").asInt());
        assertEquals(before.required("receipt_count").asInt() + 1, after.required("receipt_count").asInt());
        assertEquals(beforeRevision, before.required("draft_head_revision_id").asText());
        assertEquals(afterRevision, after.required("draft_head_revision_id").asText());
        assertEquals(before.required("head_sequence").asInt() + 1, after.required("head_sequence").asInt());
    }

    private static JsonNode runTransactionSnapshot(E2EFixtureMaterializerCliTest.Fixture fixture, Path runtimeJar,
                                                   JsonNode identity, String beforeRevision, String afterRevision) throws Exception {
        List<String> command = new ArrayList<>(List.of(javaExecutable().toString(),
                "-Dloader.main=org.opm.localruntime.releaseevidence.E2ETransactionSnapshotCli",
                "-cp", runtimeJar.toString(), "org.springframework.boot.loader.launch.PropertiesLauncher",
                "--guard", "RELEASE_E2E_TRANSACTION_SNAPSHOT_ONLY",
                "--storage", fixture.attemptRoot().resolve("storage").toString(),
                "--project-id", identity.required("project_id").asText(),
                "--model-id", identity.required("model_id").asText(),
                "--before-revision-id", beforeRevision,
                "--after-revision-id", afterRevision,
                "--fixture-materialization", fixture.out().toString()));
        Process process = new ProcessBuilder(command).directory(fixture.attemptRoot().toFile()).start();
        byte[] stdout = process.getInputStream().readAllBytes();
        byte[] stderr = process.getErrorStream().readAllBytes();
        assertEquals(0, process.waitFor(), new String(stderr, StandardCharsets.UTF_8));
        assertEquals(0, stderr.length);
        JsonNode result = JSON.readTree(stdout);
        assertEquals(JSON.writeValueAsString(result) + "\n", new String(stdout, StandardCharsets.UTF_8));
        return result;
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

    private static void assertMaterializedBaseAndWorking(E2EFixtureMaterializerCliTest.Fixture fixture, JsonNode artifact) throws Exception {
        JsonNode storage = artifact.required("storage");
        Path base = fixture.attemptRoot().resolve(storage.required("project_db_ref").required("path").asText());
        Path working = fixture.attemptRoot().resolve(storage.required("working_project_db_path").asText());
        assertTrue(Files.isRegularFile(base));
        assertTrue(Files.isRegularFile(working));
        assertEquals("storage/materialized-base", storage.required("materialized_base_root").asText());
        assertEquals(sha256(Files.readAllBytes(base)), sha256(Files.readAllBytes(working)));
        assertEquals(storage.required("project_db_ref").required("sha256").asText(), storage.required("working_clone_sha256").asText());
        assertEquals(storage.required("project_db_ref").required("byte_length").asLong(), storage.required("working_clone_byte_length").asLong());
        assertTrue(!Files.isSameFile(base, working));
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
