package org.opm.localruntime.releaseauthoring.visualcommon;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.LocalRuntimeApplication;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.releaseauthoring.GoldenFixtureMaterializationException;
import org.opm.localruntime.releaseauthoring.ReleaseGoldenAuthoringLaunchMode;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.web.context.WebServerApplicationContext;
import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertySource;

import java.io.File;
import java.net.URI;
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

/** 两个动态 loopback connector 和应用完成就绪后，原子发布 Runtime Ready。 */
public final class VisualCommonRuntimeReadyWriter implements ApplicationListener<org.springframework.context.ApplicationEvent> {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<String> ASSET_PATHS = List.of(
            "grammar/representative-opl-grammar.json",
            "normalization/representative-normalization.json",
            "profile.json",
            "rules/representative-rule-set.json",
            "symbols/representative-symbol-catalog.json");
    private static final List<String> ASSET_KINDS = List.of(
            "GRAMMAR_ASSET", "NORMALIZATION_DATA", "PROFILE_PACKAGE", "RULE_SET", "SYMBOL_ASSET");
    private static final List<String> REQUIRED = List.of(
            "spring.profiles.active", "spring.main.web-application-type", "opm.runtime.mode",
            "opm.release.golden-authoring", "opm.release.visual-common.web-runtime",
            "server.address", "server.port", "management.server.address", "management.server.port",
            "management.endpoints.web.exposure.include", "management.endpoint.health.probes.enabled",
            "opm.storage.root", "opm.assets.root", "opm.release.visual-common.request-id",
            "opm.release.visual-common.capture-id", "opm.release.visual-common.subject-id",
            "opm.release.visual-common.attempt-ordinal", "opm.release.visual-common.launch-nonce",
            "opm.release.visual-common.clone-result", "opm.release.visual-common.runtime-ready-out");

    private final ConfigurableEnvironment environment;
    private final ApplicationArguments arguments;
    private final RuntimeJarLocator runtimeJarLocator;
    private Integer applicationPort;
    private Integer managementPort;
    private boolean applicationReady;
    private boolean written;

    public VisualCommonRuntimeReadyWriter(ConfigurableEnvironment environment, ApplicationArguments arguments,
                                          RuntimeJarLocator runtimeJarLocator) {
        this.environment = environment;
        this.arguments = arguments;
        this.runtimeJarLocator = runtimeJarLocator;
    }

    @Override
    public synchronized void onApplicationEvent(org.springframework.context.ApplicationEvent event) {
        if (event instanceof WebServerInitializedEvent initialized) {
            WebServerApplicationContext context = initialized.getApplicationContext();
            if ("management".equals(context.getServerNamespace())) recordManagementPort(initialized.getWebServer().getPort());
            else recordApplicationPort(initialized.getWebServer().getPort());
        } else if (event instanceof ApplicationReadyEvent) {
            applicationReady = true;
        }
        writeIfReady();
    }

    synchronized void recordApplicationPort(int port) {
        applicationPort = port;
    }

    synchronized void recordManagementPort(int port) {
        managementPort = port;
    }

    synchronized void markApplicationReady() {
        applicationReady = true;
        writeIfReady();
    }

