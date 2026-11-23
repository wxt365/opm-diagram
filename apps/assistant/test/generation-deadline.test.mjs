import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { runStage } from '../src/stage-runner.mjs';

function fixture(config) {
  const task = { active: true, plan: { steps: [] }, scope: { projectId: 'p' } };
  const harness = { close: async () => {} }, service = { config, harnesses: new Map([['p', harness]]) };
  return { task, harness, service };
}
test('持续步骤进展可超过无进展时限完成，总限时仍独立', async () => {
  const { task, harness, service } = fixture({ generationTimeoutMs: 1000, generationIdleTimeoutMs: 100 });
  const result = await runStage(service, task, harness, 'generation', async () => {
    for (let i = 0; i < 4; i++) { await delay(40); task.plan.steps.push({ local_id: `step.${i}` }); task.recordGenerationProgress(); }
    return 'completed';
  });
  assert.equal(result, 'completed'); assert.equal(task.recordGenerationProgress, null);
});
test('无变化重放不延长无进展时限', async () => {
  const { task, harness, service } = fixture({ generationTimeoutMs: 1000, generationIdleTimeoutMs: 50 }); let timer;
  try {
    await assert.rejects(runStage(service, task, harness, 'generation', () => {
      timer = setInterval(() => task.recordGenerationProgress?.(), 10); return new Promise(() => {});
    }), error => error.code === 'GENERATION_TIMEOUT' && /无有效暂存进展/.test(error.message));
  } finally { clearInterval(timer); }
  assert.equal(service.harnesses.has('p'), false);
});
test('持续进展不延长显式总上限', async () => {
  const { task, harness, service } = fixture({ generationTimeoutMs: 100, generationIdleTimeoutMs: 60 }); let timer;
  try {
    await assert.rejects(runStage(service, task, harness, 'generation', () => {
      timer = setInterval(() => { task.plan.steps.push({ local_id: `step.${task.plan.steps.length}` }); task.recordGenerationProgress?.(); }, 20);
      return new Promise(() => {});
    }), error => error.code === 'GENERATION_TIMEOUT' && !/无有效暂存进展/.test(error.message));
  } finally { clearInterval(timer); }
});
