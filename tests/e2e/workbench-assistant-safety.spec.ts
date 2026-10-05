import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
test.use({ baseURL: process.env.OPM_ASSISTANT_BASE ?? 'http://127.0.0.1:5177' });
test('助手服务重启后恢复多轮，取消、冲突、父子图及共享身份保护', async ({ page }, info) => {
  test.setTimeout(400_000); test.skip(!process.env.OPM_ASSISTANT_RESUME_PROOF, '需要独立模型的已完成会话身份');
  const scope = JSON.parse(await readFile(process.env.OPM_ASSISTANT_RESUME_PROOF!, 'utf8'));
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto(`/projects/${scope.projectId}/models/${scope.modelId}/workbench?context=${scope.contextId}`);
  await expect(page.getByTestId('hs-save')).toBeEnabled(); await page.getByTestId('left-tab-assistant').click();
  const panel = page.getByTestId('assistant-panel'); await expect(panel.getByTestId('assistant-proposal')).toHaveCount(7);
  const post = async (op: string, extra: Record<string, unknown> = {}) => {
    const session = await page.evaluate(() => window.__OPM_LOCAL_SESSION__);
    return page.request.post(`/api/assistant/${op}`, { headers: { Origin: new URL(page.url()).origin, 'X-OPM-Session': session! }, data: { ...scope, ...extra } });
  };
  const draft = async () => {
    const session = await page.evaluate(() => window.__OPM_LOCAL_SESSION__);
    const response = await page.request.post(`/api/v2/projects/${scope.projectId}/models/${scope.modelId}/draft/open`, { headers: { Origin: new URL(page.url()).origin, 'X-OPM-Session': session! }, data: { request_id: `request.proof.${Date.now()}`, context_id: scope.contextId } });
    expect(response.status()).toBe(200); return (await response.json()).draft_token;
  };
  const before = await draft(); const history = await (await post('get')).json();
  const fixed = await (await post('list')).json(); expect(fixed).toHaveLength(1); expect(fixed[0].id).toBe(scope.conversationId);
  expect((await (await post('create')).json()).id).toBe(scope.conversationId); expect(await draft()).toEqual(before);
  expect(history.messages.length).toBeGreaterThanOrEqual(14);
  const duplicate = await post('apply', { draftToken: before, proposalId: history.proposals[0].id }); expect(duplicate.status()).toBe(200); expect(await draft()).toEqual(before);
  const readonly = await post('prompt', { text: '添加对象' }); expect(readonly.status()).toBe(409); expect(await draft()).toEqual(before);
  const forged = await post('get', { contextId: 'context.other' }); expect(forged.status()).toBe(403);
  // 此轮在重启后的同一 session 续聊；恢复先读取新模型。
  await prompt(page, '请添加名为磨豆机的对象，x=750,y=300，只提出提案。');
  if (await panel.getByTestId('assistant-preview').last().isVisible()) await panel.getByTestId('assistant-preview').last().click(); await expect(node(page, '磨豆机')).toBeVisible(); expect(await draft()).toEqual(before);
  await panel.getByTestId('assistant-cancel').last().click(); await expect(node(page, '磨豆机')).toHaveCount(0); expect(await draft()).toEqual(before);
  await prompt(page, '添加名为包装机的对象，x=800,y=400。');
  const stale = (await (await post('get')).json()).proposals.at(-1);
  const identity = await page.getByTestId('hs-draft-identity').innerText(); await page.getByTestId('p03-tool-object').click();
  await expect(page.getByTestId('hs-draft-identity')).not.toHaveText(identity); await expect(panel.getByTestId('assistant-apply').last()).toBeDisabled();
  const current = await draft(); const conflict = await post('apply', { draftToken: stale.baseToken, proposalId: stale.id }); expect(conflict.status()).toBe(409); expect(await draft()).toEqual(current);
  await page.getByTestId('p03-tool-select').click(); await node(page, '咖啡烘焙').click({ position: { x: 30, y: 16 } });
  await page.getByTestId('left-tab-navigation').click();
  const root = (await page.getByTestId('opd-navigator').locator('[aria-current="page"]').getAttribute('data-testid'))!;
  await page.getByTestId(root.replace('p03-context-', 'opd-add-')).click(); await page.getByTestId('opd-refinement-name').fill('咖啡烘焙子图'); await page.getByTestId('opd-refine').click();
  await expect(page.getByTestId('opd-navigator').locator('[aria-current="page"]')).toContainText('咖啡烘焙子图');
  await page.getByTestId('left-tab-assistant').click();
  await expect(panel.getByTestId('assistant-proposal')).toHaveCount(0);
  await page.getByTestId('left-tab-navigation').click();
  await page.getByTestId(root).click(); await page.getByTestId('left-tab-assistant').click(); await expect(panel.getByTestId('assistant-proposal')).toHaveCount(9);
  await prompt(page, '将咖啡烘焙过程重命名为烘焙管理，直接提出改名提案，由服务检查父子图影响；先不要应用。');
  await expect(panel.getByTestId('assistant-proposal').last()).toContainText('已阻断');
  await expect(panel.getByTestId('assistant-proposal').last()).toContainText('咖啡烘焙子图');
  await expect(panel.getByTestId('assistant-apply').last()).toBeDisabled(); await expect(node(page, '咖啡烘焙')).toBeVisible();
  await page.getByRole('tab', { name: 'OPL / OPT' }).click(); await expect(page.getByTestId('p03-text-panel')).toContainText('咖啡豆');
  await page.getByTestId('left-tab-assistant').click(); await page.setViewportSize({ width: 780, height: 900 }); await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('assistant-safety-narrow.png') });
});
function node(page: Page, name: string) { return page.locator('.x6-node').filter({ has: page.locator('text', { hasText: new RegExp(`^${name}$`) }) }).last(); }
async function prompt(page: Page, text: string) {
  const panel = page.getByTestId('assistant-panel'), count = await panel.getByTestId('assistant-proposal').count();
  await panel.getByTestId('assistant-input').fill(text); await panel.getByTestId('assistant-send').click();
  await expect(panel.getByTestId('assistant-running')).toBeVisible(); await expect(panel.getByTestId('assistant-running')).toHaveCount(0, { timeout: 120_000 });
  await expect(panel.getByTestId('assistant-proposal')).toHaveCount(count + 1);
}

