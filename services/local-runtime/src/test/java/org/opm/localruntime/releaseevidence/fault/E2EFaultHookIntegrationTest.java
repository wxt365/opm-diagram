package org.opm.localruntime.releaseevidence.fault;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.api.ApiErrorCode;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.application.LocalApiService;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.ProfilePackageAssemblyException;
import org.opm.localruntime.assets.ProfilePackageDescriptor;
import org.opm.localruntime.command.CandidateRevisionCommand;
import org.opm.localruntime.command.CommitFailureCode;
import org.opm.localruntime.command.CommitPersistenceException;
import org.opm.localruntime.command.RevisionCommitRepository;
import org.opm.localruntime.storage.ProjectDatabaseFactory;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class E2EFaultHookIntegrationTest {

    @TempDir
    Path temporaryDirectory;

    @Test
    void assetHookReturns422AndDoesNotModifyTheExactSymbolAsset() throws Exception {
        Path symbolAsset = profileRoot().resolve("profile.iso19450.2024.draft/0.2.0/symbols/representative-symbol-catalog.json");
        String before = sha256(Files.readAllBytes(symbolAsset));
        ControlledPort port = new ControlledPort(Mode.ASSET_MISSING);
        Model model = createModel(port, "asset");

        ApiException exception = assertThrows(ApiException.class, () -> model.service().edit(model.projectId(), model.modelId(), model.contextId(),
                editRequest("asset", model.revisionId())));

        assertApiError(exception, ApiErrorCode.TEXT_GENERATION_BLOCKED, 422, false);
        assertEquals(1, port.assetCalls.get());
        assertEquals(0, port.insertCalls.get());
        assertEquals(before, sha256(Files.readAllBytes(symbolAsset)));
        assertEquals(model.revisionId(), currentRevision(model));
    }

    @Test
    void persistenceHookReturns500BeforeAnyRevisionIsCommitted() {
        ControlledPort port = new ControlledPort(Mode.PERSISTENCE_FAILED);
        Model model = createModel(port, "persistence");

        ApiException exception = assertThrows(ApiException.class, () -> model.service().edit(model.projectId(), model.modelId(), model.contextId(),
                editRequest("persistence", model.revisionId())));

        assertApiError(exception, ApiErrorCode.PERSISTENCE_FAILED, 500, true);
        assertEquals(1, port.assetCalls.get());
        assertEquals(1, port.insertCalls.get());
        assertEquals(model.revisionId(), currentRevision(model));
    }

    @Test
    void readOnlyProjectionReturns409WithoutLoadingAssetsOrWriting() {
        ControlledPort port = new ControlledPort(Mode.READ_ONLY);
        Model model = createModel(port, "readonly");

        ApiException exception = assertThrows(ApiException.class, () -> model.service().edit(model.projectId(), model.modelId(), model.contextId(),
                editRequest("readonly", model.revisionId())));

        assertApiError(exception, ApiErrorCode.READ_ONLY_REVISION, 409, false);
        assertEquals(0, port.assetCalls.get());
        assertEquals(0, port.insertCalls.get());
        assertEquals(model.revisionId(), currentRevision(model));
    }

    private Model createModel(ControlledPort port, String suffix) {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory.resolve(suffix)),
                new FileProfilePackageLoader(profileRoot()), port);
        String projectId = string(data(service.createProject(projectRequest(suffix)) ).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest(suffix)));
        String modelId = string(model.get("model_id"));
        String revisionId = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace." + suffix, projectId, modelId)).get("root_context_id"));
        return new Model(service, projectId, modelId, contextId, revisionId);
    }

    private String currentRevision(Model model) {
        return string(((Map<?, ?>) model.service().workspace("request.workspace.verify", model.projectId(), model.modelId()).get("meta")).get("read_revision"));
    }

    private Map<String, Object> projectRequest(String suffix) {
        return map("request_id", "request.project." + suffix, "command_id", "command.project." + suffix, "name", "Fault test " + suffix);
    }

    private Map<String, Object> modelRequest(String suffix) {
        return map("request_id", "request.model." + suffix, "command_id", "command.model." + suffix, "name", "Processing " + suffix,
                "binding", binding());
    }

    private Map<String, Object> editRequest(String suffix, String revisionId) {
        return map("request_id", "request.edit." + suffix, "command_id", "command.edit." + suffix, "base_revision", revisionId,
                "binding", binding(), "command_type", "CREATE_ELEMENT",
                "payload", map("kind", "OBJECT", "element_id", "element.material." + suffix, "name", "Material", "layout", map("x", 80, "y", 120)));
    }

    private Map<String, Object> binding() {
        return map("profile_id", "profile.iso19450.2024.draft", "profile_version", "0.2.0",
                "rule_set_id", "rules.iso19450.2024.draft", "rule_version", "0.1.0");
    }

    private void assertApiError(ApiException exception, ApiErrorCode code, int status, boolean retryable) {
        assertEquals(code, exception.code());
        assertEquals(status, exception.status());
        assertEquals(retryable, exception.retryable());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> data(Map<String, Object> response) {
        return (Map<String, Object>) response.get("data");
    }

    private String string(Object value) {
        return (String) value;
    }

    private Map<String, Object> map(Object... values) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int index = 0; index < values.length; index += 2) result.put((String) values[index], values[index + 1]);
        return result;
    }

    private Path profileRoot() {
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            Path candidate = current.resolve("packages/profiles");
            if (Files.isDirectory(candidate)) return candidate;
            current = current.getParent();
        }
        throw new IllegalStateException("Profile package is not available");
    }

    private String sha256(byte[] bytes) throws Exception {
        return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private enum Mode { ASSET_MISSING, PERSISTENCE_FAILED, READ_ONLY }

    private final class ControlledPort implements E2EFaultPort {
        private final Mode mode;
        private final AtomicInteger assetCalls = new AtomicInteger();
        private final AtomicInteger insertCalls = new AtomicInteger();

        private ControlledPort(Mode mode) { this.mode = mode; }

        @Override
        public E2EFaultContext contextFor(CandidateRevisionCommand command) {
            return new E2EFaultContext.Active("E2E-CANVAS-007." + mode, 1, command.projectId(), command.modelId(), command.baseRevisionId(),
                    command.candidateRevision().revisionId(), command.commandId(), "profile.iso19450.2024.draft", "0.2.0", "a".repeat(64));
        }

        @Override
        public void beforeSymbolAssetLoad(E2EFaultContext context, ProfilePackageDescriptor.RequiredAsset asset) {
            assetCalls.incrementAndGet();
            assertEquals("SYMBOL_ASSET", asset.role());
            if (mode == Mode.ASSET_MISSING) {
                throw new ProfilePackageAssemblyException(ProfilePackageAssemblyException.Code.PROFILE_ASSET_MISSING, "controlled asset failure");
            }
        }

        @Override
        public void beforeRevisionInsert(E2EFaultContext context) {
            insertCalls.incrementAndGet();
            if (mode == Mode.PERSISTENCE_FAILED) {
                throw new CommitPersistenceException(CommitFailureCode.PERSISTENCE_FAILED, "controlled persistence failure", null);
            }
        }

        @Override
        public RevisionCommitRepository.Head projectCurrentHead(E2EFaultContext context, RevisionCommitRepository.Head head) {
            return mode == Mode.READ_ONLY ? new RevisionCommitRepository.Head(head.revisionId(), head.revisionSequence(), false) : head;
        }
    }

    private record Model(LocalApiService service, String projectId, String modelId, String contextId, String revisionId) { }
}
