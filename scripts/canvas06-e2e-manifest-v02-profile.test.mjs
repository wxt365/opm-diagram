import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

import { loadProfileAssetClosure } from './canvas06-e2e-manifest-v02-profile.mjs';

const root = resolve('packages/profiles/profile.iso19450.2024.draft/0.2.0');

test('Profile v02 closure derives the frozen five raw refs, tree, package digest, and active binding', async () => {
  const handoff = JSON.parse(await readFile(resolve(root, 'handoff/dev-canvas-05-handoff.json'), 'utf8'));
  const assetRoot = await mkdtemp(join(tmpdir(), 'canvas06-profile-assets-'));
  for (const path of ['profile.json', 'grammar/representative-opl-grammar.json', 'normalization/representative-normalization.json', 'rules/representative-rule-set.json', 'symbols/representative-symbol-catalog.json']) {
    const target = resolve(assetRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await cp(resolve(root, path), target, { recursive: false });
  }
  const closure = await loadProfileAssetClosure({ assetRoot, activeBinding: handoff.active_binding });
  assert.deepEqual(closure.profile_asset_refs.map(item => item.kind), ['GRAMMAR_ASSET', 'NORMALIZATION_DATA', 'PROFILE_PACKAGE', 'RULE_SET', 'SYMBOL_ASSET']);
  assert.equal(closure.profile_asset_tree_ref.path, 'inputs/upstream/profile-assets');
  assert.equal(closure.active_binding.profile.sha256, handoff.active_binding.profile.sha256);
});
