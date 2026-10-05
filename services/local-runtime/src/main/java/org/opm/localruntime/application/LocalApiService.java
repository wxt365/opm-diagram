package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.api.ApiErrorCode;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.api.generated.ApiEdtContract;
import org.opm.localruntime.command.CandidateRevisionCommand;
import org.opm.localruntime.command.CandidateRevisionCommitter;
import org.opm.localruntime.command.CommitFailureCode;
import org.opm.localruntime.command.CommitResult;
import org.opm.localruntime.command.ProfileRuleBinding;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionJsonWriter;
import org.opm.localruntime.semantic.SemanticRevisionReader;
import org.opm.localruntime.semantic.SemanticRevisionValidator;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.opm.localruntime.storage.SqliteRevisionCommitRepository;
import org.opm.localruntime.releaseevidence.fault.E2EFaultPort;
import org.opm.localruntime.releaseauthoring.visualcommon.VisualCommonCommitFaultPort;
import org.opm.localruntime.releaseauthoring.visualcommon.OneShotVisualCommonCommitFaultPort;
import org.opm.localruntime.text.OplGenerationResult;
import org.opm.localruntime.text.OplGrammar;
import org.opm.localruntime.text.OplTextGenerationService;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.opm.localruntime.application.RuntimeActiveBindingProvider.*;
import static org.opm.localruntime.application.SemanticViewSupport.*;
import static org.opm.localruntime.application.CommandCapabilityOptions.*;
import static org.opm.localruntime.application.SemanticEditValues.*;
import static org.opm.localruntime.application.ConstructDeletionPolicy.*;

import static org.opm.localruntime.application.LocalApiResponses.*;

@Service
public class LocalApiService {

    private static final String VISUAL_COMMON_PROJECT_ID = "project.visual.blocked-feedback";
    private static final String VISUAL_COMMON_MODEL_ID = "model.visual.blocked-feedback";
    private static final String VISUAL_COMMON_CONTEXT_ID = "context.visual.blocked-feedback.sd";
    private static final String VISUAL_COMMON_REVISION_ID = "revision.visual.blocked-feedback";

    private final SemanticCommandEditor semanticEditor = new SemanticCommandEditor();
    private final OpdProjectionQuery projectionQuery = new OpdProjectionQuery();
    private final RelationCatalogQuery relationCatalogQuery = new RelationCatalogQuery();
    private final ProjectDatabaseFactory databaseFactory;
    private final org.opm.localruntime.storage.LocalApiRepository repository;
    private final LocalCatalogService catalogService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final SemanticRevisionReader revisionReader = new SemanticRevisionReader();
    private final SemanticRevisionJsonWriter revisionWriter = new SemanticRevisionJsonWriter();
    private final OplTextGenerationService textGenerationService = new OplTextGenerationService();
    private final SemanticRevisionValidator semanticValidator = new SemanticRevisionValidator();
    private final ProfilePackageAssembler profilePackageAssembler;
    private final E2EFaultPort e2eFaultPort;
    private final VisualCommonCommitFaultPort visualCommonCommitFaultPort;

    public LocalApiService(ProjectDatabaseFactory databaseFactory) {
        this(databaseFactory, new FileProfilePackageLoader(Path.of("packages/profiles")), E2EFaultPort.NOOP, VisualCommonCommitFaultPort.NOOP);
    }

    public LocalApiService(ProjectDatabaseFactory databaseFactory, FileProfilePackageLoader profilePackageLoader) {
        this(databaseFactory, profilePackageLoader, E2EFaultPort.NOOP, VisualCommonCommitFaultPort.NOOP);
    }

    public LocalApiService(ProjectDatabaseFactory databaseFactory, FileProfilePackageLoader profilePackageLoader, E2EFaultPort e2eFaultPort) {
        this(databaseFactory, profilePackageLoader, e2eFaultPort, VisualCommonCommitFaultPort.NOOP);
    }

    @Autowired
    public LocalApiService(ProjectDatabaseFactory databaseFactory, FileProfilePackageLoader profilePackageLoader, E2EFaultPort e2eFaultPort,
                           VisualCommonCommitFaultPort visualCommonCommitFaultPort) {
        this.databaseFactory = databaseFactory;
        this.e2eFaultPort = e2eFaultPort;
        this.visualCommonCommitFaultPort = visualCommonCommitFaultPort;
        this.profilePackageAssembler = new ProfilePackageAssembler(profilePackageLoader, e2eFaultPort);
        this.repository = new org.opm.localruntime.storage.LocalApiRepository(databaseFactory);
        this.catalogService = new LocalCatalogService(databaseFactory, repository, profilePackageAssembler);
    }

    public Map<String, String> activeProfileRuleBinding() {
        SemanticRevision.ProfileBinding binding = profileBinding();
        return Map.of(
                "profile_id", binding.profile().id(),
                "profile_version", binding.profile().version(),
                "rule_set_id", binding.ruleSet().id(),
                "rule_version", binding.ruleSet().version());
    }

    public Map<String, Object> listProjects(String requestId, String query) { return catalogService.listProjects(requestId, query); }
    public Map<String, Object> getProject(String requestId, String projectId) { return catalogService.getProject(requestId, projectId); }
    public synchronized Map<String, Object> createProject(Map<String, Object> request) { return catalogService.createProject(request); }
    public Map<String, Object> listModels(String requestId, String projectId) { return catalogService.listModels(requestId, projectId); }
    public Map<String, Object> listModels(String requestId, String projectId, String archiveState) { return catalogService.listModels(requestId, projectId, archiveState); }
    public synchronized Map<String, Object> createModel(String projectId, Map<String, Object> request) { return catalogService.createModel(projectId, request); }
    synchronized Map<String, Object> createTransferredModel(String projectId, Map<String, Object> request, com.fasterxml.jackson.databind.node.ObjectNode document) {
        return catalogService.createTransferredModel(projectId, request, document);
    }