test('真实运行停止后不写入，可在同一对话重新读取模型', async ({ page }) => {
  test.setTimeout(240_000); test.skip(!process.env.OPM_ASSISTANT_RESUME_PROOF, '需要隔离模型会话');
  const scope = JSON.parse(await readFile(process.env.OPM_ASSISTANT_RESUME_PROOF!, 'utf8'));
  await page.goto(`/projects/${scope.projectId}/models/${scope.modelId}/workbench?context=${scope.contextId}`); await expect(page.getByTestId('hs-save')).toBeEnabled();
  await page.getByTestId('left-tab-assistant').click();
  const panel = page.getByTestId('assistant-panel'); await expect(panel.getByTestId('assistant-input')).toBeEnabled();
  const before = await page.getByTestId('hs-draft-identity').innerText();
  await panel.getByTestId('assistant-input').fill('为当前模型补充磨豆流程，先读取并检查相关关系，再提出添加磨豆设备对象的提案。');
  await panel.getByTestId('assistant-send').click(); await expect(panel.getByTestId('assistant-stop')).toBeVisible(); await panel.getByTestId('assistant-stop').click();
  await expect(panel.getByText('已停止生成，尚未应用的提案可取消。', { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(await page.getByTestId('hs-draft-identity').innerText()).toBe(before);
  await panel.getByTestId('assistant-input').fill('只读取并解释当前咖啡豆有哪些状态，不提出修改。'); await panel.getByTestId('assistant-send').click();
  await expect(panel.getByTestId('assistant-running')).toBeVisible();
  await expect(panel.getByTestId('assistant-running')).toHaveCount(0, { timeout: 120_000 });
  await expect(panel.locator('.assistant-message--assistant').last()).toContainText('待烘焙');
  await expect(panel.locator('.assistant-message--assistant').last()).toContainText('已烘焙');
  expect(await page.getByTestId('hs-draft-identity').innerText()).toBe(before);
});
