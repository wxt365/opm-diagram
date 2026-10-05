import { test, expect } from '@playwright/test';

test.use({ baseURL: process.env.OPM_PERFORMANCE_BASE ?? 'http://127.0.0.1:5181', viewport: { width: 1800, height: 1200 } });
test.beforeEach(async ({ page }) => {
  const harness = `${process.cwd()}/tests/e2e/fixtures/canvas-performance.ts`;
  await page.route('**/__canvas_performance__', route => route.fulfill({ contentType: 'text/html', body:
    `<html><head><style>html,body,#app,.opd-canvas-host,.opd-canvas{margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><div id="app"></div><script type="module" src="/@fs/${harness}"></script></body></html>` }));
  await page.goto('/__canvas_performance__');
  await page.waitForFunction(() => !!(window as any).canvasPerformance);
});
for (const count of [100, 500, 1000, 3000]) {
  test(`${count} 节点真实画布加载、选择、拖动、缩放与布局`, async ({ page }, info) => {
    test.setTimeout(180_000);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const load = await page.evaluate(n => (window as any).canvasPerformance.load(n), count);
    const select = await page.evaluate(() => (window as any).canvasPerformance.select('node.0'));
    const node = page.locator('.x6-node[data-cell-id="node.0"]');
    await expect(node.locator('rect').first()).toHaveAttribute('fill', '#eaf3fc');
    const before = await page.evaluate(() => (window as any).canvasPerformance.position());
    const box = (await node.boundingBox())!;
    const started = Date.now();
    await page.mouse.move(box.x + 25, box.y + 20); await page.mouse.down();
    await page.mouse.move(box.x + 57, box.y + 52, { steps: 20 }); await page.mouse.up();
    await expect.poll(() => page.evaluate(() => (window as any).canvasPerformance.position().x)).toBeCloseTo(before.x + 32, 0);
    const drag = Date.now() - started;
    const zoom = await page.evaluate(() => (window as any).canvasPerformance.zoom());
    const layout = await page.evaluate(() => (window as any).canvasPerformance.layout());
    expect(layout.reason).toBe(''); expect(layout.changes).toBeGreaterThan(0); expect(errors).toEqual([]);
    const metrics = { nodes: count, relations: count / 2, load, select, drag, zoom, layout: layout.ms };
    // 宽松上限用于发现恢复整图重建的明显退化，不作为产品延迟保证。
    expect(select).toBeLessThan(500); expect(drag).toBeLessThan(3000); expect(layout.ms).toBeLessThan(1000);
    await info.attach('画布性能毫秒', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
    console.log('CANVAS_PERFORMANCE', JSON.stringify(metrics));
  });
}

test('密集并行关系与状态/特征增量变更保留未修改图形', async ({ page }, info) => {
  test.setTimeout(180_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const load = await page.evaluate(() => (window as any).canvasPerformance.load(1000, true));
  await expect(page.locator('.x6-edge')).toHaveCount(2000);
  await page.evaluate(() => { (window as any).unchangedNode = document.querySelector('.x6-node[data-cell-id="node.3"]'); });
  const details = await page.evaluate(() => (window as any).canvasPerformance.details());
  await expect(page.locator('.x6-node[data-cell-id="state.node.0"]')).toBeVisible();
  await expect(page.locator('.x6-node[data-cell-id="feature.node.0"]')).toBeVisible();
  await expect(page.locator('.x6-edge[data-cell-id="state.default.state.node.0"]')).toHaveCount(1);
  await page.evaluate(() => (window as any).canvasPerformance.rename());
  await expect(page.locator('.x6-node[data-cell-id="node.0"] text')).toHaveText('咖啡豆');
  const select = await page.evaluate(() => (window as any).canvasPerformance.select('fact.0'));
  await expect(page.locator('.x6-edge[data-cell-id="fact.0"] path[data-opm-selected]')).toHaveAttribute('stroke', '#0b6bcb');
  await page.evaluate(() => (window as any).canvasPerformance.remove());
  await expect(page.locator('.x6-node[data-cell-id="node.0"]')).toHaveCount(0);
  await expect(page.locator('.x6-edge[data-cell-id="fact.0"]')).toHaveCount(0);
  await expect(page.locator('.x6-edge[data-cell-id="state.default.state.node.0"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).unchangedNode === document.querySelector('.x6-node[data-cell-id="node.3"]'))).toBe(true);
  expect(errors).toEqual([]);
  await info.attach('密集关系与混合元素性能毫秒', { body: JSON.stringify({ nodes: 2000, relations: 2000, load, details, select }), contentType: 'application/json' });
});
