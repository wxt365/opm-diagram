package org.opm.localruntime.releaseauthoring;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.LocalRuntimeApplication;
import org.opm.localruntime.application.RuntimeActiveBindingProvider;
import org.opm.localruntime.semantic.SemanticRevisionReader;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ExitCodeGenerator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertySource;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** release-golden-authoring 非 Web 进程的单 fixture 物化入口。 */
@Component
@Profile("release-golden-authoring")
@Conditional(ReleaseGoldenAuthoringCondition.class)
public final class GoldenFixtureMaterializerRunner implements ApplicationRunner, ExitCodeGenerator {

    private final ConfigurableEnvironment environment;
    private final RuntimeJarLocator runtimeJarLocator;
    private final FixtureMaterializer fixtureMaterializer;
    private final StorageCleaner storageCleaner;
    private final PeakRssMonitorFactory rssMonitorFactory;
    private final MaterializationReportWriter reportWriter;
    private final ReportPayloadEncoder reportPayloadEncoder;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private volatile int exitCode = 4;

    @Autowired
    public GoldenFixtureMaterializerRunner(ConfigurableEnvironment environment) {
        this(environment, GoldenFixtureMaterializerRunner::runtimeJarFromCodeSource,
                (storageRoot, fixture, fixtureSha256, epoch) -> new GoldenFixtureSeedRepository().materialize(storageRoot, fixture, fixtureSha256, epoch),
                GoldenFixtureMaterializerRunner::cleanupStorage, MacosPeakRssMonitor::start,
                GoldenFixtureMaterializerRunner::writeReportAtomically, GoldenFixtureMaterializerRunner::encodeReportPayload);
    }

    GoldenFixtureMaterializerRunner(ConfigurableEnvironment environment, RuntimeJarLocator runtimeJarLocator) {
        this(environment, runtimeJarLocator,
                (storageRoot, fixture, fixtureSha256, epoch) -> new GoldenFixtureSeedRepository().materialize(storageRoot, fixture, fixtureSha256, epoch),
                GoldenFixtureMaterializerRunner::cleanupStorage, MacosPeakRssMonitor::start,
                GoldenFixtureMaterializerRunner::writeReportAtomically, GoldenFixtureMaterializerRunner::encodeReportPayload);
    }

    GoldenFixtureMaterializerRunner(ConfigurableEnvironment environment, RuntimeJarLocator runtimeJarLocator,
                                    FixtureMaterializer fixtureMaterializer, StorageCleaner storageCleaner) {
        this(environment, runtimeJarLocator, fixtureMaterializer, storageCleaner, MacosPeakRssMonitor::start,
                GoldenFixtureMaterializerRunner::writeReportAtomically, GoldenFixtureMaterializerRunner::encodeReportPayload);
    }

    GoldenFixtureMaterializerRunner(ConfigurableEnvironment environment, RuntimeJarLocator runtimeJarLocator,
                                    FixtureMaterializer fixtureMaterializer, StorageCleaner storageCleaner,
                                    PeakRssMonitorFactory rssMonitorFactory) {
        this(environment, runtimeJarLocator, fixtureMaterializer, storageCleaner, rssMonitorFactory,
                GoldenFixtureMaterializerRunner::writeReportAtomically, GoldenFixtureMaterializerRunner::encodeReportPayload);
    }

    GoldenFixtureMaterializerRunner(ConfigurableEnvironment environment, RuntimeJarLocator runtimeJarLocator,
                                    FixtureMaterializer fixtureMaterializer, StorageCleaner storageCleaner,
                                    PeakRssMonitorFactory rssMonitorFactory, MaterializationReportWriter reportWriter) {
        this(environment, runtimeJarLocator, fixtureMaterializer, storageCleaner, rssMonitorFactory, reportWriter,
                GoldenFixtureMaterializerRunner::encodeReportPayload);
    }

