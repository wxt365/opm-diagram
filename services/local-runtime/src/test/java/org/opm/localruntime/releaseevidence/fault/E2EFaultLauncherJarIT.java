package org.opm.localruntime.releaseevidence.fault;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileSystem;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class E2EFaultLauncherJarIT {
    @TempDir
    Path temporaryDirectory;

    @Test
    void startsOnlyTheExactJarWithACompleteTupleAndEmitsReady() throws Exception {
        Path jar = exactJar();
        Arguments arguments = arguments();
        Child child = start(jar, arguments, "ready");
        try {
            String expected = "E2E_FAULT_LAUNCHER_READY\tE2E-CANVAS-007.ASSET_MISSING\t1\t" + arguments.rawSha256();
            awaitLog(child, expected);
        } finally {
            stop(child);
        }
    }

    @Test
    void rejectsAPartialTupleBeforeSpringBootStarts() throws Exception {
        Path jar = exactJar();
        Process process = new ProcessBuilder(javaExecutable().toString(), "-jar", jar.toString(),
                "--spring.profiles.active=release-e2e-fault").redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertEquals(2, process.waitFor());
        assertTrue(output.startsWith("E2E_FAULT_CONFIGURATION_INVALID\tMODE_AND_PROFILE\t-\t-"), output);
    }

    @Test
    void rejectsAnInvalidChallengeFromTheExactJar() throws Exception {
        Arguments arguments = arguments();
        assertFailure(exactJar(), arguments.withResponse("0".repeat(64)), 3,
                "E2E_FAULT_HANDSHAKE_INVALID\tCHALLENGE_RESPONSE\tE2E-CANVAS-007.ASSET_MISSING\t1");
    }

    @Test
    void rejectsAJarWhoseEmbeddedSchemaDiffersFromTheFrozenRawBytes() throws Exception {
        Path alteredJar = temporaryDirectory.resolve("local-runtime-schema-drift.jar");
        Files.copy(exactJar(), alteredJar);
        try (FileSystem archive = FileSystems.newFileSystem(alteredJar)) {
            Files.writeString(archive.getPath("/BOOT-INF/classes/releaseevidence/schema/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json"), "{}\n");
        }

        assertFailure(alteredJar, arguments(), 2,
                "E2E_FAULT_PLAN_SCHEMA_INVALID\tSCHEMA_0_2\tE2E-CANVAS-007.ASSET_MISSING\t1");
    }

    @Test
    void detectsPlanDriftDuringChildShutdown() throws Exception {
        Arguments arguments = arguments();
        Child child = start(exactJar(), arguments, "drift");
        awaitLog(child, "E2E_FAULT_LAUNCHER_READY\tE2E-CANVAS-007.ASSET_MISSING\t1\t" + arguments.rawSha256());
        Files.writeString(arguments.plan(), "{}\n");

        child.process().destroy();
        assertEquals(3, awaitExit(child));
        assertTrue(log(child).contains("E2E_FAULT_PLAN_DRIFT\tSHUTDOWN_VERIFY\tE2E-CANVAS-007.ASSET_MISSING\t1"), log(child));
    }

    @Test
    void rejectsShutdownWhenThePlannedSingleTriggerDidNotOccur() throws Exception {
        Arguments arguments = arguments();
        Child child = start(exactJar(), arguments, "untriggered");
        awaitLog(child, "E2E_FAULT_LAUNCHER_READY\tE2E-CANVAS-007.ASSET_MISSING\t1\t" + arguments.rawSha256());

        child.process().destroy();
        assertEquals(3, awaitExit(child));
        assertTrue(log(child).contains("E2E_FAULT_NOT_TRIGGERED\tSHUTDOWN_VERIFY\tE2E-CANVAS-007.ASSET_MISSING\t1"), log(child));
    }

    private Arguments arguments() throws Exception {
        String nonce = "1".repeat(64);
        Map<String, Object> digest = Map.of("case_id", "E2E-CANVAS-007.ASSET_MISSING", "attempt_ordinal", 1,
                "fault_kind", "ASSET_MISSING", "target", "SYMBOL_CATALOG_ASSET", "trigger_count", 1, "nonce", nonce);
        Map<String, Object> plan = new LinkedHashMap<>();
        plan.put("schema_id", "OPM-DEV-CANVAS-06-E2E-FAULT-PLAN-001");
        plan.put("schema_version", "0.2");
        plan.putAll(digest);
        plan.put("plan_sha256", Rfc8785JsonCanonicalizer.sha256(digest));
        plan.put("artifact_payload_sha256", Rfc8785JsonCanonicalizer.sha256(plan));
        Path storage = temporaryDirectory.resolve("storage");
        Files.createDirectories(storage);
        Path planPath = temporaryDirectory.resolve("fault-plan.json");
        byte[] raw = (Rfc8785JsonCanonicalizer.canonicalize(plan) + "\n").getBytes(StandardCharsets.UTF_8);
        Files.write(planPath, raw);
        byte[] challengeBytes = new byte[32];
        java.util.Arrays.fill(challengeBytes, (byte) 7);
        Path challenge = temporaryDirectory.resolve("challenge");
        Files.write(challenge, challengeBytes);
        String rawSha = sha(raw);
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(java.util.HexFormat.of().parseHex(nonce), "HmacSHA256"));
        mac.update(E2EFaultPlanVerifier.DOMAIN.getBytes(StandardCharsets.US_ASCII));
        mac.update(challengeBytes);
        mac.update(java.util.HexFormat.of().parseHex(rawSha));
        return new Arguments(storage, planPath, challenge, nonce, rawSha, java.util.HexFormat.of().formatHex(mac.doFinal()));
    }

    private static String sha(byte[] raw) throws Exception {
        return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(raw));
    }

    private Path exactJar() {
        Path jar = Path.of("target/local-runtime-0.1.0-SNAPSHOT.jar").toAbsolutePath().normalize();
        assertTrue(Files.isRegularFile(jar), "必须先生成 exact Runtime JAR。");
        return jar;
    }

    private Child start(Path jar, Arguments arguments, String name) throws Exception {
        Path log = temporaryDirectory.resolve(name + ".log");
        List<String> command = new java.util.ArrayList<>(List.of(javaExecutable().toString(), "-jar", jar.toString(),
                "--spring.profiles.active=release-e2e-fault", "--server.address=127.0.0.1", "--server.port=0",
                "--opm.storage.root=" + arguments.storage(), "--opm.release.e2e.enabled=true",
                "--opm.release.e2e.guard=RELEASE_E2E_FAULT_ONLY", "--opm.release.e2e.plan=" + arguments.plan(),
                "--opm.release.e2e.plan-raw-sha256=" + arguments.rawSha256(),
                "--opm.release.e2e.case-id=E2E-CANVAS-007.ASSET_MISSING", "--opm.release.e2e.attempt-ordinal=1",
                "--opm.release.e2e.parent-nonce=" + arguments.nonce(), "--opm.release.e2e.challenge=" + arguments.challenge(),
                "--opm.release.e2e.challenge-response=" + arguments.response()));
        return new Child(new ProcessBuilder(command).redirectErrorStream(true).redirectOutput(log.toFile()).start(), log);
    }

    private void assertFailure(Path jar, Arguments arguments, int exitCode, String firstLine) throws Exception {
        Child child = start(jar, arguments, "failure-" + exitCode + "-" + System.nanoTime());
        assertEquals(exitCode, awaitExit(child));
        assertTrue(log(child).startsWith(firstLine), log(child));
    }

    private void awaitLog(Child child, String expected) throws Exception {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(10));
        while (Instant.now().isBefore(deadline) && child.process().isAlive()) {
            if (log(child).contains(expected)) return;
            Thread.sleep(100);
        }
        throw new AssertionError("exact JAR did not emit expected output: " + log(child));
    }

    private int awaitExit(Child child) throws Exception {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(10));
        while (Instant.now().isBefore(deadline) && child.process().isAlive()) Thread.sleep(100);
        if (child.process().isAlive()) {
            stop(child);
            throw new AssertionError("forked JAR did not exit: " + log(child));
        }
        return child.process().exitValue();
    }

    private void stop(Child child) throws Exception {
        if (!child.process().isAlive()) return;
        child.process().destroyForcibly();
        child.process().waitFor();
    }

    private String log(Child child) throws Exception {
        return Files.exists(child.log()) ? Files.readString(child.log()) : "";
    }

    private static Path javaExecutable() { return Path.of(System.getProperty("java.home"), "bin", "java"); }

    private record Arguments(Path storage, Path plan, Path challenge, String nonce, String rawSha256, String response) {
        private Arguments withResponse(String value) { return new Arguments(storage, plan, challenge, nonce, rawSha256, value); }
    }

    private record Child(Process process, Path log) { }
}
