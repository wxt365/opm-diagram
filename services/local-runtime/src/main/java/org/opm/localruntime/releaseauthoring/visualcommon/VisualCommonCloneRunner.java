package org.opm.localruntime.releaseauthoring.visualcommon;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.releaseauthoring.GoldenFixtureMaterializationException;
import org.opm.localruntime.releaseauthoring.ReleaseGoldenAuthoringLaunchMode;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ExitCodeGenerator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertySource;
import org.springframework.stereotype.Component;

import java.io.IOException;
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

/** Common Visual 单 attempt 的 release-only、non-web Clone CLI。 */
@Component
@Profile("release-golden-authoring")
@Conditional(VisualCommonCloneRunner.CloneModeCondition.class)
public final class VisualCommonCloneRunner implements ApplicationRunner, ExitCodeGenerator {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<String> REQUIRED = List.of(
            "spring.profiles.active", "spring.main.web-application-type", "opm.runtime.mode",
            "opm.release.golden-authoring", "opm.release.visual-common.clone",
            "opm.release.visual-common.request-id", "opm.release.visual-common.capture-id",
            "opm.release.visual-common.subject-id", "opm.release.visual-common.attempt-ordinal",
            "opm.release.visual-common.base-root", "opm.release.visual-common.base-attestation",
            "opm.release.visual-common.attempt-storage-root", "opm.release.visual-common.clone-result-out",
            "opm.release.source-date-epoch");

    private final ConfigurableEnvironment environment;
    private final ApplicationArguments applicationArguments;
    private final VisualCommonFixtureMaterializer materializer;
    private volatile int exitCode = 4;

    @Autowired
    public VisualCommonCloneRunner(ConfigurableEnvironment environment, ApplicationArguments applicationArguments) {
        this(environment, applicationArguments, new VisualCommonFixtureMaterializer());
    }

    VisualCommonCloneRunner(ConfigurableEnvironment environment, ApplicationArguments applicationArguments,
                            VisualCommonFixtureMaterializer materializer) {
        this.environment = environment;
        this.applicationArguments = applicationArguments;
        this.materializer = materializer;
    }

    @Override
    public void run(ApplicationArguments ignored) {
        try {
            ReleaseGoldenAuthoringLaunchMode.require(environment);
            PropertySource<?> source = commandLine();
            verifyExactArguments(source);
            Request request = request(source);
            Base base = verifyBase(request);
            if (Files.exists(request.attemptStorageRoot())) {
                throw failure("GOLDEN_COMMON_CLONE_FAILED", "Attempt storage root must be fresh.");
            }
            verifyNonOverlapping(base.root(), request.attemptStorageRoot(), request.cloneResultOut());
            String before = treeDigest(base.root());
            VisualCommonFixtureMaterializer.CloneResult clone = materializer.cloneAttempt(
                    base.root(), base.projectId(), base.databaseSha256(), request.attemptStorageRoot());
            String after = treeDigest(base.root());
            if (!before.equals(after) || !before.equals(clone.baseTreeSha256())) {
                throw failure("GOLDEN_COMMON_CLONE_FAILED", "Immutable base tree changed while cloning.");
            }
            Path attemptDatabase = clone.databasePath();
            writeResult(request, base, before, after, attemptDatabase, treeDigest(request.attemptStorageRoot()));
            exitCode = 0;
        } catch (GoldenFixtureMaterializationException exception) {
            exitCode = GoldenFixtureMaterializationException.exitCodeFor(exception.code());
            System.err.println(exception.code());
        } catch (Exception exception) {
            exitCode = GoldenFixtureMaterializationException.exitCodeFor("GOLDEN_COMMON_INTERNAL_ERROR");
            System.err.println("GOLDEN_COMMON_INTERNAL_ERROR");
        }
    }

    @Override
    public int getExitCode() {
        return exitCode;
    }

    private PropertySource<?> commandLine() {
        PropertySource<?> source = environment.getPropertySources().get("commandLineArgs");
        if (source == null) throw failure("GOLDEN_COMMON_MODE_REJECTED", "Clone arguments must originate from command line.");
        return source;
    }

    private void verifyExactArguments(PropertySource<?> source) {
        String[] raw = applicationArguments.getSourceArgs();
        for (String key : REQUIRED) {
            Object value = source.getProperty(key);
            long count = Arrays.stream(raw).filter(argument -> argument.startsWith("--" + key + "=")).count();
            if (value == null || count != 1 || !Arrays.asList(raw).contains("--" + key + "=" + value)) {
                throw failure("GOLDEN_COMMON_MODE_REJECTED", "Clone argument is missing, duplicated, or not command-line exact: " + key);
            }
        }
        for (String argument : raw) {
            if (!argument.startsWith("--opm.release.visual-common.")) continue;
            String key = argument.substring(2, argument.indexOf('='));
            if (!REQUIRED.contains(key)) throw failure("GOLDEN_COMMON_MODE_REJECTED", "Unexpected Common Visual clone argument.");
        }
    }

