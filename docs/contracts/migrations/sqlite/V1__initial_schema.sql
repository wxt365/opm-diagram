PRAGMA foreign_keys = ON;

CREATE TABLE schema_metadata (
    metadata_key TEXT PRIMARY KEY,
    metadata_value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE project_metadata (
    project_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    default_profile_id TEXT NOT NULL,
    default_profile_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE model_catalog (
    model_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    profile_binding_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES project_metadata(project_id),
    UNIQUE (project_id, normalized_name)
);

CREATE TABLE profile_package (
    profile_id TEXT NOT NULL,
    package_version TEXT NOT NULL,
    package_digest TEXT NOT NULL,
    lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('DRAFT', 'ACTIVE', 'DEPRECATED', 'RETIRED')),
    package_json TEXT NOT NULL,
    installed_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, package_version),
    UNIQUE (package_digest)
);

CREATE TABLE rule_set_package (
    rule_set_id TEXT NOT NULL,
    rule_set_version TEXT NOT NULL,
    rule_set_digest TEXT NOT NULL,
    lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('DRAFT', 'ACTIVE', 'DEPRECATED', 'RETIRED')),
    package_json TEXT NOT NULL,
    installed_at TEXT NOT NULL,
    PRIMARY KEY (rule_set_id, rule_set_version),
    UNIQUE (rule_set_digest)
);

CREATE TABLE grammar_package (
    grammar_id TEXT NOT NULL,
    grammar_version TEXT NOT NULL,
    grammar_digest TEXT NOT NULL,
    text_modality TEXT NOT NULL CHECK (text_modality IN ('OPL', 'OPT')),
    manifest_json TEXT NOT NULL,
    installed_at TEXT NOT NULL,
    PRIMARY KEY (grammar_id, grammar_version),
    UNIQUE (grammar_digest)
);

CREATE TABLE revision_document (
    revision_id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,
    revision_sequence INTEGER NOT NULL CHECK (revision_sequence > 0),
    schema_version TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    profile_version TEXT NOT NULL,
    rule_set_id TEXT NOT NULL,
    rule_set_version TEXT NOT NULL,
    schema_set_json TEXT NOT NULL,
    profile_binding_json TEXT NOT NULL,
    document_json TEXT NOT NULL,
    document_digest TEXT NOT NULL,
    commit_reason TEXT NOT NULL,
    immutable INTEGER NOT NULL DEFAULT 1 CHECK (immutable = 1),
    created_at TEXT NOT NULL,
    FOREIGN KEY (model_id) REFERENCES model_catalog(model_id),
    FOREIGN KEY (profile_id, profile_version) REFERENCES profile_package(profile_id, package_version),
    FOREIGN KEY (rule_set_id, rule_set_version) REFERENCES rule_set_package(rule_set_id, rule_set_version),
    UNIQUE (model_id, revision_sequence),
    UNIQUE (model_id, document_digest)
);

CREATE TABLE revision_parent (
    model_id TEXT NOT NULL,
    revision_id TEXT NOT NULL,
    parent_revision_id TEXT,
    PRIMARY KEY (model_id, revision_id),
    FOREIGN KEY (model_id) REFERENCES model_catalog(model_id),
    FOREIGN KEY (revision_id) REFERENCES revision_document(revision_id),
    FOREIGN KEY (parent_revision_id) REFERENCES revision_document(revision_id),
    CHECK (parent_revision_id IS NULL OR parent_revision_id <> revision_id)
);

CREATE TABLE model_head (
    model_id TEXT PRIMARY KEY,
    draft_head_revision_id TEXT NOT NULL,
    head_sequence INTEGER NOT NULL CHECK (head_sequence > 0),
    updated_at TEXT NOT NULL,
    FOREIGN KEY (model_id) REFERENCES model_catalog(model_id),
    FOREIGN KEY (draft_head_revision_id) REFERENCES revision_document(revision_id)
);

CREATE TABLE named_snapshot (
    snapshot_id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,
    revision_id TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (model_id) REFERENCES model_catalog(model_id),
    FOREIGN KEY (revision_id) REFERENCES revision_document(revision_id),
    UNIQUE (model_id, normalized_name)
);

CREATE TABLE baseline (
    baseline_id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,
    revision_id TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    description TEXT,
    validation_report_digest TEXT NOT NULL,
    evidence_summary_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (model_id) REFERENCES model_catalog(model_id),
    FOREIGN KEY (revision_id) REFERENCES revision_document(revision_id),
    UNIQUE (model_id, normalized_name)
);

CREATE TABLE operation_record (
    operation_record_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    model_id TEXT,
    operation_id TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    command_id TEXT,
    input_revision_id TEXT,
    result_revision_id TEXT,
    result_status TEXT NOT NULL CHECK (result_status IN ('COMMITTED', 'BLOCKED', 'FAILED', 'ACCEPTED', 'COMPLETED', 'CANCELLED')),
    diagnostic_id TEXT,
    occurred_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES project_metadata(project_id),
    FOREIGN KEY (model_id) REFERENCES model_catalog(model_id),
    FOREIGN KEY (input_revision_id) REFERENCES revision_document(revision_id),
    FOREIGN KEY (result_revision_id) REFERENCES revision_document(revision_id)
);

