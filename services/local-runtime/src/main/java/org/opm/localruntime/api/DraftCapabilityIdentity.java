package org.opm.localruntime.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;

/** HS-01D 候选身份；调用者仍必须从实际模型重建选项。 */
public final class DraftCapabilityIdentity {
    private static final ObjectMapper JSON = new ObjectMapper();
    private DraftCapabilityIdentity() { }

    public static String query(String project, String model, JsonNode token, JsonNode scope) {
        ObjectNode preimage = JSON.createObjectNode().put("identity_version", "DraftCapabilityQuery/1").put("project_id", project).put("model_id", model);
        preimage.set("draft_token", token); preimage.set("scope", scope);
        return "query.draft." + hash(preimage);
    }

    public static String option(String query, ObjectNode option) {
        ObjectNode body = option.deepCopy(); body.remove(java.util.List.of("capability_query_id", "option_id", "impact_token"));
        ObjectNode preimage = JSON.createObjectNode().put("identity_version", "DraftCapabilityOption/1").put("query_id", query);
        preimage.set("body", body);
        return "option.draft." + hash(preimage);
    }

    public static String impact(String query, String option, JsonNode summary) {
        var preimage = JSON.createObjectNode().put("identity_version", "DraftDeleteImpact/1").put("query_id", query).put("option_id", option);
        preimage.set("impact_summary", summary); return "impact.draft." + hash(preimage);
    }

    public static String finding(String project, String model, JsonNode token, String code, String locator, String message) {
        var preimage = JSON.createObjectNode().put("identity_version", "DraftFinding/1").put("project_id", project).put("model_id", model)
                .put("code", code).put("locator_id", locator).put("message", message);
        preimage.set("draft_token", token); return "finding.draft." + hash(preimage);
    }

    public static String save(String project, String model, JsonNode request) {
        var preimage = JSON.createObjectNode().put("identity_version", "DraftSaveRequest/1").put("project_id", project).put("model_id", model);
        for (String key : java.util.List.of("save_id", "target_draft_token", "reason")) preimage.set(key, request.required(key));
        return hash(preimage);
    }

    public static String pin(String project, String model, JsonNode request) {
        var preimage = JSON.createObjectNode().put("identity_version", "DraftPinRequest/1").put("project_id", project).put("model_id", model);
        for (String key : java.util.List.of("pin_id", "target_draft_token", "purpose")) preimage.set(key, request.required(key));
        return hash(preimage);
    }

    private static String hash(JsonNode value) { return Rfc8785JsonCanonicalizer.sha256(DraftEditRequestIdentity.encode(value)); }
}
