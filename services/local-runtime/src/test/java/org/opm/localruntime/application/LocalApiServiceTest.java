package org.opm.localruntime.application;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.api.ApiErrorCode;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.storage.ProjectDatabaseFactory;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LocalApiServiceTest {

    @TempDir
    Path temporaryDirectory;

    @Test
    void resolvesHeadAndExactWithRevisionOwnershipAndBaselineRecovery() throws Exception {
        ProjectDatabaseFactory factory = new ProjectDatabaseFactory(temporaryDirectory);
        LocalApiService service = new LocalApiService(factory);
        String projectId = string(data(service.createProject(projectRequest("request.url.project", "command.url.project"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.url.model", "command.url.model")));
        String modelId = string(model.get("model_id"));
        String initial = string(model.get("head_revision"));
        Map<String, Object> first = data(service.workspace("request.url.head", projectId, modelId, "head", null));
        String root = string(first.get("root_context_id"));
        assertEquals("EDITABLE_DRAFT", ((Map<?, ?>) first.get("model")).get("access_mode"));
        Map<String, Object> exactHead = data(service.workspace("request.url.exact", projectId, modelId, initial, "context.foreign"));
        assertEquals(root, exactHead.get("current_context_id"));
        assertEquals("READONLY_SNAPSHOT", ((Map<?, ?>) exactHead.get("model")).get("access_mode"));
        String next = committed(service.edit(projectId, modelId, root, editRequest("request.url.edit", "command.url.edit", initial,
                "CREATE_ELEMENT", Map.of("kind", "OBJECT", "element_id", "element.url", "name", "Material", "layout", Map.of("x", 80, "y", 120)))));
        assertEquals(next, ((Map<?, ?>) service.workspace("request.url.latest", projectId, modelId).get("meta")).get("read_revision"));
        assertEquals(initial, ((Map<?, ?>) service.workspace("request.url.old", projectId, modelId, initial, null).get("meta")).get("read_revision"));
        assertTrue(((List<?>) data(service.projection("request.url.old.projection", projectId, modelId, root, initial)).get("constructs")).isEmpty());

        Map<String, Object> otherRequest = new LinkedHashMap<>(modelRequest("request.url.other", "command.url.other"));
        otherRequest.put("name", "Other Model");
        String foreign = string(data(service.createModel(projectId, otherRequest)).get("head_revision"));
        assertEquals(ApiErrorCode.NOT_FOUND, assertThrows(ApiException.class, () -> service.workspace("request.url.foreign", projectId, modelId, foreign, null)).code());
        assertEquals(ApiErrorCode.NOT_FOUND, assertThrows(ApiException.class, () -> service.workspace("request.url.missing", projectId, modelId, "revision.missing", null)).code());
        for (String invalid : List.of("", "a", "../bad", "revision bad")) {
            assertEquals(ApiErrorCode.INVALID_ARGUMENT, assertThrows(ApiException.class, () -> service.workspace("request.url.invalid", projectId, modelId, invalid, null)).code());
        }

        // 在隔离 SQLite 中建立无活动草稿的恢复状态，不修改生产存储。
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + factory.databasePath(projectId));
             var insert = connection.prepareStatement("INSERT INTO baseline(baseline_id, model_id, revision_id, name, normalized_name, validation_report_digest, evidence_summary_json, created_at) VALUES (?, ?, ?, ?, ?, 'test-digest', '{}', ?)");
             var delete = connection.prepareStatement("DELETE FROM model_head WHERE model_id = ?")) {
            for (int index = 0; index < 2; index++) {
                insert.setString(1, "baseline.url." + index); insert.setString(2, modelId); insert.setString(3, index == 0 ? initial : next);
                insert.setString(4, "Baseline " + index); insert.setString(5, "baseline " + index); insert.setString(6, "2026-09-0" + (index + 1)); insert.executeUpdate();
            }
            delete.setString(1, modelId); delete.executeUpdate();
        }
        Map<String, Object> recovered = service.workspace("request.url.recover", projectId, modelId);
        assertEquals(next, ((Map<?, ?>) recovered.get("meta")).get("read_revision"));
        Map<?, ?> recoveredModel = (Map<?, ?>) data(recovered).get("model");
        assertEquals(null, recoveredModel.get("head_revision"));
        assertEquals("READONLY_BASELINE", recoveredModel.get("access_mode"));
        Map<?, ?> olderBaselineModel = (Map<?, ?>) data(service.workspace("request.url.older.baseline", projectId, modelId, initial, null)).get("model");
        assertEquals("READONLY_BASELINE", olderBaselineModel.get("access_mode"));
        service.projection("request.url.recovered.projection", projectId, modelId, root, next);
        service.capabilities("request.url.recovered.capabilities", projectId, modelId, next, "element.url", "UPDATE_PROPERTY", List.of());
        service.relationCatalog("request.url.recovered.catalog", projectId, modelId, root, next);
        assertEquals(2, ((List<?>) service.revisions("request.url.recovered.history", projectId, modelId).get("data")).size());
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + factory.databasePath(projectId));
             var delete = connection.prepareStatement("DELETE FROM baseline WHERE model_id = ?")) {
            delete.setString(1, modelId); delete.executeUpdate();
        }
        ApiException empty = assertThrows(ApiException.class, () -> service.workspace("request.url.empty", projectId, modelId));
        assertEquals(ApiErrorCode.NOT_FOUND, empty.code());
        assertTrue(empty.getMessage().contains("没有可打开版本"));
        assertEquals(initial, ((Map<?, ?>) service.workspace("request.url.nohead.exact", projectId, modelId, initial, null).get("meta")).get("read_revision"));
    }

    @Test
    void persistsTheP0ProjectToBaselinePathInSeparateProjectSqlite() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));

        Map<String, Object> projectResult = service.createProject(projectRequest("request.project.001", "command.project.001"));
        Map<String, Object> project = data(projectResult);
        String projectId = string(project.get("project_id"));
        assertNotNull(projectId);

        Map<String, Object> modelResult = service.createModel(projectId, modelRequest("request.model.001", "command.model.001"));
        Map<String, Object> model = data(modelResult);
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        Map<String, Object> workspace = data(service.workspace("request.workspace.001", projectId, modelId));
        String contextId = string(workspace.get("root_context_id"));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.object.001", "command.object.001", revision,
                "CREATE_ELEMENT", Map.of("kind", "OBJECT", "element_id", "element.raw.material", "name", "Raw Material", "layout", Map.of("x", 80, "y", 120)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.process.001", "command.process.001", revision,
                "CREATE_ELEMENT", Map.of("kind", "PROCESS", "element_id", "element.processing", "name", "Processing", "layout", Map.of("x", 420, "y", 120)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.fact.001", "command.fact.001", revision,
                "CREATE_FACT", Map.of("kind", "CONSUMPTION", "fact_id", "fact.processing.consumes.raw", "object_id", "element.raw.material", "process_id", "element.processing"))));

        Map<String, Object> projection = data(service.projection("request.projection.001", projectId, modelId, contextId, revision));
        java.util.List<?> constructs = (java.util.List<?>) projection.get("constructs");
        Map<?, ?> consumption = constructs.stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .filter(item -> "CONSUMPTION_LINK".equals(item.get("construct_role")))
                .findFirst().orElseThrow();
        assertEquals("fact.processing.consumes.raw", consumption.get("target_id"));
        assertEquals("element.raw.material", consumption.get("source_id"));
        assertEquals("element.processing", consumption.get("process_id"));

        Map<String, Object> text = data(service.text("request.text.001", projectId, modelId, contextId, revision));
        assertEquals("Processing consumes Raw Material.", ((Map<?, ?>) ((java.util.List<?>) text.get("sentences")).getFirst()).get("text"));

        Map<String, Object> validation = service.validate(projectId, modelId, validationRequest("request.validation.001", "command.validation.001", revision));
        Map<String, Object> task = data(validation);
        assertEquals("COMPLETED", task.get("state"));
        Map<String, Object> queriedTask = data(service.task("request.task.001", string(task.get("task_id"))));
        assertEquals(revision, queriedTask.get("input_revision"));

        String evidence = "evidence." + digest(string(task.get("task_id")) + revision).substring(0, 32);
        Map<String, Object> baseline = data(service.baseline(projectId, modelId, baselineRequest("request.baseline.001", "command.baseline.001", revision, evidence)));
        assertEquals(revision, baseline.get("revision_id"));
        assertEquals(true, baseline.get("immutable"));
        assertFalse(((java.util.List<?>) service.revisions("request.revisions.001", projectId, modelId).get("data")).isEmpty());
    }

    @Test
    void keepsP0CapabilitiesAndRejectsUnimplementedCompleteCanvasCommandsWithoutCommitting() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.capabilities.001", "command.project.capabilities.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.capabilities.001", "command.model.capabilities.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.capabilities.001", projectId, modelId)).get("root_context_id"));

        Map<String, Object> capabilities = data(service.capabilities("request.capabilities.001", projectId, modelId, revision));
        assertEquals(java.util.List.of("CREATE_ELEMENT", "CREATE_FACT", "UPDATE_LAYOUT"), capabilities.get("allowed"));
        assertNotNull(capabilities.get("capability_query_id"));
        Map<?, ?> unavailableState = (Map<?, ?>) ((java.util.List<?>) capabilities.get("options")).getFirst();
        assertEquals(false, unavailableState.get("enabled"));
        assertEquals(java.util.List.of("ENDPOINT_KIND_MISMATCH"), unavailableState.get("reason_codes"));
        assertEquals(2, ((java.util.List<?>) capabilities.get("forbidden")).size());

        assertProfileForbidden(service, projectId, modelId, contextId, revision, "CREATE_ELEMENT", Map.of("kind", "STATE", "name", "Invalid State", "layout", Map.of("x", 80, "y", 120)));
        assertProfileForbidden(service, projectId, modelId, contextId, revision, "CREATE_FACT", completeFactPayload(contextId));
        assertProfileForbidden(service, projectId, modelId, contextId, revision, "UPDATE_FACT", Map.of("fact_id", "fact.001"));
        assertEquals(revision, string(((Map<?, ?>) service.workspace("request.workspace.after-state.001", projectId, modelId).get("meta")).get("read_revision")));
    }

    @Test
    void updatesOnlyOwnedObjectProcessOccurrenceLayoutAndKeepsOplStable() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.layout.001", "command.project.layout.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.layout.001", "command.model.layout.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.layout.001", projectId, modelId)).get("root_context_id"));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.layout.object.001", "command.layout.object.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.layout.object", "name", "Raw Material", "layout", map("x", 80, "y", 120)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.layout.process.001", "command.layout.process.001", revision,
                "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", "element.layout.process", "name", "Processing", "layout", map("x", 420, "y", 120)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.layout.fact.001", "command.layout.fact.001", revision,
                "CREATE_FACT", map("kind", "CONSUMPTION", "fact_id", "fact.layout.consumption", "object_id", "element.layout.object", "process_id", "element.layout.process"))));
        Map<?, ?> object = construct(service, projectId, modelId, contextId, revision, "element.layout.object");
        String objectOccurrenceId = string(object.get("occurrence_id"));
        String oplBefore = string(((Map<?, ?>) ((List<?>) data(service.text("request.layout.text.before", projectId, modelId, contextId, revision)).get("sentences")).getFirst()).get("text"));

        String movedRevision = committed(service.edit(projectId, modelId, contextId, editRequest("request.layout.move.001", "command.layout.move.001", revision,
                "UPDATE_LAYOUT", map("occurrence_id", objectOccurrenceId, "layout", map("x", 240, "y", 280)))));
        Map<?, ?> moved = construct(service, projectId, modelId, contextId, movedRevision, "element.layout.object");
        Map<?, ?> movedLayout = (Map<?, ?>) moved.get("layout");
        assertEquals(240.0d, ((Number) movedLayout.get("x")).doubleValue());
        assertEquals(280.0d, ((Number) movedLayout.get("y")).doubleValue());
        assertEquals(160.0d, ((Number) movedLayout.get("width")).doubleValue());
        assertEquals(oplBefore, string(((Map<?, ?>) ((List<?>) data(service.text("request.layout.text.after", projectId, modelId, contextId, movedRevision)).get("sentences")).getFirst()).get("text")));

        Map<?, ?> fact = construct(service, projectId, modelId, contextId, movedRevision, "fact.layout.consumption");
        ApiException rejected = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId, editRequest("request.layout.fact.reject", "command.layout.fact.reject", movedRevision,
                "UPDATE_LAYOUT", map("occurrence_id", fact.get("occurrence_id"), "layout", map("x", 12, "y", 24)))));
        assertEquals(ApiErrorCode.DOMAIN_REJECTED, rejected.code());
        assertEquals(movedRevision, string(((Map<?, ?>) service.workspace("request.workspace.layout.reject", projectId, modelId).get("meta")).get("read_revision")));
    }

    @Test
    void updatesOwnedAttributeAndOperationOccurrenceLayouts() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.attribute-layout.001", "command.project.attribute-layout.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.attribute-layout.001", "command.model.attribute-layout.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.attribute-layout.001", projectId, modelId)).get("root_context_id"));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.attribute-layout.object.001", "command.attribute-layout.object.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.attribute-layout.owner", "name", "Device", "layout", map("x", 40, "y", 40)))));
        Map<?, ?> attributeOption = ((List<?>) data(service.capabilities("request.attribute-layout.option.001", projectId, modelId, revision,
                "element.attribute-layout.owner", "CREATE_FEATURE")).get("options")).stream().map(Map.class::cast)
                .filter(option -> "CAP-FEAT-ATTRIBUTE-001".equals(((Map<?, ?>) option.get("capability_ref")).get("capability_id"))).findFirst().orElseThrow();
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.attribute-layout.create.001", "command.attribute-layout.create.001", revision,
                "CREATE_FEATURE", map("context_id", contextId, "owner_element_id", "element.attribute-layout.owner", "feature_id", "feature.attribute-layout.temperature",
                        "feature_kind", "ATTRIBUTE", "capability_ref", map("capability_id", "CAP-FEAT-ATTRIBUTE-001"), "name", "Temperature",
                        "occurrence", map("ownership", "OWNED", "construct_role", "ATTRIBUTE_NODE"), "layout", map("x", 260, "y", 40),
                        "capability_query_id", attributeOption.get("capability_query_id"), "selected_option_id", attributeOption.get("option_id")))));
        Map<?, ?> operationOption = ((List<?>) data(service.capabilities("request.operation-layout.option.001", projectId, modelId, revision,
                "element.attribute-layout.owner", "CREATE_FEATURE")).get("options")).stream().map(Map.class::cast)
                .filter(option -> "CAP-FEAT-OPERATION-001".equals(((Map<?, ?>) option.get("capability_ref")).get("capability_id"))).findFirst().orElseThrow();
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.operation-layout.create.001", "command.operation-layout.create.001", revision,
                "CREATE_FEATURE", map("context_id", contextId, "owner_element_id", "element.attribute-layout.owner", "feature_id", "feature.operation-layout.calibrate",
                        "feature_kind", "OPERATION", "capability_ref", map("capability_id", "CAP-FEAT-OPERATION-001"), "name", "Calibrate",
                        "occurrence", map("ownership", "OWNED", "construct_role", "OPERATION_NODE"), "layout", map("x", 260, "y", 120),
                        "capability_query_id", operationOption.get("capability_query_id"), "selected_option_id", operationOption.get("option_id")))));

        Map<?, ?> attributeBefore = construct(service, projectId, modelId, contextId, revision, "feature.attribute-layout.temperature");
        Map<?, ?> layoutBefore = (Map<?, ?>) attributeBefore.get("layout");
        Map<String, Object> textBefore = data(service.text("request.attribute-layout.text.before", projectId, modelId, contextId, revision));
        String movedRevision = committed(service.edit(projectId, modelId, contextId, editRequest("request.attribute-layout.move.001", "command.attribute-layout.move.001", revision,
                "UPDATE_LAYOUT", map("occurrence_id", attributeBefore.get("occurrence_id"), "layout", map("x", 340, "y", 220)))));

        Map<?, ?> attributeAfter = construct(service, projectId, modelId, contextId, movedRevision, "feature.attribute-layout.temperature");
        Map<?, ?> layoutAfter = (Map<?, ?>) attributeAfter.get("layout");
        assertEquals("FEATURE", attributeAfter.get("target_kind"));
        assertEquals("ATTRIBUTE_NODE", attributeAfter.get("construct_role"));
        assertEquals("CAP-FEAT-ATTRIBUTE-001", attributeAfter.get("capability_id"));
        assertEquals("Temperature", attributeAfter.get("label"));
        assertEquals(340.0d, ((Number) layoutAfter.get("x")).doubleValue());
        assertEquals(220.0d, ((Number) layoutAfter.get("y")).doubleValue());
        assertEquals(layoutBefore.get("width"), layoutAfter.get("width"));
        assertEquals(layoutBefore.get("height"), layoutAfter.get("height"));
        assertEquals(layoutBefore.get("z_order"), layoutAfter.get("z_order"));
        assertEquals(textBefore.get("sentences"), data(service.text("request.attribute-layout.text.after", projectId, modelId, contextId, movedRevision)).get("sentences"));
        assertEquals(textBefore.get("traces"), data(service.text("request.attribute-layout.trace.after", projectId, modelId, contextId, movedRevision)).get("traces"));

        Map<?, ?> operation = construct(service, projectId, modelId, contextId, movedRevision, "feature.operation-layout.calibrate");
        String operationRevision = committed(service.edit(projectId, modelId, contextId, editRequest(
                "request.operation-layout.reject.001", "command.operation-layout.reject.001", movedRevision,
                "UPDATE_LAYOUT", map("occurrence_id", operation.get("occurrence_id"), "layout", map("x", 12, "y", 24)))));
        var movedOperation = (Map<?, ?>) construct(service, projectId, modelId, contextId, operationRevision, "feature.operation-layout.calibrate").get("layout");
        assertEquals(12d, movedOperation.get("x")); assertEquals(24d, movedOperation.get("y"));
    }

    @Test
    void returnsOnlyEnabledProceduralCandidatesWithServerNormalizedEndpoints() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.procedural-options.001", "command.project.procedural-options.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.procedural-options.001", "command.model.procedural-options.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.procedural-options.001", projectId, modelId)).get("root_context_id"));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-options.object.001", "command.procedural-options.object.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.material.001", "name", "Material", "layout", map("x", 40, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-options.process.001", "command.procedural-options.process.001", revision,
                "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", "element.processing.001", "name", "Processing", "layout", map("x", 320, "y", 40)))));

        Map<String, Object> capabilities = data(service.capabilities("request.procedural-options.001", projectId, modelId, revision, null, "CREATE_FACT",
                List.of("element.processing.001", "element.material.001")));
        List<?> options = (List<?>) capabilities.get("options");
        assertEquals(4, options.size());
        assertEquals(java.util.Set.of("CAP-ISO-PROC-001", "CAP-ISO-PROC-002", "CAP-ISO-PROC-004", "CAP-ISO-PROC-005"), options.stream()
                .map(Map.class::cast).map(option -> ((Map<?, ?>) option.get("capability_ref")).get("capability_id")).collect(java.util.stream.Collectors.toSet()));
        Map<?, ?> consumption = options.stream().map(Map.class::cast)
                .filter(option -> "CAP-ISO-PROC-001".equals(((Map<?, ?>) option.get("capability_ref")).get("capability_id"))).findFirst().orElseThrow();
        List<?> endpoints = (List<?>) consumption.get("normalized_endpoints");
        assertEquals("CONSUMED_OBJECT", ((Map<?, ?>) endpoints.getFirst()).get("role"));
        assertEquals("element.material.001", ((Map<?, ?>) ((Map<?, ?>) endpoints.getFirst()).get("target_ref")).get("target_id"));
        assertEquals("CONSUMING_PROCESS", ((Map<?, ?>) endpoints.get(1)).get("role"));
        assertEquals("element.processing.001", ((Map<?, ?>) ((Map<?, ?>) endpoints.get(1)).get("target_ref")).get("target_id"));
    }

    @Test
    void commitsResultWithProjectionAndOplAndBlocksExceptionWithoutDuration() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.procedural-command.001", "command.project.procedural-command.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.procedural-command.001", "command.model.procedural-command.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.procedural-command.001", projectId, modelId)).get("root_context_id"));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-command.object.001", "command.procedural-command.object.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.material.001", "name", "Material", "layout", map("x", 40, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-command.process.001", "command.procedural-command.process.001", revision,
                "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", "element.processing.001", "name", "Processing", "layout", map("x", 320, "y", 40)))));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-command.result.001", "command.procedural-command.result.001", revision,
                "CREATE_FACT", proceduralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-PROC-002", "TRANSFORMATION", "fact.processing.yields.material",
                        List.of("element.material.001", "element.processing.001"), List.of()))));
        Map<?, ?> result = construct(service, projectId, modelId, contextId, revision, "fact.processing.yields.material");
        assertEquals("symbol.link.result", result.get("symbol_ref"));
        assertEquals("CAP-ISO-PROC-002", result.get("capability_id"));
        assertEquals("Processing yields Material.", ((Map<?, ?>) ((java.util.List<?>) data(service.text("request.procedural-command.text.001", projectId, modelId, contextId, revision)).get("sentences")).getFirst()).get("text"));

        String resultRevision = revision;
        ApiException exception = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId, editRequest("request.procedural-command.exception.001", "command.procedural-command.exception.001", resultRevision,
                "CREATE_FACT", proceduralFactPayload(service, projectId, modelId, resultRevision, contextId, "CAP-ISO-PROC-015", "PROFILE_FACT", "fact.processing.overtime",
                        List.of("element.processing.001", "element.processing.001"), List.of()))));
        assertEquals(ApiErrorCode.DOMAIN_REJECTED, exception.code());
    }

    @Test
    void commitsEveryProceduralCapabilityWithCanonicalProjectionAndOpl() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.procedural-matrix.001", "command.project.procedural-matrix.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.procedural-matrix.001", "command.model.procedural-matrix.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.procedural-matrix.001", projectId, modelId)).get("root_context_id"));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-matrix.input.001", "command.procedural-matrix.input.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.input.001", "name", "Input", "layout", map("x", 40, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-matrix.output.001", "command.procedural-matrix.output.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.output.001", "name", "Output", "layout", map("x", 40, "y", 180)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-matrix.process.001", "command.procedural-matrix.process.001", revision,
                "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", "element.processing.001", "name", "Processing", "layout", map("x", 320, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-matrix.handler.001", "command.procedural-matrix.handler.001", revision,
                "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", "element.handling.001", "name", "Handling", "layout", map("x", 320, "y", 180)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-matrix.input-state.001", "command.procedural-matrix.input-state.001", revision,
                "CREATE_STATE", statePayload(contextId, "element.input.001", "state.input.ready", "Ready"))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-matrix.output-state.001", "command.procedural-matrix.output-state.001", revision,
                "CREATE_STATE", statePayload(contextId, "element.output.001", "state.output.finished", "Finished"))));

        for (ProceduralExpectation expectation : proceduralExpectations()) {
            revision = committed(service.edit(projectId, modelId, contextId, editRequest(
                    "request.procedural-matrix." + expectation.capabilityId(), "command.procedural-matrix." + expectation.capabilityId(), revision,
                    "CREATE_FACT", proceduralFactPayload(service, projectId, modelId, revision, contextId, expectation.capabilityId(), expectation.family(), expectation.factId(),
                            expectation.endpointIds(), expectation.requiresDuration() ? List.of(map("modifier_id", "duration", "value", "PT5M")) : List.of()))));
            Map<?, ?> construct = construct(service, projectId, modelId, contextId, revision, expectation.factId());
            assertEquals(expectation.capabilityId(), construct.get("capability_id"));
            assertEquals(expectation.symbolRef(), construct.get("symbol_ref"));
            assertEquals(expectation.endpointIds().size(), ((List<?>) construct.get("endpoints")).size());
            List<?> sentences = (List<?>) data(service.text("request.procedural-matrix.text." + expectation.capabilityId(), projectId, modelId, contextId, revision)).get("sentences");
            assertTrue(sentences.stream().map(Map.class::cast).map(sentence -> sentence.get("text")).anyMatch(expectation.opl()::equals), expectation.capabilityId());
        }
    }

    @Test
    void rejectsMismatchedAndStaleProceduralCandidateOptionsBeforeCommitting() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.procedural-option-guard.001", "command.project.procedural-option-guard.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.procedural-option-guard.001", "command.model.procedural-option-guard.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.procedural-option-guard.001", projectId, modelId)).get("root_context_id"));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-option-guard.object.001", "command.procedural-option-guard.object.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.material.001", "name", "Material", "layout", map("x", 40, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-option-guard.process.001", "command.procedural-option-guard.process.001", revision,
                "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", "element.processing.001", "name", "Processing", "layout", map("x", 320, "y", 40)))));

        Map<String, Object> mismatched = proceduralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-PROC-002", "TRANSFORMATION", "fact.option.mismatched",
                List.of("element.material.001", "element.processing.001"), List.of());
        mismatched.put("selected_option_id", "option.fact.mismatched");
        String currentRevision = revision;
        ApiException mismatchedOption = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request.procedural-option-guard.mismatched.001", "command.procedural-option-guard.mismatched.001", currentRevision, "CREATE_FACT", mismatched)));
        assertEquals(ApiErrorCode.DOMAIN_REJECTED, mismatchedOption.code());

        Map<String, Object> stale = proceduralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-PROC-002", "TRANSFORMATION", "fact.option.stale",
                List.of("element.material.001", "element.processing.001"), List.of());
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-option-guard.advance.001", "command.procedural-option-guard.advance.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.other.001", "name", "Other", "layout", map("x", 40, "y", 180)))));
        String advancedRevision = revision;
        ApiException staleOption = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request.procedural-option-guard.stale.001", "command.procedural-option-guard.stale.001", advancedRevision, "CREATE_FACT", stale)));
        assertEquals(ApiErrorCode.DOMAIN_REJECTED, staleOption.code());

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-option-guard.handler.001", "command.procedural-option-guard.handler.001", revision,
                "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", "element.handling.001", "name", "Handling", "layout", map("x", 320, "y", 180)))));
        Map<String, Object> invalidSelfInvocation = proceduralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-PROC-014", "PROFILE_FACT", "fact.option.invalid-self",
                List.of("element.processing.001", "element.processing.001"), List.of());
        invalidSelfInvocation.put("normalized_endpoints", List.of(
                map("role", "INVOKING_PROCESS", "target_ref", map("target_kind", "ELEMENT", "target_id", "element.processing.001"), "ordinal", 0),
                map("role", "INVOKED_PROCESS", "target_ref", map("target_kind", "ELEMENT", "target_id", "element.handling.001"), "ordinal", 1)));
        String selfRevision = revision;
        ApiException invalidSelf = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request.procedural-option-guard.invalid-self.001", "command.procedural-option-guard.invalid-self.001", selfRevision, "CREATE_FACT", invalidSelfInvocation)));
        assertEquals(ApiErrorCode.DOMAIN_REJECTED, invalidSelf.code());

        for (String invalidDuration : List.of("PT0S", "PT-5M", "invalid")) {
            Map<String, Object> invalidException = proceduralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-PROC-015", "PROFILE_FACT",
                    "fact.option.invalid-duration." + invalidDuration.replaceAll("[^A-Za-z0-9]", ""), List.of("element.processing.001", "element.handling.001"),
                    List.of(map("modifier_id", "duration", "value", invalidDuration)));
            String durationRevision = revision;
            ApiException durationRejected = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                    editRequest("request.procedural-option-guard.duration." + invalidDuration, "command.procedural-option-guard.duration." + invalidDuration, durationRevision, "CREATE_FACT", invalidException)));
            assertEquals(ApiErrorCode.DOMAIN_REJECTED, durationRejected.code());
        }
    }

    @Test
    void validatesUpdateFactOptionsAgainstTheCurrentRevision() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.procedural-update-guard.001", "command.project.procedural-update-guard.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.procedural-update-guard.001", "command.model.procedural-update-guard.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.procedural-update-guard.001", projectId, modelId)).get("root_context_id"));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-update-guard.object.001", "command.procedural-update-guard.object.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.material.001", "name", "Material", "layout", map("x", 40, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-update-guard.process.001", "command.procedural-update-guard.process.001", revision,
                "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", "element.processing.001", "name", "Processing", "layout", map("x", 320, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-update-guard.result.001", "command.procedural-update-guard.result.001", revision,
                "CREATE_FACT", proceduralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-PROC-002", "TRANSFORMATION", "fact.update.result",
                        List.of("element.material.001", "element.processing.001"), List.of()))));

        Map<String, Object> update = proceduralFactUpdatePayload(service, projectId, modelId, revision, "fact.update.result", "CAP-ISO-PROC-002", map("modifiers", List.of()));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.procedural-update-guard.valid.001", "command.procedural-update-guard.valid.001", revision, "UPDATE_FACT", update)));
        String currentRevision = revision;
        ApiException staleUpdate = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request.procedural-update-guard.stale.001", "command.procedural-update-guard.stale.001", currentRevision, "UPDATE_FACT", update)));
        assertEquals(ApiErrorCode.DOMAIN_REJECTED, staleUpdate.code());
    }

    @Test
    void appliesControlModifierPairOnlyThroughTheMatchingRuntimeOption() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.control.001", "command.project.control.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.control.001", "command.model.control.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.control.001", projectId, modelId)).get("root_context_id"));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control.object.001", "command.control.object.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.control.object.001", "name", "Material", "layout", map("x", 40, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control.process.001", "command.control.process.001", revision,
                "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", "element.control.process.001", "name", "Processing", "layout", map("x", 320, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control.consumption.001", "command.control.consumption.001", revision,
                "CREATE_FACT", proceduralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-PROC-001", "TRANSFORMATION", "fact.control.consumption.001",
                        List.of("element.control.object.001", "element.control.process.001"), List.of()))));

        List<? extends Map<?, ?>> noSelectionCatalog = ((List<?>) data(service.relationCatalog(
                "request.control.catalog.none.001", projectId, modelId, contextId, revision)).get("items")).stream()
                .filter(Map.class::isInstance).map(value -> (Map<?, ?>) value).toList();
        assertTrue(noSelectionCatalog.stream().filter(item -> "CONTROL".equals(item.get("family")))
                .noneMatch(item -> Boolean.TRUE.equals(item.get("enabled"))));

        List<? extends Map<?, ?>> selectedCatalog = ((List<?>) data(service.relationCatalog(
                "request.control.catalog.selected.001", projectId, modelId, contextId, revision, "fact.control.consumption.001")).get("items")).stream()
                .filter(Map.class::isInstance).map(value -> (Map<?, ?>) value).toList();
        assertEquals(java.util.Set.of("CAP-ISO-CTRL-001", "CAP-ISO-CTRL-005"), selectedCatalog.stream()
                .filter(item -> "CONTROL".equals(item.get("family")) && Boolean.TRUE.equals(item.get("enabled")))
                .map(item -> string(item.get("capability_id"))).collect(java.util.stream.Collectors.toSet()));
        Map<?, ?> controlCatalogItem = selectedCatalog.stream()
                .filter(item -> "CAP-ISO-CTRL-001".equals(item.get("capability_id"))).findFirst().orElseThrow();
        assertEquals("UPDATE_SELECTED_FACT", controlCatalogItem.get("interaction_mode"));
        assertEquals("symbol.control.event.transforming", ((Map<?, ?>) controlCatalogItem.get("symbol_descriptor")).get("id"));

        Map<String, Object> capabilities = data(service.capabilities("request.control.options.001", projectId, modelId, revision, "fact.control.consumption.001", "UPDATE_FACT"));
        Map<?, ?> option = ((List<?>) capabilities.get("options")).stream().map(Map.class::cast)
                .filter(value -> "CAP-ISO-CTRL-001".equals(((Map<?, ?>) value.get("capability_ref")).get("capability_id")))
                .findFirst().orElseThrow();
        assertEquals("CAP-ISO-PROC-001", ((Map<?, ?>) option.get("base_fact_capability_ref")).get("capability_id"));
        assertEquals(List.of(
                map("modifier_id", "control.capability", "value_options", List.of("CAP-ISO-CTRL-001"), "min_occurs", 1, "max_occurs", 1, "atomic_group_id", "iso-control"),
                map("modifier_id", "control.segment", "value_options", List.of("PROCESS_INPUT"), "min_occurs", 1, "max_occurs", 1, "atomic_group_id", "iso-control")), option.get("allowed_modifiers"));

        Map<String, Object> update = map("fact_id", "fact.control.consumption.001", "expected_capability_ref", map("capability_id", "CAP-ISO-PROC-001"),
                "replacement", map("modifiers", List.of(
                        map("modifier_id", "control.capability", "value", "CAP-ISO-CTRL-001"),
                        map("modifier_id", "control.segment", "value", "PROCESS_INPUT"))),
                "capability_query_id", option.get("capability_query_id"), "selected_option_id", option.get("option_id"));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control.apply.001", "command.control.apply.001", revision, "UPDATE_FACT", update)));
        Map<String, Object> projection = data(service.projection("request.control.projection.001", projectId, modelId, contextId, revision));
        Map<?, ?> construct = ((List<?>) projection.get("constructs")).stream().map(Map.class::cast)
                .filter(value -> "fact.control.consumption.001".equals(value.get("target_id"))).findFirst().orElseThrow();
        assertEquals(List.of(
                map("modifier_id", "control.capability", "value", "CAP-ISO-CTRL-001"),
                map("modifier_id", "control.segment", "value", "PROCESS_INPUT")), construct.get("modifiers"));

        update.put("replacement", map("modifiers", List.of(
                map("modifier_id", "control.capability", "value", "CAP-ISO-CTRL-001"),
                map("modifier_id", "control.capability", "value", "CAP-ISO-CTRL-001"))));
        String currentRevision = revision;
        ApiException duplicate = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request.control.duplicate.001", "command.control.duplicate.001", currentRevision, "UPDATE_FACT", update)));
        assertEquals(ApiErrorCode.MODIFIER_COMBINATION_INVALID, duplicate.code());
    }

    @Test
    void rejectsControlOutsideItsPermittedProcessInputAndRuntimeCandidate() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.control-guard.001", "command.project.control-guard.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.control-guard.001", "command.model.control-guard.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.control-guard.001", projectId, modelId)).get("root_context_id"));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control-guard.input.001", "command.control-guard.input.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.control-guard.input.001", "name", "Input", "layout", map("x", 40, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control-guard.output.001", "command.control-guard.output.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.control-guard.output.001", "name", "Output", "layout", map("x", 560, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control-guard.process.001", "command.control-guard.process.001", revision,
                "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", "element.control-guard.process.001", "name", "Processing", "layout", map("x", 320, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control-guard.result.001", "command.control-guard.result.001", revision,
                "CREATE_FACT", proceduralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-PROC-002", "TRANSFORMATION", "fact.control-guard.result.001",
                        List.of("element.control-guard.input.001", "element.control-guard.process.001"), List.of()))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control-guard.effect.001", "command.control-guard.effect.001", revision,
                "CREATE_FACT", proceduralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-PROC-003", "TRANSFORMATION", "fact.control-guard.effect.001",
                        List.of("element.control-guard.input.001", "element.control-guard.process.001", "element.control-guard.output.001"), List.of()))));

        Map<String, Object> resultCapabilities = data(service.capabilities("request.control-guard.result-options.001", projectId, modelId, revision, "fact.control-guard.result.001", "UPDATE_FACT"));
        assertTrue(((List<?>) resultCapabilities.get("options")).stream().map(Map.class::cast)
                .noneMatch(option -> option.get("base_fact_capability_ref") != null));

        Map<?, ?> effectOption = ((List<?>) data(service.capabilities("request.control-guard.effect-options.001", projectId, modelId, revision, "fact.control-guard.effect.001", "UPDATE_FACT")).get("options")).stream()
                .map(Map.class::cast)
                .filter(option -> "CAP-ISO-CTRL-001".equals(((Map<?, ?>) option.get("capability_ref")).get("capability_id")))
                .findFirst().orElseThrow();
        assertEquals(List.of("PROCESS_INPUT"), ((List<?>) effectOption.get("allowed_modifiers")).stream().map(Map.class::cast)
                .filter(modifier -> "control.segment".equals(modifier.get("modifier_id"))).findFirst().orElseThrow().get("value_options"));

        Map<String, Object> update = map("fact_id", "fact.control-guard.effect.001", "expected_capability_ref", map("capability_id", "CAP-ISO-PROC-003"),
                "replacement", map("modifiers", List.of(
                        map("modifier_id", "control.capability", "value", "CAP-ISO-CTRL-001"),
                        map("modifier_id", "control.segment", "value", "PROCESS_OUTPUT"))),
                "capability_query_id", effectOption.get("capability_query_id"), "selected_option_id", effectOption.get("option_id"));
        String effectRevision = revision;
        ApiException processOutput = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request.control-guard.process-output.001", "command.control-guard.process-output.001", effectRevision, "UPDATE_FACT", update)));
        assertEquals(ApiErrorCode.MODIFIER_COMBINATION_INVALID, processOutput.code());

        update.put("replacement", map("modifiers", List.of(
                map("modifier_id", "control.capability", "value", "CAP-ISO-CTRL-002"),
                map("modifier_id", "control.segment", "value", "PROCESS_INPUT"))));
        ApiException baseMismatch = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request.control-guard.base-mismatch.001", "command.control-guard.base-mismatch.001", effectRevision, "UPDATE_FACT", update)));
        assertEquals(ApiErrorCode.MODIFIER_COMBINATION_INVALID, baseMismatch.code());

        update.put("replacement", map("modifiers", List.of(
                map("modifier_id", "control.capability", "value", "CAP-ISO-CTRL-001"),
                map("modifier_id", "control.capability", "value", "CAP-ISO-CTRL-005"),
                map("modifier_id", "control.segment", "value", "PROCESS_INPUT"))));
        ApiException eventAndCondition = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request.control-guard.event-condition.001", "command.control-guard.event-condition.001", effectRevision, "UPDATE_FACT", update)));
        assertEquals(ApiErrorCode.MODIFIER_COMBINATION_INVALID, eventAndCondition.code());

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control-guard.advance.001", "command.control-guard.advance.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.control-guard.advance.001", "name", "Advance", "layout", map("x", 40, "y", 180)))));
        update.put("replacement", map("modifiers", List.of(
                map("modifier_id", "control.capability", "value", "CAP-ISO-CTRL-001"),
                map("modifier_id", "control.segment", "value", "PROCESS_INPUT"))));
        String advancedRevision = revision;
        ApiException staleOption = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request.control-guard.stale-option.001", "command.control-guard.stale-option.001", advancedRevision, "UPDATE_FACT", update)));
        assertEquals(ApiErrorCode.DOMAIN_REJECTED, staleOption.code());
    }

    @Test
    void mapsOnlyFrozenStructuralModifierCombinationsToTheirStableCode() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.structural-errors.001", "command.project.structural-errors.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.structural-errors.001", "command.model.structural-errors.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.structural-errors.001", projectId, modelId)).get("root_context_id"));
        for (String suffix : List.of("source", "target")) {
            revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.structural-errors.object." + suffix,
                    "command.structural-errors.object." + suffix, revision, "CREATE_ELEMENT",
                    map("kind", "OBJECT", "element_id", "element.structural-errors." + suffix, "name", suffix, "layout", map("x", 40, "y", 40)))));
        }
        List<String> objectEndpoints = List.of("element.structural-errors.source", "element.structural-errors.target");
        String structuralRevision = revision;

        Map<String, Object> missingForward = structuralFactPayload(service, projectId, modelId, revision, contextId,
                "CAP-ISO-STRUCT-001", "fact.structural-errors.001", objectEndpoints, List.of(), "NOT_APPLICABLE");
        ApiException forward = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request.structural-errors.001", "command.structural-errors.001", structuralRevision, "CREATE_FACT", missingForward)));
        assertEquals(ApiErrorCode.MODIFIER_COMBINATION_INVALID, forward.code());

        Map<String, Object> missingReverse = structuralFactPayload(service, projectId, modelId, revision, contextId,
                "CAP-ISO-STRUCT-003", "fact.structural-errors.003", objectEndpoints, List.of(), "NOT_APPLICABLE");
        ApiException reverse = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request.structural-errors.003", "command.structural-errors.003", structuralRevision, "CREATE_FACT", missingReverse)));
        assertEquals(ApiErrorCode.MODIFIER_COMBINATION_INVALID, reverse.code());

        Map<String, Object> invalidCompleteness = structuralFactPayload(service, projectId, modelId, revision, contextId,
                "CAP-ISO-STRUCT-008", "fact.structural-errors.008", objectEndpoints, List.of(), "COMPLETE");
        ApiException completeness = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request.structural-errors.008", "command.structural-errors.008", structuralRevision, "CREATE_FACT", invalidCompleteness)));
        assertEquals(ApiErrorCode.MODIFIER_COMBINATION_INVALID, completeness.code());

        Map<String, Object> duplicateLabel = structuralFactPayload(service, projectId, modelId, revision, contextId,
                "CAP-ISO-STRUCT-001", "fact.structural-errors.duplicate", objectEndpoints, List.of(
                        map("slot_id", "forward_tag", "text", "contains"),
                        map("slot_id", "forward_tag", "text", "includes")), "NOT_APPLICABLE");
        ApiException duplicate = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request.structural-errors.duplicate", "command.structural-errors.duplicate", structuralRevision, "CREATE_FACT", duplicateLabel)));
        assertEquals(ApiErrorCode.DOMAIN_REJECTED, duplicate.code());

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.structural-errors.state.source",
                "command.structural-errors.state.source", revision, "CREATE_STATE",
                statePayload(contextId, "element.structural-errors.source", "state.structural-errors.source", "Source state"))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.structural-errors.state.target",
                "command.structural-errors.state.target", revision, "CREATE_STATE",
                statePayload(contextId, "element.structural-errors.target", "state.structural-errors.target", "Target state"))));
        Map<String, Object> bidirectionalNullTag = structuralFactPayload(service, projectId, modelId, revision, contextId,
                "CAP-ISO-STRUCT-010", "fact.structural-errors.010",
                List.of("state.structural-errors.source", "state.structural-errors.target"), List.of(), "NOT_APPLICABLE");
        bidirectionalNullTag.put("direction", "BIDIRECTIONAL");
        String stateRevision = revision;
        ApiException nullTag = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request.structural-errors.010", "command.structural-errors.010", stateRevision, "CREATE_FACT", bidirectionalNullTag)));
        assertEquals(ApiErrorCode.MODIFIER_COMBINATION_INVALID, nullTag.code());
    }

    @Test
    void appliesAllControlCapabilitiesToTheirPermittedBaseFacts() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.control.matrix.001", "command.project.control.matrix.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.control.matrix.001", "command.model.control.matrix.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.control.matrix.001", projectId, modelId)).get("root_context_id"));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control.matrix.object.001", "command.control.matrix.object.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.control.matrix.object.001", "name", "Material", "layout", map("x", 40, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control.matrix.process.001", "command.control.matrix.process.001", revision,
                "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", "element.control.matrix.process.001", "name", "Processing", "layout", map("x", 320, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control.matrix.state.001", "command.control.matrix.state.001", revision,
                "CREATE_STATE", statePayload(contextId, "element.control.matrix.object.001", "state.control.matrix.ready.001", "Ready"))));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control.matrix.consumption.001", "command.control.matrix.consumption.001", revision,
                "CREATE_FACT", proceduralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-PROC-001", "TRANSFORMATION", "fact.control.matrix.consumption.001",
                        List.of("element.control.matrix.object.001", "element.control.matrix.process.001"), List.of()))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control.matrix.agent.001", "command.control.matrix.agent.001", revision,
                "CREATE_FACT", proceduralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-PROC-004", "ENABLING", "fact.control.matrix.agent.001",
                        List.of("element.control.matrix.object.001", "element.control.matrix.process.001"), List.of()))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control.matrix.state-consumption.001", "command.control.matrix.state-consumption.001", revision,
                "CREATE_FACT", proceduralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-PROC-006", "TRANSFORMATION", "fact.control.matrix.state-consumption.001",
                        List.of("state.control.matrix.ready.001", "element.control.matrix.process.001"), List.of()))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control.matrix.state-agent.001", "command.control.matrix.state-agent.001", revision,
                "CREATE_FACT", proceduralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-PROC-011", "ENABLING", "fact.control.matrix.state-agent.001",
                        List.of("state.control.matrix.ready.001", "element.control.matrix.process.001"), List.of()))));

        List<ControlExpectation> expectations = List.of(
                controlExpectation("fact.control.matrix.consumption.001", "CAP-ISO-PROC-001", "CAP-ISO-CTRL-001", "CAP-ISO-CTRL-005"),
                controlExpectation("fact.control.matrix.agent.001", "CAP-ISO-PROC-004", "CAP-ISO-CTRL-002", "CAP-ISO-CTRL-006"),
                controlExpectation("fact.control.matrix.state-consumption.001", "CAP-ISO-PROC-006", "CAP-ISO-CTRL-003", "CAP-ISO-CTRL-007"),
                controlExpectation("fact.control.matrix.state-agent.001", "CAP-ISO-PROC-011", "CAP-ISO-CTRL-004", "CAP-ISO-CTRL-008"));
        for (ControlExpectation expectation : expectations) {
            Map<String, Object> capabilities = data(service.capabilities("request.control.matrix.options." + expectation.factId(), projectId, modelId, revision, expectation.factId(), "UPDATE_FACT"));
            List<? extends Map<?, ?>> options = ((List<?>) capabilities.get("options")).stream()
                    .filter(Map.class::isInstance).map(value -> (Map<?, ?>) value)
                    .filter(option -> option.get("base_fact_capability_ref") != null).toList();
            assertEquals(java.util.Set.of(expectation.firstControlId(), expectation.secondControlId()), options.stream()
                    .map(option -> string(((Map<?, ?>) option.get("capability_ref")).get("capability_id"))).collect(java.util.stream.Collectors.toSet()));
            for (String controlId : List.of(expectation.firstControlId(), expectation.secondControlId())) {
                Map<?, ?> option = ((List<?>) data(service.capabilities(
                        "request.control.matrix.option." + expectation.factId() + "." + controlId,
                        projectId, modelId, revision, expectation.factId(), "UPDATE_FACT")).get("options")).stream()
                        .map(Map.class::cast)
                        .filter(value -> controlId.equals(((Map<?, ?>) value.get("capability_ref")).get("capability_id")))
                        .findFirst().orElseThrow();
                Map<String, Object> update = map("fact_id", expectation.factId(), "expected_capability_ref", map("capability_id", expectation.baseCapabilityId()),
                        "replacement", map("modifiers", List.of(
                                map("modifier_id", "control.capability", "value", controlId),
                                map("modifier_id", "control.segment", "value", "PROCESS_INPUT"))),
                        "capability_query_id", option.get("capability_query_id"), "selected_option_id", option.get("option_id"));
                revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control.matrix.apply." + controlId, "command.control.matrix.apply." + controlId, revision, "UPDATE_FACT", update)));
                assertEquals(List.of(
                        map("modifier_id", "control.capability", "value", controlId),
                        map("modifier_id", "control.segment", "value", "PROCESS_INPUT")),
                        construct(service, projectId, modelId, contextId, revision, expectation.factId()).get("modifiers"));
            }
        }
    }

    @Test
    void removesControlWithoutChangingTheBaseFactIdentity() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.control.remove.001", "command.project.control.remove.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.control.remove.001", "command.model.control.remove.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.control.remove.001", projectId, modelId)).get("root_context_id"));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control.remove.object.001", "command.control.remove.object.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.control.remove.object.001", "name", "Material", "layout", map("x", 40, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control.remove.process.001", "command.control.remove.process.001", revision,
                "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", "element.control.remove.process.001", "name", "Processing", "layout", map("x", 320, "y", 40)))));
        String factId = "fact.control.remove.001";
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control.remove.fact.001", "command.control.remove.fact.001", revision,
                "CREATE_FACT", proceduralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-PROC-001", "TRANSFORMATION", factId,
                        List.of("element.control.remove.object.001", "element.control.remove.process.001"), List.of()))));
        Map<?, ?> attachOption = ((List<?>) data(service.capabilities("request.control.remove.attach-option.001", projectId, modelId, revision, factId, "UPDATE_FACT")).get("options")).stream()
                .map(Map.class::cast)
                .filter(option -> "CAP-ISO-CTRL-001".equals(((Map<?, ?>) option.get("capability_ref")).get("capability_id")))
                .findFirst().orElseThrow();
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control.remove.attach.001", "command.control.remove.attach.001", revision,
                "UPDATE_FACT", map("fact_id", factId, "expected_capability_ref", map("capability_id", "CAP-ISO-PROC-001"),
                        "replacement", map("modifiers", List.of(map("modifier_id", "control.capability", "value", "CAP-ISO-CTRL-001"), map("modifier_id", "control.segment", "value", "PROCESS_INPUT"))),
                        "capability_query_id", attachOption.get("capability_query_id"), "selected_option_id", attachOption.get("option_id")))));

        Map<?, ?> before = construct(service, projectId, modelId, contextId, revision, factId);
        Map<?, ?> removeOption = ((List<?>) data(service.capabilities("request.control.remove.option.001", projectId, modelId, revision, factId, "UPDATE_FACT")).get("options")).stream()
                .map(Map.class::cast).filter(option -> "移除 Control".equals(option.get("display_name"))).findFirst().orElseThrow();
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.control.remove.apply.001", "command.control.remove.apply.001", revision,
                "UPDATE_FACT", map("fact_id", factId, "expected_capability_ref", map("capability_id", "CAP-ISO-PROC-001"), "replacement", map("modifiers", List.of()),
                        "capability_query_id", removeOption.get("capability_query_id"), "selected_option_id", removeOption.get("option_id")))));

        Map<?, ?> after = construct(service, projectId, modelId, contextId, revision, factId);
        assertEquals(before.get("occurrence_id"), after.get("occurrence_id"));
        assertEquals(before.get("layout"), after.get("layout"));
        assertFalse(after.containsKey("modifiers"));
        assertEquals(1, ((List<?>) data(service.text("request.control.remove.text.001", projectId, modelId, contextId, revision)).get("sentences")).size());
    }

    @Test
    void deletesDirectFactsAndCascadesStateDependenciesWithExactImpactTokens() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.delete.lifecycle.001", "command.project.delete.lifecycle.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.delete.lifecycle.001", "command.model.delete.lifecycle.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.delete.lifecycle.001", projectId, modelId)).get("root_context_id"));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.delete.lifecycle.object.001", "command.delete.lifecycle.object.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.delete.object.001", "name", "Material", "layout", map("x", 40, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.delete.lifecycle.process.001", "command.delete.lifecycle.process.001", revision,
                "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", "element.delete.process.001", "name", "Processing", "layout", map("x", 320, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.delete.lifecycle.fact.direct.001", "command.delete.lifecycle.fact.direct.001", revision,
                "CREATE_FACT", map("kind", "CONSUMPTION", "fact_id", "fact.delete.direct.001", "object_id", "element.delete.object.001", "process_id", "element.delete.process.001", "layout", map("x", 180, "y", 80)))));

        Map<?, ?> directFact = construct(service, projectId, modelId, contextId, revision, "fact.delete.direct.001");
        Map<?, ?> directOption = deleteOption(service, projectId, modelId, revision, directFact, "DELETE_TARGET");
        Map<String, Object> stale = map("selection_id", directFact.get("occurrence_id"), "construct_kind", "FACT", "construct_id", "fact.delete.direct.001", "delete_mode", "DELETE_TARGET", "impact_token", "impact.stale.token");
        String directFactRevision = revision;
        ApiException staleRejected = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request.delete.lifecycle.fact.stale.001", "command.delete.lifecycle.fact.stale.001", directFactRevision, "DELETE_CONSTRUCT", stale)));
        assertEquals(ApiErrorCode.REVISION_CONFLICT, staleRejected.code());
        ApiException malformed = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request.delete.lifecycle.fact.malformed.001", "command.delete.lifecycle.fact.malformed.001", directFactRevision, "DELETE_CONSTRUCT", map("selection_id", directFact.get("occurrence_id")))));
        assertEquals(ApiErrorCode.INVALID_ARGUMENT, malformed.code());
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.delete.lifecycle.fact.apply.001", "command.delete.lifecycle.fact.apply.001", revision,
                "DELETE_CONSTRUCT", deletePayload(directFact, directOption))));
        assertFalse(hasConstruct(service, projectId, modelId, contextId, revision, "fact.delete.direct.001"));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.delete.lifecycle.state.001", "command.delete.lifecycle.state.001", revision,
                "CREATE_STATE", statePayload(contextId, "element.delete.object.001", "state.delete.ready.001", "Ready"))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.delete.lifecycle.fact.state.001", "command.delete.lifecycle.fact.state.001", revision,
                "CREATE_FACT", proceduralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-PROC-006", "TRANSFORMATION", "fact.delete.state.001",
                        List.of("state.delete.ready.001", "element.delete.process.001"), List.of()))));
        Map<?, ?> state = construct(service, projectId, modelId, contextId, revision, "state.delete.ready.001");
        Map<?, ?> blockedTarget = deleteOption(service, projectId, modelId, revision, state, "DELETE_TARGET");
        Map<?, ?> cascade = deleteOption(service, projectId, modelId, revision, state, "CASCADE");
        assertEquals(false, blockedTarget.get("enabled"));
        assertEquals(List.of("DELETE_DEPENDENCY_EXISTS"), blockedTarget.get("reason_codes"));
        assertEquals(true, cascade.get("enabled"));
        assertTrue(((List<?>) ((Map<?, ?>) cascade.get("impact_summary")).get("items")).stream().map(Map.class::cast)
                .anyMatch(item -> "FACT".equals(item.get("kind")) && "fact.delete.state.001".equals(item.get("id")) && "CASCADE".equals(item.get("effect"))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.delete.lifecycle.state.cascade.001", "command.delete.lifecycle.state.cascade.001", revision,
                "DELETE_CONSTRUCT", deletePayload(state, cascade))));
        assertFalse(hasConstruct(service, projectId, modelId, contextId, revision, "state.delete.ready.001"));
        assertFalse(hasConstruct(service, projectId, modelId, contextId, revision, "fact.delete.state.001"));
        assertEquals(0, ((List<?>) data(service.text("request.delete.lifecycle.text.001", projectId, modelId, contextId, revision)).get("sentences")).size());
    }

    @Test
    void deletesFeaturesAndCascadesElementOwnedConstructs() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.delete.element.001", "command.project.delete.element.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.delete.element.001", "command.model.delete.element.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.delete.element.001", projectId, modelId)).get("root_context_id"));
        String objectId = "element.delete.element.001";
        String processId = "element.delete.process.001";
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.delete.element.object.001", "command.delete.element.object.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", objectId, "name", "Device", "layout", map("x", 40, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.delete.element.process.001", "command.delete.element.process.001", revision,
                "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", processId, "name", "Calibrate", "layout", map("x", 320, "y", 40)))));
        Map<?, ?> attributeOption = ((List<?>) data(service.capabilities("request.delete.element.attribute-option.001", projectId, modelId, revision, objectId, "CREATE_FEATURE")).get("options")).stream()
                .map(Map.class::cast).filter(option -> "CAP-FEAT-ATTRIBUTE-001".equals(((Map<?, ?>) option.get("capability_ref")).get("capability_id"))).findFirst().orElseThrow();
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.delete.element.attribute.001", "command.delete.element.attribute.001", revision,
                "CREATE_FEATURE", map("context_id", contextId, "owner_element_id", objectId, "feature_id", "feature.delete.attribute.001", "feature_kind", "ATTRIBUTE",
                        "capability_ref", map("capability_id", "CAP-FEAT-ATTRIBUTE-001"), "name", "Temperature", "occurrence", map("ownership", "OWNED", "construct_role", "ATTRIBUTE_NODE"),
                        "layout", map("x", 160, "y", 40), "capability_query_id", attributeOption.get("capability_query_id"), "selected_option_id", attributeOption.get("option_id")))));
        Map<?, ?> operationOption = ((List<?>) data(service.capabilities("request.delete.element.operation-option.001", projectId, modelId, revision, objectId, "CREATE_FEATURE")).get("options")).stream()
                .map(Map.class::cast).filter(option -> "CAP-FEAT-OPERATION-001".equals(((Map<?, ?>) option.get("capability_ref")).get("capability_id"))).findFirst().orElseThrow();
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.delete.element.operation.001", "command.delete.element.operation.001", revision,
                "CREATE_FEATURE", map("context_id", contextId, "owner_element_id", objectId, "feature_id", "feature.delete.operation.001", "feature_kind", "OPERATION",
                        "capability_ref", map("capability_id", "CAP-FEAT-OPERATION-001"), "name", "Inspect", "occurrence", map("ownership", "OWNED", "construct_role", "OPERATION_NODE"),
                        "layout", map("x", 160, "y", 120), "capability_query_id", operationOption.get("capability_query_id"), "selected_option_id", operationOption.get("option_id")))));

        Map<?, ?> operation = construct(service, projectId, modelId, contextId, revision, "feature.delete.operation.001");
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.delete.element.operation.apply.001", "command.delete.element.operation.apply.001", revision,
                "DELETE_CONSTRUCT", deletePayload(operation, deleteOption(service, projectId, modelId, revision, operation, "DELETE_TARGET")))));
        assertFalse(hasConstruct(service, projectId, modelId, contextId, revision, "feature.delete.operation.001"));

        Map<?, ?> stateOption = (Map<?, ?>) ((List<?>) data(service.capabilities("request.delete.element.state-option.001", projectId, modelId, revision,
                "feature.delete.attribute.001", "CREATE_STATE")).get("options")).getFirst();
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.delete.element.state.001", "command.delete.element.state.001", revision,
                "CREATE_STATE", map("context_id", contextId, "owner_ref", map("target_kind", "FEATURE", "target_id", "feature.delete.attribute.001"),
                        "capability_ref", map("capability_id", "CAP-FEAT-STATE-001"), "state_id", "state.delete.attribute.high.001", "name_or_value", "High", "state_roles", List.of(),
                        "occurrence", map("ownership", "OWNED", "construct_role", "FEATURE_STATE_NODE"), "layout", map("x", 200, "y", 100),
                        "capability_query_id", stateOption.get("capability_query_id"), "selected_option_id", stateOption.get("option_id")))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.delete.element.fact.001", "command.delete.element.fact.001", revision,
                "CREATE_FACT", map("kind", "CONSUMPTION", "fact_id", "fact.delete.attribute.consumption.001", "object_id", objectId, "process_id", processId,
                        "layout", map("x", 180, "y", 80)))));

        Map<?, ?> object = construct(service, projectId, modelId, contextId, revision, objectId);
        Map<?, ?> blocked = deleteOption(service, projectId, modelId, revision, object, "DELETE_TARGET");
        Map<?, ?> cascade = deleteOption(service, projectId, modelId, revision, object, "CASCADE");
        assertEquals(false, blocked.get("enabled"));
        assertEquals(true, cascade.get("enabled"));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.delete.element.cascade.001", "command.delete.element.cascade.001", revision,
                "DELETE_CONSTRUCT", deletePayload(object, cascade))));
        assertFalse(hasConstruct(service, projectId, modelId, contextId, revision, objectId));
        assertFalse(hasConstruct(service, projectId, modelId, contextId, revision, "feature.delete.attribute.001"));
        assertFalse(hasConstruct(service, projectId, modelId, contextId, revision, "state.delete.attribute.high.001"));
        assertFalse(hasConstruct(service, projectId, modelId, contextId, revision, "fact.delete.attribute.consumption.001"));
    }

    @Test
    void commitsStructuralLabelsFansAndCompletenessWithoutChangingTheFactIdentity() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.structural.001", "command.project.structural.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.structural.001", "command.model.structural.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.structural.001", projectId, modelId)).get("root_context_id"));
        for (String suffix : List.of("whole", "part-a", "part-b")) {
            revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.structural.object." + suffix, "command.structural.object." + suffix, revision,
                    "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.structural." + suffix, "name", suffix, "layout", map("x", 40, "y", 40)))));
        }

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.structural.tagged.001", "command.structural.tagged.001", revision,
                "CREATE_FACT", structuralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-STRUCT-003", "fact.structural.tagged.001",
                        List.of("element.structural.whole", "element.structural.part-a"), List.of(
                                map("slot_id", "forward_tag", "text", "contains"),
                                map("slot_id", "reverse_tag", "text", "belongs to")), "NOT_APPLICABLE"))));
        Map<?, ?> tagged = construct(service, projectId, modelId, contextId, revision, "fact.structural.tagged.001");
        assertEquals("symbol.link.structural.tagged.bidirectional", tagged.get("symbol_ref"));
        assertEquals("BIDIRECTIONAL", tagged.get("direction"));
        assertEquals(List.of(map("slot_id", "forward_tag", "text", "contains"), map("slot_id", "reverse_tag", "text", "belongs to")), tagged.get("labels"));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.structural.state.whole.001", "command.structural.state.whole.001", revision,
                "CREATE_STATE", statePayload(contextId, "element.structural.whole", "state.structural.whole.ready", "Ready"))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.structural.state.part-a.001", "command.structural.state.part-a.001", revision,
                "CREATE_STATE", statePayload(contextId, "element.structural.part-a", "state.structural.part-a.ready", "Ready"))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.structural.state-tagged.001", "command.structural.state-tagged.001", revision,
                "CREATE_FACT", structuralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-STRUCT-010", "fact.structural.state-tagged.001",
                        List.of("state.structural.whole.ready", "state.structural.part-a.ready"), List.of(map("slot_id", "forward_tag", "text", "owns")), "NOT_APPLICABLE"))));
        Map<?, ?> stateTaggedOption = ((List<?>) data(service.capabilities("request.structural.state-tagged.update-option.001", projectId, modelId, revision,
                "fact.structural.state-tagged.001", "UPDATE_FACT")).get("options")).stream()
                .map(Map.class::cast)
                .filter(value -> "CAP-ISO-STRUCT-010".equals(((Map<?, ?>) value.get("capability_ref")).get("capability_id")))
                .findFirst().orElseThrow();
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.structural.state-tagged.update.001", "command.structural.state-tagged.update.001", revision,
                "UPDATE_FACT", map("fact_id", "fact.structural.state-tagged.001", "expected_capability_ref", map("capability_id", "CAP-ISO-STRUCT-010"),
                        "replacement", map("direction", "BIDIRECTIONAL", "labels", List.of(
                                map("slot_id", "forward_tag", "text", "owns"), map("slot_id", "reverse_tag", "text", "belongs to"))),
                        "capability_query_id", stateTaggedOption.get("capability_query_id"), "selected_option_id", stateTaggedOption.get("option_id")))));
        Map<?, ?> updatedStateTagged = construct(service, projectId, modelId, contextId, revision, "fact.structural.state-tagged.001");
        assertEquals(List.of(map("slot_id", "forward_tag", "text", "owns"), map("slot_id", "reverse_tag", "text", "belongs to")), updatedStateTagged.get("labels"));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.structural.fan.001", "command.structural.fan.001", revision,
                "CREATE_FACT", structuralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-STRUCT-005", "fact.structural.fan.001",
                        List.of("element.structural.whole", "element.structural.part-a", "element.structural.part-b"), List.of(), "INCOMPLETE"))));
        Map<?, ?> fan = construct(service, projectId, modelId, contextId, revision, "fact.structural.fan.001");
        assertEquals("INCOMPLETE", fan.get("collection_completeness"));
        assertEquals(3, ((List<?>) fan.get("endpoints")).size());

        Map<?, ?> option = ((List<?>) data(service.capabilities("request.structural.fan.update-option.001", projectId, modelId, revision,
                "fact.structural.fan.001", "UPDATE_FACT", List.of("element.structural.whole", "element.structural.part-a"))).get("options")).stream()
                .map(Map.class::cast)
                .filter(value -> "CAP-ISO-STRUCT-005".equals(((Map<?, ?>) value.get("capability_ref")).get("capability_id")))
                .findFirst().orElseThrow();
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.structural.fan.update.001", "command.structural.fan.update.001", revision,
                "UPDATE_FACT", map("fact_id", "fact.structural.fan.001", "expected_capability_ref", map("capability_id", "CAP-ISO-STRUCT-005"),
                        "replacement", map("normalized_endpoints", option.get("normalized_endpoints"), "collection_completeness", "COMPLETE"),
                        "capability_query_id", option.get("capability_query_id"), "selected_option_id", option.get("option_id")))));
        Map<?, ?> updatedFan = construct(service, projectId, modelId, contextId, revision, "fact.structural.fan.001");
        assertEquals("fact.structural.fan.001", updatedFan.get("target_id"));
        assertEquals("COMPLETE", updatedFan.get("collection_completeness"));
        assertEquals(2, ((List<?>) updatedFan.get("endpoints")).size());
    }

    @Test
    void normalizesReverseFeatureEndpointsForExhibitionAndStateSpecifiedCharacterization() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.feature-struct.001", "command.project.feature-struct.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.feature-struct.001", "command.model.feature-struct.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.feature-struct.001", projectId, modelId)).get("root_context_id"));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.feature-struct.object.001", "command.feature-struct.object.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.feature-struct.object", "name", "Device", "layout", map("x", 40, "y", 40)))));
        Map<?, ?> featureOption = ((List<?>) data(service.capabilities("request.feature-struct.feature-option.001", projectId, modelId, revision,
                "element.feature-struct.object", "CREATE_FEATURE")).get("options")).stream().map(Map.class::cast)
                .filter(option -> "CAP-FEAT-ATTRIBUTE-001".equals(((Map<?, ?>) option.get("capability_ref")).get("capability_id"))).findFirst().orElseThrow();
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.feature-struct.feature.001", "command.feature-struct.feature.001", revision,
                "CREATE_FEATURE", map("context_id", contextId, "owner_element_id", "element.feature-struct.object", "feature_id", "feature.feature-struct.temperature",
                        "feature_kind", "ATTRIBUTE", "capability_ref", map("capability_id", "CAP-FEAT-ATTRIBUTE-001"), "name", "Temperature",
                        "occurrence", map("ownership", "OWNED", "construct_role", "ATTRIBUTE_NODE"), "layout", map("x", 260, "y", 40),
                        "capability_query_id", featureOption.get("capability_query_id"), "selected_option_id", featureOption.get("option_id")))));
        Map<?, ?> stateOption = (Map<?, ?>) ((List<?>) data(service.capabilities("request.feature-struct.state-option.001", projectId, modelId, revision,
                "feature.feature-struct.temperature", "CREATE_STATE")).get("options")).getFirst();
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.feature-struct.state.001", "command.feature-struct.state.001", revision,
                "CREATE_STATE", map("context_id", contextId, "owner_ref", map("target_kind", "FEATURE", "target_id", "feature.feature-struct.temperature"),
                        "capability_ref", map("capability_id", "CAP-FEAT-STATE-001"), "state_id", "state.feature-struct.temperature.high", "name_or_value", "High",
                        "state_roles", List.of(), "occurrence", map("ownership", "OWNED", "construct_role", "FEATURE_STATE_NODE"), "layout", map("x", 280, "y", 100),
                        "capability_query_id", stateOption.get("capability_query_id"), "selected_option_id", stateOption.get("option_id")))));

        Map<?, ?> reverseExhibitionOption = structuralOption(service, projectId, modelId, revision, "CAP-ISO-STRUCT-006",
                List.of("feature.feature-struct.temperature", "element.feature-struct.object"));
        assertNormalizedEndpoint(reverseExhibitionOption, 0, "EXHIBITOR_THING", "ELEMENT", "element.feature-struct.object");
        assertNormalizedEndpoint(reverseExhibitionOption, 1, "FEATURE_THING", "FEATURE", "feature.feature-struct.temperature");
        Map<?, ?> reverseCharacterizationOption = structuralOption(service, projectId, modelId, revision, "CAP-ISO-STRUCT-009",
                List.of("state.feature-struct.temperature.high", "element.feature-struct.object"));
        assertNormalizedEndpoint(reverseCharacterizationOption, 0, "EXHIBITOR_THING_OR_STATE", "ELEMENT", "element.feature-struct.object");
        assertNormalizedEndpoint(reverseCharacterizationOption, 1, "VALUE_STATE", "STATE", "state.feature-struct.temperature.high");

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.feature-struct.exhibition.001", "command.feature-struct.exhibition.001", revision,
                "CREATE_FACT", structuralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-STRUCT-006", "fact.feature-struct.exhibition",
                        List.of("feature.feature-struct.temperature", "element.feature-struct.object"), List.of(), "COMPLETE"))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.feature-struct.characterization.001", "command.feature-struct.characterization.001", revision,
                "CREATE_FACT", structuralFactPayload(service, projectId, modelId, revision, contextId, "CAP-ISO-STRUCT-009", "fact.feature-struct.characterization",
                        List.of("state.feature-struct.temperature.high", "element.feature-struct.object"), List.of(), "NOT_APPLICABLE"))));

        assertEquals("FEATURE", ((Map<?, ?>) ((List<?>) construct(service, projectId, modelId, contextId, revision, "fact.feature-struct.exhibition").get("endpoints")).get(1)).get("target_kind"));
        assertEquals("STATE", ((Map<?, ?>) ((List<?>) construct(service, projectId, modelId, contextId, revision, "fact.feature-struct.characterization").get("endpoints")).get(1)).get("target_kind"));
        assertTrue(hasConstruct(service, projectId, modelId, contextId, revision, "feature.feature-struct.temperature"));
        assertTrue(hasConstruct(service, projectId, modelId, contextId, revision, "state.feature-struct.temperature.high"));

        List<?> invalidExhibition = (List<?>) data(service.capabilities("request.feature-struct.invalid-exhibition.001", projectId, modelId, revision, null, "CREATE_FACT",
                List.of("element.feature-struct.object", "element.feature-struct.object"))).get("options");
        assertFalse(invalidExhibition.stream().map(Map.class::cast)
                .anyMatch(option -> "CAP-ISO-STRUCT-006".equals(((Map<?, ?>) option.get("capability_ref")).get("capability_id"))));
        List<?> invalidCharacterization = (List<?>) data(service.capabilities("request.feature-struct.invalid-characterization.001", projectId, modelId, revision, null, "CREATE_FACT",
                List.of("element.feature-struct.object", "feature.feature-struct.temperature"))).get("options");
        assertFalse(invalidCharacterization.stream().map(Map.class::cast)
                .anyMatch(option -> "CAP-ISO-STRUCT-009".equals(((Map<?, ?>) option.get("capability_ref")).get("capability_id"))));
        List<?> invalidFeatureCharacterization = (List<?>) data(service.capabilities("request.feature-struct.invalid-feature-characterization.001",
                projectId, modelId, revision, null, "CREATE_FACT",
                List.of("feature.feature-struct.temperature", "state.feature-struct.temperature.high"))).get("options");
        assertFalse(invalidFeatureCharacterization.stream().map(Map.class::cast)
                .anyMatch(option -> "CAP-ISO-STRUCT-009".equals(((Map<?, ?>) option.get("capability_ref")).get("capability_id"))));
    }

    @Test
    void doesNotOfferStructuralCandidatesForMixedObjectAndProcessEndpoints() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.structural-mixed.001", "command.project.structural-mixed.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.structural-mixed.001", "command.model.structural-mixed.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.structural-mixed.001", projectId, modelId)).get("root_context_id"));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.structural-mixed.object.001", "command.structural-mixed.object.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.structural-mixed.object", "name", "Object", "layout", map("x", 40, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.structural-mixed.process.001", "command.structural-mixed.process.001", revision,
                "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", "element.structural-mixed.process", "name", "Process", "layout", map("x", 300, "y", 40)))));

        List<?> options = (List<?>) data(service.capabilities("request.structural-mixed.options.001", projectId, modelId, revision, null, "CREATE_FACT",
                List.of("element.structural-mixed.object", "element.structural-mixed.process"))).get("options");
        assertFalse(options.stream().map(Map.class::cast)
                .anyMatch(option -> string(((Map<?, ?>) option.get("capability_ref")).get("capability_id")).startsWith("CAP-ISO-STRUCT-")));
    }

    @Test
    void createsAnObjectStateAndReturnsItFromTheReopenedProjection() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.state.001", "command.project.state.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.state.001", "command.model.state.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.state.001", projectId, modelId)).get("root_context_id"));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.state.owner.001", "command.state.owner.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.material.001", "name", "Material", "layout", map("x", 40, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.state.create.001", "command.state.create.001", revision,
                "CREATE_STATE", statePayload(contextId, "element.material.001", "state.material.ready", "Ready"))));

        Map<String, Object> projection = data(service.projection("request.projection.state.001", projectId, modelId, contextId, revision));
        Map<?, ?> state = ((java.util.List<?>) projection.get("constructs")).stream().filter(Map.class::isInstance).map(Map.class::cast)
                .filter(value -> "state.material.ready".equals(value.get("target_id"))).findFirst().orElseThrow();
        assertEquals("STATE_NODE", state.get("construct_role"));
        assertEquals("Ready", state.get("label"));
        assertEquals(88.0, ((Map<?, ?>) state.get("layout")).get("width"));

        Map<String, Object> capabilities = data(service.capabilities("request.capabilities.state.001", projectId, modelId, revision, "element.material.001", "CREATE_STATE"));
        assertEquals(true, ((Map<?, ?>) ((java.util.List<?>) capabilities.get("options")).getFirst()).get("enabled"));
        assertEquals(true, ((java.util.List<?>) capabilities.get("allowed")).contains("CREATE_STATE"));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.state.update.001", "command.state.update.001", revision,
                "UPDATE_STATE", map("state_id", "state.material.ready", "expected_owner_ref", map("target_kind", "ELEMENT", "target_id", "element.material.001"),
                        "changes", map("name_or_value", "Available", "state_roles", java.util.List.of("FINAL")), "capability_query_id", "query.state.update.001", "selected_option_id", "option.state.update.001"))));
        Map<?, ?> updatedState = construct(service, projectId, modelId, contextId, revision, "state.material.ready");
        assertEquals("Available", updatedState.get("label"));
        assertEquals(java.util.List.of("FINAL"), updatedState.get("state_roles"));

        Map<String, Object> deleteCapabilities = data(service.capabilities("request.capabilities.state.delete.001", projectId, modelId, revision, string(state.get("occurrence_id")), "DELETE_CONSTRUCT"));
        Map<?, ?> deleteOption = (Map<?, ?>) ((java.util.List<?>) deleteCapabilities.get("options")).getFirst();
        assertEquals(true, deleteOption.get("enabled"));
        String impactToken = string(deleteOption.get("impact_token"));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.state.delete.001", "command.state.delete.001", revision,
                "DELETE_CONSTRUCT", map("selection_id", state.get("occurrence_id"), "construct_kind", "STATE", "construct_id", "state.material.ready", "delete_mode", "DELETE_TARGET", "impact_token", impactToken))));
        assertFalse(hasConstruct(service, projectId, modelId, contextId, revision, "state.material.ready"));
    }

    @Test
    void createsStateSpecifiedConsumptionWithStateOplAndTrace() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.state-consumption.001", "command.project.state-consumption.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.state-consumption.001", "command.model.state-consumption.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.state-consumption.001", projectId, modelId)).get("root_context_id"));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.state-consumption.object.001", "command.state-consumption.object.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.material.001", "name", "Material", "layout", map("x", 40, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.state-consumption.process.001", "command.state-consumption.process.001", revision,
                "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", "element.processing.001", "name", "Processing", "layout", map("x", 320, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.state-consumption.state.001", "command.state-consumption.state.001", revision,
                "CREATE_STATE", statePayload(contextId, "element.material.001", "state.material.ready", "Ready"))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.state-consumption.fact.001", "command.state-consumption.fact.001", revision,
                "CREATE_FACT", map("kind", "CONSUMPTION", "fact_id", "fact.processing.consumes.ready-material", "object_id", "element.material.001", "state_id", "state.material.ready", "process_id", "element.processing.001"))));

        Map<String, Object> projection = data(service.projection("request.projection.state-consumption.001", projectId, modelId, contextId, revision));
        Map<?, ?> state = ((java.util.List<?>) projection.get("constructs")).stream().filter(Map.class::isInstance).map(Map.class::cast)
                .filter(value -> "state.material.ready".equals(value.get("target_id"))).findFirst().orElseThrow();
        Map<?, ?> consumption = ((java.util.List<?>) projection.get("constructs")).stream().filter(Map.class::isInstance).map(Map.class::cast)
                .filter(value -> "fact.processing.consumes.ready-material".equals(value.get("target_id"))).findFirst().orElseThrow();
        assertEquals("state.material.ready", consumption.get("source_id"));

        Map<String, Object> text = data(service.text("request.text.state-consumption.001", projectId, modelId, contextId, revision));
        assertEquals("Processing consumes Ready Material.", ((Map<?, ?>) ((java.util.List<?>) text.get("sentences")).getFirst()).get("text"));
        Map<?, ?> trace = (Map<?, ?>) ((java.util.List<?>) text.get("traces")).getFirst();
        assertTrue(((java.util.List<?>) trace.get("occurrence_ids")).contains(state.get("occurrence_id")));
        Map<String, Object> deleteCapabilities = data(service.capabilities("request.capabilities.state-consumption.delete.001", projectId, modelId, revision, string(state.get("occurrence_id")), "DELETE_CONSTRUCT"));
        assertEquals(false, ((Map<?, ?>) ((java.util.List<?>) deleteCapabilities.get("options")).getFirst()).get("enabled"));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.state-consumption.other-object.001", "command.state-consumption.other-object.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.other-material.001", "name", "Other Material", "layout", map("x", 40, "y", 180)))));
        String invalidOwnerRevision = revision;
        ApiException rejected = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request.state-consumption.invalid-owner.001", "command.state-consumption.invalid-owner.001", invalidOwnerRevision,
                        "CREATE_FACT", map("kind", "CONSUMPTION", "fact_id", "fact.processing.consumes.invalid-state", "object_id", "element.other-material.001", "state_id", "state.material.ready", "process_id", "element.processing.001"))));
        assertEquals(ApiErrorCode.DOMAIN_REJECTED, rejected.code());
    }

    @Test
    void changesStatePresentationWithoutChangingStateOwnership() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        String projectId = string(data(service.createProject(projectRequest("request.project.presentation.001", "command.project.presentation.001"))).get("project_id"));
        Map<String, Object> model = data(service.createModel(projectId, modelRequest("request.model.presentation.001", "command.model.presentation.001")));
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        String contextId = string(data(service.workspace("request.workspace.presentation.001", projectId, modelId)).get("root_context_id"));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.presentation.owner.001", "command.presentation.owner.001", revision,
                "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.material.001", "name", "Material", "layout", map("x", 40, "y", 40)))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.presentation.state.001", "command.presentation.state.001", revision,
                "CREATE_STATE", statePayload(contextId, "element.material.001", "state.material.ready", "Ready"))));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.presentation.suppress.001", "command.presentation.suppress.001", revision,
                "STATE_SUPPRESS", statePresentationPayload(contextId, "state.material.ready"))));
        Map<String, Object> suppressedProjection = data(service.projection("request.projection.presentation.suppressed.001", projectId, modelId, contextId, revision));
        assertFalse(((java.util.List<?>) suppressedProjection.get("constructs")).stream().map(Map.class::cast)
                .anyMatch(value -> "state.material.ready".equals(value.get("target_id"))));
        Map<?, ?> suppressed = (Map<?, ?>) ((java.util.List<?>) suppressedProjection.get("suppressed_states")).getFirst();
        assertEquals("state.material.ready", suppressed.get("state_id"));
        assertEquals(Map.of("target_kind", "ELEMENT", "target_id", "element.material.001"), suppressed.get("owner_ref"));
        assertEquals("Ready", suppressed.get("name_or_value"));
        assertEquals(java.util.List.of("INITIAL"), suppressed.get("state_roles"));
        assertEquals("SUPPRESSED", suppressed.get("explicitness"));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.presentation.explicit.001", "command.presentation.explicit.001", revision,
                "STATE_EXPLICIT", statePresentationPayload(contextId, "state.material.ready"))));
        Map<String, Object> explicitProjection = data(service.projection("request.projection.presentation.explicit.001", projectId, modelId, contextId, revision));
        assertTrue(((java.util.List<?>) explicitProjection.get("suppressed_states")).isEmpty());
        Map<?, ?> explicitState = ((java.util.List<?>) explicitProjection.get("constructs")).stream().map(Map.class::cast)
                .filter(value -> "state.material.ready".equals(value.get("target_id"))).findFirst().orElseThrow();
        assertEquals("EXPLICIT", explicitState.get("explicitness"));
        assertEquals("UNFOLDED", explicitState.get("fold_state"));

        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.presentation.fold.001", "command.presentation.fold.001", revision,
                "FOLD", statePresentationPayload(contextId, "state.material.ready"))));
        assertEquals("FOLDED", construct(service, projectId, modelId, contextId, revision, "state.material.ready").get("fold_state"));
        revision = committed(service.edit(projectId, modelId, contextId, editRequest("request.presentation.unfold.001", "command.presentation.unfold.001", revision,
                "UNFOLD", statePresentationPayload(contextId, "state.material.ready"))));
        assertEquals("UNFOLDED", construct(service, projectId, modelId, contextId, revision, "state.material.ready").get("fold_state"));
    }

    private void assertProfileForbidden(LocalApiService service, String projectId, String modelId, String contextId, String revision, String commandType, Map<String, Object> payload) {
        ApiException rejected = assertThrows(ApiException.class, () -> service.edit(projectId, modelId, contextId,
                editRequest("request." + commandType.toLowerCase() + ".001", "command." + commandType.toLowerCase() + ".001", revision, commandType, payload)));
        assertEquals(ApiErrorCode.PROFILE_FORBIDDEN, rejected.code());
    }

    private Map<String, Object> projectRequest(String requestId, String commandId) {
        return map("request_id", requestId, "command_id", commandId, "name", "Demo Project");
    }

    private Map<String, Object> modelRequest(String requestId, String commandId) {
        return map("request_id", requestId, "command_id", commandId, "name", "Processing Model", "binding", binding());
    }

    private Map<String, Object> editRequest(String requestId, String commandId, String revision, String type, Map<String, Object> payload) {
        return map("request_id", requestId, "command_id", commandId, "base_revision", revision, "binding", binding(), "command_type", type, "payload", payload);
    }

    private Map<String, Object> validationRequest(String requestId, String commandId, String revision) {
        return map("request_id", requestId, "command_id", commandId, "input_revision", revision, "binding", binding(), "scope", "FULL");
    }

    private Map<String, Object> baselineRequest(String requestId, String commandId, String revision, String evidence) {
        return map("request_id", requestId, "command_id", commandId, "base_revision", revision, "binding", binding(), "name", "Baseline 1", "evidence_summary_token", evidence);
    }

    private Map<String, Object> binding() {
        return map("profile_id", "profile.iso19450.2024.draft", "profile_version", "0.2.0", "rule_set_id", "rules.iso19450.2024.draft", "rule_version", "0.1.0");
    }

    private Map<String, Object> completeStatePayload(String contextId) {
        return statePayload(contextId, "element.owner.001", "state.owner.ready", "Ready");
    }

    private Map<String, Object> statePresentationPayload(String contextId, String stateId) {
        return map("context_id", contextId, "state_id", stateId);
    }

    private Map<String, Object> statePayload(String contextId, String ownerId, String stateId, String name) {
        return map("context_id", contextId,
                "state_id", stateId,
                "owner_ref", map("target_kind", "ELEMENT", "target_id", ownerId),
                "capability_ref", map("capability_id", "capability.state.001", "version", "0.2.0"),
                "name_or_value", name,
                "state_roles", java.util.List.of("INITIAL"),
                "occurrence", map("ownership", "OWNED", "construct_role", "STATE_NODE"),
                "layout", map("x", 80, "y", 120),
                "capability_query_id", "query.state.001",
                "selected_option_id", "option.state.001");
    }

    private Map<String, Object> completeFactPayload(String contextId) {
        return map("context_id", contextId,
                "capability_ref", map("capability_id", "capability.fact.001", "version", "0.2.0"),
                "fact_family", "TRANSFORMATION",
                "normalized_endpoints", java.util.List.of(
                        map("role", "SOURCE", "target_ref", map("target_kind", "ELEMENT", "target_id", "element.object.001"), "ordinal", 0),
                        map("role", "TARGET", "target_ref", map("target_kind", "ELEMENT", "target_id", "element.process.001"), "ordinal", 1)),
                "direction", "DIRECTED",
                "labels", java.util.List.of(),
                "modifiers", java.util.List.of(),
                "logical_groups", java.util.List.of(),
                "occurrence", map("ownership", "OWNED", "construct_role", "FACT_LINK"),
                "layout", map(),
                "capability_query_id", "query.fact.001",
                "selected_option_id", "option.fact.001");
    }

    private Map<String, Object> proceduralFactPayload(LocalApiService service, String projectId, String modelId, String revision, String contextId,
                                                       String capabilityId, String family, String factId, List<String> endpointIds, List<Map<String, Object>> modifiers) {
        Map<?, ?> option = ((List<?>) data(service.capabilities("request.procedural-option." + factId, projectId, modelId, revision, null, "CREATE_FACT", endpointIds)).get("options")).stream()
                .map(Map.class::cast)
                .filter(value -> capabilityId.equals(((Map<?, ?>) value.get("capability_ref")).get("capability_id")))
                .findFirst().orElseThrow();
        return map("context_id", contextId, "capability_ref", map("capability_id", capabilityId), "fact_family", family, "fact_id", factId,
                "normalized_endpoints", option.get("normalized_endpoints"), "direction", "DIRECTED", "labels", List.of(), "modifiers", modifiers,
                "logical_groups", List.of(), "occurrence", map("ownership", "OWNED", "construct_role", "PROCEDURAL_LINK"), "layout", map("x", 180, "y", 80),
                "capability_query_id", option.get("capability_query_id"), "selected_option_id", option.get("option_id"));
    }

    private Map<String, Object> structuralFactPayload(LocalApiService service, String projectId, String modelId, String revision, String contextId,
                                                       String capabilityId, String factId, List<String> endpointIds, List<Map<String, Object>> labels,
                                                       String collectionCompleteness) {
        Map<?, ?> option = structuralOption(service, projectId, modelId, revision, capabilityId, endpointIds);
        Map<?, ?> direction = ((List<?>) option.get("required_fields")).stream().map(Map.class::cast)
                .filter(value -> "direction".equals(value.get("field_id"))).findFirst().orElseThrow();
        return map("context_id", contextId, "capability_ref", map("capability_id", capabilityId), "fact_family", "STRUCTURAL", "fact_id", factId,
                "normalized_endpoints", option.get("normalized_endpoints"), "direction", ((List<?>) direction.get("allowed_values")).getFirst(), "labels", labels, "modifiers", List.of(),
                "logical_groups", List.of(), "collection_completeness", collectionCompleteness,
                "occurrence", map("ownership", "OWNED", "construct_role", "STRUCTURAL_LINK"), "layout", map("x", 180, "y", 80),
                "capability_query_id", option.get("capability_query_id"), "selected_option_id", option.get("option_id"));
    }

    private Map<?, ?> structuralOption(LocalApiService service, String projectId, String modelId, String revision,
                                       String capabilityId, List<String> endpointIds) {
        return ((List<?>) data(service.capabilities("request.structural-option." + capabilityId + "." + revision, projectId, modelId, revision, null, "CREATE_FACT", endpointIds)).get("options")).stream()
                .map(Map.class::cast)
                .filter(value -> capabilityId.equals(((Map<?, ?>) value.get("capability_ref")).get("capability_id")))
                .findFirst().orElseThrow();
    }

    private void assertNormalizedEndpoint(Map<?, ?> option, int index, String role, String targetKind, String targetId) {
        Map<?, ?> endpoint = (Map<?, ?>) ((List<?>) option.get("normalized_endpoints")).get(index);
        Map<?, ?> target = (Map<?, ?>) endpoint.get("target_ref");
        assertEquals(role, endpoint.get("role"));
        assertEquals(index, endpoint.get("ordinal"));
        assertEquals(targetKind, target.get("target_kind"));
        assertEquals(targetId, target.get("target_id"));
    }

    private Map<String, Object> proceduralFactUpdatePayload(LocalApiService service, String projectId, String modelId, String revision,
                                                             String factId, String capabilityId, Map<String, Object> replacement) {
        Map<String, Object> capabilities = data(service.capabilities("request.procedural-update-option." + factId, projectId, modelId, revision, factId, "UPDATE_FACT"));
        assertTrue(((List<?>) capabilities.get("allowed")).contains("UPDATE_FACT"));
        List<?> options = (List<?>) capabilities.get("options");
        Map<?, ?> option = (Map<?, ?>) options.getFirst();
        assertEquals("UPDATE_FACT", option.get("command_type"));
        return map("fact_id", factId, "expected_capability_ref", map("capability_id", capabilityId), "replacement", replacement,
                "capability_query_id", option.get("capability_query_id"), "selected_option_id", option.get("option_id"));
    }

    private List<ProceduralExpectation> proceduralExpectations() {
        return List.of(
                expectation("001", "TRANSFORMATION", "symbol.link.consumption", List.of("element.input.001", "element.processing.001"), "Processing consumes Input."),
                expectation("002", "TRANSFORMATION", "symbol.link.result", List.of("element.processing.001", "element.input.001"), "Processing yields Input."),
                expectation("003", "TRANSFORMATION", "symbol.link.effect", List.of("element.input.001", "element.processing.001", "element.output.001"), "Processing affects Output."),
                expectation("004", "ENABLING", "symbol.link.agent", List.of("element.input.001", "element.processing.001"), "Input handles Processing."),
                expectation("005", "ENABLING", "symbol.link.instrument", List.of("element.input.001", "element.processing.001"), "Processing requires Input."),
                expectation("006", "TRANSFORMATION", "symbol.link.consumption.state", List.of("state.input.ready", "element.processing.001"), "Processing consumes Ready Input."),
                expectation("007", "TRANSFORMATION", "symbol.link.result.state", List.of("element.processing.001", "state.input.ready"), "Processing yields Ready Input."),
                expectation("008", "TRANSFORMATION", "symbol.link.effect.state.input-output", List.of("state.input.ready", "element.processing.001", "state.output.finished"), "Processing changes Input from Ready to Finished."),
                expectation("009", "TRANSFORMATION", "symbol.link.effect.state.input", List.of("state.input.ready", "element.processing.001", "element.output.001"), "Processing changes Output from Ready."),
                expectation("010", "TRANSFORMATION", "symbol.link.effect.state.output", List.of("element.input.001", "element.processing.001", "state.output.finished"), "Processing changes Input to Finished."),
                expectation("011", "ENABLING", "symbol.link.agent.state", List.of("state.input.ready", "element.processing.001"), "Ready Input handles Processing."),
                expectation("012", "ENABLING", "symbol.link.instrument.state", List.of("state.input.ready", "element.processing.001"), "Processing requires Ready Input."),
                expectation("013", "PROFILE_FACT", "symbol.link.invocation", List.of("element.processing.001", "element.handling.001"), "Processing invokes Handling."),
                expectation("014", "PROFILE_FACT", "symbol.link.invocation.self", List.of("element.processing.001", "element.processing.001"), "Processing invokes itself."),
                expectation("015", "PROFILE_FACT", "symbol.link.exception.overtime", List.of("element.processing.001", "element.handling.001"), "When Processing exceeds PT5M, Handling handles the exception."),
                expectation("016", "PROFILE_FACT", "symbol.link.exception.undertime", List.of("element.processing.001", "element.handling.001"), "When Processing is under PT5M, Handling handles the exception."));
    }

    private ProceduralExpectation expectation(String suffix, String family, String symbolRef, List<String> endpointIds, String opl) {
        String capabilityId = "CAP-ISO-PROC-" + suffix;
        return new ProceduralExpectation(capabilityId, family, "fact.procedural.matrix." + suffix, symbolRef, endpointIds, opl, suffix.equals("015") || suffix.equals("016"));
    }

    private ControlExpectation controlExpectation(
            String factId,
            String baseCapabilityId,
            String firstControlId,
            String secondControlId) {
        return new ControlExpectation(factId, baseCapabilityId, firstControlId, secondControlId);
    }

    private record ControlExpectation(
            String factId,
            String baseCapabilityId,
            String firstControlId,
            String secondControlId) {
    }

    private record ProceduralExpectation(String capabilityId, String family, String factId, String symbolRef, List<String> endpointIds, String opl, boolean requiresDuration) {
    }

    private boolean hasConstruct(LocalApiService service, String projectId, String modelId, String contextId, String revision, String targetId) {
        return ((java.util.List<?>) data(service.projection("request.projection.check." + targetId, projectId, modelId, contextId, revision)).get("constructs")).stream()
                .filter(Map.class::isInstance).map(Map.class::cast).anyMatch(value -> targetId.equals(value.get("target_id")));
    }

    private Map<?, ?> construct(LocalApiService service, String projectId, String modelId, String contextId, String revision, String targetId) {
        return ((java.util.List<?>) data(service.projection("request.projection.construct." + targetId, projectId, modelId, contextId, revision)).get("constructs")).stream()
                .filter(Map.class::isInstance).map(Map.class::cast).filter(value -> targetId.equals(value.get("target_id"))).findFirst().orElseThrow();
    }

    private Map<?, ?> deleteOption(LocalApiService service, String projectId, String modelId, String revision, Map<?, ?> construct, String mode) {
        return ((List<?>) data(service.capabilities("request.delete.option." + mode + "." + construct.get("target_id"), projectId, modelId, revision,
                string(construct.get("occurrence_id")), "DELETE_CONSTRUCT")).get("options")).stream()
                .map(Map.class::cast).filter(option -> mode.equals(option.get("delete_mode"))).findFirst().orElseThrow();
    }

    private Map<String, Object> deletePayload(Map<?, ?> construct, Map<?, ?> option) {
        Map<?, ?> target = (Map<?, ?>) option.get("delete_target");
        return map("selection_id", construct.get("occurrence_id"), "construct_kind", target.get("kind"), "construct_id", target.get("id"),
                "delete_mode", option.get("delete_mode"), "impact_token", option.get("impact_token"));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> data(Map<String, Object> response) {
        return (Map<String, Object>) response.get("data");
    }

    @SuppressWarnings("unchecked")
    private String committed(Map<String, Object> response) {
        return string(((Map<String, Object>) response.get("meta")).get("committed_revision"));
    }

    private Map<String, Object> map(Object... pairs) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int index = 0; index < pairs.length; index += 2) result.put((String) pairs[index], pairs[index + 1]);
        return result;
    }

    private String string(Object value) {
        return value == null ? null : value.toString();
    }

    private String digest(String value) {
        try {
            byte[] bytes = java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(bytes.length * 2);
            for (byte item : bytes) result.append(String.format("%02x", item));
            return result.toString();
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
}