    GoldenFixtureMaterializerRunner(ConfigurableEnvironment environment, RuntimeJarLocator runtimeJarLocator,
                                    FixtureMaterializer fixtureMaterializer, StorageCleaner storageCleaner,
                                    PeakRssMonitorFactory rssMonitorFactory, MaterializationReportWriter reportWriter,
                                    ReportPayloadEncoder reportPayloadEncoder) {
        this.environment = environment;
        this.runtimeJarLocator = runtimeJarLocator;
        this.fixtureMaterializer = fixtureMaterializer;
        this.storageCleaner = storageCleaner;
        this.rssMonitorFactory = rssMonitorFactory;
        this.reportWriter = reportWriter;
        this.reportPayloadEncoder = reportPayloadEncoder;
    }

    @Override
    public void run(ApplicationArguments ignored) {
        ReportContext reportContext = null;
        StorageTarget storageTarget = null;
        int passedPreflightChecks = 0;
        boolean materializationStarted = false;
        long invocationStarted = System.nanoTime();
        PeakRssMonitor rssMonitor = null;
        try {
            Arguments args = commandLineArguments();
            verifyMode();
            passedPreflightChecks = 1;
            verifyArguments(args);
            passedPreflightChecks = 2;
            Map<String, Object> plan = objectMapper.readValue(Files.readAllBytes(args.capturePlan()), new TypeReference<>() { });
            verifyRuntimeJar(args, map(plan, "runtime_jar_ref"));
            passedPreflightChecks = 3;
            verifyPlan(plan, args);
            passedPreflightChecks = 4;
            Map<String, Object> fixtureRef = fixtureRef(plan, args.fixtureRefKey());
            passedPreflightChecks = 5;
            verifyFile(args.evidenceBundle(), map(plan, "input_materialization", "bundle_ref"), "GFM_BUNDLE_REF_MISMATCH");
            passedPreflightChecks = 6;
            verifyArchive(args.evidenceBundle(), fixtureRef);
            passedPreflightChecks = 7;
            byte[] fixture = readFixture(args.evidenceBundle(), fixtureRef);
            passedPreflightChecks = 8;
            reportContext = new ReportContext(args, plan, fixtureRef, fixture);
            rssMonitor = rssMonitorFactory.start();
            verifyBinding(plan, fixture);
            passedPreflightChecks = 9;
            storageTarget = verifyStorage(args);
            passedPreflightChecks = 10;
            materializationStarted = true;
            GoldenFixtureSeedRepository.MaterializedFixture result = fixtureMaterializer.materialize(args.storageRoot(), fixture, string(fixtureRef.get("sha256")), args.epoch());
            writeSuccess(args, plan, fixtureRef, fixture, result, elapsedMicros(invocationStarted), rssMonitor.peakBytes());
            exitCode = 0;
        } catch (GoldenFixtureMaterializationException exception) {
            exitCode = GoldenFixtureMaterializationException.exitCodeFor(exception.code());
            String errorCode = exception.code();
            if (isUnreportableReportFailure(exception.code())) {
                cleanupFailures(exception, storageTarget, materializationStarted);
            } else {
                try {
                    writeBlockedIfPossible(exception, reportContext, passedPreflightChecks,
                            cleanupFailures(exception, storageTarget, materializationStarted));
                } catch (Exception reportException) {
                    exitCode = 4;
                    errorCode = "GFM_REPORT_WRITE_FAILED";
                }
            }
            System.err.println(errorCode);
        } catch (Exception exception) {
            exitCode = 4;
            String errorCode = "GFM_INTERNAL_ERROR";
            try {
                GoldenFixtureMaterializationException failure = new GoldenFixtureMaterializationException("GFM_INTERNAL_ERROR", "Materializer failed.", exception);
                writeBlockedIfPossible(failure, reportContext, passedPreflightChecks,
                        cleanupFailures(failure, storageTarget, materializationStarted));
            } catch (Exception reportException) {
                exitCode = 4;
                errorCode = "GFM_REPORT_WRITE_FAILED";
            }
            System.err.println(errorCode);
        } finally {
            if (rssMonitor != null) rssMonitor.close();
        }
    }

    @Override
    public int getExitCode() {
        return exitCode;
    }

