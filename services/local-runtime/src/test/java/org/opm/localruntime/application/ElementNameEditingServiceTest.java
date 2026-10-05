package org.opm.localruntime.application;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.api.ApiErrorCode;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.storage.ProjectDatabaseFactory;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ElementNameEditingServiceTest {

    @TempDir
    Path temporaryDirectory;

    @Test
    void renamesObjectAndKeepsIdentityLayoutAndDuplicateNamePolicy() {
        Fixture fixture = fixture("success");
        String revision = createElement(fixture, fixture.initialRevision(), "command.object", "element.object", "OBJECT", "Shared Name", 80, 96);
        revision = createElement(fixture, revision, "command.process", "element.process", "PROCESS", "Shared Name", 420, 96);
        revision = committed(fixture.service().edit(fixture.projectId(), fixture.modelId(), fixture.contextId(), editRequest(
                "request.fact", "command.fact", revision, "CREATE_FACT",
                map("kind", "CONSUMPTION", "fact_id", "fact.consumption", "object_id", "element.object", "process_id", "element.process"))));

        Map<String, Object> capabilities = data(fixture.service().capabilities(
                "request.capabilities", fixture.projectId(), fixture.modelId(), revision, "element.object", "UPDATE_PROPERTY"));
        assertTrue(list(capabilities.get("allowed")).contains("UPDATE_PROPERTY"));
        assertFalse(list(capabilities.get("forbidden")).stream().map(Map.class::cast)
                .anyMatch(item -> "UPDATE_PROPERTY".equals(item.get("command_type"))));
        Map<String, Object> option = mapValue(list(capabilities.get("options")).getFirst());
        assertEquals(List.of("target_ref", "property_name", "value"), list(option.get("required_fields")).stream()
                .map(Map.class::cast).map(item -> item.get("field_id")).toList());

        Map<String, Object> beforeConstruct = construct(fixture, revision, "element.object");
        String beforeText = firstSentence(fixture, revision);
        Map<String, Object> payload = renamePayload(option, "element.object", "Renamed Object");
        Map<String, Object> renameRequest = editRequest(
                "request.rename", "command.rename", revision, "UPDATE_PROPERTY", payload);
        revision = committed(fixture.service().edit(fixture.projectId(), fixture.modelId(), fixture.contextId(), renameRequest));
        assertEquals(revision, committed(fixture.service().edit(
                fixture.projectId(), fixture.modelId(), fixture.contextId(), renameRequest)));
        Map<String, Object> mismatchedReplay = new LinkedHashMap<>(renameRequest);
        mismatchedReplay.put("request_id", "request.rename.mismatched");
        assertCode(ApiErrorCode.IDEMPOTENCY_MISMATCH, () -> fixture.service().edit(
                fixture.projectId(), fixture.modelId(), fixture.contextId(), mismatchedReplay));

        Map<String, Object> construct = construct(fixture, revision, "element.object");
        assertEquals("Renamed Object", construct.get("label"));
        assertEquals(beforeConstruct.get("occurrence_id"), construct.get("occurrence_id"));
        assertEquals(beforeConstruct.get("layout"), construct.get("layout"));
        assertEquals("Shared Name consumes Shared Name.", beforeText);
        assertEquals("Shared Name consumes Renamed Object.", firstSentence(fixture, revision));
    }

    @Test
    void rejectsInvalidUnchangedAndUnsupportedNamesWithoutAdvancingHead() {
        Fixture fixture = fixture("invalid");
        String revision = createElement(fixture, fixture.initialRevision(), "command.object", "element.object", "OBJECT", "Material", 80, 96);
        Map<String, Object> option = propertyOption(fixture, revision, "element.object");

        assertCode(ApiErrorCode.INVALID_ARGUMENT, () -> rename(fixture, revision, "command.blank", option, "   "));
        assertCode(ApiErrorCode.INVALID_ARGUMENT, () -> rename(fixture, revision, "command.long", option, "\uD83D\uDE00".repeat(257)));
        assertCode(ApiErrorCode.DOMAIN_REJECTED, () -> rename(fixture, revision, "command.same", option, "Material"));
        Map<String, Object> extra = renamePayload(option, "element.object", "Changed");
        extra.put("layout", Map.of());
        assertCode(ApiErrorCode.INVALID_ARGUMENT, () -> fixture.service().edit(fixture.projectId(), fixture.modelId(), fixture.contextId(),
                editRequest("request.extra", "command.extra", revision, "UPDATE_PROPERTY", extra)));
        assertCode(ApiErrorCode.DOMAIN_REJECTED, () -> rename(fixture, revision, "command.missing", option, "Changed", "element.missing"));
        assertEquals(revision, currentRevision(fixture));

        Map<String, Object> unavailable = data(fixture.service().capabilities(
                "request.capabilities.missing", fixture.projectId(), fixture.modelId(), revision, "element.missing", "UPDATE_PROPERTY"));
        assertFalse(list(unavailable.get("allowed")).contains("UPDATE_PROPERTY"));
        assertTrue(list(unavailable.get("options")).isEmpty());
        assertEquals("ENDPOINT_KIND_MISMATCH", list(unavailable.get("forbidden")).stream().map(Map.class::cast)
                .filter(item -> "UPDATE_PROPERTY".equals(item.get("command_type"))).findFirst().orElseThrow().get("reason_code"));

        String boundaryRevision = rename(fixture, revision, "command.max", option, "\uD83D\uDE00".repeat(256));
        assertEquals("\uD83D\uDE00".repeat(256), construct(fixture, boundaryRevision, "element.object").get("label"));
    }

    @Test
    void distinguishesStaleAndBaselineAndReplaysDuplicateCommandBeforeRevisionChecks() {
        Fixture fixture = fixture("guards");
        Map<String, Object> createRequest = editRequest("request.object", "command.object", fixture.initialRevision(), "CREATE_ELEMENT",
                map("kind", "OBJECT", "element_id", "element.object", "name", "Material", "layout", map("x", 80, "y", 96)));
        String objectRevision = committed(fixture.service().edit(fixture.projectId(), fixture.modelId(), fixture.contextId(), createRequest));
        assertEquals(objectRevision, committed(fixture.service().edit(fixture.projectId(), fixture.modelId(), fixture.contextId(), createRequest)));
        Map<String, Object> changedDuplicate = new LinkedHashMap<>(createRequest);
        changedDuplicate.put("request_id", "request.object.changed");
        assertCode(ApiErrorCode.IDEMPOTENCY_MISMATCH, () -> fixture.service().edit(
                fixture.projectId(), fixture.modelId(), fixture.contextId(), changedDuplicate));

        Map<String, Object> objectOption = propertyOption(fixture, objectRevision, "element.object");
        String baselineRevision = rename(fixture, objectRevision, "command.rename.baseline", objectOption, "Baseline Name");
        Map<String, Object> validation = data(fixture.service().validate(fixture.projectId(), fixture.modelId(), map(
                "request_id", "request.validation", "command_id", "command.validation", "input_revision", baselineRevision,
                "binding", binding(), "scope", "FULL")));
        String taskId = validation.get("task_id").toString();
        String evidence = "evidence." + digest(taskId + baselineRevision).substring(0, 32);
        fixture.service().baseline(fixture.projectId(), fixture.modelId(), map(
                "request_id", "request.baseline", "command_id", "command.baseline", "base_revision", baselineRevision,
                "binding", binding(), "name", "Frozen", "evidence_summary_token", evidence));

        Map<String, Object> baselineOption = propertyOption(fixture, baselineRevision, "element.object");
        String currentRevision = rename(fixture, baselineRevision, "command.rename.current", baselineOption, "Current Name");
        assertEquals("REVISION_STALE", forbiddenReason(fixture, objectRevision));
        assertEquals("READ_ONLY_REVISION", forbiddenReason(fixture, baselineRevision));

        assertCode(ApiErrorCode.REVISION_CONFLICT, () -> rename(fixture, objectRevision, "command.stale", objectOption, "Stale"));
        assertCode(ApiErrorCode.READ_ONLY_REVISION, () -> rename(fixture, baselineRevision, "command.readonly", baselineOption, "Readonly"));
        assertEquals(currentRevision, currentRevision(fixture));
    }

    private Fixture fixture(String suffix) {
        LocalApiService service = new LocalApiService(new ProjectDatabaseFactory(temporaryDirectory.resolve(suffix)));
        String projectId = data(service.createProject(map("request_id", "request.project." + suffix,
                "command_id", "command.project." + suffix, "name", "Project"))).get("project_id").toString();
        Map<String, Object> model = data(service.createModel(projectId, map("request_id", "request.model." + suffix,
                "command_id", "command.model." + suffix, "name", "Model", "binding", binding())));
        String modelId = model.get("model_id").toString();
        String revision = model.get("head_revision").toString();
        String contextId = data(service.workspace("request.workspace." + suffix, projectId, modelId)).get("root_context_id").toString();
        return new Fixture(service, projectId, modelId, contextId, revision);
    }

    private String createElement(Fixture fixture, String revision, String commandId, String elementId, String kind, String name, int x, int y) {
        return committed(fixture.service().edit(fixture.projectId(), fixture.modelId(), fixture.contextId(), editRequest(
                "request." + commandId, commandId, revision, "CREATE_ELEMENT",
                map("kind", kind, "element_id", elementId, "name", name, "layout", map("x", x, "y", y)))));
    }

    private String rename(Fixture fixture, String revision, String commandId, Map<String, Object> option, String name) {
        return rename(fixture, revision, commandId, option, name, "element.object");
    }

    private String rename(Fixture fixture, String revision, String commandId, Map<String, Object> option, String name, String elementId) {
        return committed(fixture.service().edit(fixture.projectId(), fixture.modelId(), fixture.contextId(), editRequest(
                "request." + commandId, commandId, revision, "UPDATE_PROPERTY", renamePayload(option, elementId, name))));
    }

    private Map<String, Object> propertyOption(Fixture fixture, String revision, String elementId) {
        Map<String, Object> capabilities = data(fixture.service().capabilities(
                "request.capabilities." + revision, fixture.projectId(), fixture.modelId(), revision, elementId, "UPDATE_PROPERTY"));
        return mapValue(list(capabilities.get("options")).getFirst());
    }

    private String forbiddenReason(Fixture fixture, String revision) {
        Map<String, Object> capabilities = data(fixture.service().capabilities(
                "request.forbidden." + revision, fixture.projectId(), fixture.modelId(), revision, "element.object", "UPDATE_PROPERTY"));
        Map<?, ?> forbidden = list(capabilities.get("forbidden")).stream().map(Map.class::cast)
                .filter(item -> "UPDATE_PROPERTY".equals(item.get("command_type"))).findFirst().orElseThrow();
        return forbidden.get("reason_code").toString();
    }

    private Map<String, Object> renamePayload(Map<String, Object> option, String elementId, String name) {
        return map("target_ref", map("target_kind", "ELEMENT", "target_id", elementId), "property_name", "name", "value", name,
                "capability_query_id", option.get("capability_query_id"), "selected_option_id", option.get("option_id"));
    }

    private Map<String, Object> construct(Fixture fixture, String revision, String targetId) {
        return list(data(fixture.service().projection("request.projection." + revision, fixture.projectId(), fixture.modelId(), fixture.contextId(), revision)).get("constructs"))
                .stream().map(this::mapValue).filter(item -> targetId.equals(item.get("target_id"))).findFirst().orElseThrow();
    }

    private String firstSentence(Fixture fixture, String revision) {
        return mapValue(list(data(fixture.service().text("request.text." + revision, fixture.projectId(), fixture.modelId(), fixture.contextId(), revision)).get("sentences")).getFirst()).get("text").toString();
    }

    private String currentRevision(Fixture fixture) {
        return data(fixture.service().workspace("request.current", fixture.projectId(), fixture.modelId())).get("model") instanceof Map<?, ?> model
                ? model.get("head_revision").toString() : "";
    }

    private void assertCode(ApiErrorCode code, Runnable action) {
        assertEquals(code, assertThrows(ApiException.class, action::run).code());
    }

    private Map<String, Object> editRequest(String requestId, String commandId, String revision, String type, Map<String, Object> payload) {
        return map("request_id", requestId, "command_id", commandId, "base_revision", revision, "binding", binding(), "command_type", type, "payload", payload);
    }

    private Map<String, Object> binding() {
        return map("profile_id", "profile.iso19450.2024.draft", "profile_version", "0.2.0",
                "rule_set_id", "rules.iso19450.2024.draft", "rule_version", "0.1.0");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> data(Map<String, Object> envelope) {
        return (Map<String, Object>) envelope.get("data");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapValue(Object value) {
        return (Map<String, Object>) value;
    }

    @SuppressWarnings("unchecked")
    private List<Object> list(Object value) {
        return (List<Object>) value;
    }

    private String committed(Map<String, Object> envelope) {
        return mapValue(envelope.get("meta")).get("committed_revision").toString();
    }

    private String digest(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte item : bytes) result.append(String.format("%02x", item));
            return result.toString();
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private Map<String, Object> map(Object... values) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int index = 0; index < values.length; index += 2) result.put(values[index].toString(), values[index + 1]);
        return result;
    }

    private record Fixture(LocalApiService service, String projectId, String modelId, String contextId, String initialRevision) { }
}
