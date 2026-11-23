import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Settings, modelSettings } from '../src/settings.mjs';

test('凭证不回显，系统不可用时不明文落盘，配置拒绝非安全地址', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opm-settings-')); t.after(() => rm(root, { recursive: true, force: true }));
  const safe = { isAsyncEncryptionAvailable: async () => true, encryptStringAsync: async () => Buffer.from('encrypted-fixture'), decryptStringAsync: async () => 'fake-test-key' };
  const settings = new Settings(root, safe);
  const value = { provider: 'deepseek', baseURL: 'https://api.deepseek.com', model: 'deepseek-flash', key: 'fake-test-key', persist: true };
  const output = await settings.save(value);
  assert.equal(output.hasKey, true); assert.equal(output.persisted, true);
  assert.ok(!JSON.stringify(output).includes(value.key)); assert.ok(!(await readFile(settings.secretPath, 'utf8')).includes(value.key));
  assert.equal(await settings.key(), value.key);
  safe.isAsyncEncryptionAvailable = async () => false;
  await settings.save({ ...value, persist: true });
  await assert.rejects(readFile(settings.secretPath), { code: 'ENOENT' });
  assert.equal(await settings.key(), value.key);
  assert.equal(await new Settings(root, safe).key(), '');
  await settings.clear(); assert.equal((await settings.read()).hasKey, false);
  for (const baseURL of ['http://example.com', 'https://user:pass@example.com', 'https://example.com?key=x', 'file:///etc']) assert.throws(() => modelSettings({ ...value, baseURL }));
});

test('私网 HTTP 网关保存并重读，保留端口与 API 路径，拒绝私网范围外地址', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opm-http-settings-')); t.after(() => rm(root, { recursive: true, force: true }));
  const settings = new Settings(root, { isAsyncEncryptionAvailable: async () => false });
  const value = { provider: 'openai', model: 'gateway-model', key: '', persist: false };
  for (const baseURL of ['http://10.20.30.40:33000/v1', 'http://172.16.0.1:8080/v1', 'http://172.31.255.254/v1', 'http://192.168.10.20:9000/v1', 'http://localhost:8080/v1', 'https://gateway.example/v1']) {
    await settings.save({ ...value, baseURL });
    assert.equal((await new Settings(root, settings.safe).read()).baseURL, baseURL);
  }
  for (const baseURL of ['http://172.15.0.1/v1', 'http://172.32.0.1/v1', 'http://192.169.0.1/v1', 'http://example.com/v1', 'http://10.20.30.40/v1?key=x', 'http://user:pass@10.20.30.40/v1', 'ftp://10.20.30.40/v1']) assert.throws(() => modelSettings({ ...value, baseURL }));
});
