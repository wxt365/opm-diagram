import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHarness } from '../src/harness.mjs';

test('专用工具保留完整模型数据，不引导受限会话用文件工具恢复截断内容', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opm-harness-profile-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const harness = await createHarness({ dataRoot: root, baseURL: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'test-only-secret', toolOrigin: 'http://127.0.0.1:17860', toolSecret: 'test-only-tool-secret' }, 'project.test');
  t.after(() => harness.close());
  const patch = await readFile(join(root, 'workspaces/project.test/opm.patch.yml'), 'utf8');
  assert.match(patch, /- id: spill-policy\n  disabled: true/);
  assert.match(patch, /- id: tool-fs\n  disabled: true/);
  assert.match(patch, /- id: tool-bash\n  disabled: true/);
  assert.ok(!patch.includes('test-only-secret'));
  assert.ok(!patch.includes('test-only-tool-secret'));
});