    private void writeIfReady() {
        if (written || !applicationReady || applicationPort == null || managementPort == null) return;
        try {
            Request request = request();
            if (applicationPort < 1 || applicationPort > 65535 || managementPort < 1 || managementPort > 65535
                    || applicationPort.equals(managementPort)) {
                throw failure("GOLDEN_COMMON_UI_SETUP_FAILED", "Runtime connector ports are invalid.");
            }
            Clone clone = verifyClone(request);
            List<Map<String, Object>> assets = profileAssets(request.assetsRoot());
            Path runtimeJar = runtimeJarLocator.locate();
            if (!Files.isRegularFile(runtimeJar) || Files.isSymbolicLink(runtimeJar)) {
                throw failure("GOLDEN_COMMON_UI_SETUP_FAILED", "Runtime must be an exact packaged JAR.");
            }
            Map<String, Object> ready = new LinkedHashMap<>();
            ready.put("schema_id", "OPM-DEV-CANVAS-06-COMMON-VISUAL-RUNTIME-READY-001");
            ready.put("schema_version", "0.1");
            ready.put("ready_version", "0.1.0");
            ready.put("status", "READY");
            ready.put("request_id", request.requestId());
            ready.put("capture_id", request.captureId());
            ready.put("subject_id", request.subjectId());
            ready.put("attempt_ordinal", request.attemptOrdinal());
            ready.put("launch_nonce", request.launchNonce());
            ready.put("process_id", ProcessHandle.current().pid());
            ready.put("server_address", "127.0.0.1");
            ready.put("server_port", applicationPort);
            ready.put("management_server_port", managementPort);
            ready.put("runtime_base_url", "http://127.0.0.1:" + applicationPort);
            ready.put("management_base_url", "http://127.0.0.1:" + managementPort);
            ready.put("readiness_path", "/actuator/health/readiness");
            ready.put("bootstrap_path", "/opm-bootstrap.js");
            ready.put("runtime_jar_ref", fileRef("RUNTIME_JAR", runtimeJar.getFileName().toString(), runtimeJar));
            ready.put("profile_asset_refs", assets);
            ready.put("profile_asset_tree_sha256", Rfc8785JsonCanonicalizer.sha256(assets));
            ready.put("clone_result_ref", fileRef("COMMON_CLONE_RESULT", request.cloneResult().getFileName().toString(), request.cloneResult()));
            ready.put("attempt_database_ref", clone.databaseRef());
            ready.put("attempt_tree_sha256_before", clone.attemptTreeSha256());
            ready.put("ready_payload_sha256", Rfc8785JsonCanonicalizer.sha256(ready));
            writeAtomically(request.readyOut(), Rfc8785JsonCanonicalizer.canonicalize(ready).getBytes(StandardCharsets.UTF_8));
            written = true;
        } catch (GoldenFixtureMaterializationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw failure("GOLDEN_COMMON_UI_SETUP_FAILED", "Cannot publish Runtime Ready.", exception);
        }
    }

    static FileProfilePackageLoader verifiedProfilePackageLoader(ConfigurableEnvironment environment) {
        PropertySource<?> source = environment.getPropertySources().get("commandLineArgs");
        if (source == null) throw failure("GOLDEN_COMMON_MODE_REJECTED", "Web Runtime requires command-line arguments.");
        Path root = absolute(source, "opm.assets.root", true);
        try {
            java.util.Set<FileProfilePackageLoader.DirectPackageFile> files = new java.util.LinkedHashSet<>();
            for (int index = 0; index < ASSET_PATHS.size(); index++) {
                Path file = root.resolve(ASSET_PATHS.get(index)).normalize();
                if (!file.startsWith(root) || !Files.isRegularFile(file) || Files.isSymbolicLink(file)) {
                    throw failure("GOLDEN_COMMON_UI_SETUP_FAILED", "Verified Profile asset root is incomplete.");
                }
                files.add(new FileProfilePackageLoader.DirectPackageFile(ASSET_KINDS.get(index), ASSET_PATHS.get(index), Files.size(file), sha256(Files.readAllBytes(file))));
            }
            return FileProfilePackageLoader.forVerifiedDirectPackageRoot(root, files);
        } catch (GoldenFixtureMaterializationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw failure("GOLDEN_COMMON_UI_SETUP_FAILED", "Cannot verify Profile asset root.", exception);
        }
    }

    static Path runtimeJarFromCodeSource() {
        try {
            return runtimeJarFromCodeSourceLocation(LocalRuntimeApplication.class.getProtectionDomain().getCodeSource().getLocation().toString());
        } catch (Exception exception) {
            throw failure("GOLDEN_COMMON_UI_SETUP_FAILED", "Cannot resolve Runtime JAR identity.", exception);
        }
    }

    static Path runtimeJarFromCodeSourceLocation(String location) {
        if (location.startsWith("jar:nested:")) {
            location = location.substring("jar:nested:".length());
            int separator = location.indexOf("/!");
            if (separator >= 0) location = location.substring(0, separator);
        }
        return (location.startsWith("/") ? Path.of(location) : Path.of(URI.create(location))).toAbsolutePath().normalize();
    }

