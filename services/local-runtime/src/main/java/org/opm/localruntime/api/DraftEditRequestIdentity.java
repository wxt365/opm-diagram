package org.opm.localruntime.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.opm.localruntime.releaseauthoring.ProjectionDigestV01;
import org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer;

/** 幂等请求身份不包含 transport request_id；不用于内容去重或候选授权。 */
public final class DraftEditRequestIdentity {
    private static final ObjectMapper JSON = new ObjectMapper();
    private DraftEditRequestIdentity() { }

    public static JsonNode preimage(String projectId, String modelId, String raw) {
        DraftWorkspaceSchema.validate(JSON.valueToTree(projectId), "StableId");
        DraftWorkspaceSchema.validate(JSON.valueToTree(modelId), "StableId");
        ObjectNode request = (ObjectNode) DraftWorkspaceSchema.read(raw, "DraftEditRequest");
        request.remove("request_id");
        request.put("identity_version", "DraftEditRequest/1").put("project_id", projectId).put("model_id", modelId);
        return encode(request);
    }
    public static String canonical(String projectId, String modelId, String raw) { return Rfc8785JsonCanonicalizer.canonicalize(preimage(projectId, modelId, raw)); }
    public static String digest(String projectId, String modelId, String raw) { return Rfc8785JsonCanonicalizer.sha256(preimage(projectId, modelId, raw)); }

    static JsonNode encode(JsonNode value) {
        if (value.isNumber()) return JSON.createObjectNode().put("binary64", ProjectionDigestV01.binary64Hex(value.doubleValue()));
        if (value.isArray()) {
            var result = JSON.createArrayNode(); value.forEach(item -> result.add(encode(item))); return result;
        }
        if (value.isObject()) {
            var result = JSON.createObjectNode(); value.fields().forEachRemaining(field -> result.set(field.getKey(), encode(field.getValue()))); return result;
        }
        return value.deepCopy();
    }
}