CREATE TABLE idempotency_record (
    operation_id TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    command_id TEXT NOT NULL,
    request_digest TEXT NOT NULL,
    result_status TEXT NOT NULL,
    result_revision_id TEXT,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    PRIMARY KEY (operation_id, aggregate_id, command_id),
    FOREIGN KEY (result_revision_id) REFERENCES revision_document(revision_id)
);

CREATE TABLE background_task (
    task_id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('QUEUED', 'RUNNING', 'CANCELLING', 'CANCELLED', 'COMPLETED', 'FAILED')),
    stage TEXT NOT NULL,
    progress INTEGER CHECK (progress IS NULL OR (progress >= 0 AND progress <= 100)),
    input_revision_id TEXT,
    profile_id TEXT,
    profile_version TEXT,
    rule_set_id TEXT,
    rule_set_version TEXT,
    cancellable INTEGER NOT NULL CHECK (cancellable IN (0, 1)),
    request_json TEXT NOT NULL,
    result_json TEXT,
    error_json TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (input_revision_id) REFERENCES revision_document(revision_id)
);

CREATE TABLE asset_manifest (
    asset_id TEXT PRIMARY KEY,
    content_digest TEXT NOT NULL UNIQUE,
    media_type TEXT NOT NULL,
    byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
    logical_name TEXT NOT NULL,
    asset_role TEXT NOT NULL,
    required INTEGER NOT NULL CHECK (required IN (0, 1)),
    reference_count INTEGER NOT NULL DEFAULT 0 CHECK (reference_count >= 0),
    created_at TEXT NOT NULL
);

CREATE TABLE element_index (
    source_revision_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    element_id TEXT NOT NULL,
    core_kind TEXT NOT NULL,
    capability_id TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    PRIMARY KEY (source_revision_id, element_id),
    FOREIGN KEY (source_revision_id) REFERENCES revision_document(revision_id),
    FOREIGN KEY (model_id) REFERENCES model_catalog(model_id)
);

CREATE TABLE fact_endpoint_index (
    source_revision_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    fact_id TEXT NOT NULL,
    endpoint_id TEXT NOT NULL,
    endpoint_role TEXT NOT NULL,
    target_entity_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    PRIMARY KEY (source_revision_id, fact_id, endpoint_id),
    FOREIGN KEY (source_revision_id) REFERENCES revision_document(revision_id),
    FOREIGN KEY (model_id) REFERENCES model_catalog(model_id)
);

CREATE TABLE occurrence_index (
    source_revision_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    context_id TEXT NOT NULL,
    occurrence_id TEXT NOT NULL,
    target_entity_id TEXT NOT NULL,
    ownership TEXT NOT NULL CHECK (ownership IN ('OWNED', 'REFERENCED', 'VIEW_DERIVED')),
    PRIMARY KEY (source_revision_id, occurrence_id),
    FOREIGN KEY (source_revision_id) REFERENCES revision_document(revision_id),
    FOREIGN KEY (model_id) REFERENCES model_catalog(model_id)
);

CREATE TABLE finding_index (
    source_revision_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    finding_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('BLOCKING', 'WARNING', 'SUGGESTION')),
    category TEXT NOT NULL,
    context_id TEXT,
    entity_id TEXT,
    PRIMARY KEY (source_revision_id, finding_id),
    FOREIGN KEY (source_revision_id) REFERENCES revision_document(revision_id),
    FOREIGN KEY (model_id) REFERENCES model_catalog(model_id)
);

CREATE TABLE text_trace_index (
    source_revision_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    fact_id TEXT NOT NULL,
    sentence_id TEXT NOT NULL,
    context_id TEXT NOT NULL,
    PRIMARY KEY (source_revision_id, trace_id, fact_id, sentence_id),
    FOREIGN KEY (source_revision_id) REFERENCES revision_document(revision_id),
    FOREIGN KEY (model_id) REFERENCES model_catalog(model_id)
);

CREATE INDEX idx_project_status_name ON project_metadata(status, normalized_name);
CREATE INDEX idx_model_project_status_name ON model_catalog(project_id, status, normalized_name);
CREATE INDEX idx_revision_model_sequence ON revision_document(model_id, revision_sequence DESC);
CREATE INDEX idx_revision_parent_parent ON revision_parent(model_id, parent_revision_id);
CREATE INDEX idx_operation_project_time ON operation_record(project_id, occurred_at DESC);
CREATE INDEX idx_task_state_updated ON background_task(state, updated_at);
CREATE INDEX idx_element_search ON element_index(model_id, source_revision_id, normalized_name);
CREATE INDEX idx_fact_target ON fact_endpoint_index(model_id, source_revision_id, target_entity_id);
CREATE INDEX idx_occurrence_context_target ON occurrence_index(model_id, source_revision_id, context_id, target_entity_id);
CREATE INDEX idx_finding_filter ON finding_index(model_id, source_revision_id, severity, category);
CREATE INDEX idx_text_trace_fact ON text_trace_index(model_id, source_revision_id, fact_id, sentence_id);

CREATE TRIGGER trg_revision_document_no_update
BEFORE UPDATE ON revision_document
BEGIN
    SELECT RAISE(ABORT, 'revision_document is immutable');
END;

CREATE TRIGGER trg_revision_document_no_delete
BEFORE DELETE ON revision_document
BEGIN
    SELECT RAISE(ABORT, 'revision_document is immutable');
END;

INSERT INTO schema_metadata(metadata_key, metadata_value, updated_at)
VALUES ('storage_schema_version', '1.0', '1970-01-01T00:00:00Z');
