import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, rename, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConversationStore } from '../src/store.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'assistant-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new ConversationStore(root); await store.init();
  const value = await store.create({ projectId: 'project.test', modelId: 'model.test', contextId: 'context.root' });
  return { root, store, value };
}

test('短暂 EPERM/EBUSY 重试后完整保存中文内容', async t => {
  const { root, store, value } = await fixture(t); let attempts = 0; const waits = [];
  store.rename = async (...args) => { attempts++; if (attempts <= 2) throw Object.assign(new Error('locked'), { code: attempts === 1 ? 'EPERM' : 'EBUSY' }); await rename(...args); };
  store.delay = async ms => { waits.push(ms); };
  await store.update(value.id, v => { v.title = '其他电脑生成的中文图'; });
  assert.equal((await store.read(value.id)).title, '其他电脑生成的中文图');
  assert.equal(attempts, 3); assert.deepEqual(waits, [50, 100]);
  assert.deepEqual(await readdir(root), [`${value.id}.json`]);
});

test('持续占用保留旧文件、清理临时文件且后续更新可恢复', async t => {
  const { root, store, value } = await fixture(t); let attempts = 0; const waits = [];
  store.rename = async () => { attempts++; throw Object.assign(new Error(`EPERM rename ${root}`), { code: 'EPERM' }); };
  store.delay = async ms => { waits.push(ms); };
  await assert.rejects(store.update(value.id, v => { v.title = '不能提交'; }), error => {
    assert.equal(error.code, 'CONVERSATION_SAVE_FAILED'); assert.equal(error.status, 503);
    assert.equal(error.message.includes(root), false); assert.equal(error.cause.code, 'EPERM'); return true;
  });
  assert.equal(attempts, 6); assert.deepEqual(waits, [50, 100, 200, 400, 800]);
  assert.deepEqual(await store.read(value.id), value); assert.deepEqual(await readdir(root), [`${value.id}.json`]);
  store.rename = rename;
  await store.update(value.id, v => { v.title = '已恢复'; });
  assert.equal((await store.read(value.id)).title, '已恢复');
});

test('非暂时性错误立即失败并保留原记录', async t => {
  const { root, store, value } = await fixture(t); let attempts = 0;
  store.rename = async () => { attempts++; throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); };
  store.delay = async () => { assert.fail('Should not retry'); };
  await assert.rejects(store.update(value.id, v => { v.title = '失败'; }), { code: 'CONVERSATION_SAVE_FAILED' });
  assert.equal(attempts, 1); assert.deepEqual(await store.read(value.id), value);
  assert.deepEqual(await readdir(root), [`${value.id}.json`]);
});
