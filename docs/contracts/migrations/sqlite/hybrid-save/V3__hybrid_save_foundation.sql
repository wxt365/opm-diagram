-- 待启用迁移：默认 Runtime 资源不注册此目录，不能单靠建表切换模型模式。
CREATE TABLE draft_content (
    model_id TEXT NOT NULL REFERENCES model_catalog(model_id),
    content_digest TEXT NOT NULL CHECK (length(content_digest) = 64 AND content_digest NOT GLOB '*[^0-9a-f]*'),
    digest_version TEXT NOT NULL CHECK (digest_version = 'SaveContentDigest/1'),
    model_json TEXT NOT NULL CHECK (json_valid(model_json) AND json_type(model_json) = 'object'),
    artifact_json TEXT NOT NULL CHECK (json_valid(artifact_json) AND json_type(artifact_json) = 'object'),
    artifact_digest TEXT NOT NULL CHECK (length(artifact_digest) = 64 AND artifact_digest NOT GLOB '*[^0-9a-f]*'),
    PRIMARY KEY (model_id, content_digest)
);

CREATE TABLE draft_stream (
    model_id TEXT NOT NULL REFERENCES model_catalog(model_id),
    draft_id TEXT NOT NULL UNIQUE,
    edit_seq INTEGER NOT NULL CHECK (typeof(edit_seq) = 'integer' AND edit_seq BETWEEN 0 AND 9007199254740991),
    binding_digest TEXT NOT NULL CHECK (length(binding_digest) = 64 AND binding_digest NOT GLOB '*[^0-9a-f]*'),
    base_revision_id TEXT NOT NULL REFERENCES revision_document(revision_id),
    checkpoint_id TEXT NOT NULL,
    dirty_since TEXT,
    deadline TEXT,
    PRIMARY KEY (model_id, draft_id),
    FOREIGN KEY (model_id, draft_id, checkpoint_id) REFERENCES draft_checkpoint(model_id, draft_id, checkpoint_id) DEFERRABLE INITIALLY DEFERRED,
    CHECK ((dirty_since IS NULL) = (deadline IS NULL))
);

