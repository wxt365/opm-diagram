import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runCommonVisualMaterialization } from './canvas06-common-visual-materialization.mjs';

test('03C adapter在callback缺失时不读取或创建受控输入', async () => {
  await assert.rejects(() => runCommonVisualMaterialization({}, undefined), error => {
    assert.equal(error.code, 'GOLDEN_COMMON_ADAPTER_INPUT_INVALID');
    assert.equal(error.exitCode, 2);
    return true;
  });
});

test('03C adapter拒绝历史Request且保持work root不存在', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas06-adapter-'));
  const workRoot = join(root, 'work');
  await assert.rejects(() => runCommonVisualMaterialization({ schema_id: 'OPM-DEV-CANVAS-06-COMMON-VISUAL-ADAPTER-REQUEST-001', schema_version: '0.1' }, () => ({})), error => {
    assert.equal(error.code, 'GOLDEN_COMMON_ADAPTER_INPUT_INVALID');
    return true;
  });
  await assert.rejects(() => import('node:fs/promises').then(({ lstat }) => lstat(workRoot)), { code: 'ENOENT' });
});

test('03C adapter在Java raw ref漂移时零副作用拒绝', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas06-adapter-'));
  const profile = join(root, 'profile');
  await mkdir(profile);
  const java = join(root, 'java');
  const jar = join(root, 'runtime.jar');
  const plan = join(root, 'plan.json');
  await writeFile(java, 'not-java'); await writeFile(jar, 'jar'); await writeFile(plan, '{}');
  const ref = (kind, path, bytes) => ({ kind, path, byte_length: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex') });
  const request = {
    schema_id: 'OPM-DEV-CANVAS-06-COMMON-VISUAL-ADAPTER-REQUEST-001', schema_version: '0.2', request_version: '0.2.0', request_id: 'dev-canvas-06.common-visual-adapter.test',
    plan_path: plan, plan_ref: ref('CAPTURE_PLAN', 'plan.json', '{}'), common_fixture_root: profile, java_major_version: 21,
    java_executable_ref: ref('JAVA_EXECUTABLE', java, 'different'), runtime_jar_path: jar, runtime_jar_ref: ref('RUNTIME_JAR', 'runtime.jar', 'jar'),
    profile_asset_root: profile, profile_asset_tree_ref: ref('PROFILE_ASSET_TREE', 'profile/assets', 'x'), profile_asset_refs: [], work_root: join(root, 'work'), source_date_epoch: 0
  };
  await assert.rejects(() => runCommonVisualMaterialization(request, () => ({})), error => {
    assert.equal(error.code, 'GOLDEN_COMMON_ADAPTER_INPUT_INVALID');
    return true;
  });
});
