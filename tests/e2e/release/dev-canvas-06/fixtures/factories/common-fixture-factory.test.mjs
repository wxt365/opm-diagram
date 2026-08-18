import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { buildCommonVisualFixture, visualSubjects } from './common-fixture-factory.mjs';
import { sha256Jcs } from '../../../../../../scripts/canvas06-rfc8785.mjs';

const root = resolve('.');
const handoff = JSON.parse(await readFile(resolve(root, 'packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/dev-canvas-05-handoff.json'), 'utf8'));
const revisionSchema = JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas/opm-revision-v0.2.schema.json'), 'utf8'));
const fixtureSchema = JSON.parse(await readFile(resolve(root, 'docs/contracts/schemas/opm-dev-canvas-06-common-visual-fixture.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
ajv.addSchema(revisionSchema);
const validate = ajv.compile(fixtureSchema);

test('Common Visual factory deterministically produces eight schema-valid fixtures', () => {
  for (const subjectId of visualSubjects) {
    const first = buildCommonVisualFixture(subjectId, handoff.active_binding, 1782864000);
    const second = buildCommonVisualFixture(subjectId, handoff.active_binding, 1782864000);
    assert.equal(validate(first), true, `${subjectId}: ${JSON.stringify(validate.errors)}`);
    assert.deepEqual(first, second, subjectId);
    const { fixture_payload_sha256, ...payload } = first;
    assert.equal(fixture_payload_sha256, sha256Jcs(payload), subjectId);
    assert.deepEqual(first.revision_document.text_artifact.sentences, [], subjectId);
    assert.deepEqual(first.revision_document.text_traces, [], subjectId);
    assert.equal(first.capture_setup.expected_rendered_cell_count, first.expected_projection.committed_cells.length + first.expected_projection.transient_cells.length, subjectId);
  }
});

test('Common Visual factory rejects an unknown subject and invalid source epoch', () => {
  assert.throws(() => buildCommonVisualFixture('UNKNOWN', handoff.active_binding, 1782864000), /Unknown visual subject/);
  assert.throws(() => buildCommonVisualFixture('STATE_ROLES', handoff.active_binding, -1), /SOURCE_DATE_EPOCH/);
});
