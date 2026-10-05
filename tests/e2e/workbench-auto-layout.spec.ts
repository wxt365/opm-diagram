import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5176" });

test("真实画布自动布局预览、取消、确认、失败恢复及保存重开", async ({ page }, info) => {
  test.setTimeout(180_000); page.setDefaultTimeout(10_000);
  await page.setViewportSize({ width: 1800, height: 1200 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const project = process.env.OPM_PLACEMENT_PROJECT;
  await page.goto(project ? `/projects/${project}` : "/projects");
  if (!project) {
    await page.getByTestId("p01-create-project").click();
    await page.getByTestId("ov01-project-name").fill(`自动布局验证 ${Date.now()}`);
    await page.getByRole("button", { name: "创建并继续", exact: true }).click();
  }
  await expect(page.getByTestId("p02-create-model")).toBeVisible(); const projectUrl = page.url();
  await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill(`自动布局验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  const workbenchUrl = page.url();
  const modelId = new URL(page.url()).pathname.split("/models/")[1]!.split("/")[0]!;
  const requests: Array<{ command: { command_type: string; payload: { layouts: unknown[] } } }> = [];
  page.on("request", request => { if (request.url().includes(`/models/${modelId}/draft/commands`)) requests.push(request.postDataJSON()); });
  try {
    await page.getByTestId("opd-layout-menu-toggle").click(); await expect(page.getByTestId("opd-layout-auto")).toBeDisabled(); await page.keyboard.press("Escape");
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    const owner = node(page, "Object 1"), state = node(page, "State 1");
    for (let index = 0; index < 3; index++) {
      await owner.click({ position: { x: 20, y: 14 } }); await edit(page, () => page.getByTestId("p03-tool-state").click());
    }
    await state.click(); await page.getByTestId("p03-right-panel-open").click(); await page.getByLabel("FINAL", { exact: true }).check();
    await edit(page, () => page.getByRole("button", { name: "保存 State", exact: true }).click()); await page.getByTestId("p03-right-panel-close").click();
    await edit(page, () => page.getByTestId("p03-tool-process").click());
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    const process = node(page, "Process 1"), output = node(page, "Object 2");
    await page.getByRole("button", { name: "收起底部面板 / Collapse bottom panel", exact: true }).click();
    for (const [index, item] of [owner, process, output].entries()) {
      await item.click({ position: { x: 20, y: 14 } }); const box = (await item.boundingBox())!;
      await edit(page, () => drag(page, item, Math.round(([450, 800, 600][index]! - box.x) / 16) * 16,
        Math.round(([450, 650, 900][index]! - box.y) / 16) * 16));
    }
    await owner.click({ position: { x: 20, y: 14 } }); await edit(page, () => page.getByTestId("p03-tool-attribute").click());
    await owner.locator('[data-testid^="p03-feature-toggle-"]').click(); const feature = node(page, "Attribute 1");
    await expect(feature).toBeVisible();
    await tool(page, "CAP-ISO-PROC-006"); await edit(page, () => connect(page, state, process)); await page.getByTestId("p03-tool-select").click();
    await tool(page, "CAP-ISO-PROC-001"); await edit(page, () => connect(page, process, output)); await page.getByTestId("p03-tool-select").click();
    const semanticEdges = page.locator('.x6-edge path[data-opm-capture-cell-id]'); await expect(semanticEdges).toHaveCount(2);
    const nodes = [owner, process, output, feature, state, node(page, "State 2"), node(page, "State 3")];
    const before = await geometry(nodes), beforeEdges = await edgeGeometry(page), seq = await editSeq(page), count = requests.length;
    await preview(page);
    await expect(page.getByTestId("opd-auto-preview")).toContainText("尚未应用");
    await expect.poll(() => geometry(nodes)).not.toEqual(before);
    const right = await geometry(nodes); expect(requests).toHaveLength(count); expect(await editSeq(page)).toBe(seq);
    expect(await edgeGeometry(page)).not.toEqual(beforeEdges);
    expect(right[0]!.x + right[0]!.width).toBeLessThan(right[3]!.x);
    expect(right[3]!.x + right[3]!.width).toBeLessThan(right[1]!.x);
    expect(right[1]!.x + right[1]!.width).toBeLessThan(right[2]!.x);
    const featureBox = right[3]!;
    const crossesFeature = await semanticEdges.evaluateAll((elements, box) => elements.some(element => {
      const path = element as SVGPathElement, length = path.getTotalLength(), transform = path.getScreenCTM()!;
      for (let step = 0; step <= 100; step++) {
        const point = path.getPointAtLength(length * step / 100), screen = new DOMPoint(point.x, point.y).matrixTransform(transform);
        if (screen.x > box.x && screen.x < box.x + box.width && screen.y > box.y && screen.y < box.y + box.height) return true;
      }
      return false;
    }), featureBox);
    expect(crossesFeature).toBe(false);
    for (let index = 4; index < 7; index++) {
      expect(right[index]!.x - right[0]!.x).toBeCloseTo(before[index]!.x - before[0]!.x, 1);
      expect(right[index]!.y - right[0]!.y).toBeCloseTo(before[index]!.y - before[0]!.y, 1);
    }
    await assertFinalOutline(page, state);
    await page.screenshot({ path: info.outputPath("auto-layout-preview-right.png") });
    // 预览期间尝试拖动，不改变临时几何或草稿。
    await drag(page, output, 32, 32); expect(await geometry(nodes)).toEqual(right); expect(requests).toHaveLength(count);
    await page.getByTestId("opd-auto-direction").selectOption("down");
    await expect.poll(() => geometry(nodes)).not.toEqual(right); const down = await geometry(nodes);
    expect(down[0]!.y + down[0]!.height).toBeLessThan(down[1]!.y); expect(down[1]!.y + down[1]!.height).toBeLessThan(down[2]!.y);
    await page.getByTestId("opd-auto-cancel").click(); await expect(page.getByTestId("opd-auto-preview")).not.toBeVisible();
    expect(await geometry(nodes)).toEqual(before); expect(await edgeGeometry(page)).toEqual(beforeEdges); expect(requests).toHaveLength(count);
    await preview(page); await page.keyboard.press("Escape"); await expect(page.getByTestId("opd-auto-preview")).not.toBeVisible();
    expect(await geometry(nodes)).toEqual(before); expect(requests).toHaveLength(count);
    await preview(page); await edit(page, () => page.getByTestId("opd-auto-apply").click());
    await expect(page.getByTestId("opd-auto-preview")).not.toBeVisible(); expect(requests).toHaveLength(count + 1);
    expect(requests.at(-1)!.command.command_type).toBe("UPDATE_LAYOUT_BATCH"); expect(await geometry(nodes)).toEqual(right);
    await edit(page, () => page.getByTestId("opd-undo-layout").click()); expect(await geometry(nodes)).toEqual(before); expect(await edgeGeometry(page)).toEqual(beforeEdges);
    await edit(page, () => page.getByTestId("opd-redo-layout").click()); expect(await geometry(nodes)).toEqual(right);
    // 再次布局已经符合当前方向：无预览、无请求。
    const stable = requests.length; await preview(page, false);
    await expect(page.getByTestId("p03-command-feedback")).toContainText("已符合该自动布局"); expect(requests).toHaveLength(stable);
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    await page.reload(); await expect(page.getByTestId("hs-save")).toBeEnabled(); await owner.locator('[data-testid^="p03-feature-toggle-"]').click();
    expect(await geometry(nodes)).toEqual(right); await assertFinalOutline(page, state); await expect(semanticEdges).toHaveCount(2);
    const opl = await page.getByTestId("p03-opl-sentence").allTextContents(); expect(opl.join(" ")).toContain("Process 1");
    await preview(page, false); await expect(page.getByTestId("opd-auto-preview")).not.toBeVisible();
    // 改为另一方向预览后切换版本，旧预览必须消失。
    // 当前已是横向规则，直接预览会零变化；通过真实拖动建立不同初始几何。
    await output.click({ position: { x: 20, y: 14 } }); await edit(page, () => drag(page, output, 0, 64));
    await preview(page);
    const versions = await page.getByTestId("p03-version-select").locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
    await page.getByTestId("p03-version-select").selectOption(versions[1]!); await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    await expect(page.getByTestId("opd-auto-preview")).not.toBeVisible(); await expect(page.getByTestId("opd-layout-menu-toggle")).toHaveCount(0);
    await page.getByTestId("p03-return-head").click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    await owner.locator('[data-testid^="p03-feature-toggle-"]').click();
    // 拒绝应用时恢复服务器已确认坐标，待确认队列使用已有恢复入口。
    const rejectedBefore = await geometry(nodes), rejectedSeq = await editSeq(page); await preview(page);
    await page.route(`**/models/${modelId}/draft/commands`, route => route.fulfill({ status: 422, contentType: "application/json",
      body: JSON.stringify({ code: "DRAFT_EDIT_REJECTED", message: "自动布局拒绝验证", retryable: false, reason_code: null }) }), { times: 1 });
    await page.getByTestId("opd-auto-apply").click(); await expect(page.getByTestId("p03-command-feedback")).toContainText("自动布局拒绝验证");
    await expect(page.getByTestId("opd-auto-preview")).not.toBeVisible(); expect(await geometry(nodes)).toEqual(rejectedBefore); expect(await editSeq(page)).toBe(rejectedSeq);
    await page.getByTestId("hs-retry-delivery").click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    await expect(feature).toBeVisible(); expect(await geometry(nodes)).toEqual(right);
    expect(await page.getByTestId("p03-opl-sentence").allTextContents()).toEqual(opl);
    // 窄屏通过选择一个节点并移动制造新布局，预览控件均可见且不越界。
    await output.click({ position: { x: 20, y: 14 } }); await edit(page, () => drag(page, output, 0, 64));
    await page.setViewportSize({ width: 390, height: 844 }); await preview(page);
    await page.getByTestId("opd-auto-direction").selectOption("down");
    const bar = page.getByTestId("opd-auto-preview"), bounds = (await bar.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    const mobileOwner = (await geometry([owner]))[0]!;
    expect(mobileOwner.y + mobileOwner.height).toBeLessThanOrEqual(bounds.y);
    await expect(page.getByTestId("opd-auto-cancel")).toBeInViewport(); await expect(page.getByTestId("opd-auto-apply")).toBeInViewport();
    await page.screenshot({ path: info.outputPath("auto-layout-preview-mobile.png") }); await page.keyboard.press("Escape");
    await expect(bar).not.toBeVisible(); expect(errors).toEqual([]);
  } catch (error) {
    await info.attach("原始失败", { body: String(error), contentType: "text/plain" });
    console.error(String(error));
    await page.screenshot({ path: info.outputPath("failure.png") }); throw error;
  } finally {
    // 若失败发生于拒绝验证阶段，先恢复本测试的待确认请求，避免留下活动模型。
    await page.goto(workbenchUrl);
    if (await page.getByTestId("hs-retry-delivery").isVisible()) await page.getByTestId("hs-retry-delivery").click();
    await expect(page.getByTestId("hs-save")).toBeEnabled();
    await page.goto(projectUrl); await page.getByTestId(`p02-trash-${modelId}`).click(); await page.getByTestId("p02-lifecycle-confirm").click();
    await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
  }
});
function node(page: Page, name: string) { return page.locator(".x6-node").filter({ hasText: name }); }
async function editSeq(page: Page) { return Number((await page.getByTestId("hs-draft-identity").innerText()).split("编辑 ")[1]); }
async function edit(page: Page, action: () => Promise<unknown>) {
  const before = await page.getByTestId("hs-draft-identity").innerText(); await action(); await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(before);
  await expect(page.getByTestId("hs-save")).toBeEnabled(); await expect(page.getByTestId("p03-tool-object")).toBeEnabled();
}
async function preview(page: Page, changed = true) {
  await page.getByTestId("opd-layout-menu-toggle").click(); await page.getByTestId("opd-layout-auto").click();
  if (changed) await expect(page.getByTestId("opd-auto-preview")).toBeVisible();
}
async function tool(page: Page, capability: string) {
  const quick = page.getByTestId(`p03-relation-quick-option-${capability}`);
  if (await quick.count()) await quick.click();
  else { await page.getByTestId("p03-relation-menu-toggle-PROCEDURAL").click(); await page.getByTestId(`p03-relation-menu-option-${capability}`).click(); }
}
async function connect(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!, b = (await to.boundingBox())!;
  await page.mouse.move(a.x + 20, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await page.mouse.up();
}
async function drag(page: Page, item: Locator, dx: number, dy: number) {
  const box = (await item.boundingBox())!; await page.mouse.move(box.x + 20, box.y + 14); await page.mouse.down();
  await page.mouse.move(box.x + 20 + dx, box.y + 14 + dy, { steps: 12 }); await page.mouse.up();
}
async function geometry(nodes: Locator[]) {
  // 草稿 ready 早于 X6 异步挂载；等待真实 SVG 几何，避免把未挂载节点的零框当成模型坐标。
  await Promise.all(nodes.map(node => expect(node.locator("rect,ellipse").first()).toBeVisible()));
  return Promise.all(nodes.map(node => node.evaluate(element => {
  const box = element.querySelector("rect,ellipse")!.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height };
}))); }
async function edgeGeometry(page: Page) { return page.locator('.x6-edge path[data-opm-capture-cell-id]').evaluateAll(elements => elements.map(element => ({ id: element.getAttribute("data-opm-capture-cell-id"), path: element.getAttribute("d") }))); }
async function assertFinalOutline(page: Page, state: Locator) {
  const id = await state.getAttribute("data-cell-id"), outline = page.locator(`.x6-node[data-cell-id="state.final-outline.${id}"]`);
  const child = (await state.boundingBox())!, box = (await outline.boundingBox())!;
  expect(box.x - child.x).toBeCloseTo(3.5, 0); expect(box.y - child.y).toBeCloseTo(3.5, 0);
}

test("既有五个案例只预览自动布局，取消后几何与编辑序号不变", async ({ page }, info) => {
  const project = process.env.OPM_PLACEMENT_PROJECT;
  test.skip(project !== "project.9ae0e3dd46ae4f3a8b45520c5057ecd7", "仅在明确的本地案例项目执行只读预览验证");
  await page.setViewportSize({ width: 1800, height: 1400 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const writes: string[] = []; page.on("request", request => { if (/\/draft\/(commands|save|pin)$/.test(new URL(request.url()).pathname)) writes.push(request.url()); });
  const cases = ["仓储订单履约-客户演示", "仓储订单履约-工具校验-CTRL", "仓储订单履约-工具校验-PROC", "仓储订单履约-工具校验-STRUCT", "仓储订单履约-工具校验-NEG"];
  for (const [index, name] of cases.entries()) {
    await page.goto(`/projects/${project}`);
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
    await card.getByRole("button", { name: "打开工作台", exact: true }).click();
    await expect(page.getByTestId("hs-save")).toBeEnabled();
    const captures = page.locator('.x6-node rect[data-opm-capture-cell-id],.x6-node ellipse[data-opm-capture-cell-id]');
    await expect(captures.first()).toBeVisible(); const seq = await editSeq(page);
    const positions = async () => captures.evaluateAll(elements => elements.map(element => ({ id: element.getAttribute("data-opm-capture-cell-id"), transform: element.closest(".x6-node")!.getAttribute("transform") })).sort((a, b) => a.id!.localeCompare(b.id!)));
    const before = await positions(); await preview(page, false);
    if (await page.getByTestId("opd-auto-preview").isVisible()) {
      await page.getByTestId("opd-auto-direction").selectOption("down");
      await page.screenshot({ path: info.outputPath(`existing-case-${index + 1}.png`) });
      await page.getByTestId("opd-auto-cancel").click();
    } else await expect(page.getByTestId("p03-command-feedback")).toContainText("已符合该自动布局");
    await expect.poll(positions).toEqual(before); expect(await editSeq(page)).toBe(seq);
  }
  expect(writes).toEqual([]); expect(errors).toEqual([]);
  await page.goto(`/projects/${project}`); await expect(page.locator("article")).toHaveCount(5);
});
