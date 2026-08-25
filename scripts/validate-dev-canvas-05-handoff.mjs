import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

import { assertArtifactOrder, assertTreeRef } from './canvas06-unified-production-input.mjs';

const path = process.argv[2];
if (!path) throw new Error('Usage: node scripts/validate-dev-canvas-05-handoff.mjs <handoff.json>');
const handoff = JSON.parse(await readFile(resolve(path), 'utf8'));
const handoffRoot = dirname(resolve(path));
const schemaName = handoff.schema_version === '0.2' ? 'opm-dev-canvas-05-handoff-v02.schema.json' : 'opm-dev-canvas-05-handoff.schema.json';
const schema = JSON.parse(await readFile(resolve('docs/contracts/schemas', schemaName), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(schema);
if (!validate(handoff)) throw new Error(`DEV-CANVAS-05 handoff schema validation failed: ${JSON.stringify(validate.errors)}`);
if (new Set(handoff.gate_evidence.map(item => item.gate_id)).size !== 6) throw new Error('Handoff must contain exactly GATE-05-01 through GATE-05-06 once.');
if (new Set(handoff.capability_evidence.map(item => item.capability_id)).size !== 34) throw new Error('Handoff must contain 34 unique capability evidence items.');
for (const reference of references(handoff)) await verifyReference(reference);
if (handoff.handoff_status === 'READY_FOR_DEV_CANVAS_06') {
  if (handoff.source_build.dirty_before_build || handoff.gate_evidence.some(item => item.status !== 'MATCHED') || handoff.compatibility_summary.failed_count !== 0) throw new Error('READY handoff violates its release-entry guards.');
  if (handoff.schema_version === '0.2') {
    assertArtifactOrder(handoff, handoff.source_build.source_commit.slice(0, 12));
    await assertTreeRef(handoffRoot, handoff.build_artifacts[2], 'CANVAS06_UNIFIED_WEB_TREE_INVALID');
  } else if (handoff.build_artifacts.length !== 2 || !hasReleaseArtifacts(handoff.build_artifacts)) {
    throw new Error('READY handoff requires exactly LOCAL_RUNTIME_JAR and EVIDENCE_BUNDLE artifacts.');
  }
  if (handoff.capability_evidence.some(item => item.eligibility !== 'ELIGIBLE_FOR_RELEASE_VALIDATION')) throw new Error('READY handoff requires all 34 capabilities to be eligible.');
}
console.log(`DEV-CANVAS-05 handoff is valid: ${handoff.handoff_status}, ${handoff.capability_evidence.length} capabilities.`);

function references(value) {
  return [
    ...value.build_artifacts.filter(item => item.kind !== 'WEB_DIST_TREE'),
    ...value.revision_contract.schemas,
    ...value.gate_evidence.map(item => item.evidence),
    ...value.coverage_summary.evidence,
    value.compatibility_summary.evidence,
    ...value.blockers.map(item => item.evidence)
  ];
}
async function verifyReference(reference) {
  const file = resolve(handoffRoot, reference.path);
  const info = await stat(file);
  if (info.size !== reference.byte_length) throw new Error(`Handoff reference length mismatch: ${reference.path}`);
  const digest = createHash('sha256').update(await readFile(file)).digest('hex');
  if (digest !== reference.sha256) throw new Error(`Handoff reference digest mismatch: ${reference.path}`);
}
function hasReleaseArtifacts(artifacts) {
  return new Set(artifacts.map(item => item.kind)).size === 2
    && artifacts.some(item => item.kind === 'LOCAL_RUNTIME_JAR')
    && artifacts.some(item => item.kind === 'EVIDENCE_BUNDLE');
}
