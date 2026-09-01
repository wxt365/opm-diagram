CREATE TABLE exchange_import_origin (
    package_digest TEXT PRIMARY KEY,
    package_id TEXT NOT NULL,
    package_kind TEXT NOT NULL CHECK (package_kind IN ('PROJECT_FULL', 'BASELINE_ASSET')),
    source_namespace TEXT NOT NULL,
    source_project_id TEXT,
    source_model_id TEXT,
    source_revision_id TEXT,
    source_baseline_id TEXT,
    target_project_id TEXT NOT NULL UNIQUE,
    importer_version TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    FOREIGN KEY (target_project_id) REFERENCES project_metadata(project_id)
);

CREATE TABLE exchange_identity_map (
    package_digest TEXT NOT NULL,
    source_namespace TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('NEW_PROJECT', 'PRESERVED')),
    PRIMARY KEY (package_digest, source_namespace, source_id),
    FOREIGN KEY (package_digest) REFERENCES exchange_import_origin(package_digest)
);

CREATE INDEX idx_exchange_import_source ON exchange_import_origin(source_namespace, source_project_id, source_model_id, source_revision_id);

UPDATE schema_metadata
SET metadata_value = '1.1', updated_at = '2026-09-01T00:00:00Z'
WHERE metadata_key = 'storage_schema_version';
