import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Locator } from '@playwright/test';

test.use({ baseURL: process.env.OPM_ASSISTANT_BASE ?? 'http://127.0.0.1:5177' });

async function replyPosition(panel: Locator) {
  return panel.locator('[role="log"]').evaluate(area => {
    const reply = Array.from(area.querySelectorAll('.assistant-message--assistant')).at(-1)!;
    const frame = area.getBoundingClientRect(), box = reply.getBoundingClientRect();
    return { atLatest: area.scrollHeight - area.scrollTop - area.clientHeight < 4,
      replyVisible: box.bottom > frame.top && box.bottom <= frame.bottom + 1,
      containsProposal: !!area.querySelector('[data-testid="assistant-proposal"]') };
  });
}

test('已确认方案展开报告后连续追问，真实回复可见且保持同一会话和画布', async ({ page }, info) => {
  test.setTimeout(300_000);
  test.skip(!process.env.OPM_ASSISTANT_PROOF, '需要隔离测试项目，禁止修改用户已有模型');
  const proof = JSON.parse(await readFile(process.env.OPM_ASSISTANT_PROOF!, 'utf8'));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`/projects/${proof.projectId}`); await page.getByTestId('p02-create-model').click();
  await page.getByTestId('ov02-model-name').fill(`助手连续追问验证-${Date.now()}`);
  await page.getByRole('button', { name: '创建并打开工作台', exact: true }).click();
  await expect(page.getByTestId('hs-save')).toBeEnabled(); await page.getByTestId('left-tab-assistant').click();
  const panel = page.getByTestId('assistant-panel'), input = panel.getByTestId('assistant-input');
  await input.fill('只创建两个独立对象，分别命名为生咖啡豆和熟咖啡豆。坐标为x=80,y=200和x=160,y=200，保留这个有意指定的重叠布局；不要添加过程、状态或关系，最后由我一次确认。');
  await panel.getByTestId('assistant-send').click(); await expect(panel.getByTestId('assistant-running')).toBeVisible();
  await expect(panel.getByTestId('assistant-running')).toHaveCount(0, { timeout: 180_000 });
  await expect(panel.getByTestId('assistant-apply')).toBeEnabled();
  await expect(panel.getByTestId('assistant-proposals')).toHaveAttribute('open', '');
  await expect(page.locator('.x6-node').filter({ has: page.locator('text', { hasText: /^生咖啡豆$/ }) })).toBeVisible();
  await expect(page.locator('.x6-node').filter({ has: page.locator('text', { hasText: /^熟咖啡豆$/ }) })).toBeVisible();
  await panel.getByTestId('assistant-apply').click(); await expect(panel.getByTestId('assistant-proposal')).toContainText('已应用');
  await expect(panel.getByTestId('assistant-proposals')).not.toHaveAttribute('open', '');
  await page.getByTestId('hs-save').click(); await expect(page.getByTestId('hs-save-state')).toHaveText('已手动保存');
  const identity = await page.getByTestId('hs-draft-identity').innerText();
  const nodes = await page.locator('.x6-node').count();
  const modelId = new URL(page.url()).pathname.match(/\/models\/([^/]+)\/workbench/)![1];
  const contextId = (await page.getByTestId('opd-navigator').locator('[aria-current="page"]').getAttribute('data-testid'))!.replace('p03-context-', '');
  const scope = { projectId: proof.projectId, modelId, contextId };
  const session = await page.evaluate(() => window.__OPM_LOCAL_SESSION__);
  const list = async () => (await (await page.request.post('/api/assistant/list', { headers: { Origin: new URL(page.url()).origin, 'X-OPM-Session': session! }, data: scope })).json())[0];
  const initial = await list();
  await panel.getByTestId('assistant-proposals').locator(':scope > summary').click();
  await panel.getByTestId('assistant-quality').locator('summary').click();
  await panel.getByTestId('assistant-standard-review').locator('summary').click();
  await panel.getByTestId('assistant-proposals').evaluate(area => { area.scrollTop = area.scrollHeight; });
  await expect(panel.getByTestId('assistant-proposals').locator(':scope > summary')).toBeInViewport();
  const before = await replyPosition(panel);
  const questions = [
    '图上的生咖啡豆、熟咖啡豆这两个对象还有用吗？只读取当前图并解释，不提出或暂存任何修改。',
    '继续上一问：如果把烘焙建成过程，应如何表达生咖啡豆与熟咖啡豆之间的关系？只讨论，不修改模型。',
  ];
  for (const [index, question] of questions.entries()) {
    await panel.locator('[role="log"]').evaluate(area => { area.scrollTop = 0; });
    await input.fill(question); await panel.getByTestId('assistant-send').click();
    await expect(panel.getByTestId('assistant-running')).toBeVisible();
    await expect(input).toHaveValue('');
    await expect.poll(async () => (await replyPosition(panel)).atLatest).toBe(true);
    await expect(panel.getByTestId('assistant-running')).toHaveCount(0, { timeout: 120_000 });
    await expect(panel.locator('.assistant-message--assistant')).toHaveCount(index + 2);
    await expect(panel.locator('.assistant-message--assistant').last()).toContainText('咖啡豆');
    await expect.poll(() => replyPosition(panel)).toEqual({ atLatest: true, replyVisible: true, containsProposal: false });
    const current = await list();
    expect(current.id).toBe(initial.id); expect(current.proposals).toHaveLength(1); expect(current.run.status).toBe('completed');
    expect(current.messages.length).toBe(initial.messages.length + (index + 1) * 2);
    expect(await page.getByTestId('hs-draft-identity').innerText()).toBe(identity); expect(await page.locator('.x6-node').count()).toBe(nodes);
  }
  await page.screenshot({ path: info.outputPath('assistant-followup-desktop.png') });
  await page.reload(); await expect(page.getByTestId('hs-save')).toBeEnabled(); await page.getByTestId('left-tab-assistant').click();
  await expect(panel.locator('.assistant-message--assistant')).toHaveCount(3);
  await expect(panel.getByTestId('assistant-proposals')).not.toHaveAttribute('open', '');
  await expect.poll(() => replyPosition(panel)).toEqual({ atLatest: true, replyVisible: true, containsProposal: false });
  await page.setViewportSize({ width: 390, height: 844 }); await panel.scrollIntoViewIfNeeded();
  await expect(input).toBeVisible(); const box = (await panel.boundingBox())!; expect(box.x + box.width).toBeLessThanOrEqual(391);
  await expect.poll(() => replyPosition(panel)).toEqual({ atLatest: true, replyVisible: true, containsProposal: false });
  await page.screenshot({ path: info.outputPath('assistant-followup-mobile.png') });
  await writeFile(info.outputPath('followup-proof.json'), JSON.stringify({ scope, conversationId: initial.id, before, after: await replyPosition(panel), questions, errors }, null, 2));
  expect(errors).toEqual([]);
});
