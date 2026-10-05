-- 分析资料独立于语义正文；转换来源与 EDIT 回执在同一事务写入。
CREATE TABLE mindmap_document (
    model_id TEXT PRIMARY KEY REFERENCES model_catalog(model_id) ON DELETE CASCADE,
    mindmap_id TEXT NOT NULL UNIQUE,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    document_json TEXT NOT NULL,
    digest TEXT NOT NULL
);
CREATE TABLE mindmap_conversion (
    model_id TEXT NOT NULL REFERENCES model_catalog(model_id) ON DELETE CASCADE,
    command_id TEXT NOT NULL,
    context_id TEXT NOT NULL,
    mindmap_id TEXT NOT NULL,
    source_revision INTEGER NOT NULL,
    source_json TEXT NOT NULL,
    mappings_json TEXT NOT NULL,
    PRIMARY KEY (model_id, command_id)
);
