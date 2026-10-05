-- 待启用：只由受控迁移显式注册；保留全部旧引用，修正可空序号 CHECK。
CREATE TABLE draft_retention_v5 (
    model_id TEXT NOT NULL,
    draft_id TEXT NOT NULL,
    retention_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('READ', 'UNDO', 'PERMALINK', 'SNAPSHOT', 'BASELINE', 'EXPORT', 'BACKUP')),
    checkpoint_id TEXT,
    revision_id TEXT,
    min_edit_seq INTEGER CONSTRAINT draft_retention_nullable_seq_v5 CHECK (
        min_edit_seq IS NULL OR (typeof(min_edit_seq) = 'integer' AND min_edit_seq BETWEEN 0 AND 9007199254740991)
    ),
    PRIMARY KEY (model_id, retention_id),
    FOREIGN KEY (model_id, draft_id) REFERENCES draft_stream(model_id, draft_id),
    FOREIGN KEY (model_id, draft_id, checkpoint_id) REFERENCES draft_checkpoint(model_id, draft_id, checkpoint_id),
    FOREIGN KEY (model_id, revision_id) REFERENCES draft_savepoint(model_id, revision_id),
    CHECK (checkpoint_id IS NOT NULL OR revision_id IS NOT NULL OR min_edit_seq IS NOT NULL)
);
INSERT INTO draft_retention_v5 SELECT model_id,draft_id,retention_id,kind,checkpoint_id,revision_id,min_edit_seq FROM draft_retention;
DROP TABLE draft_retention;
ALTER TABLE draft_retention_v5 RENAME TO draft_retention;