    public Map<String, Object> workspace(String requestId, String projectId, String modelId) {
        return workspace(requestId, projectId, modelId, null, null);
    }

    public Map<String, Object> workspace(String requestId, String projectId, String modelId, String requestedRevision, String requestedContext) {
        boolean exact = requestedRevision != null && !"head".equals(requestedRevision);
        if (exact && (requestedRevision.length() < 3 || requestedRevision.length() > 160
                || !requestedRevision.matches("[A-Za-z][A-Za-z0-9._:-]*"))) {
            throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "Revision 格式非法");
        }
        try (Connection connection = repository.projectConnection(projectId);
             PreparedStatement statement = connection.prepareStatement("""
                     SELECT m.name, h.draft_head_revision_id,
                            (SELECT b.revision_id FROM baseline b WHERE b.model_id = m.model_id ORDER BY b.created_at DESC, b.baseline_id DESC LIMIT 1)
                     FROM model_catalog m LEFT JOIN model_head h ON h.model_id = m.model_id
                     WHERE m.model_id = ? AND m.project_id = ? AND m.status = 'ACTIVE'
                     """)) {
            statement.setString(1, modelId); statement.setString(2, projectId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) throw notFound("模型不存在");
                String head = result.getString(2);
                String target = exact ? requestedRevision : head != null ? head : result.getString(3);
                if (target == null) throw notFound("没有可打开版本：当前模型没有活动草稿或 Baseline");
                SemanticRevision revision = revision(projectId, modelId, target);
                String contextId = revision.contexts().stream().anyMatch(value -> value.id().equals(requestedContext))
                        ? requestedContext : revision.rootContextId();
                Map<String, Object> model = new LinkedHashMap<>();
                model.put("model_id", modelId); model.put("project_id", projectId); model.put("name", result.getString(1));
                model.put("head_revision", head);
                model.put("profile_id", revision.profileBinding().profile().id());
                model.put("profile_version", revision.profileBinding().profile().version());
                model.put("rule_version", revision.profileBinding().ruleSet().version());
                model.put("access_mode", !exact && head != null ? "EDITABLE_DRAFT" : isBaselineRevision(projectId, modelId, target) ? "READONLY_BASELINE" : "READONLY_SNAPSHOT");
                Map<String, Object> payload = Map.of("model", model, "root_context_id", revision.rootContextId(),
                        "current_context_id", contextId, "viewport_state", Map.of(), "panel_state", Map.of());
                return queryResult(requestId, target, revision.profileBinding().profile().version(),
                        revision.profileBinding().ruleSet().version(), target.equals(head) ? "current" : "historical", payload, false);
            }
        } catch (SQLException exception) { throw persistence(exception); }
    }

    public Map<String, Object> navigation(String requestId, String projectId, String modelId, String contextId, String revisionId) {
        SemanticRevision revision = revision(projectId, modelId, revisionId);
        context(revision, contextId);
        @SuppressWarnings("unchecked")
        Map<String, Object> data = objectMapper.convertValue(DraftWorkspaceQueries.navigation(revision, contextId), Map.class);
        return queryResult(requestId, revisionId, revision.profileBinding().profile().version(), revision.profileBinding().ruleSet().version(), freshness(projectId, modelId, revisionId), data, false);
    }

    public Map<String, Object> projection(String requestId, String projectId, String modelId, String contextId, String revisionId) {
        SemanticRevision revision = revision(projectId, modelId, revisionId);
        return queryResult(requestId, revisionId, revision.profileBinding().profile().version(), revision.profileBinding().ruleSet().version(),
                freshness(projectId, modelId, revisionId), projectionData(revision, contextId), false);
    }

    // 给定语义视图的纯查询；草稿调用不读取历史 HEAD 或索引。
    Map<String, Object> projectionData(SemanticRevision revision, String contextId) {
        return projectionQuery.projectionData(revision, contextId);
    }

    public Map<String, Object> capabilities(String requestId, String projectId, String modelId, String revisionId) {
        return capabilities(requestId, projectId, modelId, revisionId, null, null, List.of());
    }

    public Map<String, Object> capabilities(String requestId, String projectId, String modelId, String revisionId, String selectionId, String intent) {
        return capabilities(requestId, projectId, modelId, revisionId, selectionId, intent, List.of());
    }

    public Map<String, Object> capabilities(String requestId, String projectId, String modelId, String revisionId, String selectionId, String intent, List<String> endpointIds) {
        SemanticRevision revision = revision(projectId, modelId, revisionId);
        List<String> requestedEndpoints = List.copyOf(endpointIds == null ? List.of() : endpointIds);
        boolean stateIntent = intent == null || "CREATE_STATE".equals(intent);
        boolean featureIntent = "CREATE_FEATURE".equals(intent);
        boolean deleteIntent = "DELETE_CONSTRUCT".equals(intent);
        boolean factIntent = "CREATE_FACT".equals(intent);
        boolean factUpdateIntent = "UPDATE_FACT".equals(intent);
        boolean propertyUpdateIntent = "UPDATE_PROPERTY".equals(intent);
        SemanticRevision.Occurrence selectedOccurrence = selectionId == null ? null : revision.occurrences().stream().filter(occurrence -> occurrence.id().equals(selectionId)).findFirst().orElse(null);
        String selectedTargetId = selectedOccurrence == null ? selectionId : selectedOccurrence.targetId();
        SemanticRevision.Element owner = selectedTargetId == null ? null : revision.elements().stream().filter(element -> element.id().equals(selectedTargetId)).findFirst().orElse(null);
        SemanticRevision.Feature featureOwner = selectedTargetId == null ? null : revision.features().stream().filter(feature -> feature.id().equals(selectedTargetId)).findFirst().orElse(null);
        SemanticRevision.State selectedState = selectedTargetId == null ? null : revision.states().stream().filter(state -> state.id().equals(selectedTargetId)).findFirst().orElse(null);
        SemanticRevision.Fact selectedFact = selectedTargetId == null ? null : revision.facts().stream().filter(fact -> fact.id().equals(selectedTargetId)).findFirst().orElse(null);
        List<String> endpoints = factUpdateIntent && requestedEndpoints.isEmpty() && selectedFact != null
                ? selectedFact.endpoints().stream().map(SemanticRevision.Endpoint::targetId).toList() : requestedEndpoints;
        String queryId = capabilityQueryId(projectId, modelId, revisionId, selectionId, intent, endpoints);
        boolean objectOwner = owner != null && owner.coreKind() == SemanticRevision.CoreKind.OBJECT;
        boolean propertyTarget = (owner != null && (owner.coreKind() == SemanticRevision.CoreKind.OBJECT || owner.coreKind() == SemanticRevision.CoreKind.PROCESS))
                || featureOwner != null;
        String propertyReason = !propertyTarget ? "ENDPOINT_KIND_MISMATCH"
                : !"current".equals(freshness(projectId, modelId, revisionId))
                ? (isBaselineRevision(projectId, modelId, revisionId) ? "READ_ONLY_REVISION" : "REVISION_STALE") : null;
        List<ApiEdtContract.CommandCapabilityOption> options = featureIntent ? featureCreateOptions(queryId, revisionId, owner)
                : stateIntent ? List.of(stateCreateOption(queryId, revisionId, owner, featureOwner, objectOwner))
                : deleteIntent ? deleteOptions(queryId, revision, selectedOccurrence)
                : factIntent ? factOptions(queryId, revision, endpoints)
                : factUpdateIntent ? proceduralFactUpdateOptions(queryId, revision, selectedFact, endpoints)
                : propertyUpdateIntent && propertyTarget ? List.of(owner != null
                ? propertyUpdateOption(queryId, revisionId, owner, propertyReason)
                : propertyUpdateOption(queryId, revisionId, featureOwner, propertyReason)) : List.of();
        List<ApiEdtContract.CommandType> allowed = new ArrayList<>(List.of(ApiEdtContract.CommandType.CREATE_ELEMENT, ApiEdtContract.CommandType.CREATE_FACT, ApiEdtContract.CommandType.UPDATE_LAYOUT));
        if (owner != null) allowed.add(ApiEdtContract.CommandType.CREATE_FEATURE);
        if (objectOwner) allowed.add(ApiEdtContract.CommandType.CREATE_STATE);
        if (selectedFact != null) allowed.add(ApiEdtContract.CommandType.UPDATE_FACT);
        if (propertyTarget && propertyReason == null) allowed.add(ApiEdtContract.CommandType.UPDATE_PROPERTY);
        if (selectedOccurrence != null) allowed.add(ApiEdtContract.CommandType.DELETE_CONSTRUCT);
        List<ApiEdtContract.ForbiddenCommand> forbidden = new ArrayList<>();
        forbidden.add(new ApiEdtContract.ForbiddenCommand(ApiEdtContract.CommandType.CREATE_CONTEXT, "PROFILE_CAPABILITY_DISABLED"));
        if (!allowed.contains(ApiEdtContract.CommandType.UPDATE_PROPERTY)) {
            forbidden.add(new ApiEdtContract.ForbiddenCommand(ApiEdtContract.CommandType.UPDATE_PROPERTY, propertyReason));
        }
        ApiEdtContract.CommandCapabilitiesData data = new ApiEdtContract.CommandCapabilitiesData(
                allowed,
                forbidden,
                queryId,
                options);
        return queryResult(requestId, revisionId, revision.profileBinding().profile().version(), revision.profileBinding().ruleSet().version(), freshness(projectId, modelId, revisionId), data.toWire(), false);
    }

    public Map<String, Object> relationCatalog(String requestId, String projectId, String modelId, String contextId, String revisionId) {
        return relationCatalog(requestId, projectId, modelId, contextId, revisionId, null);
    }

    public Map<String, Object> relationCatalog(String requestId, String projectId, String modelId, String contextId, String revisionId, String selectionId) {
        SemanticRevision revision = revision(projectId, modelId, revisionId);
        context(revision, contextId);
        String revisionReason = "current".equals(freshness(projectId, modelId, revisionId)) ? null
                : isBaselineRevision(projectId, modelId, revisionId) ? "READ_ONLY_REVISION" : "REVISION_STALE";
        return queryResult(requestId, revisionId, revision.profileBinding().profile().version(), revision.profileBinding().ruleSet().version(),
                freshness(projectId, modelId, revisionId), relationCatalogData(revision, contextId, selectionId, revisionReason), false);
    }

    /** 只构建目录；调用方分别负责 Revision 或 DraftToken 授权。 */

    Map<String, Object> relationCatalogData(SemanticRevision revision, String contextId, String selectionId, String revisionReason) {
        return relationCatalogQuery.relationCatalogData(revision, contextId, selectionId, revisionReason);
    }

    public Map<String, Object> releaseVisualCommonFaultCommand(String requestId, String projectId, String modelId, String contextId, String revisionId) {
        if (!(visualCommonCommitFaultPort instanceof OneShotVisualCommonCommitFaultPort)
                || !VISUAL_COMMON_PROJECT_ID.equals(projectId) || !VISUAL_COMMON_MODEL_ID.equals(modelId)
                || !VISUAL_COMMON_CONTEXT_ID.equals(contextId) || !VISUAL_COMMON_REVISION_ID.equals(revisionId)) {
            throw notFound("受控 Visual Common 命令不存在");
        }
        SemanticRevision revision = revision(projectId, modelId, revisionId);
        context(revision, contextId);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("kind", "CONSUMPTION");
        payload.put("fact_id", "fact.visual.blocked-feedback.one-shot");
        payload.put("object_id", "element.visual.blocked-feedback.input");
        payload.put("process_id", "element.visual.blocked-feedback.process");
        payload.put("layout", Map.of("x", 340, "y", 266));
        Map<String, Object> command = new LinkedHashMap<>();
        command.put("command_id", "command.visual.blocked-feedback.persistence-failed");
        command.put("command_type", "CREATE_FACT");
        command.put("payload", payload);
        return queryResult(requestId, revisionId, revision.profileBinding().profile().version(), revision.profileBinding().ruleSet().version(),
                freshness(projectId, modelId, revisionId), command, false);
    }

    public synchronized Map<String, Object> edit(String projectId, String modelId, String contextId, Map<String, Object> request) {
        String requestId = required(request, "request_id");
        String commandId = required(request, "command_id");
        String baseRevisionId = required(request, "base_revision");
        ModelRevision current = currentModel(projectId, modelId);
        if (!current.revision().rootContextId().equals(contextId)) throw domain("P0 仅支持根系统图");
        String requestDigest = requestDigest(request);
        try (Connection connection = repository.projectConnection(projectId)) {
            Map<String, Object> replay = repository.replay(connection, "API-EDT-002", modelId, commandId, requestDigest);
            if (replay != null) {
                String committedRevisionId = required(replay, "committed_revision");
                return commandResult(requestId, commandId, "COMMITTED", committedRevisionId, "saved",
                        editResultData(revision(projectId, modelId, committedRevisionId), List.of()));
            }
        } catch (SQLException exception) { throw persistence(exception); }
        validateBinding(requiredMap(request, "binding"));
        if (!baseRevisionId.equals(current.revision().revisionId())) {
            if (isBaselineRevision(projectId, modelId, baseRevisionId)) {
                throw new ApiException(ApiErrorCode.READ_ONLY_REVISION, 409, false, "基础修订为只读 Baseline");
            }
            throw new ApiException(ApiErrorCode.REVISION_CONFLICT, 409, false, "基础修订不是当前草稿");
        }
        SemanticRevision candidate = applyP0Command(projectId, modelId, current.revision(), required(request, "command_type"), requiredMap(request, "payload"));
        CandidateRevisionCommand command = new CandidateRevisionCommand(projectId, modelId, commandId, baseRevisionId, current.revision(), candidate,
                binding(current.revision()), grammar(current.revision()), requestDigest, "P0_EDIT", Instant.now());
        CommitResult result = new CandidateRevisionCommitter(new SqliteRevisionCommitRepository(databaseFactory.databasePath(projectId), e2eFaultPort, visualCommonCommitFaultPort), profilePackageAssembler, e2eFaultPort).commit(command);
        if (result instanceof CommitResult.Rejected rejected) throw rejected(rejected.code());
        String committed = result instanceof CommitResult.Committed value ? value.committedRevisionId() : ((CommitResult.Replayed) result).committedRevisionId();
        List<String> traces = result instanceof CommitResult.Committed value ? value.traceIds() : List.of();
        return commandResult(requestId, commandId, "COMMITTED", committed, "saved", editResultData(candidate, traces));
    }

    public Map<String, Object> text(String requestId, String projectId, String modelId, String contextId, String revisionId) {
        SemanticRevision revision = revision(projectId, modelId, revisionId);
        context(revision, contextId);
        OplGenerationResult generated = textGenerationService.generate(revision, contextId, profilePackageAssembler.assemble(revision.profileBinding()));
        List<Map<String, Object>> sentences = generated.artifact().paragraphs().getFirst().sentences().stream()
                .map(sentence -> Map.<String, Object>of("sentence_id", sentence.sentenceId(), "text", sentence.text(), "ordinal", sentence.ordinal())).toList();
        List<Map<String, Object>> traces = generated.traces().stream().map(trace -> Map.<String, Object>of("sentence_id", trace.sentenceIds().getFirst(), "fact_ids", trace.factIds(), "occurrence_ids", trace.occurrenceIds())).toList();
        return queryResult(requestId, revisionId, revision.profileBinding().profile().version(), revision.profileBinding().ruleSet().version(), freshness(projectId, modelId, revisionId),
                Map.of("artifact_id", generated.artifact().artifactId(), "modality", "OPL", "sentences", sentences, "traces", traces), false);
    }

    public Map<String, Object> findings(String requestId, String projectId, String modelId, String contextId, String revisionId) {
        SemanticRevision revision = revision(projectId, modelId, revisionId);
        context(revision, contextId);
        List<Map<String, Object>> findings = new ArrayList<>();
        try (Connection connection = repository.projectConnection(projectId);
             PreparedStatement statement = connection.prepareStatement("""
                     SELECT finding_id, rule_id, severity, category, context_id, entity_id
                     FROM finding_index
                     WHERE source_revision_id = ? AND model_id = ? AND context_id = ?
                     ORDER BY finding_id
                     """)) {
            statement.setString(1, revisionId);
            statement.setString(2, modelId);
            statement.setString(3, contextId);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    findings.add(Map.of("finding_id", result.getString("finding_id"), "rule_id", result.getString("rule_id"),
                            "severity", result.getString("severity"), "category", result.getString("category"),
                            "context_id", result.getString("context_id"), "entity_id", result.getString("entity_id")));
                }
            }
        } catch (SQLException exception) {
            throw persistence(exception);
        }
        return queryResult(requestId, revisionId, revision.profileBinding().profile().version(), revision.profileBinding().ruleSet().version(),
                freshness(projectId, modelId, revisionId), findings, true);
    }

    public Map<String, Object> operationRecords(String requestId, String projectId, String modelId, String contextId, String revisionId) {
        SemanticRevision revision = revision(projectId, modelId, revisionId);
        context(revision, contextId);
        List<Map<String, Object>> records = new ArrayList<>();
        try (Connection connection = repository.projectConnection(projectId);
             PreparedStatement statement = connection.prepareStatement("""
                     SELECT operation_record_id, project_id, model_id, operation_id, aggregate_id, command_id,
                            input_revision_id, result_revision_id, result_status, diagnostic_id, occurred_at
                     FROM operation_record
                     WHERE project_id = ? AND model_id = ? AND input_revision_id = ?
                     ORDER BY occurred_at, operation_record_id
                     """)) {
            statement.setString(1, projectId);
            statement.setString(2, modelId);
            statement.setString(3, revisionId);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    Map<String, Object> record = new LinkedHashMap<>();
                    record.put("operation_record_id", result.getString("operation_record_id"));
                    record.put("project_id", result.getString("project_id"));
                    record.put("model_id", result.getString("model_id"));
                    record.put("operation_id", result.getString("operation_id"));
                    record.put("aggregate_id", result.getString("aggregate_id"));
                    record.put("command_id", result.getString("command_id"));
                    record.put("input_revision_id", result.getString("input_revision_id"));
                    record.put("result_revision_id", result.getString("result_revision_id"));
                    record.put("result_status", result.getString("result_status"));
                    record.put("diagnostic_id", result.getString("diagnostic_id"));
                    record.put("occurred_at", result.getString("occurred_at"));
                    records.add(record);
                }
            }
        } catch (SQLException exception) {
            throw persistence(exception);
        }
        return queryResult(requestId, revisionId, revision.profileBinding().profile().version(), revision.profileBinding().ruleSet().version(),
                freshness(projectId, modelId, revisionId), records, true);
    }

    public synchronized Map<String, Object> validate(String projectId, String modelId, Map<String, Object> request) {
        String requestId = required(request, "request_id");
        String commandId = required(request, "command_id");
        String revisionId = required(request, "input_revision");
        SemanticRevision revision = revision(projectId, modelId, revisionId);
        validateBinding(requiredMap(request, "binding"));
        var identity = new LinkedHashMap<>(request);
        identity.remove("request_id");
        String requestDigest = requestDigest(identity);
        try (Connection connection = repository.projectConnection(projectId)) {
            Map<String, Object> replay = repository.replay(connection, "API-VAL-001", modelId, commandId, requestDigest, requestDigest(request));
            if (replay != null) return commandResult(requestId, commandId, "ACCEPTED", null, "not-applicable", replay);
        } catch (SQLException exception) { throw persistence(exception); }
        String taskId = newId("task.validate");
        String now = Instant.now().toString();
        var inputIdentity = objectMapper.createObjectNode().put("input_revision", revisionId);
        var checked = DraftModelValidation.findings(projectId, modelId, inputIdentity, revision, profilePackageAssembler.assemble(revision.profileBinding()));
        String evidence = "evidence." + digest(taskId + revisionId).substring(0, 32);
        Map<String, Object> result = objectMapper.convertValue(checked.get("validation_summary"), new com.fasterxml.jackson.core.type.TypeReference<LinkedHashMap<String, Object>>() { });
        result.put("evidence_summary_token", evidence);
        result.put("findings", checked.get("items"));
        var storedRequest = new LinkedHashMap<>(request);
        storedRequest.put("project_id", projectId); storedRequest.put("model_id", modelId);
        try (Connection connection = repository.projectConnection(projectId)) {
            connection.setAutoCommit(false);
            try {
                String reference = validationRevisionReference(connection, projectId, modelId, revisionId);
                try (PreparedStatement statement = connection.prepareStatement("""
                     INSERT INTO background_task(task_id, task_type, state, stage, progress, input_revision_id, profile_id, profile_version, rule_set_id, rule_set_version, cancellable, request_json, result_json, created_at, started_at, finished_at, updated_at)
                     VALUES (?, 'VALIDATE_MODEL', 'COMPLETED', 'COMPLETE', 100, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
                     """)) {
                    statement.setString(1, taskId); statement.setString(2, reference); statement.setString(3, PROFILE_ID); statement.setString(4, PROFILE_VERSION); statement.setString(5, RULE_ID); statement.setString(6, RULE_VERSION);
                    statement.setString(7, objectMapper.writeValueAsString(storedRequest)); statement.setString(8, objectMapper.writeValueAsString(result));
                    statement.setString(9, now); statement.setString(10, now); statement.setString(11, now); statement.setString(12, now); statement.executeUpdate();
                }
                Map<String, Object> descriptor = taskDescriptor(taskId, revisionId, "COMPLETED", "COMPLETE", 100, false, result, now, now, now);
                repository.writeIdempotency(connection, "API-VAL-001", modelId, commandId, requestDigest, null, descriptor, now);
                repository.writeOperation(connection, projectId, modelId, "API-VAL-001", modelId, commandId, reference, null, "ACCEPTED", now);
                connection.commit();
                return commandResult(requestId, commandId, "ACCEPTED", null, "not-applicable", descriptor);
            } catch (Exception exception) {
                connection.rollback();
                throw persistence(exception);
            }
        } catch (SQLException exception) { throw persistence(exception); }
    }

    public Map<String, Object> revisions(String requestId, String projectId, String modelId) {
        requireActiveModel(projectId, modelId);
        try (Connection connection = repository.projectConnection(projectId);
             PreparedStatement statement = connection.prepareStatement("""
                     SELECT d.revision_id, d.revision_sequence, d.created_at, d.revision_id = h.draft_head_revision_id AS is_head,
                            (SELECT COUNT(*) FROM baseline b WHERE b.revision_id = d.revision_id) AS baseline_count
                     FROM revision_document d LEFT JOIN model_head h ON h.model_id = d.model_id WHERE d.model_id = ? ORDER BY d.revision_sequence DESC
                     """)) {
            statement.setString(1, modelId);
            List<Map<String, Object>> values = new ArrayList<>();
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) values.add(Map.of("revision_id", result.getString(1), "sequence", result.getInt(2),
                        "kind", result.getInt(5) > 0 ? "BASELINE" : "DRAFT", "created_at", result.getString(3), "immutable", true, "blocking_count", 0));
            }
            for (var saved : org.opm.localruntime.storage.DraftHistoryRepository.list(connection, projectId, modelId))
                values.add(Map.of("revision_id", saved.revisionId(), "sequence", saved.sequence(), "kind", "DRAFT",
                        "created_at", saved.createdAt(), "immutable", true, "blocking_count", 0));
            values.sort(java.util.Comparator.comparingInt(value -> -((Number) value.get("sequence")).intValue()));
            return queryResult(requestId, null, null, null, "not-applicable", values, true);
        } catch (org.opm.localruntime.storage.DraftJournalRepository.Failure exception) {
            throw new ApiException(ApiErrorCode.PERSISTENCE_FAILED, 503, false, "保存历史完整性校验失败");
        } catch (SQLException exception) { throw persistence(exception); }
    }

    public synchronized Map<String, Object> baseline(String projectId, String modelId, Map<String, Object> request) {
        String requestId = required(request, "request_id"); String commandId = required(request, "command_id"); String revisionId = required(request, "base_revision");
        validateBinding(requiredMap(request, "binding")); revision(projectId, modelId, revisionId);
        String token = required(request, "evidence_summary_token");
        try (Connection connection = repository.projectConnection(projectId)) {
            Map<String, Object> replay = repository.replay(connection, "API-VER-004", modelId, commandId, requestDigest(request));
            if (replay != null) return commandResult(requestId, commandId, "COMMITTED", string(replay.get("revision_id")), "not-applicable", replay);
            if (!hasEvidence(connection, revisionId, token)) throw new ApiException(ApiErrorCode.VALIDATION_BLOCKED, 422, false, "基线需要当前且无阻断的校验证据");
            String baselineId = newId("baseline"); String now = Instant.now().toString();
            connection.setAutoCommit(false);
            try {
                try (PreparedStatement statement = connection.prepareStatement("""
                        INSERT INTO baseline(baseline_id, model_id, revision_id, name, normalized_name, description, validation_report_digest, evidence_summary_json, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """)) {
                    statement.setString(1, baselineId); statement.setString(2, modelId); statement.setString(3, revisionId); statement.setString(4, required(request, "name"));
                    statement.setString(5, normalized(required(request, "name"))); statement.setString(6, optional(request, "description")); statement.setString(7, digest(token));
                    statement.setString(8, objectMapper.writeValueAsString(Map.of("evidence_summary_token", token))); statement.setString(9, now); statement.executeUpdate();
                }
                repository.writeOperation(connection, projectId, modelId, "API-VER-004", modelId, commandId, revisionId, revisionId, "COMMITTED", now);
                Map<String, Object> data = Map.of("baseline_id", baselineId, "revision_id", revisionId, "immutable", true);
                repository.writeIdempotency(connection, "API-VER-004", modelId, commandId, requestDigest(request), revisionId, data, now);
                connection.commit();
                return commandResult(requestId, commandId, "COMMITTED", revisionId, "not-applicable", data);
            } catch (Exception exception) { connection.rollback(); throw persistence(exception); }
        } catch (SQLException exception) { throw persistence(exception); }
    }

    public Map<String, Object> task(String requestId, String taskId) {
        for (Path database : repository.projectDatabases()) {
            try (Connection connection = repository.connection(database);
                 PreparedStatement statement = connection.prepareStatement("SELECT task_id, state, stage, progress, input_revision_id, cancellable, result_json, created_at, started_at, finished_at, request_json FROM background_task WHERE task_id = ?")) {
                statement.setString(1, taskId);
                try (ResultSet result = statement.executeQuery()) {
                    if (result.next()) {
                        String input = result.getString(5);
                        if (input == null) input = required(map(result.getString(11)), "input_revision");
                        Map<String, Object> descriptor = taskDescriptor(result.getString(1), input, result.getString(2), result.getString(3), result.getObject(4, Integer.class), result.getInt(6) == 1,
                                map(result.getString(7)), result.getString(8), result.getString(9), result.getString(10));
                        return queryResult(requestId, input, PROFILE_VERSION, RULE_VERSION, "historical", descriptor, false);
                    }
                }
            } catch (SQLException exception) { throw persistence(exception); }
        }
        throw notFound("任务不存在");
    }

    private SemanticRevision applyP0Command(String projectId, String modelId, SemanticRevision base, String type, Map<String, Object> payload) {
        return semanticEditor.applyP0Command(projectId, modelId, base, type, payload);
    }

    SemanticRevision editDraftElement(SemanticRevision base, String type, Map<String, Object> payload) {
        return semanticEditor.editDraftElement(base, type, payload);
    }

    SemanticRevision editDraftContext(SemanticRevision base, Map<String, Object> payload) {
        return semanticEditor.editDraftContext(base, payload);
    }

    SemanticRevision editDraftFact(SemanticRevision base, String type, Map<String, Object> payload) {
        return semanticEditor.editDraftFact(base, type, payload);
    }

    boolean draftLayoutAllowed(SemanticRevision base, String occurrenceId) {
        return semanticEditor.draftLayoutAllowed(base, occurrenceId);
    }

    List<ApiEdtContract.CommandCapabilityOption> draftFactOptions(String query, SemanticRevision base, String intent, String selection, List<String> endpoints) {
        return semanticEditor.draftFactOptions(query, base, intent, selection, endpoints);
    }

    private ModelRevision currentModel(String projectId, String modelId) {
        try (Connection connection = repository.projectConnection(projectId);
             PreparedStatement statement = connection.prepareStatement("""
                     SELECT m.model_id, m.project_id, m.name, h.draft_head_revision_id, d.profile_id, d.profile_version, d.rule_set_version, d.document_json
                     FROM model_catalog m JOIN model_head h ON h.model_id = m.model_id JOIN revision_document d ON d.revision_id = h.draft_head_revision_id
                     WHERE m.model_id = ? AND m.project_id = ? AND m.status = 'ACTIVE'
                     """)) {
            statement.setString(1, modelId); statement.setString(2, projectId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) throw notFound("模型不存在");
                return new ModelRevision(model(result), readRevision(result.getString(8)));
            }
        } catch (SQLException exception) { throw persistence(exception); }
    }

    private SemanticRevision revision(String projectId, String modelId, String revisionId) {
        requireActiveModel(projectId, modelId);
        try (Connection connection = repository.projectConnection(projectId);
             PreparedStatement statement = connection.prepareStatement("SELECT document_json FROM revision_document WHERE model_id = ? AND revision_id = ?")) {
            connection.setAutoCommit(false);
            var saved = org.opm.localruntime.storage.DraftHistoryRepository.find(connection, projectId, modelId, revisionId);
            statement.setString(1, modelId); statement.setString(2, revisionId);
            try (ResultSet result = statement.executeQuery()) {
                if (result.next()) {
                    if (saved.isPresent()) throw new ApiException(ApiErrorCode.PERSISTENCE_FAILED, 503, false, "保存历史身份冲突");
                    return readRevision(result.getString(1));
                }
            }
            if (saved.isEmpty()) throw notFound("修订不存在");
            try {
                var history = saved.get();
                return org.opm.localruntime.semantic.DraftSemanticView.read(org.opm.localruntime.semantic.SaveContentDigestV1.read(history.contentDocument()),
                        history.entry().revisionId(), history.entry().sequence());
            } catch (RuntimeException exception) { throw new ApiException(ApiErrorCode.PERSISTENCE_FAILED, 503, false, "保存历史语义视图无效"); }
        } catch (org.opm.localruntime.storage.DraftJournalRepository.Failure exception) {
            throw new ApiException(ApiErrorCode.PERSISTENCE_FAILED, 503, false, "保存历史完整性校验失败");
        } catch (SQLException exception) { throw persistence(exception); }
    }

    com.fasterxml.jackson.databind.node.ObjectNode transferDocument(String projectId, String modelId, String revisionId) {
        requireActiveModel(projectId, modelId);
        try (var connection = repository.projectConnection(projectId)) {
            connection.setAutoCommit(false);
            var saved = org.opm.localruntime.storage.DraftHistoryRepository.find(connection, projectId, modelId, revisionId);
            try (var statement = connection.prepareStatement("SELECT document_json FROM revision_document WHERE model_id=? AND revision_id=?")) {
                statement.setString(1, modelId); statement.setString(2, revisionId);
                try (var rows = statement.executeQuery()) {
                    if (rows.next()) {
                        if (saved.isPresent()) throw new ApiException(ApiErrorCode.PERSISTENCE_FAILED, 503, false, "保存历史身份冲突");
                        return org.opm.localruntime.semantic.SaveContentDigestV1.read(rows.getString(1));
                    }
                }
            }
            if (saved.isEmpty()) throw notFound("修订不存在");
            var history = saved.get();
            var document = org.opm.localruntime.semantic.SaveContentDigestV1.read(history.contentDocument());
            document.put("revision_id", history.entry().revisionId()).put("revision_sequence", history.entry().sequence());
            return document;
        } catch (SQLException exception) { throw persistence(exception); }
    }

    void requireActiveModel(String projectId, String modelId) {
        try (var connection = repository.projectConnection(projectId);
             var statement = connection.prepareStatement("SELECT 1 FROM model_catalog WHERE project_id=? AND model_id=? AND status='ACTIVE'")) {
            statement.setString(1, projectId); statement.setString(2, modelId);
            try (var rows = statement.executeQuery()) { if (!rows.next()) throw notFound("模型不存在或已移入回收站"); }
        } catch (SQLException exception) { throw persistence(exception); }
    }

    private boolean isBaselineRevision(String projectId, String modelId, String revisionId) {
        try (Connection connection = repository.projectConnection(projectId);
             PreparedStatement statement = connection.prepareStatement("SELECT 1 FROM baseline WHERE model_id = ? AND revision_id = ?")) {
            statement.setString(1, modelId);
            statement.setString(2, revisionId);
            try (ResultSet result = statement.executeQuery()) {
                return result.next();
            }
        } catch (SQLException exception) {
            throw persistence(exception);
        }
    }

    private String validationRevisionReference(Connection connection, String project, String model, String revision) throws SQLException {
        try (var statement = connection.prepareStatement("SELECT 1 FROM revision_document WHERE model_id=? AND revision_id=?")) {
            statement.setString(1, model); statement.setString(2, revision);
            try (var rows = statement.executeQuery()) { if (rows.next()) return revision; }
        }
        // 混合保存版本没有旧 revision_document 外键；完整身份在任务请求及幂等收据中保留。
        if (org.opm.localruntime.storage.DraftHistoryRepository.find(connection, project, model, revision).isEmpty()) throw notFound("校验输入版本不存在");
        return null;
    }

    private boolean hasEvidence(Connection connection, String revisionId, String token) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("SELECT result_json FROM background_task WHERE input_revision_id = ? AND task_type = 'VALIDATE_MODEL' AND state = 'COMPLETED' ORDER BY finished_at DESC")) {
            statement.setString(1, revisionId); try (ResultSet result = statement.executeQuery()) { while (result.next()) {
                Map<String, Object> value = map(result.getString(1));
                // 旧任务只有汇总数，曾将零结构问题误写成 COMPLETE，不能继续作为完整证据。
                if (Integer.valueOf(0).equals(value.get("blocking")) && "COMPLETE".equals(value.get("coverage_state"))
                        && value.get("findings") instanceof List<?> items && items.isEmpty()
                        && token.equals(value.get("evidence_summary_token"))) return true;
            } }
        }
        return false;
    }

    private Map<String, Object> taskDescriptor(String taskId, String revisionId, String state, String stage, Integer progress, boolean cancellable, Map<String, Object> result, String createdAt, String startedAt, String finishedAt) {
        Map<String, Object> descriptor = new LinkedHashMap<>();
        descriptor.put("task_id", taskId);
        descriptor.put("task_type", "VALIDATE_MODEL");
        descriptor.put("state", state);
        descriptor.put("stage", stage);
        descriptor.put("progress", progress);
        descriptor.put("input_revision", revisionId);
        descriptor.put("profile_version", PROFILE_VERSION);
        descriptor.put("rule_version", RULE_VERSION);
        descriptor.put("cancellable", cancellable);
        descriptor.put("result_ref", result.isEmpty() ? null : taskId + ".result");
        descriptor.put("error", null);
        descriptor.put("created_at", createdAt);
        descriptor.put("started_at", startedAt);
        descriptor.put("finished_at", finishedAt);
        return descriptor;
    }

    private Map<String, Object> editResultData(SemanticRevision revision, List<String> traceIds) {
        return Map.of("affected_ids", affectedIds(revision), "text_trace_ids", traceIds,
                "validation_summary", Map.of("blocking", 0, "warning", 0, "suggestion", 0, "coverage_state", "INCOMPLETE"));
    }

    private SemanticRevision readRevision(String document) { return revisionReader.read(new ByteArrayInputStream(document.getBytes(StandardCharsets.UTF_8))); }
    private String freshness(String projectId, String modelId, String revisionId) {
        try (Connection connection = repository.projectConnection(projectId);
             PreparedStatement statement = connection.prepareStatement("SELECT draft_head_revision_id FROM model_head WHERE model_id = ?")) {
            statement.setString(1, modelId);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() && revisionId.equals(result.getString(1)) ? "current" : "historical";
            }
        } catch (SQLException exception) { throw persistence(exception); }
    }
    private List<String> affectedIds(SemanticRevision revision) { List<String> ids = new ArrayList<>(); revision.elements().forEach(value -> ids.add(value.id())); revision.facts().forEach(value -> ids.add(value.id())); return ids; }
    private ProfileRuleBinding binding(SemanticRevision revision) { return new ProfileRuleBinding(revision.profileBinding().profile().id(), revision.profileBinding().profile().version(), revision.profileBinding().ruleSet().id(), revision.profileBinding().ruleSet().version()); }
    private OplGrammar grammar(SemanticRevision revision) {
        var ref = revision.profileBinding().textGrammar();
        return new OplGrammar(new OplGrammar.Binding(ref.id(), ref.version(), ref.sha256()), List.of(
                new OplGrammar.Template("opl.consumption.v1", 10), new OplGrammar.Template("opl.consumption.state.v1", 10),
                new OplGrammar.Template("opl.result.v1", 10), new OplGrammar.Template("opl.result.state.v1", 10),
                new OplGrammar.Template("opl.effect.v1", 10), new OplGrammar.Template("opl.effect.state.input-output.v1", 10),
                new OplGrammar.Template("opl.effect.state.input.v1", 10), new OplGrammar.Template("opl.effect.state.output.v1", 10),
                new OplGrammar.Template("opl.agent.v1", 10), new OplGrammar.Template("opl.agent.state.v1", 10),
                new OplGrammar.Template("opl.instrument.v1", 10), new OplGrammar.Template("opl.instrument.state.v1", 10),
                new OplGrammar.Template("opl.invocation.v1", 10), new OplGrammar.Template("opl.invocation.self.v1", 10),
                new OplGrammar.Template("opl.exception.overtime.v1", 10), new OplGrammar.Template("opl.exception.undertime.v1", 10)));
    }
    private SemanticRevision.ProfileBinding profileBinding() {
        return RuntimeActiveBindingProvider.current();
    }
    private ApiException rejected(CommitFailureCode code) { return switch (code) { case REVISION_CONFLICT -> new ApiException(ApiErrorCode.REVISION_CONFLICT, 409, false, "基础修订不是当前草稿"); case READ_ONLY_REVISION -> new ApiException(ApiErrorCode.READ_ONLY_REVISION, 409, false, "当前修订为只读"); case IDEMPOTENCY_MISMATCH -> new ApiException(ApiErrorCode.IDEMPOTENCY_MISMATCH, 409, false, "command_id 已绑定不同请求"); case RULE_VERSION_CONFLICT -> new ApiException(ApiErrorCode.RULE_VERSION_CONFLICT, 409, false, "Profile 或 Rule 版本不匹配"); case VALIDATION_BLOCKED -> new ApiException(ApiErrorCode.VALIDATION_BLOCKED, 422, false, "候选修订未通过校验"); case MODIFIER_COMBINATION_INVALID -> new ApiException(ApiErrorCode.MODIFIER_COMBINATION_INVALID, 422, false, "Control 修饰组合无效"); case TEXT_GENERATION_BLOCKED -> new ApiException(ApiErrorCode.TEXT_GENERATION_BLOCKED, 422, false, "无法生成 OPL 文本"); default -> new ApiException(ApiErrorCode.PERSISTENCE_FAILED, 500, true, "修订提交失败"); }; }
    private record ModelRevision(Map<String, Object> model, SemanticRevision revision) { }
}
