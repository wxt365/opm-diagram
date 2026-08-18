import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { rootTreeDigest } from './canvas06-golden-verifier-controlled-support.mjs';

test('controlled tree digest is independent of creation order and records symlink text without following it', async () => {
  const left = await mkdtemp(resolve(tmpdir(), 'gfmv-tree-left-'));
  const right = await mkdtemp(resolve(tmpdir(), 'gfmv-tree-right-'));
  await mkdir(resolve(left, 'nested')); await writeFile(resolve(left, 'nested', 'b.txt'), 'b'); await writeFile(resolve(left, 'a.txt'), 'a');
  await writeFile(resolve(right, 'a.txt'), 'a'); await mkdir(resolve(right, 'nested')); await writeFile(resolve(right, 'nested', 'b.txt'), 'b');
  assert.equal(await rootTreeDigest(left), await rootTreeDigest(right));

  await symlink('a.txt', resolve(left, 'link.txt'));
  assert.notEqual(await rootTreeDigest(left), await rootTreeDigest(right));
});
