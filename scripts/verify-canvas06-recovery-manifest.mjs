import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { composeRecoveryManifestAndGateFixture } from './canvas06-recovery-manifest-compose.mjs';
import { canonicalizeJcs as jcs } from './canvas06-rfc8785.mjs';

const manifestSchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-recovery-manifest-v02.schema.json', import.meta.url)));
const gateSchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-recovery-gate-fixture.schema.json', import.meta.url)));
const catalogSchema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-recovery-reopen-expectation-catalog.schema.json', import.meta.url)));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv); ajv.addSchema(catalogSchema);
const validateManifest = ajv.compile(manifestSchema);
const validateGate = ajv.compile(gateSchema);

export class RecoveryManifestVerifierError extends Error {
  constructor(message) { super(message); this.name = 'RecoveryManifestVerifierError'; this.code = 'RECOVERY_INPUT_INVALID'; this.exitCode = 2; }
}

/** 只读验证活动 Recovery Manifest/Gate Fixture；成功不代表 Recovery Gate READY。 */
export async function main(argv = process.argv.slice(2)) {
  const options = parse(argv);
  const root = resolve(options.get('evidence-root'));
  await directory(root, 'Evidence root');
  const manifestRef = await ref(root, options.get('manifest'), 'RECOVERY_MANIFEST', 'Recovery Manifest');
  const gateRef = await ref(root, options.get('gate-fixture'), 'RECOVERY_GATE_FIXTURE', 'Recovery Gate Fixture');
  const manifest = await json(root, manifestRef, 'Recovery Manifest');
  const gate = await json(root, gateRef, 'Recovery Gate Fixture');
  if (!validateManifest(manifest) || !validateGate(gate)) fail('Recovery Manifest or Gate Fixture Schema is invalid.');
  if (manifest.schema_version !== '0.2' || manifest.manifest_version !== '0.2.0') fail('Historical Recovery Manifest is not an active verifier input.');
  const handoff = await json(root, manifest.handoff_ref, 'Handoff');
  const intake = await json(root, manifest.intake_report_ref, 'Intake');
  if (intake.intake_status !== 'READY_FOR_RELEASE_VALIDATION' || !sameIdentity(manifest.handoff_ref, intake.handoff_ref)
      || handoff.handoff_status !== 'READY_FOR_DEV_CANVAS_06' || handoff.production_gate?.state !== 'DISABLED' || handoff.production_gate?.enabled_capability_ids?.length !== 0) fail('Recovery trust chain is not READY and disabled.');
  await ref(root, manifest.source_build.local_runtime_jar.path, 'LOCAL_RUNTIME_JAR', 'Runtime JAR', manifest.source_build.local_runtime_jar);
  await verifyTree(root, manifest.source_build.web_dist);
  const modelRef = fixture(manifest, 'RECOVERY-FIXTURE-MODEL');
  const gateTemplateRef = fixture(manifest, 'RECOVERY-FIXTURE-GATE');
  const model = await json(root, modelRef.source_ref, 'Recovery Model Template');
  const gateTemplate = await json(root, gateTemplateRef.source_ref, 'Recovery Gate Template');
  const catalog = await json(root, manifest.reopen_expectation_catalog_ref, 'Recovery Reopen Catalog');
  if (catalog.catalog_payload_sha256 !== manifest.reopen_expectation_catalog_payload_sha256) fail('Recovery Reopen Catalog payload digest differs from Manifest.');
  for (const scenario of model.command_scenarios ?? []) await ref(root, scenario.base_revision_ref?.path, 'MS_REV_001_V02', 'Recovery base Revision', scenario.base_revision_ref);
  await profile(root, handoff.active_binding);
  const expected = composeRecoveryManifestAndGateFixture({ sourceDateEpoch: Date.parse(manifest.generated_at) / 1000, generatorIdentity: manifest.generator_identity,
    handoffRef: manifest.handoff_ref, intakeReportRef: manifest.intake_report_ref, upstreamSourceBuild: manifest.upstream_source_build, sourceBuild: manifest.source_build,
    modelTemplate: model, gateTemplate, modelTemplateRef: modelRef.source_ref, gateTemplateRef: gateTemplateRef.source_ref, reopenCatalog: catalog, reopenCatalogRef: manifest.reopen_expectation_catalog_ref });
  if (jcs(expected.manifest) !== jcs(manifest) || jcs(expected.gateFixture) !== jcs(gate)) fail('Recovery Manifest or Gate Fixture differs from its frozen source mirror.');
  return { manifest: manifestRef, gateFixture: gateRef };
}

