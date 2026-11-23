import { expect, test } from '@playwright/test';

test('框外分类标题可点击拖动，状态仍独立选择且跟随 owner', async ({ page }) => {
  const harness = `${process.cwd()}/tests/e2e/fixtures/canvas-performance.ts`;
  await page.route('**/__canvas_node_hit__', route => route.fulfill({ contentType: 'text/html', body:
    `<html><head><style>html,body,#app,.opd-canvas-host,.opd-canvas{margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><div id="app"></div><script type="module" src="/@fs/${harness}"></script></body></html>` }));
  await page.goto('/__canvas_node_hit__');
  await page.waitForFunction(() => !!(window as any).canvasPerformance);
  await page.evaluate(async () => { await (window as any).canvasPerformance.load(2); await (window as any).canvasPerformance.details(); });
  const owner = page.locator('.x6-node[data-cell-id="node.0"]');
  // A group includes the caption above its body. This is the exact offset that
  // previously hit the blank graph SVG instead of the visible owner heading.
  await owner.click({ position: { x: 20, y: 14 } });
  await expect(owner.locator('[data-testid="p03-occurrence-occurrence.0"]')).toHaveAttribute('fill', '#eaf3fc');
  const state = page.locator('.x6-node[data-cell-id="state.node.0"]');
  await state.click();
  await expect(state.locator('rect').first()).toHaveAttribute('fill', '#eaf3fc');
  await expect(owner.locator('[data-testid="p03-occurrence-occurrence.0"]')).toHaveAttribute('fill', '#ffffff');
  const before = await state.boundingBox(), box = (await owner.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 14); await page.mouse.down();
  await page.mouse.move(box.x + 52, box.y + 46, { steps: 4 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as any).canvasPerformance.position().x)).toBe(112);
  expect((await state.boundingBox())!.x).toBeCloseTo(before!.x + 32, 0);
  expect((await state.boundingBox())!.y).toBeCloseTo(before!.y + 32, 0);
  await expect(page.locator('.x6-node[data-cell-id="node.1"]')).toBeVisible();
});
