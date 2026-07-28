PRAGMA foreign_keys = ON;

SELECT metadata_value AS storage_schema_version
FROM schema_metadata
WHERE metadata_key = 'storage_schema_version';

PRAGMA foreign_key_check;

SELECT name
FROM sqlite_schema
WHERE type = 'table'
  AND name NOT LIKE 'sqlite_%'
ORDER BY name;

SELECT name
FROM sqlite_schema
WHERE type = 'trigger'
ORDER BY name;
