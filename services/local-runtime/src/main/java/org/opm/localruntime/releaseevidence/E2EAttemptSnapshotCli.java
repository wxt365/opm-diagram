package org.opm.localruntime.releaseevidence;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.golden.OplGoldenArtifactCanonicalWriter;
import org.opm.localruntime.releaseauthoring.ProjectionDigestV01;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;
import org.opm.localruntime.releaseauthoring.TokenCanonicalWriter;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionReader;
import org.opm.localruntime.text.OplGenerationResult;
import org.opm.localruntime.text.OplTextGenerationService;
import org.opm.localruntime.text.OplToken;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 从 attempt-local 只读输入复算 E2E Revision 的五类正式摘要。 */
public final class E2EAttemptSnapshotCli {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String GUARD = "RELEASE_E2E_SNAPSHOT_ONLY";
    private static final Set<String> OPTIONS = Set.of("guard", "storage", "project-id", "model-id", "context-id", "revision-id",
            "profile-asset-root", "fixture-materialization", "projection-response");

    private E2EAttemptSnapshotCli() { }

    public static void main(String[] args) {
        int exitCode = run(args);
        if (exitCode != 0) System.exit(exitCode);
    }

    static int run(String[] args) {
        try {
            Map<String, Object> digests = snapshot(Arguments.parse(args));
            System.out.print(Rfc8785JsonCanonicalizer.canonicalize(digests));
            System.out.print('\n');
            return 0;
        } catch (E2EAttemptSnapshotSupport.SnapshotException exception) {
            System.err.println(exception.code + ": " + exception.getMessage());
            return exception.exitCode;
        } catch (Exception exception) {
            System.err.println("E2E_UNEXPECTED_RUNTIME_ERROR: " + exception.getMessage());
            return 4;
        }
    }

    static Map<String, Object> snapshot(Arguments arguments) throws Exception {
        E2EAttemptSnapshotSupport.VerifiedAttempt verified = E2EAttemptSnapshotSupport.verifyAttempt(
                arguments.storage(), arguments.fixtureMaterialization(), arguments.projectId(), arguments.modelId(),
                arguments.contextId(), E2EAttemptSnapshotCli.class);
        Path attemptRoot = verified.attemptRoot();
        E2EAttemptSnapshotSupport.requireExactPath(arguments.profileAssetRoot(), attemptRoot.resolve("profile/assets"),
                "profile asset root");
        E2EAttemptSnapshotSupport.requireInside(arguments.projectionResponse(), attemptRoot.resolve("api-exchanges"),
                "projection response");
        E2EAttemptSnapshotSupport.requireRegular(arguments.projectionResponse(), "projection response");

        Set<FileProfilePackageLoader.DirectPackageFile> profileFiles = profileFiles(verified.materialization(), arguments.profileAssetRoot());
        byte[] revisionBytes = readRevision(verified.database(), arguments);
        SemanticRevision revision = new SemanticRevisionReader().read(new ByteArrayInputStream(revisionBytes));
        if (!arguments.modelId().equals(revision.modelId()) || !arguments.revisionId().equals(revision.revisionId())
                || !arguments.contextId().equals(revision.rootContextId())) {
            throw input("Revision document identity 与请求不一致。");
        }

        @SuppressWarnings("unchecked") Map<String, Object> projection = (Map<String, Object>) projection(arguments.projectionResponse(), arguments);
        ProfilePackageAssembler assembler = new ProfilePackageAssembler(
                FileProfilePackageLoader.forVerifiedDirectPackageRoot(arguments.profileAssetRoot(), profileFiles));
        OplGenerationResult generated = new OplTextGenerationService().generate(revision, arguments.contextId(), assembler.assemble(revision.profileBinding()));
        List<OplToken> tokens = generated.artifact().paragraphs().stream()
                .flatMap(paragraph -> paragraph.sentences().stream())
                .flatMap(sentence -> sentence.tokens().stream()).toList();
        OplGoldenArtifactCanonicalWriter writer = new OplGoldenArtifactCanonicalWriter();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("revision_document_sha256", E2EAttemptSnapshotSupport.sha256(revisionBytes));
        result.put("projection_sha256", ProjectionDigestV01.sha256(ProjectionDigestV01.apiProjectionDigestView(projection)));
        result.put("opl_sha256", writer.sha256(generated.artifact()));
        result.put("token_sha256", new TokenCanonicalWriter().sha256(revision.revisionId(), tokens));
        result.put("trace_sha256", writer.sha256Traces(revision.revisionId(), generated.traces()));
        return Map.copyOf(result);
    }

