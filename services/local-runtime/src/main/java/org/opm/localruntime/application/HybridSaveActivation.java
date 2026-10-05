package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.api.generated.DraftSaveContract;
import org.opm.localruntime.api.generated.DraftSaveContract.*;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.golden.OplGoldenArtifactCanonicalWriter;
import org.opm.localruntime.releaseauthoring.ProjectionDigestV01;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;
import org.opm.localruntime.semantic.*;
import org.opm.localruntime.storage.*;
import org.opm.localruntime.text.OplTextGenerationService;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;

/** 离线准备快照的受控激活；不注册到常驻 Runtime，不安装或替换原库。 */
public final class HybridSaveActivation {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final LocalApiService domain;
    private final ProfilePackageAssembler profiles;
    private final ActivatedDraftRepository repository = new ActivatedDraftRepository();
    private final HybridSavePreparation preparation = new HybridSavePreparation();
    private record Readback(long contexts, String digest) { }

    public HybridSaveActivation(LocalApiService domain, FileProfilePackageLoader loader) {
        this.domain = Objects.requireNonNull(domain); this.profiles = new ProfilePackageAssembler(loader);
    }

    public DraftActivationReport activate(Path preparationRoot, Path outputRoot, Path migrationRoot, DraftActivationRequest request) {
        try {
            require(request != null && outputRoot != null && migrationRoot != null, "INPUT_INVALID");
            Path source = directory(preparationRoot);
            var prepared = checkedPreparation(source, request);
            Path absolute = outputRoot.toAbsolutePath().normalize();
            require(absolute.getParent() != null && Files.isDirectory(absolute.getParent()), "INPUT_INVALID");
            Path output = absolute.getParent().toRealPath().resolve(absolute.getFileName());
            require(!output.startsWith(source) && !Files.isSymbolicLink(output), "INPUT_INVALID");
            if (Files.exists(output, LinkOption.NOFOLLOW_LINKS)) {
                require(Files.isRegularFile(output.resolve("report.json"), LinkOption.NOFOLLOW_LINKS), "OUTPUT_EXISTS");
                var previous = verify(output); require(previous.request().equals(request), "OUTPUT_EXISTS"); return previous;
            }
            var before = validate(repository.source(source.resolve("backup.sqlite"), prepared));
            try { Files.createDirectory(output); }
            catch (FileAlreadyExistsException error) { throw failure("OUTPUT_EXISTS", error); }
            Path mirror = Files.createDirectory(output.resolve("preparation"));
            for (String name : List.of("backup.sqlite", "prepared.sqlite", "report.json")) {
                Files.copy(source.resolve(name), mirror.resolve(name)); force(mirror.resolve(name));
            }
            require(checkedPreparation(mirror, request).equals(prepared), "PREPARATION_MISMATCH"); force(mirror);
            Path storage = Files.createDirectory(output.resolve("storage"));
            Path projects = Files.createDirectory(storage.resolve("projects"));
            Path project = Files.createDirectory(projects.resolve(prepared.request().project_id()));
            Path database = project.resolve("project.db"); Files.copy(mirror.resolve("prepared.sqlite"), database);
            try { repository.activate(database, mirror.resolve("backup.sqlite"), directory(migrationRoot), prepared); }
            catch (IllegalArgumentException error) { throw failure("SCHEMA_MISMATCH", error); }
            catch (org.flywaydb.core.api.FlywayException error) { throw failure("SCHEMA_MISMATCH", error); }
            var after = validate(repository.verify(database, mirror.resolve("backup.sqlite"), prepared));
            require(before.equals(after), "CONTENT_MISMATCH");
            repository.seal(database); standalone(database); force(database); force(project); force(projects); force(storage);
            var report = new DraftActivationReport("OPM-DRAFT-ACTIVATION", "0.1", "ACTIVATED_COPY", request, prepared,
                    hash(database), Files.size(database), after.contexts(), after.digest());
            Path pending = output.resolve("report.json.pending");
            Files.writeString(pending, JSON.writeValueAsString(report) + "\n", StandardOpenOption.CREATE_NEW); force(pending);
            Files.move(pending, output.resolve("report.json"), StandardCopyOption.ATOMIC_MOVE); force(output);
            return verify(output);
        } catch (Failure error) { throw error; }
        catch (Exception error) { throw failure("PERSISTENCE_FAILED", error); }
    }

    public DraftActivationReport verify(Path outputRoot) {
        try {
            Path output = directory(outputRoot); regular(output.resolve("report.json"));
            var report = DraftSaveContract.read(Files.readString(output.resolve("report.json")), DraftActivationReport.class);
            Path mirror = directory(output.resolve("preparation"));
            var prepared = checkedPreparation(mirror, report.request());
            require(prepared.equals(report.preparation()), "CONTENT_MISMATCH");
            Path project = directory(directory(directory(output.resolve("storage")).resolve("projects")).resolve(prepared.request().project_id()));
            Path database = project.resolve("project.db"); standalone(database);
            require(hash(database).equals(report.database_sha256()) && Files.size(database) == report.database_bytes(), "CONTENT_MISMATCH");
            var before = validate(repository.source(mirror.resolve("backup.sqlite"), prepared));
            var after = validate(repository.verify(database, mirror.resolve("backup.sqlite"), prepared));
            require(before.equals(after) && after.contexts() == report.context_count() && after.digest().equals(report.readback_digest()), "CONTENT_MISMATCH");
            // verifier使用只读连接，不能通过回读改变已报告的数据库字节。
            standalone(database); require(hash(database).equals(report.database_sha256()), "CONTENT_MISMATCH");
            return report;
        } catch (Failure error) { throw error; }
        catch (Exception error) { throw failure("CONTENT_MISMATCH", error); }
    }

