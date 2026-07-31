import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const [manifestPath, ...options] = process.argv.slice(2);
if (!manifestPath) throw new Error('Usage: node scripts/validate-opl-golden-manifest.mjs <manifest.json>');

const schema = await readJson(resolve('docs/contracts/schemas/opm-opl-golden-manifest.schema.json'));
const coverageCatalogSchema = await readJson(resolve('docs/contracts/schemas/opm-opl-coverage-catalog.schema.json'));
const coverageReportSchema = await readJson(resolve('docs/contracts/schemas/opm-opl-golden-coverage-report.schema.json'));
const revisionSchemaV01 = await readJson(resolve('docs/contracts/schemas/opm-revision.schema.json'));
const revisionSchemaV02 = await readJson(resolve('docs/contracts/schemas/opm-revision-v0.2.schema.json'));
const candidateRevisionSchema = await readJson(resolve('docs/contracts/schemas/opm-opl-golden-candidate-revision.schema.json'));
const absoluteManifestPath = resolve(manifestPath);
const manifestBytes = await readFile(absoluteManifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(revisionSchemaV01);
ajv.addSchema(revisionSchemaV02);
const validateCandidateRevision = ajv.compile(candidateRevisionSchema);
const validateBaseRevisionV01 = ajv.getSchema(revisionSchemaV01.$id);
const validateBaseRevisionV02 = ajv.getSchema(revisionSchemaV02.$id);
const validateManifest = ajv.compile(schema);
const validateCoverageCatalog = ajv.compile(coverageCatalogSchema);
const validateCoverageReport = ajv.compile(coverageReportSchema);
if (!validateManifest(manifest)) fail('GOLDEN_SCHEMA_INVALID', `manifest schema validation failed: ${JSON.stringify(validateManifest.errors)}`);

const caseIds = new Set();
const atomicCaseIds = new Set();
const coverageKeys = new Set();
const coveredMainIds = new Set();
const profileRoot = resolve(dirname(absoluteManifestPath), '..');
const profile = await readJson(resolve(profileRoot, 'profile.json'));
const fixturePaths = new Map();

for (const goldenCase of manifest.cases) {
  validateCaseIdentity(goldenCase, caseIds, coverageKeys, coveredMainIds);
  fixturePaths.set(goldenCase.case_id, {
    base: resolveProfilePath(profileRoot, goldenCase.base_revision_fixture),
    candidate: resolveProfilePath(profileRoot, goldenCase.input_revision_fixture)
  });
}

for (const atomicCase of manifest.atomic_cases) {
  validateAtomicCaseIdentity(atomicCase, atomicCaseIds);
}

const assetMetadata = await loadProfileAssets(profileRoot, profile);

for (const goldenCase of manifest.cases) {
  assertAssetReference(goldenCase.case_id, 'profile_ref', goldenCase.profile_ref, assetMetadata.get('profile'));
  assertAssetReference(goldenCase.case_id, 'rule_set_ref', goldenCase.rule_set_ref, assetMetadata.get('rule_set'));
  assertAssetReference(goldenCase.case_id, 'grammar_ref', goldenCase.grammar_ref, assetMetadata.get('grammar'));
  assertAssetReference(goldenCase.case_id, 'symbol_catalog_ref', goldenCase.symbol_catalog_ref, assetMetadata.get('symbol_catalog'));
  assertAssetReference(goldenCase.case_id, 'normalization_adapter_ref', goldenCase.normalization_adapter_ref, assetMetadata.get('normalization_adapter'));
  assertProfileDependencies(profile, assetMetadata);
  assertBindingDigest(goldenCase);

  const { base: baseFixturePath, candidate: fixturePath } = fixturePaths.get(goldenCase.case_id);
  await requireFile(baseFixturePath, `Golden base fixture is missing: ${goldenCase.case_id}`);
  await requireFile(fixturePath, `Golden candidate fixture is missing: ${goldenCase.case_id}`);
  const baseFixture = await readJson(baseFixturePath);
  const fixture = await readJson(fixturePath);
  const validateBaseRevision = baseFixture.schema_version === '0.1' ? validateBaseRevisionV01 : validateBaseRevisionV02;
  if (!validateBaseRevision || !validateBaseRevision(baseFixture) || !validateCandidateRevision(fixture)) {
    fail('GOLDEN_FIXTURE_SCHEMA_INVALID', `revision fixture schema validation failed: ${goldenCase.case_id}`);
  }
  assertCandidateParent(baseFixture, fixture, goldenCase.case_id);
  assertFixtureBinding(goldenCase, baseFixture);
  assertFixtureBinding(goldenCase, fixture);
  if (goldenCase.expectation === 'PASS') {
    assertFactAndProjection(goldenCase, fixture, profile);
    assertPassClosure(goldenCase);
  }
}

for (const atomicCase of manifest.atomic_cases) {
  assertAssetReference(atomicCase.case_id, 'profile_ref', atomicCase.profile_ref, assetMetadata.get('profile'));
  assertAssetReference(atomicCase.case_id, 'rule_set_ref', atomicCase.rule_set_ref, assetMetadata.get('rule_set'));
  assertAssetReference(atomicCase.case_id, 'grammar_ref', atomicCase.grammar_ref, assetMetadata.get('grammar'));
  assertAssetReference(atomicCase.case_id, 'symbol_catalog_ref', atomicCase.symbol_catalog_ref, assetMetadata.get('symbol_catalog'));
  assertAssetReference(atomicCase.case_id, 'normalization_adapter_ref', atomicCase.normalization_adapter_ref, assetMetadata.get('normalization_adapter'));
  assertBindingDigest(atomicCase);
  const baseFixturePath = resolveProfilePath(profileRoot, atomicCase.base_revision_fixture);
  const fixturePath = resolveProfilePath(profileRoot, atomicCase.input_revision_fixture);
  await requireFile(baseFixturePath, `Atomic Golden base fixture is missing: ${atomicCase.case_id}`);
  await requireFile(fixturePath, `Atomic Golden candidate fixture is missing: ${atomicCase.case_id}`);
  const baseFixture = await readJson(baseFixturePath);
  const fixture = await readJson(fixturePath);
  const validateBaseRevision = baseFixture.schema_version === '0.1' ? validateBaseRevisionV01 : validateBaseRevisionV02;
  if (!validateBaseRevision || !validateBaseRevision(baseFixture) || !validateCandidateRevision(fixture)) {
    fail('GOLDEN_FIXTURE_SCHEMA_INVALID', `Atomic revision fixture schema validation failed: ${atomicCase.case_id}`);
  }
  assertCandidateParent(baseFixture, fixture, atomicCase.case_id);
  assertFixtureBinding(atomicCase, baseFixture);
  assertFixtureBinding(atomicCase, fixture);
}

if (options.includes('--coverage')) {
  try {
    const coverage = await validateCoverage(profileRoot, manifest, manifestBytes, validateCoverageCatalog);
    await writeCoverageReport(coverage, validateCoverageReport);
    if (coverage.status === 'BLOCKED') {
      const code = coverage.unexpected.length > 0 ? 'GOLDEN_COVERAGE_UNEXPECTED'
        : coverage.missing.length > 0 ? 'GOLDEN_COVERAGE_MISSING'
          : 'GOLDEN_COVERAGE_MISMATCH';
      console.error(`${code}: manifest does not exactly match the coverage catalog`);
      process.exitCode = 3;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

console.log(`OPL golden manifest is structurally valid: ${manifest.cases.length} cases.`);

function validateCaseIdentity(goldenCase, caseIds, coverageKeys, coveredMainIds) {
  if (!caseIds.add(goldenCase.case_id)) fail('GOLDEN_CASE_CONFLICT', `duplicate case_id: ${goldenCase.case_id}`);
  const [, family, ordinal, variant, expectation] = /^G-OPL-(PROC|CTRL|STRUCT)-(\d{3})\.([A-Z][A-Z0-9_]*)\.(PASS|BLOCKED)$/.exec(goldenCase.case_id);
  if (variant !== goldenCase.variant_key || expectation !== goldenCase.expectation) fail('GOLDEN_CASE_CONFLICT', `case_id and payload disagree: ${goldenCase.case_id}`);
  if (!goldenCase.capability_id.endsWith(`-${ordinal}`)) fail('GOLDEN_CASE_CONFLICT', `case capability does not match its main ID: ${goldenCase.case_id}`);
  coveredMainIds.add(`${family}-${ordinal}`);
  const coverageKey = `${family}:${goldenCase.capability_id}:${goldenCase.base_fact_capability_id ?? '-'}:${goldenCase.variant_key}:${goldenCase.expectation}`;
  if (!coverageKeys.add(coverageKey)) fail('GOLDEN_CASE_CONFLICT', `duplicate coverage key: ${coverageKey}`);
}

function atomicRequirements() { return [
  ['PRODUCTION', 'PRODUCTION_IDENTITY', null, 'UNKNOWN_PRODUCTION', false, 'TEXT_PRODUCTION_IDENTITY_INVALID'],
  ['PRODUCTION', 'PRODUCTION_PLAN', null, 'EXHIBITION_RHS_MISSING', false, 'TEXT_PLAN_UNSUPPORTED'],
  ['PRODUCTION', 'PRODUCTION_PLAN', null, 'EXHIBITION_INCOMPLETE', false, 'TEXT_PLAN_UNSUPPORTED'],
  ['PROFILE_ASSEMBLY', 'ASSET_PRESENCE', 'RULE_SET', 'ASSET_MISSING_RULE', false, 'PROFILE_ASSET_MISSING'],
  ['PROFILE_ASSEMBLY', 'ASSET_PRESENCE', 'SYMBOL_ASSET', 'ASSET_MISSING_SYMBOL', false, 'PROFILE_ASSET_MISSING'],
  ['PROFILE_ASSEMBLY', 'ASSET_PRESENCE', 'GRAMMAR_ASSET', 'ASSET_MISSING_GRAMMAR', false, 'PROFILE_ASSET_MISSING'],
  ['PROFILE_ASSEMBLY', 'ASSET_PRESENCE', 'NORMALIZATION_DATA', 'ASSET_MISSING_NORMALIZATION', false, 'PROFILE_ASSET_MISSING'],
  ['PROFILE_ASSEMBLY', 'ASSET_BYTES', 'RULE_SET', 'ASSET_DIGEST_MISMATCH_RULE', false, 'PROFILE_ASSET_DIGEST_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'ASSET_BYTES', 'SYMBOL_ASSET', 'ASSET_DIGEST_MISMATCH_SYMBOL', false, 'PROFILE_ASSET_DIGEST_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'ASSET_BYTES', 'GRAMMAR_ASSET', 'ASSET_DIGEST_MISMATCH_GRAMMAR', false, 'PROFILE_ASSET_DIGEST_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'ASSET_BYTES', 'NORMALIZATION_DATA', 'ASSET_DIGEST_MISMATCH_NORMALIZATION', false, 'PROFILE_ASSET_DIGEST_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'ASSET_IDENTITY', 'RULE_SET', 'ASSET_IDENTITY_MISMATCH_RULE', true, 'PROFILE_ASSET_IDENTITY_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'ASSET_IDENTITY', 'SYMBOL_ASSET', 'ASSET_IDENTITY_MISMATCH_SYMBOL', true, 'PROFILE_ASSET_IDENTITY_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'ASSET_IDENTITY', 'GRAMMAR_ASSET', 'ASSET_IDENTITY_MISMATCH_GRAMMAR', true, 'PROFILE_ASSET_IDENTITY_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'ASSET_IDENTITY', 'NORMALIZATION_DATA', 'ASSET_IDENTITY_MISMATCH_NORMALIZATION', true, 'PROFILE_ASSET_IDENTITY_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'CAPABILITY_BINDING', 'RULE_SET', 'BOUND_RULE_MISSING', true, 'PROFILE_CAPABILITY_BINDING_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'CAPABILITY_BINDING', 'SYMBOL_ASSET', 'BOUND_SYMBOL_MISSING', true, 'PROFILE_CAPABILITY_BINDING_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'REVISION_BINDING', null, 'REVISION_BINDING_MISMATCH', false, 'PROFILE_REVISION_BINDING_MISMATCH'],
  ['PROFILE_ASSEMBLY', 'BINDING_DIGEST', null, 'BINDING_DIGEST_MISMATCH', false, 'PROFILE_BINDING_DIGEST_MISMATCH']
]; }

function validateAtomicCaseIdentity(atomicCase, atomicCaseIds) {
  if (!atomicCaseIds.add(atomicCase.case_id) || caseIds.has(atomicCase.case_id)) {
    fail('GOLDEN_ATOMIC_CONFLICT', `duplicate Atomic case_id: ${atomicCase.case_id}`);
  }
  const index = atomicCaseIds.size - 1;
  const [category, stage, role, mutation, recomputeDigests, errorCode] = atomicRequirements()[index] ?? [];
  const expectedId = `G-OPL-ATOMIC-${String(index + 1).padStart(3, '0')}.${mutation}.BLOCKED`;
  if (atomicCase.case_id !== expectedId || atomicCase.category !== category || atomicCase.fault.stage !== stage
      || atomicCase.fault.mutation !== mutation || atomicCase.fault.recompute_digests !== recomputeDigests
      || (atomicCase.fault.role ?? null) !== role || atomicCase.expected_error_code !== errorCode
      || atomicCase.expected_commit_code !== 'TEXT_GENERATION_BLOCKED') {
    fail('GOLDEN_ATOMIC_CONFLICT', `Atomic case does not match its frozen matrix: ${atomicCase.case_id}`);
  }
}

async function loadProfileAssets(profileRoot, profile) {
  const manifest = profile.manifest;
  if (!manifest?.package_digest?.digest || !Array.isArray(manifest.entries)) {
    fail('GOLDEN_ASSET_DIGEST_MISMATCH', 'Profile manifest is invalid');
  }
  const requiredEntries = new Map();
  for (const entry of manifest.entries.filter((item) => item.required)) {
    if (requiredEntries.has(entry.role)) fail('GOLDEN_ASSET_DIGEST_MISMATCH', `Profile manifest duplicates role: ${entry.role}`);
    const path = resolveProfilePath(profileRoot, entry.logical_path);
    const bytes = await readFile(path);
    if (bytes.length !== entry.byte_length || createHash('sha256').update(bytes).digest('hex') !== entry.digest?.digest) {
      fail('GOLDEN_ASSET_DIGEST_MISMATCH', `Profile manifest entry digest mismatch: ${entry.role}`);
    }
    requiredEntries.set(entry.role, { entry, path, value: JSON.parse(bytes.toString('utf8')) });
  }
  const packageDigest = createHash('sha256').update([...requiredEntries.values()]
    .sort((left, right) => left.entry.logical_path.localeCompare(right.entry.logical_path))
    .map(({ entry }) => `${entry.logical_path}\n${entry.byte_length}\n${entry.digest.digest}\n`).join(''), 'utf8').digest('hex');
  if (packageDigest !== manifest.package_digest.digest) fail('GOLDEN_ASSET_DIGEST_MISMATCH', 'Profile package digest mismatch');

  const definitions = [
    ['RULE_SET', 'rule_set', 'rule_set_id', 'rule_set_version', null],
    ['SYMBOL_ASSET', 'symbol_catalog', 'asset_id', 'asset_version', 'symbol_catalog_ref'],
    ['GRAMMAR_ASSET', 'grammar', 'asset_id', 'asset_version', 'text_grammar_ref'],
    ['NORMALIZATION_DATA', 'normalization_adapter', 'asset_id', 'asset_version', 'normalization_adapter_ref']
  ];
  const metadata = new Map([['profile', {
    path: resolve(profileRoot, 'profile.json'),
    id: profile.identity?.profile_id,
    version: profile.identity?.package_version,
    digest: manifest.package_digest.digest
  }]]);
  for (const [role, key, idField, versionField, directRefField] of definitions) {
    const asset = requiredEntries.get(role);
    if (!asset) fail('GOLDEN_ASSET_DIGEST_MISMATCH', `Profile manifest required asset is missing: ${role}`);
    const digest = asset.entry.digest.digest;
    metadata.set(key, { path: asset.path, id: asset.value[idField], version: asset.value[versionField], digest });
  }
  return metadata;
}

function assertProfileDependencies(profile, metadata) {
  const dependencies = new Map((profile.dependencies ?? []).filter((item) => item.required).map((item) => [item.role, item.asset]));
  for (const [role, key, directRefField] of [
    ['RULE_SET', 'rule_set', null],
    ['SYMBOL_ASSET', 'symbol_catalog', 'symbol_catalog_ref'],
    ['GRAMMAR_ASSET', 'grammar', 'text_grammar_ref'],
    ['NORMALIZATION_DATA', 'normalization_adapter', 'normalization_adapter_ref']
  ]) {
    const dependency = dependencies.get(role);
    const asset = metadata.get(key);
    if (!dependency || dependency.id !== asset.id || dependency.version !== asset.version || dependency.digest?.digest !== asset.digest) {
      fail('GOLDEN_PROFILE_DEPENDENCY_MISMATCH', `Profile dependency does not match manifest entry: ${role}`);
    }
    if (directRefField) {
      const directRef = profile[directRefField];
      if (!directRef || directRef.id !== dependency.id || directRef.version !== dependency.version || directRef.digest?.digest !== dependency.digest.digest) {
        fail('GOLDEN_PROFILE_DEPENDENCY_MISMATCH', `Profile direct asset ref does not match dependency: ${role}`);
      }
    }
  }
}

function resolveProfilePath(profileRoot, logicalPath) {
  if (typeof logicalPath !== 'string' || logicalPath.length === 0) fail('GOLDEN_ASSET_PATH_INVALID', 'Profile manifest asset path is invalid');
  const path = resolve(profileRoot, logicalPath);
  if (!path.startsWith(`${profileRoot}/`)) fail('GOLDEN_ASSET_PATH_INVALID', `Profile manifest asset path escapes package: ${logicalPath}`);
  return path;
}

function assertAssetReference(caseId, field, reference, metadata) {
  if (reference.id !== metadata.id || reference.version !== metadata.version) fail('GOLDEN_ASSET_IDENTITY_MISMATCH', `${field} does not match installed asset for ${caseId}`);
  if (reference.sha256 !== metadata.digest) fail('GOLDEN_ASSET_DIGEST_MISMATCH', `${field} digest does not match installed asset for ${caseId}`);
}

function assertBindingDigest(goldenCase) {
  const expected = createHash('sha256').update([
    ['PROFILE', goldenCase.profile_ref],
    ['RULE_SET', goldenCase.rule_set_ref],
    ['GRAMMAR_ASSET', goldenCase.grammar_ref],
    ['SYMBOL_ASSET', goldenCase.symbol_catalog_ref],
    ['NORMALIZATION_DATA', goldenCase.normalization_adapter_ref]
  ].map(([role, reference]) => `${role}\t${reference.id}\t${reference.version}\t${reference.sha256}\n`).join(''), 'utf8').digest('hex');
  if (expected !== goldenCase.binding_digest) fail('GOLDEN_BINDING_DIGEST_MISMATCH', `binding digest is invalid: ${goldenCase.case_id}`);
}

function assertFixtureBinding(goldenCase, fixture) {
  const binding = fixture.profile_binding;
  for (const [fixtureField, manifestField] of [
    ['profile', 'profile_ref'], ['rule_set', 'rule_set_ref'], ['text_grammar', 'grammar_ref'],
    ['symbol_catalog', 'symbol_catalog_ref'], ['normalization_adapter', 'normalization_adapter_ref']
  ]) {
    const reference = binding[fixtureField];
    const expected = goldenCase[manifestField];
    if (reference.id !== expected.id || reference.version !== expected.version || reference.digest.digest !== expected.sha256) {
      fail('GOLDEN_FIXTURE_SCHEMA_INVALID', `${fixtureField} binding does not match golden manifest: ${goldenCase.case_id}`);
    }
  }
  if (binding.binding_digest.digest !== goldenCase.binding_digest) fail('GOLDEN_FIXTURE_SCHEMA_INVALID', `binding digest does not match golden manifest: ${goldenCase.case_id}`);
}

function assertCandidateParent(base, candidate, caseId) {
  if (base.model_id !== candidate.model_id || candidate.revision_sequence !== base.revision_sequence + 1
      || candidate.revision_id === base.revision_id || candidate.parent_revision_id !== base.revision_id) {
    fail('GOLDEN_FIXTURE_SCHEMA_INVALID', `base and candidate revision relationship is invalid: ${caseId}`);
  }
}

function assertFactAndProjection(goldenCase, fixture, profile) {
  const expected = goldenCase.expected_normalized_fact;
  const fact = fixture.facts.find((item) => item.fact_id === expected.fact_id);
  const factCapabilityId = goldenCase.base_fact_capability_id ?? goldenCase.capability_id;
  if (!fact || fact.capability_ref.capability_id !== factCapabilityId || fact.capability_ref.capability_id !== expected.capability_ref.capability_id) {
    fail('GOLDEN_FIXTURE_SCHEMA_INVALID', `normalized Fact capability is invalid: ${goldenCase.case_id}`);
  }
  if (JSON.stringify(fact) !== JSON.stringify(expected)) fail('GOLDEN_FIXTURE_SCHEMA_INVALID', `normalized Fact does not match fixture: ${goldenCase.case_id}`);
  const capability = profile.capability_catalog.find((item) => item.capability_id === goldenCase.capability_id);
  if (!capability || capability.symbol_ref !== goldenCase.expected_projection.symbol_id) fail('GOLDEN_FIXTURE_SCHEMA_INVALID', `projection symbol does not match Profile: ${goldenCase.case_id}`);
}

function assertPassClosure(goldenCase) {
  for (const sentence of goldenCase.expected_sentences) {
    if (sentence.trace.sentence_ids.length !== 1 || sentence.trace.sentence_ids[0] !== sentence.sentence_id) fail('GOLDEN_CASE_CONFLICT', `Trace must close exactly one Sentence: ${goldenCase.case_id}`);
    if (!sentence.trace.fact_ids.every((id) => sentence.input_fact_ids.includes(id))) fail('GOLDEN_CASE_CONFLICT', `Trace Fact is not closed by Sentence: ${goldenCase.case_id}`);
    const bytes = Buffer.byteLength(sentence.utf8_text, 'utf8');
    let nextStart = 0;
    let text = '';
    sentence.tokens.forEach((token, ordinal) => {
      if (token.sentence_id !== sentence.sentence_id || token.ordinal !== ordinal || token.start_utf8_byte !== nextStart || token.end_utf8_byte <= nextStart) {
        fail('GOLDEN_CASE_CONFLICT', `Token ordering or UTF-8 range is invalid: ${goldenCase.case_id}`);
      }
      if (!token.source_refs.every((sourceRef) => sentence.trace.source_refs.some((traceRef) => JSON.stringify(traceRef) === JSON.stringify(sourceRef)))) {
        fail('GOLDEN_CASE_CONFLICT', `Token source ref is not closed: ${goldenCase.case_id}`);
      }
      nextStart = token.end_utf8_byte;
      text += token.text;
    });
    if (nextStart !== bytes || text !== sentence.utf8_text) fail('GOLDEN_CASE_CONFLICT', `Tokens do not fully reconstruct Sentence: ${goldenCase.case_id}`);
    for (const range of sentence.trace.token_ranges) {
      if (range.end_utf8_byte > bytes || range.start_utf8_byte >= range.end_utf8_byte) fail('GOLDEN_CASE_CONFLICT', `Trace range is invalid: ${goldenCase.case_id}`);
    }
    const kinds = new Set(sentence.trace.source_refs.map((ref) => ref.source_kind));
    for (const requiredKind of ['FACT', 'OCCURRENCE', 'TEMPLATE', 'GRAMMAR', 'RULE']) {
      if (!kinds.has(requiredKind)) fail('GOLDEN_CASE_CONFLICT', `Trace is missing ${requiredKind}: ${goldenCase.case_id}`);
    }
  }
}

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function sha256(path) { return createHash('sha256').update(await readFile(path)).digest('hex'); }
async function requireFile(path, message) { try { await access(path); } catch { fail('GOLDEN_FIXTURE_SCHEMA_INVALID', message); } }
function fail(code, message) { throw new Error(`${code}: ${message}`); }

async function validateCoverage(profileRoot, manifest, manifestBytes, validateCatalog) {
  const catalogRef = manifest.coverage_catalog_ref;
  if (!catalogRef || catalogRef.id !== 'coverage.opl.iso19450.2024.draft' || catalogRef.version !== '0.1.0' || catalogRef.path !== 'golden/opm-opl-coverage-catalog.json') {
    fail('GOLDEN_COVERAGE_CATALOG_INVALID', 'coverage_catalog_ref is missing or has an invalid path');
  }
  const catalogPath = resolve(profileRoot, catalogRef.path);
  if (!catalogPath.startsWith(`${profileRoot}/`)) fail('GOLDEN_COVERAGE_CATALOG_INVALID', 'coverage catalog path escapes package');
  let catalogBytes;
  try {
    catalogBytes = await readFile(catalogPath);
  } catch {
    fail('GOLDEN_COVERAGE_CATALOG_INVALID', 'coverage catalog file is unavailable');
  }
  const catalogSha256 = createHash('sha256').update(catalogBytes).digest('hex');
  if (catalogSha256 !== catalogRef.sha256) fail('GOLDEN_COVERAGE_CATALOG_INVALID', 'coverage catalog digest does not match manifest reference');
  let catalog;
  try {
    catalog = JSON.parse(catalogBytes.toString('utf8'));
  } catch {
    fail('GOLDEN_COVERAGE_CATALOG_INVALID', 'coverage catalog is not JSON');
  }
  if (!validateCatalog(catalog)) fail('GOLDEN_COVERAGE_CATALOG_INVALID', `coverage catalog schema validation failed: ${JSON.stringify(validateCatalog.errors)}`);
  validateCoverageCatalogIntegrity(catalog);

  const expectedByKey = new Map(catalog.requirements.map((requirement) => [requirement.coverage_key, requirement]));
  const actualByKey = new Map();
  const unexpected = [];
  const mismatched = [];
  const matchedKeys = new Set();
  const families = emptyCoverageFamilies();
  for (const requirement of catalog.requirements) families[requirement.family][requirement.expectation].expected += 1;

  for (const goldenCase of manifest.cases) {
    const key = coverageKey(goldenCase);
    const requirement = expectedByKey.get(key);
    if (!requirement) {
      unexpected.push(key);
      if (families[goldenCase.case_id.slice(6, 10)]?.[goldenCase.expectation]) families[goldenCase.case_id.slice(6, 10)][goldenCase.expectation].unexpected += 1;
      continue;
    }
    if (actualByKey.has(key)) {
      mismatched.push(key);
      families[requirement.family][requirement.expectation].mismatched += 1;
      continue;
    }
    actualByKey.set(key, goldenCase);
    if (!caseMatchesRequirement(goldenCase, requirement)) {
      mismatched.push(key);
      families[requirement.family][requirement.expectation].mismatched += 1;
      continue;
    }
    matchedKeys.add(key);
    families[requirement.family][requirement.expectation].matched += 1;
  }

  const missing = catalog.requirements.filter((requirement) => !matchedKeys.has(requirement.coverage_key) && !mismatched.includes(requirement.coverage_key)).map((requirement) => requirement.coverage_key);
  for (const requirement of catalog.requirements) {
    if (missing.includes(requirement.coverage_key)) families[requirement.family][requirement.expectation].missing += 1;
  }
  const summary = sumCoverageCounts(families);
  return {
    schema_id: 'OPL-GOLDEN-COVERAGE-REPORT-001', schema_version: '0.1',
    status: missing.length === 0 && unexpected.length === 0 && mismatched.length === 0 ? 'EXACT' : 'BLOCKED',
    manifest: { id: manifest.manifest_id, version: manifest.manifest_version, sha256: createHash('sha256').update(manifestBytes).digest('hex') },
    catalog: { id: catalog.catalog_id, version: catalog.catalog_version, sha256: catalogSha256 },
    summary, families, missing, unexpected, mismatched
  };
}

function validateCoverageCatalogIntegrity(catalog) {
  const keys = new Set();
  const caseIds = new Set();
  let pass = 0;
  let blocked = 0;
  for (const requirement of catalog.requirements) {
    const expectedKey = `${requirement.family}:${requirement.capability_id}:${requirement.base_fact_capability_id ?? '-'}:${requirement.variant_key}:${requirement.expectation}`;
    const ordinal = requirement.capability_id.slice(-3);
    const expectedCaseId = `G-OPL-${requirement.family}-${ordinal}.${requirement.variant_key}.${requirement.expectation}`;
    if (!keys.add(requirement.coverage_key) || !caseIds.add(requirement.case_id) || requirement.coverage_key !== expectedKey || requirement.case_id !== expectedCaseId) {
      fail('GOLDEN_COVERAGE_CATALOG_CONFLICT', `coverage catalog requirement is duplicated or inconsistent: ${requirement.case_id}`);
    }
    if (requirement.expectation === 'PASS') pass += 1;
    else blocked += 1;
  }
  if (catalog.summary.total !== catalog.requirements.length || catalog.summary.pass !== pass || catalog.summary.blocked !== blocked || catalog.summary.total !== 178 || pass !== 130 || blocked !== 48) {
    fail('GOLDEN_COVERAGE_CATALOG_CONFLICT', 'coverage catalog summary does not match its requirement set');
  }
}

function coverageKey(goldenCase) {
  const family = /^G-OPL-(PROC|CTRL|STRUCT)-/.exec(goldenCase.case_id)?.[1];
  return `${family}:${goldenCase.capability_id}:${goldenCase.base_fact_capability_id ?? '-'}:${goldenCase.variant_key}:${goldenCase.expectation}`;
}

function caseMatchesRequirement(goldenCase, requirement) {
  if (goldenCase.case_id !== requirement.case_id || goldenCase.capability_id !== requirement.capability_id || (goldenCase.base_fact_capability_id ?? null) !== (requirement.base_fact_capability_id ?? null)) return false;
  if (goldenCase.expectation === 'BLOCKED') return goldenCase.expected_error_code === requirement.expected_error_code;
  return sameArray(goldenCase.expected_sentences.map((sentence) => sentence.template_id), requirement.required_template_ids)
    && sameArray(goldenCase.expected_sentences.map((sentence) => sentence.sentence_slot), requirement.expected_sentence_slots);
}

function sameArray(left, right) { return left.length === right.length && left.every((value, index) => value === right[index]); }

function emptyCoverageCounts() { return { expected: 0, matched: 0, missing: 0, unexpected: 0, mismatched: 0 }; }
function emptyCoverageFamilies() { return Object.fromEntries(['PROC', 'CTRL', 'STRUCT'].map((family) => [family, { PASS: emptyCoverageCounts(), BLOCKED: emptyCoverageCounts() }])); }
function sumCoverageCounts(families) {
  const summary = emptyCoverageCounts();
  for (const family of Object.values(families)) for (const counts of Object.values(family)) for (const key of Object.keys(summary)) summary[key] += counts[key];
  return summary;
}

async function writeCoverageReport(report, validateReport) {
  if (!validateReport(report)) fail('GOLDEN_COVERAGE_CATALOG_INVALID', `coverage report schema validation failed: ${JSON.stringify(validateReport.errors)}`);
  const reportPath = resolve('services/local-runtime/target/golden-coverage/opm-opl-golden-coverage-report.json');
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
