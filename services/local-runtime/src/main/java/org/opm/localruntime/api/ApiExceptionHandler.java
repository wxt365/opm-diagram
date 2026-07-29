package org.opm.localruntime.api;

import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
class ApiExceptionHandler {

    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, Object>> handle(ApiException exception) {
        return ResponseEntity.status(exception.status()).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(Map.of("error", Map.of(
                "code", exception.code().name(),
                "category", category(exception.code()),
                "message", exception.getMessage(),
                "retryable", exception.retryable(),
                "diagnostic_id", "diagnostic.api")));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<Map<String, Object>> invalidArgument(IllegalArgumentException exception) {
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_PROBLEM_JSON).body(Map.of("error", Map.of(
                "code", ApiErrorCode.INVALID_ARGUMENT.name(),
                "category", "INPUT",
                "message", "Request is invalid",
                "retryable", false,
                "diagnostic_id", "diagnostic.input")));
    }

    private String category(ApiErrorCode code) {
        return switch (code) {
            case LOCAL_SESSION_INVALID -> "SECURITY";
            case REVISION_CONFLICT, READ_ONLY_REVISION, IDEMPOTENCY_MISMATCH, RULE_VERSION_CONFLICT -> "REVISION";
            case VALIDATION_BLOCKED -> "VALIDATION";
            case TEXT_GENERATION_BLOCKED -> "TEXT";
            case PERSISTENCE_FAILED -> "PERSISTENCE";
            case TASK_FAILED -> "TASK";
            case PROFILE_FORBIDDEN -> "PROFILE";
            case DOMAIN_REJECTED -> "DOMAIN";
            default -> "INPUT";
        };
    }
}
