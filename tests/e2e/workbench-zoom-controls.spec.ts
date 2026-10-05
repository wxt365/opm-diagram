import { expect, test, type Page } from "@playwright/test";
import { chooseViewportAction } from "./viewport-controls";
test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5176" });

test("真实画布右下角缩放：输入、菜单、滚轮、全屏与窄屏", async ({ page }, info) => {
  const project = process.env.OPM_PLACEMENT_PROJECT; test.skip(!project, "需要明确本地测试项目");
  page.setDefaultTimeout(15_000); await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [], writes: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/\/draft\/(commands|save|pin)$/.test(new URL(request.url()).pathname)) writes.push(request.url()); });
  await page.goto(`/projects/${project}`); const projectUrl = page.url();
  await page.getByTestId("p02-create-model").click(); await page.getByTestId("ov02-model-name").fill(`右下角缩放验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
  const workbenchUrl = page.url(), model = new URL(workbenchUrl).pathname.split("/models/")[1]!.split("/")[0]!;
  try {
    await page.getByTestId("p03-tool-object").click();
    const node = page.locator(".x6-node").filter({ hasText: "Object 1" }); await expect(node).toBeVisible(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    const controls = page.getByTestId("p03-zoom-controls"), input = page.getByTestId("p03-zoom-output"), toggle = page.getByTestId("p03-zoom-menu-toggle");
    await expect(page.getByTestId("p03-canvas-toolchain").getByTestId("p03-zoom-controls")).toHaveCount(0);
    await expect(page.locator(".canvas-state")).toHaveCount(0); await expect(page.getByTestId("hs-draft-identity")).toBeVisible();
    await docked(page);
    await page.getByTestId("p03-relation-quick-option-CAP-ISO-PROC-001").click();
    await expect(page.locator(".canvas-state")).toContainText("拖到");
    await page.keyboard.press("Escape"); await expect(page.locator(".canvas-state")).toHaveCount(0);
    const identity = await page.getByTestId("hs-draft-identity").innerText(), count = writes.length, nodeTransform = await node.getAttribute("transform");
    await input.fill("85%"); await input.press("Enter"); await ratio(page, 85);
    await input.fill("125.5"); await toggle.click(); await ratio(page, 125.5);
    await expect(page.getByTestId("p03-zoom-menu")).toBeVisible();
    await page.getByTestId("p03-zoom-preset-150").click(); await ratio(page, 150);
    await toggle.click(); await expect(page.getByTestId("p03-zoom-preset-150")).toHaveAttribute("aria-checked", "true");
    await input.press("Escape"); await expect(page.getByTestId("p03-zoom-menu")).toHaveCount(0);
    await input.fill("25"); await input.press("Escape"); await ratio(page, 150);
    for (const value of ["", "abc", "0", "-50"]) {
      await input.fill(value); await input.press("Enter"); await ratio(page, 150); await expect(controls.getByRole("status")).toBeVisible();
    }
    await input.fill("999%"); await input.press("Enter"); await ratio(page, 400);
    await input.fill("0.001%"); await input.press("Enter"); await ratio(page, 0.01);
    await chooseViewportAction(page, "reset"); await ratio(page, 100);
    await page.getByTestId("p03-zoom-in").click(); await ratio(page, 110); await page.getByTestId("p03-zoom-out").click(); await ratio(page, 100);
    const frame = (await page.locator(".canvas-frame").boundingBox())!;
    await page.mouse.move(frame.x + 120, frame.y + 100); await page.mouse.wheel(0, -120);
    await expect.poll(async () => parseFloat(await input.inputValue())).toBeGreaterThan(100);
    const wheelZoom = parseFloat(await input.inputValue()); await ratio(page, wheelZoom);
    // 在缩放输入控件上滚轮，不应二次缩放画布。
    await input.hover(); await page.mouse.wheel(0, -120); await frames(page); await ratio(page, wheelZoom);
    await chooseViewportAction(page, "fit"); await ratio(page, 100);
    await toggle.click(); await page.getByTestId("p03-tool-select").click(); await expect(page.getByTestId("p03-zoom-menu")).toHaveCount(0);
    const fullscreen = page.getByTestId("p03-canvas-fullscreen"); await expect(fullscreen).toBeEnabled();
    await fullscreen.click(); await expect(fullscreen).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => document.fullscreenElement?.className)).toBe("editor-panel"); await docked(page); await canvasFilled(page);
    await input.fill("85"); await input.press("Enter"); await ratio(page, 85);
    await node.click({ position: { x: 20, y: 14 } }); await expect(node.locator("rect").first()).toHaveAttribute("fill", "#eaf3fc");
    await toggle.click(); await expect(page.getByTestId("p03-zoom-menu")).toBeVisible(); await menuContained(page);
    await page.screenshot({ path: info.outputPath("zoom-fullscreen.png") });
    await page.getByTestId("p03-zoom-preset-100").click(); await fullscreen.click(); await expect(fullscreen).toHaveAttribute("aria-pressed", "false");
    await fullscreen.click(); await expect(fullscreen).toHaveAttribute("aria-pressed", "true");
    await page.evaluate(() => document.exitFullscreen()); await expect(fullscreen).toHaveAttribute("aria-pressed", "false");
    await docked(page); await ratio(page, 100);
    // 视口操作不修改草稿或元素坐标。
    expect(writes).toHaveLength(count); await expect(page.getByTestId("hs-draft-identity")).toHaveText(identity); expect(await node.getAttribute("transform")).toBe(nodeTransform);
    await node.click({ position: { x: 20, y: 14 } }); await expect(node.locator("rect").first()).toHaveAttribute("fill", "#eaf3fc");
    const box = (await node.boundingBox())!; await page.mouse.move(box.x + 20, box.y + 14); await page.mouse.down();
    await page.mouse.move(box.x + 65, box.y + 46, { steps: 10 }); await page.mouse.up();
    await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(identity); await expect(page.getByTestId("hs-save")).toBeEnabled();
    await toggle.click(); await menuContained(page); await page.screenshot({ path: info.outputPath("zoom-desktop-menu.png") }); await input.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 }); await controls.scrollIntoViewIfNeeded(); await docked(page);
    await toggle.click(); await menuContained(page); await page.getByTestId("p03-zoom-preset-75").click(); await ratio(page, 75);
    await toggle.click(); await page.screenshot({ path: info.outputPath("zoom-mobile-menu.png") }); await input.press("Escape");
    await page.setViewportSize({ width: 1440, height: 1000 }); await chooseViewportAction(page, "fit");
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    const versions = await page.getByTestId("p03-version-select").locator("option").evaluateAll(items => items.map(item => (item as HTMLOptionElement).value));
    await page.getByTestId("p03-version-select").selectOption(versions[1]!); await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    const readonlyCount = writes.length; await input.fill("85%"); await input.press("Enter"); await ratio(page, 85);
    await fullscreen.click(); await expect(fullscreen).toHaveAttribute("aria-pressed", "true"); await chooseViewportAction(page, "fit");
    await fullscreen.click(); await expect(fullscreen).toHaveAttribute("aria-pressed", "false"); expect(writes).toHaveLength(readonlyCount); expect(errors).toEqual([]);
  } finally {
    await page.goto(workbenchUrl); await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.goto(projectUrl);
    await page.getByTestId(`p02-trash-${model}`).click(); await page.getByTestId("p02-lifecycle-confirm").click(); await expect(page.getByTestId("p02-lifecycle-dialog")).toHaveCount(0);
  }
});
async function frames(page: Page) { await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); }
async function ratio(page: Page, zoom: number) {
  await expect(page.getByTestId("p03-zoom-output")).toHaveValue(`${zoom}%`);
  await expect.poll(() => page.locator(".x6-graph-svg-viewport").evaluate(element => ((element as SVGGElement).transform.baseVal.consolidate()?.matrix.a ?? 1) * 100)).toBeCloseTo(zoom, 2);
}
async function docked(page: Page) {
  const surface = (await page.locator(".canvas-surface").boundingBox())!, controls = (await page.getByTestId("p03-zoom-controls").boundingBox())!;
  expect(surface.x + surface.width - controls.x - controls.width).toBeCloseTo(12, 0);
  expect(surface.y + surface.height - controls.y - controls.height).toBeCloseTo(12, 0);
}
async function menuContained(page: Page) {
  const surface = (await page.locator(".canvas-surface").boundingBox())!, menu = (await page.getByTestId("p03-zoom-menu").boundingBox())!;
  expect(menu.y).toBeGreaterThanOrEqual(surface.y); expect(menu.x).toBeGreaterThanOrEqual(surface.x);
  expect(menu.x + menu.width).toBeLessThanOrEqual(surface.x + surface.width); expect(menu.y + menu.height).toBeLessThanOrEqual(surface.y + surface.height);
}

async function canvasFilled(page: Page) {
  await expect.poll(async () => {
    const frame = (await page.locator(".canvas-frame").boundingBox())!, canvas = (await page.getByTestId("p03-canvas").boundingBox())!;
    return Math.abs(canvas.width - frame.width) + Math.abs(canvas.height - frame.height);
  }).toBeLessThan(2);
}