    private Arguments commandLineArguments() {
        PropertySource<?> source = environment.getPropertySources().get("commandLineArgs");
        if (source == null) throw failure("GFM_ARGUMENT_INVALID", "Required authoring options must originate from command line.");
        return new Arguments(path(source, "opm.release-authoring.capture-plan"), path(source, "opm.release-authoring.evidence-bundle"),
                text(source, "opm.release-authoring.fixture-ref-key"), text(source, "opm.release-authoring.expected-runtime-jar-sha256"),
                path(source, "opm.storage.root"), path(source, "opm.release-authoring.report-out"), integer(source, "opm.release-authoring.source-date-epoch"));
    }

    private void verifyMode() {
        ReleaseGoldenAuthoringGuard.require(environment);
    }

    private void verifyArguments(Arguments args) {
        Path reportDirectory = args.reportOut().getParent();
        if (reportDirectory == null || args.storageRoot().getParent() == null || args.storageRoot().getParent().getParent() == null || args.storageRoot().getParent().getParent().getParent() == null) {
            throw failure("GFM_ARGUMENT_INVALID", "Materialization paths are incomplete.");
        }
        Path root = args.storageRoot().getParent().getParent().getParent();
        if (!reportDirectory.equals(root.resolve("reports")) || !args.reportOut().getFileName().toString().equals(args.fixtureRefKey() + ".json")) {
            throw failure("GFM_ARGUMENT_INVALID", "Report path must be under the Materialization root reports directory.");
        }
        if (Files.exists(args.reportOut())) throw failure("GFM_REPORT_EXISTS", "Report path already exists.");
    }

    private void verifyPlan(Map<String, Object> plan, Arguments args) {
        if (!"OPM-DEV-CANVAS-06-GOLDEN-CAPTURE-PLAN-001".equals(string(plan.get("schema_id"))) || !"0.1".equals(string(plan.get("schema_version"))) || !"READY_FOR_AUTHORING".equals(string(plan.get("plan_status"))) || integer(plan.get("source_date_epoch")) != args.epoch()) throw failure("GFM_PLAN_INVALID", "Capture Plan is invalid or mismatched.");
    }

    private Map<String, Object> fixtureRef(Map<String, Object> plan, String key) {
        Map<String, Map<String, Object>> distinct = new LinkedHashMap<>();
        Map<String, Integer> occurrences = new LinkedHashMap<>();
        int familyCount = 0;
        for (Object value : list(plan.get("captures"))) {
            Map<String, Object> capture = cast(value);
            if (!"FAMILY".equals(string(capture.get("capture_kind")))) continue;
            familyCount++;
            Map<String, Object> ref = cast(capture.get("fixture_ref"));
            if (!archiveRef(ref)) throw failure("GFM_FIXTURE_SET_MISMATCH", "Family fixture ref must be an archive entry ref.");
            String refKey = sha256(canonical(ref));
            if (distinct.putIfAbsent(refKey, ref) != null && !canonical(distinct.get(refKey)).equals(canonical(ref))) throw failure("GFM_FIXTURE_SET_MISMATCH", "Fixture key collision.");
            occurrences.merge(refKey, 1, Integer::sum);
        }
        if (familyCount != 1170 || distinct.size() != 130 || occurrences.values().stream().anyMatch(value -> value != 9)) throw failure("GFM_FIXTURE_SET_MISMATCH", "Plan fixture occurrence count is invalid.");
        if (!distinct.containsKey(key)) throw failure("GFM_FIXTURE_NOT_IN_PLAN", "Fixture ref key is not an exact Plan member.");
        return distinct.get(key);
    }

    private void verifyRuntimeJar(Arguments args, Map<String, Object> expected) throws Exception {
        Path codeSource = runtimeJar();
        if (!string(expected.get("sha256")).equals(args.expectedRuntimeJarSha256())) throw failure("GFM_RUNTIME_JAR_MISMATCH", "Runtime JAR identity differs from command line expectation.");
        verifyFile(codeSource, expected, "GFM_RUNTIME_JAR_MISMATCH");
    }

    private void verifyArchive(Path bundle, Map<String, Object> ref) throws Exception {
        String entryName = string(ref.get("archive_entry_path"));
        if (!safeArchivePath(entryName)) throw failure("GFM_ARCHIVE_ENTRY_UNSAFE", "Archive entry path is unsafe.");
        try (ZipFile zip = new ZipFile(bundle.toFile())) {
            ZipEntry entry = zip.getEntry(entryName);
            long matchingEntries = zip.stream().filter(candidate -> entryName.equals(candidate.getName())).count();
            if (entry == null || entry.isDirectory() || matchingEntries != 1) throw failure("GFM_ARCHIVE_ENTRY_UNSAFE", "Fixture archive entry is absent, a directory, or duplicated.");
        }
    }

