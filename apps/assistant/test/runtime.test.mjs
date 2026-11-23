import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeClient } from '../src/runtime.mjs';

test('运行时拒绝原因保留给助手，不丢失原错误码与状态', async () => {
  for (const nested of [false, true]) {
    const detail = { code: 'DRAFT_EDIT_REJECTED', message: '草稿操作未通过领域或资产校验', reason_code: 'ENDPOINT_KIND_MISMATCH' };
    const runtime = new RuntimeClient('http://127.0.0.1:17850', 'test-session', async () => ({ ok: false, status: 422, json: async () => nested ? { error: detail } : detail }));
    await assert.rejects(runtime.query({ projectId: 'project.test', modelId: 'model.test' }, 'plan-preview'), error => {
      assert.equal(error.code, detail.code); assert.equal(error.status, 422);
      assert.equal(error.reason_code, detail.reason_code); assert.match(error.message, /ENDPOINT_KIND_MISMATCH/); return true;
    });
  }
});

test('缺少拒绝原因时保留原错误提示', async () => {
  const runtime = new RuntimeClient('http://127.0.0.1:17850', 'test-session', async () => ({ ok: false, status: 409, json: async () => ({ code: 'DRAFT_CONFLICT', message: '草稿已变化' }) }));
  await assert.rejects(runtime.query({ projectId: 'p', modelId: 'm' }, 'open'), { code: 'DRAFT_CONFLICT', message: '草稿已变化', reason_code: null });
});

test('每轮读取当前模型目标，空目标保留且不串模型，旧运行时明确提示更新', async () => {
  const scope = { projectId: 'project.test', modelId: 'model.test', contextId: 'context.root' };
  let description = '只建入库，不建出库', returnedId = scope.modelId;
  const calls = [];
  const runtime = new RuntimeClient('http://127.0.0.1:17870', 'test-session', async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ data: { model: { project_id: scope.projectId, model_id: returnedId, name: '仓储', description } } }) };
  });
  assert.equal((await runtime.modelBackground(scope)).business_goal, description);
  description = '只建出库';
  assert.equal((await runtime.modelBackground(scope)).business_goal, description);
  description = '';
  assert.equal((await runtime.modelBackground(scope)).business_goal, '');
  returnedId = 'model.other';
  await assert.rejects(runtime.modelBackground(scope), { code: 'SCOPE_MISMATCH' });
  returnedId = scope.modelId; description = undefined;
  await assert.rejects(runtime.modelBackground(scope), { code: 'MODEL_BACKGROUND_UNAVAILABLE' });
  assert(calls.every(c => c.options.headers['X-OPM-Session'] === 'test-session' && c.options.cache === 'no-store'));
  assert(calls.every(c => new URL(c.url).searchParams.get('request_id')?.startsWith('request.assistant.')));
});

test('完整快照携带已保存业务目标供读取工具使用', async () => {
  const scope = { projectId: 'project.test', modelId: 'model.test', contextId: 'context.root' };
  const token = { draft_id: 'draft.test', edit_seq: 0, binding_digest: 'a'.repeat(64) };
  const runtime = new RuntimeClient('http://127.0.0.1:17870', 'test-session', async url => ({ ok: true, json: async () =>
    url.includes('workspace-session') ? { data: { model: { project_id: scope.projectId, model_id: scope.modelId, name: '仓储', description: '只讨论入库' } } }
    : url.endsWith('/open') ? { draft_token: token }
    : url.endsWith('/navigation') ? { data: { process_tree: [{ context_id: scope.contextId }], object_forest: [], views: [] } }
    : { meta: { draft_token: token }, data: { constructs: [] } } }));
  assert.equal((await runtime.snapshot(scope)).business_goal, '只讨论入库');
});
