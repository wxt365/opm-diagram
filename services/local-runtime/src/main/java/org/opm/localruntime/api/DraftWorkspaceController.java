package org.opm.localruntime.api;

import com.fasterxml.jackson.databind.JsonNode;
import org.opm.localruntime.api.generated.DraftWorkspaceContract;
import org.opm.localruntime.application.DraftWorkspaceService;
import org.springframework.web.bind.annotation.*;
import static org.opm.localruntime.api.generated.DraftWorkspaceContract.Type.*;

@RestController
@RequestMapping("/api/v2/projects/{project}/models/{model}/draft")
public final class DraftWorkspaceController {
    private final DraftWorkspaceService service;
    public DraftWorkspaceController(DraftWorkspaceService service) { this.service = service; }

    @PostMapping(value = "/{operation:open|projection|text|navigation|findings|relation-catalog|capabilities|commands|receipts}", consumes = "application/json", produces = "application/json")
    public JsonNode execute(@PathVariable String project, @PathVariable String model, @PathVariable String operation, @RequestBody String raw) {
        var type = switch (operation) {
            case "open" -> OpenDraftRequest;
            case "capabilities" -> DraftCapabilitiesRequest;
            case "commands" -> DraftEditRequest;
            case "receipts" -> DraftReceiptRequest;
            case "relation-catalog" -> DraftRelationCatalogRequest;
            default -> DraftQueryRequest;
        };
        // 先保留原始词法执行严格解码，再进入领域层。
        var request = DraftWorkspaceContract.read(raw, type);
        JsonNode result = type == DraftQueryRequest || type == DraftRelationCatalogRequest
                ? service.query(project, model, operation, request) : service.execute(project, model, request);
        var response = result.deepCopy(); canonicalTokens(response); return response;
    }

    /** token 可逐字段直接送给严格 SaveRequest；几何 binary64 和原始输入不改写。 */
    private static void canonicalTokens(JsonNode value) {
        if (value.isObject()) value.fields().forEachRemaining(field -> {
            var child = field.getValue();
            if (java.util.Set.of("draft_token", "base_token", "result_token", "durable_token", "checkpoint_token", "pending_manual_target",
                    "captured_token", "head_token", "target_draft_token").contains(field.getKey()) && child.isObject())
                ((com.fasterxml.jackson.databind.node.ObjectNode) child).put("edit_seq", child.required("edit_seq").longValue());
            else canonicalTokens(child);
        });
        else if (value.isArray()) value.forEach(DraftWorkspaceController::canonicalTokens);
    }
}
