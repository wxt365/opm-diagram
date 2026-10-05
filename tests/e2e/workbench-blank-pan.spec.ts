import { chooseViewportAction } from "./viewport-controls";
import { expect, test, type Locator, type Page } from "@playwright/test";
test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5176" });

test("选择模式直接拖动空白，保留选择且不写模型", async ({ page }, info) => {
  page.setDefaultTimeout(10_000); await page.setViewportSize({ width: 1800, height: 1200 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const project = process.env.OPM_PLACEMENT_PROJECT;
  await page.goto(project ? `/projects/${project}` : "/projects");
  if (!project) {
    await page.getByTestId("p01-create-project").click(); await page.getByTestId("ov01-project-name").fill(`空白平移 ${Date.now()}`);
    await page.getByRole("button", { name: "创建并继续", exact: true }).click();
  }
  await expect(page.getByTestId("p02-create-model")).toBeVisible(); const projectUrl = page.url();
  await page.getByTestId("p02-create-model").click(); await page.getByTestId("ov02-model-name").fill(`空白平移验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
  const workbenchUrl = page.url(), modelId = new URL(workbenchUrl).pathname.split("/models/")[1]!.split("/")[0]!;
  const writes: string[] = []; page.on("request", request => { if (/\/draft\/(commands|save|pin)$/.test(new URL(request.url()).pathname)) writes.push(request.url()); });
  const owner = page.locator(".x6-node").filter({ hasText: "Object 1" }), processNode = page.locator(".x6-node").filter({ hasText: "Process 1" });
  try {
    await edit(page, () => page.getByTestId("p03-tool-object").click()); await edit(page, () => page.getByTestId("p03-tool-process").click());
    await owner.click({ position: { x: 20, y: 14 } }); await processNode.click({ modifiers: ["Shift"] });
    const before = await owner.boundingBox(), identity = await page.getByTestId("hs-draft-identity").innerText(), count = writes.length;
    const frame = (await page.locator(".canvas-frame").boundingBox())!;
    await pan(page, frame.x + 8, frame.y + 8, 64, 40);
    const after = (await owner.boundingBox())!;
    expect(after.x - before!.x).toBeCloseTo(64, 0); expect(after.y - before!.y).toBeCloseTo(40, 0);
    for (const item of [owner, processNode]) await expect(item.locator("rect,ellipse").first()).toHaveAttribute("fill", "#eaf3fc");
    await expect(page.getByTestId("p03-tool-select")).toHaveAttribute("aria-pressed", "true");
    expect(writes).toHaveLength(count); expect(await page.getByTestId("hs-draft-identity").innerText()).toBe(identity);
    await expect(page.getByTestId("opd-undo-layout")).toBeDisabled();
    // 释放到画布外，再移动鼠标应保持视口；点击空白仍清空选择。
    await pan(page, frame.x + 8, frame.y + 8, -30, 20);
    const released = await owner.boundingBox(); await page.mouse.move(frame.x + 180, frame.y + 20); expect(await owner.boundingBox()).toEqual(released);
    await page.getByTestId("p03-canvas").click({ position: { x: 8, y: 8 } });
    for (const item of [owner, processNode]) await expect(item.locator("rect,ellipse").first()).toHaveAttribute("fill", "#ffffff");
    await owner.click({ position: { x: 20, y: 14 } }); const nodeBefore = (await owner.boundingBox())!;
    await edit(page, () => dragNode(page, owner, 32, 16)); const nodeAfter = (await owner.boundingBox())!;
    expect(nodeAfter.x - nodeBefore.x).toBeCloseTo(32, 0); expect(nodeAfter.y - nodeBefore.y).toBeCloseTo(16, 0);
    // 状态指定之外的简单生成/消耗关系通过真实拖线创建，空白平移不抢占关系手势。
    await page.getByTestId("p03-relation-quick-option-CAP-ISO-PROC-001").click();
    await edit(page, async () => {
      const a = (await owner.boundingBox())!, b = (await processNode.boundingBox())!;
      await page.mouse.move(a.x + 20, a.y + a.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await page.mouse.up();
    });
    await expect(page.locator('.x6-edge path[data-opm-capture-cell-id]')).toHaveCount(1); await page.getByTestId("p03-tool-select").click();
    await page.getByTestId("opd-layout-menu-toggle").click(); await page.getByTestId("opd-layout-auto").click(); await expect(page.getByTestId("opd-auto-preview")).toBeVisible();
    const previewCount = writes.length; await pan(page, frame.x + 8, frame.y + 120, 20, 20); expect(writes).toHaveLength(previewCount);
    await page.getByTestId("opd-auto-cancel").click();
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    const versions = await page.getByTestId("p03-version-select").locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
    await page.getByTestId("p03-version-select").selectOption(versions[1]!); await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    const readonlyCount = writes.length, readonlyBefore = (await owner.boundingBox())!;
    await pan(page, frame.x + 8, frame.y + 8, 24, 20); const readonlyAfter = (await owner.boundingBox())!;
    expect(readonlyAfter.x - readonlyBefore.x).toBeCloseTo(24, 0); expect(writes).toHaveLength(readonlyCount);
    await page.getByTestId("p03-tool-pan").click(); await pan(page, frame.x + 8, frame.y + 8, -24, -20); await page.getByTestId("p03-tool-select").click();
    await page.setViewportSize({ width: 390, height: 844 }); await chooseViewportAction(page, "fit");
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.getByTestId("p03-canvas").scrollIntoViewIfNeeded();
    const mobile = (await page.locator(".canvas-frame").boundingBox())!; const mobileBefore = (await owner.boundingBox())!;
    await pan(page, mobile.x + 8, Math.max(8, mobile.y + 8), 20, 16); const mobileAfter = (await owner.boundingBox())!;
    expect(mobileAfter.x - mobileBefore.x).toBeCloseTo(20, 0); expect(mobileAfter.y - mobileBefore.y).toBeCloseTo(16, 0);
    expect(writes).toHaveLength(readonlyCount); expect(errors).toEqual([]); await page.screenshot({ path: info.outputPath("blank-pan-mobile.png") });
  } catch (error) {
    console.error(String(error)); await page.screenshot({ path: info.outputPath("failure.png") }); throw error;
  } finally {
    await page.goto(workbenchUrl); if (await page.getByTestId("hs-retry-delivery").isVisible()) await page.getByTestId("hs-retry-delivery").click();
    await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.goto(projectUrl);
    await page.getByTestId(`p02-trash-${modelId}`).click(); await page.getByTestId("p02-lifecycle-confirm").click(); await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
  }
});
async function edit(page: Page, action: () => Promise<unknown>) {
  const before = await page.getByTestId("hs-draft-identity").innerText(); await action(); await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(before);
  await expect(page.getByTestId("hs-save")).toBeEnabled(); await expect(page.getByTestId("p03-tool-object")).toBeEnabled();
}
async function pan(page: Page, x: number, y: number, dx: number, dy: number) {
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 12 }); await page.mouse.up();
}
async function dragNode(page: Page, item: Locator, dx: number, dy: number) { const box = (await item.boundingBox())!; await pan(page, box.x + 20, box.y + 14, dx, dy); }
