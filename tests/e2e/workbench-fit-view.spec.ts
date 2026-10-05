import { chooseViewportAction } from "./viewport-controls";
import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5176" });

test("真实画布适应、选择、缩放、平移、预览恢复、应用和只读", async ({ page }, info) => {
  test.setTimeout(180_000); page.setDefaultTimeout(10_000);
  await page.setViewportSize({ width: 1800, height: 1200 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const project = process.env.OPM_PLACEMENT_PROJECT;
  await page.goto(project ? `/projects/${project}` : "/projects");
  if (!project) {
    await page.getByTestId("p01-create-project").click(); await page.getByTestId("ov01-project-name").fill(`视口验证 ${Date.now()}`);
    await page.getByRole("button", { name: "创建并继续", exact: true }).click();
  }
  await expect(page.getByTestId("p02-create-model")).toBeVisible(); const projectUrl = page.url();
  await page.getByTestId("p02-create-model").click(); await page.getByTestId("ov02-model-name").fill(`适应画布验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  const workbenchUrl = page.url(), modelId = new URL(workbenchUrl).pathname.split("/models/")[1]!.split("/")[0]!;
  const writes: string[] = []; page.on("request", request => { if (/\/draft\/(commands|save|pin)$/.test(new URL(request.url()).pathname)) writes.push(request.url()); });
  try {
    await chooseViewportAction(page, "fit"); await expect(page.getByTestId("p03-zoom-output")).toHaveValue("100%");
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    const owner = node(page, "Object 1"), state = node(page, "State 1");
    await owner.click({ position: { x: 20, y: 14 } }); await edit(page, () => page.getByTestId("p03-tool-state").click());
    await edit(page, () => page.getByTestId("p03-tool-process").click());
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    const process = node(page, "Process 1"), output = node(page, "Object 2");
    await chooseViewportAction(page, "reset");
    await owner.click({ position: { x: 20, y: 14 } }); await edit(page, () => page.getByTestId("p03-tool-attribute").click());
    await owner.locator('[data-testid^="p03-feature-toggle-"]').click(); await expect(node(page, "Attribute 1")).toBeVisible();
    await page.getByTestId("p03-relation-quick-option-CAP-ISO-PROC-001").click(); await edit(page, () => connect(page, owner, process));
    await page.getByTestId("p03-tool-select").click();
    await page.getByTestId("p03-relation-quick-option-CAP-ISO-PROC-001").click(); await edit(page, () => connect(page, process, output));
    await page.getByTestId("p03-tool-select").click();
    await page.getByRole("button", { name: "收起底部面板 / Collapse bottom panel", exact: true }).click();
    // 缩小后真实拖动，把模型延伸到原视口外。
    for (let index = 0; index < 8; index++) await page.getByTestId("p03-zoom-out").click();
    await expect(page.getByTestId("p03-zoom-output")).toHaveValue("20%");
    await edit(page, () => drag(page, output, 350, 180));
    const beforeFitCount = writes.length, identity = await page.getByTestId("hs-draft-identity").innerText();
    await fit(page); const fitZoom = await zoom(page); expect(fitZoom).toBeLessThan(100);
    expect(writes).toHaveLength(beforeFitCount); expect(await page.getByTestId("hs-draft-identity").innerText()).toBe(identity);
    const fitted = await viewport(page); await output.click({ position: { x: 4, y: 4 } }); expect(await viewport(page)).toEqual(fitted);
    await expect(state).toBeVisible();
    await page.screenshot({ path: info.outputPath("fit-desktop.png") });
    await page.getByTestId("p03-zoom-in").click(); await expect.poll(() => zoom(page)).toBeCloseTo(fitZoom + 10, 2);
    await chooseViewportAction(page, "reset"); await expect(page.getByTestId("p03-zoom-output")).toHaveValue("100%");
    await fit(page); await page.getByTestId("p03-tool-pan").click();
    const frame = (await page.locator(".canvas-frame").boundingBox())!;
    await page.mouse.move(frame.x + 10, frame.y + 10); await page.mouse.down();
    await page.mouse.move(frame.x + 34, frame.y + 42, { steps: 8 }); await page.mouse.up();
    expect(await viewport(page)).not.toEqual(fitted); await page.getByTestId("p03-tool-select").click();
    const beforePreview = await viewport(page), count = writes.length;
    await preview(page); await fit(page); await page.getByTestId("opd-auto-direction").selectOption("down"); await contained(page);
    await page.keyboard.press("Escape"); await expect(page.getByTestId("opd-auto-preview")).not.toBeVisible();
    await expect.poll(() => viewport(page)).toEqual(beforePreview); expect(writes).toHaveLength(count);
    // 服务端拒绝时还原原视口，待确认队列仍由既有入口恢复。
    await preview(page); await page.getByTestId("opd-auto-direction").selectOption("down"); await fit(page);
    await page.route(`**/models/${modelId}/draft/commands`, route => route.fulfill({ status: 422, contentType: "application/json",
      body: JSON.stringify({ code: "DRAFT_EDIT_REJECTED", message: "视口失败恢复验证", retryable: false, reason_code: null }) }), { times: 1 });
    await page.getByTestId("opd-auto-apply").click(); await expect(page.getByTestId("p03-command-feedback")).toContainText("视口失败恢复验证");
    await expect(page.getByTestId("opd-auto-preview")).not.toBeVisible(); await expect.poll(() => viewport(page)).toEqual(beforePreview);
    await page.getByTestId("hs-retry-delivery").click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    const applyCount = writes.length;
    await preview(page); await fit(page); const previewView = await viewport(page);
    await edit(page, () => page.getByTestId("opd-auto-apply").click()); await expect(page.getByTestId("opd-auto-preview")).not.toBeVisible();
    await expect.poll(() => viewport(page)).toEqual(previewView); expect(writes).toHaveLength(applyCount + 1);
    // 从桌面切到窄屏，适应模式应按外层可见宽度重新计算。
    await page.setViewportSize({ width: 390, height: 844 }); await contained(page); await fit(page);
    await page.getByTestId("p03-canvas").scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("fit-mobile.png") });
    await page.setViewportSize({ width: 1800, height: 1200 }); await fit(page);
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    const versions = await page.getByTestId("p03-version-select").locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
    await page.getByTestId("p03-version-select").selectOption(versions[1]!); await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    const readonlyWrites = writes.length; await fit(page); await chooseViewportAction(page, "reset"); await fit(page);
    expect(writes).toHaveLength(readonlyWrites); expect(errors).toEqual([]);
  } catch (error) {
    console.error(String(error)); await info.attach("原始失败", { body: String(error), contentType: "text/plain" });
    await page.screenshot({ path: info.outputPath("failure.png") }); throw error;
  } finally {
    await page.goto(workbenchUrl);
    if (await page.getByTestId("hs-retry-delivery").isVisible()) await page.getByTestId("hs-retry-delivery").click();
    await expect(page.getByTestId("hs-save")).toBeEnabled();
    await page.goto(projectUrl); await page.getByTestId(`p02-trash-${modelId}`).click(); await page.getByTestId("p02-lifecycle-confirm").click();
    await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
  }
});

test("五个既有案例桌面和窄屏完整适应，预览取消不写入模型", async ({ page }, info) => {
  const project = process.env.OPM_PLACEMENT_PROJECT;
  test.skip(project !== "project.9ae0e3dd46ae4f3a8b45520c5057ecd7", "仅在明确的本地案例项目只读核验");
  const errors: string[] = [], writes: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/\/draft\/(commands|save|pin)$/.test(new URL(request.url()).pathname)) writes.push(request.url()); });
  const cases = ["仓储订单履约-客户演示", "仓储订单履约-工具校验-CTRL", "仓储订单履约-工具校验-PROC", "仓储订单履约-工具校验-STRUCT", "仓储订单履约-工具校验-NEG"];
  for (const [index, name] of cases.entries()) {
    await page.setViewportSize({ width: 1800, height: 1400 }); await page.goto(`/projects/${project}`);
    await page.locator("article").filter({ has: page.getByRole("heading", { name, exact: true }) }).getByRole("button", { name: "打开工作台", exact: true }).click();
    await expect(page.getByTestId("hs-save")).toBeEnabled();
    await expect(page.locator('.x6-node rect[data-opm-capture-cell-id],.x6-node ellipse[data-opm-capture-cell-id]').first()).toBeVisible();
    const identity = await page.getByTestId("hs-draft-identity").innerText();
    const positions = () => page.locator(".x6-node").evaluateAll(elements => elements.map(element => ({ id: element.getAttribute("data-cell-id"), transform: element.getAttribute("transform") })).sort((a,b) => a.id!.localeCompare(b.id!)));
    const before = await positions(); await fit(page);
    await page.screenshot({ path: info.outputPath(`fit-case-${index + 1}-desktop.png`) });
    await page.getByTestId("opd-layout-menu-toggle").click(); await page.getByTestId("opd-layout-auto").click();
    if (await page.getByTestId("opd-auto-preview").isVisible()) {
      await fit(page); await page.getByTestId("opd-auto-direction").selectOption("down"); await contained(page);
      await page.getByTestId("opd-auto-cancel").click(); await expect(page.getByTestId("opd-auto-preview")).not.toBeVisible(); await contained(page);
    }
    await page.setViewportSize({ width: 390, height: 844 }); await contained(page); await fit(page);
    await page.getByTestId("p03-canvas").scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`fit-case-${index + 1}-mobile.png`) });
    expect(await positions()).toEqual(before); expect(await page.getByTestId("hs-draft-identity").innerText()).toBe(identity);
  }
  expect(writes).toEqual([]); expect(errors).toEqual([]);
  await page.goto(`/projects/${project}`); await expect(page.locator("article")).toHaveCount(5);
});

function node(page: Page, name: string) { return page.locator(".x6-node").filter({ hasText: name }); }
async function edit(page: Page, action: () => Promise<unknown>) {
  const before = await page.getByTestId("hs-draft-identity").innerText(); await action();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(before); await expect(page.getByTestId("hs-save")).toBeEnabled();
  await expect(page.getByTestId("p03-tool-object")).toBeEnabled();
}
async function drag(page: Page, item: Locator, dx: number, dy: number) {
  const box = (await item.boundingBox())!; await page.mouse.move(box.x + box.width / 4, box.y + box.height / 4); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 4 + dx, box.y + box.height / 4 + dy, { steps: 12 }); await page.mouse.up();
}
async function connect(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!, b = (await to.boundingBox())!;
  await page.mouse.move(a.x + 20, a.y + a.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await page.mouse.up();
}
async function preview(page: Page) {
  await page.getByTestId("opd-layout-menu-toggle").click(); await page.getByTestId("opd-layout-auto").click(); await expect(page.getByTestId("opd-auto-preview")).toBeVisible();
}
async function zoom(page: Page) { return parseFloat(await page.getByTestId("p03-zoom-output").inputValue()); }
async function viewport(page: Page) {
  return page.locator(".x6-graph-svg-viewport").evaluate(element => {
    const matrix = (element as SVGGElement).transform.baseVal.consolidate()!.matrix;
    return { scale: matrix.a, tx: matrix.e, ty: matrix.f };
  });
}
async function fit(page: Page) {
  await chooseViewportAction(page, "fit");
  // 适应等待 X6 的异步 SVG 挂载；读屏幕矩阵前等待对应绘制帧。
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await contained(page);
}
async function contained(page: Page) {
  await expect.poll(() => page.locator(".x6-graph-svg-stage").evaluate(element => {
    const content = element.getBoundingClientRect(), frame = element.closest(".canvas-frame")!.getBoundingClientRect();
    return content.width > 0 && content.height > 0 && content.left >= frame.left + 30 && content.right <= frame.right - 30
      && content.top >= frame.top + 30 && content.bottom <= frame.bottom - 30;
  })).toBe(true);
  await expect.poll(async () => Math.abs((await viewport(page)).scale * 100 - await zoom(page))).toBeLessThan(0.005);
}
