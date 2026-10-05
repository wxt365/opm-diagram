package org.opm.localruntime.api;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.application.LocalApiService;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.releaseauthoring.visualcommon.OneShotVisualCommonCommitFaultPort;
import org.opm.localruntime.releaseauthoring.visualcommon.VisualCommonFixtureMaterializer;
import org.opm.localruntime.releaseevidence.fault.E2EFaultPort;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LocalApiControllerTest {

    private static final String SESSION = "test-local-session";

    @TempDir
    Path temporaryDirectory;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory));
        mvc = MockMvcBuilders.standaloneSetup(new LocalApiController(service))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new LocalWriteRequestGuard(new LocalSessionToken(SESSION)))
                .build();
    }

    @Test
    void coversEveryFrozenP0OperationIdThroughMvc() throws Exception {
        perform(get("/api/v1/projects").param("request_id", "request.projects.001")).andExpect(status().isOk());

        Map<String, Object> projectResult = response(perform(write(post("/api/v1/projects"), map("request_id", "request.project.001", "command_id", "command.project.001", "name", "MVC Project"))).andExpect(status().isCreated()).andReturn());
        String projectId = string(data(projectResult).get("project_id"));
        perform(get("/api/v1/projects/{projectId}", projectId).param("request_id", "request.project.get.001")).andExpect(status().isOk());
        perform(get("/api/v1/projects/{projectId}/models", projectId).param("request_id", "request.models.001")).andExpect(status().isOk());

        Map<String, Object> modelResult = response(perform(write(post("/api/v1/projects/{projectId}/models", projectId), modelRequest("request.model.001", "command.model.001"))).andExpect(status().isCreated()).andReturn());
        Map<String, Object> model = data(modelResult);
        String modelId = string(model.get("model_id"));
        String revision = string(model.get("head_revision"));
        Map<String, Object> workspaceResult = response(perform(get("/api/v1/projects/{projectId}/models/{modelId}/workspace-session", projectId, modelId).param("request_id", "request.workspace.001")).andExpect(status().isOk()).andReturn());
        String contextId = string(data(workspaceResult).get("root_context_id"));

        Map<String, Object> exactWorkspace = response(perform(get("/api/v1/projects/{projectId}/models/{modelId}/workspace-session", projectId, modelId)
                .param("request_id", "request.workspace.exact").param("revision", revision).param("context", "context.foreign")).andExpect(status().isOk()).andReturn());
        org.junit.jupiter.api.Assertions.assertEquals(contextId, data(exactWorkspace).get("current_context_id"));
        org.junit.jupiter.api.Assertions.assertEquals("READONLY_SNAPSHOT", ((Map<?, ?>) data(exactWorkspace).get("model")).get("access_mode"));
        perform(get("/api/v1/projects/{projectId}/models/{modelId}/workspace-session", projectId, modelId)
                .param("request_id", "request.workspace.invalid").param("revision", "../bad")).andExpect(status().isBadRequest());
        perform(get("/api/v1/projects/{projectId}/models/{modelId}/workspace-session", projectId, modelId)
                .param("request_id", "request.workspace.missing").param("revision", "revision.missing")).andExpect(status().isNotFound());

        perform(get("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/navigation", projectId, modelId, contextId).param("request_id", "request.navigation.001").param("revision", revision)).andExpect(status().isOk());
        perform(get("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/projection", projectId, modelId, contextId).param("request_id", "request.projection.001").param("revision", revision)).andExpect(status().isOk());
        perform(get("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/command-capabilities", projectId, modelId, contextId).param("request_id", "request.capabilities.001").param("revision", revision)).andExpect(status().isOk());

        revision = committed(response(perform(write(post("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/commands", projectId, modelId, contextId), editRequest("request.object.001", "command.object.001", revision, "CREATE_ELEMENT", map("kind", "OBJECT", "element_id", "element.raw.material", "name", "Raw Material")))).andExpect(status().isOk()).andReturn()));
        revision = committed(response(perform(write(post("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/commands", projectId, modelId, contextId), editRequest("request.process.001", "command.process.001", revision, "CREATE_ELEMENT", map("kind", "PROCESS", "element_id", "element.processing", "name", "Processing")))).andExpect(status().isOk()).andReturn()));
        revision = committed(response(perform(write(post("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/commands", projectId, modelId, contextId), editRequest("request.fact.001", "command.fact.001", revision, "CREATE_FACT", map("kind", "CONSUMPTION", "object_id", "element.raw.material", "process_id", "element.processing")))).andExpect(status().isOk()).andReturn()));

        perform(get("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/text-projection", projectId, modelId, contextId).param("request_id", "request.text.001").param("revision", revision)).andExpect(status().isOk());
        perform(get("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/findings", projectId, modelId, contextId).param("request_id", "request.findings.001").param("revision", revision)).andExpect(status().isOk());
        perform(get("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/operation-records", projectId, modelId, contextId).param("request_id", "request.operation-records.001").param("revision", revision)).andExpect(status().isOk());
        Map<String, Object> validation = response(perform(write(post("/api/v1/projects/{projectId}/models/{modelId}/validation-tasks", projectId, modelId), validationRequest("request.validation.001", "command.validation.001", revision))).andExpect(status().isAccepted()).andReturn());
        String taskId = string(data(validation).get("task_id"));
        perform(get("/api/v1/projects/{projectId}/models/{modelId}/revisions", projectId, modelId).param("request_id", "request.revisions.001")).andExpect(status().isOk());

        String token = "evidence." + digest(taskId + revision).substring(0, 32);
        perform(write(post("/api/v1/projects/{projectId}/models/{modelId}/baselines", projectId, modelId), baselineRequest("request.baseline.001", "command.baseline.001", revision, token))).andExpect(status().isCreated());
        perform(get("/api/v1/tasks/{taskId}", taskId).param("request_id", "request.task.001")).andExpect(status().isOk());
        perform(get("/api/v1/tasks/{taskId}/events", taskId).param("request_id", "request.events.001")).andExpect(status().isOk());
    }

    @Test
    void rejectsWriteWithoutTheLocalSessionToken() throws Exception {
        for (String path : java.util.List.of(
                "/api/v1/projects",
                "/api/v1/projects/project.test/models",
                "/api/v1/projects/project.test/models/model.test/contexts/context.test/commands",
                "/api/v1/projects/project.test/models/model.test/validation-tasks",
                "/api/v1/projects/project.test/models/model.test/baselines")) {
            mvc.perform(post(path).header("Origin", "http://localhost").contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(post("/api/v1/projects").header("X-OPM-Session", SESSION).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/projects").header("Origin", "http://localhost").header("X-OPM-Session", SESSION).contentType(MediaType.APPLICATION_JSON).content("{}")
                        .with(request -> { request.setServerName("example.test"); return request; }))
                .andExpect(status().isForbidden());
    }

    @Test
    void returnsModifierCombinationInvalidForFrozenControlAndStructuralCases() throws Exception {
        ModelFixture fixture = createModelFixture("modifier");

        Map<String, Object> controlOption = capabilityOption(fixture, fixture.factId(), "UPDATE_FACT", List.of(), "CAP-ISO-CTRL-001");
        Map<String, Object> controlPayload = map(
                "fact_id", fixture.factId(),
                "expected_capability_ref", map("capability_id", "CAP-ISO-PROC-001"),
                "replacement", map("modifiers", List.of(
                        map("modifier_id", "control.capability", "value", "CAP-ISO-CTRL-001"),
                        map("modifier_id", "control.segment", "value", "PROCESS_OUTPUT"))),
                "capability_query_id", controlOption.get("capability_query_id"),
                "selected_option_id", controlOption.get("option_id"));
        MvcResult controlResult = perform(write(command(fixture), editRequest(
                        "request.control.invalid.001", "command.control.invalid.001", fixture.revision(), "UPDATE_FACT", controlPayload)))
                .andExpect(status().isUnprocessableEntity())
                .andReturn();
        assertErrorEnvelope(controlResult, "MODIFIER_COMBINATION_INVALID");

        Map<String, Object> structuralOption = capabilityOption(fixture, null, "CREATE_FACT",
                List.of(fixture.firstObjectId(), fixture.secondObjectId()), "CAP-ISO-STRUCT-001");
        Map<String, Object> structuralPayload = map(
                "context_id", fixture.contextId(),
                "capability_ref", structuralOption.get("capability_ref"),
                "fact_family", "STRUCTURAL",
                "fact_id", "fact.structural.invalid.001",
                "normalized_endpoints", structuralOption.get("normalized_endpoints"),
                "direction", "DIRECTED",
                "labels", List.of(),
                "modifiers", List.of(),
                "logical_groups", List.of(),
                "collection_completeness", "NOT_APPLICABLE",
                "occurrence", map("ownership", "OWNED", "construct_role", "STRUCTURAL_LINK"),
                "layout", map("x", 180, "y", 220),
                "capability_query_id", structuralOption.get("capability_query_id"),
                "selected_option_id", structuralOption.get("option_id"));
        MvcResult structuralResult = perform(write(command(fixture), editRequest(
                        "request.structural.invalid.001", "command.structural.invalid.001", fixture.revision(), "CREATE_FACT", structuralPayload)))
                .andExpect(status().isUnprocessableEntity())
                .andReturn();
        assertErrorEnvelope(structuralResult, "MODIFIER_COMBINATION_INVALID");
    }

    @Test
    void updatesElementNameAndReturnsInvalidArgumentForBlankNameThroughMvc() throws Exception {
        ModelFixture fixture = createModelFixture("name-edit");
        Map<String, Object> option = capabilityOption(
                fixture, fixture.firstObjectId(), "UPDATE_PROPERTY", List.of(), "CAP-OBJECT-001");
        Map<String, Object> payload = map(
                "target_ref", map("target_kind", "ELEMENT", "target_id", fixture.firstObjectId()),
                "property_name", "name",
                "value", "Renamed Object",
                "capability_query_id", option.get("capability_query_id"),
                "selected_option_id", option.get("option_id"));

        Map<String, Object> updateResult = response(perform(write(command(fixture), editRequest(
                        "request.name-edit.001", "command.name-edit.001", fixture.revision(), "UPDATE_PROPERTY", payload)))
                .andExpect(status().isOk())
                .andReturn());
        String committedRevision = committed(updateResult);
        Map<String, Object> projection = response(perform(get(
                        "/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/projection",
                        fixture.projectId(), fixture.modelId(), fixture.contextId())
                .param("request_id", "request.name-edit.projection.001")
                .param("revision", committedRevision)).andExpect(status().isOk()).andReturn());
        Map<?, ?> renamed = ((List<?>) data(projection).get("constructs")).stream()
                .map(Map.class::cast)
                .filter(item -> fixture.firstObjectId().equals(item.get("target_id")))
                .findFirst()
                .orElseThrow();
        assertEquals("Renamed Object", renamed.get("label"));

        ModelFixture current = new ModelFixture(
                fixture.projectId(), fixture.modelId(), fixture.contextId(), committedRevision,
                fixture.firstObjectId(), fixture.secondObjectId(), fixture.processId(), fixture.factId());
        Map<String, Object> currentOption = capabilityOption(
                current, current.firstObjectId(), "UPDATE_PROPERTY", List.of(), "CAP-OBJECT-001");
        Map<String, Object> blankPayload = map(
                "target_ref", map("target_kind", "ELEMENT", "target_id", current.firstObjectId()),
                "property_name", "name",
                "value", "   ",
                "capability_query_id", currentOption.get("capability_query_id"),
                "selected_option_id", currentOption.get("option_id"));
        MvcResult blankResult = perform(write(command(current), editRequest(
                        "request.name-edit.blank.001", "command.name-edit.blank.001", committedRevision,
                        "UPDATE_PROPERTY", blankPayload)))
                .andExpect(status().isBadRequest())
                .andReturn();
        assertErrorEnvelope(blankResult, "INVALID_ARGUMENT", "INPUT");
    }

    @Test
    void updatesOwnedAttributeLayoutThroughMvc() throws Exception {
        ModelFixture fixture = createModelFixture("attribute-layout");
        Map<String, Object> option = capabilityOption(
                fixture, fixture.firstObjectId(), "CREATE_FEATURE", List.of(), "CAP-FEAT-ATTRIBUTE-001");
        Map<String, Object> featurePayload = map(
                "context_id", fixture.contextId(),
                "owner_element_id", fixture.firstObjectId(),
                "feature_id", "feature.mvc.attribute-layout.temperature",
                "feature_kind", "ATTRIBUTE",
                "capability_ref", option.get("capability_ref"),
                "name", "Temperature",
                "occurrence", map("ownership", "OWNED", "construct_role", "ATTRIBUTE_NODE"),
                "layout", map("x", 260, "y", 80),
                "capability_query_id", option.get("capability_query_id"),
                "selected_option_id", option.get("option_id"));
        String featureRevision = committed(response(perform(write(command(fixture), editRequest(
                        "request.mvc.attribute-layout.create.001", "command.mvc.attribute-layout.create.001",
                        fixture.revision(), "CREATE_FEATURE", featurePayload)))
                .andExpect(status().isOk()).andReturn()));

        ModelFixture featureFixture = new ModelFixture(
                fixture.projectId(), fixture.modelId(), fixture.contextId(), featureRevision,
                fixture.firstObjectId(), fixture.secondObjectId(), fixture.processId(), fixture.factId());
        Map<String, Object> projection = response(perform(get(
                        "/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/projection",
                        fixture.projectId(), fixture.modelId(), fixture.contextId())
                .param("request_id", "request.mvc.attribute-layout.projection.before")
                .param("revision", featureRevision)).andExpect(status().isOk()).andReturn());
        Map<?, ?> attribute = ((List<?>) data(projection).get("constructs")).stream()
                .map(Map.class::cast)
                .filter(item -> "feature.mvc.attribute-layout.temperature".equals(item.get("target_id")))
                .findFirst().orElseThrow();

        String movedRevision = committed(response(perform(write(command(featureFixture), editRequest(
                        "request.mvc.attribute-layout.move.001", "command.mvc.attribute-layout.move.001", featureRevision,
                        "UPDATE_LAYOUT", map("occurrence_id", attribute.get("occurrence_id"), "layout", map("x", 360, "y", 240)))))
                .andExpect(status().isOk()).andReturn()));
        Map<String, Object> movedProjection = response(perform(get(
                        "/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/projection",
                        fixture.projectId(), fixture.modelId(), fixture.contextId())
                .param("request_id", "request.mvc.attribute-layout.projection.after")
                .param("revision", movedRevision)).andExpect(status().isOk()).andReturn());
        Map<?, ?> moved = ((List<?>) data(movedProjection).get("constructs")).stream()
                .map(Map.class::cast)
                .filter(item -> "feature.mvc.attribute-layout.temperature".equals(item.get("target_id")))
                .findFirst().orElseThrow();
        assertEquals(360.0d, ((Number) ((Map<?, ?>) moved.get("layout")).get("x")).doubleValue());
        assertEquals(240.0d, ((Number) ((Map<?, ?>) moved.get("layout")).get("y")).doubleValue());
    }

    @Test
    void returnsTheFrozenRuntimeRelationCatalogWithoutCommandAuthorization() throws Exception {
        ModelFixture fixture = createModelFixture("relation-catalog");

        Map<String, Object> response = response(perform(get("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/relation-catalog",
                fixture.projectId(), fixture.modelId(), fixture.contextId())
                .param("request_id", "request.relation-catalog.001")
                .param("revision", fixture.revision())).andExpect(status().isOk()).andReturn());
        List<Map<String, Object>> items = ((List<?>) data(response).get("items")).stream().map(Map.class::cast)
                .map(item -> (Map<String, Object>) item).toList();

        assertEquals(34, items.size());
        assertEquals("CAP-ISO-PROC-001", items.getFirst().get("capability_id"));
        assertEquals("CAP-ISO-STRUCT-010", items.getLast().get("capability_id"));
        assertEquals(16, items.stream().filter(item -> "PROCEDURAL".equals(item.get("family"))).count());
        assertEquals(8, items.stream().filter(item -> "CONTROL".equals(item.get("family"))).count());
        assertEquals(10, items.stream().filter(item -> "STRUCTURAL".equals(item.get("family"))).count());
        Map<String, Object> consumption = items.getFirst();
        assertEquals("CREATE_FACT", consumption.get("interaction_mode"));
        assertEquals("symbol.link.consumption", ((Map<?, ?>) consumption.get("symbol_descriptor")).get("id"));
        assertEquals(2, ((Map<?, ?>) consumption.get("endpoint_summary")).get("min_endpoints"));
        assertEquals(2, ((List<?>) ((Map<?, ?>) consumption.get("endpoint_summary")).get("roles")).size());
        items.stream().filter(item -> "CONTROL".equals(item.get("family"))).forEach(item -> {
            assertEquals(false, item.get("enabled"));
            assertEquals(List.of("CONTROL_REQUIRES_BASE_FACT"), item.get("reason_codes"));
        });

        Map<String, Object> selectedResponse = response(perform(get("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/relation-catalog",
                fixture.projectId(), fixture.modelId(), fixture.contextId())
                .param("request_id", "request.relation-catalog.selected.001")
                .param("revision", fixture.revision())
                .param("selection_id", fixture.factId())).andExpect(status().isOk()).andReturn());
        List<Map<String, Object>> selectedItems = ((List<?>) data(selectedResponse).get("items")).stream().map(Map.class::cast)
                .map(item -> (Map<String, Object>) item).toList();
        Set<String> enabledControls = selectedItems.stream()
                .filter(item -> "CONTROL".equals(item.get("family")) && Boolean.TRUE.equals(item.get("enabled")))
                .map(item -> string(item.get("capability_id")))
                .collect(java.util.stream.Collectors.toSet());
        assertEquals(Set.of("CAP-ISO-CTRL-001", "CAP-ISO-CTRL-005"), enabledControls);
        Map<String, Object> transformingEvent = selectedItems.stream()
                .filter(item -> "CAP-ISO-CTRL-001".equals(item.get("capability_id"))).findFirst().orElseThrow();
        assertEquals("UPDATE_SELECTED_FACT", transformingEvent.get("interaction_mode"));
        assertEquals("BASE_PROCEDURAL_FACT", ((Map<?, ?>) ((List<?>) ((Map<?, ?>) transformingEvent.get("endpoint_summary")).get("roles")).getFirst()).get("role"));
    }

    @Test
    void exposesTheReleaseVisualCommonFaultCommandOnlyForTheArmedExactFixture() throws Exception {
        Path storage = temporaryDirectory.resolve("armed-visual-common");
        new VisualCommonFixtureMaterializer().materialize(visualFixture(), storage,
                temporaryDirectory.resolve("armed-visual-common-attestation.json"), 1782864000L);
        LocalApiService armedService = new LocalApiService(new ProjectDatabaseFactory(storage),
                new FileProfilePackageLoader(Path.of("..", "..", "packages", "profiles")), E2EFaultPort.NOOP,
                new OneShotVisualCommonCommitFaultPort());
        mvc = MockMvcBuilders.standaloneSetup(new LocalApiController(armedService))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new LocalWriteRequestGuard(new LocalSessionToken(SESSION)))
                .build();

        Map<String, Object> exact = response(perform(get("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/release-visual-common-fault-command",
                "project.visual.blocked-feedback", "model.visual.blocked-feedback", "context.visual.blocked-feedback.sd")
                .param("request_id", "request.release-visual-common.001")
                .param("revision", "revision.visual.blocked-feedback")).andExpect(status().isOk()).andReturn());
        assertEquals(map("command_id", "command.visual.blocked-feedback.persistence-failed", "command_type", "CREATE_FACT", "payload", map(
                "kind", "CONSUMPTION", "fact_id", "fact.visual.blocked-feedback.one-shot",
                "object_id", "element.visual.blocked-feedback.input", "process_id", "element.visual.blocked-feedback.process",
                "layout", map("x", 340, "y", 266))), data(exact));

        perform(get("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/release-visual-common-fault-command",
                "project.visual.blocked-feedback", "model.visual.blocked-feedback", "context.visual.blocked-feedback.sd")
                .param("request_id", "request.release-visual-common.drift")
                .param("revision", "revision.visual.blocked-feedback.drift")).andExpect(status().isNotFound());

        LocalApiService noopService = new LocalApiService(new ProjectDatabaseFactory(storage));
        mvc = MockMvcBuilders.standaloneSetup(new LocalApiController(noopService))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new LocalWriteRequestGuard(new LocalSessionToken(SESSION)))
                .build();
        perform(get("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/release-visual-common-fault-command",
                "project.visual.blocked-feedback", "model.visual.blocked-feedback", "context.visual.blocked-feedback.sd")
                .param("request_id", "request.release-visual-common.noop")
                .param("revision", "revision.visual.blocked-feedback")).andExpect(status().isNotFound());
    }

    @Test
    void keepsUnlistedOwnerAndCandidateFailuresAsDomainRejected() throws Exception {
        ModelFixture fixture = createModelFixture("domain");

        Map<String, Object> stateOption = capabilityOption(fixture, fixture.firstObjectId(), "CREATE_STATE", List.of(), "CAP-STATE-001");
        Map<String, Object> statePayload = map(
                "context_id", fixture.contextId(),
                "state_id", "state.invalid-owner.001",
                "owner_ref", map("target_kind", "ELEMENT", "target_id", "element.missing.001"),
                "capability_ref", stateOption.get("capability_ref"),
                "name_or_value", "Invalid owner",
                "state_roles", List.of("INITIAL"),
                "occurrence", map("ownership", "OWNED", "construct_role", "STATE_NODE"),
                "layout", map("x", 80, "y", 240),
                "capability_query_id", stateOption.get("capability_query_id"),
                "selected_option_id", stateOption.get("option_id"));
        MvcResult ownerResult = perform(write(command(fixture), editRequest(
                        "request.state.invalid-owner.001", "command.state.invalid-owner.001", fixture.revision(), "CREATE_STATE", statePayload)))
                .andExpect(status().isUnprocessableEntity())
                .andReturn();
        assertErrorEnvelope(ownerResult, "DOMAIN_REJECTED");

        Map<String, Object> structuralOption = capabilityOption(fixture, null, "CREATE_FACT",
                List.of(fixture.firstObjectId(), fixture.secondObjectId()), "CAP-ISO-STRUCT-001");
        Map<String, Object> staleCandidatePayload = map(
                "context_id", fixture.contextId(),
                "capability_ref", structuralOption.get("capability_ref"),
                "fact_family", "STRUCTURAL",
                "fact_id", "fact.structural.stale.001",
                "normalized_endpoints", structuralOption.get("normalized_endpoints"),
                "direction", "DIRECTED",
                "labels", List.of(map("slot_id", "forward_tag", "text", "contains")),
                "modifiers", List.of(),
                "logical_groups", List.of(),
                "collection_completeness", "NOT_APPLICABLE",
                "occurrence", map("ownership", "OWNED", "construct_role", "STRUCTURAL_LINK"),
                "layout", map("x", 180, "y", 300),
                "capability_query_id", structuralOption.get("capability_query_id"),
                "selected_option_id", "option.structural.mismatched");
        MvcResult candidateResult = perform(write(command(fixture), editRequest(
                        "request.structural.stale.001", "command.structural.stale.001", fixture.revision(), "CREATE_FACT", staleCandidatePayload)))
                .andExpect(status().isUnprocessableEntity())
                .andReturn();
        assertErrorEnvelope(candidateResult, "DOMAIN_REJECTED");
    }

    private ModelFixture createModelFixture(String suffix) throws Exception {
        Map<String, Object> projectResult = response(perform(write(post("/api/v1/projects"), map(
                "request_id", "request.project." + suffix,
                "command_id", "command.project." + suffix,
                "name", "MVC Project " + suffix))).andExpect(status().isCreated()).andReturn());
        String projectId = string(data(projectResult).get("project_id"));
        Map<String, Object> modelResult = response(perform(write(post("/api/v1/projects/{projectId}/models", projectId),
                modelRequest("request.model." + suffix, "command.model." + suffix))).andExpect(status().isCreated()).andReturn());
        String modelId = string(data(modelResult).get("model_id"));
        String revision = string(data(modelResult).get("head_revision"));
        String contextId = string(data(response(perform(get("/api/v1/projects/{projectId}/models/{modelId}/workspace-session", projectId, modelId)
                .param("request_id", "request.workspace." + suffix)).andExpect(status().isOk()).andReturn())).get("root_context_id"));

        String firstObjectId = "element." + suffix + ".object-a";
        String secondObjectId = "element." + suffix + ".object-b";
        String processId = "element." + suffix + ".process";
        revision = createElement(projectId, modelId, contextId, revision, firstObjectId, "OBJECT", "Object A");
        revision = createElement(projectId, modelId, contextId, revision, secondObjectId, "OBJECT", "Object B");
        revision = createElement(projectId, modelId, contextId, revision, processId, "PROCESS", "Processing");

        ModelFixture beforeFact = new ModelFixture(projectId, modelId, contextId, revision, firstObjectId, secondObjectId, processId, "fact." + suffix + ".consumption");
        Map<String, Object> option = capabilityOption(beforeFact, null, "CREATE_FACT", List.of(firstObjectId, processId), "CAP-ISO-PROC-001");
        Map<String, Object> factPayload = map(
                "context_id", contextId,
                "capability_ref", option.get("capability_ref"),
                "fact_family", "TRANSFORMATION",
                "fact_id", beforeFact.factId(),
                "normalized_endpoints", option.get("normalized_endpoints"),
                "direction", "DIRECTED",
                "labels", List.of(),
                "modifiers", List.of(),
                "logical_groups", List.of(),
                "occurrence", map("ownership", "OWNED", "construct_role", "PROCEDURAL_LINK"),
                "layout", map("x", 180, "y", 120),
                "capability_query_id", option.get("capability_query_id"),
                "selected_option_id", option.get("option_id"));
        revision = committed(response(perform(write(command(beforeFact), editRequest(
                "request.fact." + suffix, "command.fact." + suffix, revision, "CREATE_FACT", factPayload))).andExpect(status().isOk()).andReturn()));
        return new ModelFixture(projectId, modelId, contextId, revision, firstObjectId, secondObjectId, processId, beforeFact.factId());
    }

    private String createElement(String projectId, String modelId, String contextId, String revision,
                                 String elementId, String kind, String name) throws Exception {
        ModelFixture fixture = new ModelFixture(projectId, modelId, contextId, revision, null, null, null, null);
        return committed(response(perform(write(command(fixture), editRequest(
                "request." + elementId, "command." + elementId, revision, "CREATE_ELEMENT",
                map("kind", kind, "element_id", elementId, "name", name, "layout", map("x", 80, "y", 80)))))
                .andExpect(status().isOk()).andReturn()));
    }

    private Path visualFixture() {
        return Path.of("..", "..", "packages", "profiles", "profile.iso19450.2024.draft", "0.2.0", "handoff", "releases",
                "clean-37c5412a9c12", "dev-canvas-06", "common-fixtures", "0.2.0", "visual", "BLOCKED_FEEDBACK.json");
    }

    private Map<String, Object> capabilityOption(ModelFixture fixture, String selectionId, String intent,
                                                  List<String> endpoints, String capabilityId) throws Exception {
        MockHttpServletRequestBuilder request = get("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/command-capabilities",
                fixture.projectId(), fixture.modelId(), fixture.contextId())
                .param("request_id", "request.option." + capabilityId.toLowerCase())
                .param("revision", fixture.revision())
                .param("intent", intent);
        if (selectionId != null) request.param("selection_id", selectionId);
        for (String endpoint : endpoints) request.param("endpoint", endpoint);
        Map<String, Object> capabilityResult = response(perform(request).andExpect(status().isOk()).andReturn());
        return ((List<?>) data(capabilityResult).get("options")).stream()
                .map(Map.class::cast)
                .filter(option -> capabilityId.equals(string(((Map<?, ?>) option.get("capability_ref")).get("capability_id"))))
                .map(option -> (Map<String, Object>) option)
                .findFirst()
                .orElseThrow();
    }

    private MockHttpServletRequestBuilder command(ModelFixture fixture) {
        return post("/api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/commands",
                fixture.projectId(), fixture.modelId(), fixture.contextId());
    }

    @SuppressWarnings("unchecked")
    private void assertErrorEnvelope(MvcResult result, String expectedCode) throws Exception {
        assertErrorEnvelope(result, expectedCode, "DOMAIN");
    }

    @SuppressWarnings("unchecked")
    private void assertErrorEnvelope(MvcResult result, String expectedCode, String expectedCategory) throws Exception {
        assertEquals(MediaType.APPLICATION_PROBLEM_JSON_VALUE, result.getResponse().getContentType());
        byte[] rawBody = result.getResponse().getContentAsByteArray();
        String decoded = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(rawBody))
                .toString();
        assertFalse(decoded.isBlank());
        Map<String, Object> envelope = objectMapper.readValue(rawBody, new TypeReference<>() { });
        assertEquals(Set.of("error"), envelope.keySet());
        Map<String, Object> error = (Map<String, Object>) envelope.get("error");
        assertEquals(Set.of("code", "category", "message", "retryable", "diagnostic_id"), error.keySet());
        assertEquals(expectedCode, error.get("code"));
        assertEquals(expectedCategory, error.get("category"));
        assertEquals(false, error.get("retryable"));
        assertTrue(string(error.get("message")).length() > 0);
        assertTrue(string(error.get("diagnostic_id")).matches("^[A-Za-z][A-Za-z0-9._:-]{2,159}$"));
    }

    private MockHttpServletRequestBuilder write(MockHttpServletRequestBuilder request, Map<String, Object> body) throws Exception {
        return request.header("Origin", "http://localhost").header("X-OPM-Session", SESSION).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body));
    }

    private ResultActions perform(MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request);
    }

    private Map<String, Object> modelRequest(String requestId, String commandId) { return map("request_id", requestId, "command_id", commandId, "name", "MVC Model", "binding", binding()); }
    private Map<String, Object> validationRequest(String requestId, String commandId, String revision) { return map("request_id", requestId, "command_id", commandId, "input_revision", revision, "binding", binding(), "scope", "FULL"); }
    private Map<String, Object> baselineRequest(String requestId, String commandId, String revision, String token) { return map("request_id", requestId, "command_id", commandId, "base_revision", revision, "binding", binding(), "name", "MVC Baseline", "evidence_summary_token", token); }
    private Map<String, Object> editRequest(String requestId, String commandId, String revision, String type, Map<String, Object> payload) { return map("request_id", requestId, "command_id", commandId, "base_revision", revision, "binding", binding(), "command_type", type, "payload", payload); }
    private Map<String, Object> binding() { return map("profile_id", "profile.iso19450.2024.draft", "profile_version", "0.2.0", "rule_set_id", "rules.iso19450.2024.draft", "rule_version", "0.1.0"); }
    private Map<String, Object> map(Object... pairs) { Map<String, Object> result = new LinkedHashMap<>(); for (int index = 0; index < pairs.length; index += 2) result.put((String) pairs[index], pairs[index + 1]); return result; }
    @SuppressWarnings("unchecked") private Map<String, Object> response(MvcResult result) throws Exception { return objectMapper.readValue(result.getResponse().getContentAsString(), new TypeReference<>() { }); }
    @SuppressWarnings("unchecked") private Map<String, Object> data(Map<String, Object> response) { return (Map<String, Object>) response.get("data"); }
    @SuppressWarnings("unchecked") private String committed(Map<String, Object> response) { return string(((Map<String, Object>) response.get("meta")).get("committed_revision")); }
    private String string(Object value) { return value == null ? null : value.toString(); }
    private String digest(String value) { try { byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)); StringBuilder result = new StringBuilder(bytes.length * 2); for (byte item : bytes) result.append(String.format("%02x", item)); return result.toString(); } catch (Exception exception) { throw new IllegalStateException(exception); } }
    private record ModelFixture(String projectId, String modelId, String contextId, String revision, String firstObjectId,
                                String secondObjectId, String processId, String factId) { }
}
