import assert from 'node:assert/strict';
import { link, lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { buildCommonVisualFixtures } from './build-canvas06-common-visual-fixtures.mjs';

const root = resolve('.');
const builder = resolve('scripts/build-canvas06-common-visual-fixtures.mjs');
const verifier = resolve('scripts/verify-canvas06-common-visual-fixtures.mjs');
const handoff = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/dev-canvas-05-handoff.json');

test('Common Visual builder publishes and verifies the exact 43-file root', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'opm-common-visual-'));
  const fixtureRoot = resolve(temporary, 'fixtures');
  try {
    const built = run(builder, ['--handoff', handoff, '--fixture-root', fixtureRoot, '--source-date-epoch', '1782864000']);
    assert.equal(built.status, 0, built.stderr);
    const catalog = JSON.parse(await readFile(resolve(fixtureRoot, 'dev-canvas-06-common-fixture-catalog.json'), 'utf8'));
    assert.equal(catalog.catalog_version, '0.2.0');
    assert.equal(catalog.visual_subjects.length, 8);
    assert.equal(catalog.e2e_cases.length, 16);
    const files = await fileCount(fixtureRoot);
    assert.equal(files, 43);
    const verified = run(verifier, ['--handoff', handoff, '--fixture-root', fixtureRoot, '--catalog', 'dev-canvas-06-common-fixture-catalog.json']);
    assert.equal(verified.status, 0, verified.stderr);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('Common Visual verifier rejects a single E2E byte change', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'opm-common-visual-'));
  const fixtureRoot = resolve(temporary, 'fixtures');
  try {
    assert.equal(run(builder, ['--handoff', handoff, '--fixture-root', fixtureRoot, '--source-date-epoch', '1782864000']).status, 0);
    const target = resolve(fixtureRoot, 'e2e/E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES.base.json');
    await writeFile(target, `${await readFile(target, 'utf8')} `);
    const verified = run(verifier, ['--handoff', handoff, '--fixture-root', fixtureRoot, '--catalog', 'dev-canvas-06-common-fixture-catalog.json']);
    assert.equal(verified.status, 2);
    assert.match(verified.stderr, /GOLDEN_COMMON_FIXTURE_REF_MISMATCH/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('Common Visual verifier derives Ambiguous action semantics from the static factory', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'opm-common-visual-'));
  const fixtureRoot = resolve(temporary, 'fixtures');
  try {
    assert.equal(run(builder, ['--handoff', handoff, '--fixture-root', fixtureRoot, '--source-date-epoch', '1782864000']).status, 0);
    const catalogPath = resolve(fixtureRoot, 'dev-canvas-06-common-fixture-catalog.json');
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
    const ambiguous = catalog.e2e_cases.find(item => item.case_id === 'E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED');
    assert.equal(Object.hasOwn(ambiguous.actions[0], 'expected_error_code'), false);
    ambiguous.actions[0].expected_error_code = 'DOMAIN_REJECTED';
    await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
    const verified = run(verifier, ['--handoff', handoff, '--fixture-root', fixtureRoot, '--catalog', 'dev-canvas-06-common-fixture-catalog.json']);
    assert.equal(verified.status, 2);
    assert.match(verified.stderr, /GOLDEN_COMMON_FIXTURE_REF_MISMATCH/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('Common Visual verifier rejects a factory source mirror that differs from its static import owner', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'opm-common-visual-'));
  const fixtureRoot = resolve(temporary, 'fixtures');
  try {
    assert.equal(run(builder, ['--handoff', handoff, '--fixture-root', fixtureRoot, '--source-date-epoch', '1782864000']).status, 0);
    const mirror = resolve(fixtureRoot, 'sources/tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs');
    await writeFile(mirror, `${await readFile(mirror, 'utf8')}\n`);
    const verified = run(verifier, ['--handoff', handoff, '--fixture-root', fixtureRoot, '--catalog', 'dev-canvas-06-common-fixture-catalog.json']);
    assert.equal(verified.status, 2);
    assert.match(verified.stderr, /GOLDEN_COMMON_FIXTURE_REF_MISMATCH/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('Common Visual verifier rejects an extra file and symbolic fixture file', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'opm-common-visual-'));
  const fixtureRoot = resolve(temporary, 'fixtures');
  try {
    assert.equal(run(builder, ['--handoff', handoff, '--fixture-root', fixtureRoot, '--source-date-epoch', '1782864000']).status, 0);
    await writeFile(resolve(fixtureRoot, 'extra.json'), '{}\n');
    let verified = run(verifier, ['--handoff', handoff, '--fixture-root', fixtureRoot, '--catalog', 'dev-canvas-06-common-fixture-catalog.json']);
    assert.equal(verified.status, 2);
    await rm(resolve(fixtureRoot, 'extra.json'));
    const target = resolve(fixtureRoot, 'e2e/E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES.base.json');
    const source = resolve(fixtureRoot, 'e2e/E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES.input.json');
    await rm(target);
    await symlink(source, target);
    verified = run(verifier, ['--handoff', handoff, '--fixture-root', fixtureRoot, '--catalog', 'dev-canvas-06-common-fixture-catalog.json']);
    assert.equal(verified.status, 2);
    assert.match(verified.stderr, /GOLDEN_COMMON_FIXTURE_REF_MISMATCH/);
    await rm(target);
    await link(source, target);
    verified = run(verifier, ['--handoff', handoff, '--fixture-root', fixtureRoot, '--catalog', 'dev-canvas-06-common-fixture-catalog.json']);
    assert.equal(verified.status, 2);
    assert.match(verified.stderr, /GOLDEN_COMMON_FIXTURE_REF_MISMATCH/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('Common Visual builder rejects a pre-existing staging residual', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'opm-common-visual-'));
  const fixtureRoot = resolve(temporary, 'fixtures');
  const residual = `${fixtureRoot}.staging-abandoned`;
  try {
    await writeFile(residual, 'residual');
    const built = run(builder, ['--handoff', handoff, '--fixture-root', fixtureRoot, '--source-date-epoch', '1782864000']);
    assert.equal(built.status, 2);
    assert.match(built.stderr, /GOLDEN_COMMON_INPUT_INVALID/);
    assert.equal(await exists(fixtureRoot), false);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('Common Visual builder clears staging when a pre-rename operation fails', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'opm-common-visual-'));
  const fixtureRoot = resolve(temporary, 'fixtures');
  try {
    await assert.rejects(
      buildCommonVisualFixtures({ handoffPath: handoff, target: fixtureRoot, epoch: 1782864000 }, { verifyStaging: () => { throw new Error('injected staging failure'); } }),
      /injected staging failure/
    );
    assert.equal(await exists(fixtureRoot), false);
    assert.equal(await exists(`${fixtureRoot}.staging-${process.pid}`), false);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('Common Visual builder isolates a renamed root when parent fsync fails', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'opm-common-visual-'));
  const fixtureRoot = resolve(temporary, 'fixtures');
  const quarantine = `${fixtureRoot}.quarantine-${process.pid}`;
  try {
    await assert.rejects(
      buildCommonVisualFixtures({ handoffPath: handoff, target: fixtureRoot, epoch: 1782864000 }, { fsyncParent: () => { throw new Error('injected parent fsync failure'); } }),
      error => error.code === 'GOLDEN_COMMON_INTERNAL_ERROR'
    );
    assert.equal(await exists(fixtureRoot), false);
    assert.equal(await exists(quarantine), true);
    const retry = run(builder, ['--handoff', handoff, '--fixture-root', fixtureRoot, '--source-date-epoch', '1782864000']);
    assert.equal(retry.status, 2);
    assert.match(retry.stderr, /GOLDEN_COMMON_INPUT_INVALID/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('Common Visual builder permits a fresh output root whose parent does not exist', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'opm-common-visual-'));
  const fixtureRoot = resolve(temporary, 'fresh-parent', 'fixtures');
  try {
    const built = run(builder, ['--handoff', handoff, '--fixture-root', fixtureRoot, '--source-date-epoch', '1782864000']);
    assert.equal(built.status, 0, built.stderr);
    assert.equal(await fileCount(fixtureRoot), 43);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('Common Visual scripts have one static Common E2E factory call site each', async () => {
  const [builderSource, verifierSource] = await Promise.all([readFile(builder, 'utf8'), readFile(verifier, 'utf8')]);
  for (const source of [builderSource, verifierSource]) {
    assert.match(source, /from '..\/tests\/e2e\/release\/dev-canvas-06\/fixtures\/factories\/common-fixture-factory\.mjs'/);
    assert.equal([...source.matchAll(/e2eFixture\(caseId\)/g)].length, 1);
  }
  assert.doesNotMatch(verifierSource, /expectedE2e|AMBIGUOUS\||STALE\||errorCode/);
});

test('Common Visual builder is deterministic and never overwrites an output root', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'opm-common-visual-'));
  const first = resolve(temporary, 'first'); const second = resolve(temporary, 'second');
  try {
    assert.equal(run(builder, ['--handoff', handoff, '--fixture-root', first, '--source-date-epoch', '1782864000']).status, 0);
    assert.equal(run(builder, ['--handoff', handoff, '--fixture-root', second, '--source-date-epoch', '1782864000']).status, 0);
    assert.deepEqual(await tree(first), await tree(second));
    const overwrite = run(builder, ['--handoff', handoff, '--fixture-root', first, '--source-date-epoch', '1782864000']);
    assert.equal(overwrite.status, 2);
    assert.match(overwrite.stderr, /GOLDEN_COMMON_INPUT_INVALID/);
    assert.equal(await exists(`${first}.staging-${overwrite.pid}`), false);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

function run(script, args) { return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' }); }
async function fileCount(rootPath) { const result = spawnSync('find', [rootPath, '-type', 'f'], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim().split('\n').filter(Boolean).length; }
async function tree(base) { const files = []; async function walk(path) { for (const entry of await readdir(path, { withFileTypes: true })) { const child = resolve(path, entry.name); if (entry.isDirectory()) await walk(child); else files.push({ path: child.slice(`${base}/`.length), bytes: await readFile(child, 'utf8') }); } } await walk(base); return files.sort((left, right) => left.path.localeCompare(right.path)); }
async function exists(path) { try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
