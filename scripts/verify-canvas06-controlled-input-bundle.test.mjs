import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import test from 'node:test';

import { ControlledInputBundleError, verifyControlledInputBundle } from './verify-canvas06-controlled-input-bundle.mjs';

let bundleSequence = 0;

test('Visual and E2E controlled descriptors each verify and use different bundle IDs', async t => {
  const work = await testRoot(t);
  const visual = await createBundle(work, { consumer: 'VISUAL' });
  const e2e = await createBundle(work, { consumer: 'E2E' });

  const verifiedVisual = await verifyControlledInputBundle({ bundleRoot: visual.root, consumer: 'VISUAL' });
  const verifiedE2e = await verifyControlledInputBundle({ bundleRoot: e2e.root, consumer: 'E2E' });

  assert.equal(verifiedVisual.descriptor.approved_version_ref.golden_set_version, '1.2.3');
  assert.equal(verifiedE2e.descriptor.approved_version_ref, null);
  assert.notEqual(verifiedVisual.descriptor.bundle_id, verifiedE2e.descriptor.bundle_id);
});

test('controlled verifier rejects invalid consumer and Visual/E2E approved-version mode mismatch', async t => {
  const work = await testRoot(t);
  const visual = await createBundle(work, { consumer: 'VISUAL' });
  const e2e = await createBundle(work, { consumer: 'E2E' });

  await rejectsInput(() => verifyControlledInputBundle({ bundleRoot: visual.root, consumer: 'UNKNOWN' }));
  await rejectsInput(() => verifyControlledInputBundle({ bundleRoot: visual.root, consumer: 'E2E' }));
  await rejectsInput(() => verifyControlledInputBundle({ bundleRoot: e2e.root, consumer: 'VISUAL' }));
});

test('Fault Launcher consumer accepts only Bundle 0.2 with an exact descriptor ref', async t => {
  const work = await testRoot(t);
  const legacy = await createBundle(work, { consumer: 'E2E' });
  const fault = await createBundle(work, { consumer: 'FAULT_LAUNCHER' });
  await rejectsInput(() => verifyControlledInputBundle({ bundleRoot: legacy.root, consumer: 'FAULT_LAUNCHER' }));
  const verified = await verifyControlledInputBundle({ bundleRoot: fault.root, consumer: 'FAULT_LAUNCHER' });
  assert.equal(verified.descriptor.schema_version, '0.2');
  assert.equal(verified.preflight_descriptor.absolute_path, resolve(fault.root, 'fault-launcher/preflight-descriptor.json'));
});

test('controlled verifier rejects identity/basename mismatches and raw archive tampering', async t => {
  const work = await testRoot(t);
  const identityMismatch = await createBundle(work, { consumer: 'E2E', mutate: descriptor => { descriptor.bundle_identity_sha256 = digest('wrong'); } });
  await rejectsInput(() => verifyControlledInputBundle({ bundleRoot: identityMismatch.root, consumer: 'E2E' }));

  const tampered = await createBundle(work, { consumer: 'E2E' });
  await writeFile(resolve(tampered.root, tampered.descriptor.evidence_bundle_ref.path), 'changed archive');
  await rejectsInput(() => verifyControlledInputBundle({ bundleRoot: tampered.root, consumer: 'E2E' }));

  const badRoot = resolve(work, `canvas06-controlled-${digest('bad-root')}`);
  await mkdir(badRoot);
  await writeFile(resolve(badRoot, 'controlled-bundle.json'), JSON.stringify(tampered.descriptor));
  await rejectsInput(() => verifyControlledInputBundle({ bundleRoot: badRoot, consumer: 'E2E' }));
});