    private Request request(PropertySource<?> source) {
        String requestId = text(source, "opm.release.visual-common.request-id");
        String captureId = text(source, "opm.release.visual-common.capture-id");
        String subjectId = text(source, "opm.release.visual-common.subject-id");
        if (!List.of("STATE_ROLES", "LONG_LABELS", "FUNDAMENTAL_FAN", "CANDIDATE_LAYER", "INSPECTOR", "TOOLCHAIN_CATALOG", "FINDING_FOCUS", "BLOCKED_FEEDBACK").contains(subjectId)) {
            throw failure("GOLDEN_COMMON_INPUT_INVALID", "Unsupported Common Visual subject.");
        }
        int attempt = integer(source, "opm.release.visual-common.attempt-ordinal");
        if (attempt != 1 && attempt != 2) throw failure("GOLDEN_COMMON_INPUT_INVALID", "Attempt ordinal must be one or two.");
        return new Request(requestId, captureId, subjectId, attempt,
                absolute(source, "opm.release.visual-common.base-root", false),
                absolute(source, "opm.release.visual-common.base-attestation", true),
                absolute(source, "opm.release.visual-common.attempt-storage-root", false),
                absolute(source, "opm.release.visual-common.clone-result-out", false),
                nonNegative(source, "opm.release.source-date-epoch"));
    }

    private Base verifyBase(Request request) throws Exception {
        if (!Files.isDirectory(request.baseRoot()) || Files.isSymbolicLink(request.baseRoot())
                || !Files.isRegularFile(request.baseAttestation()) || Files.isSymbolicLink(request.baseAttestation())) {
            throw failure("GOLDEN_COMMON_CLONE_FAILED", "Base root or attestation is unsafe.");
        }
        JsonNode attestation = JSON.readTree(Files.readAllBytes(request.baseAttestation()));
        if (!attestation.isObject() || !request.subjectId().equals(text(attestation, "subject_id"))
                || request.epoch() != integer(attestation, "source_date_epoch")) {
            throw failure("GOLDEN_COMMON_CLONE_FAILED", "Base attestation identity differs from clone request.");
        }
        JsonNode databaseRef = attestation.path("database_ref");
        String relativeDatabase = text(databaseRef, "path");
        if (relativeDatabase.startsWith("/") || relativeDatabase.contains("..")) {
            throw failure("GOLDEN_COMMON_CLONE_FAILED", "Base database ref is unsafe.");
        }
        Path database = request.baseRoot().resolve(relativeDatabase).normalize();
        if (!database.startsWith(request.baseRoot()) || !Files.isRegularFile(database) || Files.isSymbolicLink(database)
                || Files.exists(database.resolveSibling(database.getFileName() + "-wal"))
                || Files.exists(database.resolveSibling(database.getFileName() + "-shm"))
                || Files.size(database) != integer(databaseRef, "byte_length")
                || !sha256(Files.readAllBytes(database)).equals(text(databaseRef, "sha256"))) {
            throw failure("GOLDEN_COMMON_CLONE_FAILED", "Base database no longer matches its attestation.");
        }
        return new Base(request.baseRoot(), text(attestation, "project_id"), text(databaseRef, "sha256"), database,
                fileRef("COMMON_BASE_ATTESTATION", request.baseAttestation().getFileName().toString(), request.baseAttestation()),
                fileRef("PROJECT_DB", relativeDatabase, database));
    }

