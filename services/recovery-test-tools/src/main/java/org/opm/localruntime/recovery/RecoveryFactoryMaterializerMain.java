package org.opm.localruntime.recovery;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.application.LocalApiService;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.releaseauthoring.ProjectionDigestV01;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;
import org.opm.localruntime.storage.ProjectDatabaseFactory;

import java.nio.charset.StandardCharsets;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Recovery Factory 的受控 helper 入口。
 *
 * <p>该入口不读取当前工作目录或环境变量，只在 Node Factory 已创建的 staging
 * attempt 中写入 SQLite、Tree Descriptor 和 materialization.json。</p>
 */
public final class RecoveryFactoryMaterializerMain {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private static final Set<String> REQUIRED = Set.of(
            "--evidence-root", "--attempt-staging-root", "--manifest", "--model-template", "--gate-template",
            "--factory-helper-jar", "--case-id", "--case-definition-sha256", "--base-scenario-id",
            "--attempt-ordinal", "--source-date-epoch");
    private static final Set<String> OPTIONAL = Set.of("--gate-fixture");

    private RecoveryFactoryMaterializerMain() {
    }

    public static void main(String[] args) {
        try {
            Arguments values = Arguments.parse(args);
            values.validatePaths();
            materialize(values);
        } catch (IllegalArgumentException exception) {
            System.err.println("RECOVERY_INPUT_INVALID");
            System.exit(2);
        } catch (RecoveryFactorySqliteMaterializer.RecoveryFactoryException exception) {
            System.err.println("RECOVERY_FIXTURE_MISMATCH");
            System.exit(2);
        } catch (Exception exception) {
            System.err.println("RECOVERY_UNEXPECTED_RUNTIME_ERROR");
            System.exit(4);
        }
    }