test('controlled verifier rejects symlink roots and raw refs', async t => {
  const work = await testRoot(t);
  const bundle = await createBundle(work, { consumer: 'E2E' });
  const rootLink = resolve(work, 'root-link');
  await symlink(bundle.root, rootLink);
  await rejectsInput(() => verifyControlledInputBundle({ bundleRoot: rootLink, consumer: 'E2E' }));

  const refPath = resolve(bundle.root, bundle.descriptor.handoff_ref.path);
  await rm(refPath);
  await symlink(resolve(bundle.root, bundle.descriptor.intake_report_ref.path), refPath);
  await rejectsInput(() => verifyControlledInputBundle({ bundleRoot: bundle.root, consumer: 'E2E' }));
});

async function createBundle(work, { consumer, mutate } = {}) {
  const bundleTag = `bundle-${bundleSequence++}`;
  const refs = {
    handoff_ref: await writeRef(work, `handoff/${bundleTag}/dev-canvas-05-handoff.json`, 'handoff'),
    intake_report_ref: await writeRef(work, `intake/${bundleTag}/intake-report.json`, 'intake'),
    evidence_bundle_ref: await writeRef(work, `evidence/${bundleTag}/dev-canvas-05.zip`, 'archive')
  };
  const approved_version_ref = consumer === 'VISUAL'
    ? {
        path: 'approved/versions/1.2.3',
        golden_set_version: '1.2.3',
        authoring_report_ref: await writeRef(work, 'approved/versions/1.2.3/authoring-report.json', 'authoring')
      }
    : null;
  const preflight_descriptor_ref = consumer === 'FAULT_LAUNCHER'
    ? { kind: 'FAULT_LAUNCHER_PREFLIGHT_DESCRIPTOR', path: 'fault-launcher/preflight-descriptor.json', byte_length: 2, sha256: digest('{}') }
    : null;
  const identity = digest(jcs({ bundle_class: 'CONTROLLED_TEST', ...refs, approved_version_ref, ...(preflight_descriptor_ref ? { preflight_descriptor_ref } : {}) }));
  const root = resolve(work, `canvas06-controlled-${identity}`);
  await mkdir(root);
  for (const ref of Object.values(refs)) await copyRef(work, root, ref);
  if (preflight_descriptor_ref) {
    await mkdir(resolve(root, 'fault-launcher'), { recursive: true });
    await writeFile(resolve(root, preflight_descriptor_ref.path), '{}');
  }
  if (approved_version_ref) await copyRef(work, root, approved_version_ref.authoring_report_ref);
  if (approved_version_ref) await mkdir(resolve(root, approved_version_ref.path), { recursive: true });
  const descriptor = {
    schema_id: 'OPM-DEV-CANVAS-06-CONTROLLED-INPUT-BUNDLE-001', schema_version: consumer === 'FAULT_LAUNCHER' ? '0.2' : '0.1', bundle_class: 'CONTROLLED_TEST',
    bundle_id: basename(root), bundle_identity_sha256: identity, ...refs, approved_version_ref, ...(preflight_descriptor_ref ? { preflight_descriptor_ref } : {})
  };
  mutate?.(descriptor);
  await writeFile(resolve(root, 'controlled-bundle.json'), JSON.stringify(descriptor));
  return { root, descriptor };
}

async function writeRef(work, path, value) {
  const target = resolve(work, 'source', path);
  await mkdir(resolve(target, '..'), { recursive: true });
  await writeFile(target, value);
  return { kind: 'TEST_REF', path, byte_length: Buffer.byteLength(value), sha256: digest(value) };
}

async function copyRef(work, root, ref) {
  const source = resolve(work, 'source', ref.path);
  const target = resolve(root, ref.path);
  await mkdir(resolve(target, '..'), { recursive: true });
  await writeFile(target, await (await import('node:fs/promises')).readFile(source));
}

async function testRoot(t) {
  const work = await mkdtemp(resolve(tmpdir(), 'opm-controlled-bundle-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  return work;
}

async function rejectsInput(action) {
  await assert.rejects(action, error => error instanceof ControlledInputBundleError && error.exitCode === 2);
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function jcs(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`;
}