    private byte[] readFixture(Path bundle, Map<String, Object> ref) throws Exception {
        String entryName = string(ref.get("archive_entry_path"));
        try (ZipFile zip = new ZipFile(bundle.toFile())) {
            ZipEntry entry = zip.getEntry(entryName);
            if (entry == null || entry.getSize() != number(ref.get("byte_length"))) throw failure("GFM_FIXTURE_REF_MISMATCH", "Fixture archive entry differs from ref.");
            byte[] bytes = zip.getInputStream(entry).readAllBytes();
            if (!sha256(bytes).equals(string(ref.get("sha256")))) throw failure("GFM_FIXTURE_REF_MISMATCH", "Fixture archive bytes differ from ref.");
            verifyFixtureIdentity(bytes);
            return bytes;
        }
    }

    private void verifyFixtureIdentity(byte[] fixture) {
        try {
            String text = new String(fixture, java.nio.charset.StandardCharsets.UTF_8);
            if (!java.util.Arrays.equals(fixture, text.getBytes(java.nio.charset.StandardCharsets.UTF_8))) {
                throw failure("GFM_FIXTURE_REF_MISMATCH", "Fixture is not valid UTF-8.");
            }
            JsonNode root = objectMapper.readTree(fixture);
            if (root == null || !root.isObject() || !"MS-REV-001".equals(root.path("schema_id").asText()) || !"0.2".equals(root.path("schema_version").asText())) {
                throw failure("GFM_FIXTURE_SCHEMA_UNSUPPORTED", "Fixture schema must be MS-REV-001/0.2.");
            }
            new SemanticRevisionReader().read(new ByteArrayInputStream(fixture));
        } catch (GoldenFixtureMaterializationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw failure("GFM_FIXTURE_SCHEMA_UNSUPPORTED", "Fixture does not satisfy the MS-REV-001/0.2 contract.");
        }
    }

    private void verifyBinding(Map<String, Object> plan, byte[] fixture) throws Exception {
        JsonNode fixtureBinding = objectMapper.readTree(fixture).required("profile_binding");
        Map<String, Object> fixtureValue = normalizedBinding(objectMapper.convertValue(fixtureBinding, new TypeReference<Map<String, Object>>() { }));
        if (!canonical(normalizedBinding(map(plan, "active_binding"))).equals(canonical(fixtureValue))
                || !canonical(fixtureValue).equals(canonical(binding()))) {
            throw failure("GFM_BINDING_MISMATCH", "Fixture, Plan, and active Runtime bindings must match.");
        }
    }

    private Map<String, Object> normalizedBinding(Map<String, Object> value) {
        return Map.of("profile", normalizedAsset(cast(value.get("profile"))), "rule_set", normalizedAsset(cast(value.get("rule_set"))),
                "text_grammar", normalizedAsset(cast(value.get("text_grammar"))), "symbol_catalog", normalizedAsset(cast(value.get("symbol_catalog"))),
                "normalization_adapter", normalizedAsset(cast(value.get("normalization_adapter"))), "binding_digest", normalizedDigest(value.get("binding_digest")));
    }

    private Map<String, Object> normalizedAsset(Map<String, Object> value) {
        return Map.of("id", string(value.get("id")), "version", string(value.get("version")), "sha256", normalizedDigest(value.containsKey("sha256") ? value.get("sha256") : value.get("digest")));
    }

    private String normalizedDigest(Object value) {
        if (value instanceof String digest && !digest.isBlank()) return digest;
        Map<String, Object> digest = cast(value);
        if (!"sha256".equals(string(digest.get("algorithm"))) || string(digest.get("digest")).isBlank()) {
            throw failure("GFM_BINDING_MISMATCH", "Binding digest is invalid.");
        }
        return string(digest.get("digest"));
    }

