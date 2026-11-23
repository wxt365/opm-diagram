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
  assert.match(patch, /baseURL: "https:\/\/api.deepseek.com\/anthropic"/);
  assert.match(patch, /- id: spill-policy\n  disabled: true/);
  assert.match(patch, /- id: tool-fs\n  disabled: true/);
  assert.match(patch, /- id: tool-bash\n  disabled: true/);
  assert.match(patch, /- id: tool-executor-ptc\n  disabled: true/);
  assert.match(patch, /- id: tool-executor-native\n  disabled: false/);
  assert.ok(!patch.includes('mode: native'));
  assert.ok(!patch.includes('test-only-secret'));
  assert.ok(!patch.includes('test-only-tool-secret'));
});

test('OpenAI 网关使用独立 provider 和 Chat Completions，不追加 Anthropic 路径', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opm-openai-profile-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const harness = await createHarness({ provider: 'openai', dataRoot: root, baseURL: 'http://192.168.137.250:33000/v1/', model: 'gpt-6.1-sol', apiKey: 'test-only-secret', toolOrigin: 'http://127.0.0.1:17860', toolSecret: 'test-only-tool-secret' }, 'project.test');
  t.after(() => harness.close());
  const patch = await readFile(join(root, 'workspaces/project.test/opm.patch.yml'), 'utf8');
  assert.match(patch, /- id: llm-deepseek\n  disabled: true/);
  assert.match(patch, /opm-openai:/); assert.match(patch, /api: openai-completions/);
  assert.match(patch, /apiKeyEnv: DEEPSEEK_API_KEY/);
  assert.match(patch, /baseURL: "http:\/\/192.168.137.250:33000\/v1"/);
  assert.match(patch, /id: "gpt-6.1-sol"/);
  assert.ok(!patch.includes('/anthropic'));
  assert.ok(!patch.includes('test-only-secret')); assert.ok(!patch.includes('test-only-tool-secret'));
});
