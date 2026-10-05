package org.opm.localruntime.api.generated;

// 由 scripts/generate-draft-save-contract.mjs 生成，请勿手改。
public final class DraftSaveContract {
    private DraftSaveContract() { }

    private static final com.fasterxml.jackson.databind.ObjectMapper MAPPER = com.fasterxml.jackson.databind.json.JsonMapper.builder()
        .enable(com.fasterxml.jackson.core.StreamReadFeature.STRICT_DUPLICATE_DETECTION)
        .enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
        .enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
        .disable(com.fasterxml.jackson.databind.DeserializationFeature.ACCEPT_FLOAT_AS_INT)
        .disable(com.fasterxml.jackson.databind.MapperFeature.ALLOW_COERCION_OF_SCALARS).build();

    public static <T> T read(String json, Class<T> type) throws com.fasterxml.jackson.core.JsonProcessingException {
        T result = MAPPER.readValue(json, type);
        if (result == null) throw com.fasterxml.jackson.databind.exc.MismatchedInputException.from((com.fasterxml.jackson.core.JsonParser) null, type, "输入必须是对象");
        return result;
    }

    public record DraftToken(String draft_id, Long edit_seq, String binding_digest) {
        public DraftToken {
            java.util.Objects.requireNonNull(draft_id, "draft_id 必填");
            if (draft_id != null && (draft_id.codePointCount(0, draft_id.length()) < 1 || draft_id.codePointCount(0, draft_id.length()) > 256 || !draft_id.matches("^[A-Za-z0-9][A-Za-z0-9._:-]*$"))) throw new IllegalArgumentException("draft_id 不符合保存契约");
            java.util.Objects.requireNonNull(edit_seq, "edit_seq 必填");
            if (edit_seq != null && (edit_seq < 0L || edit_seq > 9007199254740991L)) throw new IllegalArgumentException("edit_seq 不符合保存契约");
            java.util.Objects.requireNonNull(binding_digest, "binding_digest 必填");
            if (binding_digest != null && (!binding_digest.matches("^[0-9a-f]{64}$"))) throw new IllegalArgumentException("binding_digest 不符合保存契约");
        }
    }

    public record SaveRequest(String save_id, DraftToken target_draft_token, String reason) {
        public SaveRequest {
            java.util.Objects.requireNonNull(save_id, "save_id 必填");
            if (save_id != null && (save_id.codePointCount(0, save_id.length()) < 1 || save_id.codePointCount(0, save_id.length()) > 256 || !save_id.matches("^[A-Za-z0-9][A-Za-z0-9._:-]*$"))) throw new IllegalArgumentException("save_id 不符合保存契约");
            java.util.Objects.requireNonNull(target_draft_token, "target_draft_token 必填");
            java.util.Objects.requireNonNull(reason, "reason 必填");
            if (reason != null && (!java.util.Set.of("MANUAL").contains(reason))) throw new IllegalArgumentException("reason 不符合保存契约");
        }
    }

    public record PinRequest(String pin_id, DraftToken target_draft_token, String purpose) {
        public PinRequest {
            java.util.Objects.requireNonNull(pin_id, "pin_id 必填");
            if (pin_id != null && (pin_id.codePointCount(0, pin_id.length()) < 1 || pin_id.codePointCount(0, pin_id.length()) > 256 || !pin_id.matches("^[A-Za-z0-9][A-Za-z0-9._:-]*$"))) throw new IllegalArgumentException("pin_id 不符合保存契约");
            java.util.Objects.requireNonNull(target_draft_token, "target_draft_token 必填");
            java.util.Objects.requireNonNull(purpose, "purpose 必填");
            if (purpose != null && (!java.util.Set.of("PERMALINK", "SNAPSHOT", "BASELINE", "EXPORT").contains(purpose))) throw new IllegalArgumentException("purpose 不符合保存契约");
        }
    }

