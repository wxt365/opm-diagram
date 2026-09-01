package org.opm.localruntime.releaseauthoring.familycapture;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.releaseauthoring.GoldenFixtureSeedRepository;
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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GoldenFamilyCloneRunnerTest {

    private static final long EPOCH = 1782864000L;
    private static final ObjectMapper JSON = new ObjectMapper();

    @TempDir
    Path temporaryDirectory;

    @Test
    void clonesExactFamilyMaterializationBaseAndWritesClosedResult() throws Exception {
        Fixture fixture = createFixture();
        Path attempt = temporaryDirectory.resolve("attempts/capture-001/1/storage");
        Path result = temporaryDirectory.resolve("attempts/capture-001/1/clone-result.json");
        Files.createDirectories(result.getParent());

        GoldenFamilyCloneRunner runner = runner(fixture, attempt, result);
        runner.run(null);

        assertEquals(0, runner.getExitCode());
        assertTrue(Files.isRegularFile(attempt.resolve("projects").resolve(fixture.projectId()).resolve("project.db")));
        Map<?, ?> clone = JSON.readValue(Files.readAllBytes(result), Map.class);
        assertEquals("READY_FOR_RUNTIME", clone.get("status"));
        assertEquals("capture-001", clone.get("capture_id"));
        assertEquals(1, clone.get("attempt_ordinal"));
        assertEquals(clone.get("base_tree_sha256_before"), clone.get("base_tree_sha256_after"));
    }

    @Test
    void rejectsReportOutsideTheFixedMaterializationLayoutWithoutWritingAttempt() throws Exception {
        Fixture fixture = createFixture();
        Path report = fixture.materializationRoot().resolve("reports").resolve(fixture.fixtureKey() + ".json");
        Map<String, Object> identity = JSON.readValue(Files.readAllBytes(fixture.identityPath()), Map.class);
        Map<String, Object> reportRef = new LinkedHashMap<>((Map<String, Object>) identity.get("materialization_report_ref"));
        reportRef.put("path", "other/" + fixture.fixtureKey() + ".json");
        identity.put("materialization_report_ref", reportRef);
        identity.put("identity_payload_sha256", payloadSha(identity, "identity_payload_sha256"));
        JSON.writeValue(fixture.identityPath().toFile(), identity);
        Path attempt = temporaryDirectory.resolve("attempts/capture-001/1/storage");
        Path result = temporaryDirectory.resolve("attempts/capture-001/1/clone-result.json");
        Files.createDirectories(result.getParent());

        GoldenFamilyCloneRunner runner = runner(fixture, attempt, result);
        runner.run(null);

        assertEquals(3, runner.getExitCode());
        assertFalse(Files.exists(attempt));
        assertFalse(Files.exists(result));
        assertTrue(Files.isRegularFile(report));
    }

    private Fixture createFixture() throws Exception {
        byte[] bytes = Files.readAllBytes(Path.of("..", "..", "packages", "profiles", "profile.iso19450.2024.draft", "0.2.0", "golden", "fixtures", "g-opl-proc-001-consumption-object-pass.json"));
        Map<String, Object> fixtureRef = new LinkedHashMap<>();
        fixtureRef.put("path", "fixtures/family-001.json");
        fixtureRef.put("byte_length", bytes.length);
        fixtureRef.put("sha256", sha(bytes));
        fixtureRef.put("bundle_sha256", "a".repeat(64));
        fixtureRef.put("archive_entry_path", "fixtures/family-001.json");
        String key = Rfc8785JsonCanonicalizer.sha256(fixtureRef);
        Path root = temporaryDirectory.resolve("materialization");
        Path storage = root.resolve("fixtures").resolve(key).resolve("storage");
        GoldenFixtureSeedRepository.MaterializedFixture materialized = new GoldenFixtureSeedRepository().materialize(storage, bytes, sha(bytes), EPOCH);
        Map<String, Object> materializedIdentity = Map.of(
                "project_id", materialized.projectId(), "model_id", materialized.modelId(),
                "revision_id", materialized.revisionId(), "revision_sequence", materialized.revisionSequence(),
                "draft_head_revision_id", materialized.revisionId(), "head_sequence", materialized.revisionSequence(),
                "history_mode", materialized.historyMode());
        String databasePath = "fixtures/" + key + "/storage/projects/" + materialized.projectId() + "/project.db";
        Path database = root.resolve(databasePath);
        Map<String, Object> databaseRef = fileRef("DATABASE", databasePath, database);
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("report_status", "MATERIALIZED");
        report.put("fixture_ref_key", key);
        report.put("source_fixture_ref", fixtureRef);
        report.put("materialized_identity", materializedIdentity);
        report.put("source_date_epoch", EPOCH);
        report.put("target_storage", Map.of("storage_root", "fixtures/" + key + "/storage", "database_ref", databaseRef,
                "database_sha256", databaseRef.get("sha256")));
        Path reportPath = root.resolve("reports").resolve(key + ".json");
        Files.createDirectories(reportPath.getParent());
        JSON.writeValue(reportPath.toFile(), report);
        Path identityPath = temporaryDirectory.resolve("inputs/family-capture-identity.json");
        Files.createDirectories(identityPath.getParent());
        Map<String, Object> identity = new LinkedHashMap<>();
        identity.put("schema_id", "OPM-DEV-CANVAS-06-GOLDEN-FAMILY-CAPTURE-IDENTITY-001");
        identity.put("schema_version", "0.1");
        identity.put("identity_version", "0.1.0");
        identity.put("capture_id", "capture-001");
        identity.put("attempt_ordinal", 1);
        identity.put("source_date_epoch", EPOCH);
        identity.put("fixture_ref", fixtureRef);
        identity.put("materialization_report_ref", fileRef("MATERIALIZATION_REPORT", "materialization/reports/" + key + ".json", reportPath));
        identity.put("materialized_identity", materializedIdentity);
        identity.put("model_id", materialized.modelId());
        identity.put("revision_id", materialized.revisionId());
        identity.put("revision_sequence", materialized.revisionSequence());
        identity.put("context_id", "context.root");
        identity.put("capability_id", "CAP-ISO-PROC-001");
        identity.put("viewport_id", "VP-1440X900");
        identity.put("zoom_id", "Z-100");
        identity.put("expected_projection_sha256", "b".repeat(64));
        identity.put("focus_target_id", "process-001");
        identity.put("focus_anchor", "CENTER");
        identity.put("expected_cells", 1);
        identity.put("critical_regions", List.of(Map.of("region_id", "focus", "kind", "FOCUS_BBOX")));
        identity.put("identity_payload_sha256", payloadSha(identity, "identity_payload_sha256"));
        JSON.writeValue(identityPath.toFile(), identity);
        return new Fixture(root, storage, identityPath, key, materialized.projectId());
    }

    private GoldenFamilyCloneRunner runner(Fixture fixture, Path attempt, Path result) {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("spring.profiles.active", "release-golden-authoring");
        properties.put("spring.main.web-application-type", "none");
        properties.put("opm.runtime.mode", "RELEASE_GOLDEN_FAMILY_CLONE");
        properties.put("opm.release.golden-authoring", "true");
        properties.put("opm.release.golden-family.clone", "true");
        properties.put("opm.release.golden-family.capture-id", "capture-001");
        properties.put("opm.release.golden-family.attempt-ordinal", "1");
        properties.put("opm.release.golden-family.capture-identity", fixture.identityPath().toString());
        properties.put("opm.release.golden-family.base-storage-root", fixture.storageRoot().toString());
        properties.put("opm.release.golden-family.attempt-storage-root", attempt.toString());
        properties.put("opm.release.golden-family.clone-result-out", result.toString());
        properties.put("opm.release.source-date-epoch", String.valueOf(EPOCH));
        String[] args = properties.entrySet().stream().map(entry -> "--" + entry.getKey() + "=" + entry.getValue()).toArray(String[]::new);
        StandardEnvironment environment = new StandardEnvironment();
        environment.setActiveProfiles("release-golden-authoring");
        environment.getPropertySources().addFirst(new MapPropertySource("commandLineArgs", properties));
        return new GoldenFamilyCloneRunner(environment, new DefaultApplicationArguments(args));
    }

    private Map<String, Object> fileRef(String kind, String path, Path file) throws Exception {
        return Map.of("kind", kind, "path", path, "byte_length", Files.size(file), "sha256", sha(Files.readAllBytes(file)));
    }

    private String payloadSha(Map<String, Object> value, String field) {
        Map<String, Object> payload = new LinkedHashMap<>(value);
        payload.remove(field);
        return Rfc8785JsonCanonicalizer.sha256(payload);
    }

    private String sha(byte[] bytes) throws Exception {
        return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private record Fixture(Path materializationRoot, Path storageRoot, Path identityPath, String fixtureKey, String projectId) { }
}
