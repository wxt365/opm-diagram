package org.opm.localruntime.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.opm.localruntime.api.generated.DraftWorkspaceContract;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;

class DraftWorkspaceContractTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static JsonNode vectors() throws Exception {
        Path root = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (root != null && !Files.exists(root.resolve("tests/fixtures/hybrid-save/draft-workspace-v02-vectors.json"))) root = root.getParent();
        assertNotNull(root);
        return JSON.readTree(Files.readString(root.resolve("tests/fixtures/hybrid-save/draft-workspace-v02-vectors.json")));
    }

    @Test void catalogSelectionAndFindingCoverageHaveClosedCrossLanguageSemantics() throws Exception {
        ObjectNode request = null, result = null;
        for (var message : vectors().get("messages")) {
            if (message.get("type").asText().equals("DraftRelationCatalogRequest")) request = (ObjectNode) JSON.readTree(message.get("raw").asText());
            if (message.get("type").asText().equals("DraftFindingsResult")) result = (ObjectNode) JSON.readTree(message.get("raw").asText());
        }
        assertNotNull(request); assertNotNull(result); request.put("selection_id", "occurrence.fact");
        assertNotNull(DraftWorkspaceContract.read(request.toString(), DraftWorkspaceContract.Type.DraftRelationCatalogRequest));
        String withSelection = request.toString();
        assertThrows(DraftWorkspaceSchema.Invalid.class, () -> DraftWorkspaceContract.read(withSelection, DraftWorkspaceContract.Type.DraftQueryRequest));
        for (JsonNode invalidSelection : java.util.List.of(JSON.getNodeFactory().numberNode(1), JSON.createObjectNode())) {
            request.set("selection_id", invalidSelection); String raw = request.toString();
            assertThrows(DraftWorkspaceSchema.Invalid.class, () -> DraftWorkspaceContract.read(raw, DraftWorkspaceContract.Type.DraftRelationCatalogRequest));
        }
        request.remove("selection_id"); String missing = request.toString();
        assertThrows(DraftWorkspaceSchema.Invalid.class, () -> DraftWorkspaceContract.read(missing, DraftWorkspaceContract.Type.DraftRelationCatalogRequest));
        var item = JSON.createObjectNode().put("finding_id", "finding.test").put("rule_id", "rule.core.MISSING_REFERENCE").put("severity", "BLOCKING")
                .put("category", "MISSING_REFERENCE").putNull("context_id").put("entity_id", "state.test").put("message", "state owner does not exist");
        ((com.fasterxml.jackson.databind.node.ArrayNode) result.at("/data/items")).add(item);
        ((ObjectNode) result.at("/data/validation_summary")).put("blocking", 1);
        assertNotNull(DraftWorkspaceContract.read(result.toString(), DraftWorkspaceContract.Type.DraftFindingsResult));
        java.util.List<java.util.function.Consumer<ObjectNode>> mutations = java.util.List.of(
                r -> ((ObjectNode) r.at("/data/validation_summary")).put("blocking", 2),
                r -> ((ObjectNode) r.at("/data/validation_summary")).put("warning", 1),
                r -> ((ObjectNode) r.at("/data/validation_summary")).put("coverage_state", "COMPLETE"),
                r -> ((ObjectNode) r.get("data")).put("validation_scope", "CONTEXT"),
                r -> ((ObjectNode) r.at("/data/items/0")).put("context_id", "context.1"),
                r -> ((ObjectNode) r.at("/data/items/0")).put("category", "UNKNOWN"),
                r -> { ((com.fasterxml.jackson.databind.node.ArrayNode) r.at("/data/items")).add(item.deepCopy()); ((ObjectNode) r.at("/data/validation_summary")).put("blocking", 2); },
                r -> r.putArray("data"));
        for (var mutate : mutations) {
            ObjectNode invalid = result.deepCopy(); mutate.accept(invalid);
            assertThrows(DraftWorkspaceSchema.Invalid.class, () -> DraftWorkspaceContract.read(invalid.toString(), DraftWorkspaceContract.Type.DraftFindingsResult));
        }
    }

    @Test
    void readsThirteenCommandsAndRejectsCrossedPayloads() throws Exception {
        var commands = vectors().get("commands"); assertEquals(13, commands.size());
        Set<String> presentation = Set.of("STATE_EXPLICIT", "STATE_SUPPRESS", "UNFOLD", "FOLD");
        for (var request : commands) {
            var document = DraftWorkspaceContract.read(request.toString(), DraftWorkspaceContract.Type.DraftEditRequest);
            assertEquals(request.at("/command/command_type"), document.value().at("/command/command_type"));
            for (var other : commands) {
                String type = request.at("/command/command_type").asText(), otherType = other.at("/command/command_type").asText();
                if (type.equals(otherType) || presentation.contains(type) && presentation.contains(otherType)) continue;
                ObjectNode crossed = request.deepCopy(); ((ObjectNode) crossed.get("command")).set("payload", other.at("/command/payload"));
                assertThrows(DraftWorkspaceSchema.Invalid.class, () -> DraftWorkspaceContract.read(crossed.toString(), DraftWorkspaceContract.Type.DraftEditRequest), type + " / " + otherType);
            }
        }
    }

    @Test
    void validatesTheSameQueryReceiptAndRejectionVectorsAsNode() throws Exception {
        var vectors = vectors();
        for (var message : vectors.get("messages")) {
            var type = DraftWorkspaceContract.Type.valueOf(message.get("type").asText());
            assertNotNull(DraftWorkspaceContract.read(message.get("raw").asText(), type));
        }
        assertEquals(62, vectors.get("rejections").size());
        for (var message : vectors.get("rejections")) {
            var type = DraftWorkspaceContract.Type.valueOf(message.get("type").asText());
            var error = assertThrows(DraftWorkspaceSchema.Invalid.class, () -> DraftWorkspaceContract.read(message.get("raw").asText(), type), message.toString());
            assertEquals("INPUT_INVALID", error.code());
        }
    }

    @Test
    void matchesSixExactCanonicalAndDigestVectorsIncludingNegativeZero() throws Exception {
        var vectors = vectors();
        String project = vectors.get("project_id").asText(), model = vectors.get("model_id").asText();
        for (var vector : vectors.get("digests")) {
            String raw = vector.get("raw").asText();
            assertEquals(vector.get("canonical").asText(), DraftEditRequestIdentity.canonical(project, model, raw));
            assertEquals(vector.get("digest").asText(), DraftEditRequestIdentity.digest(project, model, raw));
        }
        var value = DraftWorkspaceContract.read(vectors.at("/digests/0/raw").asText(), DraftWorkspaceContract.Type.DraftEditRequest).value();
        assertEquals(Double.doubleToRawLongBits(-0d), Double.doubleToRawLongBits(value.at("/command/payload/layout/x").doubleValue()));
        assertNotEquals(vectors.at("/digests/0/digest").asText(), DraftEditRequestIdentity.digest("project.other", model, vectors.at("/digests/0/raw").asText()));
    }

    @Test
    void cannotMutateAcceptedDocumentAndDoesNotLoseOptionalPresence() throws Exception {
        var request = vectors().at("/commands/0");
        var accepted = DraftWorkspaceContract.read(request.toString(), DraftWorkspaceContract.Type.DraftEditRequest);
        ((ObjectNode) accepted.value().get("command").get("payload")).put("name", "已修改副本");
        assertEquals("订单", accepted.value().at("/command/payload/name").asText());
        assertFalse(accepted.value().at("/command/payload").has("element_id"));
        ObjectNode invalid = request.deepCopy(); ((ObjectNode) invalid.at("/command/payload")).putNull("element_id");
        assertThrows(DraftWorkspaceSchema.Invalid.class, () -> DraftWorkspaceContract.read(invalid.toString(), DraftWorkspaceContract.Type.DraftEditRequest));
        assertThrows(DraftWorkspaceSchema.Invalid.class, () -> DraftWorkspaceContract.read(request.toString().replace("订单", "\\ud800"), DraftWorkspaceContract.Type.DraftEditRequest));
    }
}
