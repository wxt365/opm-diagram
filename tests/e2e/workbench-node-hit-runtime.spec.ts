import { expect, test } from '@playwright/test';

test('真实宿主中连续点击对象标题创建状态，保存刷新后仍可选择', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 1200 });
  await page.goto('/projects');
  await page.getByTestId('p01-create-project').click();
  await page.getByTestId('ov01-project-name').fill(`节点命中回归 ${Date.now()}`);
  await page.getByRole('button', { name: '创建并继续', exact: true }).click();
  await page.getByTestId('p02-create-model').click();
  await page.getByTestId('ov02-model-name').fill('标题和状态命中');
  await page.getByRole('button', { name: '创建并打开工作台', exact: true }).click();
  await expect(page.getByTestId('p03-tool-object')).toBeEnabled();
  await edit(() => page.getByTestId('p03-tool-object').click());
  const owner = page.locator('.x6-node').filter({ hasText: 'Object 1' });
  for (let index = 0; index < 3; index++) {
    await owner.click({ position: { x: 20, y: 14 } });
    await expect(page.getByTestId('p03-tool-state')).toBeEnabled();
    await edit(() => page.getByTestId('p03-tool-state').click());
    await expect(page.locator('.x6-node')).toHaveCount(index + 2);
  }
  const saved = page.waitForResponse(response => response.url().endsWith('/draft/save') && response.request().method() === 'POST');
  await page.getByTestId('hs-save').click(); expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(page.locator('.x6-node')).toHaveCount(4);
  await owner.click({ position: { x: 20, y: 14 } });
  await expect(page.getByTestId('p03-tool-state')).toBeEnabled();

  async function edit(action: () => Promise<void>) {
    const committed = page.waitForResponse(response => response.url().endsWith('/draft/commands') && response.request().method() === 'POST');
    await action(); expect((await committed).status()).toBe(200);
  }
});
