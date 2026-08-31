package org.opm.localruntime.releaseevidence;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.application.LocalApiService;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.golden.OplGoldenArtifactCanonicalWriter;
import org.opm.localruntime.releaseauthoring.GoldenFixtureSeedRepository;
import org.opm.localruntime.releaseauthoring.ProjectionDigestV01;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;
import org.opm.localruntime.releaseauthoring.TokenCanonicalWriter;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionReader;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.opm.localruntime.text.OplGenerationResult;
import org.opm.localruntime.text.OplTextGenerationService;
import org.opm.localruntime.text.OplToken;
import org.opm.localruntime.text.TextGenerationAssets;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** E2E attempt 物化前的只读 Family 输入预检入口。 */
public final class E2EFixtureMaterializerCli {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String MANIFEST_SCHEMA_ID = "OPM-DEV-CANVAS-06-E2E-MANIFEST-001";
    private static final String FAMILY_CATALOG_SCHEMA_ID = "OPM-DEV-CANVAS-06-E2E-FAMILY-FIXTURE-IDENTITY-CATALOG-001";
    private static final String FAULT_PLAN_SCHEMA_ID = "OPM-DEV-CANVAS-06-E2E-FAULT-PLAN-001";
    private static final String PROFILE_TREE_SCHEMA_ID = "OPM-DEV-CANVAS-06-PROFILE-ASSET-TREE-001";
    private static final String PROFILE_TREE_ROOT = "inputs/upstream/profile-assets";
    private static final String NESTED_CODE_SOURCE_PREFIX = "jar:nested:";
    private static final String NESTED_CODE_SOURCE_SUFFIX = "/!BOOT-INF/classes/!/";
    private static final Set<String> PROFILE_KINDS = Set.of("PROFILE_PACKAGE", "RULE_SET", "SYMBOL_ASSET", "GRAMMAR_ASSET", "NORMALIZATION_DATA");
    private static final Set<String> REQUIRED_OPTIONS = Set.of("guard", "fixture-kind", "case-id", "fixture", "manifest-root", "manifest", "input",
            "profile-asset-root", "binding", "fault-plan", "storage", "out");
    private static final Set<String> ALL_OPTIONS = Set.of("guard", "fixture-kind", "case-id", "fixture", "family-identity-catalog", "manifest-root",
            "manifest", "input", "profile-asset-root", "binding", "fault-plan", "storage", "out");

    private E2EFixtureMaterializerCli() { }

    public static void main(String[] args) {
        int exitCode = run(args);
        if (exitCode != 0) System.exit(exitCode);
    }

    static int run(String[] args) {
        PreflightResult result = null;
        try {
            result = preflight(args);
            RuntimeJarIdentity runtimeJar = verifyRuntimeJarCodeSource(result);
            materialize(result, runtimeJar);
            return 0;
        } catch (PreflightException exception) {
            System.err.println(exception.code + ": " + exception.getMessage());
            return exception.exitCode;
        } catch (Exception exception) {
            if (result != null) cleanupFailedMaterialization(result.arguments());
            System.err.println("E2E_UNEXPECTED_RUNTIME_ERROR: " + exception.getMessage());
            return 4;
        }
    }

    static PreflightResult preflight(String[] args) throws IOException {
        Arguments arguments = Arguments.parse(args);
        JsonNode manifest = readObject(arguments.manifestPath(), "E2E_INPUT_INVALID");
        validateManifestShape(manifest);
        long sourceDateEpoch = parseUtcWholeSecond(manifest);
        ProfileAssets profile = validateProfileAssets(manifest, arguments.profileAssetRoot(), arguments.bindingPath());
        InputRef inputRef = validateInput(manifest, arguments);
        JsonNode faultPlan = readObject(arguments.faultPlan(), "E2E_INPUT_INVALID");
        int attemptOrdinal = validateFaultPlan(faultPlan, arguments, manifest);
        JsonNode fixture = readObject(arguments.fixturePath(), "E2E_FIXTURE_MISMATCH");
        FixtureIdentity identity;
        if ("FAMILY".equals(arguments.fixtureKind())) {
            JsonNode catalog = readObject(arguments.familyCatalogPath(), "E2E_FIXTURE_MISMATCH");
            identity = validateFamily(manifest, catalog, fixture, arguments);
        } else {
            identity = validateCommon(manifest, fixture, arguments);
        }
        return new PreflightResult(arguments, manifest, arguments.caseId(), attemptOrdinal, sourceDateEpoch, identity, profile, inputRef);
    }

    private static RuntimeJarIdentity verifyRuntimeJarCodeSource(PreflightResult result) {
        try {
            String externalForm = E2EFixtureMaterializerCli.class.getProtectionDomain().getCodeSource().getLocation().toExternalForm();
            Path expected = result.arguments().out().getParent().resolve("inputs/build/local-runtime.jar").toAbsolutePath().normalize();
            Path actual = resolveNestedRuntimeJarCodeSource(externalForm, expected);
            AssetRef manifestRef = AssetRef.from(result.manifest().path("source_build").path("local_runtime_jar"), "E2E_ENVIRONMENT_MISMATCH");
            RawFileObservation observed = observeRawFile(actual);
            AssetRef actualRef = new AssetRef("LOCAL_RUNTIME_JAR", "inputs/build/local-runtime.jar", observed.byteLength(), observed.sha256());
            if (!actualRef.equals(manifestRef)) {
                throw environment("Materializer JAR raw ref 与 Manifest 不匹配。");
            }
            return new RuntimeJarIdentity(actualRef, observed.sha256());
        } catch (PreflightException exception) {
            throw exception;
        } catch (Exception exception) {
            throw environment("无法验证 Materializer JAR code source。");
        }
    }

    /**
     * 按冻结的 Spring Boot nested JAR 形式解析当前 Materializer 的外层 JAR。
     * 入口值必须在解析前与 attempt-local 期望值逐字符一致，避免任何宽松 URL 归一化。
     */
    static Path resolveNestedRuntimeJarCodeSource(String externalForm, Path expectedOuter) {
        try {
            Path expected = expectedOuter.toAbsolutePath().normalize();
            if (!isSingleLinkRegularFile(expected)) {
                throw environment("attempt-local local-runtime.jar 不是单链接普通文件。");
            }
            String expectedRawPath = expected.toUri().getRawPath();
            String expectedExternalForm = NESTED_CODE_SOURCE_PREFIX + expectedRawPath + NESTED_CODE_SOURCE_SUFFIX;
            if (!expectedExternalForm.equals(externalForm)) {
                throw environment("Materializer code source 不是唯一允许的 nested attempt-local JAR 形式。");
            }

            String rawOuterPath = externalForm.substring(NESTED_CODE_SOURCE_PREFIX.length(), externalForm.length() - NESTED_CODE_SOURCE_SUFFIX.length());
            URI fileUri = URI.create("file:" + rawOuterPath);
            if (!"file".equals(fileUri.getScheme()) || fileUri.getRawAuthority() != null || fileUri.getRawQuery() != null
                    || fileUri.getRawFragment() != null || !rawOuterPath.equals(fileUri.getRawPath())) {
                throw environment("Materializer nested code source 外层 URI 不合法。");
            }
            Path lexicalOuter = Path.of(fileUri).toAbsolutePath().normalize();
            if (!lexicalOuter.equals(expected) || !isSingleLinkRegularFile(lexicalOuter)
                    || !lexicalOuter.toRealPath().equals(expected.toRealPath())) {
                throw environment("Materializer code source 外层 JAR 与 attempt-local JAR 不一致。");
            }
            return lexicalOuter;
        } catch (PreflightException exception) {
            throw exception;
        } catch (Exception exception) {
            throw environment("无法验证 Materializer nested JAR code source。");
        }
    }

