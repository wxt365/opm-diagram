package org.opm.localruntime.releaseauthoring.familycapture;

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
import java.util.TreeMap;

/** Family Web Runtime 在两个 loopback connector 和应用就绪后原子发布 Ready artifact。 */
public final class GoldenFamilyRuntimeReadyWriter implements ApplicationListener<org.springframework.context.ApplicationEvent> {

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
            "opm.release.golden-authoring", "opm.release.golden-family.web-runtime",
            "server.address", "server.port", "management.server.address", "management.server.port",
            "management.endpoints.web.exposure.include", "management.endpoint.health.probes.enabled",
            "opm.storage.root", "opm.assets.root", "opm.release.golden-family.capture-id",
            "opm.release.golden-family.attempt-ordinal", "opm.release.golden-family.capture-identity",
            "opm.release.golden-family.clone-result", "opm.release.golden-family.runtime-ready-out",
            "opm.release.golden-family.launch-nonce", "opm.release.source-date-epoch");

    private final ConfigurableEnvironment environment;
    private final ApplicationArguments arguments;
    private final RuntimeJarLocator runtimeJarLocator;
    private Integer applicationPort;
    private Integer managementPort;
    private boolean applicationReady;
    private boolean written;

    public GoldenFamilyRuntimeReadyWriter(ConfigurableEnvironment environment, ApplicationArguments arguments,
                                          RuntimeJarLocator runtimeJarLocator) {
        this.environment = environment;
        this.arguments = arguments;
        this.runtimeJarLocator = runtimeJarLocator;
    }

    @Override
    public synchronized void onApplicationEvent(org.springframework.context.ApplicationEvent event) {
        if (event instanceof WebServerInitializedEvent initialized) {
            WebServerApplicationContext context = initialized.getApplicationContext();
            if ("management".equals(context.getServerNamespace())) managementPort = initialized.getWebServer().getPort();
            else applicationPort = initialized.getWebServer().getPort();
        } else if (event instanceof ApplicationReadyEvent) {
            applicationReady = true;
        }
        writeIfReady();
    }

    synchronized void recordApplicationPort(int port) { applicationPort = port; }

    synchronized void recordManagementPort(int port) { managementPort = port; }

    synchronized void markApplicationReady() { applicationReady = true; writeIfReady(); }

    private void writeIfReady() {
        if (written || !applicationReady || applicationPort == null || managementPort == null) return;
        try {
            Request request = request();
            if (applicationPort < 1024 || applicationPort > 65535 || managementPort < 1024 || managementPort > 65535
                    || applicationPort.equals(managementPort)) {
                throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Runtime connector ports are invalid.");
            }
            Clone clone = verifyClone(request);
            List<Map<String, Object>> assets = profileAssets(request.assetsRoot());
            Path runtimeJar = runtimeJarLocator.locate();
            if (!safeFile(runtimeJar)) throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Runtime must be an exact packaged JAR.");
            Map<String, Object> ready = new LinkedHashMap<>();
            ready.put("schema_id", "OPM-DEV-CANVAS-06-GOLDEN-FAMILY-RUNTIME-READY-001");
            ready.put("schema_version", "0.1");
            ready.put("ready_version", "0.1.0");
            ready.put("status", "READY_FOR_BROWSER");
            ready.put("capture_id", request.captureId());
            ready.put("attempt_ordinal", request.attemptOrdinal());
            ready.put("source_date_epoch", request.sourceDateEpoch());
            ready.put("launch_nonce", request.launchNonce());
            ready.put("process_id", ProcessHandle.current().pid());
            ready.put("runtime_jar_ref", fileRef("RUNTIME_JAR", runtimeJar.getFileName().toString(), runtimeJar));
            ready.put("profile_asset_refs", assets);
            ready.put("profile_asset_tree_sha256", Rfc8785JsonCanonicalizer.sha256(assets));
            ready.put("family_capture_identity_ref", fileRef("FAMILY_CAPTURE_IDENTITY", "inputs/family-capture-identity.json", request.identityPath()));
            ready.put("clone_result_ref", fileRef("FAMILY_CLONE_RESULT", "clone-result.json", request.cloneResult()));
            ready.put("attempt_database_ref", clone.databaseRef());
            ready.put("attempt_tree_sha256_before", clone.attemptTreeSha256());
            ready.put("server_port", applicationPort);
            ready.put("management_server_port", managementPort);
            ready.put("runtime_base_url", "http://127.0.0.1:" + applicationPort);
            ready.put("management_base_url", "http://127.0.0.1:" + managementPort);
            ready.put("readiness_path", "/actuator/health/readiness");
            ready.put("bootstrap_path", "/opm-bootstrap.js");
            ready.put("ready_payload_sha256", Rfc8785JsonCanonicalizer.sha256(ready));
            writeAtomically(request.readyOut(), Rfc8785JsonCanonicalizer.canonicalize(ready).getBytes(StandardCharsets.UTF_8));
            written = true;
        } catch (GoldenFixtureMaterializationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw failure("GOLDEN_FAMILY_CAPTURE_INTERNAL_ERROR", "Cannot publish Family Runtime Ready.", exception);
        }
    }

    static FileProfilePackageLoader verifiedProfilePackageLoader(ConfigurableEnvironment environment) {
        PropertySource<?> source = environment.getPropertySources().get("commandLineArgs");
        if (source == null) throw failure("GOLDEN_FAMILY_MODE_REJECTED", "Family Web Runtime requires command-line arguments.");
        Path root = absolute(source, "opm.assets.root", true);
        try {
            java.util.Set<FileProfilePackageLoader.DirectPackageFile> files = new java.util.LinkedHashSet<>();
            for (int index = 0; index < ASSET_PATHS.size(); index++) {
                Path file = root.resolve(ASSET_PATHS.get(index)).normalize();
                if (!file.startsWith(root) || !safeFile(file)) {
                    throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Verified Profile asset root is incomplete.");
                }
                files.add(new FileProfilePackageLoader.DirectPackageFile(ASSET_KINDS.get(index), ASSET_PATHS.get(index),
                        Files.size(file), sha256(Files.readAllBytes(file))));
            }
            return FileProfilePackageLoader.forVerifiedDirectPackageRoot(root, files);
        } catch (GoldenFixtureMaterializationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw failure("GOLDEN_FAMILY_CAPTURE_INTERNAL_ERROR", "Cannot verify Family Profile asset root.", exception);
        }
    }

    static Path runtimeJarFromCodeSource() {
        try {
            return runtimeJarFromCodeSourceLocation(LocalRuntimeApplication.class.getProtectionDomain().getCodeSource().getLocation().toString());
        } catch (Exception exception) {
            throw failure("GOLDEN_FAMILY_CAPTURE_INTERNAL_ERROR", "Cannot resolve Runtime JAR identity.", exception);
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
        if (ReleaseGoldenAuthoringLaunchMode.require(environment)
                != ReleaseGoldenAuthoringLaunchMode.RELEASE_GOLDEN_FAMILY_WEB) {
            throw failure("GOLDEN_FAMILY_MODE_REJECTED", "Family Web Runtime mode is required.");
        }
        PropertySource<?> source = environment.getPropertySources().get("commandLineArgs");
        if (source == null) throw failure("GOLDEN_FAMILY_MODE_REJECTED", "Family Web Runtime requires command-line arguments.");
        verifyExact(source);
        String nonce = text(source, "opm.release.golden-family.launch-nonce");
        if (!nonce.matches("[a-f0-9]{64}")) throw failure("GOLDEN_FAMILY_MODE_REJECTED", "Launch nonce must be 64 lowercase hexadecimal characters.");
        int ordinal = integer(source, "opm.release.golden-family.attempt-ordinal");
        if (ordinal != 1 && ordinal != 2) throw failure("GOLDEN_FAMILY_MODE_REJECTED", "Attempt ordinal must be one or two.");
        return new Request(text(source, "opm.release.golden-family.capture-id"), ordinal, nonce,
                absolute(source, "opm.release.golden-family.capture-identity", true),
                absolute(source, "opm.storage.root", true), absolute(source, "opm.assets.root", true),
                absolute(source, "opm.release.golden-family.clone-result", true),
                absolute(source, "opm.release.golden-family.runtime-ready-out", false),
                nonNegative(source, "opm.release.source-date-epoch"));
    }

    private void verifyExact(PropertySource<?> source) {
        String[] raw = arguments.getSourceArgs();
        for (String key : REQUIRED) {
            Object value = source.getProperty(key);
            long count = Arrays.stream(raw).filter(argument -> argument.startsWith("--" + key + "=")).count();
            if (value == null || count != 1 || !Arrays.asList(raw).contains("--" + key + "=" + value)) {
                throw failure("GOLDEN_FAMILY_MODE_REJECTED", "Family Web Runtime argument is missing, duplicated, or not exact: " + key);
            }
        }
        require(source, "server.address", "127.0.0.1");
        require(source, "server.port", "0");
        require(source, "management.server.address", "127.0.0.1");
        require(source, "management.server.port", "0");
        require(source, "management.endpoints.web.exposure.include", "health");
        require(source, "management.endpoint.health.probes.enabled", "true");
        for (String argument : raw) {
            if (!argument.startsWith("--opm.release.golden-family.")) continue;
            String key = argument.substring(2, argument.indexOf('='));
            if (!REQUIRED.contains(key)) throw failure("GOLDEN_FAMILY_MODE_REJECTED", "Unexpected Family Web Runtime argument.");
        }
    }

    private Clone verifyClone(Request request) throws Exception {
        if (!safeFile(request.cloneResult()) || !safeFile(request.identityPath())
                || !"clone-result.json".equals(request.cloneResult().getFileName().toString())
                || !"family-capture-identity.json".equals(request.identityPath().getFileName().toString())
                || !safeDirectory(request.storageRoot())) {
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Clone Result, identity, or attempt storage is unsafe.");
        }
        JsonNode clone = JSON.readTree(Files.readAllBytes(request.cloneResult()));
        if (!clone.isObject() || !"OPM-DEV-CANVAS-06-GOLDEN-FAMILY-CLONE-RESULT-001".equals(text(clone, "schema_id"))
                || !"READY_FOR_RUNTIME".equals(text(clone, "status"))
                || !request.captureId().equals(text(clone, "capture_id")) || request.attemptOrdinal() != integer(clone, "attempt_ordinal")
                || request.sourceDateEpoch() != integer(clone, "source_date_epoch")) {
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Clone Result identity differs from Web Runtime request.");
        }
        Map<String, Object> clonePayload = JSON.convertValue(clone, Map.class);
        String payloadDigest = text(clone, "result_payload_sha256");
        clonePayload.remove("result_payload_sha256");
        if (!payloadDigest.equals(Rfc8785JsonCanonicalizer.sha256(clonePayload))
                || !same(fileRef("FAMILY_CAPTURE_IDENTITY", "inputs/family-capture-identity.json", request.identityPath()), clone.required("family_capture_identity_ref"))) {
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Clone Result payload or identity reference differs.");
        }
        JsonNode databaseRef = clone.required("attempt_database_ref");
        String relative = text(databaseRef, "path");
        Path database = request.storageRoot().resolve(relative).normalize();
        if (!database.startsWith(request.storageRoot()) || !safeFile(database)
                || !same(fileRef("PROJECT_DB", relative, database), databaseRef)
                || Files.exists(database.resolveSibling(database.getFileName() + "-wal"))
                || Files.exists(database.resolveSibling(database.getFileName() + "-shm"))) {
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Attempt database differs from Clone Result.");
        }
        String tree = treeDigest(request.storageRoot());
        if (!tree.equals(text(clone, "attempt_tree_sha256"))) {
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Attempt storage tree differs from Clone Result.");
        }
        return new Clone(fileRef("PROJECT_DB", relative, database), tree);
    }

    private List<Map<String, Object>> profileAssets(Path root) throws Exception {
        List<Map<String, Object>> refs = new java.util.ArrayList<>();
        for (int index = 0; index < ASSET_PATHS.size(); index++) {
            Path asset = root.resolve(ASSET_PATHS.get(index)).normalize();
            if (!asset.startsWith(root) || !safeFile(asset)) {
                throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Profile asset differs from verified root.");
            }
            refs.add(fileRef(ASSET_KINDS.get(index), ASSET_PATHS.get(index), asset));
        }
        return List.copyOf(refs);
    }

    private static void writeAtomically(Path target, byte[] bytes) throws Exception {
        Path parent = target.getParent();
        if (parent == null || !safeDirectory(parent) || Files.exists(target)) {
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Runtime Ready destination is not fresh.");
        }
        Path temporary = parent.resolve("." + target.getFileName() + ".tmp");
        if (Files.exists(temporary) || Files.isSymbolicLink(temporary)) {
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Runtime Ready temporary path is not fresh.");
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
            if (exception instanceof GoldenFixtureMaterializationException materialization) throw materialization;
            throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Cannot atomically write Family Runtime Ready.", exception);
        }
    }

    private static Path absolute(PropertySource<?> source, String key, boolean exists) {
        String raw = text(source, key);
        Path path = Path.of(raw).toAbsolutePath().normalize();
        if (!Path.of(raw).isAbsolute() || path.equals(path.getRoot()) || (exists && !Files.exists(path))) {
            throw failure("GOLDEN_FAMILY_MODE_REJECTED", "Path is invalid: " + key);
        }
        return path;
    }

    private static boolean safeDirectory(Path path) { return path != null && Files.isDirectory(path) && !Files.isSymbolicLink(path); }

    private static boolean safeFile(Path path) { return path != null && Files.isRegularFile(path) && !Files.isSymbolicLink(path); }

    private static boolean same(Map<String, Object> left, JsonNode right) {
        return Rfc8785JsonCanonicalizer.canonicalize(left).equals(Rfc8785JsonCanonicalizer.canonicalize(right));
    }

    private static Map<String, Object> fileRef(String kind, String path, Path file) throws Exception {
        return Map.of("kind", kind, "path", path.replace(File.separatorChar, '/'), "byte_length", Files.size(file), "sha256", sha256(Files.readAllBytes(file)));
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

    private static String text(PropertySource<?> source, String key) {
        Object value = source.getProperty(key);
        if (value == null || value.toString().isBlank()) throw failure("GOLDEN_FAMILY_MODE_REJECTED", "Missing " + key);
        return value.toString();
    }

    private static String text(JsonNode node, String key) {
        JsonNode value = node.get(key);
        if (value == null || !value.isTextual() || value.asText().isBlank()) throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Invalid artifact field: " + key);
        return value.asText();
    }

    private static int integer(PropertySource<?> source, String key) {
        try { return Integer.parseInt(text(source, key)); }
        catch (NumberFormatException exception) { throw failure("GOLDEN_FAMILY_MODE_REJECTED", "Invalid integer: " + key, exception); }
    }

    private static long integer(JsonNode node, String key) {
        JsonNode value = node.get(key);
        if (value == null || !value.canConvertToLong() || value.longValue() < 0) throw failure("GOLDEN_FAMILY_CAPTURE_FAILED", "Invalid artifact integer: " + key);
        return value.longValue();
    }

    private static long nonNegative(PropertySource<?> source, String key) {
        try { long value = Long.parseLong(text(source, key)); if (value < 0) throw new NumberFormatException(); return value; }
        catch (NumberFormatException exception) { throw failure("GOLDEN_FAMILY_MODE_REJECTED", "Invalid non-negative integer: " + key, exception); }
    }

    private static void require(PropertySource<?> source, String key, String expected) {
        if (!expected.equals(text(source, key))) throw failure("GOLDEN_FAMILY_MODE_REJECTED", "Unexpected " + key);
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

    private record Request(String captureId, int attemptOrdinal, String launchNonce, Path identityPath, Path storageRoot,
                           Path assetsRoot, Path cloneResult, Path readyOut, long sourceDateEpoch) { }

    private record Clone(Map<String, Object> databaseRef, String attemptTreeSha256) { }
}
