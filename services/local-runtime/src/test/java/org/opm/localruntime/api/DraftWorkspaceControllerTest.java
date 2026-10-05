package org.opm.localruntime.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.opm.localruntime.api.generated.DraftWorkspaceContract;
import org.opm.localruntime.application.DraftWorkspaceService;
import org.opm.localruntime.application.LocalApiService;
import org.opm.localruntime.assets.FileProfilePackageLoader;
import org.opm.localruntime.semantic.SaveContentDigestV1;
import org.opm.localruntime.storage.DraftJournalRepository;
import org.opm.localruntime.storage.ProjectDatabaseFactory;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.opm.localruntime.storage.DraftWorkspaceTestDatabase.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class DraftWorkspaceControllerTest {
    @TempDir Path temporary;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String URL = "/api/v2/projects/" + PROJECT + "/models/" + MODEL + "/draft/";
    private static final Clock CLOCK = Clock.fixed(Instant.parse(NOW), ZoneOffset.UTC);
    private MockMvc mvc;
    private Path database;
    @BeforeEach void setup() throws Exception { database = create(temporary, true, ignored -> { }); mvc = mvc(temporary, root().resolve("packages/profiles")); }

    private MockMvc mvc(Path storage, Path profiles) {
        var factory = new ProjectDatabaseFactory(storage); var loader = new FileProfilePackageLoader(profiles);
        return MockMvcBuilders.standaloneSetup(new DraftWorkspaceController(new DraftWorkspaceService(factory, new LocalApiService(factory, loader), loader, CLOCK)))
                .setControllerAdvice(new DraftWorkspaceExceptionHandler(), new ApiExceptionHandler()).addInterceptors(new DraftWriteRequestGuard(new LocalSessionToken("test-session"))).build();
    }

    private com.fasterxml.jackson.databind.node.ArrayNode planSteps() throws Exception {
        return (com.fasterxml.jackson.databind.node.ArrayNode) JSON.readTree("""
          [
            {"local_id":"local.beans","command_type":"CREATE_ELEMENT","kind":"OBJECT","name":"咖啡豆","layout":{"x":150,"y":200}},
            {"local_id":"local.raw","command_type":"CREATE_STATE","target":"local.beans","name":"待烘焙"},
            {"local_id":"local.done","command_type":"CREATE_STATE","target":"local.beans","name":"已烘焙"},
            {"local_id":"local.roast","command_type":"CREATE_ELEMENT","kind":"PROCESS","name":"烘焙","layout":{"x":450,"y":220}},
            {"local_id":"local.effect","command_type":"CREATE_FACT","capability_id":"CAP-ISO-PROC-008","endpoints":["local.raw","local.roast","local.done"]}
          ]
          """);
    }
    private ObjectNode planPreview(JsonNode token, JsonNode steps) {
        var input = query(token).put("plan_id", "command.plan.http"); input.set("steps", steps); input.putNull("next_scope"); return input;
    }
    private ObjectNode planEdit(JsonNode token, JsonNode steps) throws Exception {
        var scope = capabilities(token, "APPLY_MODEL_PLAN", null);
        var option = call("capabilities", scope, 200, "DraftCapabilitiesResult").at("/data/options/0");
        var payload = JSON.createObjectNode().put("context_id", CONTEXT); payload.set("steps", steps);
        return authorizedEdit(token, scope.get("scope"), option, payload).put("command_id", "command.plan.http");
    }
    @Test void modelPlanPreviewsProgressivelyThenCommitsAtomicallyAndRetriesOnce() throws Exception {
        var token = open().get("draft_token"); var before = snapshot(); var steps = planSteps();
        var first = JSON.createArrayNode().add(steps.get(0));
        var partial = call("plan-preview", planPreview(token, first), 200, "DraftModelPlanPreviewResult");
        assertTrue(partial.toString().contains("咖啡豆")); assertEquals(before, snapshot());
        var full = call("plan-preview", planPreview(token, steps), 200, "DraftModelPlanPreviewResult");
        assertEquals(partial.at("/data/constructs/0/occurrence_id"), full.at("/data/constructs/0/occurrence_id"));
        assertEquals(full.get("data"), call("plan-preview", planPreview(token, steps), 200, "DraftModelPlanPreviewResult").get("data"));
        assertTrue(full.toString().contains("待烘焙")); assertTrue(full.toString().contains("已烘焙"));
        assertTrue(full.toString().contains("CAP-ISO-PROC-008")); assertEquals(before, snapshot()); assertEquals(0, count(database, "draft_journal"));
        var lookup = planPreview(token, first); var next = capabilities(token, "CREATE_STATE", "local.beans").get("scope"); lookup.set("next_scope", next);
        assertFalse(call("plan-preview", lookup, 200, "DraftModelPlanPreviewResult").at("/capabilities/options").isEmpty());
        var request = planEdit(token, steps); var result = call("commands", request, 200, "DraftEditResult");
        assertEquals(1, result.at("/result_token/edit_seq").asInt()); assertEquals(1, count(database, "draft_journal")); assertEquals(1, count(database, "draft_receipt"));
        assertEquals(full.get("data"), call("projection", query(result.get("result_token")), 200, "DraftProjectionResult").get("data"));
        assertEquals(before.get("elements").size() + 2, snapshot().get("elements").size());
        assertEquals(before.get("states").size() + 2, snapshot().get("states").size()); assertEquals(before.get("facts").size() + 1, snapshot().get("facts").size());
        assertTrue(call("text", query(result.get("result_token")), 200, "DraftTextResult").toString().contains("烘焙 changes 咖啡豆 from 待烘焙 to 已烘焙"));
        request.put("request_id", "request.plan.retry"); assertEquals(result.get("result_token"), call("commands", request, 200, "DraftEditResult").get("result_token"));
        assertEquals(1, count(database, "draft_journal"));
        mvc = mvc(temporary, root().resolve("packages/profiles")); assertEquals(result.get("result_token"), open().get("draft_token"));
    }
    @Test void modelPlanRejectsInvalidLaterStepAndConflictsWithoutPartialWrites() throws Exception {
        var token = open().get("draft_token"); var before = snapshot();
        for (String fault : List.of("unknown", "duplicate", "capability", "cross", "owner")) {
            var steps = planSteps();
            switch (fault) {
                case "unknown" -> ((ObjectNode) steps.get(4)).putArray("endpoints").add("local.absent").add("local.roast");
                case "duplicate" -> ((ObjectNode) steps.get(4)).put("local_id", "local.beans");
                case "capability" -> ((ObjectNode) steps.get(4)).put("capability_id", "CAP-ISO-PROC-003");
                case "cross" -> ((ObjectNode) steps.get(1)).put("target", "occurrence.other");
                case "owner" -> ((ObjectNode) steps.get(4)).putArray("endpoints").add("local.raw").add("local.roast").add("local.beans");
            }
            error("plan-preview", planPreview(token, steps), 422, "DRAFT_EDIT_REJECTED");
            error("commands", planEdit(token, steps), 422, "DRAFT_EDIT_REJECTED");
            assertEquals(before, snapshot()); assertEquals(0, count(database, "draft_journal")); assertEquals(0, count(database, "draft_receipt"));
        }
        var request = planEdit(token, planSteps());
        var manual = JSON.createObjectNode().put("kind", "OBJECT").put("name", "手动对象"); manual.putObject("layout").put("x", 900).put("y", 30);
        call("commands", edit(token, "CREATE_ELEMENT", null, manual, 0), 200, "DraftEditResult"); var afterManual = snapshot();
        error("commands", request, 409, "DRAFT_CONFLICT"); error("plan-preview", planPreview(token, planSteps()), 409, "DRAFT_CONFLICT"); assertEquals(afterManual, snapshot());
    }
    @Test void modelPlanForbidsRefinedSharedRenameAndAcceptsLocalMove() throws Exception {
        var token = open().get("draft_token");
        var create = JSON.createObjectNode().put("context_id", CONTEXT).put("refinee_element_id", "element.raw.material").put("name", "对象子图");
        token = call("commands", edit(token, "CREATE_CONTEXT", "occurrence.raw", create, 0), 200, "DraftEditResult").get("result_token");
        var before = snapshot(); var rename = JSON.createArrayNode().addObject().put("local_id", "local.rename").put("command_type", "UPDATE_PROPERTY").put("target", "occurrence.raw").put("name", "新名称");
        error("plan-preview", planPreview(token, JSON.createArrayNode().add(rename)), 422, "DRAFT_EDIT_REJECTED"); assertEquals(before, snapshot());
        var move = JSON.createArrayNode().addObject().put("local_id", "local.move").put("command_type", "UPDATE_LAYOUT").put("target", "occurrence.raw");
        move.putObject("layout").put("x", 200).put("y", 200);
        call("plan-preview", planPreview(token, JSON.createArrayNode().add(move)), 200, "DraftModelPlanPreviewResult"); assertEquals(before, snapshot());
    }

    @Test void finalPlanFindingsRejectCrossObjectStateEffectWithoutWriting() throws Exception {
        var token = open().get("draft_token"); var before = snapshot(); var steps = planSteps();
        var effect = steps.remove(steps.size() - 1);
        steps.addObject().put("local_id", "local.other").put("command_type", "CREATE_ELEMENT").put("kind", "OBJECT").put("name", "另一对象")
                .putObject("layout").put("x", 750).put("y", 200);
        steps.addObject().put("local_id", "local.other.state").put("command_type", "CREATE_STATE").put("target", "local.other").put("name", "完成");
        ((ObjectNode) effect).putArray("endpoints").add("local.raw").add("local.roast").add("local.other.state"); steps.add(effect);
        assertTrue(call("plan-preview", planPreview(token, steps), 200, "DraftModelPlanPreviewResult").get("findings").isNull());
        var checked = call("plan-preview", planPreview(token, steps).put("finalize", true), 200, "DraftModelPlanPreviewResult");
        assertEquals("MODEL", checked.at("/findings/validation_scope").asText());
        assertTrue(checked.at("/findings/validation_summary/blocking").asInt() > 0);
        assertTrue(checked.at("/findings/items").toString().contains("STATE_OWNER_MISMATCH"));
        error("commands", planEdit(token, steps), 422, "DRAFT_EDIT_REJECTED");
        assertEquals(before, snapshot()); assertEquals(0, count(database, "draft_journal"));
        var valid = call("plan-preview", planPreview(token, planSteps()).put("finalize", true), 200, "DraftModelPlanPreviewResult");
        assertEquals(0, valid.at("/findings/validation_summary/blocking").asInt());
    }

    @Test void realEditsRegenerateTextAndReopenWithoutAddingRevisionsOrLosingFields() throws Exception {
        var original = snapshot(); var opened = open(); var token = opened.get("draft_token");
        assertEquals(token, opened.at("/save_state/checkpoint_token"));
        for (String kind : List.of("OBJECT", "PROCESS")) {
            var payload = JSON.createObjectNode().put("kind", kind).put("name", "新" + kind).put("element_id", "element.new." + kind.toLowerCase());
            payload.putObject("layout").put("x", 12.5).put("y", 44).put("width", 160).put("height", 72);
            var request = edit(token, "CREATE_ELEMENT", null, payload, kind.equals("OBJECT") ? 0 : 1);
            var result = call("commands", request, 200, "DraftEditResult"); token = result.get("result_token");
        }
        var rename = name("element.raw.material", " 新原料 ");
        var renamed = call("commands", edit(token, "UPDATE_PROPERTY", "occurrence.raw", rename, 0), 200, "DraftEditResult"); token = renamed.get("result_token");
        var text = call("text", query(token), 200, "DraftTextResult"); assertTrue(text.toString().contains("新原料")); assertFalse(text.at("/data/traces").isEmpty());
        assertFalse(renamed.get("text_trace_ids").isEmpty());
        var move = JSON.createObjectNode().put("occurrence_id", "occurrence.raw"); move.putObject("layout").put("x", -0d).put("y", 120.5);
        token = call("commands", edit(token, "UPDATE_LAYOUT", "occurrence.raw", move, 0), 200, "DraftEditResult").get("result_token");
        assertEquals(4, token.get("edit_seq").intValue());
        var after = snapshot();
        for (String pointer : List.of("/model_header", "/profile_binding", "/schema_set_ref", "/revision_id", "/elements/0/essence", "/elements/0/affiliation", "/elements/0/name/namespace", "/layouts/0/route_points", "/layouts/0/width")) assertEquals(original.at(pointer), after.at(pointer), pointer);
        assertEquals(" 新原料 ", after.at("/elements/0/name/local_name").asText()); assertTrue(after.get("text_artifact").toString().contains("新原料"));
        assertEquals(Double.doubleToRawLongBits(-0d), Double.doubleToRawLongBits(after.at("/layouts/0/x").doubleValue()));
        var projection = call("projection", query(token), 200, "DraftProjectionResult");
        assertEquals(after.at("/layouts/0/route_points"), projection.at("/data/constructs/0/layout/route_points"));
        mvc = mvc(temporary, root().resolve("packages/profiles")); assertEquals(token, open().get("draft_token"));
        assertEquals(NOW, open().at("/save_state/dirty_since").asText()); assertEquals("2026-09-13T00:00:10.000Z", open().at("/save_state/deadline").asText());
        assertEquals(4, count(database, "draft_journal"));
        for (String table : List.of("revision_document", "draft_content", "draft_checkpoint")) assertEquals(1, count(database, table));
        assertEquals(0, count(database, "draft_savepoint"));
    }

    @Test void batchLayoutIsAtomicAndRetryableAndRestoresExactGeometry() throws Exception {
        prepareBatch(); var token = open().get("draft_token"); var before = snapshot();
        var payload = batchPayload(before, 32, 16);
        var request = batchEdit(token, payload);
        var result = call("commands", request, 200, "DraftEditResult");
        assertEquals(1, result.at("/result_token/edit_seq").intValue());
        assertEquals(1, count(database, "draft_journal"));
        var moved = snapshot();
        assertEquals(52, layoutFor(moved, "occurrence.state").get("x").asDouble());
        for (String field : List.of("elements", "features", "states", "facts", "occurrences")) assertEquals(before.get(field), moved.get(field));
        assertEquals(before.at("/layouts/0/route_points"), moved.at("/layouts/0/route_points"));
        request.put("request_id", "request.batch.retry");
        assertEquals(result.get("result_token"), call("commands", request, 200, "DraftEditResult").get("result_token"));
        assertEquals(1, count(database, "draft_journal"));
        request.put("command_id", "command.batch.stale"); error("commands", request, 409, "DRAFT_CONFLICT");
        var restore = batchEdit(result.get("result_token"), batchPayload(before, 0, 0));
        var restored = call("commands", restore, 200, "DraftEditResult");
        assertEquals(before.get("layouts"), snapshot().get("layouts"));
        mvc = mvc(temporary.resolve("batch"), root().resolve("packages/profiles"));
        assertEquals(restored.get("result_token"), open().get("draft_token"));
    }

    @Test void batchLayoutRejectsScopeTamperingAndInvalidGeometryWithoutPartialWrites() throws Exception {
        prepareBatch(); var token = open().get("draft_token"); var before = snapshot();
        for (String fault : List.of("scope", "duplicate", "size", "containment", "wrongIntent")) {
            var request = batchEdit(token, batchPayload(before, 32, 16));
            switch (fault) {
                case "scope" -> ((ObjectNode) request.at("/command/payload/layouts/1")).put("occurrence_id", "occurrence.fact");
                case "duplicate" -> ((ObjectNode) request.at("/command/payload/layouts/1")).put("occurrence_id", "occurrence.raw");
                case "size" -> ((ObjectNode) request.at("/command/payload/layouts/1/layout")).put("width", 0);
                case "containment" -> ((ObjectNode) request.at("/command/payload/layouts/2/layout")).put("y", -500);
                case "wrongIntent" -> ((ObjectNode) request.get("scope")).put("intent", "UPDATE_LAYOUT");
            }
            error("commands", request, List.of("size", "wrongIntent").contains(fault) ? 400 : 422, List.of("size", "wrongIntent").contains(fault) ? "INPUT_INVALID" : "DRAFT_EDIT_REJECTED");
            assertEquals(before, snapshot()); assertEquals(0, count(database, "draft_journal")); assertEquals(0, count(database, "draft_receipt"));
        }
        for (String forbidden : List.of("occurrence.fact", "context.other.occurrence.raw", "occurrence.absent")) {
            var query = capabilities(token, "UPDATE_LAYOUT_BATCH", null);
            ((com.fasterxml.jackson.databind.node.ArrayNode) query.at("/scope/endpoints")).add("occurrence.raw").add(forbidden);
            assertTrue(call("capabilities", query, 200, "DraftCapabilitiesResult").at("/data/options").isEmpty());
        }
        var duplicateQuery = capabilities(token, "UPDATE_LAYOUT_BATCH", null);
        ((com.fasterxml.jackson.databind.node.ArrayNode) duplicateQuery.at("/scope/endpoints")).add("occurrence.raw").add("occurrence.raw");
        assertTrue(call("capabilities", duplicateQuery, 200, "DraftCapabilitiesResult").at("/data/options").isEmpty());
    }

    private void prepareBatch() throws Exception {
        Path storage = temporary.resolve("batch");
        database = create(storage, true, document -> {
            ((ObjectNode) document.at("/layouts/2")).put("y", 28);
            addOwnedContext(document, "context.other", "PROCESS_REFINEMENT");
        });
        mvc = mvc(storage, root().resolve("packages/profiles"));
    }
    private ObjectNode batchPayload(JsonNode document, double dx, double dy) {
        var payload = JSON.createObjectNode(); var layouts = payload.putArray("layouts");
        for (String id : List.of("occurrence.raw", "occurrence.process", "occurrence.state")) {
            var before = layoutFor(document, id); var item = layouts.addObject().put("occurrence_id", id);
            item.putObject("layout").put("x", before.get("x").asDouble() + dx).put("y", before.get("y").asDouble() + dy)
                    .put("width", before.get("width").asDouble()).put("height", before.get("height").asDouble());
        }
        return payload;
    }
    private ObjectNode batchEdit(JsonNode token, ObjectNode payload) throws Exception {
        var query = capabilities(token, "UPDATE_LAYOUT_BATCH", null);
        var ids = (com.fasterxml.jackson.databind.node.ArrayNode) query.at("/scope/endpoints");
        for (var item : payload.get("layouts")) ids.add(item.get("occurrence_id"));
        var option = call("capabilities", query, 200, "DraftCapabilitiesResult").at("/data/options/0");
        assertFalse(option.isMissingNode()); return authorizedEdit(token, query.get("scope"), option, payload);
    }

    @Test void createsNestedRefinementContextsAndReopensTheirNavigation() throws Exception {
        var original = snapshot(); String originalDigest = SaveContentDigestV1.sha256(original);
        var token = open().get("draft_token");
        var create = JSON.createObjectNode().put("context_id", CONTEXT).put("refinee_element_id", "element.raw.material").put("name", "原料细化");
        var first = call("commands", edit(token, "CREATE_CONTEXT", "occurrence.raw", create, 0), 200, "DraftEditResult");
        token = first.get("result_token");
        var after = snapshot(); String child = after.at("/refinement_edges/0/child_context_id").asText();
        assertEquals("0.3", after.path("schema_version").asText());
        assertEquals("SaveContentDigest/2", SaveContentDigestV1.version(after));
        assertEquals(CONTEXT, after.at("/refinement_edges/0/parent_context_id").asText());
        assertEquals("OBJECT", after.at("/refinement_edges/0/refinement_kind").asText());
        assertEquals(originalDigest, SaveContentDigestV1.sha256(original));
        var duplicate = call("capabilities", capabilities(token, "CREATE_CONTEXT", "occurrence.raw"), 200, "DraftCapabilitiesResult");
        assertTrue(duplicate.at("/data/options").isEmpty());
        assertEquals("ENDPOINT_KIND_MISMATCH", duplicate.at("/data/forbidden/0/reason_code").asText());
        var protectedDelete = call("capabilities", capabilities(token, "DELETE_CONSTRUCT", "occurrence.raw"), 200, "DraftCapabilitiesResult");
        for (var option : protectedDelete.at("/data/options")) {
            assertFalse(option.get("enabled").asBoolean());
            assertEquals("CONTEXT_NOT_ALLOWED", option.at("/reason_codes/0").asText());
        }
        var beforeRejectedDelete = snapshot();
        error("commands", deletion(token, "occurrence.raw", "CASCADE"), 422, "DRAFT_EDIT_REJECTED");
        assertEquals(beforeRejectedDelete, snapshot());
        var childQuery = query(token).put("context_id", child);
        var navigation = call("navigation", childQuery, 200, "DraftNavigationResult").get("data");
        assertEquals(CONTEXT, navigation.at("/current_path/0").asText());
        assertEquals(child, navigation.at("/current_path/1").asText());
        assertTrue(navigation.at("/process_tree/0/has_children").asBoolean());
        assertEquals(CONTEXT, navigation.at("/object_forest/0/parent_context_id").asText());
        assertTrue(call("projection", childQuery, 200, "DraftProjectionResult").at("/data/constructs").isEmpty());

        var element = JSON.createObjectNode().put("context_id", child).put("kind", "PROCESS").put("name", "子过程");
        element.putObject("layout").put("x", 60).put("y", 80).put("width", 160).put("height", 72);
        var nestedRequest = editAt(token, child, "CREATE_ELEMENT", null, element, 1);
        token = call("commands", nestedRequest, 200, "DraftEditResult").get("result_token");
        after = snapshot();
        String nestedElement = after.get("elements").get(after.get("elements").size() - 1).get("element_id").asText();
        String nestedOccurrence = after.get("occurrences").get(after.get("occurrences").size() - 1).get("occurrence_id").asText();
        var second = JSON.createObjectNode().put("context_id", child).put("refinee_element_id", nestedElement).put("name", "子过程细化");
        token = call("commands", editAt(token, child, "CREATE_CONTEXT", nestedOccurrence, second, 0), 200, "DraftEditResult").get("result_token");
        after = snapshot(); String grandchild = after.at("/refinement_edges/1/child_context_id").asText();
        assertEquals(3, after.get("contexts").size()); assertEquals(2, after.get("refinement_edges").size());
        var deepPath = call("navigation", query(token).put("context_id", grandchild), 200, "DraftNavigationResult").at("/data/current_path");
        assertEquals(List.of(CONTEXT, child, grandchild), JSON.convertValue(deepPath, new com.fasterxml.jackson.core.type.TypeReference<List<String>>() { }));
        mvc = mvc(temporary, root().resolve("packages/profiles"));
        assertEquals(token, open().get("draft_token"));
        assertEquals(after, snapshot());
        assertEquals(3, count(database, "draft_journal"));
    }

    @Test void refinementContextSupportsLocalRelationsAndRejectsCrossContextEndpoints() throws Exception {
        var token = open().get("draft_token");
        var refine = JSON.createObjectNode().put("context_id", CONTEXT).put("refinee_element_id", "element.raw.material").put("name", "原料细化");
        token = call("commands", edit(token, "CREATE_CONTEXT", "occurrence.raw", refine, 0), 200, "DraftEditResult").get("result_token");
        String child = snapshot().at("/refinement_edges/0/child_context_id").asText();
        for (String kind : List.of("OBJECT", "PROCESS")) {
            var element = JSON.createObjectNode().put("context_id", child).put("kind", kind).put("name", "子图" + kind)
                    .put("element_id", "element.child." + kind.toLowerCase());
            element.putObject("layout").put("x", kind.equals("OBJECT") ? 80 : 420).put("y", 80).put("width", 160).put("height", 72);
            token = call("commands", editAt(token, child, "CREATE_ELEMENT", null, element, kind.equals("OBJECT") ? 0 : 1), 200, "DraftEditResult").get("result_token");
        }
        var after = snapshot();
        String objectOccurrence = after.get("occurrences").get(after.get("occurrences").size() - 2).get("occurrence_id").asText();
        String processOccurrence = after.get("occurrences").get(after.get("occurrences").size() - 1).get("occurrence_id").asText();
        var catalog = call("relation-catalog", catalogQuery(token, null).put("context_id", child), 200, "DraftRelationCatalogResult");
        assertTrue(catalog.at("/data/items").toString().contains("\"enabled\":true"));
        var payload = factPayload(snapshot().at("/facts/0")); payload.put("context_id", child);
        ((ObjectNode) payload.at("/normalized_endpoints/0/target_ref")).put("target_id", "element.child.object");
        ((ObjectNode) payload.at("/normalized_endpoints/1/target_ref")).put("target_id", "element.child.process");
        var scope = capabilitiesAt(token, child, "CREATE_FACT", null);
        ((com.fasterxml.jackson.databind.node.ArrayNode) scope.at("/scope/endpoints")).add("occurrence.raw").add(processOccurrence);
        assertTrue(call("capabilities", scope, 200, "DraftCapabilitiesResult").at("/data/options").isEmpty());
        scope = capabilitiesAt(token, child, "CREATE_FACT", null);
        ((com.fasterxml.jackson.databind.node.ArrayNode) scope.at("/scope/endpoints")).add(objectOccurrence).add(processOccurrence);
        JsonNode option = null;
        for (var item : call("capabilities", scope, 200, "DraftCapabilitiesResult").at("/data/options"))
            if (item.at("/capability_ref/capability_id").asText().equals("CAP-ISO-PROC-001")) option = item;
        assertNotNull(option);
        token = call("commands", authorizedEdit(token, scope.get("scope"), option, payload), 200, "DraftEditResult").get("result_token");
        assertEquals(child, snapshot().get("occurrences").get(snapshot().get("occurrences").size() - 1).get("context_id").asText());
        assertFalse(call("text", query(token).put("context_id", child), 200, "DraftTextResult").at("/data/sentences").isEmpty());
        token = call("commands", editAt(token, child, "UPDATE_PROPERTY", objectOccurrence,
                name("element.child.object", "子图原料"), 0), 200, "DraftEditResult").get("result_token");
        var layout = JSON.createObjectNode().put("occurrence_id", objectOccurrence);
        layout.putObject("layout").put("x", 120).put("y", 160);
        token = call("commands", editAt(token, child, "UPDATE_LAYOUT", objectOccurrence, layout, 0), 200, "DraftEditResult").get("result_token");
        assertEquals(120d, layoutFor(snapshot(), objectOccurrence).get("x").doubleValue());
        assertEquals("子图原料", call("projection", query(token).put("context_id", child), 200, "DraftProjectionResult")
                .at("/data/constructs/0/label").asText());
        var state = state("ELEMENT", "element.child.object", "就绪"); state.put("context_id", child);
        token = call("commands", editAt(token, child, "CREATE_STATE", objectOccurrence, state, 0), 200, "DraftEditResult").get("result_token");
        assertEquals(child, snapshot().get("occurrences").get(snapshot().get("occurrences").size() - 1).get("context_id").asText());
        var deletion = call("capabilities", capabilitiesAt(token, child, "DELETE_CONSTRUCT", objectOccurrence), 200, "DraftCapabilitiesResult");
        assertFalse(deletion.at("/data/options/0/enabled").asBoolean());
        assertEquals("DELETE_DEPENDENCY_EXISTS", deletion.at("/data/options/0/reason_codes/0").asText());
        assertTrue(deletion.at("/data/options/1/enabled").asBoolean());
        var deleteScope = capabilitiesAt(token, child, "DELETE_CONSTRUCT", objectOccurrence);
        var deleteOption = deletion.at("/data/options/1");
        var deletePayload = JSON.createObjectNode().put("selection_id", objectOccurrence).put("delete_mode", "CASCADE")
                .put("construct_kind", "ELEMENT").put("construct_id", "element.child.object")
                .put("impact_token", deleteOption.get("impact_token").asText());
        token = call("commands", authorizedEdit(token, deleteScope.get("scope"), deleteOption, deletePayload), 200, "DraftEditResult").get("result_token");
        assertEquals(2, snapshot().get("contexts").size());
        assertEquals(1, snapshot().get("refinement_edges").size());
        assertTrue(snapshot().get("elements").toString().contains("element.child.process"));
        assertFalse(snapshot().get("elements").toString().contains("element.child.object"));
        assertFalse(snapshot().get("facts").toString().contains("element.child.object"));
    }

    @Test void noopRetryConflictAndCrossTargetAuthorizationAreDurable() throws Exception {
        var token = open().get("draft_token"); var noop = edit(token, "UPDATE_PROPERTY", "element.raw.material", name("element.raw.material", "Raw Material"), 0);
        assertEquals("UNCHANGED", call("commands", noop, 200, "DraftEditResult").get("status").asText()); assertTrue(open().at("/save_state/dirty_since").isNull());
        var request = edit(token, "UPDATE_PROPERTY", "element.raw.material", name("element.raw.material", "Renamed"), 0);
        var forged = request.deepCopy(); ((ObjectNode) forged.get("authorization")).put("selected_option_id", "option.forged");
        error("commands", forged, 422, "DRAFT_EDIT_REJECTED");
        var cross = request.deepCopy(); ((ObjectNode) cross.at("/command/payload/target_ref")).put("target_id", "element.processing"); error("commands", cross, 422, "DRAFT_EDIT_REJECTED");
        var first = call("commands", request, 200, "DraftEditResult"); request.put("request_id", "request.retry");
        var repeated = call("commands", request, 200, "DraftEditResult"); assertEquals(first.get("result_token"), repeated.get("result_token")); assertEquals("request.retry", repeated.get("request_id").asText());
        request.put("command_id", "command.stale"); error("commands", request, 409, "DRAFT_CONFLICT");
        request.put("command_id", first.get("command_id").asText()); ((ObjectNode) request.at("/command/payload")).put("value", "Other"); error("commands", request, 409, "IDEMPOTENCY_MISMATCH");
        error("projection", query(token), 409, "DRAFT_CONFLICT");
        var receipt = JSON.createObjectNode().put("request_id", "request.receipt").put("operation", "EDIT").put("idempotency_id", first.get("command_id").asText());
        assertEquals("FOUND", call("receipts", receipt, 200, "DraftReceiptResult").get("status").asText());
        receipt.put("idempotency_id", "command.absent"); assertEquals("NOT_FOUND", call("receipts", receipt, 200, "DraftReceiptResult").get("status").asText());
        assertEquals(1, count(database, "draft_journal")); assertEquals(2, count(database, "draft_receipt"));
    }

    @Test void wrongScopeBindingUnsupportedCommandsAndNamesNeverWrite() throws Exception {
        var token = open().get("draft_token");
        for (String value : List.of("  ", "a".repeat(257))) {
            // Schema 超长校验在 HTTP 入口执行；空白在共享名称规则拒绝。
            var request = edit(token, "UPDATE_PROPERTY", "element.raw.material", name("element.raw.material", "valid"), 0);
            ((ObjectNode) request.at("/command/payload")).put("value", value); error("commands", request, 400, "INPUT_INVALID");
        }
        var wrong = query(token); ((ObjectNode) wrong.get("draft_token")).put("binding_digest", "a".repeat(64)); error("projection", wrong, 409, "RULE_VERSION_CONFLICT");
        wrong = query(token); wrong.put("context_id", "context.other"); error("projection", wrong, 404, "NOT_FOUND");
        error("relation-catalog", query(token), 400, "INPUT_INVALID");
        var capability = capabilities(token, "CREATE_FACT", null); var unavailable = call("capabilities", capability, 200, "DraftCapabilitiesResult");
        assertTrue(unavailable.at("/data/allowed").isEmpty()); assertEquals("ENDPOINT_KIND_MISMATCH", unavailable.at("/data/forbidden/0/reason_code").asText());
        var frozen = JSON.readTree(java.nio.file.Files.readString(root().resolve("tests/fixtures/hybrid-save/draft-workspace-v02-vectors.json")));
        ObjectNode unsupported = null;
        for (var vector : frozen.get("commands")) if (vector.at("/command/command_type").asText().equals("CREATE_FACT")) unsupported = vector.deepCopy();
        assertNotNull(unsupported); unsupported.set("expected_draft_token", token); unsupported.set("scope", capability.get("scope"));
        ((ObjectNode) unsupported.at("/command/payload")).put("context_id", CONTEXT);
        ((ObjectNode) unsupported.get("authorization")).set("capability_query_id", unavailable.at("/data/capability_query_id"));
        assertEquals("ENDPOINT_KIND_MISMATCH", error("commands", unsupported, 422, "DRAFT_EDIT_REJECTED").get("reason_code").asText());
        var badTarget = call("capabilities", capabilities(token, "UPDATE_LAYOUT", "occurrence.missing"), 200, "DraftCapabilitiesResult");
        assertTrue(badTarget.at("/data/options").isEmpty());
        var scope = capabilities(token, "CREATE_ELEMENT", null); ((ObjectNode) scope.get("scope")).putArray("endpoints").add("element.raw.material");
        assertTrue(call("capabilities", scope, 200, "DraftCapabilitiesResult").at("/data/options").isEmpty());
        assertEquals(0, count(database, "draft_journal")); assertEquals(0, count(database, "draft_receipt"));
    }

    @Test void rawAndLocalSessionGuardsUseOnlyTheV2ErrorShape() throws Exception {
        String raw = "{\"request_id\":\"request.open\",\"context_id\":null}";
        for (String failure : List.of("host", "origin", "session")) {
            var request = post(URL + "open").contentType(MediaType.APPLICATION_JSON).content(raw)
                    .header("Origin", failure.equals("origin") ? "http://evil.invalid" : "http://localhost:5173")
                    .header("X-OPM-Session", failure.equals("session") ? "bad" : "test-session");
            if (failure.equals("host")) request.with(value -> { value.setServerName("evil.invalid"); return value; });
            assertEquals("LOCAL_SESSION_INVALID", perform(request, 403, "DraftError").get("code").asText());
        }
        assertEquals("LOCAL_SESSION_INVALID", perform(post(URL + "open").contentType(MediaType.APPLICATION_JSON).content(raw), 403, "DraftError").get("code").asText());
        for (String bad : List.of("{}", raw + " {}", raw.replace("null", "null,\"context_id\":null"), raw.replace("null", "null,\"unknown\":1"), ""))
            assertEquals("INPUT_INVALID", perform(authorized("open").content(bad), 400, "DraftError").get("code").asText());
        assertEquals(0, count(database, "draft_receipt"));
    }

    @Test void inactiveOrMissingDatabaseDoesNotMigrateAndAssetFailureDoesNotCommit() throws Exception {
        Path inactive = temporary.resolve("inactive"); Path db = create(inactive, false, ignored -> { }); mvc = mvc(inactive, root().resolve("packages/profiles"));
        error("open", JSON.createObjectNode().put("request_id", "request.open").putNull("context_id"), 409, "DRAFT_MODE_REQUIRED");
        assertEquals(0, count(db, "draft_receipt"));
        mvc = mvc(temporary.resolve("absent"), root().resolve("packages/profiles")); error("open", JSON.createObjectNode().put("request_id", "request.open").putNull("context_id"), 404, "NOT_FOUND");
        assertFalse(java.nio.file.Files.exists(temporary.resolve("absent")));
        mvc = mvc(temporary, root().resolve("packages/profiles")); var token = open().get("draft_token");
        var request = edit(token, "UPDATE_PROPERTY", "element.raw.material", name("element.raw.material", "Renamed"), 0);
        mvc = mvc(temporary, temporary.resolve("missing-profiles")); error("commands", request, 422, "DRAFT_EDIT_REJECTED");
        assertEquals(0, count(database, "draft_journal")); assertEquals(0, count(database, "draft_receipt"));
    }

    @Test void stateDragClampsAndOwnerMovePersistsChildrenInOneJournalEntry() throws Exception {
        var token = open().get("draft_token");
        var payload = JSON.createObjectNode().put("occurrence_id", "occurrence.state");
        payload.putObject("layout").put("x", -1000).put("y", -1000);
        token = submit(token, "UPDATE_LAYOUT", "occurrence.state", payload, 0);
        var before = snapshot();
        assertEquals(8d, layoutFor(before, "occurrence.state").get("x").doubleValue());
        assertEquals(28d, layoutFor(before, "occurrence.state").get("y").doubleValue());
        long journals = count(database, "draft_journal");
        payload = JSON.createObjectNode().put("occurrence_id", "occurrence.raw");
        payload.putObject("layout").put("x", 240.5).put("y", 180.5);
        var request = edit(token, "UPDATE_LAYOUT", "occurrence.raw", payload, 0);
        var result = call("commands", request, 200, "DraftEditResult"); token = result.get("result_token");
        var after = snapshot();
        assertEquals(248.5, layoutFor(after, "occurrence.state").get("x").doubleValue());
        assertEquals(208.5, layoutFor(after, "occurrence.state").get("y").doubleValue());
        assertEquals(journals + 1, count(database, "draft_journal"));
        for (String field : List.of("elements", "features", "states", "facts", "occurrences", "text_artifact", "text_traces")) assertEquals(before.get(field), after.get(field), field);
        assertEquals(before.at("/layouts/0/route_points"), after.at("/layouts/0/route_points"));
        request.put("request_id", "request.layout.retry"); assertEquals(token, call("commands", request, 200, "DraftEditResult").get("result_token"));
        request.put("command_id", "command.layout.stale"); error("commands", request, 409, "DRAFT_CONFLICT");
        assertEquals(journals + 1, count(database, "draft_journal"));
        mvc = mvc(temporary, root().resolve("packages/profiles")); assertEquals(token, open().get("draft_token"));
        assertEquals(after.get("layouts"), snapshot().get("layouts"));
        token = submit(token, "CREATE_FEATURE", "element.raw.material", feature("element.raw.material", "OPERATION"), 1);
        var operation = snapshot().get("occurrences").get(snapshot().get("occurrences").size() - 1);
        String occurrence = operation.get("occurrence_id").asText();
        payload = JSON.createObjectNode().put("occurrence_id", occurrence); payload.putObject("layout").put("x", 600.25).put("y", 300.5);
        submit(token, "UPDATE_LAYOUT", occurrence, payload, 0);
        assertEquals(600.25, layoutFor(snapshot(), occurrence).get("x").doubleValue());
    }

    @Test void stateLayoutRejectsReferencedStateReferencedOwnerAndWrongRoleWithoutWrites() throws Exception {
        for (String variant : List.of("state-reference", "owner-reference", "state-role")) {
            Path storage = temporary.resolve(variant);
            database = create(storage, true, document -> {
                for (var item : document.get("occurrences")) {
                    var occurrence = (ObjectNode) item;
                    if (variant.equals("owner-reference") && item.get("occurrence_id").asText().equals("occurrence.raw")) occurrence.put("ownership", "REFERENCED");
                    if (!item.get("occurrence_id").asText().equals("occurrence.state")) continue;
                    if (variant.equals("state-reference")) occurrence.put("ownership", "REFERENCED");
                    if (variant.equals("state-role")) occurrence.put("construct_role", "OBJECT_NODE");
                }
            });
            mvc = mvc(storage, root().resolve("packages/profiles"));
            var token = open().get("draft_token");
            var response = call("capabilities", capabilities(token, "UPDATE_LAYOUT", "occurrence.state"), 200, "DraftCapabilitiesResult");
            assertTrue(response.at("/data/options").isEmpty(), variant);
            assertEquals(0, count(database, "draft_journal")); assertEquals(0, count(database, "draft_receipt"));
        }
    }

    private JsonNode layoutFor(JsonNode document, String occurrenceId) {
        String id = null;
        for (var item : document.get("occurrences")) if (item.get("occurrence_id").asText().equals(occurrenceId)) id = item.get("layout_id").asText();
        for (var item : document.get("layouts")) if (item.get("layout_id").asText().equals(id)) return item;
        throw new AssertionError("布局不存在：" + occurrenceId);
    }

    @Test void attributeMoveAndNoopPreserveOwnedFeatureAndRoutes() throws Exception {
        Path storage = temporary.resolve("attribute"); database = create(storage, true, document -> {
            var owner = (ObjectNode) document.at("/elements/0"); ((com.fasterxml.jackson.databind.node.ArrayNode) owner.get("feature_ids")).add("feature.attribute");
            var feature = ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("features")).addObject()
                    .put("feature_id", "feature.attribute").put("owner_element_id", "element.raw.material").put("feature_kind", "ATTRIBUTE");
            feature.set("capability_ref", owner.get("capability_ref").deepCopy()); ((ObjectNode) feature.get("capability_ref")).put("capability_id", "CAP-FEAT-ATTRIBUTE-001");
            feature.set("name", owner.get("name").deepCopy()); feature.set("source", owner.get("source").deepCopy()); feature.set("normalization", owner.get("normalization").deepCopy());
            var occurrence = ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("occurrences")).addObject().put("occurrence_id", "occurrence.attribute")
                    .put("context_id", CONTEXT).put("target_kind", "FEATURE").put("target_id", "feature.attribute").put("ownership", "OWNED")
                    .put("construct_role", "ATTRIBUTE_NODE").put("layout_id", "layout.attribute");
            ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/contexts/0/occurrence_ids")).add(occurrence.get("occurrence_id"));
            ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("layouts")).addObject().put("layout_id", "layout.attribute").put("x", 0).put("y", 0).put("width", 100).put("height", 40).put("z_order", 5);
        });
        mvc = mvc(storage, root().resolve("packages/profiles")); var before = snapshot(); var token = open().get("draft_token");
        var payload = JSON.createObjectNode().put("occurrence_id", "occurrence.attribute"); payload.putObject("layout").put("x", 15.5).put("y", -0d);
        token = call("commands", edit(token, "UPDATE_LAYOUT", "occurrence.attribute", payload, 0), 200, "DraftEditResult").get("result_token");
        assertEquals("UNCHANGED", call("commands", edit(token, "UPDATE_LAYOUT", "occurrence.attribute", payload, 0), 200, "DraftEditResult").get("status").asText());
        assertEquals(before.get("features"), snapshot().get("features")); assertEquals(before.get("occurrences"), snapshot().get("occurrences"));
        assertEquals(15.5, snapshot().at("/layouts/4/x").doubleValue()); assertEquals(1, count(database, "draft_journal"));
        assertEquals(Double.doubleToRawLongBits(-0d), Double.doubleToRawLongBits(snapshot().at("/layouts/4/y").doubleValue()));
        var projected = call("projection", query(token), 200, "DraftProjectionResult"); assertEquals("ATTRIBUTE_NODE", projected.at("/data/constructs/4/construct_role").asText());
        var rename = name("feature.attribute", "FEATURE", "Sensor temperature");
        var request = edit(token, "UPDATE_PROPERTY", "occurrence.attribute", rename, 0);
        assertEquals("FEATURE", request.at("/command/payload/target_ref/target_kind").asText());
        token = call("commands", request, 200, "DraftEditResult").get("result_token");
        assertEquals("Sensor temperature", snapshot().at("/features/0/name/local_name").asText());
        assertEquals("element.raw.material", snapshot().at("/features/0/owner_element_id").asText());
        assertEquals(2, count(database, "draft_journal"));
    }

    @Test void invalidTextGenerationAndIntegerViewRangeAreRejectedWithoutPartialEdit() throws Exception {
        Path storage = temporary.resolve("bad-text"); database = create(storage, true, document -> {
            var modifiers = ((ObjectNode) document.at("/facts/0")).putArray("modifiers");
            modifiers.addObject().put("modifier_id", "control.capability").put("value", "CAP-ISO-CTRL-007");
            modifiers.addObject().put("modifier_id", "control.segment").put("value", "PROCESS_INPUT");
        });
        mvc = mvc(storage, root().resolve("packages/profiles")); var before = snapshot(); var token = open().get("draft_token");
        error("text", query(token), 422, "DRAFT_EDIT_REJECTED");
        var findings = call("findings", query(token), 200, "DraftFindingsResult");
        assertFalse(findings.at("/data/items").isEmpty());
        assertTrue(findings.at("/data/items/0/rule_id").asText().startsWith("rule.opl."));
        error("commands", edit(token, "UPDATE_PROPERTY", "element.raw.material", name("element.raw.material", "New name"), 0), 422, "DRAFT_EDIT_REJECTED");
        assertEquals(before, snapshot()); assertEquals(0, count(database, "draft_journal")); assertEquals(0, count(database, "draft_receipt"));
        Path wide = temporary.resolve("wide-integer"); create(wide, true, document -> ((ObjectNode) document.at("/layouts/0")).put("z_order", 2147483648L));
        mvc = mvc(wide, root().resolve("packages/profiles")); error("open", JSON.createObjectNode().put("request_id", "request.open").putNull("context_id"), 422, "DRAFT_EDIT_REJECTED");
    }

    @Test void emptyModelCanCreateItsFirstElementWithRealEmptyTextEvidence() throws Exception {
        Path storage = temporary.resolve("empty"); database = create(storage, true, document -> {
            for (String collection : List.of("elements", "features", "states", "facts", "occurrences", "layouts", "state_presentations", "text_traces")) document.putArray(collection);
            document.remove("text_artifact"); ((ObjectNode) document.at("/contexts/0")).putArray("occurrence_ids");
        });
        mvc = mvc(storage, root().resolve("packages/profiles")); var token = open().get("draft_token");
        var payload = JSON.createObjectNode().put("kind", "OBJECT").put("name", "第一个对象"); payload.putObject("layout").put("x", 10).put("y", 20);
        var result = call("commands", edit(token, "CREATE_ELEMENT", null, payload, 0), 200, "DraftEditResult");
        assertEquals("DURABLE", result.get("status").asText()); assertTrue(result.get("text_trace_ids").isEmpty());
        assertTrue(snapshot().at("/text_artifact/sentences").isEmpty()); assertTrue(snapshot().get("text_traces").isEmpty());
        assertEquals(1, snapshot().get("elements").size()); assertEquals(1, count(database, "revision_document"));
    }

    @Test void ownedFeatureAndStateCreationUseExactOwnersAndSurviveReopen() throws Exception {
        var original = snapshot(); var token = open().get("draft_token");
        for (String owner : List.of("element.raw.material", "element.processing")) for (String kind : List.of("ATTRIBUTE", "OPERATION")) {
            token = submit(token, "CREATE_FEATURE", owner, feature(owner, kind), kind.equals("ATTRIBUTE") ? 0 : 1);
            String id = snapshot().get("features").get(snapshot().get("features").size() - 1).get("feature_id").asText();
            token = submit(token, "CREATE_STATE", id, state("FEATURE", id, "状态"), 0);
            assertEquals("FEATURE_STATE_NODE", snapshot().get("occurrences").get(snapshot().get("occurrences").size() - 1).get("construct_role").asText());
            assertEquals(id, snapshot().get("states").get(snapshot().get("states").size() - 1).get("owner_element_id").asText());
            String stateId = snapshot().get("states").get(snapshot().get("states").size() - 1).get("state_id").asText();
            var update = stateUpdate(stateId, "FEATURE", id); update.putObject("changes").put("name_or_value", "新值").putArray("state_roles").add("DEFAULT");
            token = submit(token, "UPDATE_STATE", stateId, update, 0);
        }
        var objectState = state("ELEMENT", "element.raw.material", "对象状态");
        ((ObjectNode) objectState.get("owner_ref")).put("occurrence_id", "occurrence.raw");
        token = submit(token, "CREATE_STATE", "occurrence.raw", objectState, 0);
        var after = snapshot(); assertEquals(4, after.get("features").size()); assertEquals(6, after.get("states").size());
        for (int i = 0; i < 2; i++) assertEquals(2, after.at("/elements/" + i + "/feature_ids").size());
        assertEquals(2, after.at("/elements/0/state_ids").size());
        for (String pointer : List.of("/model_header", "/elements/0/name", "/layouts/0/route_points", "/layouts/0/x", "/layouts/0/y", "/layouts/0/z_order", "/facts", "/revision_id")) assertEquals(original.at(pointer), after.at(pointer), pointer);
        assertEquals(91.5, after.at("/layouts/0/height").doubleValue());
        mvc = mvc(temporary, root().resolve("packages/profiles")); assertEquals(token, open().get("draft_token"));
        call("projection", query(token), 200, "DraftProjectionResult"); call("text", query(token), 200, "DraftTextResult");
        assertEquals(13, count(database, "draft_journal"));
        for (String table : List.of("revision_document", "draft_content", "draft_checkpoint")) assertEquals(1, count(database, table));
    }

    @Test void statePresentationNoopsKeepFactsAndRestoreFeatureStateRole() throws Exception {
        var token = open().get("draft_token"); var original = snapshot();
        var presentation = JSON.createObjectNode().put("context_id", CONTEXT).put("state_id", "state.raw.available");
        for (String type : List.of("STATE_EXPLICIT", "UNFOLD")) assertEquals("UNCHANGED", call("commands", edit(token, type, "occurrence.state", presentation, 0), 200, "DraftEditResult").get("status").asText());
        for (String type : List.of("FOLD", "UNFOLD", "STATE_SUPPRESS", "STATE_EXPLICIT")) {
            token = submit(token, type, "state.raw.available", presentation, 0);
            assertEquals("UNCHANGED", call("commands", edit(token, type, "state.raw.available", presentation, 0), 200, "DraftEditResult").get("status").asText());
            assertEquals(original.get("states"), snapshot().get("states")); assertEquals(original.get("facts"), snapshot().get("facts"));
            if (type.equals("STATE_SUPPRESS")) {
                assertFalse(snapshot().get("occurrences").toString().contains("occurrence.state"));
                assertTrue(call("capabilities", capabilities(token, "STATE_EXPLICIT", "occurrence.state"), 200, "DraftCapabilitiesResult").at("/data/options").isEmpty());
            }
        }
        assertFalse(snapshot().get("occurrences").toString().contains("\"occurrence.state\""));
        token = submit(token, "CREATE_FEATURE", "element.raw.material", feature("element.raw.material", "ATTRIBUTE"), 0);
        String featureId = snapshot().at("/features/0/feature_id").asText();
        token = submit(token, "CREATE_STATE", featureId, state("FEATURE", featureId, "值"), 0);
        String stateId = snapshot().at("/states/1/state_id").asText(); presentation.put("state_id", stateId);
        token = submit(token, "STATE_SUPPRESS", stateId, presentation, 0);
        presentation.putObject("layout").put("x", -0d).put("y", 77.5);
        token = submit(token, "STATE_EXPLICIT", stateId, presentation, 0);
        var last = snapshot().get("occurrences").get(snapshot().get("occurrences").size() - 1);
        assertEquals("FEATURE_STATE_NODE", last.get("construct_role").asText());
        var lastLayout = snapshot().get("layouts").get(snapshot().get("layouts").size() - 1);
        assertEquals(8d, lastLayout.get("x").doubleValue()); assertEquals(77.5, lastLayout.get("y").doubleValue());
        assertEquals(original.at("/layouts/0/route_points"), snapshot().at("/layouts/0/route_points"));
        mvc = mvc(temporary, root().resolve("packages/profiles")); assertEquals(token, open().get("draft_token"));
        assertEquals("2026-09-13T00:00:10.000Z", open().at("/save_state/deadline").asText());
        call("projection", query(token), 200, "DraftProjectionResult");
    }

    @Test void stateRenamePreservesRawMetadataAndRegeneratesStateSpecifiedText() throws Exception {
        Path storage = temporary.resolve("state-text"); database = create(storage, true, document -> {
            ((ObjectNode) document.at("/states/0/name")).put("namespace", "business.state");
            ((ObjectNode) document.at("/facts/0/capability_ref")).put("capability_id", "CAP-ISO-PROC-006");
            ((ObjectNode) document.at("/facts/0/endpoints/0")).put("target_kind", "STATE").put("target_id", "state.raw.available").put("role", "CONSUMED_STATE");
        });
        mvc = mvc(storage, root().resolve("packages/profiles")); var token = open().get("draft_token"); var before = snapshot();
        var payload = stateUpdate("state.raw.available", "ELEMENT", "element.raw.material");
        payload.putObject("changes").put("name_or_value", "ready").putArray("state_roles").add("FINAL");
        var request = edit(token, "UPDATE_STATE", "occurrence.state", payload, 0);
        var result = call("commands", request, 200, "DraftEditResult"); token = result.get("result_token");
        assertEquals("DURABLE", result.get("status").asText()); assertFalse(result.get("text_trace_ids").isEmpty());
        assertTrue(call("text", query(token), 200, "DraftTextResult").toString().contains("ready"));
        for (String pointer : List.of("/states/0/name/namespace", "/states/0/source", "/states/0/normalization", "/states/0/owner_target_kind", "/occurrences", "/layouts")) assertEquals(before.at(pointer), snapshot().at(pointer), pointer);
        assertEquals("UNCHANGED", call("commands", edit(token, "UPDATE_STATE", "state.raw.available", payload, 0), 200, "DraftEditResult").get("status").asText());
        request.put("request_id", "request.retry.state"); assertEquals(token, call("commands", request, 200, "DraftEditResult").get("result_token"));
        request.put("command_id", "command.stale.state"); error("commands", request, 409, "DRAFT_CONFLICT");
        assertEquals(1, count(database, "draft_journal"));
        var presentation = JSON.createObjectNode().put("context_id", CONTEXT).put("state_id", "state.raw.available");
        for (String type : List.of("STATE_SUPPRESS", "STATE_EXPLICIT")) {
            token = submit(token, type, "state.raw.available", presentation, 0);
            assertEquals(before.get("facts"), snapshot().get("facts"));
            assertTrue(call("text", query(token), 200, "DraftTextResult").toString().contains("ready"));
        }
    }

    @Test void absentDefaultPresentationAndRolesRemainAbsentOnNoop() throws Exception {
        Path storage = temporary.resolve("implicit-state"); database = create(storage, true, document -> {
            document.remove("state_presentations"); ((ObjectNode) document.at("/states/0")).remove("state_roles");
        });
        mvc = mvc(storage, root().resolve("packages/profiles")); var token = open().get("draft_token"); var before = snapshot();
        var payload = stateUpdate("state.raw.available", "ELEMENT", "element.raw.material"); payload.putObject("changes").putArray("state_roles");
        assertEquals("UNCHANGED", call("commands", edit(token, "UPDATE_STATE", "state.raw.available", payload, 0), 200, "DraftEditResult").get("status").asText());
        payload = JSON.createObjectNode().put("context_id", CONTEXT).put("state_id", "state.raw.available");
        for (String type : List.of("STATE_EXPLICIT", "UNFOLD")) assertEquals("UNCHANGED", call("commands", edit(token, type, "state.raw.available", payload, 0), 200, "DraftEditResult").get("status").asText());
        assertEquals(before, snapshot()); assertEquals(0, count(database, "draft_journal"));
    }

    @Test void ownedInputTamperingAndUnsupportedStateFieldsHaveZeroWrites() throws Exception {
        var token = open().get("draft_token"); var before = snapshot();
        for (String mutation : List.of("owner", "ownerOccurrence", "capability", "version", "role", "ownership", "context", "blank", "long")) {
            var payload = state("ELEMENT", "element.raw.material", "有效状态");
            switch (mutation) {
                case "owner" -> ((ObjectNode) payload.get("owner_ref")).put("target_id", "element.processing");
                case "ownerOccurrence" -> ((ObjectNode) payload.get("owner_ref")).put("occurrence_id", "occurrence.process");
                case "capability" -> ((ObjectNode) payload.get("capability_ref")).put("capability_id", "CAP-FEAT-STATE-001");
                case "version" -> ((ObjectNode) payload.get("capability_ref")).put("version", "99.0.0");
                case "role" -> ((ObjectNode) payload.get("occurrence")).put("construct_role", "FEATURE_STATE_NODE");
                case "ownership" -> ((ObjectNode) payload.get("occurrence")).put("ownership", "REFERENCED");
                case "context" -> payload.put("context_id", "context.other");
                case "blank" -> payload.put("name_or_value", "  ");
                case "long" -> payload.put("name_or_value", "a".repeat(257));
            }
            boolean invalid = List.of("blank", "long", "context").contains(mutation);
            error("commands", edit(token, "CREATE_STATE", "element.raw.material", payload, 0), invalid ? 400 : 422, invalid ? "INPUT_INVALID" : "DRAFT_EDIT_REJECTED");
        }
        for (String mutation : List.of("owner", "kind", "role", "blank")) {
            var payload = feature("element.raw.material", "ATTRIBUTE");
            switch (mutation) { case "owner" -> payload.put("owner_element_id", "element.processing"); case "kind" -> payload.put("feature_kind", "OPERATION");
                case "role" -> ((ObjectNode) payload.get("occurrence")).put("construct_role", "OPERATION_NODE"); case "blank" -> payload.put("name", " "); }
            error("commands", edit(token, "CREATE_FEATURE", "element.raw.material", payload, 0), mutation.equals("blank") ? 400 : 422, mutation.equals("blank") ? "INPUT_INVALID" : "DRAFT_EDIT_REJECTED");
        }
        for (String mutation : List.of("owner", "ownerOccurrence", "target", "ordinal", "long", "blank", "option")) {
            var payload = stateUpdate("state.raw.available", "ELEMENT", "element.raw.material"); payload.putObject("changes").put("name_or_value", "新状态");
            switch (mutation) { case "owner" -> ((ObjectNode) payload.get("expected_owner_ref")).put("target_id", "element.processing");
                case "ownerOccurrence" -> ((ObjectNode) payload.get("expected_owner_ref")).put("occurrence_id", "occurrence.process");
                case "target" -> payload.put("state_id", "state.other"); case "ordinal" -> ((ObjectNode) payload.get("changes")).put("ordinal", 1);
                case "long" -> ((ObjectNode) payload.get("changes")).put("name_or_value", "a".repeat(257));
                case "blank" -> ((ObjectNode) payload.get("changes")).put("name_or_value", " "); }
            var request = edit(token, "UPDATE_STATE", "state.raw.available", payload, 0);
            if (mutation.equals("option")) ((ObjectNode) request.get("authorization")).put("selected_option_id", "option.forged");
            boolean invalid = List.of("ordinal", "long", "blank").contains(mutation);
            error("commands", request, invalid ? 400 : 422, invalid ? "INPUT_INVALID" : "DRAFT_EDIT_REJECTED");
        }
        assertTrue(call("capabilities", capabilities(token, "CREATE_STATE", "element.processing"), 200, "DraftCapabilitiesResult").at("/data/options").isEmpty());
        assertEquals(before, snapshot()); assertEquals(0, count(database, "draft_journal")); assertEquals(0, count(database, "draft_receipt"));
    }

    @Test void all26BaseRelationsCreateUpdateNoopDeleteAndReopenThroughDraftHttp() throws Exception {
        var fixtures = new java.util.TreeMap<String, ObjectNode>(); Path directory = root().resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures");
        try (var paths = java.nio.file.Files.list(directory)) {
            for (Path path : paths.sorted().toList()) {
                String filename = path.getFileName().toString();
                if (!filename.matches("g-opl-(proc|struct)-.*-pass\\.json")) continue;
                var document = SaveContentDigestV1.read(java.nio.file.Files.readString(path));
                if (document.get("facts").size() == 1) fixtures.putIfAbsent(document.at("/facts/0/capability_ref/capability_id").asText(), document);
            }
        }
        assertEquals(26, fixtures.size());
        for (var entry : fixtures.entrySet()) {
            String capability = entry.getKey(); var golden = entry.getValue(); JsonNode fact = golden.at("/facts/0");
            Path storage = temporary.resolve(capability); loadGolden(storage, golden, true);
            var token = open().get("draft_token"); var original = snapshot();
            var payload = factPayload(fact); var endpointIds = endpointIds(fact);
            var request = relationEdit(token, "CREATE_FACT", null, endpointIds, capability, false, payload);
            var result = call("commands", request, 200, "DraftEditResult"); token = result.get("result_token");
            assertEquals("DURABLE", result.get("status").asText(), capability);
            assertEquals(1, snapshot().get("facts").size()); assertFalse(call("text", query(token), 200, "DraftTextResult").at("/data/traces").isEmpty(), capability);
            var created = snapshot().at("/facts/0"); var update = JSON.createObjectNode().put("fact_id", created.get("fact_id").asText()); update.set("expected_capability_ref", payload.get("capability_ref"));
            var replacement = update.putObject("replacement");
            for (String key : List.of("normalized_endpoints", "direction", "labels", "modifiers", "collection_completeness")) if (payload.has(key)) replacement.set(key, payload.get(key));
            assertEquals("UNCHANGED", call("commands", relationEdit(token, "UPDATE_FACT", created.get("fact_id").asText(), List.of(), capability, false, update), 200, "DraftEditResult").get("status").asText(), capability);
            assertEquals(created, snapshot().at("/facts/0"), capability);
            mvc = mvc(storage, root().resolve("packages/profiles")); assertEquals(token, open().get("draft_token"));
            String occurrence = occurrenceFor(created.get("fact_id").asText());
            var deletion = deletion(token, occurrence, "DELETE_TARGET");
            token = call("commands", deletion, 200, "DraftEditResult").get("result_token");
            assertTrue(snapshot().get("facts").isEmpty()); assertTrue(call("text", query(token), 200, "DraftTextResult").at("/data/traces").isEmpty());
            assertEquals(original.get("layouts"), snapshot().get("layouts")); assertEquals(original.get("elements"), snapshot().get("elements"));
            assertEquals(2, count(database, "draft_journal")); assertEquals(1, count(database, "revision_document"));
        }
    }

    @Test void allEightControlsAttachAndRemoveWithoutSecondFactOrEndpointChurn() throws Exception {
        var fixtures = new java.util.TreeMap<String, ObjectNode>(); Path directory = root().resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures");
        try (var paths = java.nio.file.Files.list(directory)) {
            for (Path path : paths.sorted().toList()) if (path.getFileName().toString().matches("g-opl-ctrl-.*-pass\\.json")) {
                var document = SaveContentDigestV1.read(java.nio.file.Files.readString(path));
                for (var modifier : document.at("/facts/0/modifiers")) if (modifier.path("modifier_id").asText().equals("control.capability")) fixtures.putIfAbsent(modifier.get("value").asText(), document);
            }
        }
        assertEquals(8, fixtures.size());
        for (var entry : fixtures.entrySet()) {
            var document = entry.getValue().deepCopy(); var modifiers = document.at("/facts/0/modifiers").deepCopy(); ((ObjectNode) document.at("/facts/0")).remove("modifiers");
            loadGolden(temporary.resolve(entry.getKey()), document, false); var before = snapshot(); var token = open().get("draft_token"); String fact = before.at("/facts/0/fact_id").asText();
            String capability = before.at("/facts/0/capability_ref/capability_id").asText();
            var update = JSON.createObjectNode().put("fact_id", fact); update.putObject("expected_capability_ref").put("capability_id", capability); update.putObject("replacement").set("modifiers", modifiers);
            var wrong = relationEdit(token, "UPDATE_FACT", fact, List.of(), capability, false, update); error("commands", wrong, 422, "DRAFT_EDIT_REJECTED");
            token = call("commands", relationEdit(token, "UPDATE_FACT", fact, List.of(), entry.getKey(), false, update), 200, "DraftEditResult").get("result_token");
            assertEquals("UNCHANGED", call("commands", relationEdit(token, "UPDATE_FACT", fact, List.of(), entry.getKey(), false, update), 200, "DraftEditResult").get("status").asText());
            assertEquals(1, snapshot().get("facts").size()); assertEquals(before.at("/facts/0/endpoints"), snapshot().at("/facts/0/endpoints")); assertEquals(before.get("occurrences"), snapshot().get("occurrences"));
            assertFalse(call("text", query(token), 200, "DraftTextResult").at("/data/traces").isEmpty());
            update.putObject("replacement").putArray("modifiers");
            error("commands", relationEdit(token, "UPDATE_FACT", fact, List.of(), capability, false, update), 422, "DRAFT_EDIT_REJECTED");
            token = call("commands", relationEdit(token, "UPDATE_FACT", fact, List.of(), capability, true, update), 200, "DraftEditResult").get("result_token");
            assertTrue(snapshot().at("/facts/0/modifiers").isEmpty()); assertEquals(before.at("/facts/0/endpoints"), snapshot().at("/facts/0/endpoints")); assertEquals(2, count(database, "draft_journal"));
        }
    }

    @Test void deleteImpactBindsDerivedEvidenceAndCascadeCannotBypassBlockedTarget() throws Exception {
        var token = open().get("draft_token"); var before = snapshot();
        var options = call("capabilities", capabilities(token, "DELETE_CONSTRUCT", "occurrence.raw"), 200, "DraftCapabilitiesResult").at("/data/options");
        var target = options.get(0); assertFalse(target.get("enabled").asBoolean());
        var impact = target.get("impact_summary"); assertEquals(token, impact.get("input_token")); assertEquals(1, impact.at("/counts/contexts").asInt());
        var text = call("text", query(token), 200, "DraftTextResult"); assertEquals(text.at("/data/sentences").size(), impact.at("/counts/opl_sentences").asInt());
        assertTrue(impact.at("/counts/traces").asInt() > 0); assertTrue(impact.get("items").toString().contains("BLOCKER"));
        error("commands", deletion(token, "occurrence.raw", "DELETE_TARGET"), 422, "DRAFT_EDIT_REJECTED");
        var request = deletion(token, "occurrence.raw", "CASCADE");
        var forged = request.deepCopy(); ((ObjectNode) forged.at("/command/payload")).put("impact_token", "impact.draft." + "0".repeat(64));
        assertEquals("IMPACT_TOKEN_STALE", error("commands", forged, 422, "DRAFT_EDIT_REJECTED").get("reason_code").asText());
        forged = request.deepCopy(); ((ObjectNode) forged.at("/command/payload")).put("construct_id", "element.processing"); error("commands", forged, 422, "DRAFT_EDIT_REJECTED");
        assertEquals(before, snapshot()); assertEquals(0, count(database, "draft_receipt"));
        token = call("commands", request, 200, "DraftEditResult").get("result_token");
        assertEquals(1, snapshot().get("elements").size()); assertTrue(snapshot().get("states").isEmpty()); assertTrue(snapshot().get("facts").isEmpty());
        assertEquals(before.at("/elements/1"), snapshot().at("/elements/0"));
        request.put("request_id", "request.retry.delete"); assertEquals(token, call("commands", request, 200, "DraftEditResult").get("result_token"));
        request.put("command_id", "command.stale.delete"); error("commands", request, 409, "DRAFT_CONFLICT");
        assertEquals(1, count(database, "draft_journal"));
        token = call("commands", deletion(token, "occurrence.process", "DELETE_TARGET"), 200, "DraftEditResult").get("result_token");
        assertTrue(snapshot().get("elements").isEmpty()); assertTrue(snapshot().get("layouts").isEmpty()); assertEquals(1, count(database, "revision_document"));
    }

    @Test void stateAndFeatureDeletionCloseOwnersAndReferencedOccurrenceOnlyRemovesView() throws Exception {
        var token = open().get("draft_token");
        token = call("commands", deletion(token, "occurrence.state", "DELETE_TARGET"), 200, "DraftEditResult").get("result_token");
        assertTrue(snapshot().get("states").isEmpty()); assertTrue(snapshot().at("/elements/0/state_ids").isEmpty()); assertEquals(1, snapshot().get("facts").size());
        for (String kind : List.of("ATTRIBUTE", "OPERATION")) {
            token = submit(token, "CREATE_FEATURE", "element.raw.material", feature("element.raw.material", kind), kind.equals("ATTRIBUTE") ? 0 : 1);
            String id = snapshot().at("/features/0/feature_id").asText(); token = submit(token, "CREATE_STATE", id, state("FEATURE", id, "值"), 0);
            error("commands", deletion(token, occurrenceFor(id), "DELETE_TARGET"), 422, "DRAFT_EDIT_REJECTED");
            token = call("commands", deletion(token, occurrenceFor(id), "CASCADE"), 200, "DraftEditResult").get("result_token");
            assertTrue(snapshot().get("features").isEmpty()); assertTrue(snapshot().get("states").isEmpty()); assertTrue(snapshot().at("/elements/0/feature_ids").isEmpty());
        }
        Path storage = temporary.resolve("reference"); database = create(storage, true, document -> {
            var copy = ((ObjectNode) document.at("/occurrences/0")).deepCopy().put("occurrence_id", "occurrence.reference").put("ownership", "REFERENCED").put("layout_id", "layout.reference");
            ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("occurrences")).add(copy);
            ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/contexts/0/occurrence_ids")).add("occurrence.reference");
            ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("layouts")).add(((ObjectNode) document.at("/layouts/0")).deepCopy().put("layout_id", "layout.reference"));
        }); mvc = mvc(storage, root().resolve("packages/profiles")); token = open().get("draft_token"); var original = snapshot();
        assertEquals(2, call("capabilities", capabilities(token, "DELETE_CONSTRUCT", "occurrence.raw"), 200, "DraftCapabilitiesResult").at("/data/options").size());
        token = call("commands", deletion(token, "occurrence.reference", "REMOVE_OCCURRENCE"), 200, "DraftEditResult").get("result_token");
        assertEquals(original.get("elements"), snapshot().get("elements")); assertEquals(original.get("facts"), snapshot().get("facts")); assertEquals(4, snapshot().get("occurrences").size());
    }

    @Test void relationForgedEndpointsAndUnsupportedParametersNeverCreatePartialFact() throws Exception {
        var token = open().get("draft_token"); var before = snapshot(); var fact = before.at("/facts/0");
        for (String mutation : List.of("role", "kind", "target", "ordinal", "locator", "capability", "version", "ownership", "occurrenceRole", "direction", "labels", "modifier", "layout", "condition", "groups", "option")) {
            var payload = factPayload(fact); var request = relationEdit(token, "CREATE_FACT", null, List.of("occurrence.raw", "occurrence.process"), "CAP-ISO-PROC-001", false, payload);
            switch (mutation) {
                case "role" -> ((ObjectNode) payload.at("/normalized_endpoints/0")).put("role", "RESULT_OBJECT");
                case "kind" -> ((ObjectNode) payload.at("/normalized_endpoints/0/target_ref")).put("target_kind", "STATE");
                case "target" -> ((ObjectNode) payload.at("/normalized_endpoints/0/target_ref")).put("target_id", "element.processing");
                case "ordinal" -> ((ObjectNode) payload.at("/normalized_endpoints/0")).put("ordinal", 1);
                case "locator" -> ((ObjectNode) payload.at("/normalized_endpoints/0/target_ref")).put("occurrence_id", "occurrence.process");
                case "capability" -> ((ObjectNode) payload.get("capability_ref")).put("capability_id", "CAP-ISO-CTRL-001");
                case "version" -> ((ObjectNode) payload.get("capability_ref")).put("version", "99.0.0");
                case "ownership" -> ((ObjectNode) payload.get("occurrence")).put("ownership", "REFERENCED");
                case "occurrenceRole" -> ((ObjectNode) payload.get("occurrence")).put("construct_role", "STRUCTURAL_LINK");
                case "direction" -> payload.put("direction", "UNDIRECTED");
                case "labels" -> payload.putArray("labels").addObject().put("slot_id", "forward_tag").put("text", "非法标签");
                case "modifier" -> payload.putArray("modifiers").addObject().put("modifier_id", "control.capability").put("value", "CAP-ISO-CTRL-001");
                case "layout" -> ((ObjectNode) payload.get("layout")).putObject("junction_position").put("x", 1).put("y", 2);
                case "condition" -> payload.putObject("condition").put("condition_id", "condition.test").put("value", "x");
                case "groups" -> payload.putArray("logical_groups").addObject().put("group_id", "group.test").putArray("endpoint_ordinals").add(0);
                case "option" -> ((ObjectNode) request.get("authorization")).put("selected_option_id", "option.forged");
            }
            error("commands", request, 422, "DRAFT_EDIT_REJECTED");
        }
        assertEquals(before, snapshot()); assertEquals(0, count(database, "draft_journal")); assertEquals(0, count(database, "draft_receipt"));
        var grouped = JSON.createObjectNode().put("fact_id", fact.get("fact_id").asText()); grouped.putObject("expected_capability_ref").put("capability_id", "CAP-ISO-PROC-001"); grouped.putObject("replacement").putArray("logical_groups");
        assertEquals("COMMAND_NOT_IMPLEMENTED", error("commands", relationEdit(token, "UPDATE_FACT", fact.get("fact_id").asText(), List.of(), "CAP-ISO-PROC-001", false, grouped), 422, "DRAFT_EDIT_REJECTED").get("reason_code").asText());
        var payload = factPayload(fact); token = call("commands", relationEdit(token, "CREATE_FACT", null, List.of("occurrence.process", "occurrence.raw"), "CAP-ISO-PROC-001", false, payload), 200, "DraftEditResult").get("result_token");
        assertEquals(2, snapshot().get("facts").size());
        var layout = snapshot().get("layouts").get(snapshot().get("layouts").size() - 1); assertEquals(payload.at("/layout/route_points"), layout.get("route_points"));
    }

    @Test void structuralLabelAndEndpointChangesPreserveUnchangedEndpointIdentity() throws Exception {
        var golden = SaveContentDigestV1.read(java.nio.file.Files.readString(root().resolve("packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/g-opl-struct-001-unidirectional-object-tagged-pass.json")));
        loadGolden(temporary.resolve("label-edit"), golden, false); var token = open().get("draft_token"); var original = snapshot(); var fact = original.at("/facts/0");
        String id = fact.get("fact_id").asText(); var update = JSON.createObjectNode().put("fact_id", id);
        update.putObject("expected_capability_ref").put("capability_id", "CAP-ISO-STRUCT-001");
        update.putObject("replacement").putArray("labels").addObject().put("slot_id", "forward_tag").put("text", "supports");
        var beforeRequest = relationEdit(token, "UPDATE_FACT", id, List.of(), "CAP-ISO-STRUCT-001", false, update);
        token = call("commands", beforeRequest, 200, "DraftEditResult").get("result_token");
        assertTrue(call("text", query(token), 200, "DraftTextResult").toString().contains("supports"));
        assertEquals(original.at("/facts/0/endpoints"), snapshot().at("/facts/0/endpoints")); assertEquals(original.at("/facts/0/source"), snapshot().at("/facts/0/source"));
        var element = JSON.createObjectNode().put("element_id", "element.third").put("kind", "OBJECT").put("name", "Third"); element.putObject("layout").put("x", 50).put("y", 50);
        token = submit(token, "CREATE_ELEMENT", null, element, 0);
        var endpoints = factPayload(fact).get("normalized_endpoints").deepCopy(); ((ObjectNode) endpoints.at("/1/target_ref")).put("target_id", "element.third");
        update.putObject("replacement").set("normalized_endpoints", endpoints);
        String source = fact.at("/endpoints/0/target_id").asText();
        token = call("commands", relationEdit(token, "UPDATE_FACT", id, List.of(source, "element.third"), "CAP-ISO-STRUCT-001", false, update), 200, "DraftEditResult").get("result_token");
        assertEquals(original.at("/facts/0/endpoints/0"), snapshot().at("/facts/0/endpoints/0"));
        assertNotEquals(original.at("/facts/0/endpoints/1/endpoint_id"), snapshot().at("/facts/0/endpoints/1/endpoint_id"));
        update.putObject("replacement").put("direction", "BIDIRECTIONAL");
        error("commands", relationEdit(token, "UPDATE_FACT", id, List.of(), "CAP-ISO-STRUCT-001", false, update), 422, "DRAFT_EDIT_REJECTED");
        update.putObject("replacement").putArray("labels"); error("commands", relationEdit(token, "UPDATE_FACT", id, List.of(), "CAP-ISO-STRUCT-001", false, update), 422, "DRAFT_EDIT_REJECTED");
        assertEquals(3, count(database, "draft_journal")); assertEquals(1, count(database, "revision_document"));
    }

    @Test void multiContextDeletionAllowsLocalCascadeButRejectsCrossContextOccurrence() throws Exception {
        Path storage = temporary.resolve("multi-context"); database = create(storage, true, document -> {
            var context = ((ObjectNode) document.at("/contexts/0")).deepCopy().put("context_id", "context.second"); context.putArray("occurrence_ids");
            ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("contexts")).add(context);
        }); mvc = mvc(storage, root().resolve("packages/profiles")); var token = open().get("draft_token");
        var result = call("capabilities", capabilities(token, "DELETE_CONSTRUCT", "occurrence.raw"), 200, "DraftCapabilitiesResult");
        assertFalse(result.at("/data/options/0/enabled").asBoolean());
        assertTrue(result.at("/data/options/1/enabled").asBoolean());
        token = call("commands", deletion(token, "occurrence.raw", "CASCADE"), 200, "DraftEditResult").get("result_token");
        assertEquals(2, snapshot().get("contexts").size());
        assertTrue(snapshot().at("/contexts/1/occurrence_ids").isEmpty());
        assertEquals(1, count(database, "draft_journal"));

        storage = temporary.resolve("cross-context-occurrence"); database = create(storage, true, document -> {
            var context = ((ObjectNode) document.at("/contexts/0")).deepCopy().put("context_id", "context.second");
            context.putArray("occurrence_ids").add("occurrence.second");
            ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("contexts")).add(context);
            var occurrence = ((ObjectNode) document.at("/occurrences/0")).deepCopy()
                    .put("occurrence_id", "occurrence.second").put("context_id", "context.second")
                    .put("ownership", "REFERENCED").put("layout_id", "layout.second");
            ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("occurrences")).add(occurrence);
            ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("layouts")).add(
                    ((ObjectNode) document.at("/layouts/0")).deepCopy().put("layout_id", "layout.second"));
        }); mvc = mvc(storage, root().resolve("packages/profiles")); token = open().get("draft_token");
        var before = snapshot();
        result = call("capabilities", capabilities(token, "DELETE_CONSTRUCT", "occurrence.raw"), 200, "DraftCapabilitiesResult");
        for (var option : result.at("/data/options")) {
            assertFalse(option.get("enabled").asBoolean());
            assertEquals("CONTEXT_NOT_ALLOWED", option.at("/reason_codes/0").asText());
        }
        error("commands", deletion(token, "occurrence.raw", "CASCADE"), 422, "DRAFT_EDIT_REJECTED");
        assertEquals(before, snapshot());
        assertEquals(0, count(database, "draft_journal"));
    }

    @Test void draftQueriesUseCurrentTokenAndNeverCreatePersistentRows() throws Exception {
        var token = open().get("draft_token"); var before = snapshot();
        var navigation = call("navigation", query(token), 200, "DraftNavigationResult");
        assertEquals(before.at("/contexts/0/name/local_name").asText(), navigation.at("/data/process_tree/0/label").asText());
        var findings = call("findings", query(token), 200, "DraftFindingsResult");
        assertTrue(findings.at("/data/items").isEmpty()); assertEquals("MODEL", findings.at("/data/validation_scope").asText());
        assertEquals("INCOMPLETE", findings.at("/data/validation_summary/coverage_state").asText());
        var catalog = call("relation-catalog", catalogQuery(token, null), 200, "DraftRelationCatalogResult");
        assertEquals(token, catalog.at("/meta/draft_token")); assertEquals(34, catalog.at("/data/items").size());
        int procedural = 0, control = 0, structural = 0;
        for (var item : catalog.at("/data/items")) {
            switch (item.get("family").asText()) { case "PROCEDURAL" -> procedural++; case "CONTROL" -> control++; case "STRUCTURAL" -> structural++; default -> fail(); }
            assertEquals(item.get("symbol_id"), item.at("/symbol_descriptor/id"));
            assertEquals(before.at("/profile_binding/symbol_catalog/version"), item.at("/symbol_descriptor/version"));
            assertEquals(before.at("/profile_binding/symbol_catalog/digest/digest"), item.at("/symbol_descriptor/digest"));
            assertEquals(!item.get("family").asText().equals("CONTROL"), item.get("enabled").asBoolean());
            if (item.get("family").asText().equals("CONTROL")) assertEquals("CONTROL_REQUIRES_BASE_FACT", item.at("/reason_codes/0").asText());
        }
        assertEquals(16, procedural); assertEquals(8, control); assertEquals(10, structural);
        assertEquals(before, snapshot()); assertQueryCounts(0);
        var current = submit(token, "UPDATE_PROPERTY", "element.raw.material", name("element.raw.material", "实时草稿"), 0);
        for (String operation : List.of("navigation", "findings", "relation-catalog")) {
            error(operation, operation.equals("relation-catalog") ? catalogQuery(token, null) : query(token), 409, "DRAFT_CONFLICT");
            var request = operation.equals("relation-catalog") ? catalogQuery(current, null) : query(current);
            String type = switch (operation) { case "navigation" -> "DraftNavigationResult"; case "findings" -> "DraftFindingsResult"; default -> "DraftRelationCatalogResult"; };
            var result = call(operation, request, 200, type);
            mvc = mvc(temporary, root().resolve("packages/profiles"));
            assertEquals(current, open().get("draft_token")); assertEquals(result, call(operation, request, 200, type));
        }
        assertTrue(call("text", query(current), 200, "DraftTextResult").toString().contains("实时草稿"));
        assertQueryCounts(1);
    }

    @Test void catalogSelectsOnlyVisibleFactsAndReflectsDeletion() throws Exception {
        var token = open().get("draft_token"); String fact = snapshot().at("/facts/0/fact_id").asText();
        var selected = call("relation-catalog", catalogQuery(token, fact), 200, "DraftRelationCatalogResult");
        assertEquals(selected, call("relation-catalog", catalogQuery(token, "occurrence.fact"), 200, "DraftRelationCatalogResult"));
        var enabled = new java.util.ArrayList<String>();
        for (var item : selected.at("/data/items")) if (item.get("family").asText().equals("CONTROL")) {
            if (item.get("enabled").asBoolean()) enabled.add(item.get("capability_id").asText());
            else assertEquals("MODIFIER_COMBINATION_INVALID", item.at("/reason_codes/0").asText());
        }
        assertEquals(List.of("CAP-ISO-CTRL-001", "CAP-ISO-CTRL-005"), enabled);
        for (String invalid : List.of("element.raw.material", "occurrence.raw", "fact.missing")) error("relation-catalog", catalogQuery(token, invalid), 404, "NOT_FOUND");
        var result = call("commands", deletion(token, "occurrence.fact", "DELETE_TARGET"), 200, "DraftEditResult");
        var current = result.get("result_token");
        error("relation-catalog", catalogQuery(current, fact), 404, "NOT_FOUND");
        error("relation-catalog", catalogQuery(current, "occurrence.fact"), 404, "NOT_FOUND");
        assertTrue(call("findings", query(current), 200, "DraftFindingsResult").at("/data/items").isEmpty());
        assertQueryCounts(1);
        Path storage = temporary.resolve("catalog-structural");
        loadGolden(storage, SaveContentDigestV1.read(java.nio.file.Files.readString(root().resolve(
                "packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/g-opl-struct-001-unidirectional-object-tagged-pass.json"))), false);
        token = open().get("draft_token"); fact = snapshot().at("/facts/0/fact_id").asText();
        for (var item : call("relation-catalog", catalogQuery(token, fact), 200, "DraftRelationCatalogResult").at("/data/items"))
            if (item.get("family").asText().equals("CONTROL")) assertEquals("CONTROL_REQUIRES_BASE_FACT", item.at("/reason_codes/0").asText());
        assertQueryCounts(0);
    }

    @Test void navigationGroupsEveryContextWithoutInventingParentsOrAllowingCrossContextSelection() throws Exception {
        Path storage = temporary.resolve("navigation"); database = create(storage, true, document -> {
            var contexts = (com.fasterxml.jackson.databind.node.ArrayNode) document.get("contexts");
            for (String kind : List.of("PROFILE_CONTEXT", "MODEL_VIEW", "OBJECT_REFINEMENT", "PROCESS_REFINEMENT")) {
                ObjectNode context = contexts.get(0).deepCopy(); context.put("context_id", "context." + kind).put("context_kind", kind);
                ((ObjectNode) context.get("name")).put("local_name", "视图 " + kind); context.putArray("occurrence_ids"); contexts.add(context);
            }
        });
        mvc = mvc(storage, root().resolve("packages/profiles")); var token = open().get("draft_token"); var request = query(token).put("context_id", "context.MODEL_VIEW");
        var nav = call("navigation", request, 200, "DraftNavigationResult").get("data");
        assertEquals("context.MODEL_VIEW", nav.at("/current_path/0").asText()); assertEquals(1, nav.get("current_path").size());
        assertEquals(2, nav.get("process_tree").size()); assertEquals(1, nav.get("object_forest").size()); assertEquals(2, nav.get("views").size());
        assertEquals("context.MODEL_VIEW", nav.at("/views/0/context_id").asText()); assertEquals("context.PROFILE_CONTEXT", nav.at("/views/1/context_id").asText());
        for (String group : List.of("process_tree", "object_forest", "views")) for (var item : nav.get(group)) assertFalse(item.get("has_children").asBoolean());
        var catalog = catalogQuery(token, null).put("context_id", "context.MODEL_VIEW");
        for (var item : call("relation-catalog", catalog, 200, "DraftRelationCatalogResult").at("/data/items")) {
            assertFalse(item.get("enabled").asBoolean()); assertEquals("CONTEXT_NOT_ALLOWED", item.at("/reason_codes/0").asText());
        }
        catalog.put("selection_id", "occurrence.fact"); error("relation-catalog", catalog, 404, "NOT_FOUND");
        request.put("context_id", "context.absent"); error("navigation", request, 404, "NOT_FOUND"); assertQueryCounts(0);
    }

    @Test void findingsAreActualWholeModelDiagnosticsWithStableIdentityAcrossViewsAndReopen() throws Exception {
        Path storage = temporary.resolve("findings"); database = create(storage, true, document -> {
            ((ObjectNode) document.at("/states/0")).put("owner_element_id", "element.missing");
            ObjectNode view = document.at("/contexts/0").deepCopy(); view.put("context_id", "context.other").put("context_kind", "MODEL_VIEW");
            view.putArray("occurrence_ids"); ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("contexts")).add(view);
        });
        mvc = mvc(storage, root().resolve("packages/profiles")); var token = open().get("draft_token"); var before = snapshot();
        var result = call("findings", query(token), 200, "DraftFindingsResult"); var items = result.at("/data/items");
        assertFalse(items.isEmpty()); assertEquals(items.size(), result.at("/data/validation_summary/blocking").asInt());
        var keys = new java.util.ArrayList<String>(); var ids = new java.util.HashSet<String>(); boolean missingOwner = false;
        for (var item : items) {
            assertTrue(ids.add(item.get("finding_id").asText())); assertTrue(item.get("context_id").isNull()); assertEquals("BLOCKING", item.get("severity").asText());
            assertEquals("rule.core." + item.get("category").asText(), item.get("rule_id").asText());
            keys.add(item.get("category").asText() + "\u0000" + item.get("entity_id").asText() + "\u0000" + item.get("message").asText());
            if (item.get("message").asText().equals("state owner does not exist")) {
                missingOwner = true; assertEquals("state.raw.available", item.get("entity_id").asText());
            }
        }
        assertTrue(missingOwner); assertEquals(keys.stream().sorted().toList(), keys);
        assertEquals(result.get("data"), call("findings", query(token).put("request_id", "request.other").put("context_id", "context.other"), 200, "DraftFindingsResult").get("data"));
        mvc = mvc(storage, root().resolve("packages/profiles")); assertEquals(result, call("findings", query(token), 200, "DraftFindingsResult"));
        assertEquals(before, snapshot()); assertQueryCounts(0);
    }

    @Test void queryWireBindingAndAssetFailuresNeverReturnSuccessfulEmptyData() throws Exception {
        var token = open().get("draft_token");
        error("findings", catalogQuery(token, null), 400, "INPUT_INVALID");
        error("navigation", catalogQuery(token, null), 400, "INPUT_INVALID");
        for (String operation : List.of("navigation", "findings", "relation-catalog")) {
            var request = operation.equals("relation-catalog") ? catalogQuery(token, null) : query(token);
            ((ObjectNode) request.get("draft_token")).put("binding_digest", "a".repeat(64)).put("edit_seq", 999);
            error(operation, request, 409, "RULE_VERSION_CONFLICT");
        }
        mvc = mvc(temporary, temporary.resolve("missing-profiles"));
        for (String operation : List.of("projection", "text", "navigation", "findings", "relation-catalog"))
            error(operation, operation.equals("relation-catalog") ? catalogQuery(token, null) : query(token), 422, "DRAFT_EDIT_REJECTED");
        assertQueryCounts(0);
    }

    private void assertQueryCounts(int edits) throws Exception {
        assertEquals(edits, count(database, "draft_journal")); assertEquals(edits, count(database, "draft_receipt"));
        assertEquals(1, count(database, "revision_document")); assertEquals(1, count(database, "draft_checkpoint")); assertEquals(1, count(database, "draft_content"));
    }

    private ObjectNode catalogQuery(JsonNode token, String selection) { return query(token).put("selection_id", selection); }

    private void loadGolden(Path storage, ObjectNode golden, boolean removeFact) throws Exception {
        database = create(storage, true, document -> {
            document.removeAll(); document.setAll(golden.deepCopy()); document.put("model_id", MODEL); ((ObjectNode) document.get("model_header")).put("model_id", MODEL);
            if (removeFact) {
                var layouts = new java.util.HashSet<String>(); var occurrences = new java.util.HashSet<String>();
                var array = (com.fasterxml.jackson.databind.node.ArrayNode) document.get("occurrences");
                for (int i = array.size() - 1; i >= 0; i--) if (array.get(i).get("target_kind").asText().equals("FACT")) { layouts.add(array.get(i).get("layout_id").asText()); occurrences.add(array.get(i).get("occurrence_id").asText()); array.remove(i); }
                array = (com.fasterxml.jackson.databind.node.ArrayNode) document.get("layouts"); for (int i = array.size() - 1; i >= 0; i--) if (layouts.contains(array.get(i).get("layout_id").asText())) array.remove(i);
                for (var context : document.get("contexts")) { array = (com.fasterxml.jackson.databind.node.ArrayNode) context.get("occurrence_ids"); for (int i = array.size() - 1; i >= 0; i--) if (occurrences.contains(array.get(i).asText())) array.remove(i); }
                document.putArray("facts"); document.remove("text_artifact"); document.putArray("text_traces");
            }
        }); mvc = mvc(storage, root().resolve("packages/profiles"));
    }
    private List<String> endpointIds(JsonNode fact) { var ids = new java.util.ArrayList<String>(); for (var endpoint : fact.get("endpoints")) ids.add(endpoint.get("target_id").asText()); return ids; }
    private ObjectNode factPayload(JsonNode fact) {
        var payload = JSON.createObjectNode().put("context_id", CONTEXT).put("fact_family", fact.get("fact_family").asText()).put("direction", fact.get("direction").asText());
        payload.putObject("capability_ref").put("capability_id", fact.at("/capability_ref/capability_id").asText());
        var endpoints = payload.putArray("normalized_endpoints"); for (var endpoint : fact.get("endpoints")) {
            var item = endpoints.addObject().put("role", endpoint.get("role").asText()).put("ordinal", endpoint.get("ordinal").asInt());
            item.putObject("target_ref").put("target_kind", endpoint.get("target_kind").asText()).put("target_id", endpoint.get("target_id").asText());
            if (endpoint.has("state_qualification_id")) item.set("state_qualification", endpoint.get("state_qualification_id"));
        }
        for (String key : List.of("labels", "modifiers", "logical_groups")) { if (fact.has(key)) payload.set(key, fact.get(key)); else payload.putArray(key); }
        if (fact.has("collection_completeness")) payload.set("collection_completeness", fact.get("collection_completeness"));
        payload.putObject("occurrence").put("ownership", "OWNED").put("construct_role", fact.get("fact_family").asText().equals("STRUCTURAL") ? "STRUCTURAL_LINK" : "PROCEDURAL_LINK");
        payload.putObject("layout").put("x", -0d).put("y", 20.5).putArray("route_points").addObject().put("x", -0d).put("y", 17.5); return payload;
    }
    private ObjectNode relationEdit(JsonNode token, String type, String selection, List<String> endpoints, String capability, boolean remove, ObjectNode payload) throws Exception {
        var query = capabilities(token, type, selection); var ids = ((ObjectNode) query.get("scope")).putArray("endpoints"); endpoints.forEach(ids::add);
        JsonNode option = null; for (var item : call("capabilities", query, 200, "DraftCapabilitiesResult").at("/data/options"))
            if (item.at("/capability_ref/capability_id").asText().equals(capability) && item.path("group_path").toString().contains("Remove") == remove) { option = item; break; }
        assertNotNull(option, capability + " " + query); return authorizedEdit(token, query.get("scope"), option, payload);
    }
    private ObjectNode authorizedEdit(JsonNode token, JsonNode scope, JsonNode option, ObjectNode payload) {
        var request = JSON.createObjectNode().put("request_id", "request.fact").put("command_id", "command." + java.util.UUID.randomUUID());
        request.set("expected_draft_token", token); request.set("scope", scope);
        request.putObject("authorization").set("capability_query_id", option.get("capability_query_id")); ((ObjectNode) request.get("authorization")).set("selected_option_id", option.get("option_id"));
        request.putObject("command").put("command_type", scope.get("intent").asText()).set("payload", payload); return request;
    }
    private String occurrenceFor(String target) { for (var occurrence : snapshot().get("occurrences")) if (occurrence.get("target_id").asText().equals(target)) return occurrence.get("occurrence_id").asText(); throw new AssertionError(target); }
    private ObjectNode deletion(JsonNode token, String selection, String mode) throws Exception {
        var query = capabilities(token, "DELETE_CONSTRUCT", selection); JsonNode option = null;
        for (var item : call("capabilities", query, 200, "DraftCapabilitiesResult").at("/data/options")) if (item.get("delete_mode").asText().equals(mode)) option = item;
        assertNotNull(option, mode); var payload = JSON.createObjectNode().put("selection_id", selection).put("delete_mode", mode)
                .put("construct_kind", option.at("/delete_target/kind").asText()).put("construct_id", option.at("/delete_target/id").asText()).put("impact_token", option.get("impact_token").asText());
        return authorizedEdit(token, query.get("scope"), option, payload);
    }

    private ObjectNode feature(String owner, String kind) {
        var payload = JSON.createObjectNode().put("context_id", CONTEXT).put("owner_element_id", owner).put("feature_kind", kind).put("name", "新" + kind);
        payload.putObject("capability_ref").put("capability_id", "CAP-FEAT-" + kind + "-001").put("version", "0.2.0");
        payload.putObject("occurrence").put("ownership", "OWNED").put("construct_role", kind + "_NODE"); payload.putObject("layout").put("x", -0d).put("y", 30.5); return payload;
    }
    private ObjectNode state(String kind, String owner, String name) {
        var payload = JSON.createObjectNode().put("context_id", CONTEXT).put("name_or_value", name);
        payload.putObject("owner_ref").put("target_kind", kind).put("target_id", owner);
        payload.putObject("capability_ref").put("capability_id", kind.equals("FEATURE") ? "CAP-FEAT-STATE-001" : "CAP-STATE-001"); payload.putArray("state_roles");
        payload.putObject("occurrence").put("ownership", "OWNED").put("construct_role", kind.equals("FEATURE") ? "FEATURE_STATE_NODE" : "STATE_NODE");
        payload.putObject("layout").put("x", -0d).put("y", 55.5); return payload;
    }
    private ObjectNode stateUpdate(String state, String kind, String owner) {
        var payload = JSON.createObjectNode().put("state_id", state); payload.putObject("expected_owner_ref").put("target_kind", kind).put("target_id", owner); return payload;
    }
    private JsonNode submit(JsonNode token, String type, String selection, ObjectNode payload, int ordinal) throws Exception {
        return call("commands", edit(token, type, selection, payload, ordinal), 200, "DraftEditResult").get("result_token");
    }

    @org.springframework.context.annotation.Configuration(proxyBeanMethods = false)
    @org.springframework.web.servlet.config.annotation.EnableWebMvc
    @org.springframework.context.annotation.Import({ApiWebConfiguration.class, DraftWorkspaceController.class, DraftWorkspaceExceptionHandler.class, ApiExceptionHandler.class})
    static class MvcConfiguration { }

    @Test void actualSpringConfigurationRegistersTheDraftSessionGuard() throws Exception {
        try (var context = new org.springframework.web.context.support.AnnotationConfigWebApplicationContext()) {
            context.setServletContext(new org.springframework.mock.web.MockServletContext());
            context.addBeanFactoryPostProcessor(beans -> {
                var factory = new ProjectDatabaseFactory(temporary); var loader = new FileProfilePackageLoader(root().resolve("packages/profiles"));
                beans.registerSingleton("localSessionToken", new LocalSessionToken("test-session"));
                beans.registerSingleton("draftWorkspaceService", new DraftWorkspaceService(factory, new LocalApiService(factory, loader), loader, CLOCK));
            });
            context.register(MvcConfiguration.class); context.refresh(); mvc = MockMvcBuilders.webAppContextSetup(context).build();
            assertEquals("LOCAL_SESSION_INVALID", perform(post(URL + "open").contentType(MediaType.APPLICATION_JSON).content("{}"), 403, "DraftError").get("code").asText());
            assertEquals(0, open().at("/draft_token/edit_seq").intValue());
        }
    }

    private record DeleteTree(JsonNode token, String child, String grandchild, String element, String occurrence) { }
    private DeleteTree deleteTree() throws Exception {
        var token = open().get("draft_token");
        var childPayload = JSON.createObjectNode().put("context_id", CONTEXT).put("refinee_element_id", "element.raw.material").put("name", "待删除子图");
        token = call("commands", edit(token, "CREATE_CONTEXT", "occurrence.raw", childPayload, 0), 200, "DraftEditResult").get("result_token");
        String child = snapshot().at("/refinement_edges/0/child_context_id").asText();
        var element = JSON.createObjectNode().put("context_id", child).put("kind", "OBJECT").put("name", "子图对象");
        element.putObject("layout").put("x", 80).put("y", 80).put("width", 160).put("height", 72);
        token = call("commands", editAt(token, child, "CREATE_ELEMENT", null, element, 0), 200, "DraftEditResult").get("result_token");
        var doc = snapshot(); String id = doc.get("elements").get(doc.get("elements").size() - 1).get("element_id").asText();
        String occurrence = occurrenceFor(id);
        var ownedState = state("ELEMENT", id, "待处理").put("context_id", child);
        token = call("commands", editAt(token, child, "CREATE_STATE", occurrence, ownedState, 0), 200, "DraftEditResult").get("result_token");
        var ownedFeature = feature(id, "ATTRIBUTE").put("context_id", child);
        token = call("commands", editAt(token, child, "CREATE_FEATURE", occurrence, ownedFeature, 0), 200, "DraftEditResult").get("result_token");
        var nested = JSON.createObjectNode().put("context_id", child).put("refinee_element_id", id).put("name", "下级子图");
        token = call("commands", editAt(token, child, "CREATE_CONTEXT", occurrence, nested, 0), 200, "DraftEditResult").get("result_token");
        String grandchild = snapshot().at("/refinement_edges/1/child_context_id").asText();
        var processPayload = JSON.createObjectNode().put("context_id", child).put("kind", "PROCESS").put("name", "子图处理");
        processPayload.putObject("layout").put("x", 420).put("y", 80).put("width", 160).put("height", 72);
        token = call("commands", editAt(token, child, "CREATE_ELEMENT", null, processPayload, 1), 200, "DraftEditResult").get("result_token");
        doc = snapshot(); String processId = doc.get("elements").get(doc.get("elements").size() - 1).get("element_id").asText();
        var fact = factPayload(doc.at("/facts/0")).put("context_id", child);
        ((ObjectNode) fact.at("/normalized_endpoints/0/target_ref")).put("target_id", id);
        ((ObjectNode) fact.at("/normalized_endpoints/1/target_ref")).put("target_id", processId);
        var scope = capabilitiesAt(token, child, "CREATE_FACT", null);
        ((com.fasterxml.jackson.databind.node.ArrayNode) scope.at("/scope/endpoints")).add(occurrence).add(occurrenceFor(processId));
        JsonNode factOption = null;
        for (var item : call("capabilities", scope, 200, "DraftCapabilitiesResult").at("/data/options"))
            if (item.at("/capability_ref/capability_id").asText().equals("CAP-ISO-PROC-001")) factOption = item;
        assertNotNull(factOption);
        token = call("commands", authorizedEdit(token, scope.get("scope"), factOption, fact), 200, "DraftEditResult").get("result_token");
        processPayload.put("context_id", grandchild).put("name", "下级内容");
        token = call("commands", editAt(token, grandchild, "CREATE_ELEMENT", null, processPayload, 1), 200, "DraftEditResult").get("result_token");
        return new DeleteTree(token, child, grandchild, id, occurrence);
    }
    private ObjectNode contextDeletion(JsonNode token, String active, String target) throws Exception {
        var query = capabilitiesAt(token, active, "DELETE_CONTEXT", target);
        var option = call("capabilities", query, 200, "DraftCapabilitiesResult").at("/data/options/0");
        assertFalse(option.isMissingNode());
        return authorizedEdit(token, query.get("scope"), option, JSON.createObjectNode().put("context_id", target).put("impact_token", option.get("impact_token").asText()));
    }
    @Test void contextDeletionRemovesWholeSubtreePreservesParentAndHistoryAndRetries() throws Exception {
        var original = snapshot(); var tree = deleteTree();
        var option = call("capabilities", capabilitiesAt(tree.token(), tree.grandchild(), "DELETE_CONTEXT", tree.child()), 200, "DraftCapabilitiesResult").at("/data/options/0");
        assertTrue(option.get("enabled").asBoolean());
        assertEquals(2, option.at("/context_impact/counts/contexts").intValue());
        assertEquals(3, option.at("/context_impact/counts/elements").intValue());
        assertEquals(1, option.at("/context_impact/counts/facts").intValue());
        assertEquals(1, option.at("/context_impact/counts/features").intValue());
        assertEquals(1, option.at("/context_impact/counts/states").intValue());
        var before = snapshot();
        var request = contextDeletion(tree.token(), tree.grandchild(), tree.child());
        var result = call("commands", request, 200, "DraftEditResult");
        var after = snapshot();
        for (String field : List.of("elements", "states", "facts", "occurrences", "layouts", "contexts")) assertEquals(original.get(field), after.get(field), field);
        assertTrue(after.get("features").isEmpty()); assertTrue(after.get("refinement_edges").isEmpty());
        assertEquals(1, count(database, "revision_document")); assertEquals(9, count(database, "draft_journal"));
        request.put("request_id", "request.context.delete.retry");
        assertEquals(result.get("result_token"), call("commands", request, 200, "DraftEditResult").get("result_token"));
        assertEquals(9, count(database, "draft_journal"));
        request.put("command_id", "command.context.delete.stale"); error("commands", request, 409, "DRAFT_CONFLICT");
        assertEquals(after, snapshot()); assertNotEquals(before, after);
        mvc = mvc(temporary, root().resolve("packages/profiles"));
        assertEquals(result.get("result_token"), open().get("draft_token"));
        assertTrue(call("capabilities", capabilities(result.get("result_token"), "CREATE_CONTEXT", "occurrence.raw"), 200, "DraftCapabilitiesResult").at("/data/options/0/enabled").asBoolean());
    }
    @Test void contextDeletionRejectsRootTamperingAndStaleImpactWithoutWrites() throws Exception {
        var tree = deleteTree(); var before = snapshot();
        assertTrue(call("capabilities", capabilities(tree.token(), "DELETE_CONTEXT", CONTEXT), 200, "DraftCapabilitiesResult").at("/data/options").isEmpty());
        for (String fault : List.of("target", "impact", "authorization")) {
            var request = contextDeletion(tree.token(), CONTEXT, tree.child());
            if (fault.equals("target")) ((ObjectNode) request.at("/command/payload")).put("context_id", tree.grandchild());
            if (fault.equals("impact")) ((ObjectNode) request.at("/command/payload")).put("impact_token", "forged.impact");
            if (fault.equals("authorization")) ((ObjectNode) request.get("authorization")).put("selected_option_id", "option.forged");
            error("commands", request, fault.equals("target") ? 400 : 422, fault.equals("target") ? "INPUT_INVALID" : "DRAFT_EDIT_REJECTED"); assertEquals(before, snapshot());
        }
        var downgrade = contextDeletion(tree.token(), CONTEXT, tree.child());
        var failure = assertThrows(DraftJournalRepository.Failure.class, () -> new DraftJournalRepository(database, CLOCK).commit(PROJECT, MODEL,
                DraftWorkspaceContract.read(downgrade.toString(), DraftWorkspaceContract.Type.DraftEditRequest), document -> {
                    document.put("schema_version", "0.2"); document.remove("refinement_edges");
                    return new DraftJournalRepository.Proposal(document.toString(), List.of(), List.of(), "{\"blocking\":0,\"warning\":0,\"suggestion\":0,\"coverage_state\":\"INCOMPLETE\"}");
                }));
        assertEquals("INPUT_INVALID", failure.code()); assertEquals(before, snapshot());
        assertEquals(8, count(database, "draft_journal"));
    }
    @Test void contextDeletionBlocksOutsideOccurrencesRelationsPresentationsAndRefinements() throws Exception {
        var tree = deleteTree(); var source = snapshot();
        for (String fault : List.of("occurrence", "fact", "presentation", "refinement")) {
            Path storage = temporary.resolve(fault);
            database = create(storage, true, ignored -> { });
            var document = source.deepCopy();
            {
                if (fault.equals("occurrence")) {
                    ObjectNode occurrence = null, layout = null;
                    for (var item : document.get("occurrences")) if (item.path("occurrence_id").asText().equals(tree.occurrence())) occurrence = (ObjectNode) item;
                    for (var item : document.get("layouts")) if (item.path("layout_id").equals(occurrence.get("layout_id"))) layout = (ObjectNode) item;
                    var copy = occurrence.deepCopy().put("occurrence_id", "occurrence.external").put("context_id", CONTEXT).put("layout_id", "layout.external").put("ownership", "REFERENCED");
                    ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("occurrences")).add(copy);
                    ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("layouts")).add(layout.deepCopy().put("layout_id", "layout.external"));
                    ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/contexts/0/occurrence_ids")).add("occurrence.external");
                }
                if (fault.equals("fact")) ((ObjectNode) document.at("/facts/0/endpoints/0")).put("target_id", tree.element());
                if (fault.equals("presentation")) {
                    String stateId = document.get("states").get(document.get("states").size() - 1).get("state_id").asText();
                    if (!document.has("state_presentations")) document.putArray("state_presentations");
                    ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("state_presentations")).addObject().put("context_id", CONTEXT).put("state_id", stateId).put("explicitness", "SUPPRESSED").put("fold_state", "FOLDED");
                }
                if (fault.equals("refinement")) {
                    var edge = ((ObjectNode) document.at("/refinement_edges/1")).deepCopy().put("refinement_id", "refinement.external").put("parent_context_id", CONTEXT).put("child_context_id", "context.external");
                    var context = ((ObjectNode) document.at("/contexts/2")).deepCopy().put("context_id", "context.external");
                    ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("contexts")).add(context);
                    ((com.fasterxml.jackson.databind.node.ArrayNode) document.get("refinement_edges")).add(edge);
                }
            }
            mvc = mvc(storage, root().resolve("packages/profiles"));
            var initial = open().get("draft_token");
            var fixtureRequest = edit(initial, "UPDATE_PROPERTY", "occurrence.raw", name("element.raw.material", "测试夹具"), 0);
            new DraftJournalRepository(database, CLOCK).commit(PROJECT, MODEL,
                    DraftWorkspaceContract.read(fixtureRequest.toString(), DraftWorkspaceContract.Type.DraftEditRequest),
                    ignored -> new DraftJournalRepository.Proposal(document.toString(), List.of(), List.of(), "{\"blocking\":0,\"warning\":0,\"suggestion\":0,\"coverage_state\":\"INCOMPLETE\"}"));
            var token = open().get("draft_token"); var before = snapshot();
            var option = call("capabilities", capabilities(token, "DELETE_CONTEXT", tree.child()), 200, "DraftCapabilitiesResult").at("/data/options/0");
            assertFalse(option.path("enabled").asBoolean(), fault); assertFalse(option.at("/context_impact/blockers").isEmpty(), fault);
            error("commands", contextDeletion(token, CONTEXT, tree.child()), 422, "DRAFT_EDIT_REJECTED");
            assertEquals(before, snapshot()); assertEquals(1, count(database, "draft_journal"));
        }
    }

    private JsonNode open() throws Exception { return call("open", JSON.createObjectNode().put("request_id", "request.open").putNull("context_id"), 200, "OpenDraftResult"); }
    private ObjectNode snapshot() { return SaveContentDigestV1.read(new DraftJournalRepository(database, CLOCK).read(PROJECT, MODEL).documentJson()); }

    @Test void methodSummaryUsesExactInputAndDoesNotWriteOrChangeValidation() throws Exception {
        var token = open().get("draft_token"); var before = snapshot();
        var request = JSON.createObjectNode().put("request_id", "query.method").put("context_id", CONTEXT);
        request.putObject("source").set("draft_token", token);
        var result = call("method-summary", request, 200, "MethodSummaryResult");
        assertEquals(request.get("source"), result.at("/meta/source"));
        assertEquals("EVIDENCE", result.at("/data/processes/0/roles/3/status").asText());
        assertEquals("MANUAL", result.at("/data/processes/0/roles/4/status").asText());
        var historical = request.deepCopy(); historical.putObject("source").set("revision_id", before.get("revision_id"));
        assertEquals(result.get("data"), call("method-summary", historical, 200, "MethodSummaryResult").get("data"));
        assertEquals(before, snapshot()); assertQueryCounts(0);
        var both = request.deepCopy(); ((ObjectNode) both.get("source")).set("revision_id", before.get("revision_id"));
        error("method-summary", both, 400, "INPUT_INVALID");
        var stale = request.deepCopy(); ((ObjectNode) stale.at("/source/draft_token")).put("edit_seq", 1);
        error("method-summary", stale, 409, "DRAFT_CONFLICT");
        var missing = request.deepCopy().put("context_id", "context.missing");
        error("method-summary", missing, 404, "NOT_FOUND");
        historical.putObject("source").put("revision_id", "revision.missing");
        error("method-summary", historical, 404, "NOT_FOUND");
        var renamed = call("commands", edit(token, "UPDATE_PROPERTY", "occurrence.raw", name("element.raw.material", "后续名称"), 0), 200, "DraftEditResult");
        error("method-summary", request, 409, "DRAFT_CONFLICT");
        historical.putObject("source").set("revision_id", before.get("revision_id"));
        assertFalse(call("method-summary", historical, 200, "MethodSummaryResult").toString().contains("后续名称"));
        request.putObject("source").set("draft_token", renamed.get("result_token"));
        assertTrue(call("method-summary", request, 200, "MethodSummaryResult").toString().contains("后续名称"));
    }
    @Test void methodClassificationUsesMetadataAuthorizationDigestIdempotencyAndClear() throws Exception {
        var token = open().get("draft_token"); var before = snapshot();
        var empty = call("commands", classification(token, CONTEXT, null), 200, "DraftEditResult");
        assertEquals("UNCHANGED", empty.path("status").asText()); assertEquals(before, snapshot());
        var options = call("capabilities", capabilities(token, "UPDATE_ARCHITECTURE_CLASSIFICATION", null), 200, "DraftCapabilitiesResult");
        assertEquals("METHOD_METADATA", options.at("/data/options/0/option_kind").asText());
        assertFalse(options.at("/data/options/0").has("capability_ref")); assertFalse(options.at("/data/options/0").has("symbol_descriptor"));
        var request = classification(token, CONTEXT, "MISSION");
        var result = call("commands", request, 200, "DraftEditResult");
        assertEquals("DURABLE", result.path("status").asText()); assertEquals("0.4", snapshot().path("schema_version").asText());
        assertEquals("MISSION", snapshot().at("/contexts/0/architecture_level").asText());
        assertNotEquals(SaveContentDigestV1.sha256(before), SaveContentDigestV1.sha256(snapshot()));
        assertEquals("SaveContentDigest/2", SaveContentDigestV1.version(snapshot()));
        for (String field : List.of("elements", "features", "states", "facts", "layouts", "occurrences", "text_artifact", "text_traces"))
            assertEquals(before.path(field), snapshot().path(field), field);
        var retried = request.deepCopy().put("request_id", "request.retry.classification");
        assertEquals(result.path("result_token"), call("commands", retried, 200, "DraftEditResult").path("result_token"));
        assertEquals(1, count(database, "draft_journal"));
        error("commands", request.deepCopy().put("command_id", "command.stale.classification"), 409, "DRAFT_CONFLICT");
        token = result.path("result_token");
        assertEquals("UNCHANGED", call("commands", classification(token, CONTEXT, "MISSION"), 200, "DraftEditResult").path("status").asText());
        var summary = JSON.createObjectNode().put("request_id", "query.level").put("context_id", CONTEXT);
        summary.putObject("source").set("draft_token", token);
        assertEquals("MISSION", call("method-summary", summary, 200, "MethodSummaryResult").at("/data/contexts/0/architecture_level").asText());
        summary.putObject("source").set("revision_id", before.path("revision_id"));
        assertTrue(call("method-summary", summary, 200, "MethodSummaryResult").at("/data/contexts/0/architecture_level").isNull());
        result = call("commands", classification(token, CONTEXT, null), 200, "DraftEditResult");
        assertFalse(snapshot().at("/contexts/0").has("architecture_level")); assertEquals("0.4", snapshot().path("schema_version").asText());
        assertEquals(result.path("result_token"), open().path("draft_token"));
        var history = call("operation-history", JSON.createObjectNode().put("request_id", "query.history").put("revision", "HEAD").putNull("before"), 200, "OperationHistoryResult");
        assertTrue(history.toString().contains("任务架构")); assertTrue(history.toString().contains("未分类"));
    }

    @Test void classificationInvalidScopeValueOrAuthorityWritesNothing() throws Exception {
        var token = open().get("draft_token"); var before = snapshot();
        var request = classification(token, CONTEXT, "FUNCTION");
        var invalid = request.deepCopy(); ((ObjectNode) invalid.at("/command/payload")).put("architecture_level", "AUTO");
        error("commands", invalid, 400, "INPUT_INVALID");
        invalid = request.deepCopy(); ((ObjectNode) invalid.at("/command/payload")).put("context_id", "context.other");
        error("commands", invalid, 400, "INPUT_INVALID");
        invalid = request.deepCopy(); ((ObjectNode) invalid.path("authorization")).put("selected_option_id", "option.fake");
        error("commands", invalid, 422, "DRAFT_EDIT_REJECTED");
        invalid = request.deepCopy(); ((ObjectNode) invalid.path("scope")).put("selection_id", "occurrence.raw");
        error("commands", invalid, 422, "DRAFT_EDIT_REJECTED");
        invalid = request.deepCopy(); ((ObjectNode) invalid.path("scope")).putArray("endpoints").add("occurrence.raw");
        error("commands", invalid, 422, "DRAFT_EDIT_REJECTED");
        assertEquals(before, snapshot()); assertQueryCounts(0);
    }

    @Test void classificationReceiptFailureRollsBackDocumentTokenAndHistory() throws Exception {
        var token = open().path("draft_token"); var before = snapshot(); var request = classification(token, CONTEXT, "PRODUCT");
        var query = JSON.createObjectNode().put("request_id", "query.history.atomic").put("revision", "HEAD").putNull("before");
        var history = call("operation-history", query, 200, "OperationHistoryResult").path("data");
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + database); var statement = connection.createStatement()) {
            statement.execute("CREATE TRIGGER test_method_failure BEFORE INSERT ON draft_receipt BEGIN SELECT RAISE(ABORT,'测试分类存储失败'); END");
        }
        error("commands", request, 503, "PERSISTENCE_FAILED");
        assertEquals(before, snapshot()); assertEquals(token, open().path("draft_token")); assertQueryCounts(0);
        assertEquals(history, call("operation-history", query, 200, "OperationHistoryResult").path("data"));
    }

    @Test void classifiedContextsSurviveOrdinaryEditsNewChildAndChildDeletion() throws Exception {
        var token = call("commands", classification(open().path("draft_token"), CONTEXT, "MISSION"), 200, "DraftEditResult").path("result_token");
        var create = JSON.createObjectNode().put("context_id", CONTEXT).put("refinee_element_id", "element.raw.material").put("name", "分类子图");
        token = call("commands", edit(token, "CREATE_CONTEXT", "occurrence.raw", create, 0), 200, "DraftEditResult").path("result_token");
        String child = snapshot().at("/contexts/1/context_id").asText();
        assertFalse(snapshot().at("/contexts/1").has("architecture_level"));
        assertEquals("0.4", snapshot().path("schema_version").asText());
        token = call("commands", classification(token, child, "FUNCTION"), 200, "DraftEditResult").path("result_token");
        var add = JSON.createObjectNode().put("context_id", child).put("kind", "OBJECT").put("name", "新对象");
        add.putObject("layout").put("x", 30).put("y", 60);
        token = call("commands", editAt(token, child, "CREATE_ELEMENT", null, add, 0), 200, "DraftEditResult").path("result_token");
        assertEquals("MISSION", snapshot().at("/contexts/0/architecture_level").asText());
        assertEquals("FUNCTION", snapshot().at("/contexts/1/architecture_level").asText());
        var semantic = org.opm.localruntime.semantic.DraftSemanticView.read(snapshot());
        var rewritten = SaveContentDigestV1.read(new org.opm.localruntime.semantic.SemanticRevisionJsonWriter().write(semantic));
        assertEquals("0.4", rewritten.path("schema_version").asText());
        assertEquals("FUNCTION", rewritten.at("/contexts/1/architecture_level").asText());
        call("commands", contextDeletion(token, CONTEXT, child), 200, "DraftEditResult");
        assertEquals(1, snapshot().path("contexts").size()); assertEquals("MISSION", snapshot().at("/contexts/0/architecture_level").asText());
    }

    @Test void architectureLinksHaveThreeKindsBothDirectionsNoopReceiptsAndHistory() throws Exception {
        var token = createTraceChild(open().path("draft_token")); String child = snapshot().at("/contexts/1/context_id").asText();
        var before = snapshot(); var first = architectureLink(token, CONTEXT, child, "INPUT");
        var result = call("commands", first, 200, "DraftEditResult"); token = result.path("result_token");
        assertEquals("0.5", snapshot().path("schema_version").asText()); assertEquals("SaveContentDigest/2", SaveContentDigestV1.version(snapshot()));
        assertNotEquals(SaveContentDigestV1.sha256(before), SaveContentDigestV1.sha256(snapshot()));
        assertEquals(token, call("commands", first.deepCopy().put("request_id", "request.link.retry"), 200, "DraftEditResult").path("result_token"));
        error("commands", first.deepCopy().put("command_id", "command.link.stale"), 409, "DRAFT_CONFLICT");
        assertEquals("UNCHANGED", call("commands", architectureLink(token, CONTEXT, child, "INPUT"), 200, "DraftEditResult").path("status").asText());
        for (String kind : List.of("GENERATES", "TRACE")) token = call("commands", architectureLink(token, CONTEXT, child, kind), 200, "DraftEditResult").path("result_token");
        token = call("commands", architectureLink(token, child, CONTEXT, "TRACE"), 200, "DraftEditResult").path("result_token");
        var current = JSON.createObjectNode().put("request_id", "query.links").put("context_id", child); current.putObject("source").set("draft_token", token);
        var links = call("method-summary", current, 200, "MethodSummaryResult").at("/data/architecture_links"); assertEquals(4, links.size());
        assertEquals(CONTEXT, links.get(0).path("source_context_id").asText()); assertEquals(child, links.get(0).path("target_context_id").asText());
        current.put("context_id", CONTEXT); current.putObject("source").set("revision_id", before.path("revision_id"));
        assertTrue(call("method-summary", current, 200, "MethodSummaryResult").at("/data/architecture_links").isEmpty());
        token = call("commands", classification(token, child, "FUNCTION"), 200, "DraftEditResult").path("result_token");
        var add = JSON.createObjectNode().put("context_id", child).put("kind", "OBJECT").put("name", "关联后编辑"); add.putObject("layout").put("x", 20).put("y", 30);
        token = call("commands", editAt(token, child, "CREATE_ELEMENT", null, add, 0), 200, "DraftEditResult").path("result_token");
        assertEquals("0.5", snapshot().path("schema_version").asText());
        for (var link : links) {
            String from = link.path("source_context_id").asText(), to = link.path("target_context_id").asText();
            token = call("commands", removeArchitectureLink(token, to, link.path("link_id").asText()), 200, "DraftEditResult").path("result_token");
            assertNotEquals(from, to);
        }
        assertEquals("0.5", snapshot().path("schema_version").asText()); assertEquals(token, open().path("draft_token"));
        var history = call("operation-history", JSON.createObjectNode().put("request_id", "query.link.history").put("revision", "HEAD").putNull("before"), 200, "OperationHistoryResult").toString();
        assertTrue(history.contains("提供输入给")); assertTrue(history.contains("生成")); assertTrue(history.contains("追溯到")); assertTrue(history.contains("关联子图"));
    }
    @Test void architectureInvalidScopeSelfTargetKindAndAuthorityWriteNothing() throws Exception {
        var token = createTraceChild(open().path("draft_token")); String child = snapshot().at("/contexts/1/context_id").asText(); var before = snapshot();
        var request = architectureLink(token, CONTEXT, child, "INPUT");
        for (String fault : List.of("self", "target", "kind", "scope", "authority", "selection", "endpoints")) {
            var invalid = request.deepCopy(); var payload = (ObjectNode) invalid.at("/command/payload");
            switch (fault) {
                case "self" -> payload.put("target_context_id", CONTEXT);
                case "target" -> payload.put("target_context_id", "context.absent");
                case "kind" -> payload.put("kind", "AUTO");
                case "scope" -> payload.put("context_id", child);
                case "authority" -> ((ObjectNode) invalid.path("authorization")).put("selected_option_id", "option.fake");
                case "selection" -> ((ObjectNode) invalid.path("scope")).put("selection_id", "occurrence.raw");
                case "endpoints" -> ((ObjectNode) invalid.path("scope")).putArray("endpoints").add("occurrence.raw");
            }
            error("commands", invalid, fault.equals("kind") || fault.equals("scope") ? 400 : fault.equals("target") ? 404 : 422,
                    fault.equals("kind") || fault.equals("scope") ? "INPUT_INVALID" : fault.equals("target") ? "NOT_FOUND" : "DRAFT_EDIT_REJECTED");
        }
        error("commands", removeArchitectureLink(token, CONTEXT, "link.absent"), 404, "NOT_FOUND"); assertEquals(before, snapshot());
    }
    @Test void architectureReceiptFailureRollsBackTokenDocumentAndOperationHistory() throws Exception {
        var token = createTraceChild(open().path("draft_token")); String child = snapshot().at("/contexts/1/context_id").asText(); var before = snapshot();
        var query = JSON.createObjectNode().put("request_id", "query.trace.atomic").put("revision", "HEAD").putNull("before");
        var history = call("operation-history", query, 200, "OperationHistoryResult").path("data");
        var request = architectureLink(token, CONTEXT, child, "INPUT");
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite:" + database); var statement = connection.createStatement()) {
            statement.execute("CREATE TRIGGER test_trace_failure BEFORE INSERT ON draft_receipt BEGIN SELECT RAISE(ABORT,'测试关联存储失败'); END");
        }
        error("commands", request, 503, "PERSISTENCE_FAILED"); assertEquals(before, snapshot()); assertEquals(token, open().path("draft_token"));
        assertEquals(history, call("operation-history", query, 200, "OperationHistoryResult").path("data"));
        assertEquals(1, count(database, "draft_journal")); assertEquals(1, count(database, "draft_receipt"));
    }
    @Test void externalIncomingLinkBlocksChildDeletionUntilRemovedFromTarget() throws Exception {
        var token = createTraceChild(open().path("draft_token")); String child = snapshot().at("/contexts/1/context_id").asText();
        token = call("commands", architectureLink(token, CONTEXT, child, "INPUT"), 200, "DraftEditResult").path("result_token");
        var candidates = call("capabilities", capabilitiesAt(token, CONTEXT, "DELETE_CONTEXT", child), 200, "DraftCapabilitiesResult");
        assertFalse(candidates.at("/data/options/0/enabled").asBoolean()); assertFalse(candidates.at("/data/options/0/context_impact/blockers").isEmpty());
        error("commands", contextDeletion(token, CONTEXT, child), 422, "DRAFT_EDIT_REJECTED");
        String id = snapshot().at("/contexts/0/architecture_links/0/link_id").asText();
        token = call("commands", removeArchitectureLink(token, child, id), 200, "DraftEditResult").path("result_token");
        token = call("commands", contextDeletion(token, CONTEXT, child), 200, "DraftEditResult").path("result_token");
        assertEquals(1, snapshot().path("contexts").size()); assertEquals("0.5", snapshot().path("schema_version").asText());
        assertEquals(token, open().path("draft_token"));
    }
    @Test void addingAnotherChildKeepsLinksAndUnrelatedContextCannotDeleteThem() throws Exception {
        var token = createTraceChild(open().path("draft_token")); String child = snapshot().at("/contexts/1/context_id").asText();
        token = call("commands", architectureLink(token, CONTEXT, child, "INPUT"), 200, "DraftEditResult").path("result_token");
        var originalLinks = snapshot().at("/contexts/0/architecture_links");
        String process = "", occurrence = "";
        for (var item : snapshot().path("elements")) if (item.path("core_kind").asText().equals("PROCESS")) process = item.path("element_id").asText();
        for (var item : snapshot().path("occurrences")) if (item.path("context_id").asText().equals(CONTEXT) && item.path("target_id").asText().equals(process)) occurrence = item.path("occurrence_id").asText();
        var create = JSON.createObjectNode().put("context_id", CONTEXT).put("refinee_element_id", process).put("name", "无关子图");
        token = call("commands", edit(token, "CREATE_CONTEXT", occurrence, create, 0), 200, "DraftEditResult").path("result_token");
        String other = snapshot().at("/contexts/2/context_id").asText(); var before = snapshot();
        assertEquals("0.5", before.path("schema_version").asText()); assertEquals(originalLinks, before.at("/contexts/0/architecture_links"));
        error("commands", removeArchitectureLink(token, other, originalLinks.at("/0/link_id").asText()), 422, "DRAFT_EDIT_REJECTED");
        assertEquals(before, snapshot()); assertEquals(token, open().path("draft_token"));
    }

    private JsonNode createTraceChild(JsonNode token) throws Exception {
        var create = JSON.createObjectNode().put("context_id", CONTEXT).put("refinee_element_id", "element.raw.material").put("name", "关联子图");
        return call("commands", edit(token, "CREATE_CONTEXT", "occurrence.raw", create, 0), 200, "DraftEditResult").path("result_token");
    }
    private ObjectNode architectureLink(JsonNode token, String source, String target, String kind) throws Exception {
        return editAt(token, source, "CREATE_ARCHITECTURE_LINK", null, JSON.createObjectNode().put("context_id", source).put("target_context_id", target).put("kind", kind), 0);
    }
    private ObjectNode removeArchitectureLink(JsonNode token, String current, String link) throws Exception {
        return editAt(token, current, "DELETE_ARCHITECTURE_LINK", null, JSON.createObjectNode().put("context_id", current).put("link_id", link), 0);
    }

    private ObjectNode classification(JsonNode token, String context, String level) throws Exception {
        var payload = JSON.createObjectNode().put("context_id", context).put("architecture_level", level);
        return editAt(token, context, "UPDATE_ARCHITECTURE_CLASSIFICATION", null, payload, 0);
    }

    private ObjectNode query(JsonNode token) { var request = JSON.createObjectNode().put("request_id", "request.query").put("context_id", CONTEXT); request.set("draft_token", token.deepCopy()); return request; }
    private ObjectNode capabilities(JsonNode token, String intent, String selection) {
        return capabilitiesAt(token, CONTEXT, intent, selection);
    }
    private ObjectNode capabilitiesAt(JsonNode token, String context, String intent, String selection) {
        var request = JSON.createObjectNode().put("request_id", "request.capabilities"); request.set("draft_token", token.deepCopy());
        request.putObject("scope").put("context_id", context).put("selection_id", selection).put("intent", intent).putArray("endpoints"); return request;
    }
    private ObjectNode edit(JsonNode token, String type, String selection, ObjectNode payload, int ordinal) throws Exception {
        return editAt(token, CONTEXT, type, selection, payload, ordinal);
    }
    private ObjectNode editAt(JsonNode token, String context, String type, String selection, ObjectNode payload, int ordinal) throws Exception {
        var query = capabilitiesAt(token, context, type, selection); var option = call("capabilities", query, 200, "DraftCapabilitiesResult").at("/data/options").get(ordinal); assertNotNull(option);
        var request = JSON.createObjectNode().put("request_id", "request.edit").put("command_id", "command." + java.util.UUID.randomUUID());
        request.set("expected_draft_token", token.deepCopy()); request.set("scope", query.get("scope"));
        request.putObject("authorization").set("capability_query_id", option.get("capability_query_id")); ((ObjectNode) request.get("authorization")).set("selected_option_id", option.get("option_id"));
        request.putObject("command").put("command_type", type).set("payload", payload); return request;
    }
    private ObjectNode name(String element, String value) { return name(element, "ELEMENT", value); }
    private ObjectNode name(String target, String kind, String value) { var payload = JSON.createObjectNode().put("property_name", "name").put("value", value); payload.putObject("target_ref").put("target_kind", kind).put("target_id", target); return payload; }
    private JsonNode error(String operation, JsonNode input, int status, String code) throws Exception { var result = call(operation, input, status, "DraftError"); assertEquals(code, result.get("code").asText()); return result; }
    private JsonNode call(String operation, JsonNode input, int status, String type) throws Exception { return perform(authorized(operation).content(input.toString()), status, type); }
    private MockHttpServletRequestBuilder authorized(String operation) { return post(URL + operation).contentType(MediaType.APPLICATION_JSON).header("Origin", "http://localhost:5173").header("X-OPM-Session", "test-session"); }
    private JsonNode perform(MockHttpServletRequestBuilder request, int status, String type) throws Exception {
        var result = mvc.perform(request).andReturn(); var response = result.getResponse();
        if (response.getStatus() != status && result.getResolvedException() != null) throw new AssertionError(response.getContentAsString(), result.getResolvedException());
        assertEquals(status, response.getStatus(), response.getContentAsString());
        return DraftWorkspaceContract.read(response.getContentAsString(), DraftWorkspaceContract.Type.valueOf(type)).value();
    }
}
