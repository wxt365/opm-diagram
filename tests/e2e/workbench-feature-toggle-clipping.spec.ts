import { expect, test } from "@playwright/test";

test("重叠按钮裁剪取并集，移动缩放后按钮可点且外部连线可选", async ({ page }) => {
  const module = `${process.cwd().replaceAll("\\", "/")}/apps/web/src/modules/workbench/opd/core/feature-toggle-clipping.ts`;
  await page.route("**/__toggle_clipping__", route => route.fulfill({ contentType: "text/html", body: `
    <html><body style="margin:0"><svg width="500" height="300"><defs></defs><g id="stage"></g></svg>
    <script type="module">
      import { createFeatureToggleClipping } from '/@fs/${module}';
      const svg = document.querySelector('svg'), stage = document.querySelector('#stage'), ns = svg.namespaceURI;
      let centers = [], clicks = 0;
      const edge = document.createElementNS(ns, 'path');
      edge.setAttribute('d', 'M20,100H400'); edge.setAttribute('stroke', 'red'); edge.setAttribute('stroke-width', '10');
      const graph = { view: { defs: svg.querySelector('defs'), cid: 'overlap-test' },
        getCellById(id) { const center = centers[Number(id)]; return center && { isNode: () => true, getZIndex: () => 2,
          getPosition: () => ({x:center.x-147,y:center.y-13}), getSize: () => ({width:160,height:72}) }; },
        getEdges: () => [{ getZIndex: () => 3, attr(attrs) { edge.setAttribute('clip-path', attrs.line.clipPath); } }] };
      const sync = createFeatureToggleClipping(() => graph, () => new Set(centers.map((_, i) => String(i))));
      window.clippingTest = { set(points, scale=1) { centers=points; stage.replaceChildren(); stage.setAttribute('transform', 'scale('+scale+')');
        points.forEach((p,i) => { const circle=document.createElementNS(ns,'circle'); circle.setAttribute('cx',p.x); circle.setAttribute('cy',p.y);
          circle.setAttribute('r','8'); circle.setAttribute('fill','white'); circle.setAttribute('data-testid','toggle-'+i);
          circle.addEventListener('click',()=>clicks++); stage.append(circle); }); stage.append(edge); sync(); }, clicks:()=>clicks };
    </script></body></html>` }));
  await page.goto("/__toggle_clipping__");
  await page.waitForFunction(() => !!(window as any).clippingTest);
  for (const points of [
    [{ x: 100, y: 100 }, { x: 100, y: 100 }],
    [{ x: 100, y: 100 }, { x: 106, y: 100 }],
    [{ x: 100, y: 100 }, { x: 106, y: 100 }, { x: 103, y: 104 }],
  ]) {
    await page.evaluate(points => (window as any).clippingTest.set(points), points);
    await page.getByTestId(`toggle-${points.length - 1}`).click();
    expect(await page.evaluate(() => document.elementFromPoint(103, 100)?.tagName)).toBe("circle");
    expect(await page.evaluate(() => document.elementFromPoint(200, 100)?.tagName)).toBe("path");
  }
  await page.evaluate(() => (window as any).clippingTest.set([{ x: 150, y: 100 }, { x: 156, y: 100 }], 1.5));
  await page.getByTestId("toggle-1").click();
  expect(await page.evaluate(() => document.elementFromPoint(229.5, 150)?.tagName)).toBe("circle");
  expect(await page.evaluate(() => document.elementFromPoint(154.5, 150)?.tagName)).toBe("path");
  expect(await page.evaluate(() => (window as any).clippingTest.clicks())).toBe(4);
  const mismatches = await page.evaluate(async path => {
    const { circleUnionPath } = await import(path);
    const context = document.createElement("canvas").getContext("2d")!;
    const cases = [
      [{ x: 100, y: 100 }, { x: 100, y: 100 }],
      [{ x: 100, y: 100 }, { x: 106, y: 100 }, { x: 103, y: 104 }],
      Array.from({ length: 6 }, (_, i) => ({ x: 100 + 12 * Math.cos(i * Math.PI / 3), y: 100 + 12 * Math.sin(i * Math.PI / 3) })),
      [{ x: 100, y: 100 }, { x: 116, y: 100 }, { x: 132, y: 100 }],
    ];
    const errors: string[] = [];
    for (const centers of cases) {
      const union = new Path2D(circleUnionPath(centers, 8));
      for (let x = 78.25; x < 143; x += 2) for (let y = 78.25; y < 123; y += 2) {
        const inside = centers.some(center => Math.hypot(x - center.x, y - center.y) < 8);
        if (context.isPointInPath(union, x, y, "evenodd") !== inside) errors.push(`${x},${y}`);
      }
    }
    return errors;
  }, `/@fs/${process.cwd().replaceAll("\\", "/")}/apps/web/src/modules/workbench/opd/core/circle-union.ts`);
  expect(mismatches).toEqual([]);
});
