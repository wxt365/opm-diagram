import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuration, startServer } from '../../assistant/src/server.mjs';
import { launchManaged } from '../src/managed-process.mjs';
import { DesktopRuntime } from '../src/runtime.mjs';
import { Settings } from '../src/settings.mjs';

test('助手随机监听端口同步为实际 Harness 工具 origin', async () => {
  const config = configuration({ DEEPSEEK_API_KEY: 'fake-test-key', OPM_ASSISTANT_PORT: '0' });
  const app = await startServer(config, { init: async () => {}, close: async () => {} });
  try { assert.equal(config.toolOrigin, `http://127.0.0.1:${app.server.address().port}`); }
  finally { await app.close(); }
});

test('桌面保存私网 HTTP 后给真实受管助手绑定精确 origin 并就绪，不调用网关', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opm-http-assistant-'));
  const settings = new Settings(root, { isAsyncEncryptionAvailable: async () => false });
  await settings.save({ provider: 'openai', baseURL: 'http://10.20.30.40:33000/v1', model: 'gateway-model', key: 'fake-http-gateway-key', persist: false });
  const runtime = new DesktopRuntime({ resources: { root: fileURLToPath(new URL('../../../', import.meta.url)), node: process.execPath }, userData: root, version: '0.1.0', settings });
  t.after(async () => { await runtime.stopAssistant({ allowAbnormal: true }); await rm(root, { recursive: true, force: true }); });
  await mkdir(join(root, 'ready')); await mkdir(join(root, 'logs'));
  runtime.services.set('runtime', { origin: 'http://127.0.0.1:17850' });
  let origin; runtime.gateway = { origin: 'http://127.0.0.1:50000', setAssistant: value => { origin = value; } };
  await runtime.startAssistant();
  assert.equal(runtime.assistantState, 'READY');
  assert.equal((await (await fetch(origin + '/health')).json()).status, 'UP');
});
test('桌面真实助手不读开发环境，完成 ready 并随父管道 EOF 退出', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opm-assistant-desktop-')); await mkdir(join(root, 'ready'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const managed = await launchManaged({ command: process.execPath, args: [fileURLToPath(new URL('../../assistant/src/desktop-entry.mjs', import.meta.url))],
    cwd: root, readyRoot: join(root, 'ready'), component: 'assistant', timeout: 15000,
    env: { DEEPSEEK_API_KEY: 'fake-test-key', OPM_ASSISTANT_PORT: '0', OPM_ASSISTANT_DATA: join(root, 'data') } });
  managed.child.stdin.end();
  const deadline = Date.now() + 5000;
  while (!managed.exited && Date.now() < deadline) await new Promise(done => setTimeout(done, 30));
  assert.equal(managed.exited, true); await managed.stop();
});