    public record SaveResult(String save_id, String status, DraftToken captured_token, String checkpoint_id, String revision_id, DraftToken head_token) {
        public SaveResult {
            java.util.Objects.requireNonNull(save_id, "save_id 必填");
            if (save_id != null && (save_id.codePointCount(0, save_id.length()) < 1 || save_id.codePointCount(0, save_id.length()) > 256 || !save_id.matches("^[A-Za-z0-9][A-Za-z0-9._:-]*$"))) throw new IllegalArgumentException("save_id 不符合保存契约");
            java.util.Objects.requireNonNull(status, "status 必填");
            if (status != null && (!java.util.Set.of("SAVED", "UNCHANGED").contains(status))) throw new IllegalArgumentException("status 不符合保存契约");
            java.util.Objects.requireNonNull(captured_token, "captured_token 必填");
            java.util.Objects.requireNonNull(checkpoint_id, "checkpoint_id 必填");
            if (checkpoint_id != null && (checkpoint_id.codePointCount(0, checkpoint_id.length()) < 1 || checkpoint_id.codePointCount(0, checkpoint_id.length()) > 256 || !checkpoint_id.matches("^[A-Za-z0-9][A-Za-z0-9._:-]*$"))) throw new IllegalArgumentException("checkpoint_id 不符合保存契约");
            java.util.Objects.requireNonNull(revision_id, "revision_id 必填");
            if (revision_id != null && (revision_id.codePointCount(0, revision_id.length()) < 1 || revision_id.codePointCount(0, revision_id.length()) > 256 || !revision_id.matches("^[A-Za-z0-9][A-Za-z0-9._:-]*$"))) throw new IllegalArgumentException("revision_id 不符合保存契约");
            java.util.Objects.requireNonNull(head_token, "head_token 必填");
        }
    }

    public record PinResult(String pin_id, String revision_id, DraftToken captured_token) {
        public PinResult {
            java.util.Objects.requireNonNull(pin_id, "pin_id 必填");
            if (pin_id != null && (pin_id.codePointCount(0, pin_id.length()) < 1 || pin_id.codePointCount(0, pin_id.length()) > 256 || !pin_id.matches("^[A-Za-z0-9][A-Za-z0-9._:-]*$"))) throw new IllegalArgumentException("pin_id 不符合保存契约");
            java.util.Objects.requireNonNull(revision_id, "revision_id 必填");
            if (revision_id != null && (revision_id.codePointCount(0, revision_id.length()) < 1 || revision_id.codePointCount(0, revision_id.length()) > 256 || !revision_id.matches("^[A-Za-z0-9][A-Za-z0-9._:-]*$"))) throw new IllegalArgumentException("revision_id 不符合保存契约");
            java.util.Objects.requireNonNull(captured_token, "captured_token 必填");
        }
    }

    public record SaveError(String code, String message, Boolean retryable) {
        public SaveError {
            java.util.Objects.requireNonNull(code, "code 必填");
            if (code != null && (!java.util.Set.of("INPUT_INVALID", "DRAFT_CONFLICT", "READ_ONLY_REVISION", "RULE_VERSION_CONFLICT", "IDEMPOTENCY_MISMATCH", "PERSISTENCE_FAILED", "DRAFT_RECOVERY_REQUIRED", "NOT_FOUND", "LOCAL_SESSION_INVALID", "DRAFT_MODE_REQUIRED", "SAVE_VALIDATION_BLOCKED").contains(code))) throw new IllegalArgumentException("code 不符合保存契约");
            java.util.Objects.requireNonNull(message, "message 必填");
            if (message != null && (message.codePointCount(0, message.length()) < 1)) throw new IllegalArgumentException("message 不符合保存契约");
            java.util.Objects.requireNonNull(retryable, "retryable 必填");
        }
    }

