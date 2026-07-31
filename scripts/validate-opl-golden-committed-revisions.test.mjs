import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertValidCommittedRevision, createRevisionValidator } from './validate-opl-golden-committed-revisions.mjs';

const fixturePath = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/fixtures/g-opl-proc-001-consumption-object-pass.json');

test('committed revision validator rejects a candidate that lacks committed-only fields', async () => {
  const document = JSON.parse(await readFile(fixturePath, 'utf8'));
  const validate = createRevisionValidator();

  assert.throws(() => assertValidCommittedRevision(validate, document, 'candidate'),
    /REPLAY_COMMIT_STATE_MISMATCH/);
});
