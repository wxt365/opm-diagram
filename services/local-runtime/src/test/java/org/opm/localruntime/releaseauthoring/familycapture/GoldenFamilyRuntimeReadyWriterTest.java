package org.opm.localruntime.releaseauthoring.familycapture;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GoldenFamilyRuntimeReadyWriterTest {

    private static final long EPOCH = 1782864000L;
    private static final ObjectMapper JSON = new ObjectMapper();

    @TempDir
    Path temporaryDirectory;

    @Test
    void writesReadyOnlyAfterBothPortsAndClosedCloneInputs() throws Exception {
        Fixture fixture = fixture();
        GoldenFamilyRuntimeReadyWriter writer = writer(fixture);

        writer.recordApplicationPort(18181);
        writer.recordManagementPort(18182);
        writer.markApplicationReady();

        assertTrue(Files.isRegularFile(fixture.readyPath()));
        Map<?, ?> ready = JSON.readValue(Files.readAllBytes(fixture.readyPath()), Map.class);
        assertEquals("READY_FOR_BROWSER", ready.get("status"));
        assertEquals("capture-001", ready.get("capture_id"));
        assertEquals(18181, ready.get("server_port"));
        assertEquals(18182, ready.get("management_server_port"));
        assertEquals("http://127.0.0.1:18181", ready.get("runtime_base_url"));
    }

    @Test
    void rejectsClonePayloadDriftWithoutWritingReady() throws Exception {
        Fixture fixture = fixture();
        Map<String, Object> clone = JSON.readValue(Files.readAllBytes(fixture.clonePath()), Map.class);
        clone.put("capture_id", "tampered");
        JSON.writeValue(fixture.clonePath().toFile(), clone);
        GoldenFamilyRuntimeReadyWriter writer = writer(fixture);

        writer.recordApplicationPort(18181);
        writer.recordManagementPort(18182);
        assertThrows(RuntimeException.class, writer::markApplicationReady);

        assertFalse(Files.exists(fixture.readyPath()));
    }

    private Fixture fixture() throws Exception {
        Path storage = temporaryDirectory.resolve("attempt/storage");
        Path database = storage.resolve("projects/project.golden.fixture." + "a".repeat(64)).resolve("project.db");
        Files.createDirectories(database.getParent());
        Files.writeString(database, "database");
        Path identity = temporaryDirectory.resolve("attempt/inputs/family-capture-identity.json");
        Files.createDirectories(identity.getParent());
        Files.writeString(identity, "identity");
        Path clone = temporaryDirectory.resolve("attempt/clone-result.json");
        Map<String, Object> clonePayload = new LinkedHashMap<>();
        clonePayload.put("schema_id", "OPM-DEV-CANVAS-06-GOLDEN-FAMILY-CLONE-RESULT-001");
        clonePayload.put("schema_version", "0.1");
        clonePayload.put("result_version", "0.1.0");
        clonePayload.put("status", "READY_FOR_RUNTIME");
        clonePayload.put("capture_id", "capture-001");
        clonePayload.put("attempt_ordinal", 1);
        clonePayload.put("source_date_epoch", EPOCH);
        clonePayload.put("family_capture_identity_ref", ref("FAMILY_CAPTURE_IDENTITY", "inputs/family-capture-identity.json", identity));
        clonePayload.put("materialization_report_ref", ref("MATERIALIZATION_REPORT", "reports/key.json", identity));
        clonePayload.put("materialized_identity", Map.of("project_id", "project.golden.fixture." + "a".repeat(64), "model_id", "model-001", "revision_id", "revision-001", "revision_sequence", 1, "draft_head_revision_id", "revision-001", "head_sequence", 1, "history_mode", "SINGLE_REVISION_SNAPSHOT"));
        clonePayload.put("base_database_ref", ref("DATABASE", "fixtures/key/storage/project.db", database));
        clonePayload.put("base_tree_sha256_before", "a".repeat(64));
        clonePayload.put("base_tree_sha256_after", "a".repeat(64));
        clonePayload.put("attempt_database_ref", ref("PROJECT_DB", "projects/project.golden.fixture." + "a".repeat(64) + "/project.db", database));
        clonePayload.put("attempt_tree_sha256", treeDigest(storage));
        clonePayload.put("result_payload_sha256", Rfc8785JsonCanonicalizer.sha256(clonePayload));
        JSON.writeValue(clone.toFile(), clonePayload);
        Path assets = temporaryDirectory.resolve("assets");
        for (String path : List.of("grammar/representative-opl-grammar.json", "normalization/representative-normalization.json", "profile.json", "rules/representative-rule-set.json", "symbols/representative-symbol-catalog.json")) {
            Path asset = assets.resolve(path); Files.createDirectories(asset.getParent()); Files.writeString(asset, path);
        }
        Path jar = temporaryDirectory.resolve("local-runtime.jar");
        Files.writeString(jar, "jar");
        Path ready = temporaryDirectory.resolve("attempt/runtime-ready.json");
        return new Fixture(storage, identity, clone, assets, jar, ready);
    }

    private GoldenFamilyRuntimeReadyWriter writer(Fixture fixture) {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("spring.profiles.active", "release-golden-authoring");
        properties.put("spring.main.web-application-type", "servlet");
        properties.put("opm.runtime.mode", "RELEASE_GOLDEN_FAMILY_WEB");
        properties.put("opm.release.golden-authoring", "true");
        properties.put("opm.release.golden-family.web-runtime", "true");
        properties.put("server.address", "127.0.0.1");
        properties.put("server.port", "0");
        properties.put("management.server.address", "127.0.0.1");
        properties.put("management.server.port", "0");
        properties.put("management.endpoints.web.exposure.include", "health");
        properties.put("management.endpoint.health.probes.enabled", "true");
        properties.put("opm.storage.root", fixture.storage().toString());
        properties.put("opm.assets.root", fixture.assets().toString());
        properties.put("opm.release.golden-family.capture-id", "capture-001");
        properties.put("opm.release.golden-family.attempt-ordinal", "1");
        properties.put("opm.release.golden-family.capture-identity", fixture.identity().toString());
        properties.put("opm.release.golden-family.clone-result", fixture.clonePath().toString());
        properties.put("opm.release.golden-family.runtime-ready-out", fixture.readyPath().toString());
        properties.put("opm.release.golden-family.launch-nonce", "b".repeat(64));
        properties.put("opm.release.source-date-epoch", String.valueOf(EPOCH));
        String[] args = properties.entrySet().stream().map(entry -> "--" + entry.getKey() + "=" + entry.getValue()).toArray(String[]::new);
        StandardEnvironment environment = new StandardEnvironment();
        environment.setActiveProfiles("release-golden-authoring");
        environment.getPropertySources().addFirst(new MapPropertySource("commandLineArgs", properties));
        return new GoldenFamilyRuntimeReadyWriter(environment, new DefaultApplicationArguments(args), fixture::jar);
    }

    private Map<String, Object> ref(String kind, String path, Path file) throws Exception {
        return Map.of("kind", kind, "path", path, "byte_length", Files.size(file), "sha256", sha(Files.readAllBytes(file)));
    }

    private String treeDigest(Path root) throws Exception {
        Map<String, String> entries = new TreeMap<>();
        try (var files = Files.walk(root)) {
            for (Path file : files.filter(Files::isRegularFile).toList()) entries.put(root.relativize(file).toString(), sha(Files.readAllBytes(file)));
        }
        return Rfc8785JsonCanonicalizer.sha256(entries);
    }

    private String sha(byte[] bytes) throws Exception {
        return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private record Fixture(Path storage, Path identity, Path clonePath, Path assets, Path jar, Path readyPath) { }
}
