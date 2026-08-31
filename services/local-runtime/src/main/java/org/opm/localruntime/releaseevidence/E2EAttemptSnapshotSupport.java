package org.opm.localruntime.releaseevidence;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.sqlite.SQLiteConfig;

import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

/** State/Transaction Snapshot CLI共用的attempt信任与SQLite只读边界。 */
final class E2EAttemptSnapshotSupport {

    private static final ObjectMapper JSON = new ObjectMapper();

    private E2EAttemptSnapshotSupport() { }

    static VerifiedAttempt verifyAttempt(Path storage, Path fixtureMaterialization, String projectId,
                                         String modelId, String contextId, Class<?> codeSourceOwner) throws Exception {
        Path attemptRoot = fixtureMaterialization.getParent();
        requireExactPath(storage, attemptRoot.resolve("storage"), "storage");
        requireRegular(fixtureMaterialization, "fixture materialization");
        requireExactPath(fixtureMaterialization, attemptRoot.resolve("fixture-materialization.json"), "fixture materialization");

        JsonNode materialization = readObject(fixtureMaterialization);
        if (!materialization.isObject()
                || !"OPM-DEV-CANVAS-06-E2E-FIXTURE-MATERIALIZATION-001".equals(materialization.path("schema_id").asText())
                || !"0.2".equals(materialization.path("schema_version").asText())) {
            throw input("Fixture Materialization identity 不合法。");
        }
        JsonNode identity = materialization.path("identity");
        if (!projectId.equals(identity.path("project_id").asText())
                || !modelId.equals(identity.path("model_id").asText())
                || contextId != null && !contextId.equals(identity.path("context_id").asText())) {
            throw input("Fixture Materialization 业务 identity 不匹配。");
        }
        verifyPayloadDigest(materialization, "artifact_payload_sha256");

        Path runtimeJar = attemptRoot.resolve("inputs/build/local-runtime.jar");
        E2EFixtureMaterializerCli.resolveNestedRuntimeJarCodeSource(
                codeSourceOwner.getProtectionDomain().getCodeSource().getLocation().toExternalForm(), runtimeJar);
        verifyRawRef(materialization.path("materializer_identity").path("runtime_jar_ref"), runtimeJar,
                "E2E_ENVIRONMENT_MISMATCH");

        JsonNode storageEvidence = materialization.path("storage");
        if (!"storage".equals(storageEvidence.path("storage_root").asText())
                || !"storage/materialized-base".equals(storageEvidence.path("materialized_base_root").asText())) {
            throw input("Fixture Materialization storage root不合法。");
        }
        JsonNode storageRef = storageEvidence.path("project_db_ref");
        Path expectedBase = new ProjectDatabaseFactory(storage.resolve("materialized-base")).databasePath(projectId);
        Path expectedWorking = new ProjectDatabaseFactory(storage).databasePath(projectId);
        Path baseDatabase = resolveAttemptRef(attemptRoot, storageRef.path("path").asText());
        Path workingDatabase = resolveAttemptRef(attemptRoot, storageEvidence.path("working_project_db_path").asText());
        if (!baseDatabase.equals(expectedBase) || !workingDatabase.equals(expectedWorking)
                || storageEvidence.path("working_clone_byte_length").asLong(-1) != storageRef.path("byte_length").asLong(-2)
                || !storageEvidence.path("working_clone_sha256").asText().equals(storageRef.path("sha256").asText())) {
            throw input("Fixture Materialization base/working SQLite身份不闭合。");
        }
        verifyRawRef(storageRef, baseDatabase, "E2E_INPUT_INVALID");
        requireRegular(workingDatabase, "working project database");
        requireNoSidecars(baseDatabase, "materialized base");
        requireNoSidecars(workingDatabase, "working project database");
        try {
            if (Files.isSameFile(baseDatabase, workingDatabase)) throw input("base与working SQLite不得是同一文件。");
        } catch (SnapshotException exception) {
            throw exception;
        } catch (Exception exception) {
            throw input("无法比较base与working SQLite身份。");
        }
        return new VerifiedAttempt(attemptRoot, workingDatabase, materialization);
    }

    static <T> T withImmutableConnection(Path database, SqlWork<T> work) throws Exception {
        requireRegular(database, "project database");
        List<Path> sidecars = sidecars(database);
        requireNoSidecars(database, "Snapshot 前 SQLite");
        SQLiteConfig configuration = new SQLiteConfig();
        configuration.setReadOnly(true);
        String immutableDatabaseUrl = "jdbc:sqlite:" + database.toUri().toASCIIString() + "?immutable=1";
        try (Connection connection = DriverManager.getConnection(immutableDatabaseUrl, configuration.toProperties())) {
            try (var queryOnly = connection.createStatement()) {
                queryOnly.execute("PRAGMA query_only=ON");
            }
            return work.apply(connection);
        } finally {
            if (sidecars.stream().anyMatch(Files::exists)) throw input("只读 Snapshot 产生了 SQLite sidecar。");
        }
    }

