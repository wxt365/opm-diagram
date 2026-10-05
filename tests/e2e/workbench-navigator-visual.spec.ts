import { expect, test, type Page } from "@playwright/test";
test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5176" });

test("三级OPD导航、长名称、创建细化和窄屏展示", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); page.setDefaultTimeout(10_000);
  const project = process.env.OPM_PLACEMENT_PROJECT;
  test.skip(!project, "需要明确本地测试项目");
  await page.goto(`/projects/${project}`); const projectUrl = page.url();
  const modelName = `仓储订单履约客户演示与三级导航视觉验证-${Date.now()}`;
  await page.getByTestId("p02-create-model").click(); await page.getByTestId("ov02-model-name").fill(modelName);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
  const workbenchUrl = page.url(), modelId = new URL(workbenchUrl).pathname.split("/models/")[1]!.split("/")[0]!;
  const navigatorPanel = page.getByTestId("opd-navigator"), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await expect(page.getByTestId("opd-refinement-panel")).toHaveCount(0);
    const rootId = (await navigatorPanel.locator('[aria-current="page"]').getAttribute("data-testid"))!;
    await expect(page.getByTestId(rootId)).toHaveText(modelName);
    await expect(page.getByTestId(rootId)).toHaveAttribute("title", `${modelName}（SD · 根图）`);
    await expect(page.getByTestId(rootId.replace("p03-context-", "opd-add-"))).toHaveAttribute("aria-label", `在 ${modelName} 下创建子图`);
    await expect(page.getByTestId(rootId).locator(".context-tree__label")).toHaveCSS("text-overflow", "ellipsis");
    await openAdd(page); await expect(page.getByTestId("opd-refinement-panel")).toContainText("请先在画布选择");
    await page.getByTestId("opd-refinement-cancel").click(); await expect(page.getByTestId("opd-refinement-panel")).toHaveCount(0);
    await page.getByTestId("p03-tool-object").click(); await openAdd(page); await expect(page.getByTestId("opd-refine")).toBeEnabled();
    const name = "订单履约细化：库存确认、发货与异常协调";
    await page.getByTestId("opd-refinement-name").fill(name); await page.getByTestId("opd-refine").click();
    await expect(page.getByTestId("opd-parent")).toBeVisible(); await expect(navigatorPanel.locator('[aria-current="page"]')).toContainText(name);
    const childTestId = (await navigatorPanel.locator('[aria-current="page"]').getAttribute("data-testid"))!;
    await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.getByTestId("p03-tool-process").click();
    await openAdd(page); await expect(page.getByTestId("opd-refine")).toBeEnabled(); await page.getByTestId("opd-refinement-name").fill("异常处置细化");
    await page.getByTestId("opd-refine").click(); await expect(navigatorPanel.locator('[aria-current="page"]')).toContainText("异常处置细化");
    await expect(navigatorPanel.locator(".navigator-count")).toHaveText("3");
    await page.getByTestId("opd-parent").click(); await expect(page.getByTestId(childTestId)).toHaveAttribute("aria-current", "page");
    const processNode = page.locator(".x6-node").filter({ hasText: "Process 1" });
    await processNode.click({ position: { x: 20, y: 14 } }); await expect(page.getByTestId("opd-refinement-panel")).toHaveCount(0);
    await openAdd(page); await expect(page.getByTestId("opd-refine")).toBeEnabled();
    await expect(page.getByTestId("opd-refinement-name")).toBeFocused();
    await page.getByTestId("opd-refinement-name").press("Escape"); await expect(page.getByTestId("opd-refinement-panel")).toHaveCount(0);
    await openAdd(page);
    await page.getByTestId("opd-refinement-name").fill("异常处置细化：缺货与客户确认");
    await assertBounds(page); await expect(page.getByTestId(childTestId)).toHaveAttribute("title", new RegExp(name));
    await expect(page.getByTestId("opd-parent")).toHaveCount(1);
    await expect(page.getByTestId(childTestId).locator("..").getByTestId("opd-parent")).toBeVisible();
    await expect(navigatorPanel.locator(".navigator-parent")).toHaveCount(0);
    const plusBefore = (await page.getByTestId(childTestId.replace("p03-context-", "opd-add-")).boundingBox())!.x;
    await expect(page.getByTestId("opd-refine")).toHaveCSS("background-color", "rgb(11, 107, 203)");
    await page.screenshot({ path: info.outputPath("navigator-desktop.png") });
    await page.getByTestId("opd-refinement-name").fill(""); await expect(page.getByTestId("opd-refine")).toBeDisabled();
    await page.getByTestId("opd-refinement-name").fill("异常处置细化");
    await page.setViewportSize({ width: 390, height: 844 }); await navigatorPanel.scrollIntoViewIfNeeded();
    await assertBounds(page); await page.screenshot({ path: info.outputPath("navigator-mobile.png") });
    await page.setViewportSize({ width: 1440, height: 1000 });
    // 非当前行的＋先切图，再打开该父图的创建区，不产生创建命令。
    await page.getByTestId(rootId.replace("p03-context-", "opd-add-")).click();
    await expect(page.getByTestId("opd-parent")).toHaveCount(0);
    expect((await page.getByTestId(childTestId.replace("p03-context-", "opd-add-")).boundingBox())!.x).toBe(plusBefore);
    await expect(page.getByTestId(rootId)).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("opd-refinement-panel")).toBeVisible();
    await page.getByTestId(childTestId.replace("p03-context-", "opd-add-")).click();
    await expect(page.getByTestId(childTestId)).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("opd-refinement-panel")).toBeVisible();
    await page.getByTestId("opd-refinement-cancel").click();
    await expect(navigatorPanel.locator(".navigator-count")).toHaveText("3");
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    const versions = await page.getByTestId("p03-version-select").locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
    await page.getByTestId("p03-version-select").selectOption(versions[1]!); await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    await expect(page.getByTestId("opd-refine")).toHaveCount(0);
    for (const add of await navigatorPanel.locator(".context-tree__add").all()) await expect(add).toBeDisabled();
    await page.getByTestId("opd-parent").click(); await expect(navigatorPanel.locator('[aria-current="page"]')).toHaveText(modelName);
    expect(errors).toEqual([]);
  } finally {
    await page.goto(workbenchUrl); await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.goto(projectUrl);
    await page.getByTestId(`p02-trash-${modelId}`).click(); await page.getByTestId("p02-lifecycle-confirm").click();
    await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
  }
});

