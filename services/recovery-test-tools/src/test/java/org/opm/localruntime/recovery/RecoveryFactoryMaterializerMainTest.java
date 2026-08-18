package org.opm.localruntime.recovery;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RecoveryFactoryMaterializerMainTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @TempDir
    Path temporaryDirectory;

    @Test
    void acceptsExactlyTheFrozenArgumentSet() {
        assertDoesNotThrow(() -> RecoveryFactoryMaterializerMain.Arguments.parse(arguments()).validatePaths());
    }

    @Test
    void rejectsUnknownDuplicateAndUnsafeArgumentsBeforeMaterialization() {
        assertThrows(IllegalArgumentException.class, () -> RecoveryFactoryMaterializerMain.Arguments.parse(with("--unknown", "value")));
        assertThrows(IllegalArgumentException.class, () -> RecoveryFactoryMaterializerMain.Arguments.parse(with("--case-id", "RCV-CANVAS-001.RULE_IDENTITY")));
        assertThrows(IllegalArgumentException.class, () -> RecoveryFactoryMaterializerMain.Arguments.parse(withValue("--manifest", "../manifest.json")).validatePaths());
        assertThrows(IllegalArgumentException.class, () -> RecoveryFactoryMaterializerMain.Arguments.parse(withValue("--attempt-ordinal", "3")));
    }

    @Test
    void materializesFrozenAttemptInputsIntoSqliteDescriptorsAndMaterialization() throws Exception {
        Path repositoryRoot = Path.of("").toAbsolutePath().normalize().getParent().getParent();
        Path evidenceRoot = temporaryDirectory.resolve("evidence");
        Path attemptRoot = evidenceRoot.resolve(".recovery-materialize.001.1");
        Path profileSource = repositoryRoot.resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0");
        Path modelTemplateSource = repositoryRoot.resolve("tests/recovery/release/dev-canvas-06/templates/0.1.0/recovery-model-template.json");
        Path gateTemplateSource = repositoryRoot.resolve("tests/recovery/release/dev-canvas-06/templates/0.1.0/recovery-gate-template.json");
        JsonNode modelTemplateValue = OBJECT_MAPPER.readTree(modelTemplateSource.toFile());
        JsonNode scenario = modelTemplateValue.required("command_scenarios").get(1);

        Path modelTemplate = evidenceRoot.resolve("dev-canvas-06/recovery/fixtures/templates/0.1.0/recovery-model-template.json");
        Path gateTemplate = evidenceRoot.resolve("dev-canvas-06/recovery/fixtures/templates/0.1.0/recovery-gate-template.json");
        copy(modelTemplateSource, modelTemplate);
        copy(gateTemplateSource, gateTemplate);
        Path handoff = evidenceRoot.resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/dev-canvas-05-handoff.json");
        copy(profileSource.resolve("handoff/dev-canvas-05-handoff.json"), handoff);
        JsonNode handoffValue = OBJECT_MAPPER.readTree(handoff.toFile());
        Path intake = evidenceRoot.resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-b940ac9bb734/dev-canvas-06-intake-report.json");
        copy(profileSource.resolve("handoff/releases/clean-b940ac9bb734/dev-canvas-06-intake-report.json"), intake);
        Path runtime = evidenceRoot.resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-b940ac9bb734/local-runtime-0.1.0-SNAPSHOT.jar");
        copy(profileSource.resolve("handoff/releases/clean-b940ac9bb734/local-runtime-0.1.0-SNAPSHOT.jar"), runtime);
        Path helper = evidenceRoot.resolve("dev-canvas-06/recovery/build/recovery-test-tools.jar");
        copy(runtime, helper);
        Path evidenceProfile = evidenceRoot.resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0");
        copy(profileSource.resolve("profile.json"), evidenceProfile.resolve("profile.json"));
        copy(profileSource.resolve("profile.json"), attemptRoot.resolve("fixture/assets/packages/profiles/profile.iso19450.2024.draft/0.2.0/profile.json"));
        for (String path : new String[] {
                "rules/representative-rule-set.json", "symbols/representative-symbol-catalog.json",
                "grammar/representative-opl-grammar.json", "normalization/representative-normalization.json" }) {
            copy(profileSource.resolve(path), evidenceProfile.resolve(path));
            copy(profileSource.resolve(path), attemptRoot.resolve("fixture/assets/packages/profiles/profile.iso19450.2024.draft/0.2.0").resolve(path));
        }
        Path baseSource = repositoryRoot.resolve(scenario.required("base_revision_ref").required("path").asText());
        copy(baseSource, evidenceRoot.resolve(scenario.required("base_revision_ref").required("path").asText()));
        copy(baseSource, attemptRoot.resolve("fixture/base-revision.json"));
        copy(modelTemplate, attemptRoot.resolve("fixture/model-template.json"));
        copy(gateTemplate, attemptRoot.resolve("fixture/gate-template.json"));

        Path manifest = evidenceRoot.resolve("dev-canvas-06/recovery/recovery-manifest-v02.json");
        writeManifest(manifest, modelTemplate, gateTemplate, handoff, intake, runtime, scenario, modelTemplateSource, gateTemplateSource);
        RecoveryFactoryMaterializerMain.materialize(RecoveryFactoryMaterializerMain.Arguments.parse(arguments(
                evidenceRoot, attemptRoot, manifest, modelTemplate, gateTemplate, helper)));

        Path fixture = attemptRoot.resolve("fixture");
        assertTrue(Files.isRegularFile(fixture.resolve("storage/projects/project.recovery.procedural.001/project.db")));
        assertTrue(Files.isRegularFile(fixture.resolve("descriptors/asset-tree.json")));
        assertTrue(Files.isRegularFile(fixture.resolve("descriptors/input-tree.json")));
        JsonNode materialization = OBJECT_MAPPER.readTree(fixture.resolve("materialization.json").toFile());
        assertTrue(materialization.required("materialization_id").asText().startsWith("dev-canvas-06.recovery-materialization.RCV-CANVAS-001.RULE_IDENTITY.1."));
        assertTrue(materialization.required("storage").required("project_db_ref").required("path").asText()
                .endsWith("/fixture/storage/projects/project.recovery.procedural.001/project.db"));
        assertTrue(materialization.required("base_snapshot").required("projection_digest").asText().matches("[a-f0-9]{64}"));
    }

    private String[] arguments(Path evidenceRoot, Path attemptRoot, Path manifest, Path modelTemplate, Path gateTemplate, Path helper) {
        return new String[] {
                "--evidence-root", evidenceRoot.toString(),
                "--attempt-staging-root", attemptRoot.toString(),
                "--manifest", evidenceRoot.relativize(manifest).toString(),
                "--model-template", evidenceRoot.relativize(modelTemplate).toString(),
                "--gate-template", evidenceRoot.relativize(gateTemplate).toString(),
                "--factory-helper-jar", helper.toString(),
                "--case-id", "RCV-CANVAS-001.RULE_IDENTITY",
                "--case-definition-sha256", "a".repeat(64),
                "--base-scenario-id", "RECOVERY-COMMAND-PROCEDURAL-001",
                "--attempt-ordinal", "1",
                "--source-date-epoch", "1785758631"
        };
    }

    private void writeManifest(Path manifest, Path modelTemplate, Path gateTemplate, Path handoff, Path intake, Path runtime,
                               JsonNode scenario, Path modelTemplateSource, Path gateTemplateSource) throws Exception {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("schema_id", "OPM-DEV-CANVAS-06-RECOVERY-MANIFEST-001");
        value.put("schema_version", "0.2");
        value.put("generated_at", Instant.ofEpochSecond(1_785_758_631L).toString());
        value.put("handoff_ref", reference(manifest.getParent().getParent().getParent(), handoff, "HANDOFF"));
        value.put("intake_report_ref", reference(manifest.getParent().getParent().getParent(), intake, "INTAKE_REPORT"));
        Map<String, Object> sourceBuild = new LinkedHashMap<>();
        sourceBuild.put("source_commit", "b940ac9bb73442c3a697cce8bfa7c9df52856b3a");
        sourceBuild.put("dirty_before_build", false);
        sourceBuild.put("build_command", "mvn package");
        sourceBuild.put("node_version", "v22.22.0");
        sourceBuild.put("lockfile_sha256", "b".repeat(64));
        sourceBuild.put("web_dist", Map.of("kind", "WEB_DIST_TREE", "path", "build/web-dist", "byte_length", 1, "sha256", "c".repeat(64)));
        sourceBuild.put("local_runtime_jar", reference(manifest.getParent().getParent().getParent(), runtime, "LOCAL_RUNTIME_JAR"));
        value.put("source_build", sourceBuild);
        value.put("fixture_catalog", java.util.List.of(
                Map.of("fixture_id", "RECOVERY-FIXTURE-MODEL", "source_ref", reference(manifest.getParent().getParent().getParent(), modelTemplate, "RECOVERY_TEMPLATE"),
                        "fixture_digest", "d".repeat(64), "expected_result_digests", OBJECT_MAPPER.convertValue(OBJECT_MAPPER.readTree(modelTemplateSource.toFile()).required("expected_result_digests"), Object.class)),
                Map.of("fixture_id", "RECOVERY-FIXTURE-GATE", "source_ref", reference(manifest.getParent().getParent().getParent(), gateTemplate, "RECOVERY_TEMPLATE"),
                        "fixture_digest", "e".repeat(64), "expected_result_digests", OBJECT_MAPPER.convertValue(OBJECT_MAPPER.readTree(gateTemplateSource.toFile()).required("expected_result_digests"), Object.class))));
        Files.createDirectories(manifest.getParent());
        OBJECT_MAPPER.writeValue(manifest.toFile(), value);
    }

    private Map<String, Object> reference(Path evidenceRoot, Path file, String kind) throws Exception {
        byte[] bytes = Files.readAllBytes(file);
        return Map.of("kind", kind, "path", evidenceRoot.relativize(file).toString(), "byte_length", bytes.length, "sha256", sha256(bytes));
    }

    private void copy(Path source, Path target) throws Exception {
        Files.createDirectories(target.getParent());
        Files.copy(source, target);
    }

    private String sha256(byte[] bytes) throws Exception {
        return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private String[] arguments() {
        return new String[] {
                "--evidence-root", "/private/tmp/evidence",
                "--attempt-staging-root", "/private/tmp/evidence/dev-canvas-06/recovery/attempts/RCV-CANVAS-001.RULE_IDENTITY/.staging",
                "--manifest", "dev-canvas-06/recovery/recovery-manifest.json",
                "--model-template", "dev-canvas-06/recovery/fixtures/templates/0.1.0/recovery-model-template.json",
                "--gate-template", "dev-canvas-06/recovery/fixtures/templates/0.1.0/recovery-gate-template.json",
                "--factory-helper-jar", "/private/tmp/evidence/dev-canvas-06/recovery/build/recovery-test-tools.jar",
                "--case-id", "RCV-CANVAS-001.RULE_IDENTITY",
                "--case-definition-sha256", "a".repeat(64),
                "--base-scenario-id", "RECOVERY-COMMAND-PROCEDURAL-001",
                "--attempt-ordinal", "1",
                "--source-date-epoch", "1782864000"
        };
    }

    private String[] with(String flag, String value) {
        String[] base = arguments();
        String[] result = java.util.Arrays.copyOf(base, base.length + 2);
        result[base.length] = flag;
        result[base.length + 1] = value;
        return result;
    }

    private String[] withValue(String flag, String value) {
        String[] result = arguments();
        for (int index = 0; index < result.length; index += 2) {
            if (flag.equals(result[index])) {
                result[index + 1] = value;
                return result;
            }
        }
        throw new AssertionError("冻结参数不存在: " + flag);
    }
}