    private void writeResult(Request request, Base base, String before, String after, Path attemptDatabase, String attemptTree) throws Exception {
        String logicalAttemptDatabase = request.attemptStorageRoot().relativize(attemptDatabase).toString();
        if (logicalAttemptDatabase.isBlank() || logicalAttemptDatabase.startsWith("..")) {
            throw failure("GOLDEN_COMMON_CLONE_FAILED", "Attempt database must be inside attempt storage root.");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("schema_id", "OPM-DEV-CANVAS-06-COMMON-VISUAL-CLONE-RESULT-001");
        result.put("schema_version", "0.1");
        result.put("result_version", "0.1.0");
        result.put("status", "READY_FOR_RUNTIME");
        result.put("request_id", request.requestId());
        result.put("capture_id", request.captureId());
        result.put("subject_id", request.subjectId());
        result.put("attempt_ordinal", request.attemptOrdinal());
        result.put("source_date_epoch", request.epoch());
        result.put("base_attestation_ref", base.attestationRef());
        result.put("base_database_ref", base.databaseRef());
        result.put("base_tree_sha256_before", before);
        result.put("base_tree_sha256_after", after);
        result.put("attempt_database_ref", fileRef("PROJECT_DB", logicalAttemptDatabase, attemptDatabase));
        result.put("attempt_tree_sha256", attemptTree);
        result.put("result_payload_sha256", Rfc8785JsonCanonicalizer.sha256(result));
        writeAtomically(request.cloneResultOut(), Rfc8785JsonCanonicalizer.canonicalize(result).getBytes(StandardCharsets.UTF_8));
    }

    private Map<String, Object> fileRef(String kind, String logicalPath, Path file) throws Exception {
        return Map.of("kind", kind, "path", logicalPath.replace('\\', '/'), "byte_length", Files.size(file), "sha256", sha256(Files.readAllBytes(file)));
    }

    private void writeAtomically(Path target, byte[] bytes) throws Exception {
        Path parent = target.getParent();
        if (parent == null || !Files.isDirectory(parent) || Files.isSymbolicLink(parent) || Files.exists(target)) {
            throw failure("GOLDEN_COMMON_CLONE_FAILED", "Clone result destination is not fresh.");
        }
        Path temporary = parent.resolve("." + target.getFileName() + ".tmp");
        if (Files.exists(temporary) || Files.isSymbolicLink(temporary)) {
            throw failure("GOLDEN_COMMON_CLONE_FAILED", "Clone result temporary path is not fresh.");
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
            throw failure("GOLDEN_COMMON_CLONE_FAILED", "Cannot atomically write Clone Result.", exception);
        }
    }

    private Path absolute(PropertySource<?> source, String key, boolean existingFile) {
        String raw = text(source, key);
        Path path = Path.of(raw).toAbsolutePath().normalize();
        if (!Path.of(raw).isAbsolute() || path.equals(path.getRoot()) || (existingFile && !Files.exists(path))) {
            throw failure("GOLDEN_COMMON_INPUT_INVALID", "Path is invalid: " + key);
        }
        return path;
    }

    private void verifyNonOverlapping(Path base, Path attempt, Path result) {
        if (attempt.startsWith(base) || base.startsWith(attempt) || result.startsWith(base) || base.startsWith(result)) {
            throw failure("GOLDEN_COMMON_CLONE_FAILED", "Base, attempt, and result paths must not overlap.");
        }
    }

    private String text(PropertySource<?> source, String key) {
        Object value = source.getProperty(key);
        if (value == null || value.toString().isBlank()) throw failure("GOLDEN_COMMON_INPUT_INVALID", "Missing " + key);
        return value.toString();
    }

    private String text(JsonNode node, String key) {
        JsonNode value = node.get(key);
        if (value == null || !value.isTextual() || value.asText().isBlank()) throw failure("GOLDEN_COMMON_CLONE_FAILED", "Invalid attestation " + key);
        return value.asText();
    }

    private int integer(PropertySource<?> source, String key) {
        try { return Integer.parseInt(text(source, key)); } catch (NumberFormatException exception) { throw failure("GOLDEN_COMMON_INPUT_INVALID", "Invalid integer: " + key, exception); }
    }

    private long nonNegative(PropertySource<?> source, String key) {
        try { long value = Long.parseLong(text(source, key)); if (value < 0) throw new NumberFormatException(); return value; }
        catch (NumberFormatException exception) { throw failure("GOLDEN_COMMON_INPUT_INVALID", "Invalid non-negative integer: " + key, exception); }
    }

    private long integer(JsonNode node, String key) {
        JsonNode value = node.get(key);
        if (value == null || !value.canConvertToLong() || value.longValue() < 0) throw failure("GOLDEN_COMMON_CLONE_FAILED", "Invalid attestation " + key);
        return value.longValue();
    }

    private String sha256(byte[] bytes) throws Exception {
        return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private String treeDigest(Path root) throws Exception {
        Map<String, String> files = new java.util.TreeMap<>();
        try (var paths = Files.walk(root)) {
            for (Path file : paths.filter(Files::isRegularFile).toList()) {
                if (Files.isSymbolicLink(file)) throw failure("GOLDEN_COMMON_CLONE_FAILED", "Storage contains a symbolic link.");
                files.put(root.relativize(file).toString().replace('\\', '/'), sha256(Files.readAllBytes(file)));
            }
        }
        return Rfc8785JsonCanonicalizer.sha256(files);
    }

    private GoldenFixtureMaterializationException failure(String code, String message) {
        return new GoldenFixtureMaterializationException(code, message);
    }

    private GoldenFixtureMaterializationException failure(String code, String message, Throwable cause) {
        return new GoldenFixtureMaterializationException(code, message, cause);
    }

    private record Request(String requestId, String captureId, String subjectId, int attemptOrdinal, Path baseRoot,
                           Path baseAttestation, Path attemptStorageRoot, Path cloneResultOut, long epoch) { }

    private record Base(Path root, String projectId, String databaseSha256, Path database, Map<String, Object> attestationRef,
                        Map<String, Object> databaseRef) { }

    public static final class CloneModeCondition implements org.springframework.context.annotation.Condition {
        @Override
        public boolean matches(org.springframework.context.annotation.ConditionContext context,
                               org.springframework.core.type.AnnotatedTypeMetadata metadata) {
            if (!(context.getEnvironment() instanceof ConfigurableEnvironment environment)) return false;
            try {
                return ReleaseGoldenAuthoringLaunchMode.require(environment)
                        == ReleaseGoldenAuthoringLaunchMode.RELEASE_GOLDEN_COMMON_CLONE;
            } catch (GoldenFixtureMaterializationException exception) {
                return false;
            }
        }
    }
}
