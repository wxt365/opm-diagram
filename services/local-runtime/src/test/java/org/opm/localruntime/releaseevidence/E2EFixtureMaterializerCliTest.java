package org.opm.localruntime.releaseevidence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

class E2EFixtureMaterializerCliTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @TempDir
    Path temporaryDirectory;

    @Test
    void acceptsClosedFamilyInputsBeforeAnySqliteIsCreated() throws Exception {
        Fixture fixture = Fixture.create(temporaryDirectory);

        E2EFixtureMaterializerCli.PreflightResult result = E2EFixtureMaterializerCli.preflight(fixture.arguments());

        assertEquals("project.e2e.family.proc", result.identity().projectId());
        assertEquals(1, result.attemptOrdinal());
        assertFalse(Files.exists(fixture.storage()));
        assertFalse(Files.exists(fixture.out()));
    }

    @Test
    void acceptsClosedCommonInputsWithoutFamilyCatalogBeforeAnySqliteIsCreated() throws Exception {
        Fixture fixture = Fixture.createCommonMaterializable(temporaryDirectory.resolve("common"));
        String caseId = "E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN";

        E2EFixtureMaterializerCli.PreflightResult result = E2EFixtureMaterializerCli.preflight(fixture.commonArguments());

        assertEquals("project.e2e." + sha(caseId).substring(0, 16), result.identity().projectId());
        assertEquals("model.e2e." + sha(caseId).substring(0, 16), result.identity().modelId());
        assertEquals("revision.e2e.common", result.identity().baseRevision());
        assertFalse(Files.exists(fixture.storage()));
        assertFalse(Files.exists(fixture.out()));
    }

    @Test
    void rejectsProfileRawDriftBeforeCreatingSqlite() throws Exception {
        Fixture fixture = Fixture.create(temporaryDirectory);
        Files.writeString(fixture.profileRoot().resolve("rules/rules.json"), "{\"changed\":true}", StandardCharsets.UTF_8);

        E2EFixtureMaterializerCli.PreflightException error = assertThrows(E2EFixtureMaterializerCli.PreflightException.class,
                () -> E2EFixtureMaterializerCli.preflight(fixture.arguments()));

        assertEquals("E2E_MANIFEST_PROFILE_ASSET_INVALID", error.code());
        assertFalse(Files.exists(fixture.storage()));
        assertFalse(Files.exists(fixture.out()));
    }

    @Test
    void rejectsFamilyIdentityFromGoldenNamespaceBeforeCreatingSqlite() throws Exception {
        Fixture fixture = Fixture.create(temporaryDirectory);
        ObjectNode catalog = readObject(fixture.catalog());
        ((ObjectNode) ((ArrayNode) catalog.get("entries")).get(0)).put("project_id", "project.golden.fixture.forbidden");
        rewriteCatalog(fixture.catalog(), catalog);
        rewriteManifestCatalogRef(fixture.manifestRoot, fixture.catalog());

        E2EFixtureMaterializerCli.PreflightException error = assertThrows(E2EFixtureMaterializerCli.PreflightException.class,
                () -> E2EFixtureMaterializerCli.preflight(fixture.arguments()));

        assertEquals("E2E_FIXTURE_MISMATCH", error.code());
        assertFalse(Files.exists(fixture.storage()));
        assertFalse(Files.exists(fixture.out()));
    }

    @Test
    void rejectsMissingReleaseGuardBeforeCreatingSqlite() throws Exception {
        Fixture fixture = Fixture.create(temporaryDirectory);
        String[] arguments = fixture.arguments();
        arguments[1] = "NOT_RELEASE_E2E_ONLY";

        assertEquals(2, E2EFixtureMaterializerCli.run(arguments));
        assertFalse(Files.exists(fixture.storage()));
        assertFalse(Files.exists(fixture.out()));
    }

    @Test
    void rejectsManifestRootOutsideAttemptBeforeCreatingSqlite() throws Exception {
        Fixture fixture = Fixture.create(temporaryDirectory.resolve("outside-manifest"));
        String[] arguments = fixture.arguments();
        arguments[indexOf(arguments, "--manifest-root") + 1] = temporaryDirectory.toString();

        E2EFixtureMaterializerCli.PreflightException error = assertThrows(E2EFixtureMaterializerCli.PreflightException.class,
                () -> E2EFixtureMaterializerCli.preflight(arguments));

        assertEquals("E2E_INPUT_INVALID", error.code());
        assertFalse(Files.exists(fixture.storage()));
        assertFalse(Files.exists(fixture.out()));
    }

    @Test
    void rejectsFaultPlanOrdinalBeforeCreatingSqlite() throws Exception {
        Fixture fixture = Fixture.create(temporaryDirectory);
        ObjectNode plan = readObject(fixture.faultPlan);
        plan.put("attempt_ordinal", 3);
        writeJson(fixture.faultPlan, plan);

        E2EFixtureMaterializerCli.PreflightException error = assertThrows(E2EFixtureMaterializerCli.PreflightException.class,
                () -> E2EFixtureMaterializerCli.preflight(fixture.arguments()));

        assertEquals("E2E_INPUT_INVALID", error.code());
        assertFalse(Files.exists(fixture.storage()));
        assertFalse(Files.exists(fixture.out()));
    }

    @Test
    void rejectsInputRawDriftBeforeCreatingSqlite() throws Exception {
        Fixture fixture = Fixture.create(temporaryDirectory);
        Files.writeString(fixture.inputCopy(), "{\"changed\":true}", StandardCharsets.UTF_8);

        E2EFixtureMaterializerCli.PreflightException error = assertThrows(E2EFixtureMaterializerCli.PreflightException.class,
                () -> E2EFixtureMaterializerCli.preflight(fixture.arguments()));

        assertEquals("E2E_FIXTURE_MISMATCH", error.code());
        assertFalse(Files.exists(fixture.storage()));
        assertFalse(Files.exists(fixture.out()));
    }

    @Test
    void rejectsNonCanonicalManifestTimesBeforeCreatingSqlite() throws Exception {
        for (String generatedAt : List.of("2026-07-01T00:00:00.000Z", "2026-07-01T00:00:00.001Z",
                "2026-07-01T00:00:00+00:00", " 2026-07-01T00:00:00Z", "2026-07-01T00:00:00z", "not-a-time")) {
            Fixture fixture = Fixture.create(temporaryDirectory.resolve("time-" + generatedAt.hashCode()));
            ObjectNode manifest = readObject(fixture.manifestRoot.resolve("manifest.json"));
            manifest.put("generated_at", generatedAt);
            writeJson(fixture.manifestRoot.resolve("manifest.json"), manifest);

            E2EFixtureMaterializerCli.PreflightException error = assertThrows(E2EFixtureMaterializerCli.PreflightException.class,
                    () -> E2EFixtureMaterializerCli.preflight(fixture.arguments()));

            assertEquals("E2E_INPUT_INVALID", error.code(), generatedAt);
            assertFalse(Files.exists(fixture.storage()), generatedAt);
            assertFalse(Files.exists(fixture.out()), generatedAt);
        }
    }

    @Test
    void rejectsTestClasspathBeforeCreatingSqliteOrArtifact() throws Exception {
        Fixture fixture = Fixture.create(temporaryDirectory);

        assertEquals(3, E2EFixtureMaterializerCli.run(fixture.arguments()));

        assertFalse(Files.exists(fixture.storage()));
        assertFalse(Files.exists(fixture.out()));
    }

    @Test
    void resolvesOnlyTheExactAttemptLocalNestedRuntimeJarCodeSource() throws Exception {
        Path runtimeJar = write(temporaryDirectory.resolve("attempt with space/inputs/build/local-runtime.jar"), "runtime jar");
        String externalForm = nestedCodeSource(runtimeJar);

        assertEquals(runtimeJar.toAbsolutePath().normalize(), E2EFixtureMaterializerCli.resolveNestedRuntimeJarCodeSource(externalForm, runtimeJar));

        for (String invalid : List.of(
                runtimeJar.toUri().toString(),
                "jar:" + runtimeJar.toUri() + "!/BOOT-INF/classes/!/",
                "nested:" + runtimeJar.toUri().getRawPath() + "/!BOOT-INF/classes/!/",
                "jar:nested:" + runtimeJar.toUri().getRawPath() + "/!BOOT-INF/lib/dependency.jar!/",
                externalForm + "extra",
                externalForm + "?query=value",
                externalForm + "#fragment",
                externalForm.replace("jar:nested:", "jar:nested://authority"),
                externalForm.replace("%20", " "),
                "jar:nested:" + runtimeJar.getParent().resolve("other/../local-runtime.jar").toUri().getRawPath() + "/!BOOT-INF/classes/!/")) {
            E2EFixtureMaterializerCli.PreflightException error = assertThrows(E2EFixtureMaterializerCli.PreflightException.class,
                    () -> E2EFixtureMaterializerCli.resolveNestedRuntimeJarCodeSource(invalid, runtimeJar));
            assertEquals("E2E_ENVIRONMENT_MISMATCH", error.code(), invalid);
        }
    }

    private static String nestedCodeSource(Path runtimeJar) {
        return "jar:nested:" + runtimeJar.toAbsolutePath().normalize().toUri().getRawPath() + "/!BOOT-INF/classes/!/";
    }

    static final class Fixture {
        private final Path root;
        private final Path manifestRoot;
        private final Path profileRoot;
        private final Path fixture;
        private final Path catalog;
        private final Path inputCopy;
        private final Path binding;
        private final Path faultPlan;
        private final Path storage;
        private final Path out;

        private Fixture(Path root, Path manifestRoot, Path profileRoot, Path fixture, Path catalog, Path inputCopy, Path binding, Path faultPlan, Path storage, Path out) {
            this.root = root;
            this.manifestRoot = manifestRoot;
            this.profileRoot = profileRoot;
            this.fixture = fixture;
            this.catalog = catalog;
            this.inputCopy = inputCopy;
            this.binding = binding;
            this.faultPlan = faultPlan;
            this.storage = storage;
            this.out = out;
        }

        static Fixture create(Path root) throws Exception {
            Path attemptRoot = Files.createDirectories(root.resolve("attempt"));
            Path profileRoot = Files.createDirectories(attemptRoot.resolve("profile/assets"));
            Map<String, Path> assets = Map.of(
                    "GRAMMAR_ASSET", write(profileRoot.resolve("grammar/grammar.json"), "{}"),
                    "NORMALIZATION_DATA", write(profileRoot.resolve("normalization/normalization.json"), "{}"),
                    "RULE_SET", write(profileRoot.resolve("rules/rules.json"), "{}"),
                    "SYMBOL_ASSET", write(profileRoot.resolve("symbols/symbols.json"), "{}"));
            List<Map<String, Object>> profileEntries = new ArrayList<>();
            for (String kind : List.of("GRAMMAR_ASSET", "NORMALIZATION_DATA", "RULE_SET", "SYMBOL_ASSET")) {
                Path file = assets.get(kind);
                profileEntries.add(Map.of("role", kind, "logical_path", profileRoot.relativize(file).toString().replace('\\', '/'),
                        "byte_length", Files.size(file), "digest", Map.of("digest", sha(Files.readAllBytes(file)))));
            }
            String packageDigest = packageDigest(profileEntries);
            Path profilePackage = writeJson(profileRoot.resolve("profile.json"), Map.of("manifest", Map.of("entries", profileEntries,
                    "package_digest", Map.of("digest", packageDigest))));
            List<Map<String, Object>> profileRefs = new ArrayList<>();
            profileRefs.add(ref("GRAMMAR_ASSET", "inputs/upstream/profile-assets/grammar/grammar.json", profileRoot.resolve("grammar/grammar.json")));
            profileRefs.add(ref("NORMALIZATION_DATA", "inputs/upstream/profile-assets/normalization/normalization.json", profileRoot.resolve("normalization/normalization.json")));
            profileRefs.add(ref("PROFILE_PACKAGE", "inputs/upstream/profile-assets/profile.json", profilePackage));
            profileRefs.add(ref("RULE_SET", "inputs/upstream/profile-assets/rules/rules.json", profileRoot.resolve("rules/rules.json")));
            profileRefs.add(ref("SYMBOL_ASSET", "inputs/upstream/profile-assets/symbols/symbols.json", profileRoot.resolve("symbols/symbols.json")));
            Map<String, Object> treePreimage = new LinkedHashMap<>();
            treePreimage.put("schema_id", "OPM-DEV-CANVAS-06-PROFILE-ASSET-TREE-001");
            treePreimage.put("schema_version", "0.1");
            treePreimage.put("root_path", "inputs/upstream/profile-assets");
            treePreimage.put("entries", profileRefs);
            Map<String, Object> treeRef = Map.of("kind", "PROFILE_ASSET_TREE", "path", "inputs/upstream/profile-assets",
                    "byte_length", profileRefs.stream().mapToLong(item -> ((Number) item.get("byte_length")).longValue()).sum(),
                    "sha256", sha(Rfc8785JsonCanonicalizer.canonicalize(treePreimage).getBytes(StandardCharsets.UTF_8)));
            Path binding = writeJson(attemptRoot.resolve("profile/active-binding.json"), activeBinding(profileRefs, packageDigest));

            Path fixture = writeJson(attemptRoot.resolve("inputs/materializer/family-fixture.json"), familyFixture("model.proc", "context.proc", "revision.proc.1"));
            String fixtureSha = sha(Files.readAllBytes(fixture));
            String otherSha = "b".repeat(64);
            Map<String, Object> catalog = E2EFixtureMaterializerCliTest.catalog(fixtureSha, otherSha);
            Path catalogPath = writeJson(attemptRoot.resolve("inputs/materializer/family-catalog.json"), catalog);
            Map<String, Object> catalogRef = ref("FAMILY_FIXTURE_IDENTITY_CATALOG", "inputs/upstream/catalogs/family-catalog.json", catalogPath);
            Map<String, Object> fixtureRef = ref("FAMILY_BASE", "inputs/upstream/fixtures/family-proc.json", fixture);
            Map<String, Object> otherFixtureRef = Map.of("kind", "FAMILY_BASE", "path", "inputs/upstream/fixtures/family-struct.json", "byte_length", 1, "sha256", otherSha);

            List<Map<String, Object>> cases = new ArrayList<>();
            for (int index = 0; index < 178; index++) cases.add(caseValue("FAMILY-" + index, true, index % 2 == 0 ? fixtureRef : otherFixtureRef));
            for (int index = 0; index < 16; index++) cases.add(caseValue("COMMON-" + index, false, fixtureRef));
            Map<String, Object> manifest = new LinkedHashMap<>();
            manifest.put("schema_id", "OPM-DEV-CANVAS-06-E2E-MANIFEST-001");
            manifest.put("schema_version", "0.2");
            manifest.put("manifest_version", "0.2.0");
            manifest.put("generated_at", "2026-07-01T00:00:00Z");
            manifest.put("cases", cases);
            manifest.put("fixture_refs", List.of(fixtureRef, otherFixtureRef, catalogRef));
            manifest.put("profile_asset_tree_ref", treeRef);
            manifest.put("profile_asset_refs", profileRefs);
            Path manifestRoot = Files.createDirectories(attemptRoot.resolve("inputs/manifest"));
            Path manifestInput = writeJson(manifestRoot.resolve("inputs/upstream/inputs/family-0.json"), Map.of("action", "FAMILY-0"));
            Map<String, Object> inputRef = ref("FAMILY_INPUT", "inputs/upstream/inputs/family-0.json", manifestInput);
            for (Map<String, Object> caseValue : cases) caseValue.put("input_ref", inputRef);
            writeJson(manifestRoot.resolve("manifest.json"), manifest);

            Path inputCopy = writeJson(attemptRoot.resolve("inputs/materializer/input.raw"), Map.of("action", "FAMILY-0"));
            Map<String, Object> faultPlan = new LinkedHashMap<>();
            faultPlan.put("schema_id", "OPM-DEV-CANVAS-06-E2E-FAULT-PLAN-001");
            faultPlan.put("schema_version", "0.2");
            faultPlan.put("case_id", "FAMILY-0");
            faultPlan.put("attempt_ordinal", 1);
            faultPlan.put("fault_kind", "NONE");
            faultPlan.put("target", "NONE");
            faultPlan.put("trigger_count", 0);
            faultPlan.put("nonce", "a".repeat(64));
            Map<String, Object> planPreimage = Map.of("case_id", "FAMILY-0", "attempt_ordinal", 1, "fault_kind", "NONE", "target", "NONE", "trigger_count", 0, "nonce", "a".repeat(64));
            faultPlan.put("plan_sha256", sha(Rfc8785JsonCanonicalizer.canonicalize(planPreimage).getBytes(StandardCharsets.UTF_8)));
            faultPlan.put("artifact_payload_sha256", sha(Rfc8785JsonCanonicalizer.canonicalize(faultPlan).getBytes(StandardCharsets.UTF_8)));
            Path faultPlanPath = writeJson(attemptRoot.resolve("fault-plan.json"), faultPlan);
            return new Fixture(root, manifestRoot, profileRoot, fixture, catalogPath, inputCopy, binding, faultPlanPath, attemptRoot.resolve("storage"), attemptRoot.resolve("fixture-materialization.json"));
        }

        static Fixture createMaterializable(Path root) throws Exception {
            Fixture fixture = create(root);
            Path profileSource = Path.of("..", "..", "packages", "profiles", "profile.iso19450.2024.draft", "0.2.0").toRealPath();
            Map<String, Path> sources = Map.of(
                    "GRAMMAR_ASSET", profileSource.resolve("grammar/representative-opl-grammar.json"),
                    "NORMALIZATION_DATA", profileSource.resolve("normalization/representative-normalization.json"),
                    "PROFILE_PACKAGE", profileSource.resolve("profile.json"),
                    "RULE_SET", profileSource.resolve("rules/representative-rule-set.json"),
                    "SYMBOL_ASSET", profileSource.resolve("symbols/representative-symbol-catalog.json"));
            Files.delete(fixture.profileRoot.resolve("grammar/grammar.json"));
            Files.delete(fixture.profileRoot.resolve("normalization/normalization.json"));
            Files.delete(fixture.profileRoot.resolve("rules/rules.json"));
            Files.delete(fixture.profileRoot.resolve("symbols/symbols.json"));
            for (Map.Entry<String, Path> source : sources.entrySet()) {
                Path target = switch (source.getKey()) {
                    case "GRAMMAR_ASSET" -> fixture.profileRoot.resolve("grammar/representative-opl-grammar.json");
                    case "NORMALIZATION_DATA" -> fixture.profileRoot.resolve("normalization/representative-normalization.json");
                    case "PROFILE_PACKAGE" -> fixture.profileRoot.resolve("profile.json");
                    case "RULE_SET" -> fixture.profileRoot.resolve("rules/representative-rule-set.json");
                    case "SYMBOL_ASSET" -> fixture.profileRoot.resolve("symbols/representative-symbol-catalog.json");
                    default -> throw new IllegalStateException("未知 Profile asset kind。");
                };
                Files.copy(source.getValue(), target, StandardCopyOption.REPLACE_EXISTING);
            }

            Path revisionSource = profileSource.resolve("golden/fixtures/g-opl-proc-001-consumption-state.json");
            Files.copy(revisionSource, fixture.fixture, StandardCopyOption.REPLACE_EXISTING);
            JsonNode revision = readObject(fixture.fixture);
            String fixtureSha = sha(Files.readAllBytes(fixture.fixture));
            String otherSha = "b".repeat(64);
            ObjectNode catalog = JSON.valueToTree(E2EFixtureMaterializerCliTest.catalog(fixtureSha, otherSha));
            ObjectNode entry = (ObjectNode) ((ArrayNode) catalog.get("entries")).get(0);
            entry.put("project_id", "project.e2e.family.proc");
            entry.put("model_id", revision.required("model_id").asText());
            entry.put("context_id", revision.required("model_header").required("root_context_id").asText());
            entry.put("base_revision", revision.required("revision_id").asText());
            entry.put("revision_sequence", revision.required("revision_sequence").asInt());
            if (revision.path("parent_revision_id").isTextual()) entry.put("parent_revision_id", revision.required("parent_revision_id").asText());
            else entry.putNull("parent_revision_id");
            rewriteCatalog(fixture.catalog, catalog);

            List<Map<String, Object>> profileRefs = List.of(
                    ref("GRAMMAR_ASSET", "inputs/upstream/profile-assets/grammar/representative-opl-grammar.json", fixture.profileRoot.resolve("grammar/representative-opl-grammar.json")),
                    ref("NORMALIZATION_DATA", "inputs/upstream/profile-assets/normalization/representative-normalization.json", fixture.profileRoot.resolve("normalization/representative-normalization.json")),
                    ref("PROFILE_PACKAGE", "inputs/upstream/profile-assets/profile.json", fixture.profileRoot.resolve("profile.json")),
                    ref("RULE_SET", "inputs/upstream/profile-assets/rules/representative-rule-set.json", fixture.profileRoot.resolve("rules/representative-rule-set.json")),
                    ref("SYMBOL_ASSET", "inputs/upstream/profile-assets/symbols/representative-symbol-catalog.json", fixture.profileRoot.resolve("symbols/representative-symbol-catalog.json")));
            ObjectNode manifest = readObject(fixture.manifestRoot.resolve("manifest.json"));
            manifest.set("profile_asset_refs", JSON.valueToTree(profileRefs));
            Map<String, Object> treePreimage = new LinkedHashMap<>();
            treePreimage.put("schema_id", "OPM-DEV-CANVAS-06-PROFILE-ASSET-TREE-001");
            treePreimage.put("schema_version", "0.1");
            treePreimage.put("root_path", "inputs/upstream/profile-assets");
            treePreimage.put("entries", profileRefs);
            Map<String, Object> treeRef = Map.of("kind", "PROFILE_ASSET_TREE", "path", "inputs/upstream/profile-assets",
                    "byte_length", profileRefs.stream().mapToLong(item -> ((Number) item.get("byte_length")).longValue()).sum(),
                    "sha256", sha(Rfc8785JsonCanonicalizer.canonicalize(treePreimage).getBytes(StandardCharsets.UTF_8)));
            manifest.set("profile_asset_tree_ref", JSON.valueToTree(treeRef));
            ArrayNode fixtureRefs = (ArrayNode) manifest.get("fixture_refs");
            Map<String, Object> actualFixtureRef = ref("FAMILY_BASE", "inputs/upstream/fixtures/family-proc.json", fixture.fixture);
            fixtureRefs.set(0, JSON.valueToTree(actualFixtureRef));
            fixtureRefs.set(2, JSON.valueToTree(ref("FAMILY_FIXTURE_IDENTITY_CATALOG", "inputs/upstream/catalogs/family-catalog.json", fixture.catalog)));
            for (JsonNode value : manifest.required("cases")) {
                String caseId = value.required("case_id").asText();
                if (caseId.startsWith("FAMILY-") && Integer.parseInt(caseId.substring("FAMILY-".length())) % 2 == 0) {
                    ((ObjectNode) value).set("fixture_ref", JSON.valueToTree(actualFixtureRef));
                }
            }
            writeJson(fixture.manifestRoot.resolve("manifest.json"), manifest);

            writeJson(fixture.binding, activeBindingFromRevision(revision));
            return fixture;
        }

        static Fixture createCommonMaterializable(Path root) throws Exception {
            Fixture fixture = createMaterializable(root);
            String caseId = "E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN";
            writeJson(fixture.fixture, Map.of("fixture_id", "fixture.e2e.common", "case_id", caseId,
                    "project_name", "Release E2E Common", "model_name", "Release E2E Common",
                    "initial_revision", "revision.e2e.common", "action", Map.of("action_id", "action.001"), "fixture_kind", "BASE"));
            ObjectNode manifest = readObject(fixture.manifestRoot.resolve("manifest.json"));
            ObjectNode selected = (ObjectNode) manifest.path("cases").get(0);
            selected.put("case_id", caseId);
            selected.remove("capability_id");
            selected.set("fixture_ref", JSON.valueToTree(ref("FIXTURE", "inputs/common/e2e/common.base.json", fixture.fixture)));
            writeJson(fixture.manifestRoot.resolve("manifest.json"), manifest);
            rewriteFaultPlan(fixture.faultPlan, caseId);
            return fixture;
        }

        String[] arguments() {
            return new String[] {"--guard", "RELEASE_E2E_ONLY", "--fixture-kind", "FAMILY", "--case-id", "FAMILY-0", "--fixture", fixture.toString(),
                    "--family-identity-catalog", catalog.toString(), "--manifest-root", manifestRoot.toString(), "--manifest", "manifest.json",
                    "--input", inputCopy.toString(),
                    "--profile-asset-root", profileRoot.toString(), "--binding", binding.toString(), "--fault-plan", faultPlan.toString(),
                    "--storage", storage.toString(), "--out", out.toString()};
        }

        String[] commonArguments() {
            List<String> values = new ArrayList<>();
            String[] familyArguments = arguments();
            for (int index = 0; index < familyArguments.length; index += 2) {
                if ("--family-identity-catalog".equals(familyArguments[index])) continue;
                values.add(familyArguments[index]);
                values.add(familyArguments[index + 1]);
            }
            values.set(values.indexOf("--fixture-kind") + 1, "COMMON");
            values.set(values.indexOf("--case-id") + 1, "E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN");
            return values.toArray(String[]::new);
        }

        Path storage() { return storage; }
        Path out() { return out; }
        Path profileRoot() { return profileRoot; }
        Path catalog() { return catalog; }
        Path inputCopy() { return inputCopy; }
        Path manifest() { return manifestRoot.resolve("manifest.json"); }
        Path binding() { return binding; }
        Path attemptRoot() { return out.getParent(); }
    }

    private static void rewriteFaultPlan(Path path, String caseId) throws Exception {
        ObjectNode faultPlan = readObject(path);
        faultPlan.put("case_id", caseId);
        faultPlan.remove("plan_sha256");
        faultPlan.put("plan_sha256", sha(Rfc8785JsonCanonicalizer.canonicalize(Map.of("case_id", caseId, "attempt_ordinal", 1,
                "fault_kind", "NONE", "target", "NONE", "trigger_count", 0, "nonce", "a".repeat(64))).getBytes(StandardCharsets.UTF_8)));
        faultPlan.remove("artifact_payload_sha256");
        faultPlan.put("artifact_payload_sha256", sha(Rfc8785JsonCanonicalizer.canonicalize(faultPlan).getBytes(StandardCharsets.UTF_8)));
        writeJson(path, faultPlan);
    }

        private static Map<String, Object> catalog(String fixtureSha, String otherSha) {
        List<Map<String, Object>> entries = List.of(
                catalogEntry(fixtureSha, "project.e2e.family.proc", "model.proc", "context.proc", "revision.proc.1"),
                catalogEntry(otherSha, "project.e2e.family.struct", "model.struct", "context.struct", "revision.struct.1"));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("schema_id", "OPM-DEV-CANVAS-06-E2E-FAMILY-FIXTURE-IDENTITY-CATALOG-001");
        result.put("schema_version", "0.1");
        result.put("catalog_version", "0.1.0");
        result.put("entries", entries);
        result.put("summary", Map.of("family_case_count", 178, "distinct_base_fixture_count", 2));
        result.put("catalog_payload_sha256", sha(Rfc8785JsonCanonicalizer.canonicalize(result).getBytes(StandardCharsets.UTF_8)));
        return result;
    }

    private static Map<String, Object> familyFixture(String modelId, String contextId, String revisionId) {
        return Map.of("schema_id", "MS-REV-001", "schema_version", "0.2", "model_id", modelId,
                "model_header", Map.of("model_id", modelId, "root_context_id", contextId), "revision_id", revisionId, "revision_sequence", 1);
    }

    private static Map<String, Object> catalogEntry(String fixtureSha, String projectId, String modelId, String contextId, String revisionId) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("fixture_sha256", fixtureSha);
        entry.put("project_id", projectId);
        entry.put("model_id", modelId);
        entry.put("context_id", contextId);
        entry.put("base_revision", revisionId);
        entry.put("revision_sequence", 1);
        entry.put("parent_revision_id", null);
        return entry;
    }

    private static Map<String, Object> caseValue(String caseId, boolean family, Map<String, Object> fixtureRef) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("case_id", caseId);
        result.put("fixture_ref", fixtureRef);
        if (family) result.put("capability_id", "CAP-ISO-PROC-001");
        return result;
    }

    private static Map<String, Object> ref(String kind, String path, Path file) throws Exception {
        byte[] bytes = Files.readAllBytes(file);
        return Map.of("kind", kind, "path", path, "byte_length", bytes.length, "sha256", sha(bytes));
    }

    private static String packageDigest(List<Map<String, Object>> entries) {
        List<String> lines = entries.stream().map(entry -> entry.get("logical_path") + "\n" + entry.get("byte_length") + "\n"
                + digestValue(entry.get("digest")) + "\n").sorted().toList();
        return sha(String.join("", lines).getBytes(StandardCharsets.UTF_8));
    }

    private static String digestValue(Object value) {
        if (!(value instanceof Map<?, ?> map) || !(map.get("digest") instanceof String digest)) {
            throw new IllegalArgumentException("测试 Profile digest 不完整。");
        }
        return digest;
    }

    private static Map<String, Object> activeBinding(List<Map<String, Object>> refs, String packageDigest) {
        Map<String, Map<String, Object>> byKind = new LinkedHashMap<>();
        for (Map<String, Object> ref : refs) byKind.put((String) ref.get("kind"), ref);
        return Map.of(
                "profile", Map.of("id", "profile.test", "version", "0.2.0", "sha256", packageDigest),
                "rule_set", bindingAsset("rules.test", byKind.get("RULE_SET")),
                "text_grammar", bindingAsset("grammar.test", byKind.get("GRAMMAR_ASSET")),
                "symbol_catalog", bindingAsset("symbols.test", byKind.get("SYMBOL_ASSET")),
                "normalization_adapter", bindingAsset("normalization.test", byKind.get("NORMALIZATION_DATA")),
                "binding_digest", "a".repeat(64));
    }

    private static Map<String, Object> activeBindingFromRevision(JsonNode revision) {
        JsonNode binding = revision.required("profile_binding");
        return Map.of(
                "profile", bindingAssetFromRevision(binding.required("profile")),
                "rule_set", bindingAssetFromRevision(binding.required("rule_set")),
                "text_grammar", bindingAssetFromRevision(binding.required("text_grammar")),
                "symbol_catalog", bindingAssetFromRevision(binding.required("symbol_catalog")),
                "normalization_adapter", bindingAssetFromRevision(binding.required("normalization_adapter")),
                "binding_digest", binding.required("binding_digest").required("digest").asText());
    }

    private static Map<String, Object> bindingAssetFromRevision(JsonNode asset) {
        return Map.of("id", asset.required("id").asText(), "version", asset.required("version").asText(),
                "sha256", asset.required("digest").required("digest").asText());
    }

    private static Map<String, Object> bindingAsset(String id, Map<String, Object> ref) {
        return Map.of("id", id, "version", "0.1.0", "sha256", ref.get("sha256"));
    }

    private static void rewriteCatalog(Path path, ObjectNode catalog) throws Exception {
        catalog.remove("catalog_payload_sha256");
        catalog.put("catalog_payload_sha256", sha(Rfc8785JsonCanonicalizer.canonicalize(catalog).getBytes(StandardCharsets.UTF_8)));
        writeJson(path, catalog);
    }

    private static void rewriteManifestCatalogRef(Path manifestRoot, Path catalogPath) throws Exception {
        Path manifest = manifestRoot.resolve("manifest.json");
        ObjectNode source = readObject(manifest);
        ArrayNode refs = (ArrayNode) source.get("fixture_refs");
        for (int index = 0; index < refs.size(); index += 1) {
            if ("FAMILY_FIXTURE_IDENTITY_CATALOG".equals(refs.get(index).path("kind").asText())) {
                refs.set(index, JSON.valueToTree(ref("FAMILY_FIXTURE_IDENTITY_CATALOG", "inputs/upstream/catalogs/family-catalog.json", catalogPath)));
            }
        }
        writeJson(manifest, source);
    }

    private static Path write(Path path, String value) throws Exception {
        Files.createDirectories(path.getParent());
        return Files.writeString(path, value, StandardCharsets.UTF_8);
    }

    private static Path writeJson(Path path, Object value) throws Exception {
        Files.createDirectories(path.getParent());
        return Files.writeString(path, JSON.writeValueAsString(value), StandardCharsets.UTF_8);
    }

    private static ObjectNode readObject(Path path) throws Exception {
        return (ObjectNode) JSON.readTree(Files.readAllBytes(path));
    }

    private static String sha(byte[] bytes) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static String sha(String value) {
        return sha(value.getBytes(StandardCharsets.UTF_8));
    }

    private static int indexOf(String[] values, String expected) {
        for (int index = 0; index < values.length; index += 2) if (expected.equals(values[index])) return index;
        throw new IllegalArgumentException("测试参数缺少 " + expected);
    }
}
