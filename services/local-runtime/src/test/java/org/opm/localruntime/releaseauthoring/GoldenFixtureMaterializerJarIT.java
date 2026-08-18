package org.opm.localruntime.releaseauthoring;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GoldenFixtureMaterializerJarIT {

    private final ObjectMapper mapper = new ObjectMapper();

    @TempDir
    Path temporaryDirectory;

    @Test
    void materializesAControlledFixtureThroughTheExactSpringBootJar() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);

        ProcessResult result = invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar)));

        assertEquals(0, result.exitCode(), result.output());
        assertTrue(Files.isRegularFile(invocation.reportPath()));
        JsonNode report = mapper.readTree(Files.readAllBytes(invocation.reportPath()));
        assertEquals("MATERIALIZED", report.required("report_status").asText());
        report.required("checks").forEach(check -> assertEquals("PASSED", check.required("status").asText()));
        assertEquals("model.golden.proc", report.required("materialized_identity").required("model_id").asText());
        JsonNode persistence = report.required("persistence");
        persistence.required("stage_durations_us").fields().forEachRemaining(entry ->
                assertTrue(entry.getValue().asLong() > 0, entry.getKey()));
        assertTrue(persistence.required("peak_rss_bytes").asLong() > 0);
        Map<String, Object> semanticState = Map.of("storage_schema_version", report.required("target_storage").required("storage_schema_version").asText(), "project_id", report.required("materialized_identity").required("project_id").asText(), "model_id", report.required("materialized_identity").required("model_id").asText(), "revision_id", report.required("materialized_identity").required("revision_id").asText(), "revision_sequence", report.required("materialized_identity").required("revision_sequence").asInt(), "draft_head_revision_id", report.required("materialized_identity").required("draft_head_revision_id").asText(), "head_sequence", report.required("materialized_identity").required("head_sequence").asInt(), "profile_binding", mapper.convertValue(report.required("runtime_binding"), new TypeReference<Map<String, Object>>() { }), "document_sha256", report.required("source_fixture_ref").required("sha256").asText(), "table_counts", mapper.convertValue(report.required("persistence").required("table_counts"), new TypeReference<Map<String, Object>>() { }));
        assertEquals(report.required("target_storage").required("semantic_state_sha256").asText(), Rfc8785JsonCanonicalizer.sha256(semanticState));
        assertTrue(Files.isRegularFile(invocation.databasePath()));
    }

    @Test
    void rejectsAnInvalidReleaseGuardWithTheFrozenStartupExitCode() throws Exception {
        Path runtimeJar = runtimeJar();
        Process process = new ProcessBuilder(javaExecutable().toString(), "-jar", runtimeJar.toString(),
                "--spring.profiles.active=release-golden-authoring",
                "--spring.main.web-application-type=servlet",
                "--opm.runtime.mode=RELEASE_GOLDEN_FIXTURE_MATERIALIZE",
                "--opm.release-authoring.materializer.enabled=true",
                "--opm.release-authoring.contract-version=0.1.0")
                .redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);

        assertEquals(2, process.waitFor(), output);
        assertTrue(output.contains("GFM_WEB_MODE_FORBIDDEN"), output);
    }

    @Test
    void semanticVerifierAcceptsExactReportAndRejectsPayloadTampering() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);
        ProcessResult materialization = invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar)));
        assertEquals(0, materialization.exitCode(), materialization.output());
        ProcessResult accepted = verify(invocation);
        assertEquals(0, accepted.exitCode(), accepted.output());
        JsonNode report = mapper.readTree(Files.readAllBytes(invocation.reportPath()));
        ((com.fasterxml.jackson.databind.node.ObjectNode) report).put("report_payload_sha256", "0".repeat(64));
        Files.writeString(invocation.reportPath(), mapper.writeValueAsString(report));
        ProcessResult rejected = verify(invocation);
        assertEquals(2, rejected.exitCode(), rejected.output());
        assertTrue(rejected.output().contains("GFMV_REPORT_PAYLOAD_MISMATCH"), rejected.output());
    }

    @Test
    void semanticVerifierRejectsAReportWhoseDatabaseHasASidecar() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);
        ProcessResult materialization = invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar)));
        assertEquals(0, materialization.exitCode(), materialization.output());
        Files.writeString(invocation.databasePath().resolveSibling("project.db-wal"), "sidecar");

        ProcessResult rejected = verify(invocation);

        assertEquals(2, rejected.exitCode(), rejected.output());
        assertTrue(rejected.output().contains("GFMV_DATABASE_REF_MISMATCH"), rejected.output());
    }

    @Test
    void semanticVerifierRejectsReorderedChecksAfterPayloadIsRecomputed() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);
        assertEquals(0, invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar))).exitCode());
        mutateReport(invocation, report -> {
            var checks = (com.fasterxml.jackson.databind.node.ArrayNode) report.required("checks");
            JsonNode first = checks.get(0); checks.set(0, checks.get(1)); checks.set(1, first);
        });

        ProcessResult rejected = verify(invocation);

        assertEquals(2, rejected.exitCode(), rejected.output());
        assertTrue(rejected.output().contains("GFMV_CHECK_SEQUENCE_INVALID"), rejected.output());
    }

    @Test
    void semanticVerifierRejectsMaterializedBindingMismatchAfterPayloadIsRecomputed() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);
        assertEquals(0, invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar))).exitCode());
        mutateReport(invocation, report -> ((com.fasterxml.jackson.databind.node.ObjectNode) report.required("runtime_binding")).put("binding_digest", "0".repeat(64)));

        ProcessResult rejected = verify(invocation);

        assertEquals(2, rejected.exitCode(), rejected.output());
        assertTrue(rejected.output().contains("GFMV_BINDING_MISMATCH"), rejected.output());
    }

    @Test
    void semanticVerifierRejectsFixtureIdentityMismatchAfterPayloadIsRecomputed() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);
        assertEquals(0, invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar))).exitCode());
        mutateReport(invocation, report -> ((com.fasterxml.jackson.databind.node.ObjectNode) report.required("fixture_identity")).put("model_id", "model.tampered"));

        ProcessResult rejected = verify(invocation);

        assertEquals(2, rejected.exitCode(), rejected.output());
        assertTrue(rejected.output().contains("GFMV_FIXTURE_IDENTITY_MISMATCH"), rejected.output());
    }

    @Test
    void semanticVerifierRejectsAReportWhoseBundleReferenceDiffersFromThePlan() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);
        assertEquals(0, invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar))).exitCode());
        mutateReport(invocation, report -> ((com.fasterxml.jackson.databind.node.ObjectNode) report.required("evidence_bundle_ref")).put("sha256", "0".repeat(64)));

        ProcessResult rejected = verify(invocation);

        assertEquals(2, rejected.exitCode(), rejected.output());
        assertTrue(rejected.output().contains("GFMV_INPUT_REF_MISMATCH"), rejected.output());
    }

    @Test
    void semanticVerifierRejectsAChangedSqliteStateAfterRawReferencesAreRecomputed() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);
        assertEquals(0, invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar))).exitCode());
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + invocation.databasePath())) {
            connection.createStatement().executeUpdate("UPDATE model_head SET head_sequence = 999");
        }
        Files.deleteIfExists(invocation.databasePath().resolveSibling("project.db-wal"));
        Files.deleteIfExists(invocation.databasePath().resolveSibling("project.db-shm"));
        byte[] database = Files.readAllBytes(invocation.databasePath());
        String databaseSha256 = sha256(database);
        mutateReport(invocation, report -> {
            var target = (com.fasterxml.jackson.databind.node.ObjectNode) report.required("target_storage");
            var ref = (com.fasterxml.jackson.databind.node.ObjectNode) target.required("database_ref");
            ref.put("byte_length", database.length); ref.put("sha256", databaseSha256);
            target.put("database_sha256", databaseSha256);
        });

        ProcessResult rejected = verify(invocation);

        assertEquals(2, rejected.exitCode(), rejected.output());
        assertTrue(rejected.output().contains("GFMV_SEMANTIC_STATE_MISMATCH"), rejected.output());
    }

    @Test
    void semanticVerifierRejectsUnexpectedMaterializationRootOutput() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);
        ProcessResult materialization = invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar)));
        assertEquals(0, materialization.exitCode(), materialization.output());
        Files.writeString(invocation.root().resolve("unexpected.txt"), "unexpected");

        ProcessResult rejected = verify(invocation);

        assertEquals(2, rejected.exitCode(), rejected.output());
        assertTrue(rejected.output().contains("GFMV_ROOT_EXTRA_ENTRY"), rejected.output());
    }

    @Test
    void semanticVerifierRequireMaterializedRejectsABlockedReport() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);
        mutatePlan(invocation, plan -> map(plan, "active_binding").put("binding_digest", "0".repeat(64)));
        ProcessResult materialization = invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar)));
        assertEquals(3, materialization.exitCode(), materialization.output());

        ProcessResult rejected = verify(invocation, true);

        assertEquals(3, rejected.exitCode(), rejected.output());
        assertTrue(rejected.output().contains("GFMV_ROOT_NOT_CONSUMABLE"), rejected.output());
    }

    @Test
    void rejectsRuntimeJarShaMismatchBeforeReportAcceptanceThroughThePackagedJar() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);

        ProcessResult result = invoke(runtimeJar, invocation, "0".repeat(64));

        assertPreAcceptance(result, invocation, 3, "GFM_RUNTIME_JAR_MISMATCH");
    }

    @Test
    void rejectsModeMismatchBeforeReportAcceptanceThroughThePackagedJar() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);

        ProcessResult result = invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar)), command ->
                command.replaceAll(value -> value.startsWith("--opm.runtime.mode=")
                        ? "--opm.runtime.mode=NORMAL_RUNTIME" : value));

        assertPreAcceptance(result, invocation, 2, "GFM_MODE_DISABLED");
    }

    @Test
    void rejectsAnOutOfRootReportPathBeforeReportAcceptanceThroughThePackagedJar() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);

        ProcessResult result = invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar)), command ->
                command.replaceAll(value -> value.startsWith("--opm.release-authoring.report-out=")
                        ? "--opm.release-authoring.report-out=" + temporaryDirectory.resolve("outside.json") : value));

        assertPreAcceptance(result, invocation, 2, "GFM_ARGUMENT_INVALID");
        assertFalse(Files.exists(temporaryDirectory.resolve("outside.json")));
    }

    @Test
    void rejectsAnInvalidPlanBeforeReportAcceptanceThroughThePackagedJar() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);
        mutatePlan(invocation, plan -> plan.put("plan_status", "DRAFT"));

        ProcessResult result = invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar)));

        assertPreAcceptance(result, invocation, 2, "GFM_PLAN_INVALID");
    }

    @Test
    void rejectsAnInvalidFamilyFixtureSetBeforeReportAcceptanceThroughThePackagedJar() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);
        mutatePlan(invocation, plan -> list(plan, "captures").removeLast());

        ProcessResult result = invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar)));

        assertPreAcceptance(result, invocation, 2, "GFM_FIXTURE_SET_MISMATCH");
    }

    @Test
    void rejectsBundleShaMismatchBeforeReportAcceptanceThroughThePackagedJar() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);
        mutatePlan(invocation, plan -> map(map(plan, "input_materialization"), "bundle_ref").put("sha256", "0".repeat(64)));

        ProcessResult result = invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar)));

        assertPreAcceptance(result, invocation, 3, "GFM_BUNDLE_REF_MISMATCH");
    }

    @Test
    void rejectsUnsafeArchiveEntryBeforeReportAcceptanceThroughThePackagedJar() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = replaceTargetRef(invocation(runtimeJar), ref -> ref.put("archive_entry_path", "../target.json"));

        ProcessResult result = invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar)));

        assertPreAcceptance(result, invocation, 2, "GFM_ARCHIVE_ENTRY_UNSAFE");
    }

    @Test
    void rejectsFixtureShaMismatchBeforeReportAcceptanceThroughThePackagedJar() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = replaceTargetRef(invocation(runtimeJar), ref -> ref.put("sha256", "0".repeat(64)));

        ProcessResult result = invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar)));

        assertPreAcceptance(result, invocation, 3, "GFM_FIXTURE_REF_MISMATCH");
    }

    @Test
    void rejectsUnsupportedFixtureSchemaBeforeReportAcceptanceThroughThePackagedJar() throws Exception {
        Path runtimeJar = runtimeJar();
        byte[] unsupportedFixture = Files.readString(fixturePath("g-opl-proc-001-consumption-object-pass.json"))
                .replaceFirst("MS-REV-001", "MS-REV-X01")
                .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        Invocation invocation = invocation(runtimeJar, unsupportedFixture);

        ProcessResult result = invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar)));

        assertPreAcceptance(result, invocation, 2, "GFM_FIXTURE_SCHEMA_UNSUPPORTED");
    }

    @Test
    void writesBlockedReportAfterFixtureAcceptanceWhenBindingDiffersThroughThePackagedJar() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);
        mutatePlan(invocation, plan -> map(plan, "active_binding").put("binding_digest", "0".repeat(64)));

        ProcessResult result = invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar)));

        assertFalse(Files.exists(invocation.storagePath()));
        assertPostAcceptanceBlocked(result, invocation, "GFM_BINDING_MISMATCH", 8);
        ProcessResult verification = verify(invocation);
        assertEquals(3, verification.exitCode(), verification.output());
        assertTrue(verification.output().contains("GFMV_ROOT_NOT_CONSUMABLE"), verification.output());
    }

    @Test
    void writesBlockedReportAfterFixtureAcceptanceWhenStorageIsNotEmptyThroughThePackagedJar() throws Exception {
        Path runtimeJar = runtimeJar();
        Invocation invocation = invocation(runtimeJar);
        Files.createDirectories(invocation.storagePath());
        Path retained = invocation.storagePath().resolve("retain.txt");
        Files.writeString(retained, "retain");

        ProcessResult result = invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar)));

        assertEquals("retain", Files.readString(retained));
        assertPostAcceptanceBlocked(result, invocation, "GFM_TARGET_STORAGE_NOT_EMPTY", 9);
        ProcessResult verification = verify(invocation);
        assertEquals(2, verification.exitCode(), verification.output());
        assertTrue(verification.output().contains("GFMV_ROOT_EXTRA_ENTRY"), verification.output());
    }

    @Test
    void materializesAllControlledFamilyPassFixturesThroughTheExactSpringBootJar() throws Exception {
        Path runtimeJar = runtimeJar();
        BatchInvocation batch = batchInvocation(runtimeJar);
        assertEquals(130, batch.invocations().size());
        long batchStarted = System.nanoTime();
        List<Long> wallMicros = new ArrayList<>();
        long maxPeakRssBytes = 0;

        for (Invocation invocation : batch.invocations()) {
            long fixtureStarted = System.nanoTime();
            ProcessResult result = invoke(runtimeJar, invocation, sha256(Files.readAllBytes(runtimeJar)));
            long fixtureWallMicros = elapsedMicros(fixtureStarted);
            assertEquals(0, result.exitCode(), invocation.fixtureRefKey() + "\n" + result.output());
            JsonNode report = mapper.readTree(Files.readAllBytes(invocation.reportPath()));
            assertEquals("MATERIALIZED", report.required("report_status").asText());
            JsonNode persistence = report.required("persistence");
            assertTrue(persistence.required("reopen_matched").asBoolean());
            persistence.required("stage_durations_us").fields().forEachRemaining(entry ->
                    assertTrue(entry.getValue().asLong() > 0, invocation.fixtureRefKey() + ":" + entry.getKey()));
            maxPeakRssBytes = Math.max(maxPeakRssBytes, persistence.required("peak_rss_bytes").asLong());
            assertTrue(fixtureWallMicros <= 15_000_000L, invocation.fixtureRefKey() + " wall time=" + fixtureWallMicros);
            wallMicros.add(fixtureWallMicros);
            assertTrue(Files.isRegularFile(invocation.databasePath()));
        }
        ProcessResult verified = verifyFull(batch.invocations().getFirst());
        assertEquals(0, verified.exitCode(), verified.output());
        long totalWallMicros = elapsedMicros(batchStarted);
        long p95WallMicros = nearestRank(wallMicros, 0.95d);
        assertTrue(p95WallMicros <= 10_000_000L, "P95 wall time=" + p95WallMicros);
        assertTrue(totalWallMicros <= 1_800_000_000L, "serial total wall time=" + totalWallMicros);
        assertTrue(maxPeakRssBytes > 0 && maxPeakRssBytes <= 512L * 1024L * 1024L, "max RSS=" + maxPeakRssBytes);
        System.out.printf("GFM controlled serial performance: count=%d p95_us=%d total_us=%d max_rss_bytes=%d%n",
                wallMicros.size(), p95WallMicros, totalWallMicros, maxPeakRssBytes);
    }

    private Path runtimeJar() {
        Path runtimeJar = Path.of("target", "local-runtime-0.1.0-SNAPSHOT.jar").toAbsolutePath();
        assertTrue(Files.isRegularFile(runtimeJar), "集成测试必须在 Spring Boot JAR 打包完成后执行。");
        return runtimeJar;
    }

    private ProcessResult invoke(Path runtimeJar, Invocation invocation, String expectedRuntimeJarSha256) throws Exception {
        return invoke(runtimeJar, invocation, expectedRuntimeJarSha256, command -> { });
    }

    private ProcessResult invoke(Path runtimeJar, Invocation invocation, String expectedRuntimeJarSha256,
                                 Consumer<List<String>> commandMutation) throws Exception {
        List<String> command = new ArrayList<>(List.of(javaExecutable().toString(), "-jar", runtimeJar.toString(),
                "--spring.profiles.active=release-golden-authoring",
                "--spring.main.web-application-type=none",
                "--opm.runtime.mode=RELEASE_GOLDEN_FIXTURE_MATERIALIZE",
                "--opm.release-authoring.materializer.enabled=true",
                "--opm.release-authoring.contract-version=0.1.0",
                "--opm.release-authoring.capture-plan=" + invocation.planPath(),
                "--opm.release-authoring.evidence-bundle=" + invocation.bundlePath(),
                "--opm.release-authoring.fixture-ref-key=" + invocation.fixtureRefKey(),
                "--opm.release-authoring.expected-runtime-jar-sha256=" + expectedRuntimeJarSha256,
                "--opm.storage.root=" + invocation.storagePath(),
                "--opm.release-authoring.report-out=" + invocation.reportPath(),
                "--opm.release-authoring.source-date-epoch=1782864000"));
        commandMutation.accept(command);
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        return new ProcessResult(process.waitFor(), output);
    }

    private ProcessResult verify(Invocation invocation) throws Exception {
        return verify(invocation, false);
    }

    private ProcessResult verify(Invocation invocation, boolean requireMaterialized) throws Exception {
        List<String> command = new ArrayList<>(List.of("node", "scripts/verify-canvas06-golden-materialization.mjs", "--plan", invocation.planPath().toString(), "--materialization-root", invocation.root().toString(), "--fixture-ref-key", invocation.fixtureRefKey()));
        if (requireMaterialized) command.add("--require-materialized");
        Process process = new ProcessBuilder(command)
                .directory(Path.of("..", "..").toFile()).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        return new ProcessResult(process.waitFor(), output);
    }

    private ProcessResult verifyFull(Invocation invocation) throws Exception {
        Process process = new ProcessBuilder("node", "scripts/verify-canvas06-golden-materialization.mjs", "--plan", invocation.planPath().toString(), "--materialization-root", invocation.root().toString(), "--require-materialized")
                .directory(Path.of("..", "..").toFile()).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        return new ProcessResult(process.waitFor(), output);
    }

    private void assertPreAcceptance(ProcessResult result, Invocation invocation, int expectedExitCode, String expectedCode) {
        assertEquals(expectedExitCode, result.exitCode(), result.output());
        assertTrue(result.output().contains(expectedCode), result.output());
        assertFalse(Files.exists(invocation.storagePath()));
        assertFalse(Files.exists(invocation.reportPath()));
        assertFalse(Files.exists(invocation.reportPath().resolveSibling(invocation.reportPath().getFileName() + ".tmp")));
    }

    private void assertPostAcceptanceBlocked(ProcessResult result, Invocation invocation, String expectedCode, int failedCheck) throws Exception {
        assertEquals(3, result.exitCode(), result.output());
        assertTrue(result.output().contains(expectedCode), result.output());
        JsonNode report = mapper.readTree(Files.readAllBytes(invocation.reportPath()));
        assertEquals("BLOCKED", report.required("report_status").asText());
        assertEquals("model.golden.proc", report.required("fixture_identity").required("model_id").asText());
        assertEquals(expectedCode, report.required("primary_failure").required("code").asText());
        assertFalse(report.has("materialized_identity"));
        assertFalse(report.has("target_storage"));
        assertFalse(report.has("persistence"));
        List<JsonNode> checks = new ArrayList<>();
        report.required("checks").forEach(checks::add);
        for (int index = 0; index < failedCheck; index++) assertEquals("PASSED", checks.get(index).required("status").asText());
        assertEquals("FAILED", checks.get(failedCheck).required("status").asText());
        assertEquals(expectedCode, checks.get(failedCheck).required("code").asText());
        for (int index = failedCheck + 1; index < checks.size(); index++) assertEquals("NOT_RUN", checks.get(index).required("status").asText());
    }

    private Invocation invocation(Path runtimeJar) throws Exception {
        return invocation(runtimeJar, Files.readAllBytes(fixturePath("g-opl-proc-001-consumption-object-pass.json")));
    }

    private Invocation invocation(Path runtimeJar, byte[] fixture) throws Exception {
        Path root = temporaryDirectory.resolve("materialization");
        Files.createDirectories(root.resolve("reports"));
        Path bundle = temporaryDirectory.resolve("evidence-bundle.zip");
        try (OutputStream output = Files.newOutputStream(bundle); ZipOutputStream zip = new ZipOutputStream(output)) {
            zip.putNextEntry(new ZipEntry("fixtures/target.json"));
            zip.write(fixture);
            zip.closeEntry();
        }

        String bundleSha256 = sha256(Files.readAllBytes(bundle));
        Map<String, Object> targetRef = archiveRef("inputs/target.json", fixture.length, sha256(fixture), bundleSha256, "fixtures/target.json");
        List<Object> captures = new ArrayList<>();
        for (int fixtureIndex = 0; fixtureIndex < 130; fixtureIndex++) {
            Map<String, Object> ref = fixtureIndex == 0 ? targetRef : archiveRef("inputs/family-" + fixtureIndex + ".json", 1, "a".repeat(64), bundleSha256, "fixtures/family-" + fixtureIndex + ".json");
            for (int occurrence = 0; occurrence < 9; occurrence++) captures.add(Map.of("capture_kind", "FAMILY", "fixture_ref", ref));
        }
        String key = Rfc8785JsonCanonicalizer.sha256(targetRef);
        JsonNode fixtureRoot = mapper.readTree(fixture);
        Map<String, Object> plan = new LinkedHashMap<>();
        plan.put("schema_id", "OPM-DEV-CANVAS-06-GOLDEN-CAPTURE-PLAN-001");
        plan.put("schema_version", "0.1");
        plan.put("plan_status", "READY_FOR_AUTHORING");
        plan.put("change_id", "GOLDEN-CANVAS06-20260731-001");
        plan.put("source_date_epoch", 1782864000);
        plan.put("runtime_jar_ref", fileRef("LOCAL_RUNTIME_JAR", runtimeJar));
        plan.put("input_materialization", Map.of("bundle_ref", fileRef("EVIDENCE_BUNDLE", bundle)));
        plan.put("active_binding", mapper.convertValue(fixtureRoot.required("profile_binding"), new TypeReference<Map<String, Object>>() { }));
        plan.put("captures", captures);
        Path planPath = temporaryDirectory.resolve("capture-plan.json");
        Files.writeString(planPath, mapper.writeValueAsString(plan));
        Path storage = root.resolve("fixtures").resolve(key).resolve("storage");
        Path database = storage.resolve("projects").resolve("project.golden.fixture." + sha256(fixture)).resolve("project.db");
        return new Invocation(root, planPath, bundle, key, storage, root.resolve("reports").resolve(key + ".json"), database);
    }

    private BatchInvocation batchInvocation(Path runtimeJar) throws Exception {
        Path root = temporaryDirectory.resolve("batch-materialization");
        Files.createDirectories(root.resolve("reports"));
        Path profileRoot = Path.of("..", "..", "packages", "profiles", "profile.iso19450.2024.draft", "0.2.0");
        Map<String, Object> manifest = mapper.readValue(Files.readAllBytes(profileRoot.resolve("golden/opm-opl-golden-manifest.json")), new TypeReference<>() { });
        Set<String> fixturePaths = new LinkedHashSet<>();
        for (Object value : list(manifest, "cases")) {
            Map<String, Object> goldenCase = map(value);
            if ("PASS".equals(goldenCase.get("expectation"))) fixturePaths.add((String) goldenCase.get("input_revision_fixture"));
        }
        assertEquals(130, fixturePaths.size());

        List<FixtureInput> fixtures = new ArrayList<>();
        for (String fixturePath : fixturePaths.stream().sorted().toList()) {
            fixtures.add(new FixtureInput(fixturePath, Files.readAllBytes(profileRoot.resolve(fixturePath))));
        }
        Path bundle = temporaryDirectory.resolve("batch-evidence-bundle.zip");
        try (OutputStream output = Files.newOutputStream(bundle); ZipOutputStream zip = new ZipOutputStream(output)) {
            for (int index = 0; index < fixtures.size(); index++) {
                zip.putNextEntry(new ZipEntry("fixtures/family-" + index + ".json"));
                zip.write(fixtures.get(index).bytes());
                zip.closeEntry();
            }
        }

        String bundleSha256 = sha256(Files.readAllBytes(bundle));
        List<Map<String, Object>> refs = new ArrayList<>();
        List<Object> captures = new ArrayList<>();
        for (int index = 0; index < fixtures.size(); index++) {
            FixtureInput fixture = fixtures.get(index);
            Map<String, Object> ref = archiveRef(fixture.path(), fixture.bytes().length, sha256(fixture.bytes()), bundleSha256, "fixtures/family-" + index + ".json");
            refs.add(ref);
            for (int occurrence = 0; occurrence < 9; occurrence++) captures.add(Map.of("capture_kind", "FAMILY", "fixture_ref", ref));
        }
        assertEquals(1170, captures.size());
        JsonNode fixtureRoot = mapper.readTree(fixtures.getFirst().bytes());
        Map<String, Object> plan = new LinkedHashMap<>();
        plan.put("schema_id", "OPM-DEV-CANVAS-06-GOLDEN-CAPTURE-PLAN-001");
        plan.put("schema_version", "0.1");
        plan.put("plan_status", "READY_FOR_AUTHORING");
        plan.put("change_id", "GOLDEN-CANVAS06-20260731-001");
        plan.put("source_date_epoch", 1782864000);
        plan.put("runtime_jar_ref", fileRef("LOCAL_RUNTIME_JAR", runtimeJar));
        plan.put("input_materialization", Map.of("bundle_ref", fileRef("EVIDENCE_BUNDLE", bundle)));
        plan.put("active_binding", mapper.convertValue(fixtureRoot.required("profile_binding"), new TypeReference<Map<String, Object>>() { }));
        plan.put("captures", captures);
        Path planPath = temporaryDirectory.resolve("batch-capture-plan.json");
        Files.writeString(planPath, mapper.writeValueAsString(plan));

        List<Invocation> invocations = new ArrayList<>();
        for (int index = 0; index < refs.size(); index++) {
            Map<String, Object> ref = refs.get(index);
            String key = fixtureRefKey(ref);
            Path storage = root.resolve("fixtures").resolve(key).resolve("storage");
            Path database = storage.resolve("projects").resolve("project.golden.fixture." + ref.get("sha256")).resolve("project.db");
            invocations.add(new Invocation(root, planPath, bundle, key, storage, root.resolve("reports").resolve(key + ".json"), database));
        }
        return new BatchInvocation(invocations);
    }

    private Invocation replaceTargetRef(Invocation invocation, Consumer<Map<String, Object>> mutation) throws Exception {
        Map<String, Object> plan = readPlan(invocation);
        Map<String, Object> targetRef = new LinkedHashMap<>(map(map(list(plan, "captures").getFirst()), "fixture_ref"));
        mutation.accept(targetRef);
        List<Object> captures = list(plan, "captures");
        for (int index = 0; index < 9; index++) map(captures.get(index)).put("fixture_ref", targetRef);
        writePlan(invocation, plan);
        String key = fixtureRefKey(targetRef);
        Path storage = invocation.root().resolve("fixtures").resolve(key).resolve("storage");
        Path database = storage.resolve("projects").resolve("project.golden.fixture." + targetRef.get("sha256")).resolve("project.db");
        return new Invocation(invocation.root(), invocation.planPath(), invocation.bundlePath(), key, storage,
                invocation.root().resolve("reports").resolve(key + ".json"), database);
    }

    private void mutatePlan(Invocation invocation, Consumer<Map<String, Object>> mutation) throws Exception {
        Map<String, Object> plan = readPlan(invocation);
        mutation.accept(plan);
        writePlan(invocation, plan);
    }

    private void mutateReport(Invocation invocation, Consumer<com.fasterxml.jackson.databind.node.ObjectNode> mutation) throws Exception {
        var report = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(Files.readAllBytes(invocation.reportPath()));
        mutation.accept(report);
        report.remove("report_payload_sha256");
        report.put("report_payload_sha256", Rfc8785JsonCanonicalizer.sha256(report));
        Files.writeString(invocation.reportPath(), mapper.writeValueAsString(report));
    }

    private Map<String, Object> readPlan(Invocation invocation) throws Exception {
        return mapper.readValue(Files.readAllBytes(invocation.planPath()), new TypeReference<>() { });
    }

    private void writePlan(Invocation invocation, Map<String, Object> plan) throws Exception {
        Files.writeString(invocation.planPath(), mapper.writeValueAsString(plan));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> map(Object value) {
        return (Map<String, Object>) value;
    }

    private Map<String, Object> map(Map<String, Object> value, String key) {
        return map(value.get(key));
    }

    @SuppressWarnings("unchecked")
    private List<Object> list(Map<String, Object> value, String key) {
        return (List<Object>) value.get(key);
    }

    private String fixtureRefKey(Map<String, Object> fixtureRef) throws Exception {
        return Rfc8785JsonCanonicalizer.sha256(fixtureRef);
    }

    private Path javaExecutable() {
        return Path.of(System.getProperty("java.home"), "bin", "java");
    }

    private long nearestRank(List<Long> values, double percentile) {
        List<Long> sorted = values.stream().sorted().toList();
        return sorted.get((int) Math.ceil(percentile * sorted.size()) - 1);
    }

    private long elapsedMicros(long started) {
        return Math.max(1L, (System.nanoTime() - started) / 1_000L);
    }

    private Map<String, Object> fileRef(String kind, Path file) throws Exception {
        return Map.of("kind", kind, "path", file.getFileName().toString(), "byte_length", Files.size(file), "sha256", sha256(Files.readAllBytes(file)));
    }

    private Map<String, Object> archiveRef(String path, int length, String sha256, String bundleSha256, String entry) {
        return Map.of("path", path, "byte_length", length, "sha256", sha256, "bundle_sha256", bundleSha256, "archive_entry_path", entry);
    }

    private Path fixturePath(String file) {
        return Path.of("..", "..", "packages", "profiles", "profile.iso19450.2024.draft", "0.2.0", "golden", "fixtures", file);
    }

    private String sha256(byte[] value) throws Exception {
        return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
    }

    private record Invocation(Path root, Path planPath, Path bundlePath, String fixtureRefKey, Path storagePath, Path reportPath, Path databasePath) { }

    private record BatchInvocation(List<Invocation> invocations) { }

    private record FixtureInput(String path, byte[] bytes) { }

    private record ProcessResult(int exitCode, String output) { }
}