    public record DraftPreparationRequest(String project_id, String model_id, String expected_revision_id, String expected_document_sha256, String expected_binding_digest, String draft_id, String checkpoint_id, String requested_at) {
        public DraftPreparationRequest {
            java.util.Objects.requireNonNull(project_id, "project_id 必填");
            if (project_id != null && (project_id.codePointCount(0, project_id.length()) < 1 || project_id.codePointCount(0, project_id.length()) > 256 || !project_id.matches("^[A-Za-z0-9][A-Za-z0-9._:-]*$"))) throw new IllegalArgumentException("project_id 不符合保存契约");
            java.util.Objects.requireNonNull(model_id, "model_id 必填");
            if (model_id != null && (model_id.codePointCount(0, model_id.length()) < 1 || model_id.codePointCount(0, model_id.length()) > 256 || !model_id.matches("^[A-Za-z0-9][A-Za-z0-9._:-]*$"))) throw new IllegalArgumentException("model_id 不符合保存契约");
            java.util.Objects.requireNonNull(expected_revision_id, "expected_revision_id 必填");
            if (expected_revision_id != null && (expected_revision_id.codePointCount(0, expected_revision_id.length()) < 1 || expected_revision_id.codePointCount(0, expected_revision_id.length()) > 256 || !expected_revision_id.matches("^[A-Za-z0-9][A-Za-z0-9._:-]*$"))) throw new IllegalArgumentException("expected_revision_id 不符合保存契约");
            java.util.Objects.requireNonNull(expected_document_sha256, "expected_document_sha256 必填");
            if (expected_document_sha256 != null && (!expected_document_sha256.matches("^[0-9a-f]{64}$"))) throw new IllegalArgumentException("expected_document_sha256 不符合保存契约");
            java.util.Objects.requireNonNull(expected_binding_digest, "expected_binding_digest 必填");
            if (expected_binding_digest != null && (!expected_binding_digest.matches("^[0-9a-f]{64}$"))) throw new IllegalArgumentException("expected_binding_digest 不符合保存契约");
            java.util.Objects.requireNonNull(draft_id, "draft_id 必填");
            if (draft_id != null && (draft_id.codePointCount(0, draft_id.length()) < 1 || draft_id.codePointCount(0, draft_id.length()) > 256 || !draft_id.matches("^[A-Za-z0-9][A-Za-z0-9._:-]*$"))) throw new IllegalArgumentException("draft_id 不符合保存契约");
            java.util.Objects.requireNonNull(checkpoint_id, "checkpoint_id 必填");
            if (checkpoint_id != null && (checkpoint_id.codePointCount(0, checkpoint_id.length()) < 1 || checkpoint_id.codePointCount(0, checkpoint_id.length()) > 256 || !checkpoint_id.matches("^[A-Za-z0-9][A-Za-z0-9._:-]*$"))) throw new IllegalArgumentException("checkpoint_id 不符合保存契约");
            java.util.Objects.requireNonNull(requested_at, "requested_at 必填");
            if (requested_at != null && (!requested_at.matches("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$"))) throw new IllegalArgumentException("requested_at 不符合保存契约");
            if (requested_at != null) java.time.Instant.parse(requested_at);
        }
    }

    public record DraftPreparationReport(String schema_id, String schema_version, String status, DraftPreparationRequest request, DraftToken token, String content_digest, String artifact_digest, String backup_sha256, String prepared_sha256, Long backup_bytes, Long prepared_bytes) {
        public DraftPreparationReport {
            java.util.Objects.requireNonNull(schema_id, "schema_id 必填");
            if (schema_id != null && (!java.util.Set.of("OPM-DRAFT-PREPARATION").contains(schema_id))) throw new IllegalArgumentException("schema_id 不符合保存契约");
            java.util.Objects.requireNonNull(schema_version, "schema_version 必填");
            if (schema_version != null && (!java.util.Set.of("0.1").contains(schema_version))) throw new IllegalArgumentException("schema_version 不符合保存契约");
            java.util.Objects.requireNonNull(status, "status 必填");
            if (status != null && (!java.util.Set.of("PREPARED").contains(status))) throw new IllegalArgumentException("status 不符合保存契约");
            java.util.Objects.requireNonNull(request, "request 必填");
            java.util.Objects.requireNonNull(token, "token 必填");
            java.util.Objects.requireNonNull(content_digest, "content_digest 必填");
            if (content_digest != null && (!content_digest.matches("^[0-9a-f]{64}$"))) throw new IllegalArgumentException("content_digest 不符合保存契约");
            java.util.Objects.requireNonNull(artifact_digest, "artifact_digest 必填");
            if (artifact_digest != null && (!artifact_digest.matches("^[0-9a-f]{64}$"))) throw new IllegalArgumentException("artifact_digest 不符合保存契约");
            java.util.Objects.requireNonNull(backup_sha256, "backup_sha256 必填");
            if (backup_sha256 != null && (!backup_sha256.matches("^[0-9a-f]{64}$"))) throw new IllegalArgumentException("backup_sha256 不符合保存契约");
            java.util.Objects.requireNonNull(prepared_sha256, "prepared_sha256 必填");
            if (prepared_sha256 != null && (!prepared_sha256.matches("^[0-9a-f]{64}$"))) throw new IllegalArgumentException("prepared_sha256 不符合保存契约");
            java.util.Objects.requireNonNull(backup_bytes, "backup_bytes 必填");
            if (backup_bytes != null && (backup_bytes < 1L || backup_bytes > 9007199254740991L)) throw new IllegalArgumentException("backup_bytes 不符合保存契约");
            java.util.Objects.requireNonNull(prepared_bytes, "prepared_bytes 必填");
            if (prepared_bytes != null && (prepared_bytes < 1L || prepared_bytes > 9007199254740991L)) throw new IllegalArgumentException("prepared_bytes 不符合保存契约");
        }
    }

