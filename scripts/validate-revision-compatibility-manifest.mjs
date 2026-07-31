import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const manifestArgument = process.argv[2] ?? 'packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/compatibility/opm-revision-compatibility-manifest.json';
const manifestPath = resolve(manifestArgument);
const manifestDirectory = dirname(manifestPath);
const schemaV01 = await readJson(resolve('docs/contracts/schemas/opm-revision.schema.json'));
const schemaV02 = await readJson(resolve('docs/contracts/schemas/opm-revision-v0.2.schema.json'));
const manifestSchema = await readJson(resolve('docs/contracts/schemas/opm-revision-compatibility-manifest.schema.json'));
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(schemaV01);
ajv.addSchema(schemaV02);
const validateManifest = ajv.compile(manifestSchema);
const validateV01 = ajv.getSchema(schemaV01.$id);
const validateV02 = ajv.getSchema(schemaV02.$id);

if (!validateManifest(manifest)) fail(`Compatibility manifest schema validation failed: ${JSON.stringify(validateManifest.errors)}`);
const expectedCases = [
  'COMPAT-001.V01_SEMANTIC_ONLY_READ.PASS', 'COMPAT-002.V01_STORED_TEXT_READ.PASS', 'COMPAT-003.V01_EXACT_DIGEST_REPLAY.PASS',
  'COMPAT-004.V01_SQLITE_REOPEN.PASS', 'COMPAT-005.V01_TO_V02_SAME_BINDING.PASS', 'COMPAT-006.V02_ROUNDTRIP_REPLAY.PASS',
  'COMPAT-007.UNKNOWN_SCHEMA.BLOCKED', 'COMPAT-008.V01_SHAPE_POLLUTION.BLOCKED', 'COMPAT-009.V01_ASSET_MISSING.BLOCKED',
  'COMPAT-010.V01_ASSET_DIGEST_MISMATCH.BLOCKED', 'COMPAT-011.V01_RENDERER_MISSING.BLOCKED',
  'COMPAT-012.PROFILE_REBIND_WITHOUT_MIGRATION.BLOCKED', 'COMPAT-013.V02_LEGACY_VALUE_WRITE.BLOCKED'
];
const actualCases = manifest.cases.map(item => item.case_id);
if (new Set(actualCases).size !== actualCases.length || expectedCases.some(item => !actualCases.includes(item))) {
  fail('Compatibility manifest must contain the fixed 13 unique case identifiers.');
}
if (manifest.cases.filter(item => item.expectation === 'PASS').length !== 6 || manifest.cases.filter(item => item.expectation === 'BLOCKED').length !== 7) {
  fail('Compatibility manifest must contain exactly 6 PASS and 7 BLOCKED cases.');
}

const schemaSha = { '0.1': sha(await readFile(resolve('docs/contracts/schemas/opm-revision.schema.json'))), '0.2': sha(await readFile(resolve('docs/contracts/schemas/opm-revision-v0.2.schema.json'))) };
for (const item of manifest.cases) {
  verifySchemaRef(item.case_id, item.source_schema_ref);
  if (item.target_schema_ref) verifySchemaRef(item.case_id, item.target_schema_ref);
  if (bindingDigest(item.source_binding) !== item.source_binding.binding_digest) fail(`${item.case_id}: source_binding digest does not match five asset refs.`);
  if (item.target_binding && bindingDigest(item.target_binding) !== item.target_binding.binding_digest) fail(`${item.case_id}: target_binding digest does not match five asset refs.`);
  const inputPath = safeResolve(item.input_ref);
  const bytes = await readFile(inputPath);
  if (sha(bytes) !== item.input_sha256) fail(`${item.case_id}: input_sha256 does not match fixture bytes.`);
  const input = JSON.parse(bytes.toString('utf8'));
  if (item.case_id === 'COMPAT-007.UNKNOWN_SCHEMA.BLOCKED') continue;
  if (item.case_id === 'COMPAT-008.V01_SHAPE_POLLUTION.BLOCKED') {
    if (validateV01(input)) fail(`${item.case_id}: shape-pollution fixture unexpectedly validates as 0.1.`);
    continue;
  }
  const validate = item.source_schema_ref.schema_version === '0.1' ? validateV01 : validateV02;
  if (!validate(input)) fail(`${item.case_id}: input fixture does not match declared source Schema: ${JSON.stringify(validate.errors)}`);
}

console.log('Revision compatibility manifest is structurally valid: 13 cases, 6 PASS, 7 BLOCKED.');

function verifySchemaRef(caseId, reference) {
  if (schemaSha[reference.schema_version] !== reference.sha256) fail(`${caseId}: Schema SHA does not match ${reference.schema_version}.`);
}

function safeResolve(path) {
  const resolved = resolve(manifestDirectory, path);
  const relation = relative(manifestDirectory, resolved);
  if (relation === '' || relation === '..' || relation.startsWith(`..${sep}`) || relation.includes(`${sep}..${sep}`)) fail(`Fixture path escapes manifest directory: ${path}`);
  return resolved;
}

function bindingDigest(binding) {
  const value = [
    ['PROFILE', binding.profile], ['RULE_SET', binding.rule_set], ['GRAMMAR_ASSET', binding.text_grammar],
    ['SYMBOL_ASSET', binding.symbol_catalog], ['NORMALIZATION_DATA', binding.normalization_adapter]
  ].map(([role, reference]) => `${role}\t${reference.id}\t${reference.version}\t${reference.sha256}\n`).join('');
  return sha(Buffer.from(value, 'utf8'));
}

function sha(value) { return createHash('sha256').update(value).digest('hex'); }
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
function fail(message) { throw new Error(`REVISION_COMPATIBILITY_MANIFEST_INVALID: ${message}`); }
