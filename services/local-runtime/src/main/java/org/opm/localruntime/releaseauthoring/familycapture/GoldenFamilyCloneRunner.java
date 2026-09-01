package org.opm.localruntime.releaseauthoring.familycapture;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.releaseauthoring.GoldenFixtureAttemptCloneVerifier;
import org.opm.localruntime.releaseauthoring.GoldenFixtureMaterializationException;
import org.opm.localruntime.releaseauthoring.ReleaseGoldenAuthoringLaunchMode;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ExitCodeGenerator;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertySource;
import org.springframework.stereotype.Component;

import java.io.File;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Family capture 的有限 clone 入口，只消费已封闭的 identity 和 materialization base。 */
@Component
@Profile("release-golden-authoring")
@Conditional(GoldenFamilyCloneRunner.CloneModeCondition.class)
public final class GoldenFamilyCloneRunner implements ApplicationRunner, ExitCodeGenerator {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<String> REQUIRED = List.of(
            "spring.profiles.active", "spring.main.web-application-type", "opm.runtime.mode",
            "opm.release.golden-authoring", "opm.release.golden-family.clone",
            "opm.release.golden-family.capture-id", "opm.release.golden-family.attempt-ordinal",
            "opm.release.golden-family.capture-identity", "opm.release.golden-family.base-storage-root",
            "opm.release.golden-family.attempt-storage-root", "opm.release.golden-family.clone-result-out",
            "opm.release.source-date-epoch");

    private final ConfigurableEnvironment environment;
    private final ApplicationArguments applicationArguments;
    private final GoldenFixtureAttemptCloneVerifier cloneVerifier;
    private volatile int exitCode = 4;

    public GoldenFamilyCloneRunner(ConfigurableEnvironment environment, ApplicationArguments applicationArguments) {
        this(environment, applicationArguments, new GoldenFixtureAttemptCloneVerifier());
    }

    GoldenFamilyCloneRunner(ConfigurableEnvironment environment, ApplicationArguments applicationArguments,
                            GoldenFixtureAttemptCloneVerifier cloneVerifier) {
        this.environment = environment;
        this.applicationArguments = applicationArguments;
        this.cloneVerifier = cloneVerifier;
    }

    @Override
    public void run(ApplicationArguments ignored) {
        try {
            if (ReleaseGoldenAuthoringLaunchMode.require(environment)
                    != ReleaseGoldenAuthoringLaunchMode.RELEASE_GOLDEN_FAMILY_CLONE) {
                throw failure("GOLDEN_FAMILY_MODE_REJECTED", "Family Clone mode is required.");
            }
            PropertySource<?> source = commandLine();
            verifyExactArguments(source);
            Request request = request(source);
            Identity identity = readIdentity(request);
            Base base = verifyBase(request, identity);
            if (Files.exists(request.attemptStorageRoot())) {
                throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Attempt storage root must be fresh.");
            }
            verifyNonOverlapping(base.storageRoot(), request.attemptStorageRoot(), request.cloneResultOut());
            String before = treeDigest(base.storageRoot());
            GoldenFixtureAttemptCloneVerifier.AttemptClone clone = cloneVerifier.cloneStorage(
                    base.storageRoot(), identity.projectId(), base.databaseRef().get("sha256").toString(), request.attemptStorageRoot());
            String after = treeDigest(base.storageRoot());
            if (!before.equals(after) || !before.equals(base.baseTreeSha256())) {
                throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Immutable Family base changed while cloning.");
            }
            writeResult(request, identity, base, before, after, clone.databasePath(), treeDigest(request.attemptStorageRoot()));
            exitCode = 0;
        } catch (GoldenFixtureMaterializationException exception) {
            exitCode = GoldenFixtureMaterializationException.exitCodeFor(exception.code());
            System.err.println(exception.code());
        } catch (Exception exception) {
            exitCode = GoldenFixtureMaterializationException.exitCodeFor("GOLDEN_FAMILY_CAPTURE_INTERNAL_ERROR");
            System.err.println("GOLDEN_FAMILY_CAPTURE_INTERNAL_ERROR");
        }
    }

    @Override
    public int getExitCode() {
        return exitCode;
    }

    private PropertySource<?> commandLine() {
        PropertySource<?> source = environment.getPropertySources().get("commandLineArgs");
        if (source == null) throw failure("GOLDEN_FAMILY_MODE_REJECTED", "Family Clone arguments must originate from command line.");
        return source;
    }