    private StorageTarget verifyStorage(Arguments args) throws Exception {
        Path root = args.storageRoot().getParent().getParent().getParent();
        Path expectedStorage = root.resolve("fixtures").resolve(args.fixtureRefKey()).resolve("storage");
        if (!args.storageRoot().equals(expectedStorage) || Files.isSymbolicLink(args.storageRoot())) {
            throw failure("GFM_TARGET_STORAGE_UNSAFE", "Storage path is outside the Materialization root or is a symbolic link.");
        }
        boolean existedAtCheck = Files.exists(args.storageRoot());
        if (existedAtCheck) {
            if (!Files.isDirectory(args.storageRoot())) throw failure("GFM_TARGET_STORAGE_UNSAFE", "Storage target is not a directory.");
            try (var paths = Files.list(args.storageRoot())) {
                if (paths.findAny().isPresent()) throw failure("GFM_TARGET_STORAGE_NOT_EMPTY", "Storage target must be empty.");
            }
        }
        return new StorageTarget(args.storageRoot(), existedAtCheck);
    }

    private void writeSuccess(Arguments args, Map<String, Object> plan, Map<String, Object> ref, byte[] fixture, GoldenFixtureSeedRepository.MaterializedFixture fixtureResult, long preflightMicros, long peakRssBytes) throws Exception {
        long reportStarted = System.nanoTime();
        Map<String, Object> report = baseReport(args, plan, ref, fixture);
        report.put("report_status", "MATERIALIZED");
        report.put("checks", checks("PASSED", null)); report.put("failures", List.of());
        report.put("materialized_identity", Map.of("project_id", fixtureResult.projectId(), "model_id", fixtureResult.modelId(), "revision_id", fixtureResult.revisionId(), "revision_sequence", fixtureResult.revisionSequence(), "draft_head_revision_id", fixtureResult.revisionId(), "head_sequence", fixtureResult.revisionSequence(), "history_mode", fixtureResult.historyMode()));
        Path root = args.storageRoot().getParent().getParent().getParent(); Path database = fixtureResult.databasePath();
        report.put("target_storage", Map.of("storage_root", root.relativize(args.storageRoot()).toString(), "database_ref", fileRef("DATABASE", root, database), "storage_schema_version", "1.0", "database_sha256", sha256(Files.readAllBytes(database)), "semantic_state_sha256", sha256(canonical(Map.of("storage_schema_version", "1.0", "project_id", fixtureResult.projectId(), "model_id", fixtureResult.modelId(), "revision_id", fixtureResult.revisionId(), "revision_sequence", fixtureResult.revisionSequence(), "draft_head_revision_id", fixtureResult.revisionId(), "head_sequence", fixtureResult.revisionSequence(), "profile_binding", report.get("runtime_binding"), "document_sha256", ref.get("sha256"), "table_counts", fixtureResult.tableCounts())))));
        GoldenFixtureSeedRepository.StageDurations durations = fixtureResult.stageDurations();
        report.put("persistence", Map.of("transaction_status", "COMMITTED", "table_counts", fixtureResult.tableCounts(), "integrity_check", "ok", "foreign_key_check", 0, "reopen_matched", true, "sidecar_absent", true, "stage_durations_us", Map.of("preflight", preflightMicros, "migration", durations.migrationMicros(), "seed", durations.seedMicros(), "verify", durations.verifyMicros(), "report", elapsedMicros(reportStarted)), "peak_rss_bytes", peakRssBytes));
        writeReport(args.reportOut(), report);
    }

