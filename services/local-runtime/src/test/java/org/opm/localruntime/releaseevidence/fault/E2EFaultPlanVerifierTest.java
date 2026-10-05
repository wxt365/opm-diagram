package org.opm.localruntime.releaseevidence.fault;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class E2EFaultPlanVerifierTest {
    @TempDir Path temporaryDirectory;

    @Test
    void bundledSchemaMatchesTheCurrentFrozenSourceBytes() throws Exception {
        byte[] source = Files.readAllBytes(repositoryRoot().resolve("docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json"));
        try (var input = E2EFaultPlanVerifier.class.getResourceAsStream(E2EFaultPlanVerifier.SCHEMA_RESOURCE)) {
            assertTrue(input != null, "JAR 必须包含受控 Schema");
            assertEquals(E2EFaultPlanVerifier.EXPECTED_SCHEMA_SHA256, sha(input.readAllBytes()));
        }
        assertEquals(E2EFaultPlanVerifier.EXPECTED_SCHEMA_SHA256, sha(source));
    }

    @Test
    void rejectsMissingOrTamperedBundledSchemaWithoutCheckoutFallback() throws Exception {
        byte[] source = Files.readAllBytes(repositoryRoot().resolve("docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json"));
        byte[] tampered = java.util.Arrays.copyOf(source, source.length + 1);
        tampered[source.length] = '\n';
        Map<String, String> arguments = writePlan(FaultCase.PERSISTENCE_FAILED, Map.of());
        // 独立加载真实 verifier：有效 checkout 仍存在，只替换其内嵌资源。
        for (byte[] resource : new byte[][] {source, null, tampered}) {
            try (var loader = new java.net.URLClassLoader(new java.net.URL[] {
                    E2EFaultPlanVerifier.class.getProtectionDomain().getCodeSource().getLocation()
            }, E2EFaultPlanVerifier.class.getClassLoader()) {
                @Override
                protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
                    if (!name.startsWith("org.opm.localruntime.releaseevidence.fault.")) return super.loadClass(name, resolve);
                    synchronized (getClassLoadingLock(name)) {
                        Class<?> loaded = findLoadedClass(name);
                        if (loaded == null) loaded = findClass(name);
                        if (resolve) resolveClass(loaded);
                        return loaded;
                    }
                }

                @Override
                public java.io.InputStream getResourceAsStream(String name) {
                    if (name.equals(E2EFaultPlanVerifier.SCHEMA_RESOURCE.substring(1))) {
                        return resource == null ? null : new java.io.ByteArrayInputStream(resource);
                    }
                    return super.getResourceAsStream(name);
                }
            }) {
                Class<?> argumentType = loader.loadClass(E2EFaultLauncherArguments.class.getName());
                Object input = argumentType.getConstructor(Map.class).newInstance(arguments);
                var verify = loader.loadClass(E2EFaultPlanVerifier.class.getName()).getMethod("verify", argumentType);
                if (resource == source) {
                    assertTrue(verify.invoke(null, input) != null);
                } else {
                    var failure = assertThrows(java.lang.reflect.InvocationTargetException.class, () -> verify.invoke(null, input)).getCause();
                    assertEquals("E2E_FAULT_PLAN_SCHEMA_INVALID", failure.getClass().getMethod("code").invoke(failure).toString());
                    assertEquals("SCHEMA_0_2", failure.getClass().getMethod("stage").invoke(failure));
                }
            }
        }
    }

    @Test
    void acceptsAllThreeFaultPlansWithNodeAjvAndTheJarValidator() throws Exception {
        for (FaultCase faultCase : FaultCase.values()) {
            Map<String, String> arguments = writePlan(faultCase, Map.of());
            assertTrue(nodeAccepts(arguments.get(E2EFaultLauncherArguments.PLAN)), faultCase.name());

            E2EFaultPlanVerifier.VerifiedPlan verified = E2EFaultPlanVerifier.verify(new E2EFaultLauncherArguments(arguments));
            assertEquals(faultCase.caseId(), verified.plan().caseId());
            assertEquals(faultCase.faultKind(), verified.plan().faultKind().name());
            assertEquals(faultCase.target(), verified.plan().target().name());
        }
    }

    @Test
    void rejectsEachFaultPlanFieldInParityWithNodeAjv() throws Exception {
        for (Map.Entry<String, Object> invalid : invalidFields().entrySet()) {
            Map<String, String> arguments = writePlan(FaultCase.PERSISTENCE_FAILED, Map.of(invalid.getKey(), invalid.getValue()));
            assertEquals(false, nodeAccepts(arguments.get(E2EFaultLauncherArguments.PLAN)), invalid.getKey());
            assertThrows(E2EFaultLauncherException.class,
                    () -> E2EFaultPlanVerifier.verify(new E2EFaultLauncherArguments(arguments)), invalid.getKey());
        }
    }

    @Test
    void rejectsRawDigestDriftAfterPlanValidation() throws Exception {
        Map<String, String> arguments = writePlan(FaultCase.PERSISTENCE_FAILED, Map.of());
        arguments.put(E2EFaultLauncherArguments.PLAN_RAW_SHA256, "0".repeat(64));

        E2EFaultLauncherException exception = assertThrows(E2EFaultLauncherException.class,
                () -> E2EFaultPlanVerifier.verify(new E2EFaultLauncherArguments(arguments)));

        assertEquals(E2EFaultLauncherErrorCode.E2E_FAULT_PLAN_DIGEST_MISMATCH, exception.code());
    }

    private Map<String, Object> invalidFields() {
        Map<String, Object> invalid = new LinkedHashMap<>();
        invalid.put("schema_id", "OPM-DEV-CANVAS-06-E2E-FAULT-PLAN-999");
        invalid.put("schema_version", "0.3");
        invalid.put("case_id", "E2E-CANVAS-007.UNKNOWN");
        invalid.put("attempt_ordinal", 3);
        invalid.put("fault_kind", "NONE");
        invalid.put("target", "NONE");
        invalid.put("trigger_count", 0);
        invalid.put("nonce", "A".repeat(64));
        invalid.put("plan_sha256", "A".repeat(64));
        invalid.put("artifact_payload_sha256", "A".repeat(64));
        return invalid;
    }

    private Map<String, String> writePlan(FaultCase faultCase, Map<String, Object> overrides) throws Exception {
        String nonce = "1".repeat(64);
        Map<String, Object> digest = new LinkedHashMap<>();
        digest.put("case_id", faultCase.caseId());
        digest.put("attempt_ordinal", 1);
        digest.put("fault_kind", faultCase.faultKind());
        digest.put("target", faultCase.target());
        digest.put("trigger_count", 1);
        digest.put("nonce", nonce);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("schema_id", "OPM-DEV-CANVAS-06-E2E-FAULT-PLAN-001");
        payload.put("schema_version", "0.2");
        payload.putAll(digest);
        payload.put("plan_sha256", Rfc8785JsonCanonicalizer.sha256(digest));
        payload.put("artifact_payload_sha256", Rfc8785JsonCanonicalizer.sha256(payload));
        payload.putAll(overrides);
        Path storage = temporaryDirectory.resolve(faultCase.name().toLowerCase()).resolve("storage");
        Files.createDirectories(storage);
        Path plan = storage.getParent().resolve("fault-plan.json");
        byte[] raw = (Rfc8785JsonCanonicalizer.canonicalize(payload) + "\n").getBytes(StandardCharsets.UTF_8);
        Files.write(plan, raw);
        Path challenge = storage.getParent().resolve("challenge");
        byte[] challengeBytes = new byte[32];
        java.util.Arrays.fill(challengeBytes, (byte) 7);
        Files.write(challenge, challengeBytes);
        String rawSha = sha(raw);
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(java.util.HexFormat.of().parseHex(nonce), "HmacSHA256"));
        mac.update(E2EFaultPlanVerifier.DOMAIN.getBytes(StandardCharsets.US_ASCII));
        mac.update(challengeBytes);
        mac.update(java.util.HexFormat.of().parseHex(rawSha));
        Map<String, String> arguments = new LinkedHashMap<>();
        arguments.put(E2EFaultLauncherArguments.PROFILE, "release-e2e-fault");
        arguments.put(E2EFaultLauncherArguments.ENABLED, "true");
        arguments.put(E2EFaultLauncherArguments.GUARD, "RELEASE_E2E_FAULT_ONLY");
        arguments.put(E2EFaultLauncherArguments.PLAN, plan.toString());
        arguments.put(E2EFaultLauncherArguments.PLAN_RAW_SHA256, rawSha);
        arguments.put(E2EFaultLauncherArguments.CASE_ID, faultCase.caseId());
        arguments.put(E2EFaultLauncherArguments.ATTEMPT_ORDINAL, "1");
        arguments.put(E2EFaultLauncherArguments.PARENT_NONCE, nonce);
        arguments.put(E2EFaultLauncherArguments.CHALLENGE, challenge.toString());
        arguments.put(E2EFaultLauncherArguments.CHALLENGE_RESPONSE, java.util.HexFormat.of().formatHex(mac.doFinal()));
        arguments.put("opm.storage.root", storage.toString());
        return arguments;
    }

    private boolean nodeAccepts(String planPath) throws Exception {
        Path repository = repositoryRoot();
        String program = """
                import { readFile } from 'node:fs/promises';
                import Ajv2020 from 'ajv/dist/2020.js';
                const [schemaPath, inputPath] = process.argv.slice(1);
                const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
                const value = JSON.parse(await readFile(inputPath, 'utf8'));
                const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
                process.exitCode = validate(value) ? 0 : 1;
                """;
        Process process = new ProcessBuilder("node", "--input-type=module", "--eval", program,
                repository.resolve("docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json").toString(), planPath)
                .directory(repository.toFile()).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        int exitCode = process.waitFor();
        if (exitCode != 0 && exitCode != 1) throw new IllegalStateException("Node/Ajv validator did not run: " + output);
        return exitCode == 0;
    }

    private Path repositoryRoot() {
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            if (Files.isRegularFile(current.resolve("package.json"))
                    && Files.isRegularFile(current.resolve("docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json"))) {
                return current;
            }
            current = current.getParent();
        }
        throw new IllegalStateException("Repository root is not available");
    }

    private static String sha(byte[] value) throws Exception {
        return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(value));
    }

    private enum FaultCase {
        ASSET_MISSING("E2E-CANVAS-007.ASSET_MISSING", "ASSET_MISSING", "SYMBOL_CATALOG_ASSET"),
        PERSISTENCE_FAILED("E2E-CANVAS-007.PERSISTENCE_FAILED", "PERSISTENCE_FAILED", "SQLITE_BEFORE_REVISION_INSERT"),
        READ_ONLY("E2E-CANVAS-007.READONLY", "READONLY", "PROJECT_STORAGE_READ_ONLY");

        private final String caseId;
        private final String faultKind;
        private final String target;

        FaultCase(String caseId, String faultKind, String target) {
            this.caseId = caseId;
            this.faultKind = faultKind;
            this.target = target;
        }

        private String caseId() { return caseId; }
        private String faultKind() { return faultKind; }
        private String target() { return target; }
    }
}
