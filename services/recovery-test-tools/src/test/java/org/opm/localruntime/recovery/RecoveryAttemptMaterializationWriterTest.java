package org.opm.localruntime.recovery;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

class RecoveryAttemptMaterializationWriterTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @TempDir
    Path temporaryDirectory;

    @Test
    void derivesIdentityAndPayloadFromFrozenInputRefsAndWritesOnce() throws Exception {
        Path fixture = temporaryDirectory.resolve("fixture");
        Files.createDirectories(fixture);
        RecoveryAttemptMaterializationWriter writer = new RecoveryAttemptMaterializationWriter();
        RecoveryAttemptMaterializationWriter.Input input = input();

        Map<String, Object> value = writer.write(fixture, input);
        var stored = OBJECT_MAPPER.readTree(fixture.resolve("materialization.json").toFile());
        assertEquals(value.get("materialization_id"), stored.required("materialization_id").asText());
        assertEquals("dev-canvas-06.recovery-materialization.RCV-CANVAS-001.RULE_IDENTITY.1."
                + expectedKey(input).substring(0, 12), stored.required("materialization_id").asText());
        Map<String, Object> withoutPayload = new LinkedHashMap<>(value);
        withoutPayload.remove("materialization_payload_sha256");
        assertEquals(Rfc8785JsonCanonicalizer.sha256(withoutPayload), stored.required("materialization_payload_sha256").asText());
        assertThrows(RecoveryFactorySqliteMaterializer.RecoveryFactoryException.class, () -> writer.write(fixture, input));
        assertFalse(Files.exists(fixture.resolve(".materialization.json.tmp")));
    }

    @Test
    void rejectsNonFrozenSourceRefKindsBeforeWriting() throws Exception {
        Path fixture = temporaryDirectory.resolve("fixture");
        Files.createDirectories(fixture);
        RecoveryAttemptMaterializationWriter.Input base = input();
        Map<String, Object> refs = new LinkedHashMap<>(base.sourceRefs());
        refs.put("runtime_jar_ref", ref("WRONG", "runtime.jar", "2"));
        RecoveryAttemptMaterializationWriter.Input tampered = new RecoveryAttemptMaterializationWriter.Input(
                base.caseId(), base.category(), base.baseScenarioId(), base.attemptOrdinal(), base.sourceDateEpoch(),
                base.caseDefinitionSha256(), base.sourceBuild(), refs, base.activeBinding(), base.baseRevisionIdentity(),
                base.profileAssets(), base.storage(), base.descriptors(), base.baseSnapshot());

        assertThrows(RecoveryFactorySqliteMaterializer.RecoveryFactoryException.class, () -> new RecoveryAttemptMaterializationWriter().write(fixture, tampered));
        assertFalse(Files.exists(fixture.resolve("materialization.json")));
    }

    private RecoveryAttemptMaterializationWriter.Input input() {
        String digest = "a".repeat(64);
        Map<String, Object> refs = new LinkedHashMap<>();
        refs.put("manifest_ref", ref("RECOVERY_MANIFEST", "dev-canvas-06/recovery/recovery-manifest.json", "1"));
        refs.put("handoff_ref", ref("HANDOFF", "handoff.json", "2"));
        refs.put("intake_report_ref", ref("INTAKE_REPORT", "intake.json", "3"));
        refs.put("runtime_jar_ref", ref("LOCAL_RUNTIME_JAR", "runtime.jar", "4"));
        refs.put("factory_helper_jar_ref", ref("RECOVERY_TEST_TOOLS_JAR", "dev-canvas-06/recovery/build/recovery-test-tools.jar", "5"));
        refs.put("model_template_ref", ref("RECOVERY_TEMPLATE", "model-template.json", "6"));
        refs.put("gate_template_ref", ref("RECOVERY_TEMPLATE", "gate-template.json", "7"));
        refs.put("base_revision_ref", ref("MS_REV_001_V02", "base.json", "8"));
        refs.put("profile_source_refs", profileRefs());
        Map<String, Object> sourceBuild = Map.of("source_commit", "b".repeat(40), "dirty_before_build", false,
                "build_command", "build", "node_version", "v22", "lockfile_sha256", digest,
                "web_dist", ref("WEB_DIST_TREE", "dist", "9"), "local_runtime_jar", ref("LOCAL_RUNTIME_JAR", "runtime.jar", "4"));
        Map<String, Object> binding = Map.of("profile", asset("profile", "0.2.0", "a"), "rule_set", asset("rule", "0.1.0", "b"),
                "text_grammar", asset("grammar", "0.2.0", "c"), "symbol_catalog", asset("symbol", "0.1.0", "d"),
                "normalization_adapter", asset("normalization", "0.1.0", "e"), "binding_digest", "f".repeat(64));
        Map<String, Object> identity = new LinkedHashMap<>();
        identity.put("schema_id", "MS-REV-001");
        identity.put("schema_version", "0.2");
        identity.put("project_id", "project.recovery.state.001");
        identity.put("model_id", "model.golden.struct.003");
        identity.put("revision_id", "revision.base.golden.struct.003");
        identity.put("revision_sequence", 1);
        identity.put("parent_revision_id", null);
        identity.put("context_id", "context.sd.root");
        identity.put("history_mode", "SINGLE_REVISION_SNAPSHOT");
        Map<String, Object> profileAssets = Map.of("asset_root", "fixture/assets/packages/profiles", "copied_refs", profileRefs(), "package_digest", "a".repeat(64));
        Map<String, Object> counts = new LinkedHashMap<>();
        for (String table : List.of("schema_metadata", "flyway_schema_history", "project_metadata", "profile_package", "rule_set_package", "grammar_package", "model_catalog", "revision_document", "model_head")) counts.put(table, 1);
        for (String table : List.of("revision_parent", "named_snapshot", "baseline", "operation_record", "idempotency_record", "background_task", "asset_manifest", "element_index", "fact_endpoint_index", "occurrence_index", "finding_index", "text_trace_index")) counts.put(table, 0);
        Map<String, Object> storage = Map.of("storage_root", "fixture/storage", "project_db_ref", ref("RECOVERY_PROJECT_DB", "attempt/fixture/storage/project.db", "1"),
                "storage_schema_version", "1.0", "transaction_status", "COMMITTED", "table_counts", counts, "sqlite_quick_check", "ok", "foreign_key_check_count", 0, "sidecar_absent", true);
        Map<String, Object> descriptors = Map.of("asset_tree_ref", ref("RECOVERY_ASSET_TREE_DESCRIPTOR", "attempt/fixture/descriptors/asset-tree.json", "2"),
                "input_tree_ref", ref("RECOVERY_INPUT_TREE_DESCRIPTOR", "attempt/fixture/descriptors/input-tree.json", "3"), "input_tree_sha256", "c".repeat(64));
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("revision_document_count", 1);
        snapshot.put("revision_parent_count", 0);
        snapshot.put("text_artifact_count", 0);
        snapshot.put("text_trace_count", 0);
        snapshot.put("finding_count", 0);
        snapshot.put("operation_count", 0);
        snapshot.put("receipt_count", 0);
        snapshot.put("draft_head_revision_id", "revision.base.golden.struct.003");
        snapshot.put("head_sequence", 1);
        snapshot.put("revision_digest", digest);
        snapshot.put("projection_digest", digest);
        snapshot.put("opl_digest", digest);
        snapshot.put("trace_digest", digest);
        snapshot.put("sqlite_quick_check", "ok");
        snapshot.put("foreign_key_check_count", 0);
        snapshot.put("recovery_marker_refs", List.of());
        snapshot.put("temporary_artifact_refs", List.of());
        return new RecoveryAttemptMaterializationWriter.Input("RCV-CANVAS-001.RULE_IDENTITY", "PRE_COMMIT", "RECOVERY-COMMAND-PROCEDURAL-001", 1,
                1782864000L, digest, sourceBuild, refs, binding, identity, profileAssets, storage, descriptors, snapshot);
    }

    private Map<String, Object> profileRefs() {
        return Map.of("profile_ref", ref("PROFILE_PACKAGE", "profile.json", "a"), "rule_set_ref", ref("RULE_SET", "rule.json", "b"),
                "symbol_catalog_ref", ref("SYMBOL_ASSET", "symbol.json", "c"), "text_grammar_ref", ref("GRAMMAR_ASSET", "grammar.json", "d"),
                "normalization_adapter_ref", ref("NORMALIZATION_DATA", "normalization.json", "e"));
    }

    private Map<String, Object> asset(String id, String version, String seed) {
        return Map.of("id", id, "version", version, "sha256", seed.repeat(64).substring(0, 64));
    }

    private Map<String, Object> ref(String kind, String path, String seed) {
        return Map.of("kind", kind, "path", path, "byte_length", 1, "sha256", seed.repeat(64).substring(0, 64));
    }

    private String expectedKey(RecoveryAttemptMaterializationWriter.Input input) {
        Map<String, Object> refs = input.sourceRefs();
        return Rfc8785JsonCanonicalizer.sha256(Map.of(
                "manifest_sha256", sha(refs, "manifest_ref"), "model_template_sha256", sha(refs, "model_template_ref"),
                "gate_template_sha256", sha(refs, "gate_template_ref"), "base_revision_sha256", sha(refs, "base_revision_ref"),
                "runtime_jar_sha256", sha(refs, "runtime_jar_ref"), "factory_helper_jar_sha256", sha(refs, "factory_helper_jar_ref"),
                "case_id", input.caseId(), "base_scenario_id", input.baseScenarioId(), "attempt_ordinal", input.attemptOrdinal(), "source_date_epoch", input.sourceDateEpoch()));
    }

    @SuppressWarnings("unchecked")
    private String sha(Map<String, Object> refs, String name) {
        return (String) ((Map<String, Object>) refs.get(name)).get("sha256");
    }
}
