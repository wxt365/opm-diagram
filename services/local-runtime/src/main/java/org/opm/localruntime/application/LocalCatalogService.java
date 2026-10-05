package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.api.ApiErrorCode;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.assets.ProfilePackageAssembler;
import org.opm.localruntime.semantic.SemanticRevision;
import org.opm.localruntime.semantic.SemanticRevisionJsonWriter;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.opm.localruntime.storage.ProjectDatabaseOpenResult;
import org.opm.localruntime.text.OplTextGenerationService;

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

/** 项目和模型创建编排；事务内的初始修订、绑定与幂等记录一起提交。 */
final class LocalCatalogService {
    private final ProjectDatabaseFactory databaseFactory;
    private final org.opm.localruntime.storage.LocalApiRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final SemanticRevisionJsonWriter revisionWriter = new SemanticRevisionJsonWriter();
    private final OplTextGenerationService textGenerationService = new OplTextGenerationService();
    private final ProfilePackageAssembler profilePackageAssembler;
    LocalCatalogService(ProjectDatabaseFactory factory, org.opm.localruntime.storage.LocalApiRepository repository, ProfilePackageAssembler profiles) {
        this.databaseFactory = factory; this.repository = repository; this.profilePackageAssembler = profiles;
    }
    private SemanticRevision.ProfileBinding profileBinding() { return RuntimeActiveBindingProvider.current(); }
    public Map<String, Object> listProjects(String requestId, String query) {
        List<Map<String, Object>> projects = new ArrayList<>();
        for (Path database : repository.projectDatabases()) {
            try (Connection connection = repository.connection(database);
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
        try (Connection connection = repository.projectConnection(projectId);
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
        Map<String, Object> replay = repository.findProjectCreateReplay(commandId, digest);
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
        try (Connection connection = repository.connection(ready.database().databasePath())) {
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
                repository.writeIdempotency(connection, "API-PRJ-003", "projects", commandId, digest, null, project, now);
                repository.writeOperation(connection, projectId, null, "API-PRJ-003", "projects", commandId, null, null, "COMMITTED", now);
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
        return listModels(requestId, projectId, "ACTIVE");
    }

    public Map<String, Object> listModels(String requestId, String projectId, String archiveState) {
        if (!List.of("ACTIVE", "ARCHIVED").contains(archiveState)) throw new ApiException(ApiErrorCode.INVALID_ARGUMENT, 400, false, "模型列表状态不合法");
        try (Connection connection = repository.projectConnection(projectId);
             PreparedStatement statement = connection.prepareStatement("""
                     SELECT m.model_id, m.project_id, m.name, h.draft_head_revision_id, d.profile_id, d.profile_version, d.rule_set_version
                     FROM model_catalog m JOIN model_head h ON h.model_id = m.model_id
                     JOIN revision_document d ON d.revision_id = h.draft_head_revision_id
                     WHERE m.project_id = ? AND m.status = ? ORDER BY m.normalized_name
                     """)) {
            statement.setString(1, projectId);
            statement.setString(2, archiveState);
            List<Map<String, Object>> models = new ArrayList<>();
            try (ResultSet result = statement.executeQuery()) { while (result.next()) models.add(model(result)); }
            return queryResult(requestId, null, null, null, "not-applicable", models, true);
        } catch (SQLException exception) { throw persistence(exception); }
    }

    public synchronized Map<String, Object> createModel(String projectId, Map<String, Object> request) {
        return createModel(projectId, request, null);
    }

    synchronized Map<String, Object> createTransferredModel(String projectId, Map<String, Object> request, com.fasterxml.jackson.databind.node.ObjectNode document) {
        return createModel(projectId, request, document);
    }

    private Map<String, Object> createModel(String projectId, Map<String, Object> request, com.fasterxml.jackson.databind.node.ObjectNode imported) {
        String requestId = required(request, "request_id");
        String commandId = required(request, "command_id");
        var identity = new LinkedHashMap<>(request);
        if (imported != null) identity.remove("request_id");
        String digest = requestDigest(identity);
        String operation = imported == null ? "API-PRJ-007" : "API-OPD-002";
        validateBinding(requiredMap(request, "binding"));
        try (Connection connection = repository.projectConnection(projectId)) {
            Map<String, Object> replay = repository.replay(connection, operation, projectId, commandId, digest);
            if (replay != null) return commandResult(requestId, commandId, "COMMITTED", string(replay.get("head_revision")), "saved", replay);
            String now = Instant.now().toString();
            String modelId = newId("model");
            String contextId = newId("context.root");
            String revisionId = newId("revision.initial");
            com.fasterxml.jackson.databind.node.ObjectNode importedDocument = imported == null ? null : imported.deepCopy();
            if (importedDocument != null) {
                importedDocument.put("model_id", modelId).put("revision_id", revisionId).put("revision_sequence", 1);
                ((com.fasterxml.jackson.databind.node.ObjectNode) importedDocument.required("model_header")).put("model_id", modelId);
                ((com.fasterxml.jackson.databind.node.ObjectNode) importedDocument.at("/model_header/identity_namespace")).put("local_name", modelId);
                OpdJsonPackage.clearEvidence(importedDocument);
            }
            SemanticRevision revision = importedDocument == null ? initialRevision(modelId, revisionId, contextId) : OpdJsonPackage.validate(importedDocument);
            if (importedDocument != null) {
                // 初始 Revision 由旧查询 reader 读取，语义整数字段保留整数 JSON 形态。
                for (var layout : importedDocument.path("layouts")) ((com.fasterxml.jackson.databind.node.ObjectNode) layout).put("z_order", layout.path("z_order").intValue());
                for (var fact : importedDocument.path("facts")) for (var endpoint : fact.path("endpoints"))
                    ((com.fasterxml.jackson.databind.node.ObjectNode) endpoint).put("ordinal", endpoint.path("ordinal").intValue());
            }
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
                    statement.setString(6, objectMapper.readTree(revisionWriter.write(revision)).required("profile_binding").toString()); statement.setString(7, now); statement.setString(8, now);
                    statement.executeUpdate();
                }
                if (importedDocument == null) insertInitialRevision(connection, revision, now);
                else {
                    var assets = profilePackageAssembler.assemble(revision.profileBinding());
                    var generated = textGenerationService.generate(revision, revision.rootContextId(), assets);
                    textGenerationService.validateActiveWriteEvidence(revision, assets, generated);
                    org.opm.localruntime.semantic.DraftTextMetadataWriter.write(importedDocument, generated);
                    insertInitialRevision(connection, revision, now, importedDocument.toString());
                }
                try (PreparedStatement statement = connection.prepareStatement("INSERT INTO revision_parent(model_id, revision_id, parent_revision_id) VALUES (?, ?, NULL)")) {
                    statement.setString(1, modelId); statement.setString(2, revisionId); statement.executeUpdate();
                }
                try (PreparedStatement statement = connection.prepareStatement("INSERT INTO model_head(model_id, draft_head_revision_id, head_sequence, updated_at) VALUES (?, ?, 1, ?)")) {
                    statement.setString(1, modelId); statement.setString(2, revisionId); statement.setString(3, now); statement.executeUpdate();
                }
                if (databaseFactory.usesJournaledDrafts()) {
                    org.opm.localruntime.storage.NewDraftModelRepository.initialize(connection, projectId, modelId, revisionId, now, importedDocument != null);
                }
                repository.writeIdempotency(connection, operation, projectId, commandId, digest, revisionId, model, now);
                repository.writeOperation(connection, projectId, modelId, operation, projectId, commandId, null, revisionId, "COMMITTED", now);
                connection.commit();
            } catch (Exception exception) {
                connection.rollback();
                var failure = persistence(exception); if (imported != null) failure.initCause(exception); throw failure;
            }
            return commandResult(requestId, commandId, "COMMITTED", revisionId, "saved", model);
        } catch (SQLException exception) { throw persistence(exception); }
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
        insertInitialRevision(connection, revision, now, revisionWriter.write(revision));
    }

    private void insertInitialRevision(Connection connection, SemanticRevision revision, String now, String document) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO revision_document(revision_id, model_id, revision_sequence, schema_version, profile_id, profile_version, rule_set_id, rule_set_version, schema_set_json, profile_binding_json, document_json, document_digest, commit_reason, created_at)
                VALUES (?, ?, 1, ?, ?, ?, ?, ?, '{}', ?, ?, ?, 'INITIAL_MODEL', ?)
                """)) {
            statement.setString(1, revision.revisionId()); statement.setString(2, revision.modelId()); statement.setString(3, objectMapper.readTree(document).required("schema_version").asText()); statement.setString(4, PROFILE_ID); statement.setString(5, PROFILE_VERSION); statement.setString(6, RULE_ID); statement.setString(7, RULE_VERSION);
            statement.setString(8, objectMapper.readTree(document).required("profile_binding").toString());
            statement.setString(9, document); statement.setString(10, digest(document)); statement.setString(11, now); statement.executeUpdate();
        }
    }

    private SemanticRevision initialRevision(String modelId, String revisionId, String contextId) {
        SemanticRevision.Context context = new SemanticRevision.Context(contextId, SemanticRevision.ContextKind.SYSTEM_DIAGRAM, capability("CAP-CONTEXT-001"), qualifiedName("SD"), List.of(), source("SystemDiagram"));
        return new SemanticRevision(revisionId, modelId, 1, profileBinding(), contextId, List.of(), List.of(), List.of(), List.of(context), List.of(), List.of());
    }

    private Map<String, Object> project(ResultSet result) throws SQLException { return Map.of("project_id", result.getString(1), "name", result.getString(2), "description", result.getString(3) == null ? "" : result.getString(3), "archive_state", result.getString(4), "updated_at", result.getString(5), "model_count", result.getInt(6)); }

}
