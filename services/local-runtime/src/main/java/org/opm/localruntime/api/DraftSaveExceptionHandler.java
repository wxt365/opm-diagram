package org.opm.localruntime.api;

import org.opm.localruntime.api.generated.DraftSaveContract.SaveError;
import org.opm.localruntime.application.DraftWorkspaceService;
import org.opm.localruntime.storage.DraftJournalRepository;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = DraftSaveController.class)
public final class DraftSaveExceptionHandler {
    @ExceptionHandler(Exception.class)
    public ResponseEntity<SaveError> handle(Exception exception) {
        String code = "PERSISTENCE_FAILED";
        if (exception instanceof DraftWorkspaceService.Failure failure) code = failure.code();
        else if (exception instanceof DraftJournalRepository.Failure failure) code = failure.code();
        else if (exception instanceof IllegalArgumentException || exception instanceof com.fasterxml.jackson.core.JsonProcessingException
                || exception instanceof HttpMessageNotReadableException) code = "INPUT_INVALID";
        int status = switch (code) {
            case "INPUT_INVALID" -> 400;
            case "LOCAL_SESSION_INVALID", "READ_ONLY_REVISION" -> 403;
            case "NOT_FOUND" -> 404;
            case "DRAFT_CONFLICT", "RULE_VERSION_CONFLICT", "IDEMPOTENCY_MISMATCH", "DRAFT_MODE_REQUIRED" -> 409;
            case "SAVE_VALIDATION_BLOCKED" -> 422;
            default -> 503;
        };
        return ResponseEntity.status(status).body(new SaveError(code, "保存未完成：" + code, code.equals("PERSISTENCE_FAILED")));
    }
}