    private static Set<FileProfilePackageLoader.DirectPackageFile> profileFiles(JsonNode materialization, Path profileRoot) throws Exception {
        JsonNode refs = materialization.path("profile_asset_refs");
        if (!refs.isArray() || refs.size() != 5) throw environment("Profile asset refs 必须恰好五项。");
        Set<FileProfilePackageLoader.DirectPackageFile> result = new HashSet<>();
        List<String> paths = new ArrayList<>();
        for (JsonNode ref : refs) {
            String path = ref.path("path").asText();
            if (!path.startsWith("profile/assets/")) throw environment("Profile asset ref 不在 direct root。 ");
            String relative = path.substring("profile/assets/".length());
            Path file = E2EAttemptSnapshotSupport.resolveRelative(profileRoot, relative);
            E2EAttemptSnapshotSupport.verifyRawRef(ref, file, "E2E_ENVIRONMENT_MISMATCH");
            result.add(new FileProfilePackageLoader.DirectPackageFile(ref.path("kind").asText(), relative,
                    ref.path("byte_length").asLong(-1), ref.path("sha256").asText()));
            paths.add(relative);
        }
        List<String> sorted = paths.stream().sorted(Comparator.naturalOrder()).toList();
        if (!paths.equals(sorted) || result.size() != 5) throw environment("Profile asset refs 顺序或唯一性不合法。");
        return Set.copyOf(result);
    }

    private static byte[] readRevision(Path database, Arguments arguments) throws Exception {
        String sql = """
                SELECT d.document_json, d.document_digest
                FROM revision_document d
                JOIN model_catalog m ON m.model_id = d.model_id
                WHERE d.revision_id = ? AND d.model_id = ? AND m.project_id = ?
                """;
        return E2EAttemptSnapshotSupport.withImmutableConnection(database, connection -> {
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, arguments.revisionId());
                statement.setString(2, arguments.modelId());
                statement.setString(3, arguments.projectId());
                try (ResultSet rows = statement.executeQuery()) {
                    if (!rows.next()) throw input("指定 Revision 不存在。");
                    byte[] bytes = rows.getString(1).getBytes(StandardCharsets.UTF_8);
                    if (!E2EAttemptSnapshotSupport.sha256(bytes).equals(rows.getString(2)) || rows.next()) {
                        throw input("Revision document digest 或唯一性不合法。");
                    }
                    return bytes;
                }
            }
        });
    }

    private static Object projection(Path responsePath, Arguments arguments) throws Exception {
        JsonNode response = E2EAttemptSnapshotSupport.readObject(responsePath);
        JsonNode data = response.path("data");
        if (!arguments.revisionId().equals(response.path("meta").path("read_revision").asText())
                || !data.isObject() || !arguments.contextId().equals(data.path("context_id").asText())) {
            throw input("Projection raw response 未绑定请求 Revision/Context。");
        }
        return JSON.convertValue(data, new TypeReference<Map<String, Object>>() { });
    }

    private static E2EAttemptSnapshotSupport.SnapshotException input(String message) {
        return E2EAttemptSnapshotSupport.input(message);
    }

    private static E2EAttemptSnapshotSupport.SnapshotException environment(String message) {
        return E2EAttemptSnapshotSupport.environment(message);
    }

    record Arguments(Path storage, String projectId, String modelId, String contextId, String revisionId,
                     Path profileAssetRoot, Path fixtureMaterialization, Path projectionResponse) {
        static Arguments parse(String[] args) {
            if (args == null || args.length != OPTIONS.size() * 2) throw input("Snapshot CLI 参数数量不合法。");
            Map<String, String> values = new LinkedHashMap<>();
            for (int index = 0; index < args.length; index += 2) {
                if (!args[index].startsWith("--") || args[index].length() < 3 || args[index + 1].isBlank()) throw input("Snapshot CLI 参数形状不合法。");
                String key = args[index].substring(2);
                if (!OPTIONS.contains(key) || values.putIfAbsent(key, args[index + 1]) != null) throw input("Snapshot CLI 参数未知或重复。");
            }
            if (!OPTIONS.equals(values.keySet()) || !GUARD.equals(values.get("guard"))) throw input("Snapshot CLI guard或参数集合不合法。");
            return new Arguments(path(values, "storage"), required(values, "project-id"), required(values, "model-id"),
                    required(values, "context-id"), required(values, "revision-id"), path(values, "profile-asset-root"),
                    path(values, "fixture-materialization"), path(values, "projection-response"));
        }

        private static Path path(Map<String, String> values, String key) {
            try {
                Path path = Path.of(required(values, key));
                if (!path.isAbsolute() || !path.equals(path.normalize())) throw input("Snapshot CLI path必须是规范绝对路径。");
                return path;
            } catch (E2EAttemptSnapshotSupport.SnapshotException exception) { throw exception; }
            catch (Exception exception) { throw input("Snapshot CLI path不合法。"); }
        }

        private static String required(Map<String, String> values, String key) {
            String value = values.get(key);
            if (value == null || value.isBlank()) throw input("Snapshot CLI 参数缺失。");
            return value;
        }
    }

}
