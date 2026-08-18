package org.opm.localruntime.releaseauthoring;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.env.MockPropertySource;

import java.io.OutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GoldenFixtureMaterializerRunnerTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @TempDir
    Path temporaryDirectory;

    @Test
    void writesARealInputBlockedReportWithOrderedChecksWhenPlanBindingDiffers() throws Exception {
        Invocation invocation = invocation();
        @SuppressWarnings("unchecked")
        Map<String, Object> planBinding = (Map<String, Object>) invocation.plan().get("active_binding");
        planBinding.put("binding_digest", "0".repeat(64));
        Files.writeString(invocation.planPath(), mapper.writeValueAsString(invocation.plan()));

        GoldenFixtureMaterializerRunner runner = runner(invocation, true);
        runner.run(null);

        assertEquals(3, runner.getExitCode());
        assertTrue(Files.isRegularFile(invocation.reportPath()));
        assertFalse(Files.exists(invocation.storagePath()));

        JsonNode report = mapper.readTree(Files.readAllBytes(invocation.reportPath()));
        assertEquals("BLOCKED", report.required("report_status").asText());
        assertEquals("GOLDEN-CANVAS06-20260731-001", report.required("change_id").asText());
        assertEquals(invocation.key(), report.required("fixture_ref_key").asText());
        assertEquals("model.golden.proc", report.required("fixture_identity").required("model_id").asText());
        assertEquals("GFM_BINDING_MISMATCH", report.required("primary_failure").required("code").asText());
        List<JsonNode> checks = new ArrayList<>();
        report.required("checks").forEach(checks::add);
        for (int index = 0; index < 8; index++) assertEquals("PASSED", checks.get(index).required("status").asText());
        assertEquals("FAILED", checks.get(8).required("status").asText());
        assertEquals("GFM_BINDING_MISMATCH", checks.get(8).required("code").asText());
        assertEquals("NOT_RUN", checks.get(9).required("status").asText());

        String payloadSha = report.required("report_payload_sha256").asText();
        ((com.fasterxml.jackson.databind.node.ObjectNode) report).remove("report_payload_sha256");
        Map<String, Object> payload = mapper.convertValue(report, new TypeReference<Map<String, Object>>() { });
        assertEquals(payloadSha, Rfc8785JsonCanonicalizer.sha256(payload));
    }

    @Test
    void writesMeasuredStageDurationsAndMacosPeakRssForAMaterializedReport() throws Exception {
        Invocation invocation = invocation();

        GoldenFixtureMaterializerRunner runner = runner(invocation, true);
        runner.run(null);

        assertEquals(0, runner.getExitCode());
        JsonNode persistence = mapper.readTree(Files.readAllBytes(invocation.reportPath())).required("persistence");
        persistence.required("stage_durations_us").fields().forEachRemaining(entry ->
                assertTrue(entry.getValue().asLong() > 0, entry.getKey()));
        assertTrue(persistence.required("peak_rss_bytes").asLong() > 0);
    }

    @Test
    void inheritsBundleAndRuntimeRefsFromTheCapturePlan() throws Exception {
        Invocation invocation = invocation();
        Map<String, Object> runtimeRef = new LinkedHashMap<>(cast(invocation.plan().get("runtime_jar_ref")));
        runtimeRef.put("path", "releases/clean/runtime/local-runtime.jar");
        Map<String, Object> bundleRef = new LinkedHashMap<>(cast(cast(invocation.plan().get("input_materialization")).get("bundle_ref")));
        bundleRef.put("path", "releases/clean/dev-canvas-05-evidence-bundle.jar");
        invocation.plan().put("runtime_jar_ref", runtimeRef);
        invocation.plan().put("input_materialization", Map.of("bundle_ref", bundleRef));
        Files.writeString(invocation.planPath(), mapper.writeValueAsString(invocation.plan()));

        GoldenFixtureMaterializerRunner runner = runner(invocation, true);
        runner.run(null);

        assertEquals(0, runner.getExitCode());
        JsonNode report = mapper.readTree(Files.readAllBytes(invocation.reportPath()));
        assertFileRefEquals(runtimeRef, report.required("runner_identity").required("runtime_jar_ref"));
        assertFileRefEquals(bundleRef, report.required("evidence_bundle_ref"));
    }

    @Test
    void doesNotWriteAReportForAnInvocationRejectedByTheModeGuard() throws Exception {
        Invocation invocation = invocation();

        GoldenFixtureMaterializerRunner runner = runner(invocation, false);
        runner.run(null);

        assertEquals(2, runner.getExitCode());
        assertFalse(Files.exists(invocation.reportPath()));
        assertFalse(Files.exists(invocation.storagePath()));
    }

    @Test
    void rejectsARequiredGuardWhenItComesFromConfigurationInsteadOfCommandLine() throws Exception {
        Invocation invocation = invocation();

        GoldenFixtureMaterializerRunner runner = runner(invocation, true, false);
        runner.run(null);

        assertEquals(2, runner.getExitCode());
        assertFalse(Files.exists(invocation.reportPath()));
        assertFalse(Files.exists(invocation.storagePath()));
    }

    @Test
    void rejectsAnUnsupportedFixtureBeforeReportAcceptanceWithoutAnyReportOutput() throws Exception {
        byte[] unsupportedFixture = Files.readString(fixturePath("g-opl-proc-001-consumption-object-pass.json"))
                .replaceFirst("MS-REV-001", "MS-REV-X01")
                .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        Invocation invocation = invocation(unsupportedFixture);

        GoldenFixtureMaterializerRunner runner = runner(invocation, true);
        runner.run(null);

        assertEquals(2, runner.getExitCode());
        assertFalse(Files.exists(invocation.storagePath()));
        assertFalse(Files.exists(invocation.reportPath()));
        assertFalse(Files.exists(invocation.reportPath().resolveSibling(invocation.reportPath().getFileName() + ".tmp")));
    }

    @Test
    void returnsReportWriteFailureWithoutFinalOrTemporaryReportWhenAnAcceptedInvocationCannotWrite() throws Exception {
        Invocation invocation = invocation();
        @SuppressWarnings("unchecked")
        Map<String, Object> planBinding = (Map<String, Object>) invocation.plan().get("active_binding");
        planBinding.put("binding_digest", "0".repeat(64));
        Files.writeString(invocation.planPath(), mapper.writeValueAsString(invocation.plan()));
        Files.delete(invocation.reportPath().getParent());
        Files.writeString(invocation.reportPath().getParent(), "not-a-directory");

        GoldenFixtureMaterializerRunner runner = runner(invocation, true);
        runner.run(null);

        assertEquals(4, runner.getExitCode());
        assertFalse(Files.exists(invocation.storagePath()));
        assertFalse(Files.exists(invocation.reportPath()));
        assertFalse(Files.exists(invocation.reportPath().resolveSibling(invocation.reportPath().getFileName() + ".tmp")));
    }

    @Test
    void returnsReportWriteFailureWithoutReportOutputWhenTemporaryCreationFails() throws Exception {
        assertReportWriterFailureLeavesNoReport((temporary, out, content) -> {
            assertFalse(Files.exists(temporary));
            throw new IOException("Controlled temporary creation failure.");
        });
    }

    @Test
    void returnsReportWriteFailureWithoutReportOutputWhenTemporaryWriteFails() throws Exception {
        assertReportWriterFailureLeavesNoReport((temporary, out, content) -> {
            Files.writeString(temporary, "partial", java.nio.file.StandardOpenOption.CREATE_NEW);
            throw new IOException("Controlled temporary write failure.");
        });
    }

    @Test
    void returnsReportWriteFailureWithoutReportOutputWhenTemporaryFsyncFails() throws Exception {
        assertReportWriterFailureLeavesNoReport((temporary, out, content) -> {
            Files.writeString(temporary, content, java.nio.file.StandardOpenOption.CREATE_NEW);
            throw new IOException("Controlled temporary fsync failure.");
        });
    }

    @Test
    void returnsReportWriteFailureWithoutReportOutputWhenAtomicRenameFails() throws Exception {
        assertReportWriterFailureLeavesNoReport((temporary, out, content) -> {
            Files.writeString(temporary, content, java.nio.file.StandardOpenOption.CREATE_NEW);
            throw new IOException("Controlled atomic rename failure.");
        });
    }

    @Test
    void doesNotRetryReportDeliveryAfterAtomicRenameFailureAndCleansMaterializedStorage() throws Exception {
        Invocation invocation = invocation();
        AtomicInteger writes = new AtomicInteger();
        GoldenFixtureMaterializerRunner.MaterializationReportWriter writer = (temporary, out, content) -> {
            if (writes.getAndIncrement() == 0) {
                Files.writeString(temporary, content, java.nio.file.StandardOpenOption.CREATE_NEW);
                throw new IOException("Controlled one-time atomic rename failure.");
            }
            GoldenFixtureMaterializerRunner.writeReportAtomically(temporary, out, content);
        };

        GoldenFixtureMaterializerRunner runner = runner(invocation, true, true, null, null, writer);
        runner.run(null);

        assertEquals(4, runner.getExitCode());
        assertEquals(1, writes.get());
        assertFalse(Files.exists(invocation.storagePath()));
        assertFalse(Files.exists(invocation.reportPath()));
        assertFalse(Files.exists(invocation.reportPath().resolveSibling(invocation.reportPath().getFileName() + ".tmp")));
    }

    @Test
    void returnsReportEngineFailureWithoutReportOutputAndCleansMaterializedStorage() throws Exception {
        Invocation invocation = invocation();
        AtomicInteger encodes = new AtomicInteger();
        GoldenFixtureMaterializerRunner.ReportPayloadEncoder encoder = (objectMapper, report) -> {
            encodes.incrementAndGet();
            throw new IllegalStateException("Controlled report engine failure.");
        };

        GoldenFixtureMaterializerRunner runner = runner(invocation, true, true, null, null, null, encoder);
        runner.run(null);

        assertEquals(4, runner.getExitCode());
        assertEquals(1, encodes.get());
        assertFalse(Files.exists(invocation.storagePath()));
        assertFalse(Files.exists(invocation.reportPath()));
        assertFalse(Files.exists(invocation.reportPath().resolveSibling(invocation.reportPath().getFileName() + ".tmp")));
    }

    @Test
    void convertsMaterializedReportSchemaViolationIntoBlockedReportWithRealFixtureIdentity() throws Exception {
        Invocation invocation = invocation();
        GoldenFixtureMaterializerRunner.ReportPayloadEncoder encoder = (objectMapper, report) -> {
            if ("MATERIALIZED".equals(report.get("report_status"))) {
                report.remove("checks");
                report.put("report_payload_sha256", Rfc8785JsonCanonicalizer.sha256(report));
            }
            return GoldenFixtureMaterializerRunner.encodeReportPayload(objectMapper, report);
        };

        GoldenFixtureMaterializerRunner runner = runner(invocation, true, true, null, null, null, encoder);
        runner.run(null);

        assertEquals(3, runner.getExitCode());
        assertFalse(Files.exists(invocation.storagePath()));
        JsonNode report = mapper.readTree(Files.readAllBytes(invocation.reportPath()));
        assertEquals("BLOCKED", report.required("report_status").asText());
        assertEquals("GFM_REPORT_CONTENT_INVALID", report.required("primary_failure").required("code").asText());
        assertEquals("model.golden.proc", report.required("fixture_identity").required("model_id").asText());
        assertFalse(report.has("materialized_identity"));
        assertFalse(report.has("target_storage"));
        assertFalse(report.has("persistence"));
    }

    @Test
    void validatesGeneratedReportAndRejectsExtraFieldsFixedCountsAndPayloadTampering() throws Exception {
        Invocation invocation = invocation();
        AtomicReference<String> content = new AtomicReference<>();
        GoldenFixtureMaterializerRunner runner = runner(invocation, true, true, null, null,
                (temporary, out, value) -> content.set(value));
        runner.run(null);

        assertEquals(0, runner.getExitCode());
        MaterializationReportSchemaValidator.validate(content.get());

        JsonNode extraField = mapper.readTree(content.get());
        ((com.fasterxml.jackson.databind.node.ObjectNode) extraField).put("extra", true);
        assertContentInvalid(extraField);

        JsonNode wrongCount = mapper.readTree(content.get());
        ((com.fasterxml.jackson.databind.node.ObjectNode) wrongCount.required("persistence").required("table_counts")).put("model_head", 0);
        assertContentInvalid(wrongCount);

        JsonNode badPayload = mapper.readTree(content.get());
        ((com.fasterxml.jackson.databind.node.ObjectNode) badPayload).put("report_payload_sha256", "0".repeat(64));
        assertContentInvalid(badPayload);
    }

    @Test
    void writesARealInputBlockedReportWhenStorageFailsAfterFixtureAcceptance() throws Exception {
        Invocation invocation = invocation();
        Files.createDirectories(invocation.storagePath());
        Files.writeString(invocation.storagePath().resolve("existing.txt"), "retain");

        GoldenFixtureMaterializerRunner runner = runner(invocation, true);
        runner.run(null);

        assertEquals(3, runner.getExitCode());
        assertEquals("retain", Files.readString(invocation.storagePath().resolve("existing.txt")));
        JsonNode report = mapper.readTree(Files.readAllBytes(invocation.reportPath()));
        assertEquals("BLOCKED", report.required("report_status").asText());
        assertEquals("model.golden.proc", report.required("fixture_identity").required("model_id").asText());
        List<JsonNode> checks = new ArrayList<>();
        report.required("checks").forEach(checks::add);
        for (int index = 0; index < 9; index++) assertEquals("PASSED", checks.get(index).required("status").asText(), "check index=" + index);
        assertEquals("FAILED", checks.get(9).required("status").asText());
        assertEquals("GFM_TARGET_STORAGE_NOT_EMPTY", checks.get(9).required("code").asText());
    }

    @Test
    void cleansOnlyThisInvocationStorageBeforeWritingABlockedReport() throws Exception {
        Invocation invocation = invocation();
        GoldenFixtureMaterializerRunner runner = runner(invocation, true, true,
                (storageRoot, fixture, fixtureSha256, epoch) -> {
                    Files.createDirectories(storageRoot.resolve("projects").resolve("partial"));
                    Files.writeString(storageRoot.resolve("projects").resolve("partial").resolve("project.db"), "partial");
                    throw new GoldenFixtureMaterializationException("GFM_STORAGE_WRITE_FAILED", "Controlled storage failure.");
                },
                null);

        runner.run(null);

        assertEquals(3, runner.getExitCode());
        assertFalse(Files.exists(invocation.storagePath()));
        JsonNode report = mapper.readTree(Files.readAllBytes(invocation.reportPath()));
        assertEquals("GFM_STORAGE_WRITE_FAILED", report.required("primary_failure").required("code").asText());
        assertEquals(1, report.required("failures").size());
        for (JsonNode check : report.required("checks")) assertEquals("PASSED", check.required("status").asText());
    }

    @Test
    void retainsAnInitiallyEmptyStorageDirectoryWhileRemovingOnlyThisInvocationContent() throws Exception {
        Invocation invocation = invocation();
        Files.createDirectories(invocation.storagePath());
        GoldenFixtureMaterializerRunner runner = runner(invocation, true, true,
                (storageRoot, fixture, fixtureSha256, epoch) -> {
                    Files.createDirectories(storageRoot.resolve("projects").resolve("partial"));
                    Files.writeString(storageRoot.resolve("projects").resolve("partial").resolve("project.db"), "partial");
                    throw new GoldenFixtureMaterializationException("GFM_STORAGE_WRITE_FAILED", "Controlled storage failure.");
                },
                null);

        runner.run(null);

        assertEquals(3, runner.getExitCode());
        assertTrue(Files.isDirectory(invocation.storagePath()));
        try (var contents = Files.list(invocation.storagePath())) {
            assertTrue(contents.findAny().isEmpty());
        }
    }

    @Test
    void preservesTheOriginalFailureAndAppendsCleanupFailureWhenCleanupCannotComplete() throws Exception {
        Invocation invocation = invocation();
        GoldenFixtureMaterializerRunner runner = runner(invocation, true, true,
                (storageRoot, fixture, fixtureSha256, epoch) -> {
                    Files.createDirectories(storageRoot.resolve("projects").resolve("partial"));
                    Files.writeString(storageRoot.resolve("projects").resolve("partial").resolve("project.db"), "partial");
                    throw new GoldenFixtureMaterializationException("GFM_STORAGE_WRITE_FAILED", "Controlled storage failure.");
                },
                (storageRoot, existedAtCheck) -> { throw new IOException("Controlled cleanup failure."); });

        runner.run(null);

        assertEquals(3, runner.getExitCode());
        assertTrue(Files.isRegularFile(invocation.storagePath().resolve("projects").resolve("partial").resolve("project.db")));
        JsonNode report = mapper.readTree(Files.readAllBytes(invocation.reportPath()));
        assertEquals("GFM_STORAGE_WRITE_FAILED", report.required("primary_failure").required("code").asText());
        assertEquals("GFM_STORAGE_WRITE_FAILED", report.required("failures").get(0).required("code").asText());
        assertEquals("GFM_CLEANUP_FAILED", report.required("failures").get(1).required("code").asText());
    }

    private GoldenFixtureMaterializerRunner runner(Invocation invocation, boolean enabled) {
        return runner(invocation, enabled, true);
    }

    private GoldenFixtureMaterializerRunner runner(Invocation invocation, boolean enabled, boolean modeOnCommandLine) {
        return runner(invocation, enabled, modeOnCommandLine, null, null);
    }

    private GoldenFixtureMaterializerRunner runner(Invocation invocation, boolean enabled, boolean modeOnCommandLine,
                                                   GoldenFixtureMaterializerRunner.FixtureMaterializer materializer,
                                                   GoldenFixtureMaterializerRunner.StorageCleaner cleaner) {
        return runner(invocation, enabled, modeOnCommandLine, materializer, cleaner, null);
    }

    private GoldenFixtureMaterializerRunner runner(Invocation invocation, boolean enabled, boolean modeOnCommandLine,
                                                   GoldenFixtureMaterializerRunner.FixtureMaterializer materializer,
                                                   GoldenFixtureMaterializerRunner.StorageCleaner cleaner,
                                                   GoldenFixtureMaterializerRunner.MaterializationReportWriter reportWriter) {
        return runner(invocation, enabled, modeOnCommandLine, materializer, cleaner, reportWriter, null);
    }

    private GoldenFixtureMaterializerRunner runner(Invocation invocation, boolean enabled, boolean modeOnCommandLine,
                                                   GoldenFixtureMaterializerRunner.FixtureMaterializer materializer,
                                                   GoldenFixtureMaterializerRunner.StorageCleaner cleaner,
                                                   GoldenFixtureMaterializerRunner.MaterializationReportWriter reportWriter,
                                                   GoldenFixtureMaterializerRunner.ReportPayloadEncoder reportPayloadEncoder) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("release-golden-authoring");
        if (!modeOnCommandLine) environment.withProperty("opm.runtime.mode", "RELEASE_GOLDEN_FIXTURE_MATERIALIZE");
        MockPropertySource commandLine = new MockPropertySource("commandLineArgs")
                .withProperty("spring.main.web-application-type", "none")
                .withProperty("opm.release-authoring.materializer.enabled", Boolean.toString(enabled))
                .withProperty("opm.release-authoring.contract-version", "0.1.0")
                .withProperty("opm.release-authoring.capture-plan", invocation.planPath().toString())
                .withProperty("opm.release-authoring.evidence-bundle", invocation.bundlePath().toString())
                .withProperty("opm.release-authoring.fixture-ref-key", invocation.key())
                .withProperty("opm.release-authoring.expected-runtime-jar-sha256", invocation.jarSha256())
                .withProperty("opm.storage.root", invocation.storagePath().toString())
                .withProperty("opm.release-authoring.report-out", invocation.reportPath().toString())
                .withProperty("opm.release-authoring.source-date-epoch", "1782864000");
        if (modeOnCommandLine) commandLine.withProperty("opm.runtime.mode", "RELEASE_GOLDEN_FIXTURE_MATERIALIZE");
        environment.getPropertySources().addFirst(commandLine);
        GoldenFixtureMaterializerRunner.FixtureMaterializer selectedMaterializer = materializer == null
                ? (storageRoot, fixture, fixtureSha256, epoch) -> new GoldenFixtureSeedRepository().materialize(storageRoot, fixture, fixtureSha256, epoch)
                : materializer;
        GoldenFixtureMaterializerRunner.StorageCleaner selectedCleaner = cleaner == null
                ? GoldenFixtureMaterializerRunner::cleanupStorage : cleaner;
        GoldenFixtureMaterializerRunner.MaterializationReportWriter selectedReportWriter = reportWriter == null
                ? GoldenFixtureMaterializerRunner::writeReportAtomically : reportWriter;
        if (reportPayloadEncoder == null) return new GoldenFixtureMaterializerRunner(environment, invocation::runtimeJar, selectedMaterializer, selectedCleaner,
                () -> new PeakRssMonitor() {
                    @Override public long peakBytes() { return 64L * 1024L * 1024L; }
                    @Override public void close() { }
                }, selectedReportWriter);
        return new GoldenFixtureMaterializerRunner(environment, invocation::runtimeJar, selectedMaterializer, selectedCleaner,
                () -> new PeakRssMonitor() {
                    @Override public long peakBytes() { return 64L * 1024L * 1024L; }
                    @Override public void close() { }
                }, selectedReportWriter, reportPayloadEncoder);
    }

    private void assertReportWriterFailureLeavesNoReport(GoldenFixtureMaterializerRunner.MaterializationReportWriter writer) throws Exception {
        Invocation invocation = invocation();
        @SuppressWarnings("unchecked")
        Map<String, Object> planBinding = (Map<String, Object>) invocation.plan().get("active_binding");
        planBinding.put("binding_digest", "0".repeat(64));
        Files.writeString(invocation.planPath(), mapper.writeValueAsString(invocation.plan()));

        GoldenFixtureMaterializerRunner runner = runner(invocation, true, true, null, null, writer);
        runner.run(null);

        assertEquals(4, runner.getExitCode());
        assertFalse(Files.exists(invocation.storagePath()));
        assertFalse(Files.exists(invocation.reportPath()));
        assertFalse(Files.exists(invocation.reportPath().resolveSibling(invocation.reportPath().getFileName() + ".tmp")));
    }

    private void assertContentInvalid(JsonNode value) {
        GoldenFixtureMaterializationException exception = assertThrows(GoldenFixtureMaterializationException.class,
                () -> MaterializationReportSchemaValidator.validate(mapper.writeValueAsString(value)));
        assertEquals("GFM_REPORT_CONTENT_INVALID", exception.code());
    }

    private Invocation invocation() throws Exception {
        return invocation(Files.readAllBytes(fixturePath("g-opl-proc-001-consumption-object-pass.json")));
    }

    private Invocation invocation(byte[] fixture) throws Exception {
        Path root = temporaryDirectory.resolve("materialization");
        Path reports = root.resolve("reports");
        Files.createDirectories(reports);
        Path runtimeJar = temporaryDirectory.resolve("local-runtime.jar");
        Files.writeString(runtimeJar, "controlled-runtime-jar");
        Path bundle = temporaryDirectory.resolve("evidence-bundle.zip");
        try (OutputStream output = Files.newOutputStream(bundle); ZipOutputStream zip = new ZipOutputStream(output)) {
            zip.putNextEntry(new ZipEntry("fixtures/target.json"));
            zip.write(fixture);
            zip.closeEntry();
        }

        String bundleSha = sha256(Files.readAllBytes(bundle));
        Map<String, Object> targetRef = archiveRef("inputs/target.json", fixture.length, sha256(fixture), bundleSha, "fixtures/target.json");
        List<Object> captures = new ArrayList<>();
        for (int fixtureIndex = 0; fixtureIndex < 130; fixtureIndex++) {
            Map<String, Object> ref = fixtureIndex == 0 ? targetRef : archiveRef("inputs/family-" + fixtureIndex + ".json", 1, "a".repeat(64), bundleSha, "fixtures/family-" + fixtureIndex + ".json");
            for (int occurrence = 0; occurrence < 9; occurrence++) captures.add(Map.of("capture_kind", "FAMILY", "fixture_ref", ref));
        }
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
        String key = Rfc8785JsonCanonicalizer.sha256(targetRef);
        return new Invocation(root, plan, planPath, bundle, runtimeJar, sha256(Files.readAllBytes(runtimeJar)), key,
                root.resolve("fixtures").resolve(key).resolve("storage"), reports.resolve(key + ".json"));
    }

    private Map<String, Object> fileRef(String kind, Path file) throws Exception {
        return Map.of("kind", kind, "path", file.getFileName().toString(), "byte_length", Files.size(file), "sha256", sha256(Files.readAllBytes(file)));
    }

    private void assertFileRefEquals(Map<String, Object> expected, JsonNode actual) {
        assertEquals(expected.get("kind"), actual.required("kind").asText());
        assertEquals(expected.get("path"), actual.required("path").asText());
        assertEquals(((Number) expected.get("byte_length")).longValue(), actual.required("byte_length").asLong());
        assertEquals(expected.get("sha256"), actual.required("sha256").asText());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> cast(Object value) {
        return (Map<String, Object>) value;
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

    private record Invocation(Path root, Map<String, Object> plan, Path planPath, Path bundlePath, Path runtimeJar, String jarSha256,
                              String key, Path storagePath, Path reportPath) { }
}