    private static long parseUtcWholeSecond(JsonNode manifest) {
        JsonNode value = manifest.get("generated_at");
        if (value == null || !value.isTextual()) {
            throw input("E2E_INPUT_INVALID", "Manifest generated_at 必须是字符串。");
        }
        String raw = value.asText();
        try {
            Instant instant = Instant.parse(raw);
            long epoch = instant.getEpochSecond();
            if (instant.getNano() != 0 || !Instant.ofEpochSecond(epoch).toString().equals(raw)) {
                throw input("E2E_INPUT_INVALID", "Manifest generated_at 必须是 UTC 整秒规范形式。");
            }
            return epoch;
        } catch (PreflightException exception) {
            throw exception;
        } catch (Exception exception) {
            throw input("E2E_INPUT_INVALID", "Manifest generated_at 无法解析为 UTC 整秒。");
        }
    }

    private static RawFileObservation observeRawFile(Path path) throws IOException {
        BasicFileAttributes before = Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        try (FileChannel channel = FileChannel.open(path, StandardOpenOption.READ)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            ByteBuffer buffer = ByteBuffer.allocate(16 * 1024);
            long byteLength = 0;
            while (channel.read(buffer) != -1) {
                buffer.flip();
                byteLength += buffer.remaining();
                digest.update(buffer);
                buffer.clear();
            }
            BasicFileAttributes after = Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
            if (!java.util.Objects.equals(before.fileKey(), after.fileKey()) || before.size() != after.size()
                    || !before.lastModifiedTime().equals(after.lastModifiedTime()) || byteLength != before.size()) {
                throw environment("Materializer JAR 在 raw 观测期间发生漂移。");
            }
            return new RawFileObservation(byteLength, java.util.HexFormat.of().formatHex(digest.digest()));
        } catch (PreflightException exception) {
            throw exception;
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 不可用。", exception);
        }
    }

    private static void materialize(PreflightResult result, RuntimeJarIdentity runtimeJar) throws Exception {
        byte[] fixtureBytes = Files.readAllBytes(result.arguments().fixturePath());
        byte[] revisionBytes = fixtureBytes;
        if ("COMMON".equals(result.arguments().fixtureKind())) {
            revisionBytes = commonRevision(result, result.profileAssets().activeBinding());
        }
        SemanticRevision revision = new SemanticRevisionReader().read(new ByteArrayInputStream(revisionBytes));
        SemanticRevision.ProfileBinding activeBinding = result.profileAssets().activeBinding();
        if (!sameBinding(revision.profileBinding(), activeBinding)) {
            throw input("E2E_FIXTURE_MISMATCH", "Family fixture binding 与 active binding 不匹配。");
        }

        Set<FileProfilePackageLoader.DirectPackageFile> directFiles = new HashSet<>();
        for (AssetRef ref : result.profileAssets().refs()) {
            directFiles.add(new FileProfilePackageLoader.DirectPackageFile(ref.kind(), profileRelativePath(ref.path()), ref.byteLength(), ref.sha256()));
        }
        ProfilePackageAssembler assembler = new ProfilePackageAssembler(
                FileProfilePackageLoader.forVerifiedDirectPackageRoot(result.arguments().profileAssetRoot(), directFiles));
        TextGenerationAssets assets;
        try {
            assets = assembler.assemble(activeBinding);
        } catch (RuntimeException exception) {
            throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "attempt-local Profile 资产无法装配：" + exception.getMessage());
        }

        Path materializedBaseRoot = result.arguments().storage().resolve("materialized-base");
        GoldenFixtureSeedRepository.MaterializedFixture materialized = new GoldenFixtureSeedRepository().materialize(
                materializedBaseRoot, revisionBytes, sha256(revisionBytes), result.sourceDateEpoch(),
                new GoldenFixtureSeedRepository.SeedIdentity(result.identity().projectId(),
                        "COMMON".equals(result.arguments().fixtureKind()) ? "E2E Common Fixture" : "E2E Family Fixture",
                        "COMMON".equals(result.arguments().fixtureKind()) ? "Release E2E Common fixture." : "Release E2E Family fixture."), activeBinding);
        if (!result.identity().modelId().equals(materialized.modelId()) || !result.identity().baseRevision().equals(materialized.revisionId())) {
            throw new IllegalStateException("Materialized Family identity 与 Catalog 不一致。");
        }

        ProjectDatabaseFactory databaseFactory = new ProjectDatabaseFactory(result.arguments().storage());
        Path workingDatabase = databaseFactory.databasePath(materialized.projectId());
        cloneWorkingDatabase(materialized.databasePath(), workingDatabase);
        LocalApiService api = new LocalApiService(databaseFactory,
                FileProfilePackageLoader.forVerifiedDirectPackageRoot(result.arguments().profileAssetRoot(), directFiles));
        @SuppressWarnings("unchecked") Map<String, Object> projection = (Map<String, Object>) api.projection(
                "e2e-materializer", materialized.projectId(), materialized.modelId(), result.identity().contextId(), materialized.revisionId()).get("data");
        OplGenerationResult generated = new OplTextGenerationService().generate(revision, result.identity().contextId(), assets);
        List<OplToken> tokens = generated.artifact().paragraphs().stream()
                .flatMap(paragraph -> paragraph.sentences().stream()).flatMap(sentence -> sentence.tokens().stream()).toList();
        OplGoldenArtifactCanonicalWriter artifactWriter = new OplGoldenArtifactCanonicalWriter();