    static void materialize(Arguments arguments) throws Exception {
        Path evidenceRoot = arguments.absolute("--evidence-root");
        Path attemptRoot = arguments.absolute("--attempt-staging-root");
        requireDirectory(evidenceRoot);
        requireDirectory(attemptRoot);
        Path fixtureRoot = attemptRoot.resolve("fixture");
        requireDirectory(fixtureRoot);

        JsonNode manifest = readJson(evidenceRoot, arguments.relative("--manifest"));
        JsonNode modelTemplate = readJson(evidenceRoot, arguments.relative("--model-template"));
        JsonNode gateTemplate = readJson(evidenceRoot, arguments.relative("--gate-template"));
        JsonNode handoff = readJson(evidenceRoot, text(object(manifest, "handoff_ref"), "path"));
        JsonNode scenario = scenario(modelTemplate, arguments.value("--base-scenario-id"));
        String caseId = arguments.value("--case-id");
        String category = category(caseId);
        if ("ROLLBACK".equals(category) != arguments.has("--gate-fixture")) {
            throw new IllegalArgumentException("Recovery Gate Fixture category is invalid.");
        }

        Path baseRevision = fixtureRoot.resolve("base-revision.json");
        Path profileRoot = fixtureRoot.resolve("assets/packages/profiles");
        requireRegularFile(baseRevision);
        requireDirectory(profileRoot);
        byte[] baseBytes = Files.readAllBytes(baseRevision);
        JsonNode base = OBJECT_MAPPER.readTree(baseBytes);
        verifyScenarioBase(scenario, base, baseBytes);

        RecoveryFactorySqliteMaterializer.ProfileAssets assets = new RecoveryFactorySqliteMaterializer.ProfileAssets(
                strictText(profileFile(profileRoot, handoff, "profile.json")),
                strictText(profileRequiredFile(profileRoot, handoff, "RULE_SET")),
                strictText(profileRequiredFile(profileRoot, handoff, "GRAMMAR_ASSET")));
        RecoveryFactorySqliteMaterializer.Result sqlite = new RecoveryFactorySqliteMaterializer().materialize(
                fixtureRoot.resolve("storage"), text(scenario, "project_id"), baseBytes, assets,
                arguments.longValue("--source-date-epoch"));

        List<RecoveryFactoryDescriptorWriter.Input> profileEntries = profileEntries(profileRoot, handoff);
        List<RecoveryFactoryDescriptorWriter.Input> inputEntries = new ArrayList<>();
        inputEntries.add(new RecoveryFactoryDescriptorWriter.Input("SOURCE_TEMPLATE", "model-template.json", "application/json"));
        inputEntries.add(new RecoveryFactoryDescriptorWriter.Input("SOURCE_TEMPLATE", "gate-template.json", "application/json"));
        inputEntries.add(new RecoveryFactoryDescriptorWriter.Input("BASE_REVISION", "base-revision.json", "application/json"));
        for (RecoveryFactoryDescriptorWriter.Input profileEntry : profileEntries) {
            inputEntries.add(new RecoveryFactoryDescriptorWriter.Input(profileEntry.kind(), "assets/" + profileEntry.path(), profileEntry.mediaType()));
        }
        inputEntries.add(new RecoveryFactoryDescriptorWriter.Input("PROJECT_DB", fixtureRoot.relativize(sqlite.databasePath()).toString(), "application/vnd.sqlite3"));
        if (arguments.has("--gate-fixture")) {
            inputEntries.add(new RecoveryFactoryDescriptorWriter.Input("GATE_WORK_COPY", "gate/gate-fixture-work.json", "application/json"));
        }
        RecoveryFactoryDescriptorWriter.Result descriptors = new RecoveryFactoryDescriptorWriter().write(
                attemptRoot, caseId, arguments.value("--base-scenario-id"), arguments.intValue("--attempt-ordinal"), profileEntries, inputEntries);

        Path finalAttemptRoot = evidenceRoot.resolve("dev-canvas-06/recovery/attempts")
                .resolve(caseId).resolve(arguments.value("--attempt-ordinal"));
        Map<String, Object> sourceRefs = sourceRefs(evidenceRoot, arguments, manifest, modelTemplate, gateTemplate, scenario, handoff);
        Map<String, Object> copiedProfileRefs = copiedProfileRefs(evidenceRoot, attemptRoot, finalAttemptRoot, profileEntries);
        Map<String, Object> storage = storage(evidenceRoot, attemptRoot, finalAttemptRoot, sqlite, arguments.has("--gate-fixture"));
        Map<String, Object> descriptorRefs = descriptorRefs(evidenceRoot, attemptRoot, finalAttemptRoot, descriptors);
        Map<String, Object> snapshot = snapshot(fixtureRoot, scenario, base, sqlite.tableCounts(), profileRoot);

        new RecoveryAttemptMaterializationWriter().write(fixtureRoot, new RecoveryAttemptMaterializationWriter.Input(
                caseId, category, arguments.value("--base-scenario-id"), arguments.intValue("--attempt-ordinal"),
                arguments.longValue("--source-date-epoch"), arguments.value("--case-definition-sha256"),
                asMap(object(manifest, "source_build")), sourceRefs, asMap(object(handoff, "active_binding")),
                baseIdentity(scenario, base), Map.of("asset_root", "fixture/assets/packages/profiles", "copied_refs", copiedProfileRefs,
                        "package_digest", text(object(handoff, "active_binding").get("profile"), "sha256")),
                storage, descriptorRefs, snapshot));
    }

    private static JsonNode readJson(Path root, String relativePath) throws Exception {
        Path file = inside(root, relativePath);
        requireRegularFile(file);
        JsonNode value = OBJECT_MAPPER.readTree(Files.readAllBytes(file));
        if (value == null || !value.isObject()) {
            throw new IllegalArgumentException("Recovery JSON input must be an object.");
        }
        return value;
    }

    private static Path inside(Path root, String relativePath) {
        requireRelativePath(relativePath);
        Path value = root.resolve(relativePath).normalize();
        if (!value.startsWith(root.normalize())) {
            throw new IllegalArgumentException("Recovery path escapes its root.");
        }
        return value;
    }