    private void verifyExactArguments(PropertySource<?> source) {
        String[] raw = applicationArguments.getSourceArgs();
        for (String key : REQUIRED) {
            Object value = source.getProperty(key);
            long count = Arrays.stream(raw).filter(argument -> argument.startsWith("--" + key + "=")).count();
            if (value == null || count != 1 || !Arrays.asList(raw).contains("--" + key + "=" + value)) {
                throw failure("GOLDEN_FAMILY_MODE_REJECTED", "Family Clone argument is missing, duplicated, or not exact: " + key);
            }
        }
        for (String argument : raw) {
            if (!argument.startsWith("--opm.release.golden-family.")) continue;
            String key = argument.substring(2, argument.indexOf('='));
            if (!REQUIRED.contains(key)) throw failure("GOLDEN_FAMILY_MODE_REJECTED", "Unexpected Family Clone argument.");
        }
    }

    private Request request(PropertySource<?> source) {
        int ordinal = integer(source, "opm.release.golden-family.attempt-ordinal");
        if (ordinal != 1 && ordinal != 2) throw failure("GOLDEN_FAMILY_CAPTURE_INPUT_INVALID", "Attempt ordinal must be one or two.");
        return new Request(text(source, "opm.release.golden-family.capture-id"), ordinal,
                absolute(source, "opm.release.golden-family.capture-identity", true),
                absolute(source, "opm.release.golden-family.base-storage-root", true),
                absolute(source, "opm.release.golden-family.attempt-storage-root", false),
                absolute(source, "opm.release.golden-family.clone-result-out", false),
                nonNegative(source, "opm.release.source-date-epoch"));
    }

    private Identity readIdentity(Request request) throws Exception {
        if (!Files.isRegularFile(request.identityPath()) || Files.isSymbolicLink(request.identityPath())
                || !"family-capture-identity.json".equals(request.identityPath().getFileName().toString())) {
            throw failure("GOLDEN_FAMILY_CAPTURE_INPUT_INVALID", "Family Capture Identity path is unsafe.");
        }
        JsonNode identity = JSON.readTree(Files.readAllBytes(request.identityPath()));
        if (!identity.isObject()
                || !"OPM-DEV-CANVAS-06-GOLDEN-FAMILY-CAPTURE-IDENTITY-001".equals(text(identity, "schema_id"))
                || !"0.1".equals(text(identity, "schema_version"))
                || !"0.1.0".equals(text(identity, "identity_version"))
                || !request.captureId().equals(text(identity, "capture_id"))
                || request.attemptOrdinal() != integer(identity, "attempt_ordinal")
                || request.sourceDateEpoch() != integer(identity, "source_date_epoch")) {
            throw failure("GOLDEN_FAMILY_CAPTURE_INPUT_INVALID", "Family Capture Identity header differs from Clone request.");
        }
        Map<String, Object> payload = JSON.convertValue(identity, Map.class);
        String declaredPayload = text(identity, "identity_payload_sha256");
        payload.remove("identity_payload_sha256");
        if (!declaredPayload.equals(Rfc8785JsonCanonicalizer.sha256(payload))) {
            throw failure("GOLDEN_FAMILY_CAPTURE_INPUT_INVALID", "Family Capture Identity payload digest differs.");
        }
        JsonNode fixture = identity.required("fixture_ref");
        JsonNode materialized = identity.required("materialized_identity");
        return new Identity(identity, fixture, materialized, text(materialized, "project_id"));
    }

    private Base verifyBase(Request request, Identity identity) throws Exception {
        String key = fixtureRefKey(identity.fixtureRef());
        Path storage = request.baseStorageRoot();
        Path keyDirectory = storage.getParent();
        Path fixtures = keyDirectory == null ? null : keyDirectory.getParent();
        Path root = fixtures == null ? null : fixtures.getParent();
        if (root == null || keyDirectory == null || fixtures == null || !"storage".equals(storage.getFileName().toString())
                || !key.equals(keyDirectory.getFileName().toString()) || !"fixtures".equals(fixtures.getFileName().toString())
                || !safeDirectory(root) || !safeDirectory(fixtures) || !safeDirectory(keyDirectory) || !safeDirectory(storage)) {
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Family base storage does not match the fixed Materialization layout.");
        }
        Path report = root.resolve("reports").resolve(key + ".json").normalize();
        if (!safeFile(report) || !same(fileRef("MATERIALIZATION_REPORT", "materialization/reports/" + key + ".json", report), identity.node().required("materialization_report_ref"))) {
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Materialization Report differs from Family Capture Identity.");
        }
        JsonNode reportJson = JSON.readTree(Files.readAllBytes(report));
        if (!reportJson.isObject() || !"MATERIALIZED".equals(text(reportJson, "report_status"))
                || !key.equals(text(reportJson, "fixture_ref_key"))
                || !same(reportJson.required("source_fixture_ref"), identity.fixtureRef())
                || !same(reportJson.required("materialized_identity"), identity.materializedIdentity())
                || request.sourceDateEpoch() != integer(reportJson, "source_date_epoch")) {
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Materialization Report identity differs from Family Capture Identity.");
        }
        JsonNode target = reportJson.required("target_storage");
        if (!("fixtures/" + key + "/storage").equals(text(target, "storage_root"))) {
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Materialization storage root differs from the fixed layout.");
        }
        JsonNode databaseRef = target.required("database_ref");
        String databasePath = text(databaseRef, "path");
        Path database = root.resolve(databasePath).normalize();
        Path expectedDatabase = storage.resolve("projects").resolve(identity.projectId()).resolve("project.db");
        if (!database.equals(expectedDatabase) || !safeFile(database)
                || !same(fileRef("DATABASE", databasePath, database), databaseRef)
                || !text(target, "database_sha256").equals(text(databaseRef, "sha256"))
                || Files.exists(database.resolveSibling(database.getFileName() + "-wal"))
                || Files.exists(database.resolveSibling(database.getFileName() + "-shm"))) {
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Family base database differs from Materialization Report.");
        }
        return new Base(root, storage, fileRef("DATABASE", databasePath, database), treeDigest(storage));
    }