    private Map<String, Object> baseReport(Arguments args, Map<String, Object> plan, Map<String, Object> ref, byte[] fixture) throws Exception {
        String key = args.fixtureRefKey(); String change = string(plan.get("change_id")); JsonNode root = objectMapper.readTree(fixture);
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("schema_id", "OPM-DEV-CANVAS-06-GOLDEN-FIXTURE-MATERIALIZATION-REPORT-001"); report.put("schema_version", "0.1");
        report.put("report_id", "dev-canvas-06.fixture-materialization." + change + "." + key); report.put("report_version", "0.1.0"); report.put("change_id", change); report.put("materialization_id", report.get("report_id")); report.put("generated_at", Instant.ofEpochSecond(args.epoch()).toString()); report.put("source_date_epoch", args.epoch());
        report.put("runner_identity", Map.of("contract_version", "0.1.0", "runtime_jar_ref", map(plan, "runtime_jar_ref"), "java_version", System.getProperty("java.version"), "java_vendor", System.getProperty("java.vendor"), "command", "java -jar local-runtime.jar"));
        report.put("capture_plan_ref", fileRef("CAPTURE_PLAN", args.capturePlan().getParent(), args.capturePlan())); report.put("evidence_bundle_ref", map(plan, "input_materialization", "bundle_ref")); report.put("source_fixture_ref", ref); report.put("fixture_ref_key", key); report.put("runtime_binding", binding());
        Map<String, Object> fixtureIdentity = new LinkedHashMap<>();
        fixtureIdentity.put("schema_id", root.required("schema_id").asText()); fixtureIdentity.put("schema_version", root.required("schema_version").asText());
        fixtureIdentity.put("model_id", root.required("model_id").asText()); fixtureIdentity.put("revision_id", root.required("revision_id").asText());
        fixtureIdentity.put("revision_sequence", root.required("revision_sequence").asInt()); fixtureIdentity.put("parent_revision_id", root.path("parent_revision_id").isMissingNode() ? null : root.path("parent_revision_id").asText());
        fixtureIdentity.put("fixture_sha256", sha256(fixture));
        report.put("fixture_identity", fixtureIdentity);
        return report;
    }

    private static long elapsedMicros(long started) { return Math.max(1L, (System.nanoTime() - started) / 1_000L); }

    private void writeBlockedIfPossible(GoldenFixtureMaterializationException failure, ReportContext context, int passedPreflightChecks,
                                        List<Map<String, Object>> failures) throws Exception {
        // 缺少可复核 fixture 身份的调用不属于可报告 invocation，避免伪造输入身份。
        if (context == null) return;
        Map<String, Object> report = baseReport(context.args(), context.plan(), context.fixtureRef(), context.fixture());
        report.put("report_status", "BLOCKED");
        report.put("checks", checks(passedPreflightChecks, failure.code()));
        Map<String, Object> primaryFailure = failures.getFirst();
        report.put("primary_failure", primaryFailure);
        report.put("failures", failures);
        writeReport(context.args().reportOut(), report);
    }

    private List<Map<String, Object>> cleanupFailures(GoldenFixtureMaterializationException primaryFailure, StorageTarget target,
                                                       boolean materializationStarted) {
        Map<String, Object> primary = Map.of("code", primaryFailure.code(), "message_key", "gfm.blocked");
        if (!materializationStarted || target == null) return List.of(primary);
        try {
            storageCleaner.cleanup(target.storageRoot(), target.existedAtCheck());
            return List.of(primary);
        } catch (Exception exception) {
            return List.of(primary, Map.of("code", "GFM_CLEANUP_FAILED", "message_key", "gfm.cleanup.failed"));
        }
    }

    /** 仅清理由本进程在已验证为空的目标中写出的内容，不跟随符号链接。 */
    static void cleanupStorage(Path storageRoot, boolean existedAtCheck) throws Exception {
        if (!Files.exists(storageRoot)) return;
        if (Files.isSymbolicLink(storageRoot) || !Files.isDirectory(storageRoot)) {
            throw new java.io.IOException("Storage target is no longer a safe directory.");
        }
        Files.walkFileTree(storageRoot, new SimpleFileVisitor<>() {
            @Override
            public java.nio.file.FileVisitResult visitFile(Path file, BasicFileAttributes attributes) throws java.io.IOException {
                Files.delete(file);
                return java.nio.file.FileVisitResult.CONTINUE;
            }

            @Override
            public java.nio.file.FileVisitResult postVisitDirectory(Path directory, java.io.IOException exception) throws java.io.IOException {
                if (exception != null) throw exception;
                if (!directory.equals(storageRoot) || !existedAtCheck) Files.delete(directory);
                return java.nio.file.FileVisitResult.CONTINUE;
            }
        });
        if (Files.exists(storageRoot)) {
            try (var paths = Files.list(storageRoot)) {
                if (paths.findAny().isPresent()) throw new java.io.IOException("Storage cleanup left residual files.");
            }
        }
    }

