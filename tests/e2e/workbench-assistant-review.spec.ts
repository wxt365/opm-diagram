import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';

test.use({ baseURL: process.env.OPM_ASSISTANT_BASE ?? 'http://127.0.0.1:5177' });
test('真实标准审查识别活动对象错误，自动修正并在画布一次提交', async ({ page }, info) => {
  test.setTimeout(300_000); test.skip(!process.env.OPM_ASSISTANT_PROOF, '需要独立助手测试项目');
  const proof = JSON.parse(await readFile(process.env.OPM_ASSISTANT_PROOF!, 'utf8'));
  await page.setViewportSize({ width: 1600, height: 1100 }); await page.goto(`/projects/${proof.projectId}`);
  await page.getByTestId('p02-create-model').click(); await page.getByTestId('ov02-model-name').fill(`语义审查修正-${Date.now()}`);
  await page.getByRole('button', { name: '创建并打开工作台', exact: true }).click(); await expect(page.getByTestId('hs-save')).toBeEnabled();
  const modelId = new URL(page.url()).pathname.match(/\/models\/([^/]+)\/workbench/)![1];
  const contextId = (await page.getByTestId('opd-navigator').locator('[aria-current="page"]').getAttribute('data-testid'))!.replace('p03-context-', '');
  const session = await page.evaluate(() => window.__OPM_LOCAL_SESSION__);
  const proofResult = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ['tests/e2e/drivers/assistant-review-fault.mjs'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = ''; child.stdout.on('data', chunk => { out += chunk; }); child.stderr.on('data', chunk => { err += chunk; });
    child.once('error', reject); child.once('close', code => code === 0 ? resolve(out) : reject(new Error(err.replace(/sk-[a-zA-Z0-9_-]+/g, '[已隐藏]'))));
    child.stdin.end(JSON.stringify({ scope: { projectId: proof.projectId, modelId, contextId }, session }));
  });
  const result = JSON.parse(proofResult); await writeFile(info.outputPath('review-repair-proof.json'), JSON.stringify(result, null, 2));
  expect(result.reviews[0].issues.some((issue: { severity: string; rule_id: string }) => issue.severity === 'ERROR' && issue.rule_id === 'OPM-THING')).toBe(true);
  expect(result.repairs).toBeGreaterThanOrEqual(1); expect(result.repairs).toBeLessThanOrEqual(2); expect(result.status).toBe('ready');
  expect(result.previewToken).toEqual(result.before); expect(result.after.edit_seq).toBe(result.before.edit_seq + 1);
  expect(result.review.issues.filter((issue: { severity: string }) => issue.severity === 'ERROR')).toEqual([]);
  expect(result.validation.validation_summary.blocking).toBe(0);
  const processStep = result.command.payload.steps.find((step: { local_id: string }) => step.local_id === 'grind');
  expect(processStep.kind).toBe('PROCESS'); expect(processStep.name).toMatch(/^磨豆(?:过程)?$/);
  expect(result.response).toContain('自动修正了检查发现的问题');
  await page.reload(); await expect(page.getByTestId('hs-save')).toBeEnabled();
  for (const name of ['咖啡豆', '咖啡粉', processStep.name]) await expect(page.locator('.x6-node').filter({ has: page.locator('text', { hasText: new RegExp(`^${name}$`) }) })).toBeVisible();
  expect(await page.locator('.x6-edge').count()).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: info.outputPath('review-repaired-canvas.png') });
});