CREATE TABLE draft_checkpoint (
    model_id TEXT NOT NULL,
    draft_id TEXT NOT NULL,
    checkpoint_id TEXT NOT NULL UNIQUE,
    covered_seq INTEGER NOT NULL CHECK (typeof(covered_seq) = 'integer' AND covered_seq BETWEEN 0 AND 9007199254740991),
    content_digest TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (model_id, draft_id, checkpoint_id),
    FOREIGN KEY (model_id, draft_id) REFERENCES draft_stream(model_id, draft_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (model_id, content_digest) REFERENCES draft_content(model_id, content_digest)
);

CREATE TABLE model_save_mode (
    model_id TEXT PRIMARY KEY REFERENCES model_catalog(model_id),
    mode TEXT NOT NULL CHECK (mode IN ('REVISION_PER_EDIT_V1', 'JOURNALED_DRAFT_V2')),
    active_draft_id TEXT,
    FOREIGN KEY (model_id, active_draft_id) REFERENCES draft_stream(model_id, draft_id),
    CHECK ((mode = 'REVISION_PER_EDIT_V1' AND active_draft_id IS NULL)
        OR (mode = 'JOURNALED_DRAFT_V2' AND active_draft_id IS NOT NULL))
);

CREATE TABLE draft_journal (
    model_id TEXT NOT NULL,
    draft_id TEXT NOT NULL,
    edit_seq INTEGER NOT NULL CHECK (typeof(edit_seq) = 'integer' AND edit_seq BETWEEN 1 AND 9007199254740991),
    command_id TEXT NOT NULL,
    request_digest TEXT NOT NULL CHECK (length(request_digest) = 64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
    delta_json TEXT NOT NULL CHECK (json_valid(delta_json) AND json_type(delta_json) = 'object'),
    artifact_delta_json TEXT NOT NULL CHECK (json_valid(artifact_delta_json) AND json_type(artifact_delta_json) = 'object'),
    result_digest TEXT NOT NULL CHECK (length(result_digest) = 64 AND result_digest NOT GLOB '*[^0-9a-f]*'),
    occurred_at TEXT NOT NULL,
    PRIMARY KEY (model_id, draft_id, edit_seq),
    UNIQUE (model_id, command_id),
    FOREIGN KEY (model_id, draft_id) REFERENCES draft_stream(model_id, draft_id)
);

CREATE TABLE draft_savepoint (
    revision_id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,
    draft_id TEXT NOT NULL,
    captured_seq INTEGER NOT NULL CHECK (typeof(captured_seq) = 'integer' AND captured_seq BETWEEN 0 AND 9007199254740991),
    history_sequence INTEGER NOT NULL CHECK (typeof(history_sequence) = 'integer' AND history_sequence BETWEEN 1 AND 9007199254740991),
    purpose TEXT NOT NULL CHECK (purpose IN ('MANUAL', 'PERMALINK', 'SNAPSHOT', 'BASELINE', 'EXPORT')),
    content_digest TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (model_id, revision_id),
    UNIQUE (model_id, history_sequence),
    FOREIGN KEY (model_id, draft_id) REFERENCES draft_stream(model_id, draft_id),
    FOREIGN KEY (model_id, content_digest) REFERENCES draft_content(model_id, content_digest)
);

CREATE TABLE draft_receipt (
    model_id TEXT NOT NULL REFERENCES model_catalog(model_id),
    operation TEXT NOT NULL CHECK (operation IN ('EDIT', 'SAVE', 'PIN')),
    idempotency_id TEXT NOT NULL,
    request_digest TEXT NOT NULL CHECK (length(request_digest) = 64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
    result_json TEXT NOT NULL CHECK (json_valid(result_json) AND json_type(result_json) = 'object'),
    created_at TEXT NOT NULL,
    PRIMARY KEY (model_id, operation, idempotency_id)
);

CREATE TABLE draft_retention (
    model_id TEXT NOT NULL,
    draft_id TEXT NOT NULL,
    retention_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('READ', 'UNDO', 'PERMALINK', 'SNAPSHOT', 'BASELINE', 'EXPORT', 'BACKUP')),
    checkpoint_id TEXT,
    revision_id TEXT,
    min_edit_seq INTEGER CHECK (typeof(min_edit_seq) = 'integer' AND min_edit_seq BETWEEN 0 AND 9007199254740991),
    PRIMARY KEY (model_id, retention_id),
    FOREIGN KEY (model_id, draft_id) REFERENCES draft_stream(model_id, draft_id),
    FOREIGN KEY (model_id, draft_id, checkpoint_id) REFERENCES draft_checkpoint(model_id, draft_id, checkpoint_id),
    FOREIGN KEY (model_id, revision_id) REFERENCES draft_savepoint(model_id, revision_id),
    CHECK (checkpoint_id IS NOT NULL OR revision_id IS NOT NULL OR min_edit_seq IS NOT NULL)
);

CREATE TRIGGER draft_stream_base_model_guard BEFORE INSERT ON draft_stream
WHEN NOT EXISTS (SELECT 1 FROM revision_document WHERE revision_id = NEW.base_revision_id AND model_id = NEW.model_id)
BEGIN SELECT RAISE(ABORT, 'DRAFT_BASE_MODEL_MISMATCH'); END;
CREATE TRIGGER draft_stream_identity_guard BEFORE UPDATE ON draft_stream
WHEN NEW.model_id <> OLD.model_id OR NEW.draft_id <> OLD.draft_id OR NEW.base_revision_id <> OLD.base_revision_id
    OR NEW.binding_digest <> OLD.binding_digest OR NEW.edit_seq < OLD.edit_seq
BEGIN SELECT RAISE(ABORT, 'DRAFT_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER draft_stream_no_replace BEFORE INSERT ON draft_stream
WHEN EXISTS (SELECT 1 FROM draft_stream WHERE draft_id = NEW.draft_id)
BEGIN SELECT RAISE(ABORT, 'DRAFT_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER model_save_mode_replace_guard BEFORE INSERT ON model_save_mode
WHEN NEW.mode <> 'JOURNALED_DRAFT_V2' AND EXISTS (SELECT 1 FROM model_save_mode WHERE model_id = NEW.model_id AND mode = 'JOURNALED_DRAFT_V2')
BEGIN SELECT RAISE(ABORT, 'DRAFT_MODE_DOWNGRADE_FORBIDDEN'); END;
CREATE TRIGGER model_save_mode_no_downgrade BEFORE UPDATE ON model_save_mode
WHEN OLD.mode = 'JOURNALED_DRAFT_V2' AND (NEW.mode <> OLD.mode OR NEW.model_id <> OLD.model_id)
BEGIN SELECT RAISE(ABORT, 'DRAFT_MODE_DOWNGRADE_FORBIDDEN'); END;
CREATE TRIGGER model_save_mode_no_delete BEFORE DELETE ON model_save_mode
WHEN OLD.mode = 'JOURNALED_DRAFT_V2'
BEGIN SELECT RAISE(ABORT, 'DRAFT_MODE_DOWNGRADE_FORBIDDEN'); END;
CREATE TRIGGER legacy_revision_write_guard BEFORE INSERT ON revision_document
WHEN EXISTS (SELECT 1 FROM model_save_mode WHERE model_id = NEW.model_id AND mode = 'JOURNALED_DRAFT_V2')
BEGIN SELECT RAISE(ABORT, 'DRAFT_PROTOCOL_UPGRADE_REQUIRED'); END;
CREATE TRIGGER legacy_head_update_guard BEFORE UPDATE ON model_head
WHEN EXISTS (SELECT 1 FROM model_save_mode WHERE model_id IN (OLD.model_id, NEW.model_id) AND mode = 'JOURNALED_DRAFT_V2')
BEGIN SELECT RAISE(ABORT, 'DRAFT_PROTOCOL_UPGRADE_REQUIRED'); END;
CREATE TRIGGER legacy_head_delete_guard BEFORE DELETE ON model_head
WHEN EXISTS (SELECT 1 FROM model_save_mode WHERE model_id = OLD.model_id AND mode = 'JOURNALED_DRAFT_V2')
BEGIN SELECT RAISE(ABORT, 'DRAFT_PROTOCOL_UPGRADE_REQUIRED'); END;
CREATE TRIGGER draft_content_no_update BEFORE UPDATE ON draft_content
BEGIN SELECT RAISE(ABORT, 'DRAFT_CONTENT_IMMUTABLE'); END;
CREATE TRIGGER draft_checkpoint_no_update BEFORE UPDATE ON draft_checkpoint
BEGIN SELECT RAISE(ABORT, 'DRAFT_CHECKPOINT_IMMUTABLE'); END;
CREATE TRIGGER draft_journal_no_update BEFORE UPDATE ON draft_journal
BEGIN SELECT RAISE(ABORT, 'DRAFT_JOURNAL_IMMUTABLE'); END;
CREATE TRIGGER draft_savepoint_no_update BEFORE UPDATE ON draft_savepoint
BEGIN SELECT RAISE(ABORT, 'DRAFT_SAVEPOINT_IMMUTABLE'); END;
CREATE TRIGGER draft_savepoint_no_delete BEFORE DELETE ON draft_savepoint
BEGIN SELECT RAISE(ABORT, 'DRAFT_SAVEPOINT_IMMUTABLE'); END;
CREATE TRIGGER draft_receipt_no_update BEFORE UPDATE ON draft_receipt
BEGIN SELECT RAISE(ABORT, 'DRAFT_RECEIPT_IMMUTABLE'); END;
CREATE TRIGGER draft_receipt_no_delete BEFORE DELETE ON draft_receipt
BEGIN SELECT RAISE(ABORT, 'DRAFT_RECEIPT_IMMUTABLE'); END;

-- REPLACE 的隐式删除不保证触发 DELETE trigger，因此在插入阶段同样保护身份。
CREATE TRIGGER draft_content_no_replace BEFORE INSERT ON draft_content
WHEN EXISTS (SELECT 1 FROM draft_content WHERE model_id = NEW.model_id AND content_digest = NEW.content_digest)
BEGIN SELECT RAISE(ABORT, 'DRAFT_CONTENT_IMMUTABLE'); END;
CREATE TRIGGER draft_checkpoint_no_replace BEFORE INSERT ON draft_checkpoint
WHEN EXISTS (SELECT 1 FROM draft_checkpoint WHERE checkpoint_id = NEW.checkpoint_id)
BEGIN SELECT RAISE(ABORT, 'DRAFT_CHECKPOINT_IMMUTABLE'); END;
CREATE TRIGGER draft_journal_no_replace BEFORE INSERT ON draft_journal
WHEN EXISTS (SELECT 1 FROM draft_journal WHERE model_id = NEW.model_id AND (command_id = NEW.command_id OR (draft_id = NEW.draft_id AND edit_seq = NEW.edit_seq)))
BEGIN SELECT RAISE(ABORT, 'DRAFT_JOURNAL_IMMUTABLE'); END;
CREATE TRIGGER draft_savepoint_no_replace BEFORE INSERT ON draft_savepoint
WHEN EXISTS (SELECT 1 FROM draft_savepoint WHERE revision_id = NEW.revision_id OR (model_id = NEW.model_id AND history_sequence = NEW.history_sequence))
BEGIN SELECT RAISE(ABORT, 'DRAFT_SAVEPOINT_IMMUTABLE'); END;
CREATE TRIGGER draft_receipt_no_replace BEFORE INSERT ON draft_receipt
WHEN EXISTS (SELECT 1 FROM draft_receipt WHERE model_id = NEW.model_id AND operation = NEW.operation AND idempotency_id = NEW.idempotency_id)
BEGIN SELECT RAISE(ABORT, 'DRAFT_RECEIPT_IMMUTABLE'); END;

CREATE INDEX draft_checkpoint_sequence ON draft_checkpoint(model_id, draft_id, covered_seq DESC);
CREATE INDEX draft_journal_time ON draft_journal(model_id, draft_id, occurred_at);
UPDATE schema_metadata SET metadata_value = '1.2', updated_at = '2026-09-11T00:00:00Z'
WHERE metadata_key = 'storage_schema_version';
