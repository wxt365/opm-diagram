// 由 scripts/generate-draft-save-contract.mjs 生成，请勿手改。

export interface DraftToken {
  draft_id: string;
  edit_seq: number;
  binding_digest: string;
}

export interface SaveRequest {
  save_id: string;
  target_draft_token: DraftToken;
  reason: "MANUAL";
}

export interface PinRequest {
  pin_id: string;
  target_draft_token: DraftToken;
  purpose: "PERMALINK" | "SNAPSHOT" | "BASELINE" | "EXPORT";
}

export interface SaveResult {
  save_id: string;
  status: "SAVED" | "UNCHANGED";
  captured_token: DraftToken;
  checkpoint_id: string;
  revision_id: string;
  head_token: DraftToken;
}

export interface PinResult {
  pin_id: string;
  revision_id: string;
  captured_token: DraftToken;
}

export interface SaveError {
  code: "INPUT_INVALID" | "DRAFT_CONFLICT" | "READ_ONLY_REVISION" | "RULE_VERSION_CONFLICT" | "IDEMPOTENCY_MISMATCH" | "PERSISTENCE_FAILED" | "DRAFT_RECOVERY_REQUIRED" | "NOT_FOUND" | "LOCAL_SESSION_INVALID" | "DRAFT_MODE_REQUIRED" | "SAVE_VALIDATION_BLOCKED";
  message: string;
  retryable: boolean;
}

export interface DraftPreparationRequest {
  project_id: string;
  model_id: string;
  expected_revision_id: string;
  expected_document_sha256: string;
  expected_binding_digest: string;
  draft_id: string;
  checkpoint_id: string;
  requested_at: string;
}

export interface DraftPreparationReport {
  schema_id: "OPM-DRAFT-PREPARATION";
  schema_version: "0.1";
  status: "PREPARED";
  request: DraftPreparationRequest;
  token: DraftToken;
  content_digest: string;
  artifact_digest: string;
  backup_sha256: string;
  prepared_sha256: string;
  backup_bytes: number;
  prepared_bytes: number;
}

export interface DraftActivationRequest {
  preparation_report_sha256: string;
  activated_at: string;
}

export interface DraftActivationReport {
  schema_id: "OPM-DRAFT-ACTIVATION";
  schema_version: "0.1";
  status: "ACTIVATED_COPY";
  request: DraftActivationRequest;
  preparation: DraftPreparationReport;
  database_sha256: string;
  database_bytes: number;
  context_count: number;
  readback_digest: string;
}

export interface SaveState {
  durable_token: DraftToken;
  checkpoint_token: DraftToken | null;
  last_manual_revision: string | null;
  dirty_since: string | null;
  deadline: string | null;
  in_flight: "NONE" | "AUTO" | "MANUAL" | "PIN";
  pending_manual_target: DraftToken | null;
  last_error: SaveError | null;
}