    private void writeResult(Request request, Identity identity, Base base, String before, String after,
                             Path attemptDatabase, String attemptTree) throws Exception {
        String attemptDatabasePath = request.attemptStorageRoot().relativize(attemptDatabase).toString().replace(File.separatorChar, '/');
        if (attemptDatabasePath.isBlank() || attemptDatabasePath.startsWith("..")) {
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Attempt database must remain inside attempt storage.");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("schema_id", "OPM-DEV-CANVAS-06-GOLDEN-FAMILY-CLONE-RESULT-001");
        result.put("schema_version", "0.1");
        result.put("result_version", "0.1.0");
        result.put("status", "READY_FOR_RUNTIME");
        result.put("capture_id", request.captureId());
        result.put("attempt_ordinal", request.attemptOrdinal());
        result.put("source_date_epoch", request.sourceDateEpoch());
        result.put("family_capture_identity_ref", fileRef("FAMILY_CAPTURE_IDENTITY", "inputs/family-capture-identity.json", request.identityPath()));
        result.put("materialization_report_ref", fileRef("MATERIALIZATION_REPORT", "materialization/reports/" + fixtureRefKey(identity.fixtureRef()) + ".json",
                base.materializationRoot().resolve("reports").resolve(fixtureRefKey(identity.fixtureRef()) + ".json")));
        result.put("materialized_identity", JSON.convertValue(identity.materializedIdentity(), Map.class));
        result.put("base_database_ref", base.databaseRef());
        result.put("base_tree_sha256_before", before);
        result.put("base_tree_sha256_after", after);
        result.put("attempt_database_ref", fileRef("PROJECT_DB", attemptDatabasePath, attemptDatabase));
        result.put("attempt_tree_sha256", attemptTree);
        result.put("result_payload_sha256", Rfc8785JsonCanonicalizer.sha256(result));
        writeAtomically(request.cloneResultOut(), Rfc8785JsonCanonicalizer.canonicalize(result).getBytes(StandardCharsets.UTF_8));
    }

    private void verifyNonOverlapping(Path base, Path attempt, Path result) {
        if (attempt.startsWith(base) || base.startsWith(attempt) || result.startsWith(base) || base.startsWith(result)) {
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Base, attempt, and result paths must not overlap.");
        }
    }

    private static String fixtureRefKey(JsonNode ref) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("path", text(ref, "path"));
        payload.put("byte_length", integer(ref, "byte_length"));
        payload.put("sha256", text(ref, "sha256"));
        payload.put("bundle_sha256", text(ref, "bundle_sha256"));
        payload.put("archive_entry_path", text(ref, "archive_entry_path"));
        return Rfc8785JsonCanonicalizer.sha256(payload);
    }

    private static boolean safeDirectory(Path path) {
        return path != null && Files.isDirectory(path) && !Files.isSymbolicLink(path);
    }

    private static boolean safeFile(Path path) {
        return Files.isRegularFile(path) && !Files.isSymbolicLink(path);
    }

    private static boolean same(Map<String, Object> left, JsonNode right) {
        return Rfc8785JsonCanonicalizer.canonicalize(left).equals(Rfc8785JsonCanonicalizer.canonicalize(right));
    }

    private static boolean same(JsonNode left, JsonNode right) {
        return Rfc8785JsonCanonicalizer.canonicalize(left).equals(Rfc8785JsonCanonicalizer.canonicalize(right));
    }

    private static Map<String, Object> fileRef(String kind, String logicalPath, Path file) throws Exception {
        return Map.of("kind", kind, "path", logicalPath, "byte_length", Files.size(file), "sha256", sha256(Files.readAllBytes(file)));
    }

