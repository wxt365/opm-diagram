package org.opm.localruntime.releaseauthoring.visualcommon;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class VisualCommonCloneRunnerTest {

    private static final long EPOCH = 1782864000L;
    private static final ObjectMapper JSON = new ObjectMapper();

    @TempDir
    Path temporaryDirectory;

    @Test
    void clonesVerifiedBaseAndWritesClosedCloneResult() throws Exception {
        Path baseRoot = temporaryDirectory.resolve("base/storage");
        Path attestation = temporaryDirectory.resolve("base/attestation.json");
        new VisualCommonFixtureMaterializer().materialize(fixture("BLOCKED_FEEDBACK"), baseRoot, attestation, EPOCH);
        Path attempt = temporaryDirectory.resolve("attempts/capture.blocked/1/storage");
        Path result = temporaryDirectory.resolve("attempts/capture.blocked/1/clone-result.json");
        Files.createDirectories(result.getParent());

        VisualCommonCloneRunner runner = runner(baseRoot, attestation, attempt, result, "BLOCKED_FEEDBACK", 1);
        runner.run(null);

        assertEquals(0, runner.getExitCode());
        assertTrue(Files.isRegularFile(attempt.resolve("projects/project.visual.blocked-feedback/project.db")));
        JsonNode cloneResult = JSON.readTree(Files.readAllBytes(result));
        assertEquals("READY_FOR_RUNTIME", cloneResult.required("status").asText());
        assertEquals("BLOCKED_FEEDBACK", cloneResult.required("subject_id").asText());
        assertEquals(1, cloneResult.required("attempt_ordinal").intValue());
        assertEquals(cloneResult.required("base_tree_sha256_before").asText(), cloneResult.required("base_tree_sha256_after").asText());
    }

    @Test
    void rejectsExistingAttemptWithoutOverwritingItOrWritingResult() throws Exception {
        Path baseRoot = temporaryDirectory.resolve("base/storage");
        Path attestation = temporaryDirectory.resolve("base/attestation.json");
        new VisualCommonFixtureMaterializer().materialize(fixture("STATE_ROLES"), baseRoot, attestation, EPOCH);
        Path attempt = temporaryDirectory.resolve("attempts/capture.state/1/storage");
        Files.createDirectories(attempt);
        Path retained = attempt.resolve("retained.txt");
        Files.writeString(retained, "retain");
        Path result = temporaryDirectory.resolve("attempts/capture.state/1/clone-result.json");
        Files.createDirectories(result.getParent());

        VisualCommonCloneRunner runner = runner(baseRoot, attestation, attempt, result, "STATE_ROLES", 1);
        runner.run(null);

        assertEquals(3, runner.getExitCode());
        assertEquals("retain", Files.readString(retained));
        assertFalse(Files.exists(result));
    }

    private VisualCommonCloneRunner runner(Path baseRoot, Path attestation, Path attempt, Path result, String subject, int ordinal) {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("spring.profiles.active", "release-golden-authoring");
        properties.put("spring.main.web-application-type", "none");
        properties.put("opm.runtime.mode", "RELEASE_GOLDEN_COMMON_CLONE");
        properties.put("opm.release.golden-authoring", "true");
        properties.put("opm.release.visual-common.clone", "true");
        properties.put("opm.release.visual-common.request-id", "dev-canvas-06.common-visual-adapter.clone-test");
        properties.put("opm.release.visual-common.capture-id", "capture." + subject.toLowerCase());
        properties.put("opm.release.visual-common.subject-id", subject);
        properties.put("opm.release.visual-common.attempt-ordinal", String.valueOf(ordinal));
        properties.put("opm.release.visual-common.base-root", baseRoot.toString());
        properties.put("opm.release.visual-common.base-attestation", attestation.toString());
        properties.put("opm.release.visual-common.attempt-storage-root", attempt.toString());
        properties.put("opm.release.visual-common.clone-result-out", result.toString());
        properties.put("opm.release.source-date-epoch", String.valueOf(EPOCH));
        String[] args = properties.entrySet().stream().map(entry -> "--" + entry.getKey() + "=" + entry.getValue()).toArray(String[]::new);
        StandardEnvironment environment = new StandardEnvironment();
        environment.setActiveProfiles("release-golden-authoring");
        environment.getPropertySources().addFirst(new MapPropertySource("commandLineArgs", properties));
        return new VisualCommonCloneRunner(environment, new DefaultApplicationArguments(args));
    }

    private Path fixture(String subject) {
        return Path.of("..", "..", "packages", "profiles", "profile.iso19450.2024.draft", "0.2.0", "handoff", "releases", "clean-37c5412a9c12", "dev-canvas-06", "common-fixtures", "0.2.0", "visual", subject + ".json");
    }
}