test("元素右键创建及展开子图、边框标记和只读导航", async ({ page }, info) => {
  const project = process.env.OPM_PLACEMENT_PROJECT;
  test.skip(!project, "需要明确本地测试项目");
  page.setDefaultTimeout(10_000); await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/projects/${project}`); const projectUrl = page.url();
  await page.getByTestId("p02-create-model").click(); await page.getByTestId("ov02-model-name").fill(`元素右键细化验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
  const workbenchUrl = page.url(), modelId = new URL(workbenchUrl).pathname.split("/models/")[1]!.split("/")[0]!;
  const commands: Array<{ command: { command_type: string; payload: { context_id: string; refinee_element_id: string } } }> = [];
  page.on("request", request => { if (/\/draft\/commands$/.test(new URL(request.url()).pathname)) commands.push(request.postDataJSON()); });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const menu = page.getByTestId("p03-construct-actions-menu"), add = page.getByTestId("p03-construct-add-refinement");
  const first = page.locator(".x6-node").filter({ hasText: "Object 1" }), second = page.locator(".x6-node").filter({ hasText: "Object 2" });
  const processNode = page.locator(".x6-node").filter({ hasText: "Process 1" });
  try {
    const rootTestId = (await page.getByTestId("opd-navigator").locator('[aria-current="page"]').getAttribute("data-testid"))!;
    const rootId = rootTestId.replace("p03-context-", "");
    for (const tool of ["p03-tool-object", "p03-tool-state", "p03-tool-object", "p03-tool-process"]) {
      await expect(page.getByTestId(tool)).toBeEnabled();
      const token = await page.getByTestId("hs-draft-identity").innerText();
      await page.getByTestId(tool).click(); await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(token);
      await expect(page.getByTestId("hs-save")).toBeEnabled();
    }
    const state = page.locator(".x6-node").filter({ hasText: "State 1" });
    await state.click({ button: "right", position: { x: 10, y: 10 } }); await expect(menu).toBeVisible(); await expect(add).toHaveCount(0);
    await expect(page.getByTestId("p03-construct-expand-refinement")).toHaveCount(0);
    await page.getByRole("button", { name: "关闭构造操作菜单" }).click();
    await first.click({ position: { x: 20, y: 14 } });
    const secondId = (await second.getAttribute("data-cell-id"))!;
    await expect(second.locator("rect").first()).toHaveAttribute("stroke-width", "2");
    const before = await page.getByTestId("hs-draft-identity").innerText(), count = commands.length;
    await second.click({ button: "right", position: { x: 20, y: 14 } }); await expect(add).toBeEnabled();
    await expect(page.getByTestId("p03-construct-delete-action").first()).toBeEnabled();
    await page.screenshot({ path: info.outputPath("element-refinement-menu.png") });
    await add.click(); await expect(menu).toHaveCount(0);
    await expect(page.getByTestId("opd-refinement-panel")).toContainText("细化：Object 2");
    await expect(page.getByTestId("opd-refinement-name")).toBeFocused();
    await page.getByTestId("opd-refinement-cancel").click();
    expect(commands).toHaveLength(count); await expect(page.getByTestId("hs-draft-identity")).toHaveText(before);
    await second.click({ button: "right", position: { x: 20, y: 14 } }); await add.click();
    await page.getByTestId("opd-refinement-name").fill("Object 2细化"); await page.getByTestId("opd-refine").click();
    await expect(page.getByTestId("opd-navigator").locator('[aria-current="page"]')).toContainText("Object 2细化");
    expect(commands.filter(command => command.command.command_type === "CREATE_CONTEXT").at(-1)?.command.payload)
      .toMatchObject({ context_id: rootId, refinee_element_id: secondId });
    await page.getByTestId("opd-parent").click(); await expect(page.getByTestId(rootTestId)).toHaveAttribute("aria-current", "page");
    await expect(second.locator("rect").first()).toHaveAttribute("stroke-width", "4");
    await expect(second.locator("rect").first()).toHaveAttribute("data-opm-has-child-opd", "true");
    await expect(second.locator("rect title")).toContainText("已有子图");
    await first.click({ position: { x: 20, y: 14 } });
    await expect(first.locator("rect").first()).toHaveAttribute("stroke-width", "2");
    await expect(second.locator("rect").first()).toHaveAttribute("stroke-width", "4");
    await expect(processNode.locator("ellipse").first()).toHaveAttribute("stroke-width", "2");
    const expand = page.getByTestId("p03-construct-expand-refinement");
    await second.click({ button: "right", position: { x: 20, y: 14 } }); await expect(add).toHaveCount(0); await expect(expand).toBeEnabled();
    const beforeExpand = commands.length, beforeExpandToken = await page.getByTestId("hs-draft-identity").innerText();
    await page.screenshot({ path: info.outputPath("refined-element-menu.png") });
    await expand.click();
    await expect(page.getByTestId("opd-navigator").locator('[aria-current="page"]')).toContainText("Object 2细化");
    await expect(page.getByTestId("hs-draft-identity")).toHaveText(beforeExpandToken); expect(commands).toHaveLength(beforeExpand);
    await page.getByTestId("opd-parent").click(); await expect(page.getByTestId(rootTestId)).toHaveAttribute("aria-current", "page");
    await second.click({ button: "right", position: { x: 20, y: 14 } });
    await page.getByTestId("p03-construct-open-properties").click(); await expect(page.getByTestId("p03-right-panel")).toBeVisible();
    await page.getByTestId("p03-right-panel-close").click();
    const processId = (await processNode.getAttribute("data-cell-id"))!;
    await processNode.click({ button: "right", position: { x: 20, y: 14 } }); await expect(add).toBeEnabled(); await add.click();
    await expect(page.getByTestId("opd-refinement-panel")).toContainText("细化：Process 1");
    await page.getByTestId("opd-refinement-name").fill("Process 1细化"); await page.getByTestId("opd-refine").click();
    await expect(page.getByTestId("opd-navigator").locator('[aria-current="page"]')).toContainText("Process 1细化");
    expect(commands.filter(command => command.command.command_type === "CREATE_CONTEXT").at(-1)?.command.payload)
      .toMatchObject({ context_id: rootId, refinee_element_id: processId });
    await page.getByTestId("opd-parent").click(); await expect(page.getByTestId(rootTestId)).toHaveAttribute("aria-current", "page");
    await expect(processNode.locator("ellipse").first()).toHaveAttribute("stroke-width", "4");
    await expect(state.locator("rect").first()).toHaveAttribute("stroke-width", "2");
    await processNode.click({ button: "right", position: { x: 20, y: 14 } }); await expect(expand).toBeEnabled(); await expand.click();
    await expect(page.getByTestId("opd-navigator").locator('[aria-current="page"]')).toContainText("Process 1细化");
    await page.getByTestId("opd-parent").click(); await expect(page.getByTestId(rootTestId)).toHaveAttribute("aria-current", "page");
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    await page.reload(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    await expect(page.getByTestId("opd-navigator").locator(".navigator-count")).toHaveText("3");
    await expect(second.locator("rect").first()).toHaveAttribute("stroke-width", "4");
    await expect(processNode.locator("ellipse").first()).toHaveAttribute("stroke-width", "4");
    const versions = await page.getByTestId("p03-version-select").locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
    await page.getByTestId("p03-version-select").selectOption(versions[1]!); await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    await expect(second.locator("rect").first()).toHaveAttribute("stroke-width", "4");
    await expect(first.locator("rect").first()).toHaveAttribute("stroke-width", "2");
    await second.click({ button: "right", position: { x: 20, y: 14 } }); await expect(expand).toBeEnabled();
    await expect(page.getByTestId("p03-construct-delete-action")).toHaveCount(0);
    const readonlyCommandCount = commands.length;
    await page.screenshot({ path: info.outputPath("readonly-refined-menu.png") });
    await expand.click(); await expect(page.getByTestId("opd-navigator").locator('[aria-current="page"]')).toContainText("Object 2细化");
    await expect(page.getByTestId("p03-readonly-banner")).toBeVisible(); await expect(page.getByTestId("p03-version-select")).toHaveValue(versions[1]!);
    await page.getByTestId("opd-parent").click(); await expect(page.getByTestId(rootTestId)).toHaveAttribute("aria-current", "page");
    await first.click({ button: "right", position: { x: 20, y: 14 } }); await expect(add).toBeDisabled(); await expect(expand).toHaveCount(0);
    await expect(page.getByTestId("p03-construct-delete-action")).toHaveCount(0); expect(commands).toHaveLength(readonlyCommandCount);
    expect(errors).toEqual([]);
  } catch (error) {
    await page.screenshot({ path: info.outputPath("element-refinement-failure.png") });
    throw error;
  } finally {
    await page.goto(workbenchUrl); await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.goto(projectUrl);
    await page.getByTestId(`p02-trash-${modelId}`).click(); await page.getByTestId("p02-lifecycle-confirm").click();
    await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
  }
});

async function assertBounds(page: Page) {
  const panel = page.getByTestId("opd-navigator"), bounds = (await panel.boundingBox())!;
  for (const item of await panel.locator("button,input").all()) {
    const box = (await item.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(bounds.x); expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  }
  await expect(panel.locator(".context-tree__item svg.context-tree__icon")).toHaveCount(3);
}

async function openAdd(page: Page) {
  const current = (await page.getByTestId("opd-navigator").locator('[aria-current="page"]').getAttribute("data-testid"))!;
  await page.getByTestId(current.replace("p03-context-", "opd-add-")).click();
  await expect(page.getByTestId("opd-refinement-panel")).toBeVisible();
}