    private Request request() {
        ReleaseGoldenAuthoringLaunchMode.require(environment);
        PropertySource<?> source = environment.getPropertySources().get("commandLineArgs");
        if (source == null) throw failure("GOLDEN_COMMON_MODE_REJECTED", "Web Runtime requires command-line arguments.");
        verifyExact(source);
        String nonce = text(source, "opm.release.visual-common.launch-nonce");
        if (!nonce.matches("[a-f0-9]{64}")) throw failure("GOLDEN_COMMON_MODE_REJECTED", "Launch nonce must be 64 lowercase hexadecimal characters.");
        int attempt = integer(source, "opm.release.visual-common.attempt-ordinal");
        if (attempt != 1 && attempt != 2) throw failure("GOLDEN_COMMON_MODE_REJECTED", "Attempt ordinal must be one or two.");
        return new Request(text(source, "opm.release.visual-common.request-id"), text(source, "opm.release.visual-common.capture-id"),
                text(source, "opm.release.visual-common.subject-id"), attempt, nonce,
                absolute(source, "opm.storage.root", true), absolute(source, "opm.assets.root", true),
                absolute(source, "opm.release.visual-common.clone-result", true), absolute(source, "opm.release.visual-common.runtime-ready-out", false));
    }

    private void verifyExact(PropertySource<?> source) {
        String[] raw = arguments.getSourceArgs();
        for (String key : REQUIRED) {
            Object value = source.getProperty(key);
            long count = Arrays.stream(raw).filter(argument -> argument.startsWith("--" + key + "=")).count();
            if (value == null || count != 1 || !Arrays.asList(raw).contains("--" + key + "=" + value)) {
                throw failure("GOLDEN_COMMON_MODE_REJECTED", "Web Runtime argument is missing, duplicated, or not exact: " + key);
            }
        }
        require(source, "server.address", "127.0.0.1");
        require(source, "server.port", "0");
        require(source, "management.server.address", "127.0.0.1");
        require(source, "management.server.port", "0");
        require(source, "management.endpoints.web.exposure.include", "health");
        require(source, "management.endpoint.health.probes.enabled", "true");
        for (String argument : raw) {
            if (!argument.startsWith("--opm.release.visual-common.")) continue;
            String key = argument.substring(2, argument.indexOf('='));
            if (!REQUIRED.contains(key) && !key.startsWith("opm.release.visual-common.fault-")) {
                throw failure("GOLDEN_COMMON_MODE_REJECTED", "Unexpected Common Visual Web Runtime argument.");
            }
        }
    }

    private Clone verifyClone(Request request) throws Exception {
        if (!Files.isRegularFile(request.cloneResult()) || Files.isSymbolicLink(request.cloneResult())
                || !Files.isDirectory(request.storageRoot()) || Files.isSymbolicLink(request.storageRoot())) {
            throw failure("GOLDEN_COMMON_UI_SETUP_FAILED", "Clone Result or attempt storage is unsafe.");
        }
        JsonNode clone = JSON.readTree(Files.readAllBytes(request.cloneResult()));
        if (!clone.isObject() || !"READY_FOR_RUNTIME".equals(text(clone, "status"))
                || !request.requestId().equals(text(clone, "request_id")) || !request.captureId().equals(text(clone, "capture_id"))
                || !request.subjectId().equals(text(clone, "subject_id")) || request.attemptOrdinal() != integer(clone, "attempt_ordinal")) {
            throw failure("GOLDEN_COMMON_UI_SETUP_FAILED", "Clone Result identity differs from Web Runtime request.");
        }
        JsonNode ref = clone.path("attempt_database_ref");
        String relative = text(ref, "path");
        Path database = request.storageRoot().resolve(relative).normalize();
        if (!database.startsWith(request.storageRoot()) || !Files.isRegularFile(database) || Files.isSymbolicLink(database)
                || Files.size(database) != integer(ref, "byte_length") || !sha256(Files.readAllBytes(database)).equals(text(ref, "sha256"))
                || Files.exists(database.resolveSibling(database.getFileName() + "-wal")) || Files.exists(database.resolveSibling(database.getFileName() + "-shm"))) {
            throw failure("GOLDEN_COMMON_UI_SETUP_FAILED", "Attempt database differs from Clone Result.");
        }
        String tree = treeDigest(request.storageRoot());
        if (!tree.equals(text(clone, "attempt_tree_sha256"))) {
            throw failure("GOLDEN_COMMON_UI_SETUP_FAILED", "Attempt storage tree differs from Clone Result.");
        }
        return new Clone(fileRef("PROJECT_DB", relative, database), tree);
    }

    private List<Map<String, Object>> profileAssets(Path root) throws Exception {
        List<Map<String, Object>> refs = new java.util.ArrayList<>();
        for (int index = 0; index < ASSET_PATHS.size(); index++) {
            Path asset = root.resolve(ASSET_PATHS.get(index)).normalize();
            if (!asset.startsWith(root) || !Files.isRegularFile(asset) || Files.isSymbolicLink(asset)) {
                throw failure("GOLDEN_COMMON_UI_SETUP_FAILED", "Profile asset differs from verified root.");
            }
            refs.add(fileRef(ASSET_KINDS.get(index), ASSET_PATHS.get(index), asset));
        }
        return List.copyOf(refs);
    }

