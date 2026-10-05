-- 待启用：独立于旧 V1/V2/V3 扫描根，仅由受控迁移显式注册。
CREATE TABLE draft_checkpoint_overlay (
    checkpoint_id TEXT NOT NULL PRIMARY KEY REFERENCES draft_checkpoint(checkpoint_id),
    content_delta_json TEXT NOT NULL CHECK (json_valid(content_delta_json) AND json_type(content_delta_json) = 'object'),
    artifact_delta_json TEXT NOT NULL CHECK (json_valid(artifact_delta_json) AND json_type(artifact_delta_json) = 'object'),
    document_digest TEXT NOT NULL CHECK (length(document_digest) = 64 AND document_digest NOT GLOB '*[^0-9a-f]*')
);
CREATE TRIGGER draft_checkpoint_overlay_no_update BEFORE UPDATE ON draft_checkpoint_overlay
BEGIN SELECT RAISE(ABORT, 'DRAFT_CHECKPOINT_OVERLAY_IMMUTABLE'); END;
CREATE TRIGGER draft_checkpoint_overlay_no_replace BEFORE INSERT ON draft_checkpoint_overlay
WHEN EXISTS (SELECT 1 FROM draft_checkpoint_overlay WHERE checkpoint_id = NEW.checkpoint_id)
BEGIN SELECT RAISE(ABORT, 'DRAFT_CHECKPOINT_OVERLAY_IMMUTABLE'); END;