    private void writeReport(Path out, Map<String, Object> report) {
        Path temporary = out.resolveSibling(out.getFileName() + ".tmp");
        String content;
        try {
            content = reportPayloadEncoder.encode(objectMapper, report);
            MaterializationReportSchemaValidator.validate(content);
        } catch (GoldenFixtureMaterializationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw failure("GFM_REPORT_ENGINE_FAILED", "Cannot construct a verifiable Materialization Report.");
        }
        try {
            reportWriter.write(temporary, out, content);
        } catch (Exception exception) {
            try {
                Files.deleteIfExists(temporary);
            } catch (Exception cleanupException) {
                exception.addSuppressed(cleanupException);
            }
            throw failure("GFM_REPORT_WRITE_FAILED", "Cannot atomically write Materialization Report.");
        }
    }

    static String encodeReportPayload(ObjectMapper objectMapper, Map<String, Object> report) throws Exception {
        report.put("report_payload_sha256", Rfc8785JsonCanonicalizer.sha256(report));
        return objectMapper.writeValueAsString(report) + "\n";
    }

    private boolean isUnreportableReportFailure(String code) {
        return "GFM_REPORT_ENGINE_FAILED".equals(code) || "GFM_REPORT_WRITE_FAILED".equals(code);
    }

    static void writeReportAtomically(Path temporary, Path out, String content) throws Exception {
        ByteBuffer bytes = ByteBuffer.wrap(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        try (FileChannel channel = FileChannel.open(temporary, java.nio.file.StandardOpenOption.CREATE_NEW,
                java.nio.file.StandardOpenOption.WRITE)) {
            while (bytes.hasRemaining()) channel.write(bytes);
            channel.force(true);
        }
        Files.move(temporary, out, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
    }
    private List<Map<String, Object>> checks(String status, String code) { return checks(status == null ? 10 : 0, code); }
    static List<Map<String, Object>> checks(int passedPreflightChecks, String code) {
        String[] ids = {"GFM-CHECK-MODE", "GFM-CHECK-ARGS", "GFM-CHECK-RUNTIME-JAR", "GFM-CHECK-PLAN", "GFM-CHECK-FIXTURE-MEMBERSHIP", "GFM-CHECK-BUNDLE", "GFM-CHECK-ARCHIVE", "GFM-CHECK-FIXTURE", "GFM-CHECK-BINDING", "GFM-CHECK-STORAGE"};
        List<Map<String, Object>> values = new ArrayList<>();
        for (int index = 0; index < ids.length; index++) {
            if (code == null || index < passedPreflightChecks) values.add(Map.of("check_id", ids[index], "status", "PASSED"));
            else if (index == passedPreflightChecks) values.add(Map.of("check_id", ids[index], "status", "FAILED", "code", code));
            else values.add(Map.of("check_id", ids[index], "status", "NOT_RUN", "code", "NOT_RUN"));
        }
        return values;
    }
    private Map<String, Object> binding() { var binding = RuntimeActiveBindingProvider.current(); return Map.of("profile", asset(binding.profile()), "rule_set", asset(binding.ruleSet()), "text_grammar", asset(binding.textGrammar()), "symbol_catalog", asset(binding.symbolCatalog()), "normalization_adapter", asset(binding.normalizationAdapter()), "binding_digest", binding.bindingDigest()); }
    private Map<String, Object> asset(org.opm.localruntime.semantic.SemanticRevision.AssetReference value) { return Map.of("id", value.id(), "version", value.version(), "sha256", value.sha256()); }
    private Map<String, Object> fileRef(String kind, Path root, Path file) throws Exception { return Map.of("kind", kind, "path", root.relativize(file).toString(), "byte_length", Files.size(file), "sha256", sha256(Files.readAllBytes(file))); }
    private Path runtimeJar() throws Exception { return runtimeJarLocator.locate(); }
    private static Path runtimeJarFromCodeSource() throws Exception {
        String location = LocalRuntimeApplication.class.getProtectionDomain().getCodeSource().getLocation().toURI().toString();
        for (String prefix : new String[] {"jar:nested:", "jar:"}) {
            if (location.startsWith(prefix)) {
                location = location.substring(prefix.length());
                break;
            }
        }
        int separator = location.indexOf('!');
        if (separator >= 0) location = location.substring(0, separator);
        java.net.URI locationUri = java.net.URI.create(location);
        return (locationUri.getScheme() == null ? Path.of(location) : Path.of(locationUri)).toRealPath();
    }
    private void verifyFile(Path file, Map<String, Object> ref, String code) throws Exception { if (!Files.isRegularFile(file) || Files.size(file) != number(ref.get("byte_length")) || !sha256(Files.readAllBytes(file)).equals(string(ref.get("sha256")))) throw failure(code, "Exact file ref mismatch."); }
    private boolean archiveRef(Map<String, Object> ref) { return ref.containsKey("path") && ref.containsKey("byte_length") && ref.containsKey("sha256") && ref.containsKey("bundle_sha256") && ref.containsKey("archive_entry_path"); }
    private boolean safeArchivePath(String value) { return !value.isBlank() && !value.startsWith("/") && !value.contains("..") && !value.contains("//"); }
    @SuppressWarnings("unchecked") private Map<String, Object> cast(Object value) { if (!(value instanceof Map<?, ?> map)) throw failure("GFM_PLAN_INVALID", "Expected object."); return (Map<String, Object>) map; }
    @SuppressWarnings("unchecked") private List<Object> list(Object value) { return value instanceof List<?> values ? (List<Object>) values : List.of(); }
    private Map<String, Object> map(Map<String, Object> value, String... keys) { Map<String, Object> result = value; for (String key : keys) result = cast(result.get(key)); return result; }
    private String text(PropertySource<?> source, String key) { Object value = source.getProperty(key); if (!(value instanceof String text) || text.isBlank()) throw failure("GFM_ARGUMENT_INVALID", "Missing command-line property."); return text; }
    private String commandLineGuard(PropertySource<?> source, String key, String code) { Object value = source.getProperty(key); if (!(value instanceof String text) || text.isBlank()) throw failure(code, "Missing or invalid command-line guard."); return text; }
    private Path path(PropertySource<?> source, String key) { return Path.of(text(source, key)).toAbsolutePath().normalize(); }
    private long integer(PropertySource<?> source, String key) { try { return Long.parseLong(text(source, key)); } catch (NumberFormatException exception) { throw failure("GFM_ARGUMENT_INVALID", "Invalid integer property."); } }
    private int integer(Object value) { return value instanceof Number number ? number.intValue() : -1; }
    private long number(Object value) { return value instanceof Number number ? number.longValue() : -1; }
    private String string(Object value) { return value == null ? "" : value.toString(); }
    private String sha256(byte[] bytes) { try { return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); } catch (Exception exception) { throw new IllegalStateException(exception); } }
    private String sha256(String value) { return sha256(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
    private String canonical(Object value) { return Rfc8785JsonCanonicalizer.canonicalize(value); }
    private GoldenFixtureMaterializationException failure(String code, String message) { return new GoldenFixtureMaterializationException(code, message); }
    private record Arguments(Path capturePlan, Path evidenceBundle, String fixtureRefKey, String expectedRuntimeJarSha256, Path storageRoot, Path reportOut, long epoch) { }
    private record ReportContext(Arguments args, Map<String, Object> plan, Map<String, Object> fixtureRef, byte[] fixture) { }
    private record StorageTarget(Path storageRoot, boolean existedAtCheck) { }
    @FunctionalInterface
    interface RuntimeJarLocator { Path locate() throws Exception; }
    @FunctionalInterface
    interface FixtureMaterializer { GoldenFixtureSeedRepository.MaterializedFixture materialize(Path storageRoot, byte[] fixture, String fixtureSha256, long epoch) throws Exception; }
    @FunctionalInterface
    interface StorageCleaner { void cleanup(Path storageRoot, boolean existedAtCheck) throws Exception; }
    @FunctionalInterface
    interface MaterializationReportWriter { void write(Path temporary, Path out, String content) throws Exception; }
    @FunctionalInterface
    interface ReportPayloadEncoder { String encode(ObjectMapper objectMapper, Map<String, Object> report) throws Exception; }
}