function fixture(manifest, id) { const matches = manifest.fixture_catalog?.filter(value => value?.fixture_id === id) ?? []; if (matches.length !== 1) fail(`Recovery fixture ${id} is invalid.`); return matches[0]; }
async function profile(root, binding) {
  const base = `packages/profiles/${binding?.profile?.id}/${binding?.profile?.version}`;
  const value = await json(root, await ref(root, `${base}/profile.json`, 'PROFILE_PACKAGE', 'Profile package'), 'Profile package');
  if (value.manifest?.package_digest?.digest !== binding.profile?.sha256 || !Array.isArray(value.manifest?.entries) || value.manifest.entries.length !== 4) fail('Profile package does not close the active binding.');
  const roles = { RULE_SET: 'rule_set', SYMBOL_ASSET: 'symbol_catalog', GRAMMAR_ASSET: 'text_grammar', NORMALIZATION_DATA: 'normalization_adapter' };
  for (const entry of value.manifest.entries) { const key = roles[entry.role]; if (!key || !entry.required) fail('Profile role is invalid.'); const item = await ref(root, `${base}/${entry.logical_path}`, entry.role, `Profile ${entry.role}`); if (item.sha256 !== entry.digest?.digest || item.sha256 !== binding[key]?.sha256) fail('Profile asset differs from active binding.'); }
}
async function verifyTree(root, reference) { if (reference?.kind !== 'WEB_DIST_TREE') fail('Web dist reference is invalid.'); const directoryPath = inside(root, reference.path); await directory(directoryPath, 'Web dist'); const files = []; await walk(directoryPath, ''); const digest = sha(Buffer.from(jcs(files), 'utf8')); if (reference.byte_length !== files.reduce((sum, item) => sum + item.byte_length, 0) || reference.sha256 !== digest) fail('Web dist tree differs from source build ref.'); async function walk(current, prefix) { for (const item of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) { const path = resolve(current, item.name); const relativePath = prefix ? `${prefix}/${item.name}` : item.name; const info = await lstat(path); if (info.isSymbolicLink() || !info.isFile() && !info.isDirectory()) fail('Web dist contains unsafe entry.'); if (info.isDirectory()) await walk(path, relativePath); else { const bytes = await readFile(path); files.push({ path: relativePath, byte_length: bytes.length, sha256: sha(bytes) }); } } } }
async function ref(root, path, kind, label, expected) { const candidate = inside(root, path); const info = await lstat(candidate); if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) fail(`${label} is not a regular file.`); const bytes = await readFile(candidate); const value = { kind, path, byte_length: bytes.length, sha256: sha(bytes) }; if (expected && jcs(expected) !== jcs(value)) fail(`${label} ref differs from evidence bytes.`); return value; }
async function json(root, reference, label) { const value = await ref(root, reference.path, reference.kind, label, reference); try { return JSON.parse((await readFile(inside(root, value.path))).toString('utf8')); } catch { fail(`${label} is not JSON.`); } }
function parse(argv) { if (!Array.isArray(argv) || argv.length !== 6) fail('Recovery verifier arguments are invalid.'); const result = new Map(); for (let i = 0; i < argv.length; i += 2) { const name = argv[i]?.replace(/^--/, ''); if (!['evidence-root', 'manifest', 'gate-fixture'].includes(name) || result.has(name) || !argv[i + 1] || argv[i].includes('=')) fail('Recovery verifier arguments are invalid.'); result.set(name, argv[i + 1]); } return result; }
async function directory(path, label) { const info = await lstat(path); if (info.isSymbolicLink() || !info.isDirectory()) fail(`${label} is not a directory.`); }
function inside(root, path) { if (typeof path !== 'string' || path.startsWith('/') || path.split('/').some(part => !part || part === '..')) fail('Evidence path is invalid.'); const result = resolve(root, path); if (!result.startsWith(`${resolve(root)}${sep}`)) fail('Evidence path escapes root.'); return result; }
function sameIdentity(left, right) { return left?.kind === right?.kind && left?.byte_length === right?.byte_length && left?.sha256 === right?.sha256; }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function fail(message) { throw new RecoveryManifestVerifierError(message); }
if (import.meta.url === new URL(process.argv[1], 'file:').href) main().then(() => console.log('Recovery Manifest/Gate Fixture is valid.')).catch(error => { console.error(`${error.code}: ${error.message}`); process.exitCode = error.exitCode; });
