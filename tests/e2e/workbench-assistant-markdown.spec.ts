import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.use({ baseURL: process.env.OPM_ASSISTANT_BASE ?? 'http://127.0.0.1:5177' });
test('历史助手回复的真实 Markdown 表格在桌面和窄屏可读，不改变模型或会话', async ({ page }, info) => {
  test.skip(!process.env.OPM_ASSISTANT_MARKDOWN_PROOF, '需要包含真实表格的历史会话身份，仅只读检查');
  const scope = JSON.parse(await readFile(process.env.OPM_ASSISTANT_MARKDOWN_PROOF!, 'utf8'));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`/projects/${scope.projectId}/models/${scope.modelId}/workbench?context=${scope.contextId}`);
  await expect(page.getByTestId('hs-save')).toBeEnabled(); await page.getByTestId('left-tab-assistant').click();
  const panel = page.getByTestId('assistant-panel'), table = panel.locator('.assistant-message--assistant table').last();
  const identity = await page.getByTestId('hs-draft-identity').innerText();
  const session = await page.evaluate(() => window.__OPM_LOCAL_SESSION__);
  const history = async () => (await (await page.request.post('/api/assistant/list', { headers: { Origin: new URL(page.url()).origin, 'X-OPM-Session': session! }, data: scope })).json())[0];
  const before = await history();
  await expect(table).toBeAttached();
  expect(await table.locator('thead th').allTextContents()).toEqual(['方案', '做法', '适用']);
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await table.scrollIntoViewIfNeeded(); await expect(table).toBeVisible();
  await page.screenshot({ path: info.outputPath('assistant-markdown-desktop.png') });
  const region = table.locator('..');
  const checkBounds = async () => {
    const frame = (await panel.boundingBox())!, box = (await region.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(frame.x); expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  };
  await checkBounds();
  await page.setViewportSize({ width: 390, height: 844 }); await table.scrollIntoViewIfNeeded();
  await checkBounds(); await expect(panel.getByTestId('assistant-input')).toBeVisible();
  const scrolling = await region.evaluate(area => {
    area.scrollLeft = area.scrollWidth;
    return { overflow: area.scrollWidth > area.clientWidth, moved: area.scrollLeft > 0 };
  });
  if (scrolling.overflow) expect(scrolling.moved).toBe(true);
  await region.evaluate(area => { area.scrollLeft = 0; });
  await page.screenshot({ path: info.outputPath('assistant-markdown-mobile.png') });
  await region.screenshot({ path: info.outputPath('assistant-markdown-table.png') });
  expect(await page.getByTestId('hs-draft-identity').innerText()).toBe(identity);
  expect(await history()).toEqual(before); expect(errors).toEqual([]);
});