    private static void requireDirectory(Path path) {
        if (Files.isSymbolicLink(path) || !Files.isDirectory(path, LinkOption.NOFOLLOW_LINKS)) {
            throw new IllegalArgumentException("Recovery directory must be a non-symlink directory.");
        }
    }

    private static void requireRegularFile(Path path) {
        if (Files.isSymbolicLink(path) || !Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)) {
            throw new IllegalArgumentException("Recovery file must be a non-symlink regular file.");
        }
    }

    private static JsonNode object(JsonNode parent, String field) {
        JsonNode value = parent.get(field);
        if (value == null || !value.isObject()) {
            throw new IllegalArgumentException("Recovery JSON object field is missing: " + field);
        }
        return value;
    }

    private static String text(JsonNode parent, String field) {
        JsonNode value = parent.get(field);
        if (value == null || !value.isTextual() || value.asText().isBlank()) {
            throw new IllegalArgumentException("Recovery JSON text field is missing: " + field);
        }
        return value.asText();
    }

    private static String strictText(Path file) throws Exception {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(java.nio.ByteBuffer.wrap(Files.readAllBytes(file)))
                    .toString();
        } catch (CharacterCodingException exception) {
            throw new IllegalArgumentException("Recovery JSON must use strict UTF-8.", exception);
        }
    }

    private static JsonNode scenario(JsonNode modelTemplate, String scenarioId) {
        JsonNode scenarios = modelTemplate.get("command_scenarios");
        if (scenarios == null || !scenarios.isArray()) {
            throw new IllegalArgumentException("Recovery model template scenarios are invalid.");
        }
        JsonNode result = null;
        for (JsonNode candidate : scenarios) {
            if (scenarioId.equals(candidate.path("scenario_id").asText())) {
                if (result != null) throw new IllegalArgumentException("Recovery base scenario is duplicated.");
                result = candidate;
            }
        }
        if (result == null) throw new IllegalArgumentException("Recovery base scenario is unknown.");
        return result;
    }

    private static String category(String caseId) {
        int number;
        try {
            if (!caseId.matches("RCV-CANVAS-0[0-2][0-9]\\.[A-Z0-9_]+")) throw new NumberFormatException();
            number = Integer.parseInt(caseId.substring("RCV-CANVAS-".length(), "RCV-CANVAS-".length() + 3));
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("Recovery case ID is invalid.", exception);
        }
        if (number >= 1 && number <= 8) return "PRE_COMMIT";
        if (number <= 15) return "SQLITE";
        if (number <= 19) return "FORCED_RESTART";
        if (number <= 22) return "SERVICE_RECOVERY";
        if (number <= 28) return "ROLLBACK";
        throw new IllegalArgumentException("Recovery case ID is outside the frozen catalog.");
    }

    private static void verifyScenarioBase(JsonNode scenario, JsonNode base, byte[] baseBytes) {
        JsonNode sourceRef = object(scenario, "base_revision_ref");
        requireReference(sourceRef, "MS_REV_001_V02");
        if (baseBytes.length != sourceRef.path("byte_length").longValue()
                || !sha256(baseBytes).equals(text(sourceRef, "sha256"))) {
            throw new IllegalArgumentException("Recovery base Revision bytes differ from the frozen source ref.");
        }
        JsonNode identity = object(scenario, "base_revision_identity");
        if (!"MS-REV-001".equals(base.path("schema_id").asText()) || !"0.2".equals(base.path("schema_version").asText())
                || !text(base, "model_id").equals(text(identity, "model_id"))
                || !text(base, "revision_id").equals(text(identity, "revision_id"))
                || base.path("revision_sequence").intValue() != identity.path("revision_sequence").intValue()
                || !text(scenario, "context_id").equals(text(identity, "context_id"))) {
            throw new IllegalArgumentException("Recovery base Revision identity differs from its scenario.");
        }
    }

    private static Path profilePackageRoot(Path profileRoot, JsonNode handoff) {
        JsonNode profile = object(object(handoff, "active_binding"), "profile");
        Path packageRoot = profileRoot.resolve(text(profile, "id")).resolve(text(profile, "version"));
        requireDirectory(packageRoot);
        return packageRoot;
    }

    private static Path profileFile(Path profileRoot, JsonNode handoff, String name) {
        Path file = profilePackageRoot(profileRoot, handoff).resolve(name);
        requireRegularFile(file);
        return file;
    }

    private static Path profileRequiredFile(Path profileRoot, JsonNode handoff, String role) throws Exception {
        JsonNode manifest = object(readJson(profilePackageRoot(profileRoot, handoff), "profile.json"), "manifest");
        JsonNode entries = manifest.get("entries");
        if (entries == null || !entries.isArray()) throw new IllegalArgumentException("Recovery profile manifest entries are invalid.");
        JsonNode match = null;
        for (JsonNode entry : entries) {
            if (role.equals(entry.path("role").asText()) && entry.path("required").asBoolean(false)) {
                if (match != null) throw new IllegalArgumentException("Recovery profile role is duplicated: " + role);
                match = entry;
            }
        }
        if (match == null) throw new IllegalArgumentException("Recovery profile role is missing: " + role);
        Path file = inside(profilePackageRoot(profileRoot, handoff), text(match, "logical_path"));
        requireRegularFile(file);
        if (Files.size(file) != match.path("byte_length").longValue() || !sha256(Files.readAllBytes(file)).equals(text(object(match, "digest"), "digest"))) {
            throw new IllegalArgumentException("Recovery profile asset differs from its manifest.");
        }
        return file;
    }

    private static List<RecoveryFactoryDescriptorWriter.Input> profileEntries(Path profileRoot, JsonNode handoff) throws Exception {
        Path packageRoot = profilePackageRoot(profileRoot, handoff);
        String packagePath = Path.of("packages/profiles").resolve(profileRoot.relativize(packageRoot)).resolve("profile.json").toString();
        List<RecoveryFactoryDescriptorWriter.Input> result = new ArrayList<>();
        result.add(new RecoveryFactoryDescriptorWriter.Input("PROFILE_PACKAGE", packagePath, "application/json"));
        for (Role role : Role.values()) {
            Path file = profileRequiredFile(profileRoot, handoff, role.manifestRole());
            result.add(new RecoveryFactoryDescriptorWriter.Input(role.kind(), Path.of("packages/profiles").resolve(profileRoot.relativize(file)).toString(), "application/json"));
        }
        return List.copyOf(result);
    }

    private static Map<String, Object> sourceRefs(Path evidenceRoot, Arguments arguments, JsonNode manifest,
                                                    JsonNode modelTemplate, JsonNode gateTemplate, JsonNode scenario,
                                                    JsonNode handoff) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("manifest_ref", reference(evidenceRoot, arguments.relative("--manifest"), "RECOVERY_MANIFEST"));
        result.put("handoff_ref", verifiedReference(evidenceRoot, object(manifest, "handoff_ref"), "HANDOFF"));
        result.put("intake_report_ref", verifiedReference(evidenceRoot, object(manifest, "intake_report_ref"), "INTAKE_REPORT"));
        result.put("runtime_jar_ref", verifiedReference(evidenceRoot, object(object(manifest, "source_build"), "local_runtime_jar"), "LOCAL_RUNTIME_JAR"));
        Path helper = arguments.absolute("--factory-helper-jar");
        Path expectedHelper = evidenceRoot.resolve("dev-canvas-06/recovery/build/recovery-test-tools.jar").normalize();
        if (!helper.equals(expectedHelper)) throw new IllegalArgumentException("Recovery helper JAR path is not frozen.");
        result.put("factory_helper_jar_ref", reference(evidenceRoot, "dev-canvas-06/recovery/build/recovery-test-tools.jar", "RECOVERY_TEST_TOOLS_JAR"));
        result.put("model_template_ref", fixtureReference(evidenceRoot, manifest, "RECOVERY-FIXTURE-MODEL"));
        result.put("gate_template_ref", fixtureReference(evidenceRoot, manifest, "RECOVERY-FIXTURE-GATE"));
        result.put("base_revision_ref", verifiedReference(evidenceRoot, object(scenario, "base_revision_ref"), "MS_REV_001_V02"));
        result.put("profile_source_refs", profileSourceRefs(evidenceRoot, handoff));
        if (arguments.has("--gate-fixture")) {
            result.put("gate_fixture_ref", reference(evidenceRoot, arguments.relative("--gate-fixture"), "RECOVERY_GATE_FIXTURE"));
        }
        verifyTemplateTime(manifest, modelTemplate, gateTemplate, arguments.longValue("--source-date-epoch"));
        return Map.copyOf(result);
    }

    private static void verifyTemplateTime(JsonNode manifest, JsonNode modelTemplate, JsonNode gateTemplate, long sourceDateEpoch) {
        if (modelTemplate.path("source_date_epoch").asLong(Long.MIN_VALUE) != sourceDateEpoch
                || gateTemplate.path("source_date_epoch").asLong(Long.MIN_VALUE) != sourceDateEpoch
                || !Instant.ofEpochSecond(sourceDateEpoch).equals(Instant.parse(text(manifest, "generated_at")))) {
            throw new IllegalArgumentException("Recovery source date epoch is not closed by templates and Manifest.");
        }
    }

    private static Map<String, Object> profileSourceRefs(Path evidenceRoot, JsonNode handoff) throws Exception {
        Path profileRoot = evidenceRoot.resolve("packages/profiles");
        Path packageRoot = profilePackageRoot(profileRoot, handoff);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("profile_ref", reference(evidenceRoot, evidenceRoot.relativize(packageRoot.resolve("profile.json")).toString(), "PROFILE_PACKAGE"));
        for (Role role : Role.values()) {
            Path file = profileRequiredFile(profileRoot, handoff, role.manifestRole());
            result.put(role.referenceName(), reference(evidenceRoot, evidenceRoot.relativize(file).toString(), role.kind()));
        }
        return Map.copyOf(result);
    }

    private static Map<String, Object> copiedProfileRefs(Path evidenceRoot, Path stagingAttemptRoot, Path finalAttemptRoot,
                                                           List<RecoveryFactoryDescriptorWriter.Input> entries) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        for (RecoveryFactoryDescriptorWriter.Input entry : entries) {
            Path staged = stagingAttemptRoot.resolve("fixture/assets").resolve(entry.path());
            Path target = finalAttemptRoot.resolve("fixture/assets").resolve(entry.path());
            String name = switch (entry.kind()) {
                case "PROFILE_PACKAGE" -> "profile_ref";
                case "RULE_SET" -> "rule_set_ref";
                case "SYMBOL_ASSET" -> "symbol_catalog_ref";
                case "GRAMMAR_ASSET" -> "text_grammar_ref";
                case "NORMALIZATION_DATA" -> "normalization_adapter_ref";
                default -> throw new IllegalArgumentException("Recovery copied Profile entry kind is invalid.");
            };
            result.put(name, referenceForFinal(evidenceRoot, staged, target, entry.kind()));
        }
        if (result.size() != 5) throw new IllegalArgumentException("Recovery copied Profile ref set is incomplete.");
        return Map.copyOf(result);
    }

    private static Map<String, Object> storage(Path evidenceRoot, Path stagingAttemptRoot, Path finalAttemptRoot,
                                                RecoveryFactorySqliteMaterializer.Result sqlite, boolean rollback) throws Exception {
        Path database = sqlite.databasePath();
        Path finalDatabase = finalAttemptRoot.resolve("fixture/storage").resolve(
                stagingAttemptRoot.resolve("fixture/storage").relativize(database));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("storage_root", "fixture/storage");
        result.put("project_db_ref", referenceForFinal(evidenceRoot, database, finalDatabase, "RECOVERY_PROJECT_DB"));
        if (rollback) {
            result.put("gate_work_copy_ref", referenceForFinal(evidenceRoot,
                    stagingAttemptRoot.resolve("fixture/gate/gate-fixture-work.json"), finalAttemptRoot.resolve("fixture/gate/gate-fixture-work.json"),
                    "RECOVERY_GATE_WORK_COPY"));
        }
        result.put("storage_schema_version", "1.0");
        result.put("transaction_status", "COMMITTED");
        result.put("table_counts", sqlite.tableCounts());
        result.put("sqlite_quick_check", "ok");
        result.put("foreign_key_check_count", 0);
        result.put("sidecar_absent", true);
        return Map.copyOf(result);
    }

    private static Map<String, Object> descriptorRefs(Path evidenceRoot, Path stagingAttemptRoot, Path finalAttemptRoot,
                                                        RecoveryFactoryDescriptorWriter.Result descriptors) throws Exception {
        Path stagedAsset = descriptors.assetPath();
        Path stagedInput = descriptors.inputPath();
        Path finalAsset = finalAttemptRoot.resolve("fixture").resolve(stagingAttemptRoot.resolve("fixture").relativize(stagedAsset));
        Path finalInput = finalAttemptRoot.resolve("fixture").resolve(stagingAttemptRoot.resolve("fixture").relativize(stagedInput));
        JsonNode input = readJson(stagingAttemptRoot.resolve("fixture"), "descriptors/input-tree.json");
        return Map.of(
                "asset_tree_ref", referenceForFinal(evidenceRoot, stagedAsset, finalAsset, "RECOVERY_ASSET_TREE_DESCRIPTOR"),
                "input_tree_ref", referenceForFinal(evidenceRoot, stagedInput, finalInput, "RECOVERY_INPUT_TREE_DESCRIPTOR"),
                "input_tree_sha256", text(input, "tree_sha256"));
    }

    private static Map<String, Object> snapshot(Path fixtureRoot, JsonNode scenario, JsonNode base,
                                                 Map<String, Integer> tableCounts, Path profileRoot) throws Exception {
        String projectId = text(scenario, "project_id");
        String modelId = text(base, "model_id");
        String revisionId = text(base, "revision_id");
        String contextId = text(scenario, "context_id");
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(fixtureRoot.resolve("storage")),
                new FileProfilePackageLoader(profileRoot));
        Map<String, Object> projectionResponse = service.projection("recovery-factory-base", projectId, modelId, contextId, revisionId);
        Object projection = projectionResponse.get("data");
        if (!(projection instanceof Map<?, ?> value)) throw new IllegalArgumentException("Recovery projection response is invalid.");
        @SuppressWarnings("unchecked")
        Map<String, Object> projectionData = (Map<String, Object>) value;
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("revision_document_count", tableCounts.get("revision_document"));
        snapshot.put("revision_parent_count", tableCounts.get("revision_parent"));
        snapshot.put("text_artifact_count", base.path("text_artifact").isObject() ? 1 : 0);
        snapshot.put("text_trace_count", tableCounts.get("text_trace_index"));
        snapshot.put("finding_count", tableCounts.get("finding_index"));
        snapshot.put("operation_count", tableCounts.get("operation_record"));
        snapshot.put("receipt_count", tableCounts.get("idempotency_record"));
        snapshot.put("draft_head_revision_id", revisionId);
        snapshot.put("head_sequence", base.path("revision_sequence").intValue());
        snapshot.put("revision_digest", sha256(Files.readAllBytes(fixtureRoot.resolve("base-revision.json"))));
        snapshot.put("projection_digest", ProjectionDigestV01.sha256(projectionData));
        snapshot.put("opl_digest", sha256(Rfc8785JsonCanonicalizer.canonicalize(asJavaValue(base.get("text_artifact"))).getBytes(StandardCharsets.UTF_8)));
        snapshot.put("trace_digest", sha256(Rfc8785JsonCanonicalizer.canonicalize(asJavaValue(base.get("text_traces"))).getBytes(StandardCharsets.UTF_8)));
        snapshot.put("sqlite_quick_check", "ok");
        snapshot.put("foreign_key_check_count", 0);
        snapshot.put("recovery_marker_refs", List.of());
        snapshot.put("temporary_artifact_refs", List.of());
        return Map.copyOf(snapshot);
    }

    private static Map<String, Object> baseIdentity(JsonNode scenario, JsonNode base) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("schema_id", text(base, "schema_id"));
        result.put("schema_version", text(base, "schema_version"));
        result.put("project_id", text(scenario, "project_id"));
        result.put("model_id", text(base, "model_id"));
        result.put("revision_id", text(base, "revision_id"));
        result.put("revision_sequence", base.path("revision_sequence").intValue());
        result.put("parent_revision_id", base.has("parent_revision_id") && !base.get("parent_revision_id").isNull() ? text(base, "parent_revision_id") : null);
        result.put("context_id", text(scenario, "context_id"));
        result.put("history_mode", "SINGLE_REVISION_SNAPSHOT");
        return Collections.unmodifiableMap(result);
    }

    private static Map<String, Object> fixtureReference(Path evidenceRoot, JsonNode manifest, String fixtureId) throws Exception {
        JsonNode fixtures = manifest.get("fixture_catalog");
        if (fixtures == null || !fixtures.isArray()) throw new IllegalArgumentException("Recovery fixture catalog is invalid.");
        JsonNode match = null;
        for (JsonNode fixture : fixtures) {
            if (fixtureId.equals(fixture.path("fixture_id").asText())) {
                if (match != null) throw new IllegalArgumentException("Recovery fixture catalog entry is duplicated.");
                match = fixture;
            }
        }
        if (match == null) throw new IllegalArgumentException("Recovery fixture catalog entry is missing.");
        return verifiedReference(evidenceRoot, object(match, "source_ref"), "RECOVERY_TEMPLATE");
    }

    private static Map<String, Object> verifiedReference(Path evidenceRoot, JsonNode declared, String expectedKind) throws Exception {
        requireReference(declared, expectedKind);
        Map<String, Object> actual = reference(evidenceRoot, text(declared, "path"), expectedKind);
        if (((Number) actual.get("byte_length")).longValue() == declared.path("byte_length").longValue()
                && actual.get("sha256").equals(text(declared, "sha256"))) {
            return actual;
        }
        throw new IllegalArgumentException("Recovery source reference does not match raw bytes.");
    }

    private static Map<String, Object> reference(Path root, String relativePath, String kind) throws Exception {
        Path path = inside(root, relativePath);
        requireRegularFile(path);
        return referenceBytes(relativePath, kind, Files.readAllBytes(path));
    }

    private static Map<String, Object> referenceForFinal(Path evidenceRoot, Path staged, Path finalPath, String kind) throws Exception {
        requireRegularFile(staged);
        Path normalized = finalPath.normalize();
        if (!normalized.startsWith(evidenceRoot.normalize())) throw new IllegalArgumentException("Recovery final ref escapes evidence root.");
        return referenceBytes(evidenceRoot.relativize(normalized).toString(), kind, Files.readAllBytes(staged));
    }

    private static Map<String, Object> referenceBytes(String path, String kind, byte[] bytes) {
        requireRelativePath(path);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("kind", kind);
        result.put("path", path);
        result.put("byte_length", bytes.length);
        result.put("sha256", sha256(bytes));
        return Map.copyOf(result);
    }

    private static void requireReference(JsonNode value, String expectedKind) {
        if (!value.isObject() || !expectedKind.equals(value.path("kind").asText())
                || !value.path("byte_length").canConvertToLong() || value.path("byte_length").longValue() < 0
                || !value.path("sha256").asText().matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException("Recovery source reference is invalid.");
        }
        requireRelativePath(text(value, "path"));
    }

    private static void requireRelativePath(String value) {
        if (value == null || value.isBlank() || value.startsWith("/") || value.contains("\\\\")
                || java.util.Arrays.stream(value.split("/", -1)).anyMatch(segment -> segment.isBlank() || ".".equals(segment) || "..".equals(segment))) {
            throw new IllegalArgumentException("Recovery reference path is unsafe.");
        }
    }

    private static String sha256(byte[] bytes) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception exception) {
            throw new IllegalStateException("Recovery SHA-256 is unavailable.", exception);
        }
    }

    private static Object asJavaValue(JsonNode node) {
        return node == null || node.isNull() ? null : OBJECT_MAPPER.convertValue(node, new TypeReference<Object>() { });
    }

    private static Map<String, Object> asMap(JsonNode node) {
        @SuppressWarnings("unchecked")
        Map<String, Object> value = OBJECT_MAPPER.convertValue(node, new TypeReference<Map<String, Object>>() { });
        return Map.copyOf(value);
    }

    private enum Role {
        RULE_SET("RULE_SET", "RULE_SET", "rule_set_ref"),
        SYMBOL_ASSET("SYMBOL_ASSET", "SYMBOL_ASSET", "symbol_catalog_ref"),
        GRAMMAR_ASSET("GRAMMAR_ASSET", "GRAMMAR_ASSET", "text_grammar_ref"),
        NORMALIZATION_DATA("NORMALIZATION_DATA", "NORMALIZATION_DATA", "normalization_adapter_ref");

        private final String manifestRole;
        private final String kind;
        private final String referenceName;

        Role(String manifestRole, String kind, String referenceName) {
            this.manifestRole = manifestRole;
            this.kind = kind;
            this.referenceName = referenceName;
        }

        String manifestRole() {
            return manifestRole;
        }

        String kind() {
            return kind;
        }

        String referenceName() {
            return referenceName;
        }
    }

    static final class Arguments {
        private final Map<String, String> values;

        private Arguments(Map<String, String> values) {
            this.values = Map.copyOf(values);
        }

        static Arguments parse(String[] args) {
            if (args.length == 0 || args.length % 2 != 0) {
                throw new IllegalArgumentException("Arguments must be flag/value pairs.");
            }
            Map<String, String> values = new LinkedHashMap<>();
            for (int index = 0; index < args.length; index += 2) {
                String flag = args[index];
                String value = args[index + 1];
                if (!REQUIRED.contains(flag) && !OPTIONAL.contains(flag) || value.isBlank() || values.putIfAbsent(flag, value) != null) {
                    throw new IllegalArgumentException("Invalid Recovery Factory argument.");
                }
            }
            if (!values.keySet().containsAll(REQUIRED)) {
                throw new IllegalArgumentException("Recovery Factory arguments are incomplete.");
            }
            if (!values.get("--attempt-ordinal").matches("[12]") || !values.get("--source-date-epoch").matches("(?:0|[1-9][0-9]*)")
                    || !values.get("--case-definition-sha256").matches("[a-f0-9]{64}")) {
                throw new IllegalArgumentException("Recovery Factory scalar argument is invalid.");
            }
            return new Arguments(values);
        }

        void validatePaths() {
            for (String flag : Set.of("--evidence-root", "--attempt-staging-root", "--factory-helper-jar")) {
                if (!Path.of(values.get(flag)).isAbsolute()) {
                    throw new IllegalArgumentException("Recovery Factory path must be absolute.");
                }
            }
            for (String flag : Set.of("--manifest", "--model-template", "--gate-template")) {
                requireRelativePath(values.get(flag));
            }
            if (values.containsKey("--gate-fixture")) {
                requireRelativePath(values.get("--gate-fixture"));
            }
        }

        private void requireRelativePath(String value) {
            RecoveryFactoryMaterializerMain.requireRelativePath(value);
        }

        String value(String flag) {
            return values.get(flag);
        }

        boolean has(String flag) {
            return values.containsKey(flag);
        }

        Path absolute(String flag) {
            return Path.of(value(flag)).normalize();
        }

        String relative(String flag) {
            return value(flag);
        }

        int intValue(String flag) {
            return Integer.parseInt(value(flag));
        }

        long longValue(String flag) {
            return Long.parseLong(value(flag));
        }
    }
}