    private static String treeDigest(Path root) throws Exception {
        Map<String, String> files = new TreeMap<>();
        try (var paths = Files.walk(root)) {
            for (Path file : paths.filter(Files::isRegularFile).toList()) {
                if (Files.isSymbolicLink(file)) throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Storage contains a symbolic link.");
                files.put(root.relativize(file).toString().replace(File.separatorChar, '/'), sha256(Files.readAllBytes(file)));
            }
        }
        return Rfc8785JsonCanonicalizer.sha256(files);
    }

    private static void writeAtomically(Path target, byte[] bytes) throws Exception {
        Path parent = target.getParent();
        if (parent == null || !safeDirectory(parent) || Files.exists(target)) {
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Clone Result destination is not fresh.");
        }
        Path temporary = parent.resolve("." + target.getFileName() + ".tmp");
        if (Files.exists(temporary) || Files.isSymbolicLink(temporary)) {
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Clone Result temporary path is not fresh.");
        }
        try {
            try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                channel.write(ByteBuffer.wrap(bytes));
                channel.force(true);
            }
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
            try (FileChannel directory = FileChannel.open(parent, StandardOpenOption.READ)) {
                directory.force(true);
            }
        } catch (Exception exception) {
            Files.deleteIfExists(temporary);
            if (exception instanceof GoldenFixtureMaterializationException materialization) throw materialization;
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Cannot atomically write Family Clone Result.", exception);
        }
    }

    private static Path absolute(PropertySource<?> source, String key, boolean existing) {
        String raw = text(source, key);
        Path path = Path.of(raw).toAbsolutePath().normalize();
        if (!Path.of(raw).isAbsolute() || path.equals(path.getRoot()) || (existing && !Files.exists(path))) {
            throw failure("GOLDEN_FAMILY_CAPTURE_INPUT_INVALID", "Path is invalid: " + key);
        }
        return path;
    }

    private static String text(PropertySource<?> source, String key) {
        Object value = source.getProperty(key);
        if (value == null || value.toString().isBlank()) throw failure("GOLDEN_FAMILY_CAPTURE_INPUT_INVALID", "Missing " + key);
        return value.toString();
    }

    private static String text(JsonNode node, String key) {
        JsonNode value = node.get(key);
        if (value == null || !value.isTextual() || value.asText().isBlank()) {
            throw failure("GOLDEN_FAMILY_CAPTURE_INPUT_INVALID", "Invalid artifact field: " + key);
        }
        return value.asText();
    }

    private static int integer(PropertySource<?> source, String key) {
        try {
            return Integer.parseInt(text(source, key));
        } catch (NumberFormatException exception) {
            throw failure("GOLDEN_FAMILY_CAPTURE_INPUT_INVALID", "Invalid integer: " + key, exception);
        }
    }

    private static long integer(JsonNode node, String key) {
        JsonNode value = node.get(key);
        if (value == null || !value.canConvertToLong() || value.longValue() < 0) {
            throw failure("GOLDEN_FAMILY_CAPTURE_INPUT_INVALID", "Invalid artifact integer: " + key);
        }
        return value.longValue();
    }

    private static long nonNegative(PropertySource<?> source, String key) {
        try {
            long value = Long.parseLong(text(source, key));
            if (value < 0) throw new NumberFormatException();
            return value;
        } catch (NumberFormatException exception) {
            throw failure("GOLDEN_FAMILY_CAPTURE_INPUT_INVALID", "Invalid non-negative integer: " + key, exception);
        }
    }

    private static String sha256(byte[] bytes) throws Exception {
        return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private static GoldenFixtureMaterializationException failure(String code, String message) {
        return new GoldenFixtureMaterializationException(code, message);
    }

    private static GoldenFixtureMaterializationException failure(String code, String message, Throwable cause) {
        return new GoldenFixtureMaterializationException(code, message, cause);
    }

    private record Request(String captureId, int attemptOrdinal, Path identityPath, Path baseStorageRoot,
                           Path attemptStorageRoot, Path cloneResultOut, long sourceDateEpoch) { }

    private record Identity(JsonNode node, JsonNode fixtureRef, JsonNode materializedIdentity, String projectId) { }

    private record Base(Path materializationRoot, Path storageRoot, Map<String, Object> databaseRef,
                        String baseTreeSha256) { }

    public static final class CloneModeCondition implements org.springframework.context.annotation.Condition {
        @Override
        public boolean matches(org.springframework.context.annotation.ConditionContext context,
                               org.springframework.core.type.AnnotatedTypeMetadata metadata) {
            if (!(context.getEnvironment() instanceof ConfigurableEnvironment environment)) return false;
            try {
                return ReleaseGoldenAuthoringLaunchMode.require(environment)
                        == ReleaseGoldenAuthoringLaunchMode.RELEASE_GOLDEN_FAMILY_CLONE;
            } catch (GoldenFixtureMaterializationException exception) {
                return false;
            }
        }
    }
}
