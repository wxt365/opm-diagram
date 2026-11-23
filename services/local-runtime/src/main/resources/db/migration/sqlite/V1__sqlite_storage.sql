-- SQLite 独立基线：项目文件物理隔离，保留延迟外键和不可变记录约束。

CREATE TABLE schema_metadata (
    metadata_key TEXT PRIMARY KEY,
    metadata_value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO schema_metadata VALUES('storage_schema_version','2.0','2026-10-15T00:00:00Z');

CREATE TABLE asset_manifest (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    asset_id TEXT NOT NULL,
    content_digest TEXT NOT NULL,
    media_type TEXT NOT NULL,
    byte_length BIGINT NOT NULL CHECK (byte_length >= 0),
    logical_name TEXT NOT NULL,
    asset_role TEXT NOT NULL,
    required BIGINT NOT NULL CHECK (required IN (0, 1)),
    reference_count BIGINT NOT NULL DEFAULT 0 CHECK (reference_count >= 0),
    created_at TEXT NOT NULL,
    PRIMARY KEY (project_id, asset_id),
    UNIQUE (project_id, content_digest),
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE background_task (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    task_id TEXT NOT NULL,
    task_type TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('QUEUED', 'RUNNING', 'CANCELLING', 'CANCELLED', 'COMPLETED', 'FAILED')),
    stage TEXT NOT NULL,
    progress BIGINT CHECK (progress IS NULL OR (progress >= 0 AND progress <= 100)),
    input_revision_id TEXT,
    profile_id TEXT,
    profile_version TEXT,
    rule_set_id TEXT,
    rule_set_version TEXT,
    cancellable BIGINT NOT NULL CHECK (cancellable IN (0, 1)),
    request_json TEXT NOT NULL,
    result_json TEXT,
    error_json TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, task_id),
    FOREIGN KEY (project_id, input_revision_id) REFERENCES revision_document (project_id, revision_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE baseline (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    baseline_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    revision_id TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    description TEXT,
    validation_report_digest TEXT NOT NULL,
    evidence_summary_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (project_id, baseline_id),
    UNIQUE (project_id, model_id, normalized_name),
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, revision_id) REFERENCES revision_document (project_id, revision_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE draft_checkpoint (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    model_id TEXT NOT NULL,
    draft_id TEXT NOT NULL,
    checkpoint_id TEXT NOT NULL,
    covered_seq BIGINT NOT NULL CHECK (covered_seq BETWEEN 0 AND 9007199254740991),
    content_digest TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (project_id, checkpoint_id),
    PRIMARY KEY (project_id, model_id, draft_id, checkpoint_id),
    FOREIGN KEY (project_id, model_id, draft_id) REFERENCES draft_stream (project_id, model_id, draft_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, model_id, content_digest) REFERENCES draft_content (project_id, model_id, content_digest) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE draft_checkpoint_overlay (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    checkpoint_id TEXT NOT NULL,
    content_delta_json TEXT NOT NULL CHECK (json_type(content_delta_json) = 'object'),
    artifact_delta_json TEXT NOT NULL CHECK (json_type(artifact_delta_json) = 'object'),
    document_digest TEXT NOT NULL CHECK (length(document_digest) = 64 AND document_digest NOT GLOB '*[^0-9a-f]*'),
    PRIMARY KEY (project_id, checkpoint_id),
    FOREIGN KEY (project_id, checkpoint_id) REFERENCES draft_checkpoint (project_id, checkpoint_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE draft_content (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    model_id TEXT NOT NULL,
    content_digest TEXT NOT NULL CHECK (length(content_digest) = 64 AND content_digest NOT GLOB '*[^0-9a-f]*'),
    digest_version TEXT NOT NULL CHECK (digest_version IN ('SaveContentDigest/1', 'SaveContentDigest/2', 'SaveContentDigest/3', 'SaveContentDigest/4', 'SaveContentDigest/5')),
    model_json TEXT NOT NULL CHECK (json_type(model_json) = 'object'),
    artifact_json TEXT NOT NULL CHECK (json_type(artifact_json) = 'object'),
    artifact_digest TEXT NOT NULL CHECK (length(artifact_digest) = 64 AND artifact_digest NOT GLOB '*[^0-9a-f]*'),
    PRIMARY KEY (project_id, model_id, content_digest),
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE draft_journal (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    model_id TEXT NOT NULL,
    draft_id TEXT NOT NULL,
    edit_seq BIGINT NOT NULL CHECK (edit_seq BETWEEN 1 AND 9007199254740991),
    command_id TEXT NOT NULL,
    request_digest TEXT NOT NULL CHECK (length(request_digest) = 64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
    delta_json TEXT NOT NULL CHECK (json_type(delta_json) = 'object'),
    artifact_delta_json TEXT NOT NULL CHECK (json_type(artifact_delta_json) = 'object'),
    result_digest TEXT NOT NULL CHECK (length(result_digest) = 64 AND result_digest NOT GLOB '*[^0-9a-f]*'),
    occurred_at TEXT NOT NULL,
    PRIMARY KEY (project_id, model_id, draft_id, edit_seq),
    UNIQUE (project_id, model_id, command_id),
    FOREIGN KEY (project_id, model_id, draft_id) REFERENCES draft_stream (project_id, model_id, draft_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE draft_receipt (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    model_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('EDIT', 'SAVE', 'PIN')),
    idempotency_id TEXT NOT NULL,
    request_digest TEXT NOT NULL CHECK (length(request_digest) = 64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
    result_json TEXT NOT NULL CHECK (json_type(result_json) = 'object'),
    created_at TEXT NOT NULL,
    receipt_order BIGINT NOT NULL,
    PRIMARY KEY (project_id, model_id, operation, idempotency_id),
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE draft_retention (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    model_id TEXT NOT NULL,
    draft_id TEXT NOT NULL,
    retention_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('READ', 'UNDO', 'PERMALINK', 'SNAPSHOT', 'BASELINE', 'EXPORT', 'BACKUP')),
    checkpoint_id TEXT,
    revision_id TEXT,
    min_edit_seq BIGINT CONSTRAINT draft_retention_nullable_seq_v5 CHECK (
        min_edit_seq IS NULL OR (min_edit_seq BETWEEN 0 AND 9007199254740991)
    ),
    PRIMARY KEY (project_id, model_id, retention_id),
    CHECK (checkpoint_id IS NOT NULL OR revision_id IS NOT NULL OR min_edit_seq IS NOT NULL),
    FOREIGN KEY (project_id, model_id, draft_id) REFERENCES draft_stream (project_id, model_id, draft_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, model_id, draft_id, checkpoint_id) REFERENCES draft_checkpoint (project_id, model_id, draft_id, checkpoint_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, model_id, revision_id) REFERENCES draft_savepoint (project_id, model_id, revision_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE draft_savepoint (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    revision_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    draft_id TEXT NOT NULL,
    captured_seq BIGINT NOT NULL CHECK (captured_seq BETWEEN 0 AND 9007199254740991),
    history_sequence BIGINT NOT NULL CHECK (history_sequence BETWEEN 1 AND 9007199254740991),
    purpose TEXT NOT NULL CHECK (purpose IN ('MANUAL', 'PERMALINK', 'SNAPSHOT', 'BASELINE', 'EXPORT')),
    content_digest TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (project_id, revision_id),
    UNIQUE (project_id, model_id, revision_id),
    UNIQUE (project_id, model_id, history_sequence),
    FOREIGN KEY (project_id, model_id, draft_id) REFERENCES draft_stream (project_id, model_id, draft_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, model_id, content_digest) REFERENCES draft_content (project_id, model_id, content_digest) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE draft_stream (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    model_id TEXT NOT NULL,
    draft_id TEXT NOT NULL,
    edit_seq BIGINT NOT NULL CHECK (edit_seq BETWEEN 0 AND 9007199254740991),
    binding_digest TEXT NOT NULL CHECK (length(binding_digest) = 64 AND binding_digest NOT GLOB '*[^0-9a-f]*'),
    base_revision_id TEXT NOT NULL,
    checkpoint_id TEXT NOT NULL,
    dirty_since TEXT,
    deadline TEXT,
    UNIQUE (project_id, draft_id),
    PRIMARY KEY (project_id, model_id, draft_id),
    CHECK ((dirty_since IS NULL) = (deadline IS NULL)),
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, base_revision_id) REFERENCES revision_document (project_id, revision_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, model_id, draft_id, checkpoint_id) REFERENCES draft_checkpoint (project_id, model_id, draft_id, checkpoint_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE element_index (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    source_revision_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    element_id TEXT NOT NULL,
    core_kind TEXT NOT NULL,
    capability_id TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    PRIMARY KEY (project_id, source_revision_id, element_id),
    FOREIGN KEY (project_id, source_revision_id) REFERENCES revision_document (project_id, revision_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE exchange_identity_map (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    package_digest TEXT NOT NULL,
    source_namespace TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('NEW_PROJECT', 'PRESERVED')),
    PRIMARY KEY (project_id, package_digest, source_namespace, source_id),
    FOREIGN KEY (project_id, package_digest) REFERENCES exchange_import_origin (project_id, package_digest) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE exchange_import_origin (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    package_digest TEXT NOT NULL,
    package_id TEXT NOT NULL,
    package_kind TEXT NOT NULL CHECK (package_kind IN ('PROJECT_FULL', 'BASELINE_ASSET')),
    source_namespace TEXT NOT NULL,
    source_project_id TEXT,
    source_model_id TEXT,
    source_revision_id TEXT,
    source_baseline_id TEXT,
    target_project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    importer_version TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    PRIMARY KEY (project_id, package_digest),
    UNIQUE (project_id, target_project_id),
    CHECK (target_project_id=project_id),
    FOREIGN KEY (target_project_id) REFERENCES project_metadata (project_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE fact_endpoint_index (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    source_revision_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    fact_id TEXT NOT NULL,
    endpoint_id TEXT NOT NULL,
    endpoint_role TEXT NOT NULL,
    target_entity_id TEXT NOT NULL,
    ordinal BIGINT NOT NULL CHECK (ordinal >= 0),
    PRIMARY KEY (project_id, source_revision_id, fact_id, endpoint_id),
    FOREIGN KEY (project_id, source_revision_id) REFERENCES revision_document (project_id, revision_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE finding_index (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    source_revision_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    finding_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('BLOCKING', 'WARNING', 'SUGGESTION')),
    category TEXT NOT NULL,
    context_id TEXT,
    entity_id TEXT,
    PRIMARY KEY (project_id, source_revision_id, finding_id),
    FOREIGN KEY (project_id, source_revision_id) REFERENCES revision_document (project_id, revision_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE grammar_package (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    grammar_id TEXT NOT NULL,
    grammar_version TEXT NOT NULL,
    grammar_digest TEXT NOT NULL,
    text_modality TEXT NOT NULL CHECK (text_modality IN ('OPL', 'OPT')),
    manifest_json TEXT NOT NULL,
    installed_at TEXT NOT NULL,
    PRIMARY KEY (project_id, grammar_id, grammar_version),
    UNIQUE (project_id, grammar_digest),
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE idempotency_record (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    operation_id TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    command_id TEXT NOT NULL,
    request_digest TEXT NOT NULL,
    result_status TEXT NOT NULL,
    result_revision_id TEXT,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    PRIMARY KEY (project_id, operation_id, aggregate_id, command_id),
    FOREIGN KEY (project_id, result_revision_id) REFERENCES revision_document (project_id, revision_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE mindmap_conversion (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    model_id TEXT NOT NULL,
    command_id TEXT NOT NULL,
    context_id TEXT NOT NULL,
    mindmap_id TEXT NOT NULL,
    source_revision BIGINT NOT NULL,
    source_json TEXT NOT NULL,
    mappings_json TEXT NOT NULL,
    conversion_order BIGINT NOT NULL,
    PRIMARY KEY (project_id, model_id, command_id),
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE mindmap_document (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    model_id TEXT NOT NULL,
    mindmap_id TEXT NOT NULL,
    revision BIGINT NOT NULL CHECK (revision >= 0),
    document_json TEXT NOT NULL,
    digest TEXT NOT NULL,
    PRIMARY KEY (project_id, model_id),
    UNIQUE (project_id, mindmap_id),
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE model_catalog (
    model_id TEXT NOT NULL,
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    profile_binding_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, model_id),
    UNIQUE (project_id, normalized_name),
    FOREIGN KEY (project_id) REFERENCES project_metadata (project_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE model_head (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    model_id TEXT NOT NULL,
    draft_head_revision_id TEXT NOT NULL,
    head_sequence BIGINT NOT NULL CHECK (head_sequence > 0),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, model_id),
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, draft_head_revision_id) REFERENCES revision_document (project_id, revision_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE model_purge_authorization (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    model_id TEXT NOT NULL,
    PRIMARY KEY (project_id, model_id),
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE model_save_mode (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    model_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('REVISION_PER_EDIT_V1', 'JOURNALED_DRAFT_V2')),
    active_draft_id TEXT,
    PRIMARY KEY (project_id, model_id),
    CHECK ((mode = 'REVISION_PER_EDIT_V1' AND active_draft_id IS NULL)
        OR (mode = 'JOURNALED_DRAFT_V2' AND active_draft_id IS NOT NULL)),
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, model_id, active_draft_id) REFERENCES draft_stream (project_id, model_id, draft_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE named_snapshot (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    snapshot_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    revision_id TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (project_id, snapshot_id),
    UNIQUE (project_id, model_id, normalized_name),
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, revision_id) REFERENCES revision_document (project_id, revision_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE occurrence_index (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    source_revision_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    context_id TEXT NOT NULL,
    occurrence_id TEXT NOT NULL,
    target_entity_id TEXT NOT NULL,
    ownership TEXT NOT NULL CHECK (ownership IN ('OWNED', 'REFERENCED', 'VIEW_DERIVED')),
    PRIMARY KEY (project_id, source_revision_id, occurrence_id),
    FOREIGN KEY (project_id, source_revision_id) REFERENCES revision_document (project_id, revision_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE operation_record (
    operation_record_id TEXT NOT NULL,
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    model_id TEXT,
    operation_id TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    command_id TEXT,
    input_revision_id TEXT,
    result_revision_id TEXT,
    result_status TEXT NOT NULL CHECK (result_status IN ('COMMITTED', 'BLOCKED', 'FAILED', 'ACCEPTED', 'COMPLETED', 'CANCELLED')),
    diagnostic_id TEXT,
    occurred_at TEXT NOT NULL,
    PRIMARY KEY (project_id, operation_record_id),
    FOREIGN KEY (project_id) REFERENCES project_metadata (project_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, input_revision_id) REFERENCES revision_document (project_id, revision_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, result_revision_id) REFERENCES revision_document (project_id, revision_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE profile_package (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    profile_id TEXT NOT NULL,
    package_version TEXT NOT NULL,
    package_digest TEXT NOT NULL,
    lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('DRAFT', 'ACTIVE', 'DEPRECATED', 'RETIRED')),
    package_json TEXT NOT NULL,
    installed_at TEXT NOT NULL,
    PRIMARY KEY (project_id, profile_id, package_version),
    UNIQUE (project_id, package_digest),
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE project_metadata (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    default_profile_id TEXT NOT NULL,
    default_profile_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id)
);

CREATE TABLE revision_document (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    revision_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    revision_sequence BIGINT NOT NULL CHECK (revision_sequence > 0),
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
    immutable BIGINT NOT NULL DEFAULT 1 CHECK (immutable = 1),
    created_at TEXT NOT NULL,
    PRIMARY KEY (project_id, revision_id),
    UNIQUE (project_id, model_id, revision_sequence),
    UNIQUE (project_id, model_id, document_digest),
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, profile_id, profile_version) REFERENCES profile_package (project_id, profile_id, package_version) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, rule_set_id, rule_set_version) REFERENCES rule_set_package (project_id, rule_set_id, rule_set_version) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE revision_parent (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    model_id TEXT NOT NULL,
    revision_id TEXT NOT NULL,
    parent_revision_id TEXT,
    PRIMARY KEY (project_id, model_id, revision_id),
    CHECK (parent_revision_id IS NULL OR parent_revision_id <> revision_id),
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, revision_id) REFERENCES revision_document (project_id, revision_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, parent_revision_id) REFERENCES revision_document (project_id, revision_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE rule_set_package (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    rule_set_id TEXT NOT NULL,
    rule_set_version TEXT NOT NULL,
    rule_set_digest TEXT NOT NULL,
    lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('DRAFT', 'ACTIVE', 'DEPRECATED', 'RETIRED')),
    package_json TEXT NOT NULL,
    installed_at TEXT NOT NULL,
    PRIMARY KEY (project_id, rule_set_id, rule_set_version),
    UNIQUE (project_id, rule_set_digest),
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE text_trace_index (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    source_revision_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    fact_id TEXT NOT NULL,
    sentence_id TEXT NOT NULL,
    context_id TEXT NOT NULL,
    PRIMARY KEY (project_id, source_revision_id, trace_id, fact_id, sentence_id),
    FOREIGN KEY (project_id, source_revision_id) REFERENCES revision_document (project_id, revision_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (project_id, model_id) REFERENCES model_catalog (project_id, model_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE project_order (
    project_id TEXT NOT NULL DEFAULT (project_scope()) CHECK (project_id IS project_scope() AND project_scope() IS NOT NULL),
    kind TEXT NOT NULL,
    next_order BIGINT NOT NULL,
    PRIMARY KEY(project_id,kind),
    FOREIGN KEY(project_id) REFERENCES project_metadata(project_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TRIGGER draft_checkpoint_no_update BEFORE UPDATE ON draft_checkpoint
BEGIN SELECT RAISE(ABORT, 'DRAFT_CHECKPOINT_IMMUTABLE'); END;

CREATE TRIGGER draft_checkpoint_overlay_no_update BEFORE UPDATE ON draft_checkpoint_overlay
BEGIN SELECT RAISE(ABORT, 'DRAFT_CHECKPOINT_OVERLAY_IMMUTABLE'); END;

CREATE TRIGGER draft_content_no_update BEFORE UPDATE ON draft_content
BEGIN SELECT RAISE(ABORT, 'DRAFT_CONTENT_IMMUTABLE'); END;

CREATE TRIGGER draft_journal_no_update BEFORE UPDATE ON draft_journal
BEGIN SELECT RAISE(ABORT, 'DRAFT_JOURNAL_IMMUTABLE'); END;

CREATE TRIGGER draft_receipt_no_delete BEFORE DELETE ON draft_receipt WHEN NOT EXISTS (SELECT 1 FROM model_purge_authorization a JOIN model_catalog m ON m.model_id=a.model_id WHERE a.model_id=OLD.model_id AND m.status='ARCHIVED')
BEGIN SELECT RAISE(ABORT, 'DRAFT_RECEIPT_IMMUTABLE'); END;

CREATE TRIGGER draft_receipt_no_update BEFORE UPDATE ON draft_receipt
BEGIN SELECT RAISE(ABORT, 'DRAFT_RECEIPT_IMMUTABLE'); END;

CREATE TRIGGER draft_savepoint_no_delete BEFORE DELETE ON draft_savepoint WHEN NOT EXISTS (SELECT 1 FROM model_purge_authorization a JOIN model_catalog m ON m.model_id=a.model_id WHERE a.model_id=OLD.model_id AND m.status='ARCHIVED')
BEGIN SELECT RAISE(ABORT, 'DRAFT_SAVEPOINT_IMMUTABLE'); END;

CREATE TRIGGER draft_savepoint_no_update BEFORE UPDATE ON draft_savepoint
BEGIN SELECT RAISE(ABORT, 'DRAFT_SAVEPOINT_IMMUTABLE'); END;

CREATE TRIGGER draft_stream_base_model_guard BEFORE INSERT ON draft_stream WHEN NOT EXISTS (SELECT 1 FROM revision_document WHERE revision_id = NEW.base_revision_id AND model_id = NEW.model_id)
BEGIN SELECT RAISE(ABORT, 'DRAFT_BASE_MODEL_MISMATCH'); END;

CREATE TRIGGER draft_stream_identity_guard BEFORE UPDATE ON draft_stream WHEN NEW.model_id <> OLD.model_id OR NEW.draft_id <> OLD.draft_id OR NEW.base_revision_id <> OLD.base_revision_id
    OR NEW.binding_digest <> OLD.binding_digest OR NEW.edit_seq < OLD.edit_seq
BEGIN SELECT RAISE(ABORT, 'DRAFT_IDENTITY_IMMUTABLE'); END;

CREATE TRIGGER legacy_head_delete_guard BEFORE DELETE ON model_head WHEN (EXISTS (SELECT 1 FROM model_save_mode WHERE model_id=OLD.model_id AND mode='JOURNALED_DRAFT_V2')) AND NOT EXISTS (SELECT 1 FROM model_purge_authorization a JOIN model_catalog m ON m.model_id=a.model_id WHERE a.model_id=OLD.model_id AND m.status='ARCHIVED')
BEGIN SELECT RAISE(ABORT, 'DRAFT_PROTOCOL_UPGRADE_REQUIRED'); END;

CREATE TRIGGER legacy_head_update_guard BEFORE UPDATE ON model_head WHEN EXISTS (SELECT 1 FROM model_save_mode WHERE model_id IN (OLD.model_id, NEW.model_id) AND mode = 'JOURNALED_DRAFT_V2')
BEGIN SELECT RAISE(ABORT, 'DRAFT_PROTOCOL_UPGRADE_REQUIRED'); END;

CREATE TRIGGER legacy_revision_write_guard BEFORE INSERT ON revision_document WHEN EXISTS (SELECT 1 FROM model_save_mode WHERE model_id = NEW.model_id AND mode = 'JOURNALED_DRAFT_V2')
BEGIN SELECT RAISE(ABORT, 'DRAFT_PROTOCOL_UPGRADE_REQUIRED'); END;

CREATE TRIGGER model_archived_baseline_write_guard BEFORE INSERT ON baseline WHEN EXISTS (SELECT 1 FROM model_catalog WHERE model_id=NEW.model_id AND status <> 'ACTIVE')
BEGIN SELECT RAISE(ABORT, 'MODEL_ARCHIVED'); END;

CREATE TRIGGER model_archived_revision_write_guard BEFORE INSERT ON revision_document WHEN EXISTS (SELECT 1 FROM model_catalog WHERE model_id=NEW.model_id AND status <> 'ACTIVE')
BEGIN SELECT RAISE(ABORT, 'MODEL_ARCHIVED'); END;

CREATE TRIGGER model_save_mode_no_delete BEFORE DELETE ON model_save_mode WHEN (OLD.mode = 'JOURNALED_DRAFT_V2') AND NOT EXISTS (SELECT 1 FROM model_purge_authorization a JOIN model_catalog m ON m.model_id=a.model_id WHERE a.model_id=OLD.model_id AND m.status='ARCHIVED')
BEGIN SELECT RAISE(ABORT, 'DRAFT_MODE_DOWNGRADE_FORBIDDEN'); END;

CREATE TRIGGER model_save_mode_no_downgrade BEFORE UPDATE ON model_save_mode WHEN OLD.mode = 'JOURNALED_DRAFT_V2' AND (NEW.mode <> OLD.mode OR NEW.model_id <> OLD.model_id)
BEGIN SELECT RAISE(ABORT, 'DRAFT_MODE_DOWNGRADE_FORBIDDEN'); END;

CREATE TRIGGER model_save_mode_replace_guard BEFORE INSERT ON model_save_mode WHEN NEW.mode <> 'JOURNALED_DRAFT_V2' AND EXISTS (SELECT 1 FROM model_save_mode WHERE model_id = NEW.model_id AND mode = 'JOURNALED_DRAFT_V2')
BEGIN SELECT RAISE(ABORT, 'DRAFT_MODE_DOWNGRADE_FORBIDDEN'); END;

CREATE TRIGGER trg_revision_document_no_delete BEFORE DELETE ON revision_document WHEN NOT EXISTS (SELECT 1 FROM model_purge_authorization a JOIN model_catalog m ON m.model_id=a.model_id WHERE a.model_id=OLD.model_id AND m.status='ARCHIVED')
BEGIN SELECT RAISE(ABORT, 'revision_document is immutable'); END;

CREATE TRIGGER trg_revision_document_no_update BEFORE UPDATE ON revision_document
BEGIN SELECT RAISE(ABORT, 'revision_document is immutable'); END;

CREATE UNIQUE INDEX project_create_command ON idempotency_record(operation_id,aggregate_id,command_id) WHERE operation_id='API-PRJ-003';

CREATE INDEX draft_checkpoint_sequence ON draft_checkpoint (project_id, model_id, draft_id, covered_seq DESC);

CREATE INDEX draft_journal_time ON draft_journal (project_id, model_id, draft_id, occurred_at);

CREATE INDEX idx_element_search ON element_index (project_id, model_id, source_revision_id, normalized_name);

CREATE INDEX idx_exchange_import_source ON exchange_import_origin (project_id, source_namespace, source_project_id, source_model_id, source_revision_id);

CREATE INDEX idx_fact_target ON fact_endpoint_index (project_id, model_id, source_revision_id, target_entity_id);

CREATE INDEX idx_finding_filter ON finding_index (project_id, model_id, source_revision_id, severity, category);

CREATE INDEX idx_model_project_status_name ON model_catalog (project_id, status, normalized_name);

CREATE INDEX idx_occurrence_context_target ON occurrence_index (project_id, model_id, source_revision_id, context_id, target_entity_id);

CREATE INDEX idx_operation_project_time ON operation_record (project_id, occurred_at DESC);

CREATE INDEX idx_project_status_name ON project_metadata (project_id, status, normalized_name);

CREATE INDEX idx_revision_model_sequence ON revision_document (project_id, model_id, revision_sequence DESC);

CREATE INDEX idx_revision_parent_parent ON revision_parent (project_id, model_id, parent_revision_id);

CREATE INDEX idx_task_state_updated ON background_task (project_id, state, updated_at);

CREATE INDEX idx_text_trace_fact ON text_trace_index (project_id, model_id, source_revision_id, fact_id, sentence_id);

CREATE INDEX model_catalog_project_status ON model_catalog(project_id,status,normalized_name);

CREATE INDEX draft_receipt_order ON draft_receipt(project_id,receipt_order);

CREATE INDEX mindmap_conversion_order ON mindmap_conversion(project_id,model_id,conversion_order);