    public record DraftActivationRequest(String preparation_report_sha256, String activated_at) {
        public DraftActivationRequest {
            java.util.Objects.requireNonNull(preparation_report_sha256, "preparation_report_sha256 必填");
            if (preparation_report_sha256 != null && (!preparation_report_sha256.matches("^[0-9a-f]{64}$"))) throw new IllegalArgumentException("preparation_report_sha256 不符合保存契约");
            java.util.Objects.requireNonNull(activated_at, "activated_at 必填");
            if (activated_at != null && (!activated_at.matches("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$"))) throw new IllegalArgumentException("activated_at 不符合保存契约");
            if (activated_at != null) java.time.Instant.parse(activated_at);
        }
    }

    public record DraftActivationReport(String schema_id, String schema_version, String status, DraftActivationRequest request, DraftPreparationReport preparation, String database_sha256, Long database_bytes, Long context_count, String readback_digest) {
        public DraftActivationReport {
            java.util.Objects.requireNonNull(schema_id, "schema_id 必填");
            if (schema_id != null && (!java.util.Set.of("OPM-DRAFT-ACTIVATION").contains(schema_id))) throw new IllegalArgumentException("schema_id 不符合保存契约");
            java.util.Objects.requireNonNull(schema_version, "schema_version 必填");
            if (schema_version != null && (!java.util.Set.of("0.1").contains(schema_version))) throw new IllegalArgumentException("schema_version 不符合保存契约");
            java.util.Objects.requireNonNull(status, "status 必填");
            if (status != null && (!java.util.Set.of("ACTIVATED_COPY").contains(status))) throw new IllegalArgumentException("status 不符合保存契约");
            java.util.Objects.requireNonNull(request, "request 必填");
            java.util.Objects.requireNonNull(preparation, "preparation 必填");
            java.util.Objects.requireNonNull(database_sha256, "database_sha256 必填");
            if (database_sha256 != null && (!database_sha256.matches("^[0-9a-f]{64}$"))) throw new IllegalArgumentException("database_sha256 不符合保存契约");
            java.util.Objects.requireNonNull(database_bytes, "database_bytes 必填");
            if (database_bytes != null && (database_bytes < 1L || database_bytes > 9007199254740991L)) throw new IllegalArgumentException("database_bytes 不符合保存契约");
            java.util.Objects.requireNonNull(context_count, "context_count 必填");
            if (context_count != null && (context_count < 1L || context_count > 9007199254740991L)) throw new IllegalArgumentException("context_count 不符合保存契约");
            java.util.Objects.requireNonNull(readback_digest, "readback_digest 必填");
            if (readback_digest != null && (!readback_digest.matches("^[0-9a-f]{64}$"))) throw new IllegalArgumentException("readback_digest 不符合保存契约");
        }
    }

    public record SaveState(DraftToken durable_token, DraftToken checkpoint_token, String last_manual_revision, String dirty_since, String deadline, String in_flight, DraftToken pending_manual_target, SaveError last_error) {
        public SaveState {
            java.util.Objects.requireNonNull(durable_token, "durable_token 必填");
            if (last_manual_revision != null && (last_manual_revision.codePointCount(0, last_manual_revision.length()) < 1 || last_manual_revision.codePointCount(0, last_manual_revision.length()) > 256 || !last_manual_revision.matches("^[A-Za-z0-9][A-Za-z0-9._:-]*$"))) throw new IllegalArgumentException("last_manual_revision 不符合保存契约");
            if (dirty_since != null && (!dirty_since.matches("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$"))) throw new IllegalArgumentException("dirty_since 不符合保存契约");
            if (dirty_since != null) java.time.Instant.parse(dirty_since);
            if (deadline != null && (!deadline.matches("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$"))) throw new IllegalArgumentException("deadline 不符合保存契约");
            if (deadline != null) java.time.Instant.parse(deadline);
            java.util.Objects.requireNonNull(in_flight, "in_flight 必填");
            if (in_flight != null && (!java.util.Set.of("NONE", "AUTO", "MANUAL", "PIN").contains(in_flight))) throw new IllegalArgumentException("in_flight 不符合保存契约");
        }
    }
}
