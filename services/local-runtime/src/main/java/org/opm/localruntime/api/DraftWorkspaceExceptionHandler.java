package org.opm.localruntime.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.opm.localruntime.api.generated.DraftWorkspaceContract;
import org.opm.localruntime.application.DraftWorkspaceService;
import org.opm.localruntime.assets.ProfilePackageAssemblyException;
import org.opm.localruntime.storage.DraftJournalRepository;
import org.opm.localruntime.text.OplGenerationException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = DraftWorkspaceController.class)
public final class DraftWorkspaceExceptionHandler {
    @ExceptionHandler(Exception.class)
    public ResponseEntity<JsonNode> handle(Exception exception) {
        String code = "PERSISTENCE_FAILED", reason = null;
        if (exception instanceof DraftWorkspaceService.Failure failure) { code = failure.code(); reason = failure.reason(); }
        else if (exception instanceof DraftJournalRepository.Failure failure) code = failure.code();
        else if (exception instanceof ApiException api) {
            code = api.code() == ApiErrorCode.INVALID_ARGUMENT ? "INPUT_INVALID" : "DRAFT_EDIT_REJECTED";
        } else if (exception instanceof ProfilePackageAssemblyException) {
            code = "DRAFT_EDIT_REJECTED";
        } else if (exception instanceof OplGenerationException) code = "DRAFT_EDIT_REJECTED";
        else if (exception instanceof IllegalArgumentException || exception instanceof HttpMessageNotReadableException) code = "INPUT_INVALID";
        int status = switch (code) {
            case "INPUT_INVALID" -> 400;
            case "LOCAL_SESSION_INVALID", "READ_ONLY_REVISION" -> 403;
            case "NOT_FOUND" -> 404;
            case "DRAFT_CONFLICT", "RULE_VERSION_CONFLICT", "IDEMPOTENCY_MISMATCH", "DRAFT_MODE_REQUIRED" -> 409;
            case "DRAFT_EDIT_REJECTED" -> 422;
            default -> 503;
        };
        var body = new ObjectMapper().createObjectNode().put("code", code).put("message", switch (code) {
            case "LOCAL_SESSION_INVALID" -> "本地会话、Host 或 Origin 无效";
            case "INPUT_INVALID" -> "草稿请求格式无效";
            case "DRAFT_CONFLICT" -> "草稿已变化，请重新读取";
            case "DRAFT_MODE_REQUIRED" -> "模型尚未启用草稿保存模式";
            case "DRAFT_EDIT_REJECTED" -> "草稿操作未通过领域或资产校验";
            default -> "草稿操作未完成：" + code;
        }).put("retryable", code.equals("PERSISTENCE_FAILED")).put("reason_code", reason);
        return ResponseEntity.status(status).body(DraftWorkspaceContract.read(body.toString(), DraftWorkspaceContract.Type.DraftError).value());
    }
}
