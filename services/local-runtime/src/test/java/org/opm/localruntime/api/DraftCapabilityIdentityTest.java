package org.opm.localruntime.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DraftCapabilityIdentityTest {
    @Test void pinDigestMatchesNodeVectorAndBindsOperationPurposeAndCapture() {
        var json = new ObjectMapper();
        var request = json.createObjectNode().put("pin_id", "pin.test").put("purpose", "PERMALINK");
        request.putObject("target_draft_token").put("draft_id", "draft.test").put("edit_seq", 7).put("binding_digest", "a".repeat(64));
        var digest = DraftCapabilityIdentity.pin("project.test", "model.test", request);
        assertEquals("0526b1948d39fff497ff228e04978536459c48e8d458d2f15096d17ffb2d41ff", digest);
        assertNotEquals(digest, DraftCapabilityIdentity.pin("project.other", "model.test", request));
        assertNotEquals(digest, DraftCapabilityIdentity.pin("project.test", "model.other", request));
        for (String field : java.util.List.of("pin_id", "purpose")) {
            var changed = request.deepCopy(); changed.put(field, field.equals("purpose") ? "EXPORT" : "pin.other");
            assertNotEquals(digest, DraftCapabilityIdentity.pin("project.test", "model.test", changed));
        }
        ((ObjectNode) request.get("target_draft_token")).put("edit_seq", 8);
        assertNotEquals(digest, DraftCapabilityIdentity.pin("project.test", "model.test", request));
    }

    @Test void findingIdentityMatchesNodeAndBindsScopeTokenAndDiagnostic() {
        var token = new ObjectMapper().createObjectNode().put("draft_id", "draft.test").put("edit_seq", 7).put("binding_digest", "a".repeat(64));
        String id = DraftCapabilityIdentity.finding("project.test", "model.test", token, "MISSING_REFERENCE", "state.test", "state owner does not exist");
        assertEquals("finding.draft.3ba9af5cae522243733e9544aa3698a68ba9323b894ddcf80ea96347c7b73df5", id);
        assertNotEquals(id, DraftCapabilityIdentity.finding("project.other", "model.test", token, "MISSING_REFERENCE", "state.test", "state owner does not exist"));
        assertNotEquals(id, DraftCapabilityIdentity.finding("project.test", "model.other", token, "MISSING_REFERENCE", "state.test", "state owner does not exist"));
        assertNotEquals(id, DraftCapabilityIdentity.finding("project.test", "model.test", token, "INVALID_ENDPOINT", "state.test", "state owner does not exist"));
        assertNotEquals(id, DraftCapabilityIdentity.finding("project.test", "model.test", token, "MISSING_REFERENCE", "state.other", "state owner does not exist"));
        assertNotEquals(id, DraftCapabilityIdentity.finding("project.test", "model.test", token, "MISSING_REFERENCE", "state.test", "changed"));
        token.put("edit_seq", 8); assertNotEquals(id, DraftCapabilityIdentity.finding("project.test", "model.test", token, "MISSING_REFERENCE", "state.test", "state owner does not exist"));
    }

    @Test void deleteImpactMatchesIndependentNodeVectorAndRejectsIdentityDrift() throws Exception {
        var json = new ObjectMapper();
        var summary = json.readTree("""
                {"input_token":{"draft_id":"draft.test","edit_seq":7,"binding_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"selected_occurrence_id":"occurrence.fact","delete_mode":"DELETE_TARGET","target":{"kind":"FACT","id":"fact.test"},"items":[{"kind":"FACT","id":"fact.test","effect":"DIRECT"}],"counts":{"contexts":0,"occurrences":0,"elements":0,"features":0,"states":0,"facts":1,"opl_sentences":0,"traces":0,"findings":0}}
                """);
        String digest = DraftCapabilityIdentity.impact("query.draft.test", "option.draft.test", summary);
        assertEquals("impact.draft.0cca59afd93b828869e4f96f4ba93eeb405fa442bbbb375dcfdeb42434377dc5", digest);
        assertNotEquals(digest, DraftCapabilityIdentity.impact("query.draft.other", "option.draft.test", summary));
        assertNotEquals(digest, DraftCapabilityIdentity.impact("query.draft.test", "option.draft.other", summary));
        ((ObjectNode) summary.get("input_token")).put("edit_seq", 8); assertNotEquals(digest, DraftCapabilityIdentity.impact("query.draft.test", "option.draft.test", summary));
        ((ObjectNode) summary.get("input_token")).put("edit_seq", 7); ((ObjectNode) summary.get("counts")).put("facts", 2);
        assertNotEquals(digest, DraftCapabilityIdentity.impact("query.draft.test", "option.draft.test", summary));
    }

    @Test void matchesIndependentNodeJcsVectorAndBindsCompleteScopeAndOptionBody() throws Exception {
        var json = new ObjectMapper();
        var token = json.createObjectNode().put("draft_id", "draft.test").put("edit_seq", 7).put("binding_digest", "a".repeat(64));
        var scope = json.createObjectNode().put("context_id", "context.root").putNull("selection_id").put("intent", "CREATE_ELEMENT"); scope.putArray("endpoints");
        String query = DraftCapabilityIdentity.query("project.test", "model.test", token, scope);
        // 独立 Node binary64/JCS 计算结果；精确输入在本测试及 HS-02B 冻结。
        assertEquals("query.draft.de91423ec3b75ec70fc3453be51e07da7273c289cf2210b6f2a2075ddbb26aa5", query);
        var body = json.createObjectNode().put("command_type", "CREATE_ELEMENT").put("display_name", "创建对象");
        body.set("expires_with_token", token); body.putArray("required_fields");
        String option = DraftCapabilityIdentity.option(query, body);
        assertEquals("option.draft.23fbb63ee4abe46c02ca9b148fc2c04545e3f862703b3b4967316f0dc5245d0a", option);
        body.put("capability_query_id", query).put("option_id", "option.old").put("impact_token", "impact.old");
        assertEquals(option, DraftCapabilityIdentity.option(query, body));
        body.put("display_name", "另一个对象"); assertNotEquals(option, DraftCapabilityIdentity.option(query, body));
        var changed = scope.deepCopy(); changed.putArray("endpoints").add("element.a").add("element.b");
        String forward = DraftCapabilityIdentity.query("project.test", "model.test", token, changed);
        changed.putArray("endpoints").add("element.b").add("element.a"); assertNotEquals(forward, DraftCapabilityIdentity.query("project.test", "model.test", token, changed));
        token.put("edit_seq", 8); assertNotEquals(query, DraftCapabilityIdentity.query("project.test", "model.test", token, scope));
        token.put("edit_seq", 7.0); assertEquals(query, DraftCapabilityIdentity.query("project.test", "model.test", token, scope));
        assertNotEquals(query, DraftCapabilityIdentity.query("project.other", "model.test", token, scope));
        // binary64 编码不得将 -0 合并为 0，且键插入顺序不影响 JCS。
        ObjectNode a = (ObjectNode) json.readTree("{\"a\":-0.0,\"b\":1}"), b = (ObjectNode) json.readTree("{\"b\":1,\"a\":-0.0}");
        assertEquals(DraftCapabilityIdentity.option(query, a), DraftCapabilityIdentity.option(query, b));
        b.put("a", 0); assertNotEquals(DraftCapabilityIdentity.option(query, a), DraftCapabilityIdentity.option(query, b));
    }
}