    private DraftPreparationReport checkedPreparation(Path root, DraftActivationRequest request) throws Exception {
        regular(root.resolve("report.json"));
        require(hash(root.resolve("report.json")).equals(request.preparation_report_sha256()), "PREPARATION_MISMATCH");
        DraftPreparationReport report;
        try { report = preparation.verify(root); }
        catch (HybridSavePreparation.Failure error) { throw failure("PREPARATION_MISMATCH", error); }
        require(!Instant.parse(request.activated_at()).isBefore(Instant.parse(report.request().requested_at())), "INPUT_INVALID");
        return report;
    }

    private Readback validate(String raw) {
        try {
            var revision = DraftSemanticView.read(SaveContentDigestV1.read(raw));
            require(revision.profileBinding().equals(RuntimeActiveBindingProvider.current()), "VALIDATION_BLOCKED");
            require(new SemanticRevisionValidator().validate(revision).isEmpty(), "VALIDATION_BLOCKED");
            require(revision.facts().stream().allMatch(fact -> revision.occurrences().stream().anyMatch(occurrence ->
                    occurrence.targetKind() == SemanticRevision.TargetKind.FACT && occurrence.targetId().equals(fact.id())
                            && occurrence.ownership() == SemanticRevision.OccurrenceOwnership.OWNED)), "VALIDATION_BLOCKED");
            var assets = profiles.assemble(revision.profileBinding()); var text = new OplTextGenerationService();
            var writer = new OplGoldenArtifactCanonicalWriter(); var contexts = new ArrayList<Map<String, Object>>();
            for (var context : revision.contexts().stream().sorted(Comparator.comparing(SemanticRevision.Context::id)).toList()) {
                var generated = text.generate(revision, context.id(), assets); text.validateActiveWriteEvidence(revision, assets, generated);
                contexts.add(Map.of("context_id", context.id(),
                        "projection_sha256", hash(Rfc8785JsonCanonicalizer.canonicalize(Map.of("version", "DraftActivationProjection/1", "data", normalize(domain.projectionData(revision, context.id()))))),
                        "opl_sha256", writer.sha256(generated.artifact()), "trace_sha256", writer.sha256Traces(revision.revisionId(), generated.traces())));
            }
            require(!contexts.isEmpty(), "VALIDATION_BLOCKED");
            return new Readback(contexts.size(), hash(Rfc8785JsonCanonicalizer.canonicalize(Map.of("version", "DraftActivationReadback/1", "contexts", contexts))));
        } catch (Failure error) { throw error; }
        catch (Exception error) { throw failure("VALIDATION_BLOCKED", error); }
    }

    private static Object normalize(Object value) {
        if (value instanceof Double || value instanceof Float) return Map.of("$binary64", ProjectionDigestV01.binary64Hex(((Number) value).doubleValue()));
        if (value instanceof Map<?, ?> map) {
            var result = new LinkedHashMap<String, Object>();
            map.forEach((key, item) -> result.put((String) key, normalize(item))); return result;
        }
        if (value instanceof List<?> list) return list.stream().map(HybridSaveActivation::normalize).toList();
        return value;
    }

    private static Path directory(Path path) throws Exception {
        require(path != null && Files.isDirectory(path, LinkOption.NOFOLLOW_LINKS), "INPUT_INVALID"); return path.toRealPath();
    }
    private static void regular(Path path) { require(Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS), "CONTENT_MISMATCH"); }
    private static void standalone(Path file) {
        regular(file);
        for (String suffix : List.of("-wal", "-shm", "-journal")) require(!Files.exists(file.resolveSibling(file.getFileName() + suffix), LinkOption.NOFOLLOW_LINKS), "CONTENT_MISMATCH");
    }
    private static void force(Path path) throws Exception {
        try (var channel = FileChannel.open(path, Files.isDirectory(path) ? StandardOpenOption.READ : StandardOpenOption.WRITE)) { channel.force(true); }
    }
    private static String hash(Path file) throws Exception {
        var digest = MessageDigest.getInstance("SHA-256");
        try (var stream = Files.newInputStream(file)) { byte[] buffer = new byte[65536]; int count; while ((count = stream.read(buffer)) != -1) digest.update(buffer, 0, count); }
        return HexFormat.of().formatHex(digest.digest());
    }
    private static String hash(String text) throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
    private static void require(boolean valid, String code) { if (!valid) throw failure(code, null); }
    private static Failure failure(String code, Exception cause) { return new Failure("DRAFT_ACTIVATION_" + code, cause); }
    public static final class Failure extends IllegalStateException {
        private final String code;
        private Failure(String code, Exception cause) { super(code, cause); this.code = code; }
        public String code() { return code; }
    }
}
