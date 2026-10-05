import { chooseViewportAction } from "./viewport-controls";
import { expect, test, type Page } from "@playwright/test";
test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5176" });

test("真实画布滚轮缩放：鼠标锚点、上下限、平移和只读、元素选择移动", async ({ page }, info) => {
  const project = process.env.OPM_PLACEMENT_PROJECT;
  test.skip(!project, "需要明确本地测试项目");
  page.setDefaultTimeout(15_000); await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [], writes: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/\/draft\/(commands|save|pin)$/.test(new URL(request.url()).pathname)) writes.push(request.url()); });
  await page.goto(`/projects/${project}`); const projectUrl = page.url();
  await page.getByTestId("p02-create-model").click(); await page.getByTestId("ov02-model-name").fill(`滚轮缩放验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
  const workbenchUrl = page.url(), model = new URL(workbenchUrl).pathname.split("/models/")[1]!.split("/")[0]!;
  try {
    await page.getByTestId("p03-tool-object").click();
    const node = page.locator(".x6-node").filter({ hasText: "Object 1" }); await expect(node).toBeVisible(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    await chooseViewportAction(page, "fit"); await frames(page);
    const box = (await page.locator(".canvas-frame").boundingBox())!, anchor = { x: box.x + 180, y: box.y + 130 };
    const before = await matrix(page), local = { x: (anchor.x - before.left - before.tx) / before.scale, y: (anchor.y - before.top - before.ty) / before.scale };
    const beforeNode = await node.getAttribute("transform"), identity = await page.getByTestId("hs-draft-identity").innerText(), count = writes.length;
    await page.mouse.move(anchor.x, anchor.y); await wheel(page, -120);
    const after = await matrix(page); expect(after.scale).toBeGreaterThan(before.scale);
    expect(after.left + after.tx + local.x * after.scale).toBeCloseTo(anchor.x, 1);
    expect(after.top + after.ty + local.y * after.scale).toBeCloseTo(anchor.y, 1);
    await expect.poll(() => zoom(page)).toBeCloseTo(after.scale * 100, 2);
    // resize不能覆盖刚刚手动滚轮得到的视口。
    await page.setViewportSize({ width: 1500, height: 1000 }); await frames(page); expect((await matrix(page)).scale).toBe(after.scale);
    await wheel(page, 120); expect((await matrix(page)).scale).toBeLessThan(after.scale);
    await page.getByTestId("p03-tool-pan").click(); await page.mouse.move(anchor.x, anchor.y);
    const panScale = (await matrix(page)).scale; await wheel(page, -120); expect((await matrix(page)).scale).toBeGreaterThan(panScale);
    await page.getByTestId("p03-tool-select").click();
    expect(writes).toHaveLength(count); await expect(page.getByTestId("hs-draft-identity")).toHaveText(identity); expect(await node.getAttribute("transform")).toBe(beforeNode);
    await chooseViewportAction(page, "reset"); await expect(page.getByTestId("p03-zoom-output")).toHaveValue("100%");
    // 画布外滚动不会改变比例。
    await page.getByTestId("opd-navigator").hover(); await wheel(page, -120); await expect(page.getByTestId("p03-zoom-output")).toHaveValue("100%");
    // 名称输入期间，仅画布接收滚轮；覆盖输入框不触发视口缩放。
    await node.dblclick({ position: { x: 30, y: 14 } }); const editor = page.getByTestId("p03-name-editor"); await expect(editor).toBeVisible();
    await editor.hover(); await wheel(page, -120); await expect(page.getByTestId("p03-zoom-output")).toHaveValue("100%"); await editor.press("Escape");
    await page.mouse.move(anchor.x, anchor.y);
    for (let index = 0; index < 14; index++) await wheel(page, -120);
    await expect(page.getByTestId("p03-zoom-output")).toHaveValue("400%"); expect((await matrix(page)).scale).toBe(4);
    for (let index = 0; index < 65; index++) await wheel(page, 120);
    await expect(page.getByTestId("p03-zoom-output")).toHaveValue("0.01%"); expect((await matrix(page)).scale).toBeCloseTo(0.0001, 6);
    await chooseViewportAction(page, "reset"); await chooseViewportAction(page, "fit"); await frames(page);
    await page.mouse.move(anchor.x, anchor.y); await wheel(page, -120);
    // 缩放后仍能选择和拖动真实元素。
    await node.click({ position: { x: 20, y: 14 } }); await expect(node.locator("rect").first()).toHaveAttribute("fill", "#eaf3fc");
    const dragBox = (await node.boundingBox())!; await page.mouse.move(dragBox.x + 20, dragBox.y + 14); await page.mouse.down();
    const dragScale = (await matrix(page)).scale; await wheel(page, -120); expect((await matrix(page)).scale).toBe(dragScale);
    await page.mouse.move(dragBox.x + 68, dragBox.y + 46, { steps: 10 }); await page.mouse.up();
    await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(identity); await expect(page.getByTestId("hs-save")).toBeEnabled();
    expect(await node.getAttribute("transform")).not.toBe(beforeNode);
    await page.getByTestId("p03-zoom-in").click(); await expect.poll(() => zoom(page)).toBeCloseTo(dragScale * 100 + 10, 2);
    await page.screenshot({ path: info.outputPath("wheel-zoom-desktop.png") });
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    const versions = await page.getByTestId("p03-version-select").locator("option").evaluateAll(items => items.map(item => (item as HTMLOptionElement).value));
    await page.getByTestId("p03-version-select").selectOption(versions[1]!); await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    const readonlyCount = writes.length, readonlyScale = (await matrix(page)).scale;
    await page.mouse.move(anchor.x, anchor.y); await wheel(page, -120); expect((await matrix(page)).scale).toBeGreaterThan(readonlyScale);
    expect(writes).toHaveLength(readonlyCount); expect(errors).toEqual([]);
  } finally {
    await page.goto(workbenchUrl); await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.goto(projectUrl);
    await page.getByTestId(`p02-trash-${model}`).click(); await page.getByTestId("p02-lifecycle-confirm").click(); await expect(page.getByTestId("p02-lifecycle-dialog")).toHaveCount(0);
  }
});
async function frames(page: Page) { await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); }
async function wheel(page: Page, delta: number) { await page.mouse.wheel(0, delta); await frames(page); }
async function zoom(page: Page) { return parseFloat(await page.getByTestId("p03-zoom-output").inputValue()); }
async function matrix(page: Page) { return page.locator(".x6-graph-svg-viewport").evaluate(element => {
  const m = (element as SVGGElement).transform.baseVal.consolidate()?.matrix ?? new DOMMatrix(), bounds = element.closest(".opd-canvas")!.getBoundingClientRect();
  return { scale: m.a, tx: m.e, ty: m.f, left: bounds.left, top: bounds.top };
}); }