    static JsonNode readObject(Path path) throws Exception {
        JsonNode value = JSON.readTree(Files.readAllBytes(path));
        if (value == null || !value.isObject()) throw input("受控 JSON 输入必须是对象。");
        return value;
    }

    static void verifyRawRef(JsonNode ref, Path path, String code) {
        try {
            requireRegular(path, "raw ref");
            byte[] bytes = Files.readAllBytes(path);
            if (ref.path("byte_length").asLong(-1) != bytes.length || !sha256(bytes).equals(ref.path("sha256").asText())) {
                throw "E2E_ENVIRONMENT_MISMATCH".equals(code) ? environment("Raw ref bytes 不匹配。") : input("Raw ref bytes 不匹配。");
            }
        } catch (SnapshotException exception) {
            throw exception;
        } catch (Exception exception) {
            throw "E2E_ENVIRONMENT_MISMATCH".equals(code) ? environment("Raw ref 无法读取。") : input("Raw ref 无法读取。");
        }
    }

    static Path resolveAttemptRef(Path attemptRoot, String value) {
        if (value == null || value.isBlank() || value.startsWith("/") || value.contains("\\")) {
            throw input("Attempt ref path 不合法。");
        }
        Path result = attemptRoot.resolve(value).normalize();
        requireInside(result, attemptRoot, "attempt ref");
        return result;
    }

    static Path resolveRelative(Path root, String value) {
        if (value.isBlank() || value.startsWith("/") || value.contains("\\")) {
            throw environment("Profile relative path 不合法。");
        }
        Path result = root.resolve(value).normalize();
        requireInside(result, root, "Profile asset");
        return result;
    }

    static void requireExactPath(Path actual, Path expected, String label) {
        if (!actual.equals(expected.toAbsolutePath().normalize())) throw input(label + " path 不等于冻结位置。");
    }

    static void requireInside(Path path, Path root, String label) {
        Path normalized = path.toAbsolutePath().normalize();
        Path normalizedRoot = root.toAbsolutePath().normalize();
        if (normalized.equals(normalizedRoot) || !normalized.startsWith(normalizedRoot)) throw input(label + " path 越界。");
    }

    static void requireRegular(Path path, String label) {
        try {
            var attributes = Files.readAttributes(path, java.nio.file.attribute.BasicFileAttributes.class,
                    LinkOption.NOFOLLOW_LINKS);
            if (Files.isSymbolicLink(path) || !attributes.isRegularFile() || !singleLink(path)) {
                throw input(label + " 不是单链接普通文件。");
            }
        } catch (SnapshotException exception) {
            throw exception;
        } catch (Exception exception) {
            throw input(label + " 无法读取。");
        }
    }

    static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 不可用。", exception);
        }
    }

    static SnapshotException input(String message) {
        return new SnapshotException("E2E_INPUT_INVALID", 2, message);
    }

    static SnapshotException environment(String message) {
        return new SnapshotException("E2E_ENVIRONMENT_MISMATCH", 3, message);
    }

    private static void verifyPayloadDigest(JsonNode root, String field) {
        String expected = root.path(field).asText();
        if (!expected.matches("[a-f0-9]{64}")) throw input("Artifact payload digest 缺失。");
        var copy = root.deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode) copy).remove(field);
        Map<String, Object> payload = JSON.convertValue(copy, new TypeReference<Map<String, Object>>() { });
        if (!expected.equals(Rfc8785JsonCanonicalizer.sha256(payload))) throw input("Artifact payload digest 不匹配。");
    }

    private static List<Path> sidecars(Path database) {
        return List.of(Path.of(database + "-wal"), Path.of(database + "-shm"), Path.of(database + "-journal"));
    }

    private static void requireNoSidecars(Path database, String label) {
        if (sidecars(database).stream().anyMatch(path -> Files.exists(path, LinkOption.NOFOLLOW_LINKS))) {
            throw input(label + " sidecar必须不存在。");
        }
    }

    private static boolean singleLink(Path path) throws Exception {
        try {
            return ((Number) Files.getAttribute(path, "unix:nlink", LinkOption.NOFOLLOW_LINKS)).longValue() == 1;
        } catch (UnsupportedOperationException exception) {
            return true;
        }
    }

    record VerifiedAttempt(Path attemptRoot, Path database, JsonNode materialization) { }

    @FunctionalInterface
    interface SqlWork<T> {
        T apply(Connection connection) throws Exception;
    }

    static final class SnapshotException extends RuntimeException {
        final String code;
        final int exitCode;

        SnapshotException(String code, int exitCode, String message) {
            super(message);
            this.code = code;
            this.exitCode = exitCode;
        }
    }
}