        Map<String, Object> storage = storage(result.arguments(), materialized.databasePath(), workingDatabase);
        Map<String, Object> identity = Map.of("project_id", materialized.projectId(), "model_id", materialized.modelId(),
                "context_id", result.identity().contextId(), "base_revision", materialized.revisionId(), "head_revision", materialized.revisionId());
        Map<String, Object> materializerIdentity = Map.of("main_class", E2EFixtureMaterializerCli.class.getName(),
                "runtime_jar_ref", runtimeJar.reference().asMap(), "source_sha256", runtimeJar.sourceSha256());
        Map<String, Object> stateDigests = Map.of("revision_document_sha256", sha256(fixtureBytes),
                "projection_sha256", ProjectionDigestV01.sha256(ProjectionDigestV01.apiProjectionDigestView(projection)),
                "opl_sha256", artifactWriter.sha256(generated.artifact()),
                "token_sha256", new TokenCanonicalWriter().sha256(revision.revisionId(), tokens),
                "trace_sha256", artifactWriter.sha256Traces(revision.revisionId(), generated.traces()));
        List<Map<String, Object>> artifactProfileRefs = result.profileAssets().refs().stream()
                .map(ref -> new AssetRef(ref.kind(), "profile/assets/" + profileRelativePath(ref.path()), ref.byteLength(), ref.sha256()).asMap()).toList();
        Map<String, Object> profileTree = profileTree(artifactProfileRefs);
        Map<String, Object> artifact = new LinkedHashMap<>();
        artifact.put("schema_id", "OPM-DEV-CANVAS-06-E2E-FIXTURE-MATERIALIZATION-001");
        artifact.put("schema_version", "0.2");
        artifact.put("case_id", result.caseId());
        artifact.put("attempt_ordinal", result.attemptOrdinal());
        artifact.put("fixture_kind", result.arguments().fixtureKind());
        artifact.put("fixture_ref", ManifestRawRef.from(manifestCase(result.manifest(), result.caseId()).path("fixture_ref"),
                result.arguments().fixtureKind(), "FIXTURE", "E2E_FIXTURE_MISMATCH").asMap());
        artifact.put("input_ref", result.inputRef().manifestRef().asMap());
        artifact.put("active_binding", bindingMap(activeBinding));
        artifact.put("identity", identity);
        artifact.put("storage", storage);
        artifact.put("materializer_identity", materializerIdentity);
        artifact.put("state_digests", stateDigests);
        artifact.put("profile_asset_tree_ref", profileTree);
        artifact.put("profile_asset_refs", artifactProfileRefs);
        artifact.put("profile_package_digest", activeBinding.profile().sha256());
        artifact.put("materialization_payload_sha256", sha256Jcs(Map.of("case_id", result.caseId(), "attempt_ordinal", result.attemptOrdinal(),
                "fixture_kind", result.arguments().fixtureKind(), "fixture_ref", artifact.get("fixture_ref"), "input_ref", artifact.get("input_ref"),
                "active_binding", artifact.get("active_binding"), "identity", identity, "storage", storage,
                "materializer_identity", materializerIdentity, "state_digests", stateDigests)));
        artifact.put("artifact_payload_sha256", sha256Jcs(artifact));
        writeArtifactAtomically(result.arguments().out(), artifact);
    }

    private static SemanticRevision.ProfileBinding readBinding(Path path) throws IOException {
        JsonNode root = readObject(path, "E2E_MANIFEST_PROFILE_ASSET_INVALID");
        return new SemanticRevision.ProfileBinding(bindingAsset(root, "profile"), bindingAsset(root, "rule_set"),
                bindingAsset(root, "text_grammar"), bindingAsset(root, "symbol_catalog"), bindingAsset(root, "normalization_adapter"),
                digestText(root, "binding_digest"));
    }

    private static SemanticRevision.AssetReference bindingAsset(JsonNode root, String field) {
        JsonNode node = root.path(field);
        String sha = text(node, "sha256");
        if (!sha.matches("[a-f0-9]{64}")) throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "active binding SHA 不合法。");
        return new SemanticRevision.AssetReference(text(node, "id"), text(node, "version"), sha);
    }

    private static String digestText(JsonNode root, String field) {
        String value = text(root, field);
        if (!value.matches("[a-f0-9]{64}")) throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "active binding digest 不合法。");
        return value;
    }

    private static boolean sameBinding(SemanticRevision.ProfileBinding left, SemanticRevision.ProfileBinding right) {
        return left.profile().equals(right.profile()) && left.ruleSet().equals(right.ruleSet()) && left.textGrammar().equals(right.textGrammar())
                && left.symbolCatalog().equals(right.symbolCatalog()) && left.normalizationAdapter().equals(right.normalizationAdapter())
                && left.bindingDigest().equals(right.bindingDigest());
    }

    private static Map<String, Object> bindingMap(SemanticRevision.ProfileBinding binding) {
        return Map.of("profile", bindingAssetMap(binding.profile()), "rule_set", bindingAssetMap(binding.ruleSet()),
                "text_grammar", bindingAssetMap(binding.textGrammar()), "symbol_catalog", bindingAssetMap(binding.symbolCatalog()),
                "normalization_adapter", bindingAssetMap(binding.normalizationAdapter()), "binding_digest", binding.bindingDigest());
    }

    private static Map<String, Object> bindingAssetMap(SemanticRevision.AssetReference reference) {
        return Map.of("id", reference.id(), "version", reference.version(), "sha256", reference.sha256());
    }

    private static Map<String, Object> profileTree(List<Map<String, Object>> refs) {
        long length = refs.stream().mapToLong(value -> ((Number) value.get("byte_length")).longValue()).sum();
        Map<String, Object> preimage = Map.of("schema_id", PROFILE_TREE_SCHEMA_ID, "schema_version", "0.1", "root_path", "profile/assets", "entries", refs);
        return Map.of("kind", "PROFILE_ASSET_TREE", "path", "profile/assets", "byte_length", length, "sha256", sha256Jcs(preimage));
    }

    private static void cloneWorkingDatabase(Path baseDatabase, Path workingDatabase) throws Exception {
        if (!isSingleLinkRegularFile(baseDatabase) || Files.exists(workingDatabase, LinkOption.NOFOLLOW_LINKS)) {
            throw new IllegalStateException("Materialized base或working SQLite freshness不合法。");
        }
        Files.createDirectories(workingDatabase.getParent());
        Path temporary = Files.createTempFile(workingDatabase.getParent(), ".project-db-clone-", ".tmp");
        try {
            Files.copy(baseDatabase, temporary, StandardCopyOption.REPLACE_EXISTING);
            try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.WRITE)) {
                channel.force(true);
            }
            if (!isSingleLinkRegularFile(temporary) || Files.mismatch(baseDatabase, temporary) != -1) {
                throw new IllegalStateException("Working SQLite初始clone与base不一致。");
            }
            Files.move(temporary, workingDatabase, StandardCopyOption.ATOMIC_MOVE);
            try (FileChannel directory = FileChannel.open(workingDatabase.getParent(), StandardOpenOption.READ)) {
                directory.force(true);
            }
        } finally {
            Files.deleteIfExists(temporary);
        }
        if (!isSingleLinkRegularFile(workingDatabase) || Files.mismatch(baseDatabase, workingDatabase) != -1) {
            throw new IllegalStateException("Working SQLite原子提交后与base不一致。");
        }
    }

    private static Map<String, Object> storage(Arguments arguments, Path baseDatabase, Path workingDatabase) throws Exception {
        verifyDatabaseIntegrity(baseDatabase);
        verifyDatabaseIntegrity(workingDatabase);
        RawFileObservation base = observeRawFile(baseDatabase);
        RawFileObservation working = observeRawFile(workingDatabase);
        if (base.byteLength() != working.byteLength() || !base.sha256().equals(working.sha256())
                || Files.isSameFile(baseDatabase, workingDatabase)) {
            throw new IllegalStateException("Materialized base与working SQLite初始身份不闭合。");
        }
        Path attemptRoot = arguments.out().getParent();
        String basePath = attemptRoot.relativize(baseDatabase).toString().replace(baseDatabase.getFileSystem().getSeparator(), "/");
        String workingPath = attemptRoot.relativize(workingDatabase).toString().replace(workingDatabase.getFileSystem().getSeparator(), "/");
        return Map.of("storage_root", "storage", "materialized_base_root", "storage/materialized-base",
                "project_db_ref", new AssetRef("PROJECT_DB", basePath, base.byteLength(), base.sha256()).asMap(),
                "working_project_db_path", workingPath, "working_clone_byte_length", working.byteLength(),
                "working_clone_sha256", working.sha256(), "storage_schema_version", "1.0", "sqlite_quick_check", "ok",
                "foreign_key_check_count", 0, "sidecar_absent", true);
    }

    private static void verifyDatabaseIntegrity(Path database) throws Exception {
        String quickCheck;
        int foreignKeyCount = 0;
        try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + database.toAbsolutePath())) {
            try (PreparedStatement statement = connection.prepareStatement("PRAGMA quick_check"); ResultSet result = statement.executeQuery()) {
                if (!result.next()) throw new IllegalStateException("SQLite quick_check 未返回结果。");
                quickCheck = result.getString(1);
            }
            try (PreparedStatement statement = connection.prepareStatement("PRAGMA foreign_key_check"); ResultSet result = statement.executeQuery()) {
                while (result.next()) foreignKeyCount++;
            }
        }
        if (!"ok".equals(quickCheck) || foreignKeyCount != 0) throw new IllegalStateException("SQLite 完整性校验失败。");
        for (String suffix : List.of("-wal", "-shm", "-journal")) {
            if (Files.exists(database.resolveSibling(database.getFileName() + suffix), LinkOption.NOFOLLOW_LINKS)) {
                throw new IllegalStateException("SQLite sidecar 未清除。");
            }
        }
    }

    private static String sha256Jcs(Map<String, ?> value) {
        return sha256(Rfc8785JsonCanonicalizer.canonicalize(value).getBytes(StandardCharsets.UTF_8));
    }

    private static void writeArtifactAtomically(Path out, Map<String, Object> artifact) throws IOException {
        Path temporary = Files.createTempFile(out.getParent(), ".fixture-materialization-", ".tmp");
        try {
            byte[] bytes = (Rfc8785JsonCanonicalizer.canonicalize(artifact) + "\n").getBytes(StandardCharsets.UTF_8);
            try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING)) {
                channel.write(ByteBuffer.wrap(bytes));
                channel.force(true);
            }
            Files.move(temporary, out, StandardCopyOption.ATOMIC_MOVE);
            try (FileChannel directory = FileChannel.open(out.getParent(), StandardOpenOption.READ)) {
                directory.force(true);
            }
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private static void cleanupFailedMaterialization(Arguments arguments) {
        try {
            deleteTree(arguments.storage());
            Files.deleteIfExists(arguments.out());
            try (var files = Files.list(arguments.out().getParent())) {
                for (Path file : files.toList()) {
                    if (file.getFileName().toString().startsWith(".fixture-materialization-") && file.getFileName().toString().endsWith(".tmp")) {
                        Files.deleteIfExists(file);
                    }
                }
            }
        } catch (IOException ignored) {
            // 调用方仅能处理本 attempt 的失败清理，保留原始异常作为退出证据。
        }
    }

    private static void deleteTree(Path root) throws IOException {
        if (!Files.exists(root, LinkOption.NOFOLLOW_LINKS)) return;
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) throws IOException { Files.delete(file); return FileVisitResult.CONTINUE; }
            @Override public FileVisitResult postVisitDirectory(Path directory, IOException exception) throws IOException {
                if (exception != null) throw exception;
                Files.delete(directory);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private static InputRef validateInput(JsonNode manifest, Arguments arguments) throws IOException {
        JsonNode selectedCase = manifestCase(manifest, arguments.caseId());
        ManifestRawRef ref = ManifestRawRef.from(selectedCase.path("input_ref"), arguments.fixtureKind(), "INPUT", "E2E_INPUT_INVALID");
        Path source = resolveManifestInput(arguments.manifestRoot(), ref.path());
        if (!isSingleLinkRegularFile(source) || !isSingleLinkRegularFile(arguments.inputPath())) {
            throw input("E2E_INPUT_INVALID", "Materializer input 不是受控普通文件。");
        }
        if (Files.isSameFile(source, arguments.inputPath()) || Files.mismatch(source, arguments.inputPath()) != -1) {
            throw input("E2E_FIXTURE_MISMATCH", "Materializer input raw bytes 与 Manifest source 不匹配。");
        }
        byte[] sourceBytes = Files.readAllBytes(source);
        if (sourceBytes.length != ref.byteLength() || !sha256(sourceBytes).equals(ref.sha256())) {
            throw input("E2E_FIXTURE_MISMATCH", "Manifest input raw ref 不匹配。");
        }
        return new InputRef(ref, source);
    }

    private static Path resolveManifestInput(Path manifestRoot, String rawPath) {
        if (Path.of(rawPath).isAbsolute() || rawPath.contains("\\")
                || java.util.Arrays.stream(rawPath.split("/")).anyMatch(part -> part.isEmpty() || ".".equals(part) || "..".equals(part))) {
            throw input("E2E_INPUT_INVALID", "Manifest input_ref.path 不安全。");
        }
        Path source = manifestRoot.resolve(rawPath).normalize();
        if (!source.startsWith(manifestRoot)) throw input("E2E_INPUT_INVALID", "Manifest input_ref 超出 manifest-root。");
        return source;
    }

    private static void validateManifestShape(JsonNode manifest) {
        if (!MANIFEST_SCHEMA_ID.equals(text(manifest, "schema_id")) || !"0.2".equals(text(manifest, "schema_version"))
                || !"0.2.0".equals(text(manifest, "manifest_version"))) {
            throw input("E2E_INPUT_INVALID", "Manifest 不是活动 0.2 版本。");
        }
        JsonNode cases = manifest.path("cases");
        JsonNode refs = manifest.path("fixture_refs");
        if (!cases.isArray() || cases.size() != 194 || !refs.isArray() || !manifest.path("profile_asset_tree_ref").isObject()
                || !manifest.path("profile_asset_refs").isArray() || manifest.path("profile_asset_refs").size() != 5) {
            throw input("E2E_INPUT_INVALID", "Manifest 0.2 Schema 所需的 case、fixture 或 Profile 字段不完整。");
        }
    }

    private static ProfileAssets validateProfileAssets(JsonNode manifest, Path root, Path bindingPath) throws IOException {
        try {
        requireDirectory(root, "E2E_MANIFEST_PROFILE_ASSET_INVALID");
        JsonNode treeRef = manifest.path("profile_asset_tree_ref");
        if (!"PROFILE_ASSET_TREE".equals(text(treeRef, "kind")) || !PROFILE_TREE_ROOT.equals(text(treeRef, "path"))) {
            throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "Profile tree ref 不符合活动契约。");
        }
        List<AssetRef> refs = new ArrayList<>();
        for (JsonNode value : manifest.path("profile_asset_refs")) refs.add(AssetRef.from(value, "E2E_MANIFEST_PROFILE_ASSET_INVALID"));
        if (refs.size() != PROFILE_KINDS.size() || refs.stream().map(AssetRef::kind).collect(java.util.stream.Collectors.toSet()).size() != PROFILE_KINDS.size()
                || !refs.stream().map(AssetRef::kind).collect(java.util.stream.Collectors.toSet()).equals(PROFILE_KINDS)) {
            throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "Profile asset kind 集合不闭合。");
        }
        List<AssetRef> sorted = refs.stream().sorted(Comparator.comparing(AssetRef::path, E2EFixtureMaterializerCli::utf8Compare)).toList();
        if (!sorted.equals(refs)) throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "Profile asset ref 未按 UTF-8 path 排序。");

        Set<String> expectedPaths = new HashSet<>();
        long totalBytes = 0;
        for (AssetRef ref : refs) {
            String relative = profileRelativePath(ref.path());
            expectedPaths.add(relative);
            Path file = root.resolve(relative).normalize();
            if (!file.startsWith(root) || !isSingleLinkRegularFile(file)) {
                throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "Profile asset 不是受控普通文件：" + ref.path());
            }
            byte[] bytes = Files.readAllBytes(file);
            if (bytes.length != ref.byteLength() || !sha256(bytes).equals(ref.sha256())) {
                throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "Profile asset raw ref 不匹配：" + ref.path());
            }
            totalBytes += bytes.length;
        }
        verifyProfileTreeShape(root, expectedPaths);
        if (totalBytes != longValue(treeRef, "byte_length")) {
            throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "Profile tree byte_length 不匹配。");
        }
        Map<String, Object> treePreimage = new LinkedHashMap<>();
        treePreimage.put("schema_id", PROFILE_TREE_SCHEMA_ID);
        treePreimage.put("schema_version", "0.1");
        treePreimage.put("root_path", PROFILE_TREE_ROOT);
        treePreimage.put("entries", refs.stream().map(AssetRef::asMap).toList());
        if (!sha256(Rfc8785JsonCanonicalizer.canonicalize(treePreimage).getBytes(StandardCharsets.UTF_8)).equals(text(treeRef, "sha256"))) {
            throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "Profile tree digest 不匹配。");
        }

        AssetRef profileRef = refs.stream().filter(item -> "PROFILE_PACKAGE".equals(item.kind())).findFirst()
                .orElseThrow(() -> input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "缺少 PROFILE_PACKAGE。"));
        JsonNode profile = readObject(root.resolve(profileRelativePath(profileRef.path())), "E2E_MANIFEST_PROFILE_ASSET_INVALID");
        String packageDigest = validateProfilePackage(profile, refs);
        SemanticRevision.ProfileBinding binding = readBinding(bindingPath);
        if (!packageDigest.equals(binding.profile().sha256())) {
            throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "active_binding.profile 与 Profile package digest 不匹配。");
        }
        return new ProfileAssets(profileRef, List.copyOf(refs), packageDigest, binding);
        } catch (PreflightException exception) {
            if ("E2E_INPUT_INVALID".equals(exception.code)) {
                throw new PreflightException("E2E_MANIFEST_PROFILE_ASSET_INVALID", 3, exception.getMessage());
            }
            throw exception;
        }
    }

    private static String validateProfilePackage(JsonNode profile, List<AssetRef> refs) {
        JsonNode entries = profile.path("manifest").path("entries");
        if (!entries.isArray() || entries.size() != 4) {
            throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "profile.json 的依赖项不闭合。");
        }
        Map<String, AssetRef> byKind = new HashMap<>();
        for (AssetRef ref : refs) byKind.put(ref.kind(), ref);
        List<String> lines = new ArrayList<>();
        Set<String> roles = new HashSet<>();
        for (JsonNode entry : entries) {
            String role = text(entry, "role");
            String logicalPath = text(entry, "logical_path");
            long byteLength = longValue(entry, "byte_length");
            String digest = entry.path("digest").path("digest").asText();
            AssetRef ref = byKind.get(role);
            if (!PROFILE_KINDS.contains(role) || "PROFILE_PACKAGE".equals(role) || ref == null || !roles.add(role)
                    || !logicalPath.equals(profileRelativePath(ref.path())) || byteLength != ref.byteLength() || !digest.equals(ref.sha256())) {
                throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "profile.json dependency 与 raw asset ref 不匹配。");
            }
            lines.add(logicalPath + "\n" + byteLength + "\n" + digest + "\n");
        }
        lines.sort(E2EFixtureMaterializerCli::utf8Compare);
        String digest = sha256(String.join("", lines).getBytes(StandardCharsets.UTF_8));
        if (!digest.equals(profile.path("manifest").path("package_digest").path("digest").asText())) {
            throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "Profile package digest 不匹配。");
        }
        return digest;
    }

    private static int validateFaultPlan(JsonNode plan, Arguments arguments, JsonNode manifest) {
        if (!FAULT_PLAN_SCHEMA_ID.equals(text(plan, "schema_id")) || !"0.2".equals(text(plan, "schema_version"))
                || !arguments.caseId().equals(text(plan, "case_id")) || (plan.path("attempt_ordinal").asInt(-1) != 1 && plan.path("attempt_ordinal").asInt(-1) != 2)) {
            throw input("E2E_INPUT_INVALID", "Fault Plan identity 不匹配。");
        }
        verifyPayloadDigest(plan, "plan_sha256", Set.of("schema_id", "schema_version", "plan_sha256", "artifact_payload_sha256"));
        verifyPayloadDigest(plan, "artifact_payload_sha256", Set.of("artifact_payload_sha256"));
        if (!manifestCase(manifest, arguments.caseId()).isObject()) {
            throw input("E2E_INPUT_INVALID", "Fault Plan case 不在 Manifest 中。");
        }
        return plan.path("attempt_ordinal").asInt();
    }

    private static FixtureIdentity validateFamily(JsonNode manifest, JsonNode catalog, JsonNode fixture, Arguments arguments) throws IOException {
        try {
        JsonNode selectedCase = manifestCase(manifest, arguments.caseId());
        if (!selectedCase.hasNonNull("capability_id")) throw input("E2E_FIXTURE_MISMATCH", "FAMILY case 缺少 capability_id。");
        ManifestRawRef fixtureRef = ManifestRawRef.from(selectedCase.path("fixture_ref"), "FAMILY", "FIXTURE", "E2E_FIXTURE_MISMATCH");
        byte[] fixtureBytes = Files.readAllBytes(arguments.fixturePath());
        if (fixtureBytes.length != fixtureRef.byteLength() || !sha256(fixtureBytes).equals(fixtureRef.sha256())
                || !"MS-REV-001".equals(text(fixture, "schema_id")) || !"0.2".equals(text(fixture, "schema_version"))) {
            throw input("E2E_FIXTURE_MISMATCH", "Family fixture raw bytes 或 Schema 不匹配。");
        }
        AssetRef catalogRef = catalogRef(manifest);
        byte[] catalogBytes = Files.readAllBytes(arguments.familyCatalogPath());
        if (catalogBytes.length != catalogRef.byteLength() || !sha256(catalogBytes).equals(catalogRef.sha256())) {
            throw input("E2E_FIXTURE_MISMATCH", "Family Catalog raw ref 不匹配。");
        }
        if (!FAMILY_CATALOG_SCHEMA_ID.equals(text(catalog, "schema_id")) || !"0.1".equals(text(catalog, "schema_version"))
                || !"0.1.0".equals(text(catalog, "catalog_version"))) {
            throw input("E2E_FIXTURE_MISMATCH", "Family Catalog Schema 不匹配。");
        }
        verifyPayloadDigest(catalog, "catalog_payload_sha256", Set.of("catalog_payload_sha256"));
        List<JsonNode> familyCases = new ArrayList<>();
        for (JsonNode value : manifest.path("cases")) if (value.hasNonNull("capability_id")) familyCases.add(value);
        if (familyCases.size() != 178 || manifest.path("cases").size() != 194) throw input("E2E_FIXTURE_MISMATCH", "Family case 集合不闭合。");
        Set<String> fixtureShas = new HashSet<>();
        for (JsonNode value : familyCases) fixtureShas.add(text(value.path("fixture_ref"), "sha256"));
        if (fixtureShas.size() != 2 || catalog.path("entries").size() != 2 || catalog.path("summary").path("family_case_count").asInt(-1) != 178
                || catalog.path("summary").path("distinct_base_fixture_count").asInt(-1) != 2) {
            throw input("E2E_FIXTURE_MISMATCH", "Family Catalog 集合摘要不闭合。");
        }
        JsonNode matched = null;
        Set<String> projects = new HashSet<>();
        for (JsonNode entry : catalog.path("entries")) {
            String sha = text(entry, "fixture_sha256");
            String project = text(entry, "project_id");
            if (!fixtureShas.contains(sha) || !projects.add(project) || project.startsWith("project.golden.fixture.") || project.startsWith("project.recovery.")) {
                throw input("E2E_FIXTURE_MISMATCH", "Family Catalog identity 不合法。");
            }
            if (fixtureRef.sha256().equals(sha)) matched = entry;
        }
        if (matched == null || !fixtureShas.equals(catalog.path("entries").findValuesAsText("fixture_sha256").stream().collect(java.util.stream.Collectors.toSet()))) {
            throw input("E2E_FIXTURE_MISMATCH", "Family Catalog fixture 集合不匹配。");
        }
        String parent = fixture.has("parent_revision_id") && fixture.path("parent_revision_id").isTextual() ? fixture.path("parent_revision_id").asText() : null;
        if (fixture.has("parent_revision_id") && parent == null || !text(matched, "model_id").equals(text(fixture, "model_id"))
                || !text(matched, "model_id").equals(text(fixture.path("model_header"), "model_id"))
                || !text(matched, "context_id").equals(text(fixture.path("model_header"), "root_context_id"))
                || !text(matched, "base_revision").equals(text(fixture, "revision_id"))
                || matched.path("revision_sequence").asLong(-1) != fixture.path("revision_sequence").asLong(-1)
                || !java.util.Objects.equals(parent, matched.path("parent_revision_id").isNull() ? null : text(matched, "parent_revision_id"))) {
            throw input("E2E_FIXTURE_MISMATCH", "Family Catalog 与 fixture identity 不匹配。");
        }
        return new FixtureIdentity(text(matched, "project_id"), text(matched, "model_id"), text(matched, "context_id"), text(matched, "base_revision"));
        } catch (PreflightException exception) {
            if ("E2E_INPUT_INVALID".equals(exception.code)) {
                throw new PreflightException("E2E_FIXTURE_MISMATCH", 3, exception.getMessage());
            }
            throw exception;
        }
    }

    private static FixtureIdentity validateCommon(JsonNode manifest, JsonNode fixture, Arguments arguments) throws IOException {
        JsonNode selectedCase = manifestCase(manifest, arguments.caseId());
        if (selectedCase.hasNonNull("capability_id") || !"FIXTURE".equals(text(selectedCase.path("fixture_ref"), "kind"))) {
            throw input("E2E_FIXTURE_MISMATCH", "COMMON case 必须使用无 capability 的 FIXTURE base ref。");
        }
        ManifestRawRef fixtureRef = ManifestRawRef.from(selectedCase.path("fixture_ref"), "COMMON", "FIXTURE", "E2E_FIXTURE_MISMATCH");
        byte[] fixtureBytes = Files.readAllBytes(arguments.fixturePath());
        if (fixtureBytes.length != fixtureRef.byteLength() || !sha256(fixtureBytes).equals(fixtureRef.sha256())
                || !arguments.caseId().equals(text(fixture, "case_id")) || !"BASE".equals(text(fixture, "fixture_kind"))) {
            throw input("E2E_FIXTURE_MISMATCH", "COMMON base fixture raw bytes 或 identity 不匹配。");
        }
        String initialRevision = text(fixture, "initial_revision");
        String seed = sha256(arguments.caseId().getBytes(StandardCharsets.UTF_8)).substring(0, 16);
        return new FixtureIdentity("project.e2e." + seed, "model.e2e." + seed, "context.e2e." + seed, initialRevision);
    }

    private static byte[] commonRevision(PreflightResult result, SemanticRevision.ProfileBinding binding) throws IOException {
        JsonNode fixture = readObject(result.arguments().fixturePath(), "E2E_FIXTURE_MISMATCH");
        ObjectNode root = JSON.createObjectNode();
        String modelId = result.identity().modelId();
        String contextId = result.identity().contextId();
        root.put("schema_id", "MS-REV-001");
        root.put("schema_version", "0.2");
        root.put("revision_id", result.identity().baseRevision());
        root.put("model_id", modelId);
        root.put("revision_sequence", 1);
        root.set("schema_set_ref", JSON.createObjectNode().put("core_metamodel_version", "0.2").put("profile_schema_version", "0.2").put("rule_schema_version", "0.1").put("storage_schema_version", "1.0"));
        root.set("profile_binding", bindingNode(binding));
        ObjectNode header = root.putObject("model_header");
        header.put("model_id", modelId);
        header.putObject("identity_namespace").put("namespace", "urn:opm:release:e2e:common").put("local_name", result.caseId().toLowerCase(Locale.ROOT));
        header.put("name", text(fixture, "model_name"));
        header.put("description", "Release E2E Common fixture.");
        header.put("root_context_id", contextId);
        root.putArray("elements"); root.putArray("features"); root.putArray("states"); root.putArray("facts");
        ObjectNode context = root.putArray("contexts").addObject();
        context.put("context_id", contextId).put("context_kind", "SYSTEM_DIAGRAM");
        context.set("capability_ref", JSON.createObjectNode().put("capability_id", "CAP-CONTEXT-001").put("profile_id", binding.profile().id()).put("profile_version", binding.profile().version()));
        context.putObject("name").put("namespace", "urn:opm:release:e2e:common").put("local_name", "SD");
        context.putArray("occurrence_ids");
        context.set("source", JSON.createObjectNode().put("source_profile_id", binding.profile().id()).put("source_profile_version", binding.profile().version()).put("source_kind", "CommonFixture").put("source_entity_id", result.caseId()));
        root.putArray("occurrences"); root.putArray("layouts"); root.putArray("state_presentations");
        return (JSON.writeValueAsString(root) + "\n").getBytes(StandardCharsets.UTF_8);
    }

    private static ObjectNode bindingNode(SemanticRevision.ProfileBinding binding) {
        ObjectNode node = JSON.createObjectNode();
        node.set("profile", assetNode(binding.profile())); node.set("rule_set", assetNode(binding.ruleSet()));
        node.set("text_grammar", assetNode(binding.textGrammar())); node.set("symbol_catalog", assetNode(binding.symbolCatalog()));
        node.set("normalization_adapter", assetNode(binding.normalizationAdapter()));
        node.putObject("binding_digest").put("algorithm", "sha256").put("digest", binding.bindingDigest());
        return node;
    }

    private static ObjectNode assetNode(SemanticRevision.AssetReference asset) {
        return JSON.createObjectNode().put("id", asset.id()).put("version", asset.version()).set("digest", JSON.createObjectNode().put("algorithm", "sha256").put("digest", asset.sha256()));
    }

    private static JsonNode manifestCase(JsonNode manifest, String caseId) {
        JsonNode result = null;
        for (JsonNode value : manifest.path("cases")) {
            if (caseId.equals(text(value, "case_id"))) {
                if (result != null) throw input("E2E_INPUT_INVALID", "Manifest case_id 不唯一。");
                result = value;
            }
        }
        return result == null ? JSON.createObjectNode() : result;
    }

    private static AssetRef catalogRef(JsonNode manifest) {
        AssetRef result = null;
        for (JsonNode value : manifest.path("fixture_refs")) {
            if (value.path("kind").isTextual()
                    && "FAMILY_FIXTURE_IDENTITY_CATALOG".equals(value.path("kind").asText())) {
                if (result != null) throw input("E2E_FIXTURE_MISMATCH", "Manifest Family Catalog ref 不唯一。");
                result = AssetRef.from(value, "E2E_FIXTURE_MISMATCH");
            }
        }
        if (result == null) throw input("E2E_FIXTURE_MISMATCH", "Manifest 缺少 Family Catalog ref。");
        return result;
    }

    private static void verifyPayloadDigest(JsonNode source, String field, Set<String> removed) {
        ObjectNode copy = ((ObjectNode) source).deepCopy();
        removed.forEach(copy::remove);
        String actual = sha256(Rfc8785JsonCanonicalizer.canonicalize(copy).getBytes(StandardCharsets.UTF_8));
        if (!actual.equals(text(source, field))) throw input("E2E_INPUT_INVALID", "Payload digest 不匹配：" + field);
    }

    private static void verifyProfileTreeShape(Path root, Set<String> expectedPaths) throws IOException {
        Set<String> actual = new HashSet<>();
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attributes) {
                if (!attributes.isDirectory() || Files.isSymbolicLink(directory)) throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "Profile tree 含非普通目录。");
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) throws IOException {
                if (!attributes.isRegularFile() || !isSingleLinkRegularFile(file)) throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "Profile tree 含非受控文件。");
                actual.add(root.relativize(file).toString().replace(file.getFileSystem().getSeparator(), "/"));
                return FileVisitResult.CONTINUE;
            }
        });
        if (!actual.equals(expectedPaths)) throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "Profile tree 存在缺项或额外文件。");
    }

    private static boolean isSingleLinkRegularFile(Path path) throws IOException {
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(path)) return false;
        try {
            return ((Number) Files.getAttribute(path, "unix:nlink", LinkOption.NOFOLLOW_LINKS)).longValue() == 1;
        } catch (UnsupportedOperationException exception) {
            return true;
        }
    }

    private static void requireDirectory(Path path, String code) {
        if (!Files.isDirectory(path, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(path)) throw input(code, "目录不是受控普通目录。");
    }

    private static JsonNode readObject(Path path, String code) throws IOException {
        if (!isSingleLinkRegularFile(path)) throw input(code, "输入不是受控普通文件：" + path);
        JsonNode value;
        try {
            value = JSON.readTree(Files.readAllBytes(path));
        } catch (IOException exception) {
            throw input(code, "无法解析 JSON 输入：" + path);
        }
        if (value == null || !value.isObject()) throw input(code, "JSON root 必须是对象：" + path);
        return value;
    }

    private static String text(JsonNode source, String field) {
        JsonNode value = source.path(field);
        if (!value.isTextual() || value.asText().isEmpty()) throw input("E2E_INPUT_INVALID", "缺少字符串字段：" + field);
        return value.asText();
    }

    private static long longValue(JsonNode source, String field) {
        JsonNode value = source.path(field);
        if (!value.canConvertToLong() || value.asLong() < 0) throw input("E2E_INPUT_INVALID", "缺少非负整数：" + field);
        return value.asLong();
    }

    private static String profileRelativePath(String path) {
        String prefix = PROFILE_TREE_ROOT + "/";
        if (!path.startsWith(prefix) || path.substring(prefix.length()).contains("\\") || path.substring(prefix.length()).split("/").length == 0) {
            throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "Profile asset path 不安全。");
        }
        String relative = path.substring(prefix.length());
        if (relative.isEmpty() || relative.startsWith("/") || relative.split("/").length == 0
                || java.util.Arrays.stream(relative.split("/")).anyMatch(part -> part.isEmpty() || ".".equals(part) || "..".equals(part))) {
            throw input("E2E_MANIFEST_PROFILE_ASSET_INVALID", "Profile asset path 不安全。");
        }
        return relative;
    }

    private static int utf8Compare(String left, String right) {
        byte[] leftBytes = left.getBytes(StandardCharsets.UTF_8);
        byte[] rightBytes = right.getBytes(StandardCharsets.UTF_8);
        for (int index = 0; index < Math.min(leftBytes.length, rightBytes.length); index++) {
            int compare = Byte.toUnsignedInt(leftBytes[index]) - Byte.toUnsignedInt(rightBytes[index]);
            if (compare != 0) return compare;
        }
        return Integer.compare(leftBytes.length, rightBytes.length);
    }

    private static String sha256(byte[] bytes) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception exception) {
            throw new IllegalStateException("无法计算 SHA-256。", exception);
        }
    }

    private static PreflightException input(String code, String message) {
        return new PreflightException(code, "E2E_INPUT_INVALID".equals(code) ? 2 : 3, message);
    }

    private static PreflightException environment(String message) {
        return new PreflightException("E2E_ENVIRONMENT_MISMATCH", 3, message);
    }

    record PreflightResult(Arguments arguments, JsonNode manifest, String caseId, int attemptOrdinal, long sourceDateEpoch, FixtureIdentity identity,
                           ProfileAssets profileAssets, InputRef inputRef) { }
    record FixtureIdentity(String projectId, String modelId, String contextId, String baseRevision) { }
    record ProfileAssets(AssetRef profilePackage, List<AssetRef> refs, String packageDigest, SemanticRevision.ProfileBinding activeBinding) { }
    record InputRef(ManifestRawRef manifestRef, Path sourcePath) { }
    record RuntimeJarIdentity(AssetRef reference, String sourceSha256) { }
    record RawFileObservation(long byteLength, String sha256) { }

    record ManifestRawRef(Map<String, Object> value, String path, long byteLength, String sha256) {
        static ManifestRawRef from(JsonNode node, String fixtureKind, String commonKind, String code) {
            if (!node.isObject()) throw input(code, "Manifest raw ref 必须是对象。");
            Set<String> fields = new HashSet<>();
            node.fieldNames().forEachRemaining(fields::add);
            Set<String> archiveFields = Set.of("path", "byte_length", "sha256", "bundle_sha256", "archive_entry_path");
            Set<String> fileFields = Set.of("kind", "path", "byte_length", "sha256");
            if ("FAMILY".equals(fixtureKind)) {
                if (!fields.equals(archiveFields) || !text(node, "bundle_sha256").matches("[a-f0-9]{64}")) {
                    throw input(code, "Family raw ref 不是封闭 ArchiveEntryRef。");
                }
                text(node, "archive_entry_path");
            } else if (!"COMMON".equals(fixtureKind) || !fields.equals(fileFields) || !commonKind.equals(text(node, "kind"))) {
                throw input(code, "Common raw ref 不是固定 kind 的封闭 FileRef。");
            }
            String sha = text(node, "sha256");
            if (!sha.matches("[a-f0-9]{64}")) throw input(code, "Manifest raw ref SHA 不合法。");
            @SuppressWarnings("unchecked") Map<String, Object> raw = JSON.convertValue(node, LinkedHashMap.class);
            return new ManifestRawRef(Map.copyOf(raw), text(node, "path"), longValue(node, "byte_length"), sha);
        }

        Map<String, Object> asMap() { return value; }
    }

    record AssetRef(String kind, String path, long byteLength, String sha256) {
        static AssetRef from(JsonNode value, String code) {
            if (!value.isObject()) throw input(code, "raw ref 必须是对象。");
            String kind = text(value, "kind");
            String path = text(value, "path");
            String sha = text(value, "sha256");
            if (!sha.matches("[a-f0-9]{64}")) throw input(code, "raw ref SHA 不合法。");
            return new AssetRef(kind, path, longValue(value, "byte_length"), sha);
        }

        Map<String, Object> asMap() {
            return Map.of("kind", kind, "path", path, "byte_length", byteLength, "sha256", sha256);
        }
    }

    static final class PreflightException extends RuntimeException {
        private final String code;
        private final int exitCode;

        PreflightException(String code, int exitCode, String message) {
            super(message);
            this.code = code;
            this.exitCode = exitCode;
        }

        String code() { return code; }
    }

    private record Arguments(String fixtureKind, String caseId, Path fixturePath, Path familyCatalogPath, Path manifestRoot, Path manifestPath, Path inputPath,
                             Path profileAssetRoot, Path bindingPath, Path faultPlan, Path storage, Path out) {
        static Arguments parse(String[] argv) {
            Map<String, String> values = new HashMap<>();
            for (int index = 0; index < argv.length; index += 2) {
                if (index + 1 >= argv.length || !argv[index].startsWith("--")) throw input("E2E_INPUT_INVALID", "CLI 参数不完整。");
                String name = argv[index].substring(2);
                if (!ALL_OPTIONS.contains(name) || values.put(name, argv[index + 1]) != null) throw input("E2E_INPUT_INVALID", "CLI 参数不合法或重复。");
            }
            String fixtureKind = values.get("fixture-kind");
            boolean family = "FAMILY".equals(fixtureKind);
            boolean common = "COMMON".equals(fixtureKind);
            if (!values.keySet().containsAll(REQUIRED_OPTIONS) || !"RELEASE_E2E_ONLY".equals(values.get("guard")) || (!family && !common)
                    || (family != values.containsKey("family-identity-catalog")) || values.containsKey("attempt-ordinal")) {
                throw input("E2E_INPUT_INVALID", "CLI guard 或 fixture-kind 参数不符合契约。");
            }
            Path manifestRoot = Path.of(values.get("manifest-root")).toAbsolutePath().normalize();
            requireDirectory(manifestRoot, "E2E_INPUT_INVALID");
            String manifestRelative = values.get("manifest");
            if (Path.of(manifestRelative).isAbsolute() || manifestRelative.contains("\\") || java.util.Arrays.stream(manifestRelative.split("/")).anyMatch(part -> part.isEmpty() || ".".equals(part) || "..".equals(part))) {
                throw input("E2E_INPUT_INVALID", "manifest 必须是 manifest-root 内相对路径。");
            }
            Path manifest = manifestRoot.resolve(manifestRelative).normalize();
            if (!manifest.startsWith(manifestRoot)) throw input("E2E_INPUT_INVALID", "manifest 超出 manifest-root。");
            Path storage = Path.of(values.get("storage")).toAbsolutePath().normalize();
            Path out = Path.of(values.get("out")).toAbsolutePath().normalize();
            if (Files.exists(storage, LinkOption.NOFOLLOW_LINKS) || Files.exists(out, LinkOption.NOFOLLOW_LINKS)
                    || !storage.getParent().equals(out.getParent()) || !storage.getFileName().toString().equals("storage")) {
                throw input("E2E_INPUT_INVALID", "storage 或 out 不是 fresh attempt root 目标。");
            }
            Path attemptRoot = out.getParent();
            Path faultPlan = Path.of(values.get("fault-plan")).toAbsolutePath().normalize();
            if (!faultPlan.getParent().equals(out.getParent()) || !faultPlan.getFileName().toString().equals("fault-plan.json")) {
                throw input("E2E_INPUT_INVALID", "fault-plan 不在同一 attempt root。");
            }
            Path profileRoot = Path.of(values.get("profile-asset-root")).toAbsolutePath().normalize();
            Path binding = requiredFile(values.get("binding"));
            Path fixture = requiredFile(values.get("fixture"));
            Path catalog = family ? requiredFile(values.get("family-identity-catalog")) : null;
            Path input = requiredFile(values.get("input"));
            if (!manifestRoot.startsWith(attemptRoot) || !fixture.startsWith(attemptRoot) || !input.startsWith(attemptRoot)
                    || !binding.startsWith(attemptRoot) || (catalog != null && !catalog.startsWith(attemptRoot))
                    || !profileRoot.equals(attemptRoot.resolve("profile/assets"))) {
                throw input("E2E_INPUT_INVALID", "Materializer 输入必须位于当前 attempt root，且 Profile root 固定为 profile/assets。");
            }
            return new Arguments(fixtureKind, values.get("case-id"), fixture, catalog,
                    manifestRoot, manifest, input, profileRoot, binding, faultPlan, storage, out);
        }

        private static Path requiredFile(String value) {
            Path path = Path.of(value).toAbsolutePath().normalize();
            try {
                if (!isSingleLinkRegularFile(path)) throw input("E2E_INPUT_INVALID", "输入不是受控普通文件。");
            } catch (IOException exception) {
                throw input("E2E_INPUT_INVALID", "无法读取输入文件。");
            }
            return path;
        }
    }
}
