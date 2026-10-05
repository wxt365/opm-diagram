import { expect, test, type Locator, type Page } from "@playwright/test";
import { chooseViewportAction } from "./viewport-controls";

test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5176" });

test("多选移动只提交一次，状态去重、撤销重做及保存重开", async ({ page }, info) => {
  page.setDefaultTimeout(10_000);
  await page.setViewportSize({ width: 1800, height: 1200 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const project = process.env.OPM_PLACEMENT_PROJECT;
  await page.goto(project ? `/projects/${project}` : "/projects");
  if (!project) {
    await page.getByTestId("p01-create-project").click();
    await page.getByTestId("ov01-project-name").fill(`布局回归 ${Date.now()}`);
    await page.getByRole("button", { name: "创建并继续", exact: true }).click();
  }
  await expect(page.getByTestId("p02-create-model")).toBeVisible();
  const projectUrl = page.url();
  await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill(`多选布局验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  const modelId = new URL(page.url()).pathname.split("/models/")[1]!.split("/")[0]!;
  try {
    await page.getByRole("button", { name: "收起底部面板 / Collapse bottom panel", exact: true }).click();
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    const owner = page.locator(".x6-node").filter({ hasText: "Object 1" });
    const child = page.locator(".x6-node").filter({ hasText: "State 1" });
    await owner.click({ position: { x: 20, y: 14 } });
    await expect(page.getByTestId("p03-tool-state")).toBeEnabled();
    await edit(page, () => page.getByTestId("p03-tool-state").click());
    await child.click();
    await page.getByTestId("p03-right-panel-open").click();
    await page.getByLabel("FINAL", { exact: true }).check();
    await edit(page, () => page.getByRole("button", { name: "保存 State", exact: true }).click());
    await page.getByTestId("p03-right-panel-close").click();
    for (let index = 2; index <= 3; index++) {
      await owner.click({ position: { x: 20, y: 14 } });
      await expect(page.getByTestId("p03-tool-state")).toBeEnabled();
      await edit(page, () => page.getByTestId("p03-tool-state").click());
    }
    const state2 = page.locator(".x6-node").filter({ hasText: "State 2" });
    const state3 = page.locator(".x6-node").filter({ hasText: "State 3" });
    const expanded = await geometry([owner, state3]);
    await state3.click();
    await edit(page, () => drag(page, state3, 0, -36));
    expect(Number((await geometry([owner]))[0]!.height)).toBeLessThan(Number(expanded[0]!.height));
    await edit(page, () => page.getByTestId("opd-undo-layout").click());
    expect(await geometry([owner, state3])).toEqual(expanded);
    await edit(page, () => page.getByTestId("opd-redo-layout").click());
    await edit(page, () => page.getByTestId("opd-undo-layout").click());
    expect(await geometry([owner, state3])).toEqual(expanded);
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    await edit(page, () => page.getByTestId("p03-tool-process").click());
    const other = page.locator(".x6-node").filter({ hasText: "Object 2" });
    const process = page.locator(".x6-node").filter({ hasText: "Process 1" });
    await owner.click({ position: { x: 20, y: 14 } });
    await edit(page, () => page.getByTestId("p03-tool-attribute").click());
    await owner.locator('[data-testid^="p03-feature-toggle-"]').click();
    const feature = page.locator(".x6-node").filter({ hasText: "Attribute 1" });
    await expect(feature).toBeVisible();
    // 通过三种修饰键选择对象、过程、特征和状态；owner+state 去重。
    await owner.click({ position: { x: 20, y: 14 } });
    const singleSelectionToolbar = await toolbarGeometry(page);
    await other.click({ modifiers: ["Shift"] });
    expect(await toolbarGeometry(page)).toEqual(singleSelectionToolbar);
    await process.click({ modifiers: ["Control"] });
    await feature.click({ modifiers: ["Meta"] });
    await child.click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("opd-selection-count")).toHaveCount(0);
    expect(await toolbarGeometry(page)).toEqual(singleSelectionToolbar);
    const nodes = [owner, other, process, feature, child, state2, state3];
    for (const node of nodes.slice(0, 5)) await expect(node.locator('rect,ellipse').first()).toHaveAttribute("fill", "#eaf3fc");
    const before = await geometry(nodes);
    const requests: Array<{ command: { command_type: string; payload: { layouts: unknown[] } } }> = [];
    page.on("request", request => {
      if (request.url().includes(`/models/${modelId}/draft/commands`)) requests.push(request.postDataJSON());
    });
    const seq = await editSeq(page);
    await edit(page, () => drag(page, owner, 64, 32));
    expect(await editSeq(page)).toBe(seq + 1);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.command.command_type).toBe("UPDATE_LAYOUT_BATCH");
    expect(requests[0]!.command.payload.layouts).toHaveLength(7);
    const after = await geometry(nodes);
    for (let index = 0; index < before.length; index++) {
      expect(after[index]!.x - before[index]!.x).toBeCloseTo(64, 0);
      expect(after[index]!.y - before[index]!.y).toBeCloseTo(32, 0);
    }
    const childId = await child.getAttribute("data-cell-id");
    const outline = page.locator(`.x6-node[data-cell-id="state.final-outline.${childId}"]`);
    const childBox = (await child.boundingBox())!, outlineBox = (await outline.boundingBox())!;
    expect(outlineBox.x - childBox.x).toBeCloseTo(3.5, 0);
    expect(outlineBox.y - childBox.y).toBeCloseTo(3.5, 0);
    await page.screenshot({ path: info.outputPath("multi-selection.png") });
    await edit(page, () => page.getByTestId("opd-undo-layout").click());
    expect(await geometry(nodes)).toEqual(before);
    await edit(page, () => page.keyboard.press("Control+Shift+z"));
    expect(await geometry(nodes)).toEqual(after);
    await edit(page, () => page.keyboard.press("Meta+z"));
    expect(await geometry(nodes)).toEqual(before);
    // 新移动丢弃重做分支；Shift 再点同一节点将其移出选择。
    await child.click({ modifiers: ["Shift"] });
    await expect(child.locator("rect").first()).toHaveAttribute("fill", "#ffffff");
    for (const node of [owner, other, process, feature]) await expect(node.locator("rect,ellipse").first()).toHaveAttribute("fill", "#eaf3fc");
    expect(await toolbarGeometry(page)).toEqual(singleSelectionToolbar);
    await edit(page, () => drag(page, owner, 32, 16));
    await expect(page.getByTestId("opd-redo-layout")).toBeDisabled();
    const saved = await geometry(nodes);
    await page.getByTestId("hs-save").click();
    await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    const historySeq = await editSeq(page);
    await page.reload();
    await expect(page.getByTestId("hs-save")).toBeEnabled();
    await owner.locator('[data-testid^="p03-feature-toggle-"]').click();
    expect(await geometry(nodes)).toEqual(saved);
    expect(await editSeq(page)).toBe(historySeq);
    await expect(page.getByTestId("opd-undo-layout")).toBeDisabled();
    await expect(page.getByTestId("opd-redo-layout")).toBeDisabled();
    const rejectedBefore = await geometry(nodes); const rejectedSeq = await editSeq(page);
    await page.route(`**/models/${modelId}/draft/commands`, route => route.fulfill({ status: 422, contentType: "application/json",
      body: JSON.stringify({ code: "DRAFT_EDIT_REJECTED", message: "布局拒绝验证", retryable: false, reason_code: null }) }), { times: 1 });
    await drag(page, owner, 32, 16);
    await expect(page.getByTestId("p03-command-feedback")).toContainText("布局拒绝验证");
    expect(await editSeq(page)).toBe(rejectedSeq);
    expect(await geometry(nodes)).toEqual(rejectedBefore);
    await expect(page.getByTestId("opd-undo-layout")).toBeDisabled();
    await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    // 响应拒绝保留原请求；恢复会查询 receipt 并以同一 command_id 重试。
    await page.getByTestId("hs-retry-delivery").click();
    await expect(page.getByTestId("hs-save")).toBeEnabled();
    expect(await editSeq(page)).toBe(rejectedSeq + 1);
    // 当前图以外的切换清理历史，EXACT 只读时拖动不产生请求。
    await owner.click({ position: { x: 20, y: 14 } });
    await edit(page, () => drag(page, owner, 16, 16));
    const parentTestId = (await page.getByTestId("opd-navigator").locator('[aria-current="page"]').getAttribute("data-testid"))!;
    await page.getByTestId(parentTestId.replace("p03-context-", "opd-add-")).click();
    await page.getByTestId("opd-refinement-name").fill("布局子图");
    await page.getByTestId("opd-refine").click();
    await expect(page.getByTestId("opd-parent")).toBeVisible();
    await expect(page.getByTestId("opd-undo-layout")).toBeDisabled();
    await page.getByTestId("opd-parent").click();
    await expect(owner).toBeVisible();
    await expect(page.getByTestId("opd-undo-layout")).toBeDisabled();
    await page.getByTestId("hs-save").click();
    await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    const versions = await page.getByTestId("p03-version-select").locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
    await page.getByTestId("p03-version-select").selectOption(versions[1]!);
    await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    const readonlyBefore = await geometry([owner]); const count = requests.length;
    await drag(page, owner, 48, 32);
    expect(await geometry([owner])).toEqual(readonlyBefore); expect(requests).toHaveLength(count);
    await page.getByTestId("p03-return-head").click();
    await expect(page.getByTestId("hs-save")).toBeEnabled();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("p03-tool-select")).toBeVisible();
    await expect(page.getByTestId("opd-undo-layout")).toBeVisible();
    await chooseViewportAction(page, "fit");
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await owner.click({ position: { x: 3, y: 3 } });
    const mobileToolbar = await toolbarGeometry(page);
    await other.click({ position: { x: 3, y: 3 }, modifiers: ["Shift"] });
    await expect(owner.locator("rect").first()).toHaveAttribute("fill", "#eaf3fc");
    await expect(other.locator("rect").first()).toHaveAttribute("fill", "#eaf3fc");
    expect(await toolbarGeometry(page)).toEqual(mobileToolbar);
    await expect(page.getByTestId("opd-selection-count")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("multi-selection-mobile.png") });
    await other.click({ position: { x: 3, y: 3 }, modifiers: ["Shift"] });
    await expect(other.locator("rect").first()).toHaveAttribute("fill", "#ffffff");
    expect(await toolbarGeometry(page)).toEqual(mobileToolbar);
    await page.getByTestId("p03-canvas").click({ position: { x: 4, y: 4 } });
    await expect(owner.locator("rect").first()).toHaveAttribute("fill", "#ffffff");
    expect(await toolbarGeometry(page)).toEqual(mobileToolbar);
    expect(errors).toEqual([]);
  } finally {
    await page.goto(projectUrl);
    await page.getByTestId(`p02-trash-${modelId}`).click();
    await page.getByTestId("p02-lifecycle-confirm").click();
    await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
  }
});

async function toolbarGeometry(page: Page) {
  return page.getByTestId("p03-canvas-toolchain").evaluate(toolbar => {
    const origin = toolbar.getBoundingClientRect();
    return { height: origin.height, controls: [...toolbar.querySelectorAll("button,output")].map(control => {
      const box = control.getBoundingClientRect();
      return { id: control.getAttribute("data-testid"), x: box.x - origin.x + toolbar.scrollLeft,
        y: box.y - origin.y + toolbar.scrollTop, width: box.width, height: box.height };
    }) };
  });
}

async function editSeq(page: Page) {
  return Number((await page.getByTestId("hs-draft-identity").innerText()).split("编辑 ")[1]);
}
async function edit(page: Page, action: () => Promise<unknown>) {
  const before = await page.getByTestId("hs-draft-identity").innerText();
  await action();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(before);
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  await expect(page.getByTestId("p03-tool-object")).toBeEnabled();
}
async function drag(page: Page, node: Locator, dx: number, dy: number) {
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 14);
  await page.mouse.down();
  await page.mouse.move(box.x + 20 + dx, box.y + 14 + dy, { steps: 12 });
  await page.mouse.up();
}
async function geometry(nodes: Locator[]) {
  return Promise.all(nodes.map(node => node.evaluate(element => {
    const body = element.querySelector('rect,ellipse')!;
    return { x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y,
      transform: element.getAttribute("transform"), width: body.getAttribute("width") ?? body.getAttribute("rx"), height: body.getAttribute("height") ?? body.getAttribute("ry") };
  })));
}
