package org.opm.localruntime.application;

import com.fasterxml.jackson.core.type.TypeReference;
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
import org.opm.localruntime.storage.ProjectDatabaseOpenResult;
import org.opm.localruntime.storage.SqliteRevisionCommitRepository;
import org.opm.localruntime.releaseevidence.fault.E2EFaultPort;
import org.opm.localruntime.releaseauthoring.visualcommon.VisualCommonCommitFaultPort;
import org.opm.localruntime.text.OplGenerationResult;
import org.opm.localruntime.text.OplGrammar;
import org.opm.localruntime.text.OplTextGenerationService;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.opm.localruntime.application.RuntimeActiveBindingProvider.*;

@Service
public class LocalApiService {

    private final ProjectDatabaseFactory databaseFactory;
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
    }

    public Map<String, String> activeProfileRuleBinding() {
        SemanticRevision.ProfileBinding binding = profileBinding();
        return Map.of(
                "profile_id", binding.profile().id(),
                "profile_version", binding.profile().version(),
                "rule_set_id", binding.ruleSet().id(),
                "rule_version", binding.ruleSet().version());
    }

    public Map<String, Object> listProjects(String requestId, String query) {
        List<Map<String, Object>> projects = new ArrayList<>();
        for (Path database : projectDatabases()) {
            try (Connection connection = connection(database);
                 PreparedStatement statement = connection.prepareStatement("""
                         SELECT p.project_id, p.name, p.description, p.status, p.updated_at,
                                (SELECT COUNT(*) FROM model_catalog m WHERE m.project_id = p.project_id AND m.status = 'ACTIVE')
                         FROM project_metadata p WHERE p.status = 'ACTIVE'
                         """)) {
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) {
                        Map<String, Object> project = project(result);
                        if (query == null || query.isBlank() || string(project.get("name")).contains(query)) projects.add(project);
                    }
                }
            } catch (SQLException exception) {
                throw persistence(exception);
            }
        }
        projects.sort(Comparator.comparing(item -> string(item.get("updated_at")), Comparator.reverseOrder()));
        return queryResult(requestId, null, null, null, "not-applicable", projects, true);
    }

    public Map<String, Object> getProject(String requestId, String projectId) {
        try (Connection connection = projectConnection(projectId);
             PreparedStatement statement = connection.prepareStatement("""
                     SELECT p.project_id, p.name, p.description, p.status, p.updated_at,
                            (SELECT COUNT(*) FROM model_catalog m WHERE m.project_id = p.project_id AND m.status = 'ACTIVE')
                     FROM project_metadata p WHERE p.project_id = ?
                     """)) {
            statement.setString(1, projectId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) throw notFound("项目不存在");
                return queryResult(requestId, null, null, null, "not-applicable", project(result), false);
            }
        } catch (SQLException exception) {
            throw persistence(exception);
        }
    }

    public synchronized Map<String, Object> createProject(Map<String, Object> request) {
        String commandId = required(request, "command_id");
        String requestId = required(request, "request_id");
        String digest = requestDigest(request);
        Map<String, Object> replay = findProjectCreateReplay(commandId, digest);
        if (replay != null) return commandResult(requestId, commandId, "COMMITTED", null, "not-applicable", replay);
        String projectId = newId("project");
        ProjectDatabaseOpenResult result = databaseFactory.open(projectId);
        if (!(result instanceof ProjectDatabaseOpenResult.Ready ready)) throw persistence(new IllegalStateException("项目库需要恢复"));
        String now = Instant.now().toString();
        Map<String, Object> project = new LinkedHashMap<>();
        project.put("project_id", projectId);
        project.put("name", required(request, "name"));
        project.put("description", optional(request, "description"));
        project.put("archive_state", "ACTIVE");
        project.put("model_count", 0);
        project.put("updated_at", now);
        try (Connection connection = connection(ready.database().databasePath())) {
            connection.setAutoCommit(false);
            try {
                try (PreparedStatement statement = connection.prepareStatement("""
                        INSERT INTO project_metadata(project_id, name, normalized_name, description, status, default_profile_id, default_profile_version, created_at, updated_at)
                        VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
                        """)) {
                    statement.setString(1, projectId); statement.setString(2, required(request, "name"));
                    statement.setString(3, normalized(required(request, "name"))); statement.setString(4, optional(request, "description"));
                    statement.setString(5, PROFILE_ID); statement.setString(6, PROFILE_VERSION); statement.setString(7, now); statement.setString(8, now);
                    statement.executeUpdate();
                }
                writeIdempotency(connection, "API-PRJ-003", "projects", commandId, digest, null, project, now);
                writeOperation(connection, projectId, null, "API-PRJ-003", "projects", commandId, null, null, "COMMITTED", now);
                connection.commit();
            } catch (Exception exception) {
                connection.rollback();
                throw persistence(exception);
            }
        } catch (SQLException exception) {
            throw persistence(exception);
        }
        return commandResult(requestId, commandId, "COMMITTED", null, "not-applicable", project);
    }

    public Map<String, Object> listModels(String requestId, String projectId) {
        try (Connection connection = projectConnection(projectId);
             PreparedStatement statement = connection.prepareStatement("""
                     SELECT m.model_id, m.project_id, m.name, h.draft_head_revision_id, d.profile_id, d.profile_version, d.rule_set_version
                     FROM model_catalog m JOIN model_head h ON h.model_id = m.model_id
                     JOIN revision_document d ON d.revision_id = h.draft_head_revision_id
                     WHERE m.project_id = ? AND m.status = 'ACTIVE' ORDER BY m.normalized_name
                     """)) {
            statement.setString(1, projectId);
            List<Map<String, Object>> models = new ArrayList<>();
            try (ResultSet result = statement.executeQuery()) { while (result.next()) models.add(model(result)); }
            return queryResult(requestId, null, null, null, "not-applicable", models, true);
        } catch (SQLException exception) { throw persistence(exception); }
    }

    public synchronized Map<String, Object> createModel(String projectId, Map<String, Object> request) {
        String requestId = required(request, "request_id");
        String commandId = required(request, "command_id");
        String digest = requestDigest(request);
        validateBinding(requiredMap(request, "binding"));
        try (Connection connection = projectConnection(projectId)) {
            Map<String, Object> replay = replay(connection, "API-PRJ-007", projectId, commandId, digest);
            if (replay != null) return commandResult(requestId, commandId, "COMMITTED", string(replay.get("head_revision")), "saved", replay);
            String now = Instant.now().toString();
            String modelId = newId("model");
            String contextId = newId("context.root");
            String revisionId = newId("revision.initial");
            SemanticRevision revision = initialRevision(modelId, revisionId, contextId);
            Map<String, Object> model = Map.of("model_id", modelId, "project_id", projectId, "name", required(request, "name"),
                    "head_revision", revisionId, "profile_id", PROFILE_ID, "profile_version", PROFILE_VERSION, "rule_version", RULE_VERSION,
                    "access_mode", "EDITABLE_DRAFT");
            connection.setAutoCommit(false);
            try {
                installBindingPackages(connection, now);
                try (PreparedStatement statement = connection.prepareStatement("""
                        INSERT INTO model_catalog(model_id, project_id, name, normalized_name, description, status, profile_binding_json, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
                        """)) {
                    statement.setString(1, modelId); statement.setString(2, projectId); statement.setString(3, required(request, "name"));
                    statement.setString(4, normalized(required(request, "name"))); statement.setString(5, optional(request, "description"));
                    statement.setString(6, objectMapper.writeValueAsString(revisionWriter.write(revision))); statement.setString(7, now); statement.setString(8, now);
                    statement.executeUpdate();
                }
                insertInitialRevision(connection, revision, now);
                try (PreparedStatement statement = connection.prepareStatement("INSERT INTO revision_parent(model_id, revision_id, parent_revision_id) VALUES (?, ?, NULL)")) {
                    statement.setString(1, modelId); statement.setString(2, revisionId); statement.executeUpdate();
                }
                try (PreparedStatement statement = connection.prepareStatement("INSERT INTO model_head(model_id, draft_head_revision_id, head_sequence, updated_at) VALUES (?, ?, 1, ?)")) {
                    statement.setString(1, modelId); statement.setString(2, revisionId); statement.setString(3, now); statement.executeUpdate();
                }
                writeIdempotency(connection, "API-PRJ-007", projectId, commandId, digest, revisionId, model, now);
                writeOperation(connection, projectId, modelId, "API-PRJ-007", projectId, commandId, null, revisionId, "COMMITTED", now);
                connection.commit();
            } catch (Exception exception) {
                connection.rollback();
                throw persistence(exception);
            }
            return commandResult(requestId, commandId, "COMMITTED", revisionId, "saved", model);
        } catch (SQLException exception) { throw persistence(exception); }
    }

    public Map<String, Object> workspace(String requestId, String projectId, String modelId) {
        ModelRevision data = currentModel(projectId, modelId);
        Map<String, Object> payload = Map.of("model", data.model(), "root_context_id", data.revision().rootContextId(),
                "current_context_id", data.revision().rootContextId(), "viewport_state", Map.of(), "panel_state", Map.of());
        return queryResult(requestId, data.revision().revisionId(), data.revision().profileBinding().profile().version(),
                data.revision().profileBinding().ruleSet().version(), "current", payload, false);
    }

    public Map<String, Object> navigation(String requestId, String projectId, String modelId, String contextId, String revisionId) {
        SemanticRevision revision = revision(projectId, modelId, revisionId);
        SemanticRevision.Context context = context(revision, contextId);
        Map<String, Object> node = Map.of("context_id", context.id(), "label", context.name().localName(), "context_kind", context.kind().name(), "has_children", false);
        Map<String, Object> data = Map.of("current_path", List.of(contextId), "process_tree", List.of(node), "object_forest", List.of(), "views", List.of());
        return queryResult(requestId, revisionId, revision.profileBinding().profile().version(), revision.profileBinding().ruleSet().version(), freshness(projectId, modelId, revisionId), data, false);
    }

    public Map<String, Object> projection(String requestId, String projectId, String modelId, String contextId, String revisionId) {
        SemanticRevision revision = revision(projectId, modelId, revisionId);
        SemanticRevision.Context context = context(revision, contextId);
        Map<String, String> labels = labels(revision);
        Map<String, SemanticRevision.Layout> layouts = new LinkedHashMap<>();
        revision.layouts().forEach(layout -> layouts.put(layout.id(), layout));
        Map<String, String> occurrenceIds = new LinkedHashMap<>();
        Map<String, SemanticRevision.StatePresentation> presentations = new LinkedHashMap<>();
        revision.occurrences().stream()
                .filter(item -> item.contextId().equals(contextId))
                .forEach(item -> occurrenceIds.putIfAbsent(item.targetId(), item.id()));
        revision.statePresentations().stream()
                .filter(item -> item.contextId().equals(contextId))
                .forEach(item -> presentations.put(item.stateId(), item));
        List<Map<String, Object>> constructs = new ArrayList<>();
        for (String occurrenceId : context.occurrenceIds()) {
            SemanticRevision.Occurrence occurrence = revision.occurrences().stream().filter(item -> item.id().equals(occurrenceId)).findFirst().orElseThrow(() -> domain("Context occurrence 不存在"));
            SemanticRevision.StatePresentation presentation = presentations.get(occurrence.targetId());
            if (occurrence.targetKind() == SemanticRevision.TargetKind.STATE && presentation != null
                    && presentation.explicitness() == SemanticRevision.StateExplicitness.SUPPRESSED) continue;
            SemanticRevision.Layout layout = layouts.get(occurrence.layoutId());
            if (layout == null) throw domain("Context layout 不存在");
            Map<String, Object> construct = new LinkedHashMap<>();
            construct.put("occurrence_id", occurrence.id());
            construct.put("target_id", occurrence.targetId());
            construct.put("construct_role", occurrence.constructRole());
            construct.put("label", labels.getOrDefault(occurrence.targetId(), occurrence.targetId()));
            construct.put("layout", Map.of("x", layout.x(), "y", layout.y(), "width", layout.width(), "height", layout.height(), "z_order", layout.zOrder()));
            if (occurrence.targetKind() == SemanticRevision.TargetKind.STATE) {
                SemanticRevision.State state = revision.states().stream().filter(item -> item.id().equals(occurrence.targetId())).findFirst().orElseThrow(() -> domain("Context State 不存在"));
                construct.put("owner_id", state.ownerElementId());
                construct.put("owner_target_kind", state.ownerTargetKind().name());
                construct.put("state_roles", state.roles().stream().map(Enum::name).toList());
                construct.put("explicitness", presentation == null ? SemanticRevision.StateExplicitness.EXPLICIT.name() : presentation.explicitness().name());
                construct.put("fold_state", presentation == null ? SemanticRevision.StateFoldState.UNFOLDED.name() : presentation.foldState().name());
            }
            if (occurrence.targetKind() == SemanticRevision.TargetKind.FACT) {
                SemanticRevision.Fact fact = revision.facts().stream().filter(item -> item.id().equals(occurrence.targetId())).findFirst().orElseThrow(() -> domain("Context Fact 不存在"));
                if (isConsumptionCapability(fact.capability().capabilityId())) {
                    SemanticRevision.Endpoint source = fact.endpoints().stream().filter(endpoint -> "CONSUMED_OBJECT".equals(endpoint.role()) || "CONSUMED_STATE".equals(endpoint.role())).findFirst().orElseThrow(() -> domain("Consumption 源端点不存在"));
                    SemanticRevision.Endpoint target = fact.endpoints().stream().filter(endpoint -> "CONSUMING_PROCESS".equals(endpoint.role())).findFirst().orElseThrow(() -> domain("Consumption Process 端点不存在"));
                    String sourceId = source.targetId();
                    String targetId = target.targetId();
                    construct.put("source_id", sourceId);
                    construct.put("process_id", targetId);
                    construct.put("capability_id", fact.capability().capabilityId());
                    construct.put("endpoints", fact.endpoints().stream().map(endpoint -> Map.of(
                            "role", endpoint.role(), "target_kind", endpoint.targetKind().name(), "target_id", endpoint.targetId(), "ordinal", endpoint.ordinal())).toList());
                    if (!fact.modifiers().isEmpty()) construct.put("modifiers", fact.modifiers().stream().map(modifier -> Map.of("modifier_id", modifier.id(), "value", modifier.value())).toList());
                    construct.put("source_occurrence_id", occurrenceIds.getOrDefault(sourceId, sourceId));
                    construct.put("target_occurrence_id", occurrenceIds.getOrDefault(targetId, targetId));
                    construct.put("symbol_ref", source.targetKind() == SemanticRevision.TargetKind.STATE ? "symbol.link.consumption.state" : "symbol.link.consumption");
                    construct.put("layout_ref", occurrence.layoutId());
                } else {
                    ProceduralLinkCatalog.find(fact.capability().capabilityId()).ifPresent(descriptor -> {
                        construct.put("capability_id", descriptor.capabilityId());
                        construct.put("symbol_ref", descriptor.symbolId());
                        construct.put("layout_ref", occurrence.layoutId());
                        construct.put("endpoints", fact.endpoints().stream().map(endpoint -> Map.of(
                                "role", endpoint.role(), "target_kind", endpoint.targetKind().name(), "target_id", endpoint.targetId(), "ordinal", endpoint.ordinal())).toList());
                        if (!fact.modifiers().isEmpty()) construct.put("modifiers", fact.modifiers().stream().map(modifier -> Map.of("modifier_id", modifier.id(), "value", modifier.value())).toList());
                    });
                    StructuralLinkCatalog.find(fact.capability().capabilityId()).ifPresent(descriptor -> {
                        construct.put("capability_id", descriptor.capabilityId());
                        construct.put("symbol_ref", descriptor.symbolId());
                        construct.put("layout_ref", occurrence.layoutId());
                        construct.put("endpoints", fact.endpoints().stream().map(endpoint -> Map.of(
                                "role", endpoint.role(), "target_kind", endpoint.targetKind().name(), "target_id", endpoint.targetId(), "ordinal", endpoint.ordinal())).toList());
                        construct.put("direction", fact.direction().name());
                        construct.put("labels", fact.labels().stream().map(label -> Map.of("slot_id", label.slotId(), "text", label.text())).toList());
                        construct.put("collection_completeness", fact.collectionCompleteness().name());
                    });
                }
            }
            constructs.add(construct);
        }
        return queryResult(requestId, revisionId, revision.profileBinding().profile().version(), revision.profileBinding().ruleSet().version(), freshness(projectId, modelId, revisionId), Map.of("context_id", contextId, "constructs", constructs), false);
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
        SemanticRevision.Element owner = selectionId == null ? null : revision.elements().stream().filter(element -> element.id().equals(selectionId)).findFirst().orElse(null);
        SemanticRevision.Feature featureOwner = selectionId == null ? null : revision.features().stream().filter(feature -> feature.id().equals(selectionId)).findFirst().orElse(null);
        SemanticRevision.State selectedState = selectionId == null ? null : revision.states().stream().filter(state -> state.id().equals(selectionId)).findFirst().orElse(null);
        SemanticRevision.Fact selectedFact = selectionId == null ? null : revision.facts().stream().filter(fact -> fact.id().equals(selectionId)).findFirst().orElse(null);
        List<String> endpoints = factUpdateIntent && requestedEndpoints.isEmpty() && selectedFact != null
                ? selectedFact.endpoints().stream().map(SemanticRevision.Endpoint::targetId).toList() : requestedEndpoints;
        String queryId = capabilityQueryId(projectId, modelId, revisionId, selectionId, intent, endpoints);
        boolean objectOwner = owner != null && owner.coreKind() == SemanticRevision.CoreKind.OBJECT;
        List<ApiEdtContract.CommandCapabilityOption> options = featureIntent ? featureCreateOptions(queryId, revisionId, owner)
                : stateIntent ? List.of(stateCreateOption(queryId, revisionId, owner, featureOwner, objectOwner))
                : deleteIntent ? List.of(stateDeleteOption(queryId, revision, selectedState))
                : factIntent ? factOptions(queryId, revision, endpoints)
                : factUpdateIntent ? proceduralFactUpdateOptions(queryId, revision, selectedFact, endpoints) : List.of();
        List<ApiEdtContract.CommandType> allowed = new ArrayList<>(List.of(ApiEdtContract.CommandType.CREATE_ELEMENT, ApiEdtContract.CommandType.CREATE_FACT));
        if (owner != null) allowed.add(ApiEdtContract.CommandType.CREATE_FEATURE);
        if (objectOwner) allowed.add(ApiEdtContract.CommandType.CREATE_STATE);
        if (selectedFact != null) allowed.add(ApiEdtContract.CommandType.UPDATE_FACT);
        if (selectedState != null && !stateHasFactReferences(revision, selectedState.id())) allowed.add(ApiEdtContract.CommandType.DELETE_CONSTRUCT);
        ApiEdtContract.CommandCapabilitiesData data = new ApiEdtContract.CommandCapabilitiesData(
                allowed,
                List.of(
                        new ApiEdtContract.ForbiddenCommand(ApiEdtContract.CommandType.CREATE_CONTEXT, "PROFILE_CAPABILITY_DISABLED"),
                        new ApiEdtContract.ForbiddenCommand(ApiEdtContract.CommandType.UPDATE_PROPERTY, "PROFILE_CAPABILITY_DISABLED")),
                queryId,
                options);
        return queryResult(requestId, revisionId, revision.profileBinding().profile().version(), revision.profileBinding().ruleSet().version(), freshness(projectId, modelId, revisionId), data.toWire(), false);
    }

    private List<ApiEdtContract.CommandCapabilityOption> factOptions(String queryId, SemanticRevision revision, List<String> endpointIds) {
        List<ApiEdtContract.CommandCapabilityOption> options = new ArrayList<>(proceduralFactOptions(queryId, revision, endpointIds));
        options.addAll(structuralFactOptions(queryId, revision, endpointIds));
        return List.copyOf(options);
    }

    private List<ApiEdtContract.CommandCapabilityOption> proceduralFactOptions(String queryId, SemanticRevision revision, List<String> endpointIds) {
        List<ProceduralTarget> selected = endpointIds.stream().map(id -> proceduralTarget(revision, id)).toList();
        if (selected.stream().anyMatch(java.util.Objects::isNull)) return List.of();
        return ProceduralLinkCatalog.all().stream()
                .flatMap(descriptor -> normalizeProceduralEndpoints(descriptor, selected).stream()
                        .map(endpoints -> proceduralFactOption(queryId, revision.revisionId(), ApiEdtContract.CommandType.CREATE_FACT, descriptor, endpoints)))
                .toList();
    }

    private List<ApiEdtContract.CommandCapabilityOption> proceduralFactUpdateOptions(String queryId, SemanticRevision revision,
                                                                                       SemanticRevision.Fact fact, List<String> endpointIds) {
        if (fact == null) return List.of();
        ProceduralLinkCatalog.Descriptor descriptor = ProceduralLinkCatalog.find(fact.capability().capabilityId()).orElse(null);
        if (descriptor == null) return structuralFactUpdateOptions(queryId, revision, fact, endpointIds);
        List<ProceduralTarget> selected = endpointIds.stream().map(id -> proceduralTarget(revision, id)).toList();
        if (selected.stream().anyMatch(java.util.Objects::isNull)) return List.of();
        return normalizeProceduralEndpoints(descriptor, selected).map(endpoints -> {
            List<ApiEdtContract.CommandCapabilityOption> options = new ArrayList<>();
            options.add(proceduralFactOption(queryId, revision.revisionId(), ApiEdtContract.CommandType.UPDATE_FACT, descriptor, endpoints));
            ControlLinkCatalog.forBase(descriptor.capabilityId()).forEach(control -> options.add(controlFactOption(queryId, revision.revisionId(), control, descriptor.capabilityId(), endpoints)));
            return List.copyOf(options);
        }).orElseGet(List::of);
    }

    private List<ApiEdtContract.CommandCapabilityOption> structuralFactOptions(String queryId, SemanticRevision revision, List<String> endpointIds) {
        List<StructuralTarget> selected = endpointIds.stream().map(id -> structuralTarget(revision, id)).toList();
        if (selected.stream().anyMatch(java.util.Objects::isNull)) return List.of();
        return StructuralLinkCatalog.all().stream()
                .flatMap(descriptor -> normalizeStructuralEndpoints(descriptor, selected).stream()
                        .map(endpoints -> structuralFactOption(queryId, revision.revisionId(), ApiEdtContract.CommandType.CREATE_FACT, descriptor, endpoints)))
                .toList();
    }

    private List<ApiEdtContract.CommandCapabilityOption> structuralFactUpdateOptions(String queryId, SemanticRevision revision,
                                                                                       SemanticRevision.Fact fact, List<String> endpointIds) {
        StructuralLinkCatalog.Descriptor descriptor = StructuralLinkCatalog.find(fact.capability().capabilityId()).orElse(null);
        if (descriptor == null) return List.of();
        List<StructuralTarget> selected = endpointIds.stream().map(id -> structuralTarget(revision, id)).toList();
        if (selected.stream().anyMatch(java.util.Objects::isNull)) return List.of();
        return normalizeStructuralEndpoints(descriptor, selected)
                .map(endpoints -> List.of(structuralFactOption(queryId, revision.revisionId(), ApiEdtContract.CommandType.UPDATE_FACT, descriptor, endpoints)))
                .orElseGet(List::of);
    }

    private ProceduralTarget proceduralTarget(SemanticRevision revision, String id) {
        SemanticRevision.Element element = revision.elements().stream().filter(item -> item.id().equals(id)).findFirst().orElse(null);
        if (element != null) {
            return new ProceduralTarget(element.coreKind() == SemanticRevision.CoreKind.OBJECT ? ProceduralLinkCatalog.Kind.OBJECT : ProceduralLinkCatalog.Kind.PROCESS,
                    SemanticRevision.TargetKind.ELEMENT, element.id());
        }
        SemanticRevision.State state = revision.states().stream().filter(item -> item.id().equals(id)).findFirst().orElse(null);
        return state == null ? null : new ProceduralTarget(ProceduralLinkCatalog.Kind.STATE, SemanticRevision.TargetKind.STATE, state.id());
    }

    private StructuralTarget structuralTarget(SemanticRevision revision, String id) {
        SemanticRevision.Element element = revision.elements().stream().filter(item -> item.id().equals(id)).findFirst().orElse(null);
        if (element != null && (element.coreKind() == SemanticRevision.CoreKind.OBJECT || element.coreKind() == SemanticRevision.CoreKind.PROCESS)) {
            return new StructuralTarget(element.coreKind(), SemanticRevision.TargetKind.ELEMENT, element.id(), false);
        }
        SemanticRevision.Feature feature = revision.features().stream().filter(item -> item.id().equals(id)).findFirst().orElse(null);
        if (feature != null && (feature.kind() == SemanticRevision.FeatureKind.ATTRIBUTE || feature.kind() == SemanticRevision.FeatureKind.OPERATION)) {
            return new StructuralTarget(null, SemanticRevision.TargetKind.FEATURE, feature.id(), false);
        }
        SemanticRevision.State state = revision.states().stream().filter(item -> item.id().equals(id)).findFirst().orElse(null);
        if (state == null) return null;
        if (state.ownerTargetKind() == SemanticRevision.TargetKind.FEATURE) {
            return new StructuralTarget(null, SemanticRevision.TargetKind.STATE, state.id(), true);
        }
        SemanticRevision.Element owner = revision.elements().stream().filter(item -> item.id().equals(state.ownerElementId())).findFirst().orElse(null);
        if (owner == null || (owner.coreKind() != SemanticRevision.CoreKind.OBJECT && owner.coreKind() != SemanticRevision.CoreKind.PROCESS)) return null;
        return new StructuralTarget(owner.coreKind(), SemanticRevision.TargetKind.STATE, state.id(), false);
    }

    private java.util.Optional<List<ApiEdtContract.NormalizedEndpoint>> normalizeStructuralEndpoints(
            StructuralLinkCatalog.Descriptor descriptor, List<StructuralTarget> selected) {
        if (descriptor.shape() == StructuralLinkCatalog.Shape.EXHIBITION_FAN) {
            if (selected.size() < 2 || selected.getFirst().targetKind() != SemanticRevision.TargetKind.ELEMENT
                    || selected.stream().skip(1).anyMatch(item -> item.targetKind() != SemanticRevision.TargetKind.FEATURE)) return java.util.Optional.empty();
            List<ApiEdtContract.NormalizedEndpoint> endpoints = new ArrayList<>();
            endpoints.add(endpoint("EXHIBITOR_THING", selected.getFirst(), 0));
            for (int index = 1; index < selected.size(); index++) endpoints.add(endpoint("FEATURE_THING", selected.get(index), index));
            return java.util.Optional.of(List.copyOf(endpoints));
        }
        if (descriptor.shape() == StructuralLinkCatalog.Shape.STATE_CHARACTERIZATION) {
            if (selected.size() != 2 || selected.getFirst().featureValueState() || !selected.get(1).featureValueState()) return java.util.Optional.empty();
            String sourceRole = selected.getFirst().targetKind() == SemanticRevision.TargetKind.STATE ? "EXHIBITOR_THING_OR_STATE" : "EXHIBITOR_THING_OR_STATE";
            return java.util.Optional.of(List.of(endpoint(sourceRole, selected.getFirst(), 0), endpoint("VALUE_STATE", selected.get(1), 1)));
        }
        if (descriptor.shape() == StructuralLinkCatalog.Shape.BINARY_SAME_THING) {
            if (selected.size() != 2 || selected.stream().anyMatch(item -> item.targetKind() != SemanticRevision.TargetKind.ELEMENT)
                    || selected.getFirst().coreKind() != selected.get(1).coreKind()) return java.util.Optional.empty();
            return java.util.Optional.of(List.of(endpoint("STRUCTURAL_SOURCE", selected.getFirst(), 0), endpoint("STRUCTURAL_TARGET", selected.get(1), 1)));
        }
        if (descriptor.shape() == StructuralLinkCatalog.Shape.STATE_TAGGED) {
            if (selected.size() != 2 || selected.stream().anyMatch(StructuralTarget::featureValueState) || selected.stream().noneMatch(item -> item.targetKind() == SemanticRevision.TargetKind.STATE)
                    || selected.getFirst().coreKind() != selected.get(1).coreKind()) return java.util.Optional.empty();
            return java.util.Optional.of(List.of(endpoint("STATE_TAGGED_SOURCE", selected.getFirst(), 0), endpoint("STATE_TAGGED_TARGET", selected.get(1), 1)));
        }
        if (selected.size() < 2 || selected.stream().anyMatch(item -> item.targetKind() != SemanticRevision.TargetKind.ELEMENT)
                || selected.stream().map(StructuralTarget::coreKind).distinct().count() != 1) return java.util.Optional.empty();
        String rootRole = switch (descriptor.shape()) {
            case AGGREGATION_FAN -> "WHOLE_THING";
            case GENERALIZATION_FAN -> "GENERAL_THING";
            case CLASSIFICATION_FAN -> "CLASS_THING";
            default -> throw new IllegalStateException("Unsupported structural fan shape");
        };
        String memberRole = switch (descriptor.shape()) {
            case AGGREGATION_FAN -> "PART_THING";
            case GENERALIZATION_FAN -> "SPECIALIZED_THING";
            case CLASSIFICATION_FAN -> "INSTANCE_THING";
            default -> throw new IllegalStateException("Unsupported structural fan shape");
        };
        List<ApiEdtContract.NormalizedEndpoint> endpoints = new ArrayList<>();
        endpoints.add(endpoint(rootRole, selected.getFirst(), 0));
        for (int index = 1; index < selected.size(); index++) endpoints.add(endpoint(memberRole, selected.get(index), index));
        return java.util.Optional.of(List.copyOf(endpoints));
    }

    private ApiEdtContract.NormalizedEndpoint endpoint(String role, StructuralTarget target, int ordinal) {
        return new ApiEdtContract.NormalizedEndpoint(role, new ApiEdtContract.TargetLocator(target.targetKind().name(), target.id(), null), ordinal, null);
    }

    private java.util.Optional<List<ApiEdtContract.NormalizedEndpoint>> normalizeProceduralEndpoints(
            ProceduralLinkCatalog.Descriptor descriptor,
            List<ProceduralTarget> selected) {
        if (descriptor.endpointRoles().size() != selected.size()) return java.util.Optional.empty();
        List<ProceduralTarget> remaining = new ArrayList<>(selected);
        List<ApiEdtContract.NormalizedEndpoint> normalized = new ArrayList<>();
        for (int ordinal = 0; ordinal < descriptor.endpointRoles().size(); ordinal++) {
            ProceduralLinkCatalog.EndpointRole role = descriptor.endpointRoles().get(ordinal);
            int index = -1;
            for (int candidate = 0; candidate < remaining.size(); candidate++) {
                if (remaining.get(candidate).kind() == role.kind()) {
                    index = candidate;
                    break;
                }
            }
            if (index < 0) return java.util.Optional.empty();
            ProceduralTarget target = remaining.remove(index);
            normalized.add(new ApiEdtContract.NormalizedEndpoint(role.role(), new ApiEdtContract.TargetLocator(target.targetKind().name(), target.id(), null), ordinal, null));
        }
        if (descriptor.sameProcessRequired() && !normalized.getFirst().targetRef().targetId().equals(normalized.get(1).targetRef().targetId())) {
            return java.util.Optional.empty();
        }
        return java.util.Optional.of(List.copyOf(normalized));
    }

    private ApiEdtContract.CommandCapabilityOption proceduralFactOption(
            String queryId,
            String revisionId,
            ApiEdtContract.CommandType commandType,
            ProceduralLinkCatalog.Descriptor descriptor,
            List<ApiEdtContract.NormalizedEndpoint> endpoints) {
        List<ApiEdtContract.RequiredField> fields = new ArrayList<>(List.of(
                new ApiEdtContract.RequiredField("normalized_endpoints", "ENDPOINT", true, List.of()),
                new ApiEdtContract.RequiredField("layout", "LAYOUT", true, List.of())));
        if (descriptor.durationRequired()) fields.add(new ApiEdtContract.RequiredField("duration", "TEXT", true, List.of()));
        List<ApiEdtContract.AllowedModifier> modifiers = descriptor.durationRequired()
                ? List.of(new ApiEdtContract.AllowedModifier("duration", List.of(), 1, 1, null)) : List.of();
        return new ApiEdtContract.CommandCapabilityOption(queryId, proceduralFactOptionId(queryId, descriptor.capabilityId()),
                commandType, descriptor.capabilityId(), null, descriptor.displayName(), List.of("过程关系"), endpoints, fields, modifiers,
                new ApiEdtContract.AssetReference(descriptor.symbolId(), SYMBOL_VERSION, SYMBOL_DIGEST),
                new ApiEdtContract.AssetReference(GRAMMAR_ID, GRAMMAR_VERSION, GRAMMAR_DIGEST),
                List.of(new ApiEdtContract.AssetReference(descriptor.ruleId(), RULE_VERSION, RULE_DIGEST)), true, List.of(), null, null, revisionId);
    }

    private ApiEdtContract.CommandCapabilityOption structuralFactOption(
            String queryId,
            String revisionId,
            ApiEdtContract.CommandType commandType,
            StructuralLinkCatalog.Descriptor descriptor,
            List<ApiEdtContract.NormalizedEndpoint> endpoints) {
        List<ApiEdtContract.RequiredField> fields = new ArrayList<>(List.of(
                new ApiEdtContract.RequiredField("normalized_endpoints", "ENDPOINT", true, List.of()),
                new ApiEdtContract.RequiredField("direction", "ENUM", true, structuralDirections(descriptor)),
                new ApiEdtContract.RequiredField("layout", "LAYOUT", commandType == ApiEdtContract.CommandType.CREATE_FACT, List.of())));
        if (!descriptor.labelSlots().isEmpty()) {
            fields.add(new ApiEdtContract.RequiredField("labels", "LIST", descriptor.labelsRequired(), descriptor.labelSlots()));
        }
        if (descriptor.completenessSupported()) {
            fields.add(new ApiEdtContract.RequiredField("collection_completeness", "ENUM", true, List.of("COMPLETE", "INCOMPLETE")));
        }
        return new ApiEdtContract.CommandCapabilityOption(queryId, structuralFactOptionId(queryId, descriptor.capabilityId()), commandType,
                descriptor.capabilityId(), null, descriptor.displayName(), List.of("结构关系"), endpoints, fields, List.of(),
                new ApiEdtContract.AssetReference(descriptor.symbolId(), SYMBOL_VERSION, SYMBOL_DIGEST),
                new ApiEdtContract.AssetReference(descriptor.templateId(), GRAMMAR_VERSION, GRAMMAR_DIGEST),
                List.of(new ApiEdtContract.AssetReference(descriptor.ruleId(), RULE_VERSION, RULE_DIGEST)), true, List.of(), null, null, revisionId);
    }

    private List<String> structuralDirections(StructuralLinkCatalog.Descriptor descriptor) {
        return descriptor.direction() == SemanticRevision.Direction.PROFILE_DEFINED
                ? List.of("DIRECTED", "BIDIRECTIONAL") : List.of(descriptor.direction().name());
    }

    private ApiEdtContract.CommandCapabilityOption controlFactOption(
            String queryId,
            String revisionId,
            ControlLinkCatalog.Descriptor descriptor,
            String baseCapabilityId,
            List<ApiEdtContract.NormalizedEndpoint> endpoints) {
        List<ApiEdtContract.AllowedModifier> modifiers = List.of(
                new ApiEdtContract.AllowedModifier(ControlLinkCatalog.CONTROL_CAPABILITY_MODIFIER, List.of(descriptor.capabilityId()), 1, 1, "iso-control"),
                new ApiEdtContract.AllowedModifier(ControlLinkCatalog.CONTROL_SEGMENT_MODIFIER, List.of(ControlLinkCatalog.PROCESS_INPUT), 1, 1, "iso-control"));
        List<ApiEdtContract.RequiredField> fields = List.of(new ApiEdtContract.RequiredField("modifiers", "LIST", true, List.of()));
        return new ApiEdtContract.CommandCapabilityOption(queryId, controlFactOptionId(queryId, descriptor.capabilityId()), ApiEdtContract.CommandType.UPDATE_FACT,
                descriptor.capabilityId(), baseCapabilityId, descriptor.displayName(), List.of("控制关系"), endpoints, fields, modifiers,
                new ApiEdtContract.AssetReference(descriptor.symbolId(), SYMBOL_VERSION, SYMBOL_DIGEST),
                new ApiEdtContract.AssetReference(descriptor.templateId(), GRAMMAR_VERSION, GRAMMAR_DIGEST),
                List.of(new ApiEdtContract.AssetReference(descriptor.ruleId(), RULE_VERSION, RULE_DIGEST)), true, List.of(), null, null, revisionId);
    }

    private ApiEdtContract.CommandCapabilityOption stateCreateOption(String queryId, String revisionId, SemanticRevision.Element owner, SemanticRevision.Feature featureOwner, boolean enabled) {
        boolean featureState = featureOwner != null;
        List<ApiEdtContract.NormalizedEndpoint> endpoints = owner != null ? List.of(new ApiEdtContract.NormalizedEndpoint("STATE_OWNER", new ApiEdtContract.TargetLocator("ELEMENT", owner.id(), null), 0, null))
                : featureOwner == null ? List.of() : List.of(new ApiEdtContract.NormalizedEndpoint("STATE_OWNER", new ApiEdtContract.TargetLocator("FEATURE", featureOwner.id(), null), 0, null));
        List<ApiEdtContract.RequiredField> fields = List.of(
                new ApiEdtContract.RequiredField("name_or_value", "TEXT", true, List.of()),
                new ApiEdtContract.RequiredField("state_roles", "LIST", true, List.of("INITIAL", "DEFAULT", "FINAL")),
                new ApiEdtContract.RequiredField("layout", "LAYOUT", true, List.of()));
        ApiEdtContract.AssetReference symbol = new ApiEdtContract.AssetReference(featureState ? "symbol.feature.state" : "symbol.state.basic", SYMBOL_VERSION, SYMBOL_DIGEST);
        ApiEdtContract.AssetReference template = new ApiEdtContract.AssetReference(GRAMMAR_ID, GRAMMAR_VERSION, GRAMMAR_DIGEST);
        ApiEdtContract.AssetReference rule = new ApiEdtContract.AssetReference(RULE_ID, RULE_VERSION, RULE_DIGEST);
        String reason = owner == null && featureOwner == null ? "ENDPOINT_KIND_MISMATCH" : "PROFILE_CAPABILITY_DISABLED";
        boolean stateEnabled = featureState || enabled;
        return new ApiEdtContract.CommandCapabilityOption(queryId, "option.state." + digest(queryId).substring(0, 24), ApiEdtContract.CommandType.CREATE_STATE,
                featureState ? "CAP-FEAT-STATE-001" : "CAP-STATE-001", null, featureState ? "创建 Feature Value State" : "创建 Object State", featureState ? List.of("Feature", "Value State") : List.of("Object", "State"), endpoints, fields, List.of(), symbol, template, List.of(rule), stateEnabled,
                stateEnabled ? List.of() : List.of(reason), null, null, revisionId);
    }

    private List<ApiEdtContract.CommandCapabilityOption> featureCreateOptions(String queryId, String revisionId, SemanticRevision.Element owner) {
        if (owner == null) return List.of();
        List<ApiEdtContract.NormalizedEndpoint> endpoints = List.of(new ApiEdtContract.NormalizedEndpoint("FEATURE_OWNER", new ApiEdtContract.TargetLocator("ELEMENT", owner.id(), null), 0, null));
        List<ApiEdtContract.RequiredField> fields = List.of(new ApiEdtContract.RequiredField("feature_kind", "ENUM", true, List.of("ATTRIBUTE", "OPERATION")), new ApiEdtContract.RequiredField("name", "TEXT", true, List.of()), new ApiEdtContract.RequiredField("layout", "LAYOUT", true, List.of()));
        return List.of(
                featureCreateOption(queryId, revisionId, "ATTRIBUTE", "CAP-FEAT-ATTRIBUTE-001", "symbol.feature.attribute", endpoints, fields),
                featureCreateOption(queryId, revisionId, "OPERATION", "CAP-FEAT-OPERATION-001", "symbol.feature.operation", endpoints, fields));
    }

    private ApiEdtContract.CommandCapabilityOption featureCreateOption(String queryId, String revisionId, String kind, String capabilityId, String symbolId,
                                                                         List<ApiEdtContract.NormalizedEndpoint> endpoints, List<ApiEdtContract.RequiredField> fields) {
        return new ApiEdtContract.CommandCapabilityOption(queryId, "option.feature." + kind.toLowerCase() + "." + digest(queryId).substring(0, 16), ApiEdtContract.CommandType.CREATE_FEATURE,
                capabilityId, null, "创建" + ("ATTRIBUTE".equals(kind) ? "属性" : "操作"), List.of("Feature", "ATTRIBUTE".equals(kind) ? "Attribute" : "Operation"), endpoints, fields, List.of(),
                new ApiEdtContract.AssetReference(symbolId, SYMBOL_VERSION, SYMBOL_DIGEST), new ApiEdtContract.AssetReference(GRAMMAR_ID, GRAMMAR_VERSION, GRAMMAR_DIGEST),
                List.of(new ApiEdtContract.AssetReference(RULE_ID, RULE_VERSION, RULE_DIGEST)), true, List.of(), null, null, revisionId);
    }

    private ApiEdtContract.CommandCapabilityOption stateDeleteOption(String queryId, SemanticRevision revision, SemanticRevision.State state) {
        ApiEdtContract.AssetReference symbol = new ApiEdtContract.AssetReference("symbol.state.basic", SYMBOL_VERSION, SYMBOL_DIGEST);
        ApiEdtContract.AssetReference template = new ApiEdtContract.AssetReference(GRAMMAR_ID, GRAMMAR_VERSION, GRAMMAR_DIGEST);
        ApiEdtContract.AssetReference rule = new ApiEdtContract.AssetReference(RULE_ID, RULE_VERSION, RULE_DIGEST);
        if (state == null) {
            return new ApiEdtContract.CommandCapabilityOption(queryId, "option.state.delete." + digest(queryId).substring(0, 16), ApiEdtContract.CommandType.DELETE_CONSTRUCT,
                    "CAP-STATE-001", null, "删除 State", List.of("Object", "State"), List.of(), List.of(new ApiEdtContract.RequiredField("impact_token", "TOKEN", true, List.of())), List.of(), symbol, template, List.of(rule), false,
                    List.of("ENDPOINT_KIND_MISMATCH"), new ApiEdtContract.ImpactSummary(0, 0, 0, 0), "impact." + digest(queryId), revision.revisionId());
        }
        int occurrences = (int) revision.occurrences().stream().filter(item -> item.targetKind() == SemanticRevision.TargetKind.STATE && item.targetId().equals(state.id())).count();
        int contexts = (int) revision.occurrences().stream().filter(item -> item.targetKind() == SemanticRevision.TargetKind.STATE && item.targetId().equals(state.id())).map(SemanticRevision.Occurrence::contextId).distinct().count();
        int references = (int) revision.facts().stream().filter(fact -> fact.endpoints().stream().anyMatch(endpoint -> endpoint.targetKind() == SemanticRevision.TargetKind.STATE && endpoint.targetId().equals(state.id()) || state.id().equals(endpoint.stateQualificationId()))).count();
        boolean enabled = references == 0;
        ApiEdtContract.ImpactSummary impact = new ApiEdtContract.ImpactSummary(1 + occurrences, contexts, references, 0);
        return new ApiEdtContract.CommandCapabilityOption(queryId, "option.state.delete." + digest(queryId).substring(0, 16), ApiEdtContract.CommandType.DELETE_CONSTRUCT,
                "CAP-STATE-001", null, "删除 State", List.of("Object", "State"), List.of(), List.of(new ApiEdtContract.RequiredField("impact_token", "TOKEN", true, List.of())), List.of(), symbol, template, List.of(rule), enabled,
                enabled ? List.of() : List.of("PROFILE_CAPABILITY_DISABLED"), impact, deleteStateToken(revision, state.id()), revision.revisionId());
    }

    public synchronized Map<String, Object> edit(String projectId, String modelId, String contextId, Map<String, Object> request) {
        String requestId = required(request, "request_id");
        String commandId = required(request, "command_id");
        String baseRevisionId = required(request, "base_revision");
        ModelRevision current = currentModel(projectId, modelId);
        if (!current.revision().rootContextId().equals(contextId)) throw domain("P0 仅支持根系统图");
        validateBinding(requiredMap(request, "binding"));
        if (!baseRevisionId.equals(current.revision().revisionId())) throw new ApiException(ApiErrorCode.REVISION_CONFLICT, 409, false, "基础修订不是当前草稿");
        SemanticRevision candidate = applyP0Command(projectId, modelId, current.revision(), required(request, "command_type"), requiredMap(request, "payload"));
        CandidateRevisionCommand command = new CandidateRevisionCommand(projectId, modelId, commandId, baseRevisionId, current.revision(), candidate,
                binding(current.revision()), grammar(current.revision()), requestDigest(request), "P0_EDIT", Instant.now());
        CommitResult result = new CandidateRevisionCommitter(new SqliteRevisionCommitRepository(databaseFactory.databasePath(projectId), e2eFaultPort, visualCommonCommitFaultPort), profilePackageAssembler, e2eFaultPort).commit(command);
        if (result instanceof CommitResult.Rejected rejected) throw rejected(rejected.code());
        String committed = result instanceof CommitResult.Committed value ? value.committedRevisionId() : ((CommitResult.Replayed) result).committedRevisionId();
        List<String> traces = result instanceof CommitResult.Committed value ? value.traceIds() : List.of();
        Map<String, Object> data = Map.of("affected_ids", affectedIds(candidate), "text_trace_ids", traces,
                "validation_summary", Map.of("blocking", 0, "warning", 0, "suggestion", 0, "coverage_state", "INCOMPLETE"));
        return commandResult(requestId, commandId, "COMMITTED", committed, "saved", data);
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

    public synchronized Map<String, Object> validate(String projectId, String modelId, Map<String, Object> request) {
        String requestId = required(request, "request_id");
        String commandId = required(request, "command_id");
        String revisionId = required(request, "input_revision");
        SemanticRevision revision = revision(projectId, modelId, revisionId);
        validateBinding(requiredMap(request, "binding"));
        String requestDigest = requestDigest(request);
        try (Connection connection = projectConnection(projectId)) {
            Map<String, Object> replay = replay(connection, "API-VAL-001", modelId, commandId, requestDigest);
            if (replay != null) return commandResult(requestId, commandId, "ACCEPTED", null, "not-applicable", replay);
        } catch (SQLException exception) { throw persistence(exception); }
        String taskId = newId("task.validate");
        String now = Instant.now().toString();
        int blocking = semanticValidator.validate(revision).size();
        String evidence = "evidence." + digest(taskId + revisionId).substring(0, 32);
        Map<String, Object> result = Map.of("blocking", blocking, "warning", 0, "suggestion", 0, "coverage_state", blocking == 0 ? "COMPLETE" : "INCOMPLETE", "evidence_summary_token", evidence);
        try (Connection connection = projectConnection(projectId)) {
            connection.setAutoCommit(false);
            try (PreparedStatement statement = connection.prepareStatement("""
                     INSERT INTO background_task(task_id, task_type, state, stage, progress, input_revision_id, profile_id, profile_version, rule_set_id, rule_set_version, cancellable, request_json, result_json, created_at, started_at, finished_at, updated_at)
                     VALUES (?, 'VALIDATE_MODEL', 'COMPLETED', 'COMPLETE', 100, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
                     """)) {
            statement.setString(1, taskId); statement.setString(2, revisionId); statement.setString(3, PROFILE_ID); statement.setString(4, PROFILE_VERSION); statement.setString(5, RULE_ID); statement.setString(6, RULE_VERSION);
            statement.setString(7, objectMapper.writeValueAsString(request)); statement.setString(8, objectMapper.writeValueAsString(result));
                statement.setString(9, now); statement.setString(10, now); statement.setString(11, now); statement.setString(12, now); statement.executeUpdate();
                Map<String, Object> descriptor = taskDescriptor(taskId, revisionId, "COMPLETED", "COMPLETE", 100, false, result, now, now, now);
                writeIdempotency(connection, "API-VAL-001", modelId, commandId, requestDigest, null, descriptor, now);
                writeOperation(connection, projectId, modelId, "API-VAL-001", modelId, commandId, revisionId, null, "ACCEPTED", now);
                connection.commit();
                return commandResult(requestId, commandId, "ACCEPTED", null, "not-applicable", descriptor);
            } catch (Exception exception) {
                connection.rollback();
                throw persistence(exception);
            }
        } catch (SQLException exception) { throw persistence(exception); }
    }

    public Map<String, Object> revisions(String requestId, String projectId, String modelId) {
        try (Connection connection = projectConnection(projectId);
             PreparedStatement statement = connection.prepareStatement("""
                     SELECT d.revision_id, d.revision_sequence, d.created_at, d.revision_id = h.draft_head_revision_id AS is_head,
                            (SELECT COUNT(*) FROM baseline b WHERE b.revision_id = d.revision_id) AS baseline_count
                     FROM revision_document d JOIN model_head h ON h.model_id = d.model_id WHERE d.model_id = ? ORDER BY d.revision_sequence DESC
                     """)) {
            statement.setString(1, modelId);
            List<Map<String, Object>> values = new ArrayList<>();
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) values.add(Map.of("revision_id", result.getString(1), "sequence", result.getInt(2),
                        "kind", result.getInt(5) > 0 ? "BASELINE" : "DRAFT", "created_at", result.getString(3), "immutable", true, "blocking_count", 0));
            }
            return queryResult(requestId, null, null, null, "not-applicable", values, true);
        } catch (SQLException exception) { throw persistence(exception); }
    }

    public synchronized Map<String, Object> baseline(String projectId, String modelId, Map<String, Object> request) {
        String requestId = required(request, "request_id"); String commandId = required(request, "command_id"); String revisionId = required(request, "base_revision");
        validateBinding(requiredMap(request, "binding")); revision(projectId, modelId, revisionId);
        String token = required(request, "evidence_summary_token");
        try (Connection connection = projectConnection(projectId)) {
            Map<String, Object> replay = replay(connection, "API-VER-004", modelId, commandId, requestDigest(request));
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
                writeOperation(connection, projectId, modelId, "API-VER-004", modelId, commandId, revisionId, revisionId, "COMMITTED", now);
                Map<String, Object> data = Map.of("baseline_id", baselineId, "revision_id", revisionId, "immutable", true);
                writeIdempotency(connection, "API-VER-004", modelId, commandId, requestDigest(request), revisionId, data, now);
                connection.commit();
                return commandResult(requestId, commandId, "COMMITTED", revisionId, "not-applicable", data);
            } catch (Exception exception) { connection.rollback(); throw persistence(exception); }
        } catch (SQLException exception) { throw persistence(exception); }
    }

    public Map<String, Object> task(String requestId, String taskId) {
        for (Path database : projectDatabases()) {
            try (Connection connection = connection(database);
                 PreparedStatement statement = connection.prepareStatement("SELECT task_id, state, stage, progress, input_revision_id, cancellable, result_json, created_at, started_at, finished_at FROM background_task WHERE task_id = ?")) {
                statement.setString(1, taskId);
                try (ResultSet result = statement.executeQuery()) {
                    if (result.next()) {
                        Map<String, Object> descriptor = taskDescriptor(result.getString(1), result.getString(5), result.getString(2), result.getString(3), result.getObject(4, Integer.class), result.getInt(6) == 1,
                                map(result.getString(7)), result.getString(8), result.getString(9), result.getString(10));
                        return queryResult(requestId, result.getString(5), PROFILE_VERSION, RULE_VERSION, "historical", descriptor, false);
                    }
                }
            } catch (SQLException exception) { throw persistence(exception); }
        }
        throw notFound("任务不存在");
    }

    private SemanticRevision applyP0Command(String projectId, String modelId, SemanticRevision base, String type, Map<String, Object> payload) {
        String revisionId = newId("revision");
        List<SemanticRevision.Element> elements = new ArrayList<>(base.elements());
        List<SemanticRevision.Feature> features = new ArrayList<>(base.features());
        List<SemanticRevision.Fact> facts = new ArrayList<>(base.facts());
        List<SemanticRevision.Context> contexts = new ArrayList<>(base.contexts());
        List<SemanticRevision.Occurrence> occurrences = new ArrayList<>(base.occurrences());
        List<SemanticRevision.Layout> layouts = new ArrayList<>(base.layouts());
        List<SemanticRevision.State> states = new ArrayList<>(base.states());
        List<SemanticRevision.StatePresentation> presentations = new ArrayList<>(base.statePresentations());
        if ("CREATE_ELEMENT".equals(type)) {
            String kind = required(payload, "kind");
            if (!"OBJECT".equals(kind) && !"PROCESS".equals(kind)) throw profileForbidden();
            String id = optional(payload, "element_id"); if (id == null) id = newId("element"); stableId(id);
            String name = required(payload, "name");
            String capability = "OBJECT".equals(kind) ? "CAP-OBJECT-001" : "CAP-PROCESS-001";
            elements.add(new SemanticRevision.Element(id, SemanticRevision.CoreKind.valueOf(kind), capability(capability), qualifiedName(name), List.of(), source(kind), core()));
            appendOccurrence(base, id, SemanticRevision.TargetKind.ELEMENT, "OBJECT".equals(kind) ? "OBJECT_NODE" : "PROCESS_NODE", payload, contexts, occurrences, layouts);
        } else if ("CREATE_FEATURE".equals(type)) {
            String ownerId = required(payload, "owner_element_id");
            SemanticRevision.Element owner = elements.stream().filter(element -> element.id().equals(ownerId)).findFirst().orElseThrow(() -> domain("Feature owner 不存在"));
            String kind = required(payload, "feature_kind");
            if (!"ATTRIBUTE".equals(kind) && !"OPERATION".equals(kind)) throw profileForbidden();
            String capabilityId = required(requiredMap(payload, "capability_ref"), "capability_id");
            String expectedCapability = "ATTRIBUTE".equals(kind) ? "CAP-FEAT-ATTRIBUTE-001" : "CAP-FEAT-OPERATION-001";
            if (!expectedCapability.equals(capabilityId)) throw domain("Feature kind 与 Capability 不匹配");
            validateFeatureCreateOption(projectId, modelId, base, payload, ownerId, capabilityId);
            String requestedFeatureId = optional(payload, "feature_id");
            String featureId = requestedFeatureId == null ? newId("feature") : requestedFeatureId;
            stableId(featureId);
            if (features.stream().anyMatch(feature -> feature.id().equals(featureId))) throw domain("Feature 标识已存在");
            features.add(new SemanticRevision.Feature(featureId, ownerId, SemanticRevision.FeatureKind.valueOf(kind), capability(capabilityId), qualifiedName(required(payload, "name")), source(kind + "Feature"), core()));
            replaceElementFeatureIds(elements, ownerId, append(owner.featureIds(), featureId));
            appendOccurrence(base, featureId, SemanticRevision.TargetKind.FEATURE, "ATTRIBUTE".equals(kind) ? "ATTRIBUTE_NODE" : "OPERATION_NODE", payload, contexts, occurrences, layouts);
        } else if ("CREATE_FACT".equals(type)) {
            if ("CONSUMPTION".equals(optional(payload, "kind"))) {
                String objectId = required(payload, "object_id"); String processId = required(payload, "process_id");
                if (elements.stream().noneMatch(item -> item.id().equals(objectId) && item.coreKind() == SemanticRevision.CoreKind.OBJECT)
                        || elements.stream().noneMatch(item -> item.id().equals(processId) && item.coreKind() == SemanticRevision.CoreKind.PROCESS)) throw domain("Consumption 端点必须引用现有 Object 和 Process");
                String stateId = optional(payload, "state_id");
                if (stateId != null && states.stream().noneMatch(state -> state.id().equals(stateId) && state.ownerElementId().equals(objectId))) {
                    throw domain("Consumption State 必须由被消耗 Object 持有");
                }
                String id = optional(payload, "fact_id"); if (id == null) id = newId("fact.consumption"); stableId(id);
                String capabilityId = stateId == null ? ProceduralLinkCatalog.CONSUMPTION : "CAP-ISO-PROC-006";
                String sourceRole = stateId == null ? "CONSUMED_OBJECT" : "CONSUMED_STATE";
                facts.add(new SemanticRevision.Fact(id, SemanticRevision.FactFamily.TRANSFORMATION, capability(capabilityId), List.of(
                        new SemanticRevision.Endpoint(newId("endpoint"), sourceRole, stateId == null ? SemanticRevision.TargetKind.ELEMENT : SemanticRevision.TargetKind.STATE, stateId == null ? objectId : stateId, 0, null),
                        new SemanticRevision.Endpoint(newId("endpoint"), "CONSUMING_PROCESS", SemanticRevision.TargetKind.ELEMENT, processId, 1, null)), SemanticRevision.Direction.DIRECTED, source("ConsumptionLink"), core()));
                appendOccurrence(base, id, SemanticRevision.TargetKind.FACT, "CONSUMPTION_LINK", payload, contexts, occurrences, layouts);
            } else {
                String capabilityId = required(requiredMap(payload, "capability_ref"), "capability_id");
                if (StructuralLinkCatalog.find(capabilityId).isPresent()) {
                    createStructuralFact(projectId, modelId, base, payload, facts, contexts, occurrences, layouts);
                } else {
                    createProceduralFact(projectId, modelId, base, payload, facts, contexts, occurrences, layouts);
                }
            }
        } else if ("CREATE_STATE".equals(type)) {
            Map<String, Object> ownerRef = requiredMap(payload, "owner_ref");
            String ownerKind = required(ownerRef, "target_kind");
            if (!"ELEMENT".equals(ownerKind) && !"FEATURE".equals(ownerKind)) throw domain("State owner 必须是 Element 或 Feature");
            String ownerId = required(ownerRef, "target_id");
            SemanticRevision.Element owner = "ELEMENT".equals(ownerKind) ? elements.stream().filter(element -> element.id().equals(ownerId)).findFirst().orElseThrow(() -> domain("State owner 不存在")) : null;
            SemanticRevision.Feature featureOwner = "FEATURE".equals(ownerKind) ? features.stream().filter(feature -> feature.id().equals(ownerId)).findFirst().orElseThrow(() -> domain("Feature State owner 不存在")) : null;
            if (owner != null && owner.coreKind() != SemanticRevision.CoreKind.OBJECT) throw profileForbidden();
            String requestedStateId = optional(payload, "state_id");
            String stateId = requestedStateId == null ? newId("state") : requestedStateId;
            stableId(stateId);
            if (states.stream().anyMatch(state -> state.id().equals(stateId))) throw domain("State 标识已存在");
            String stateCapability = owner == null ? "CAP-FEAT-STATE-001" : "CAP-STATE-001";
            states.add(new SemanticRevision.State(stateId, SemanticRevision.TargetKind.valueOf(ownerKind), ownerId, capability(stateCapability), qualifiedName(required(payload, "name_or_value")), stateRoles(payload), source(owner == null ? "FeatureValueState" : "ObjectState"), core()));
            if (owner != null) replaceElementStateIds(elements, ownerId, append(owner.stateIds(), stateId));
            appendOccurrence(base, stateId, SemanticRevision.TargetKind.STATE, owner == null ? "FEATURE_STATE_NODE" : "STATE_NODE", payload, contexts, occurrences, layouts);
            presentations.add(new SemanticRevision.StatePresentation(base.rootContextId(), stateId, SemanticRevision.StateExplicitness.EXPLICIT, SemanticRevision.StateFoldState.UNFOLDED));
        } else if ("UPDATE_STATE".equals(type)) {
            String stateId = required(payload, "state_id");
            SemanticRevision.State current = states.stream().filter(state -> state.id().equals(stateId)).findFirst().orElseThrow(() -> domain("State 不存在"));
            Map<String, Object> ownerRef = requiredMap(payload, "expected_owner_ref");
            if (!current.ownerTargetKind().name().equals(required(ownerRef, "target_kind")) || !current.ownerElementId().equals(required(ownerRef, "target_id"))) throw domain("State owner 不匹配");
            Map<String, Object> changes = requiredMap(payload, "changes");
            if (changes.isEmpty()) throw domain("State 更新至少需要一个字段");
            String name = optional(changes, "name_or_value");
            List<SemanticRevision.StateRole> roles = changes.containsKey("state_roles") ? stateRoles(changes) : current.roles();
            for (int index = 0; index < states.size(); index++) {
                if (states.get(index).id().equals(stateId)) states.set(index, new SemanticRevision.State(stateId, current.ownerTargetKind(), current.ownerElementId(), current.capability(), qualifiedName(name == null ? current.name().localName() : name), roles, current.source(), current.normalization()));
            }
        } else if ("UPDATE_FACT".equals(type)) {
            if (!payload.containsKey("expected_capability_ref")) throw profileForbidden();
            String factId = required(payload, "fact_id");
            SemanticRevision.Fact current = facts.stream().filter(fact -> fact.id().equals(factId)).findFirst().orElseThrow(() -> domain("Fact 不存在"));
            if (StructuralLinkCatalog.find(current.capability().capabilityId()).isPresent()) {
                updateStructuralFact(projectId, modelId, base, payload, facts);
            } else {
                updateProceduralFact(projectId, modelId, base, payload, facts);
            }
        } else if ("DELETE_CONSTRUCT".equals(type)) {
            if (!"STATE".equals(required(payload, "construct_kind"))) throw profileForbidden();
            String stateId = required(payload, "construct_id");
            SemanticRevision.State state = states.stream().filter(item -> item.id().equals(stateId)).findFirst().orElseThrow(() -> domain("State 不存在"));
            if (!deleteStateToken(base, stateId).equals(required(payload, "impact_token"))) throw domain("State 删除 impact token 已过期或不匹配");
            if (stateHasFactReferences(base, stateId)) throw domain("State 已被 Fact 引用，不能删除");
            states.removeIf(item -> item.id().equals(stateId));
            if (state.ownerTargetKind() == SemanticRevision.TargetKind.ELEMENT) replaceElementStateIds(elements, state.ownerElementId(), elements.stream().filter(item -> item.id().equals(state.ownerElementId())).findFirst().orElseThrow().stateIds().stream().filter(id -> !id.equals(stateId)).toList());
            removeStateOccurrences(base.rootContextId(), stateId, contexts, occurrences, layouts);
            presentations.removeIf(item -> item.stateId().equals(stateId));
        } else if ("STATE_EXPLICIT".equals(type) || "STATE_SUPPRESS".equals(type) || "UNFOLD".equals(type) || "FOLD".equals(type)) {
            String contextId = required(payload, "context_id");
            String stateId = required(payload, "state_id");
            if (!base.rootContextId().equals(contextId) || contexts.stream().noneMatch(context -> context.id().equals(contextId))) throw domain("State presentation Context 不存在或不可编辑");
            if (states.stream().noneMatch(state -> state.id().equals(stateId))) throw domain("State 不存在");
            SemanticRevision.StatePresentation current = presentations.stream()
                    .filter(presentation -> presentation.contextId().equals(contextId) && presentation.stateId().equals(stateId))
                    .findFirst()
                    .orElse(new SemanticRevision.StatePresentation(contextId, stateId, SemanticRevision.StateExplicitness.EXPLICIT, SemanticRevision.StateFoldState.UNFOLDED));
            SemanticRevision.StateExplicitness explicitness = "STATE_SUPPRESS".equals(type)
                    ? SemanticRevision.StateExplicitness.SUPPRESSED
                    : "STATE_EXPLICIT".equals(type) ? SemanticRevision.StateExplicitness.EXPLICIT : current.explicitness();
            SemanticRevision.StateFoldState foldState = "FOLD".equals(type)
                    ? SemanticRevision.StateFoldState.FOLDED
                    : "UNFOLD".equals(type) ? SemanticRevision.StateFoldState.UNFOLDED : current.foldState();
            replaceStatePresentation(presentations, new SemanticRevision.StatePresentation(contextId, stateId, explicitness, foldState));
            if (explicitness == SemanticRevision.StateExplicitness.SUPPRESSED) {
                removeStateOccurrences(contextId, stateId, contexts, occurrences, layouts);
            } else if (occurrences.stream().noneMatch(occurrence -> occurrence.contextId().equals(contextId)
                    && occurrence.targetKind() == SemanticRevision.TargetKind.STATE && occurrence.targetId().equals(stateId))) {
                appendOccurrence(base, stateId, SemanticRevision.TargetKind.STATE, "STATE_NODE", payload, contexts, occurrences, layouts);
            }
        } else throw profileForbidden();
        return new SemanticRevision(revisionId, base.modelId(), base.revisionSequence() + 1, base.profileBinding(), base.rootContextId(), elements, features, states, facts, contexts, occurrences, layouts, presentations);
    }

    private void appendOccurrence(SemanticRevision base, String targetId, SemanticRevision.TargetKind targetKind, String role, Map<String, Object> payload,
                                  List<SemanticRevision.Context> contexts, List<SemanticRevision.Occurrence> occurrences, List<SemanticRevision.Layout> layouts) {
        String occurrenceId = newId("occurrence"); String layoutId = newId("layout"); Map<String, Object> layout = map(payload.get("layout"));
        double x = decimal(layout.get("x"), 80); double y = decimal(layout.get("y"), 80); double width = decimal(layout.get("width"), targetKind == SemanticRevision.TargetKind.STATE ? 88 : 160); double height = decimal(layout.get("height"), targetKind == SemanticRevision.TargetKind.FACT ? 2 : targetKind == SemanticRevision.TargetKind.STATE ? 28 : 72);
        occurrences.add(new SemanticRevision.Occurrence(occurrenceId, base.rootContextId(), targetKind, targetId, SemanticRevision.OccurrenceOwnership.OWNED, role, layoutId));
        layouts.add(new SemanticRevision.Layout(layoutId, x, y, width, height, layouts.size() + 1));
        for (int index = 0; index < contexts.size(); index++) {
            SemanticRevision.Context context = contexts.get(index);
            if (context.id().equals(base.rootContextId())) contexts.set(index, new SemanticRevision.Context(context.id(), context.kind(), context.capability(), context.name(), append(context.occurrenceIds(), occurrenceId), context.source()));
        }
    }

    private void createProceduralFact(
            String projectId,
            String modelId,
            SemanticRevision base,
            Map<String, Object> payload,
            List<SemanticRevision.Fact> facts,
            List<SemanticRevision.Context> contexts,
            List<SemanticRevision.Occurrence> occurrences,
            List<SemanticRevision.Layout> layouts) {
        Map<String, Object> capabilityRef = requiredMap(payload, "capability_ref");
        String capabilityId = required(capabilityRef, "capability_id");
        ProceduralLinkCatalog.Descriptor descriptor = ProceduralLinkCatalog.find(capabilityId).orElseThrow(this::profileForbidden);
        if (!descriptor.family().name().equals(required(payload, "fact_family")) || !"DIRECTED".equals(required(payload, "direction"))) {
            throw domain("过程关系的 Fact family 或方向不符合 Capability");
        }
        List<Map<String, Object>> endpointInputs = objectList(payload.get("normalized_endpoints"), "normalized_endpoints");
        List<ProceduralTarget> selected = endpointInputs.stream().map(input -> {
            Map<String, Object> targetRef = requiredMap(input, "target_ref");
            return proceduralTarget(base, required(targetRef, "target_id"));
        }).toList();
        if (selected.stream().anyMatch(java.util.Objects::isNull)) throw domain("过程关系端点必须引用当前修订中的 Object、State 或 Process");
        validateProceduralFactOption(projectId, modelId, base, payload, "CREATE_FACT", null, capabilityId,
                selected.stream().map(ProceduralTarget::id).toList());
        List<ApiEdtContract.NormalizedEndpoint> normalized = normalizeProceduralEndpoints(descriptor, selected)
                .orElseThrow(() -> domain("过程关系端点不符合 Capability"));
        if (descriptor.sameProcessRequired() && !normalized.getFirst().targetRef().targetId().equals(normalized.get(1).targetRef().targetId())) {
            throw domain("Self-invocation 必须引用同一稳定 Process 标识");
        }
        String requestedId = optional(payload, "fact_id");
        String id = requestedId == null ? newId("fact.procedural") : requestedId;
        stableId(id);
        if (facts.stream().anyMatch(fact -> fact.id().equals(id))) throw domain("Fact 标识已存在");
        List<SemanticRevision.Modifier> modifiers = proceduralModifiers(payload, descriptor);
        List<SemanticRevision.Endpoint> endpoints = normalized.stream().map(endpoint -> new SemanticRevision.Endpoint(
                newId("endpoint"), endpoint.role(), SemanticRevision.TargetKind.valueOf(endpoint.targetRef().targetKind()), endpoint.targetRef().targetId(), endpoint.ordinal(), endpoint.stateQualification())).toList();
        facts.add(new SemanticRevision.Fact(id, descriptor.family(), capability(capabilityId), endpoints, SemanticRevision.Direction.DIRECTED, modifiers,
                source(descriptor.displayName().replace(" ", "")), core()));
        appendOccurrence(base, id, SemanticRevision.TargetKind.FACT, "PROCEDURAL_LINK", payload, contexts, occurrences, layouts);
    }

    private void createStructuralFact(
            String projectId,
            String modelId,
            SemanticRevision base,
            Map<String, Object> payload,
            List<SemanticRevision.Fact> facts,
            List<SemanticRevision.Context> contexts,
            List<SemanticRevision.Occurrence> occurrences,
            List<SemanticRevision.Layout> layouts) {
        String capabilityId = required(requiredMap(payload, "capability_ref"), "capability_id");
        StructuralLinkCatalog.Descriptor descriptor = StructuralLinkCatalog.find(capabilityId).orElseThrow(this::profileForbidden);
        if (!"STRUCTURAL".equals(required(payload, "fact_family"))) throw domain("结构关系必须使用 STRUCTURAL Fact family");
        List<Map<String, Object>> inputs = objectList(payload.get("normalized_endpoints"), "normalized_endpoints");
        List<StructuralTarget> selected = inputs.stream().map(input -> structuralTarget(base, required(requiredMap(input, "target_ref"), "target_id"))).toList();
        if (selected.stream().anyMatch(java.util.Objects::isNull)) throw domain("结构关系端点必须引用当前修订中的 Object、Process 或 State");
        validateStructuralFactOption(projectId, modelId, base, payload, "CREATE_FACT", null, capabilityId, selected.stream().map(StructuralTarget::id).toList());
        List<ApiEdtContract.NormalizedEndpoint> normalized = normalizeStructuralEndpoints(descriptor, selected)
                .orElseThrow(() -> domain("结构关系端点不符合 Capability"));
        List<SemanticRevision.Label> labels = labels(payload, descriptor);
        SemanticRevision.Direction direction = structuralDirection(payload, descriptor, labels);
        String requestedId = optional(payload, "fact_id");
        String id = requestedId == null ? newId("fact.structural") : requestedId;
        stableId(id);
        if (facts.stream().anyMatch(fact -> fact.id().equals(id))) throw domain("Fact 标识已存在");
        List<SemanticRevision.Endpoint> endpoints = structuralEndpoints(normalized);
        facts.add(new SemanticRevision.Fact(id, SemanticRevision.FactFamily.STRUCTURAL, capability(capabilityId), endpoints, direction, List.of(),
                labels, structuralCompleteness(payload, descriptor), source(descriptor.displayName().replace(" ", "")), core()));
        appendOccurrence(base, id, SemanticRevision.TargetKind.FACT, "STRUCTURAL_LINK", payload, contexts, occurrences, layouts);
    }

    private List<SemanticRevision.Modifier> proceduralModifiers(Map<String, Object> payload, ProceduralLinkCatalog.Descriptor descriptor) {
        List<Map<String, Object>> values = objectList(payload.getOrDefault("modifiers", List.of()), "modifiers");
        List<SemanticRevision.Modifier> result = values.stream().map(value -> new SemanticRevision.Modifier(required(value, "modifier_id"), required(value, "value"))).toList();
        if (!descriptor.durationRequired()) return result;
        String duration = result.stream().filter(value -> "duration".equals(value.id())).map(SemanticRevision.Modifier::value).findFirst()
                .orElseThrow(() -> domain("Exception Link 必须包含 duration"));
        try {
            java.time.Duration parsed = java.time.Duration.parse(duration);
            if (parsed.isZero() || parsed.isNegative()) throw domain("Exception Link 的 duration 必须为正 ISO-8601 Duration");
        } catch (java.time.format.DateTimeParseException exception) {
            throw domain("Exception Link 的 duration 必须为 ISO-8601 Duration");
        }
        return result;
    }

    private void updateProceduralFact(String projectId, String modelId, SemanticRevision base, Map<String, Object> payload, List<SemanticRevision.Fact> facts) {
        String factId = required(payload, "fact_id");
        SemanticRevision.Fact current = facts.stream().filter(fact -> fact.id().equals(factId)).findFirst().orElseThrow(() -> domain("Fact 不存在"));
        Map<String, Object> expected = requiredMap(payload, "expected_capability_ref");
        if (!current.capability().capabilityId().equals(required(expected, "capability_id"))) throw domain("Fact Capability 不匹配");
        ProceduralLinkCatalog.Descriptor descriptor = ProceduralLinkCatalog.find(current.capability().capabilityId()).orElseThrow(this::profileForbidden);
        Map<String, Object> replacement = requiredMap(payload, "replacement");
        List<String> selectedEndpoints = replacement.containsKey("normalized_endpoints")
                ? objectList(replacement.get("normalized_endpoints"), "replacement.normalized_endpoints").stream()
                        .map(endpoint -> required(requiredMap(endpoint, "target_ref"), "target_id")).toList()
                : current.endpoints().stream().map(SemanticRevision.Endpoint::targetId).toList();
        List<SemanticRevision.Endpoint> endpoints = replacement.containsKey("normalized_endpoints")
                ? normalizedFactEndpoints(base, descriptor, objectList(replacement.get("normalized_endpoints"), "replacement.normalized_endpoints")) : current.endpoints();
        List<SemanticRevision.Modifier> modifiers;
        if (replacement.containsKey("modifiers") && containsControlModifier(objectList(replacement.get("modifiers"), "replacement.modifiers"))) {
            ControlLinkCatalog.Descriptor control = controlDescriptor(replacement);
            validateControlFactOption(projectId, modelId, base, payload, factId, current.capability().capabilityId(), selectedEndpoints, control);
            modifiers = controlModifiers(replacement, control);
        } else {
            validateProceduralFactOption(projectId, modelId, base, payload, "UPDATE_FACT", factId, descriptor.capabilityId(), selectedEndpoints);
            modifiers = replacement.containsKey("modifiers")
                    ? proceduralModifiers(Map.of("modifiers", replacement.get("modifiers")), descriptor) : current.modifiers();
        }
        if (descriptor.durationRequired() && modifiers.stream().noneMatch(modifier -> "duration".equals(modifier.id()))) throw domain("Exception Link 必须包含 duration");
        for (int index = 0; index < facts.size(); index++) {
            if (facts.get(index).id().equals(factId)) {
                facts.set(index, new SemanticRevision.Fact(current.id(), current.family(), current.capability(), endpoints, current.direction(), modifiers, current.source(), current.normalization()));
                return;
            }
        }
    }

    private List<SemanticRevision.Endpoint> normalizedFactEndpoints(SemanticRevision base, ProceduralLinkCatalog.Descriptor descriptor, List<Map<String, Object>> endpointInputs) {
        List<ProceduralTarget> selected = endpointInputs.stream().map(input -> proceduralTarget(base, required(requiredMap(input, "target_ref"), "target_id"))).toList();
        if (selected.stream().anyMatch(java.util.Objects::isNull)) throw domain("过程关系端点必须引用当前修订中的 Object、State 或 Process");
        List<ApiEdtContract.NormalizedEndpoint> normalized = normalizeProceduralEndpoints(descriptor, selected).orElseThrow(() -> domain("过程关系端点不符合 Capability"));
        return normalized.stream().map(endpoint -> new SemanticRevision.Endpoint(newId("endpoint"), endpoint.role(),
                SemanticRevision.TargetKind.valueOf(endpoint.targetRef().targetKind()), endpoint.targetRef().targetId(), endpoint.ordinal(), endpoint.stateQualification())).toList();
    }

    private void updateStructuralFact(String projectId, String modelId, SemanticRevision base, Map<String, Object> payload, List<SemanticRevision.Fact> facts) {
        String factId = required(payload, "fact_id");
        SemanticRevision.Fact current = facts.stream().filter(fact -> fact.id().equals(factId)).findFirst().orElseThrow(() -> domain("Fact 不存在"));
        Map<String, Object> expected = requiredMap(payload, "expected_capability_ref");
        if (!current.capability().capabilityId().equals(required(expected, "capability_id"))) throw domain("Fact Capability 不匹配");
        StructuralLinkCatalog.Descriptor descriptor = StructuralLinkCatalog.find(current.capability().capabilityId()).orElseThrow(this::profileForbidden);
        Map<String, Object> replacement = requiredMap(payload, "replacement");
        List<StructuralTarget> selected = replacement.containsKey("normalized_endpoints")
                ? objectList(replacement.get("normalized_endpoints"), "replacement.normalized_endpoints").stream()
                        .map(endpoint -> structuralTarget(base, required(requiredMap(endpoint, "target_ref"), "target_id"))).toList()
                : current.endpoints().stream().map(endpoint -> structuralTarget(base, endpoint.targetId())).toList();
        if (selected.stream().anyMatch(java.util.Objects::isNull)) throw domain("结构关系端点必须引用当前修订中的 Object、Process 或 State");
        validateStructuralFactOption(projectId, modelId, base, payload, "UPDATE_FACT", factId, descriptor.capabilityId(), selected.stream().map(StructuralTarget::id).toList());
        List<ApiEdtContract.NormalizedEndpoint> normalized = normalizeStructuralEndpoints(descriptor, selected)
                .orElseThrow(() -> domain("结构关系端点不符合 Capability"));
        List<SemanticRevision.Label> labels = replacement.containsKey("labels") ? labels(replacement, descriptor) : current.labels();
        SemanticRevision.CollectionCompleteness completeness = replacement.containsKey("collection_completeness")
                ? structuralCompleteness(replacement, descriptor) : current.collectionCompleteness();
        SemanticRevision.Direction direction = descriptor.direction() == SemanticRevision.Direction.PROFILE_DEFINED
                ? structuralDirection(replacement.containsKey("direction") ? replacement : Map.of("direction", current.direction().name()), descriptor, labels)
                : descriptor.direction();
        for (int index = 0; index < facts.size(); index++) {
            if (facts.get(index).id().equals(factId)) {
                facts.set(index, new SemanticRevision.Fact(current.id(), current.family(), current.capability(), structuralEndpoints(normalized), direction,
                        current.modifiers(), labels, completeness, current.source(), current.normalization()));
                return;
            }
        }
    }

    private List<SemanticRevision.Endpoint> structuralEndpoints(List<ApiEdtContract.NormalizedEndpoint> normalized) {
        return normalized.stream().map(endpoint -> new SemanticRevision.Endpoint(newId("endpoint"), endpoint.role(),
                SemanticRevision.TargetKind.valueOf(endpoint.targetRef().targetKind()), endpoint.targetRef().targetId(), endpoint.ordinal(), endpoint.stateQualification())).toList();
    }

    private List<SemanticRevision.Label> labels(Map<String, Object> source, StructuralLinkCatalog.Descriptor descriptor) {
        List<Map<String, Object>> values = objectList(source.getOrDefault("labels", List.of()), "labels");
        Map<String, String> bySlot = new LinkedHashMap<>();
        for (Map<String, Object> value : values) {
            String slot = required(value, "slot_id");
            if (!descriptor.labelSlots().contains(slot)) throw domain("结构关系标签槽位不受当前 Capability 支持");
            if (bySlot.put(slot, required(value, "text")) != null) throw domain("结构关系标签槽位不能重复");
        }
        if (descriptor.labelsRequired() && descriptor.direction() != SemanticRevision.Direction.PROFILE_DEFINED
                && !bySlot.keySet().containsAll(descriptor.labelSlots())) throw domain("结构关系缺少必填标签槽位");
        return bySlot.entrySet().stream().map(entry -> new SemanticRevision.Label(entry.getKey(), entry.getValue())).toList();
    }

    private SemanticRevision.CollectionCompleteness structuralCompleteness(Map<String, Object> source, StructuralLinkCatalog.Descriptor descriptor) {
        String value = optional(source, "collection_completeness");
        if (descriptor.completenessSupported()) {
            if (!"COMPLETE".equals(value) && !"INCOMPLETE".equals(value)) throw domain("该结构 fan 必须声明 COMPLETE 或 INCOMPLETE");
            return SemanticRevision.CollectionCompleteness.valueOf(value);
        }
        if (value != null && !"NOT_APPLICABLE".equals(value)) throw domain("该结构关系不支持完整性标记");
        return SemanticRevision.CollectionCompleteness.NOT_APPLICABLE;
    }

    private SemanticRevision.Direction structuralDirection(Map<String, Object> source, StructuralLinkCatalog.Descriptor descriptor, List<SemanticRevision.Label> labels) {
        String value = required(source, "direction");
        if (descriptor.direction() != SemanticRevision.Direction.PROFILE_DEFINED) {
            if (!descriptor.direction().name().equals(value)) throw domain("结构关系方向不符合 Capability");
            return descriptor.direction();
        }
        SemanticRevision.Direction direction;
        try {
            direction = SemanticRevision.Direction.valueOf(value);
        } catch (IllegalArgumentException exception) {
            throw domain("State-specified Tagged 方向不受支持");
        }
        if (direction != SemanticRevision.Direction.DIRECTED && direction != SemanticRevision.Direction.BIDIRECTIONAL) throw domain("State-specified Tagged 方向不受支持");
        boolean hasForward = labels.stream().anyMatch(label -> "forward_tag".equals(label.slotId()));
        boolean hasReverse = labels.stream().anyMatch(label -> "reverse_tag".equals(label.slotId()));
        if (!hasForward || direction == SemanticRevision.Direction.BIDIRECTIONAL != hasReverse) throw domain("State-specified Tagged 的标签与方向不匹配");
        return direction;
    }

    private void validateProceduralFactOption(String projectId, String modelId, SemanticRevision base, Map<String, Object> payload,
                                              String intent, String selectionId, String capabilityId, List<String> endpointIds) {
        String queryId = capabilityQueryId(projectId, modelId, base.revisionId(), selectionId, intent, endpointIds);
        if (!queryId.equals(required(payload, "capability_query_id"))
                || !proceduralFactOptionId(queryId, capabilityId).equals(required(payload, "selected_option_id"))) {
            throw domain("过程关系候选项已过期或不匹配");
        }
    }

    private void validateStructuralFactOption(String projectId, String modelId, SemanticRevision base, Map<String, Object> payload,
                                              String intent, String selectionId, String capabilityId, List<String> endpointIds) {
        String queryId = capabilityQueryId(projectId, modelId, base.revisionId(), selectionId, intent, endpointIds);
        if (!queryId.equals(required(payload, "capability_query_id"))
                || !structuralFactOptionId(queryId, capabilityId).equals(required(payload, "selected_option_id"))) {
            throw domain("结构关系候选项已过期或不匹配");
        }
    }

    private void validateFeatureCreateOption(String projectId, String modelId, SemanticRevision base, Map<String, Object> payload,
                                             String ownerId, String capabilityId) {
        String queryId = capabilityQueryId(projectId, modelId, base.revisionId(), ownerId, "CREATE_FEATURE", List.of());
        String kind = required(payload, "feature_kind");
        String optionId = "option.feature." + kind.toLowerCase() + "." + digest(queryId).substring(0, 16);
        if (!queryId.equals(required(payload, "capability_query_id")) || !optionId.equals(required(payload, "selected_option_id"))) {
            throw domain("Feature 候选项已过期或不匹配");
        }
        if (!("CAP-FEAT-ATTRIBUTE-001".equals(capabilityId) || "CAP-FEAT-OPERATION-001".equals(capabilityId))) throw profileForbidden();
    }

    private String capabilityQueryId(String projectId, String modelId, String revisionId, String selectionId, String intent, List<String> endpointIds) {
        List<String> canonicalEndpoints = endpointIds.stream().sorted().toList();
        return "capability.query." + digest(projectId + ":" + modelId + ":" + revisionId + ":" + (selectionId == null ? "" : selectionId)
                + ":" + (intent == null ? "" : intent) + ":" + String.join(":", canonicalEndpoints)).substring(0, 32);
    }

    private String proceduralFactOptionId(String queryId, String capabilityId) {
        return "option.fact." + digest(queryId + ":" + capabilityId).substring(0, 24);
    }

    private String structuralFactOptionId(String queryId, String capabilityId) {
        return "option.structural." + digest(queryId + ":" + capabilityId).substring(0, 24);
    }

    private void validateControlFactOption(String projectId, String modelId, SemanticRevision base, Map<String, Object> payload,
                                           String factId, String baseCapabilityId, List<String> endpointIds, ControlLinkCatalog.Descriptor control) {
        if (!control.baseCapabilityIds().contains(baseCapabilityId)) throw domain("Control Capability 与基础 Fact 不匹配");
        String queryId = capabilityQueryId(projectId, modelId, base.revisionId(), factId, "UPDATE_FACT", endpointIds);
        if (!queryId.equals(required(payload, "capability_query_id"))
                || !controlFactOptionId(queryId, control.capabilityId()).equals(required(payload, "selected_option_id"))) {
            throw domain("Control 候选项已过期或不匹配");
        }
    }

    private String controlFactOptionId(String queryId, String capabilityId) {
        return "option.control." + digest(queryId + ":" + capabilityId).substring(0, 24);
    }

    private boolean containsControlModifier(List<Map<String, Object>> modifiers) {
        return modifiers.stream().anyMatch(modifier -> ControlLinkCatalog.CONTROL_CAPABILITY_MODIFIER.equals(optional(modifier, "modifier_id"))
                || ControlLinkCatalog.CONTROL_SEGMENT_MODIFIER.equals(optional(modifier, "modifier_id")));
    }

    private ControlLinkCatalog.Descriptor controlDescriptor(Map<String, Object> replacement) {
        List<Map<String, Object>> modifiers = objectList(replacement.get("modifiers"), "replacement.modifiers");
        List<String> values = modifiers.stream()
                .filter(modifier -> ControlLinkCatalog.CONTROL_CAPABILITY_MODIFIER.equals(optional(modifier, "modifier_id")))
                .map(modifier -> required(modifier, "value"))
                .toList();
        if (values.size() != 1) throw domain("Control Modifier 必须包含唯一 control.capability");
        return ControlLinkCatalog.find(values.getFirst()).orElseThrow(() -> domain("Control Capability 不受当前 Profile 支持"));
    }

    private List<SemanticRevision.Modifier> controlModifiers(Map<String, Object> replacement, ControlLinkCatalog.Descriptor control) {
        List<Map<String, Object>> values = objectList(replacement.get("modifiers"), "replacement.modifiers");
        if (values.size() != 2) throw domain("Control Modifier 必须为完整原子对");
        Map<String, String> controls = new LinkedHashMap<>();
        for (Map<String, Object> value : values) {
            String modifierId = required(value, "modifier_id");
            String modifierValue = required(value, "value");
            if (!ControlLinkCatalog.CONTROL_CAPABILITY_MODIFIER.equals(modifierId) && !ControlLinkCatalog.CONTROL_SEGMENT_MODIFIER.equals(modifierId)) {
                throw domain("Control Modifier 包含不受支持字段");
            }
            if (controls.put(modifierId, modifierValue) != null) throw domain("Control Modifier 不能重复");
        }
        if (!control.capabilityId().equals(controls.get(ControlLinkCatalog.CONTROL_CAPABILITY_MODIFIER))
                || !ControlLinkCatalog.PROCESS_INPUT.equals(controls.get(ControlLinkCatalog.CONTROL_SEGMENT_MODIFIER))) {
            throw domain("Control Modifier 值或 Process 输入段不匹配");
        }
        return List.of(
                new SemanticRevision.Modifier(ControlLinkCatalog.CONTROL_CAPABILITY_MODIFIER, control.capabilityId()),
                new SemanticRevision.Modifier(ControlLinkCatalog.CONTROL_SEGMENT_MODIFIER, ControlLinkCatalog.PROCESS_INPUT));
    }

    private void replaceElementStateIds(List<SemanticRevision.Element> elements, String elementId, List<String> stateIds) {
        for (int index = 0; index < elements.size(); index++) {
            SemanticRevision.Element element = elements.get(index);
            if (element.id().equals(elementId)) {
                elements.set(index, new SemanticRevision.Element(element.id(), element.coreKind(), element.capability(), element.name(), element.featureIds(), stateIds, element.source(), element.normalization()));
                return;
            }
        }
        throw domain("State owner 不存在");
    }

    private void replaceElementFeatureIds(List<SemanticRevision.Element> elements, String elementId, List<String> featureIds) {
        for (int index = 0; index < elements.size(); index++) {
            SemanticRevision.Element element = elements.get(index);
            if (element.id().equals(elementId)) {
                elements.set(index, new SemanticRevision.Element(element.id(), element.coreKind(), element.capability(), element.name(), featureIds, element.stateIds(), element.source(), element.normalization()));
                return;
            }
        }
        throw domain("Feature owner 不存在");
    }

    private void replaceStatePresentation(List<SemanticRevision.StatePresentation> presentations, SemanticRevision.StatePresentation replacement) {
        for (int index = 0; index < presentations.size(); index++) {
            SemanticRevision.StatePresentation current = presentations.get(index);
            if (current.contextId().equals(replacement.contextId()) && current.stateId().equals(replacement.stateId())) {
                presentations.set(index, replacement);
                return;
            }
        }
        presentations.add(replacement);
    }

    private void removeStateOccurrences(String contextId, String stateId, List<SemanticRevision.Context> contexts,
                                        List<SemanticRevision.Occurrence> occurrences, List<SemanticRevision.Layout> layouts) {
        List<String> removedOccurrenceIds = occurrences.stream()
                .filter(occurrence -> occurrence.contextId().equals(contextId) && occurrence.targetKind() == SemanticRevision.TargetKind.STATE && occurrence.targetId().equals(stateId))
                .map(SemanticRevision.Occurrence::id).toList();
        List<String> removedLayoutIds = occurrences.stream().filter(occurrence -> removedOccurrenceIds.contains(occurrence.id()))
                .map(SemanticRevision.Occurrence::layoutId).toList();
        occurrences.removeIf(occurrence -> removedOccurrenceIds.contains(occurrence.id()));
        layouts.removeIf(layout -> removedLayoutIds.contains(layout.id()));
        for (int index = 0; index < contexts.size(); index++) {
            SemanticRevision.Context context = contexts.get(index);
            if (context.id().equals(contextId)) {
                contexts.set(index, new SemanticRevision.Context(context.id(), context.kind(), context.capability(), context.name(),
                        context.occurrenceIds().stream().filter(id -> !removedOccurrenceIds.contains(id)).toList(), context.source()));
            }
        }
    }

    private boolean stateHasFactReferences(SemanticRevision revision, String stateId) {
        return revision.facts().stream().anyMatch(fact -> fact.endpoints().stream().anyMatch(endpoint ->
                endpoint.targetKind() == SemanticRevision.TargetKind.STATE && endpoint.targetId().equals(stateId) || stateId.equals(endpoint.stateQualificationId())));
    }

    private String deleteStateToken(SemanticRevision revision, String stateId) {
        int occurrences = (int) revision.occurrences().stream().filter(item -> item.targetKind() == SemanticRevision.TargetKind.STATE && item.targetId().equals(stateId)).count();
        int references = (int) revision.facts().stream().filter(fact -> fact.endpoints().stream().anyMatch(endpoint ->
                endpoint.targetKind() == SemanticRevision.TargetKind.STATE && endpoint.targetId().equals(stateId) || stateId.equals(endpoint.stateQualificationId()))).count();
        return "impact." + digest(revision.revisionId() + ":" + stateId + ":" + revision.profileBinding().bindingDigest() + ":" + occurrences + ":" + references);
    }

    private List<SemanticRevision.StateRole> stateRoles(Map<String, Object> values) {
        Object raw = values.get("state_roles");
        if (!(raw instanceof List<?> roles)) throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "state_roles 必须是数组");
        try {
            return roles.stream().map(value -> SemanticRevision.StateRole.valueOf(requiredText(value, "state_roles"))).toList();
        } catch (IllegalArgumentException exception) {
            throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "state_roles 包含非法角色");
        }
    }

    private String requiredText(Object value, String key) {
        if (value instanceof String text && !text.isBlank()) return text;
        throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "缺少字段 " + key);
    }

    private SemanticRevision initialRevision(String modelId, String revisionId, String contextId) {
        SemanticRevision.Context context = new SemanticRevision.Context(contextId, SemanticRevision.ContextKind.SYSTEM_DIAGRAM, capability("CAP-CONTEXT-001"), qualifiedName("SD"), List.of(), source("SystemDiagram"));
        return new SemanticRevision(revisionId, modelId, 1, profileBinding(), contextId, List.of(), List.of(), List.of(), List.of(context), List.of(), List.of());
    }

    private ModelRevision currentModel(String projectId, String modelId) {
        try (Connection connection = projectConnection(projectId);
             PreparedStatement statement = connection.prepareStatement("""
                     SELECT m.model_id, m.project_id, m.name, h.draft_head_revision_id, d.profile_id, d.profile_version, d.rule_set_version, d.document_json
                     FROM model_catalog m JOIN model_head h ON h.model_id = m.model_id JOIN revision_document d ON d.revision_id = h.draft_head_revision_id
                     WHERE m.model_id = ? AND m.project_id = ?
                     """)) {
            statement.setString(1, modelId); statement.setString(2, projectId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) throw notFound("模型不存在");
                return new ModelRevision(model(result), readRevision(result.getString(8)));
            }
        } catch (SQLException exception) { throw persistence(exception); }
    }

    private SemanticRevision revision(String projectId, String modelId, String revisionId) {
        try (Connection connection = projectConnection(projectId);
             PreparedStatement statement = connection.prepareStatement("SELECT document_json FROM revision_document WHERE model_id = ? AND revision_id = ?")) {
            statement.setString(1, modelId); statement.setString(2, revisionId);
            try (ResultSet result = statement.executeQuery()) { if (!result.next()) throw notFound("修订不存在"); return readRevision(result.getString(1)); }
        } catch (SQLException exception) { throw persistence(exception); }
    }

    private Connection projectConnection(String projectId) {
        Path path = databaseFactory.databasePath(projectId);
        if (!Files.isRegularFile(path)) throw notFound("项目不存在");
        return connection(path);
    }

    private Connection connection(Path path) {
        try {
            Connection connection = DriverManager.getConnection("jdbc:sqlite:" + path.toAbsolutePath() + "?foreign_keys=on");
            try (var statement = connection.createStatement()) { statement.execute("PRAGMA foreign_keys = ON"); }
            return connection;
        } catch (SQLException exception) { throw persistence(exception); }
    }

    private List<Path> projectDatabases() {
        Path projects = databaseFactory.storageRoot().resolve("projects");
        if (!Files.isDirectory(projects)) return List.of();
        try (var paths = Files.list(projects)) { return paths.map(path -> path.resolve("project.db")).filter(Files::isRegularFile).toList(); }
        catch (Exception exception) { throw persistence(exception); }
    }

    private void installBindingPackages(Connection connection, String now) throws SQLException {
        insertPackage(connection, "INSERT OR IGNORE INTO profile_package(profile_id, package_version, package_digest, lifecycle_status, package_json, installed_at) VALUES (?, ?, ?, 'DRAFT', '{}', ?)", PROFILE_ID, PROFILE_VERSION, PROFILE_DIGEST, now);
        insertPackage(connection, "INSERT OR IGNORE INTO rule_set_package(rule_set_id, rule_set_version, rule_set_digest, lifecycle_status, package_json, installed_at) VALUES (?, ?, ?, 'DRAFT', '{}', ?)", RULE_ID, RULE_VERSION, RULE_DIGEST, now);
        insertPackage(connection, "INSERT OR IGNORE INTO grammar_package(grammar_id, grammar_version, grammar_digest, text_modality, manifest_json, installed_at) VALUES (?, ?, ?, 'OPL', '{}', ?)", GRAMMAR_ID, GRAMMAR_VERSION, GRAMMAR_DIGEST, now);
    }

    private void insertPackage(Connection connection, String sql, String id, String version, String digest, String now) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) { statement.setString(1, id); statement.setString(2, version); statement.setString(3, digest); statement.setString(4, now); statement.executeUpdate(); }
    }

    private void insertInitialRevision(Connection connection, SemanticRevision revision, String now) throws Exception {
        String document = revisionWriter.write(revision);
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO revision_document(revision_id, model_id, revision_sequence, schema_version, profile_id, profile_version, rule_set_id, rule_set_version, schema_set_json, profile_binding_json, document_json, document_digest, commit_reason, created_at)
                VALUES (?, ?, 1, '0.1', ?, ?, ?, ?, '{}', ?, ?, ?, 'INITIAL_MODEL', ?)
                """)) {
            statement.setString(1, revision.revisionId()); statement.setString(2, revision.modelId()); statement.setString(3, PROFILE_ID); statement.setString(4, PROFILE_VERSION); statement.setString(5, RULE_ID); statement.setString(6, RULE_VERSION);
            statement.setString(7, objectMapper.writeValueAsString(Map.of("profile_id", PROFILE_ID, "profile_version", PROFILE_VERSION, "rule_set_id", RULE_ID, "rule_version", RULE_VERSION)));
            statement.setString(8, document); statement.setString(9, digest(document)); statement.setString(10, now); statement.executeUpdate();
        }
    }

    private Map<String, Object> findProjectCreateReplay(String commandId, String digest) {
        for (Path database : projectDatabases()) {
            try (Connection connection = connection(database)) {
                Map<String, Object> replay = replay(connection, "API-PRJ-003", "projects", commandId, digest);
                if (replay != null) return replay;
            } catch (SQLException exception) { throw persistence(exception); }
        }
        return null;
    }

    private Map<String, Object> replay(Connection connection, String operation, String aggregate, String commandId, String digest) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("SELECT request_digest, result_json FROM idempotency_record WHERE operation_id = ? AND aggregate_id = ? AND command_id = ?")) {
            statement.setString(1, operation); statement.setString(2, aggregate); statement.setString(3, commandId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) return null;
                if (!digest.equals(result.getString(1))) throw new ApiException(ApiErrorCode.IDEMPOTENCY_MISMATCH, 409, false, "command_id 已绑定不同请求");
                return map(result.getString(2));
            }
        }
    }

    private void writeIdempotency(Connection connection, String operation, String aggregate, String commandId, String digest, String revision, Map<String, Object> result, String now) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO idempotency_record(operation_id, aggregate_id, command_id, request_digest, result_status, result_revision_id, result_json, created_at) VALUES (?, ?, ?, ?, 'COMMITTED', ?, ?, ?)")) {
            statement.setString(1, operation); statement.setString(2, aggregate); statement.setString(3, commandId); statement.setString(4, digest); statement.setString(5, revision); statement.setString(6, objectMapper.writeValueAsString(result)); statement.setString(7, now); statement.executeUpdate();
        }
    }

    private void writeOperation(Connection connection, String projectId, String modelId, String operation, String aggregate, String commandId, String inputRevision, String resultRevision, String status, String now) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO operation_record(operation_record_id, project_id, model_id, operation_id, aggregate_id, command_id, input_revision_id, result_revision_id, result_status, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")) {
            statement.setString(1, newId("operation")); statement.setString(2, projectId); statement.setString(3, modelId); statement.setString(4, operation); statement.setString(5, aggregate); statement.setString(6, commandId); statement.setString(7, inputRevision); statement.setString(8, resultRevision); statement.setString(9, status); statement.setString(10, now); statement.executeUpdate();
        }
    }

    private boolean hasEvidence(Connection connection, String revisionId, String token) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("SELECT result_json FROM background_task WHERE input_revision_id = ? AND task_type = 'VALIDATE_MODEL' AND state = 'COMPLETED' ORDER BY finished_at DESC")) {
            statement.setString(1, revisionId); try (ResultSet result = statement.executeQuery()) { while (result.next()) { Map<String, Object> value = map(result.getString(1)); if (Integer.valueOf(0).equals(value.get("blocking")) && token.equals(value.get("evidence_summary_token"))) return true; } }
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

    private Map<String, Object> queryResult(String requestId, String revision, String profile, String rule, String freshness, Object data, boolean page) {
        Map<String, Object> meta = new LinkedHashMap<>(); meta.put("request_id", requestId); meta.put("read_revision", revision); meta.put("profile_version", profile); meta.put("rule_version", rule); meta.put("freshness", freshness); meta.put("generated_at", Instant.now().toString()); if (page) { Map<String, Object> pageInfo = new LinkedHashMap<>(); pageInfo.put("next_cursor", null); pageInfo.put("has_more", false); meta.put("page_info", pageInfo); }
        return Map.of("meta", meta, "data", data);
    }

    private Map<String, Object> commandResult(String requestId, String commandId, String status, String revision, String autosave, Object data) {
        Map<String, Object> meta = new LinkedHashMap<>(); meta.put("request_id", requestId); meta.put("command_id", commandId); meta.put("status", status); meta.put("committed_revision", revision); meta.put("autosave_state", autosave); meta.put("projection_state", Map.of("opd", "current", "text", "current", "validation", "current")); return Map.of("meta", meta, "data", data);
    }

    private Map<String, Object> project(ResultSet result) throws SQLException { return Map.of("project_id", result.getString(1), "name", result.getString(2), "description", result.getString(3) == null ? "" : result.getString(3), "archive_state", result.getString(4), "updated_at", result.getString(5), "model_count", result.getInt(6)); }
    private Map<String, Object> model(ResultSet result) throws SQLException { return Map.of("model_id", result.getString(1), "project_id", result.getString(2), "name", result.getString(3), "head_revision", result.getString(4), "profile_id", result.getString(5), "profile_version", result.getString(6), "rule_version", result.getString(7), "access_mode", "EDITABLE_DRAFT"); }
    private SemanticRevision readRevision(String document) { return revisionReader.read(new ByteArrayInputStream(document.getBytes(StandardCharsets.UTF_8))); }
    private SemanticRevision.Context context(SemanticRevision revision, String contextId) { return revision.contexts().stream().filter(value -> value.id().equals(contextId)).findFirst().orElseThrow(() -> notFound("Context 不存在")); }
    private boolean isConsumptionCapability(String capabilityId) { return "CAP-CONSUMPTION-001".equals(capabilityId) || ProceduralLinkCatalog.CONSUMPTION.equals(capabilityId) || "CAP-ISO-PROC-006".equals(capabilityId); }
    private String freshness(String projectId, String modelId, String revisionId) { return currentModel(projectId, modelId).revision().revisionId().equals(revisionId) ? "current" : "historical"; }
    private Map<String, String> labels(SemanticRevision revision) { Map<String, String> result = new LinkedHashMap<>(); revision.elements().forEach(value -> result.put(value.id(), value.name().localName())); revision.features().forEach(value -> result.put(value.id(), value.name().localName())); revision.states().forEach(value -> result.put(value.id(), value.name().localName())); revision.facts().forEach(value -> result.put(value.id(), value.id())); return result; }
    private List<String> affectedIds(SemanticRevision revision) { List<String> ids = new ArrayList<>(); revision.elements().forEach(value -> ids.add(value.id())); revision.facts().forEach(value -> ids.add(value.id())); return ids; }
    private void validateBinding(Map<String, Object> binding) { if (!PROFILE_ID.equals(required(binding, "profile_id")) || !PROFILE_VERSION.equals(required(binding, "profile_version")) || !RULE_ID.equals(required(binding, "rule_set_id")) || !RULE_VERSION.equals(required(binding, "rule_version"))) throw new ApiException(ApiErrorCode.RULE_VERSION_CONFLICT, 409, false, "Profile 或 Rule 版本不匹配"); }
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
    private SemanticRevision.CapabilityReference capability(String id) { return new SemanticRevision.CapabilityReference(id, PROFILE_ID, PROFILE_VERSION); }
    private SemanticRevision.QualifiedName qualifiedName(String localName) { return new SemanticRevision.QualifiedName("urn:opm:runtime", localName); }
    private SemanticRevision.SourceProvenance source(String kind) { return new SemanticRevision.SourceProvenance(PROFILE_ID, PROFILE_VERSION, kind, "profile." + kind.toLowerCase()); }
    private SemanticRevision.Normalization core() { return new SemanticRevision.Normalization(SemanticRevision.NormalizationLevel.CORE); }
    private ApiException rejected(CommitFailureCode code) { return switch (code) { case REVISION_CONFLICT -> new ApiException(ApiErrorCode.REVISION_CONFLICT, 409, false, "基础修订不是当前草稿"); case READ_ONLY_REVISION -> new ApiException(ApiErrorCode.READ_ONLY_REVISION, 409, false, "当前修订为只读"); case IDEMPOTENCY_MISMATCH -> new ApiException(ApiErrorCode.IDEMPOTENCY_MISMATCH, 409, false, "command_id 已绑定不同请求"); case RULE_VERSION_CONFLICT -> new ApiException(ApiErrorCode.RULE_VERSION_CONFLICT, 409, false, "Profile 或 Rule 版本不匹配"); case VALIDATION_BLOCKED -> new ApiException(ApiErrorCode.VALIDATION_BLOCKED, 422, false, "候选修订未通过校验"); case MODIFIER_COMBINATION_INVALID -> new ApiException(ApiErrorCode.MODIFIER_COMBINATION_INVALID, 422, false, "Control 修饰组合无效"); case TEXT_GENERATION_BLOCKED -> new ApiException(ApiErrorCode.TEXT_GENERATION_BLOCKED, 422, false, "无法生成 OPL 文本"); default -> new ApiException(ApiErrorCode.PERSISTENCE_FAILED, 500, true, "修订提交失败"); }; }
    private ApiException profileForbidden() { return new ApiException(ApiErrorCode.PROFILE_FORBIDDEN, 422, false, "当前 Profile 不支持该 P0 命令"); }
    private ApiException domain(String message) { return new ApiException(ApiErrorCode.DOMAIN_REJECTED, 422, false, message); }
    private ApiException notFound(String message) { return new ApiException(ApiErrorCode.NOT_FOUND, 404, false, message); }
    private ApiException persistence(Exception exception) { return new ApiException(ApiErrorCode.PERSISTENCE_FAILED, 500, true, "本地持久化失败"); }
    private String requestDigest(Map<String, Object> request) { try { return digest(objectMapper.writeValueAsString(request)); } catch (Exception exception) { throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "请求无法序列化"); } }
    private record ProceduralTarget(ProceduralLinkCatalog.Kind kind, SemanticRevision.TargetKind targetKind, String id) { }

    private record StructuralTarget(SemanticRevision.CoreKind coreKind, SemanticRevision.TargetKind targetKind, String id, boolean featureValueState) { }
    private String newId(String prefix) { return prefix + "." + UUID.randomUUID().toString().replace("-", ""); }
    private String normalized(String value) { return value.trim().toLowerCase(java.util.Locale.ROOT); }
    private String required(Map<String, Object> values, String key) { String value = optional(values, key); if (value == null) throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "缺少字段 " + key); return value; }
    private String optional(Map<String, Object> values, String key) { Object value = values.get(key); return value instanceof String text && !text.isBlank() ? text : null; }
    @SuppressWarnings("unchecked") private Map<String, Object> requiredMap(Map<String, Object> values, String key) { Object value = values.get(key); if (!(value instanceof Map<?, ?>)) throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "缺少对象字段 " + key); return (Map<String, Object>) value; }
    @SuppressWarnings("unchecked") private List<Map<String, Object>> objectList(Object value, String key) {
        if (!(value instanceof List<?> values)) throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, key + " 必须是数组");
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : values) {
            if (!(item instanceof Map<?, ?>)) throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, key + " 必须仅包含对象");
            result.add((Map<String, Object>) item);
        }
        return List.copyOf(result);
    }
    @SuppressWarnings("unchecked") private Map<String, Object> map(Object value) { if (value instanceof Map<?, ?> map) return (Map<String, Object>) map; if (value instanceof String text && !text.isBlank()) try { return objectMapper.readValue(text, new TypeReference<>() { }); } catch (Exception ignored) { return Map.of(); } return Map.of(); }
    private double decimal(Object value, double fallback) { return value instanceof Number number ? number.doubleValue() : fallback; }
    private List<String> append(List<String> values, String value) { List<String> result = new ArrayList<>(values); result.add(value); return result; }
    private void stableId(String value) { if (!value.matches("[A-Za-z][A-Za-z0-9._:-]{2,127}")) throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "标识不合法"); }
    private String digest(String value) { try { byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)); StringBuilder result = new StringBuilder(bytes.length * 2); for (byte item : bytes) result.append(String.format("%02x", item)); return result.toString(); } catch (Exception exception) { throw new IllegalStateException(exception); } }
    private String string(Object value) { return value == null ? "" : value.toString(); }
    private record ModelRevision(Map<String, Object> model, SemanticRevision revision) { }
}