    private void writeAtomically(Path target, byte[] bytes) throws Exception {
        Path parent = target.getParent();
        if (parent == null || !Files.isDirectory(parent) || Files.isSymbolicLink(parent) || Files.exists(target)) {
            throw failure("GOLDEN_COMMON_UI_SETUP_FAILED", "Runtime Ready destination is not fresh.");
        }
        Path temporary = parent.resolve("." + target.getFileName() + ".tmp");
        if (Files.exists(temporary) || Files.isSymbolicLink(temporary)) {
            throw failure("GOLDEN_COMMON_UI_SETUP_FAILED", "Runtime Ready temporary path is not fresh.");
        }
        try {
            try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                channel.write(ByteBuffer.wrap(bytes));
                channel.force(true);
            }
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
            try (FileChannel directory = FileChannel.open(parent, StandardOpenOption.READ)) { directory.force(true); }
        } catch (Exception exception) {
            Files.deleteIfExists(temporary);
            throw failure("GOLDEN_COMMON_UI_SETUP_FAILED", "Cannot atomically write Runtime Ready.", exception);
        }
    }

    private static Path absolute(PropertySource<?> source, String key, boolean exists) {
        String raw = text(source, key);
        Path path = Path.of(raw).toAbsolutePath().normalize();
        if (!Path.of(raw).isAbsolute() || path.equals(path.getRoot()) || (exists && !Files.exists(path))) {
            throw failure("GOLDEN_COMMON_MODE_REJECTED", "Path is invalid: " + key);
        }
        return path;
    }

    private static String text(PropertySource<?> source, String key) {
        Object value = source.getProperty(key);
        if (value == null || value.toString().isBlank()) throw failure("GOLDEN_COMMON_MODE_REJECTED", "Missing " + key);
        return value.toString();
    }

    private static String text(JsonNode node, String key) {
        JsonNode value = node.get(key);
        if (value == null || !value.isTextual() || value.asText().isBlank()) throw failure("GOLDEN_COMMON_UI_SETUP_FAILED", "Invalid artifact field: " + key);
        return value.asText();
    }

    private static int integer(PropertySource<?> source, String key) {
        try { return Integer.parseInt(text(source, key)); } catch (NumberFormatException exception) { throw failure("GOLDEN_COMMON_MODE_REJECTED", "Invalid integer: " + key, exception); }
    }

    private static long integer(JsonNode node, String key) {
        JsonNode value = node.get(key);
        if (value == null || !value.canConvertToLong() || value.longValue() < 0) throw failure("GOLDEN_COMMON_UI_SETUP_FAILED", "Invalid artifact integer: " + key);
        return value.longValue();
    }

    private static void require(PropertySource<?> source, String key, String expected) {
        if (!expected.equals(text(source, key))) throw failure("GOLDEN_COMMON_MODE_REJECTED", "Unexpected " + key);
    }

    private static Map<String, Object> fileRef(String kind, String path, Path file) throws Exception {
        return Map.of("kind", kind, "path", path.replace(File.separatorChar, '/'), "byte_length", Files.size(file), "sha256", sha256(Files.readAllBytes(file)));
    }

    private static String treeDigest(Path root) throws Exception {
        Map<String, String> files = new java.util.TreeMap<>();
        try (var paths = Files.walk(root)) {
            for (Path file : paths.filter(Files::isRegularFile).toList()) {
                if (Files.isSymbolicLink(file)) throw failure("GOLDEN_COMMON_UI_SETUP_FAILED", "Storage contains a symbolic link.");
                files.put(root.relativize(file).toString().replace(File.separatorChar, '/'), sha256(Files.readAllBytes(file)));
            }
        }
        return Rfc8785JsonCanonicalizer.sha256(files);
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

    @FunctionalInterface
    interface RuntimeJarLocator { Path locate(); }

    private record Request(String requestId, String captureId, String subjectId, int attemptOrdinal, String launchNonce,
                           Path storageRoot, Path assetsRoot, Path cloneResult, Path readyOut) { }
    private record Clone(Map<String, Object> databaseRef, String attemptTreeSha256) { }
}
