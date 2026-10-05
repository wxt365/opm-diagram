import { expect, test, type Page } from "@playwright/test";
test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5176" });

test("空白右键启动全图布局，保留构造菜单并限制不可编辑状态", async ({ page }, info) => {
  page.setDefaultTimeout(10_000); await page.setViewportSize({ width: 1800, height: 1200 });
  const project = process.env.OPM_PLACEMENT_PROJECT;
  await page.goto(project ? `/projects/${project}` : "/projects");
  if (!project) {
    await page.getByTestId("p01-create-project").click(); await page.getByTestId("ov01-project-name").fill(`右键菜单 ${Date.now()}`);
    await page.getByRole("button", { name: "创建并继续", exact: true }).click();
  }
  await expect(page.getByTestId("p02-create-model")).toBeVisible(); const projectUrl = page.url();
  await page.getByTestId("p02-create-model").click(); await page.getByTestId("ov02-model-name").fill(`右键菜单验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
  const workbenchUrl = page.url(), modelId = new URL(workbenchUrl).pathname.split("/models/")[1]!.split("/")[0]!;
  const commands: Array<{ command: { command_type: string } }> = [];
  page.on("request", request => { if (/\/draft\/commands$/.test(new URL(request.url()).pathname)) commands.push(request.postDataJSON()); });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const menu = page.getByTestId("opd-blank-menu"), action = page.getByTestId("opd-blank-auto-layout");
  const owner = page.locator(".x6-node").filter({ hasText: "Object 1" }), processNode = page.locator(".x6-node").filter({ hasText: "Process 1" });
  const shapes = page.locator('.x6-node rect[data-opm-capture-cell-id],.x6-node ellipse[data-opm-capture-cell-id]');
  const geometry = () => shapes.evaluateAll(elements => elements.map(element => ({ id: element.getAttribute("data-opm-capture-cell-id"), transform: element.closest(".x6-node")!.getAttribute("transform") })));
  try {
    await openMenu(page); await expect(action).toBeDisabled();
    for (const id of ["opd-blank-undo", "opd-blank-redo", "opd-blank-arrange"]) await expect(page.getByTestId(id)).toBeDisabled();
    await page.keyboard.press("Escape"); await expect(menu).toHaveCount(0);
    await edit(page, () => page.getByTestId("p03-tool-object").click()); await edit(page, () => page.getByTestId("p03-tool-process").click());
    await owner.click({ position: { x: 20, y: 14 } });
    await openMenu(page); await expect(action).toBeEnabled(); await expect(owner.locator("rect").first()).toHaveAttribute("fill", "#eaf3fc");
    await expect(page.getByTestId("opd-blank-arrange")).toBeDisabled();
    await page.screenshot({ path: info.outputPath("blank-menu-desktop.png") });
    await page.keyboard.press("Escape"); await expect(menu).toHaveCount(0);
    await owner.click({ button: "right", position: { x: 20, y: 14 } });
    await expect(page.getByTestId("p03-construct-actions-menu")).toBeVisible(); await expect(page.getByTestId("p03-construct-delete-action").first()).toBeEnabled();
    await expect(menu).toHaveCount(0); await page.getByRole("button", { name: "关闭构造操作菜单" }).click();
    // 真实拖线后核验关系右键仍显示原操作菜单。
    await page.getByTestId("p03-relation-quick-option-CAP-ISO-PROC-001").click();
    await openMenu(page); await expect(action).toBeDisabled(); await page.keyboard.press("Escape");
    await edit(page, async () => {
      const a = (await owner.boundingBox())!, b = (await processNode.boundingBox())!;
      await page.mouse.move(a.x + 20, a.y + a.height / 2); await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await page.mouse.up();
    });
    await page.getByTestId("p03-tool-select").click();
    const edge = page.locator('.x6-edge path[data-opm-capture-cell-id]'); await expect(edge).toHaveCount(1);
    const point = await edge.evaluate(element => {
      const path = element as SVGPathElement, p = path.getPointAtLength(path.getTotalLength() / 2);
      const screen = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!); return { x: screen.x, y: screen.y };
    });
    await page.mouse.click(point.x, point.y, { button: "right" });
    await expect(page.getByTestId("p03-construct-add-refinement")).toHaveCount(0);
    await expect(page.getByTestId("p03-construct-actions-menu")).toBeVisible(); await expect(page.getByTestId("p03-construct-delete-action").first()).toBeEnabled();
    await expect(menu).toHaveCount(0); await page.getByRole("button", { name: "关闭构造操作菜单" }).click();
    const before = await geometry(), count = commands.length, identity = await page.getByTestId("hs-draft-identity").innerText();
    await openMenu(page); await action.click(); await expect(menu).toHaveCount(0); await expect(page.getByTestId("opd-auto-preview")).toBeVisible();
    await expect.poll(geometry).not.toEqual(before);
    await openMenu(page); await expect(action).toBeDisabled(); await page.keyboard.press("Escape");
    // 首次 Escape 只关闭顶层菜单，下一次才退出预览。
    await expect(menu).toHaveCount(0); await expect(page.getByTestId("opd-auto-preview")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("opd-auto-preview")).not.toBeVisible();
    expect(await geometry()).toEqual(before); expect(commands).toHaveLength(count);
    expect(await page.getByTestId("hs-draft-identity").innerText()).toBe(identity);
    await openMenu(page); await action.click(); await expect(page.getByTestId("opd-auto-preview")).toBeVisible();
    await page.getByTestId("opd-auto-cancel").click(); expect(await geometry()).toEqual(before); expect(commands).toHaveLength(count);
    await page.getByTestId("p03-tool-pan").click(); await openMenu(page); await action.click();
    await expect(page.getByTestId("opd-auto-preview")).toBeVisible(); const arranged = await geometry();
    await edit(page, () => page.getByTestId("opd-auto-apply").click());
    expect(commands).toHaveLength(count + 1); expect(commands.at(-1)!.command.command_type).toBe("UPDATE_LAYOUT_BATCH"); expect(await geometry()).toEqual(arranged);
    await openMenu(page); await expect(page.getByTestId("opd-blank-undo")).toBeEnabled(); await expect(page.getByTestId("opd-blank-redo")).toBeDisabled();
    await edit(page, () => page.getByTestId("opd-blank-undo").click()); expect(await geometry()).toEqual(before);
    await openMenu(page); await expect(page.getByTestId("opd-blank-redo")).toBeEnabled();
    await edit(page, () => page.getByTestId("opd-blank-redo").click()); expect(await geometry()).toEqual(arranged);
    await openMenu(page); await edit(page, () => page.getByTestId("opd-blank-undo").click()); expect(await geometry()).toEqual(before);
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    const versions = await page.getByTestId("p03-version-select").locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
    await openMenu(page); await page.getByTestId("p03-version-select").selectOption(versions[1]!);
    await expect(page.getByTestId("p03-readonly-banner")).toBeVisible(); await expect(menu).toHaveCount(0);
    await openMenu(page); await expect(action).toBeDisabled(); await page.keyboard.press("Escape");
    await openMenu(page); for (const id of ["opd-blank-undo", "opd-blank-redo", "opd-blank-arrange"]) await expect(page.getByTestId(id)).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.getByTestId("p03-return-head").click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    // 通过原右键菜单实际删除一个独立元素，再删除关系，验证菜单兼容。
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    const spare = page.locator(".x6-node").filter({ hasText: "Object 2" });
    await spare.click({ button: "right", position: { x: 20, y: 14 } });
    await edit(page, () => page.getByTestId("p03-construct-delete-action").first().click()); await expect(spare).toHaveCount(0);
    const deletePoint = await edge.evaluate(element => {
      const path = element as SVGPathElement, p = path.getPointAtLength(path.getTotalLength() / 2);
      const screen = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!); return { x: screen.x, y: screen.y };
    });
    await page.mouse.click(deletePoint.x, deletePoint.y, { button: "right" });
    await edit(page, () => page.getByTestId("p03-construct-delete-action").first().click()); await expect(edge).toHaveCount(0);
    await page.getByTestId("p03-tool-select").click();
    await owner.click({ position: { x: 20, y: 14 } }); await processNode.click({ modifiers: ["Shift"], position: { x: 20, y: 14 } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("p03-canvas").scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await openMenu(page, true); await expect(action).toBeEnabled();
    const bounds = (await menu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(8); expect(bounds.y).toBeGreaterThanOrEqual(8);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(382); expect(bounds.y + bounds.height).toBeLessThanOrEqual(836);
    await page.screenshot({ path: info.outputPath("blank-menu-mobile.png") });
    await page.getByTestId("opd-blank-arrange").click();
    await expect(page.getByTestId("opd-blank-layout-left")).toBeEnabled(); await expect(page.getByTestId("opd-blank-layout-distribute-x")).toBeDisabled();
    const submenuBounds = (await menu.boundingBox())!;
    expect(submenuBounds.x).toBeGreaterThanOrEqual(8); expect(submenuBounds.y).toBeGreaterThanOrEqual(8);
    expect(submenuBounds.x + submenuBounds.width).toBeLessThanOrEqual(382); expect(submenuBounds.y + submenuBounds.height).toBeLessThanOrEqual(836);
    await page.screenshot({ path: info.outputPath("blank-layout-menu-mobile.png") });
    await page.keyboard.press("Escape"); await expect(page.getByTestId("opd-blank-arrange")).toBeVisible();
    for (const item of [owner, processNode]) await expect(item.locator("rect,ellipse").first()).toHaveAttribute("fill", "#eaf3fc");
    await page.mouse.click(4, 4); await expect(menu).toHaveCount(0);
    await openMenu(page); await page.evaluate(() => window.scrollBy(0, -120)); await expect(menu).toHaveCount(0);
    expect(errors).toEqual([]);
  } catch (error) {
    console.error(String(error)); await page.screenshot({ path: info.outputPath("failure.png") }); throw error;
  } finally {
    await page.goto(workbenchUrl); await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.goto(projectUrl);
    await page.getByTestId(`p02-trash-${modelId}`).click(); await page.getByTestId("p02-lifecycle-confirm").click();
    await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
  }
});

async function openMenu(page: Page, corner = false) {
  const box = (await page.locator(".canvas-frame").boundingBox())!;
  // 用可见空白边缘避开元素、预览条与底部提示。
  const viewport = page.viewportSize()!;
  await page.mouse.click(corner ? Math.min(box.x + box.width - 10, viewport.width - 10) : box.x + 8,
    corner ? Math.min(box.y + box.height - 40, viewport.height - 10) : Math.max(8, box.y + 120), { button: "right" });
  await expect(page.getByTestId("opd-blank-menu")).toBeVisible();
}
async function edit(page: Page, action: () => Promise<unknown>) {
  const before = await page.getByTestId("hs-draft-identity").innerText(); await action(); await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(before);
  await expect(page.getByTestId("hs-save")).toBeEnabled();
}
