import { expect, test, type Locator, type Page } from "@playwright/test";
import { copyWorkbenchPermalink } from "./helpers/workbench-revision";

const chromeExecutable = process.env.OPM_E2E_CHROME_EXECUTABLE;
test.use(chromeExecutable ? { launchOptions: { executablePath: chromeExecutable } } : {});

test("头部操作区与全部检查器状态在桌面和窄屏保持清晰且不重叠", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openNewWorkbench(page);

  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  const object = canvasNode(page, "Object 1");
  const process = canvasNode(page, "Process 1");
  await object.click({ position: { x: 20, y: 14 } });
  await page.getByTestId("p03-right-panel-open").click();

  const header = page.locator(".workbench-header");
  const context = page.locator(".workbench-header__context");
  const status = page.locator(".workbench-header__status");
  const inspector = page.getByTestId("p03-right-panel");
  await expect(header).toBeVisible();
  await expect(page.locator(".workbench-header__revision-group")).toBeVisible();
  await expect(page.locator(".workbench-header__actions")).toBeVisible();
  await expect(page.getByTestId("p03-run-validation").locator("svg")).toBeVisible();
  await expect(page.locator(".inspector-panel__title")).toContainText("对象");
  await expect(page.locator(".inspector-section__heading")).toContainText(["基本信息", "标识信息"]);
  expect((await inspector.boundingBox())!.width).toBeGreaterThanOrEqual(315);
  await expectNoOverlap(context, status);
  await expect(page.locator(".workbench-header__context strong")).toHaveAttribute("title", /^语义审查修正/);
  await expect(page.locator(".workbench-header .back-link")).toHaveAttribute("title", /^项目 \/ 智能助手/);
  await expectHeaderControlsAligned(page);
  await expectInspectorValuesContained(inspector);
  await page.screenshot({ path: test.info().outputPath("header-element-desktop.png") });
  await header.screenshot({ path: test.info().outputPath("header-desktop.png") });

  await object.click({ position: { x: 20, y: 14 } });
  await commitAndRead(page, page.getByTestId("p03-tool-state"));
  const state = canvasNode(page, "State 1");
  await expect(state).toBeVisible();
  await state.click();
  await expect(page.getByTestId("p03-state-inspector")).toBeVisible();
  await expect(page.getByTestId("p03-state-inspector").locator(".inspector-section__heading")).toContainText([
    "基本信息", "状态角色", "显示方式", "标识信息",
  ]);
  await expect(page.getByRole("button", { name: "保存 State", exact: true })).toHaveClass(/button--primary/);
  await expectInspectorValuesContained(inspector);
  await page.screenshot({ path: test.info().outputPath("state-inspector-desktop.png") });

  await page.getByTestId("p03-right-panel-close").click();
  await object.click({ position: { x: 20, y: 14 } });
  const revision = await revisionTag(page);
  await page.getByTestId("p03-relation-quick-option-CAP-ISO-PROC-001").click();
  await dragRelationEndpoint(page, object, process);
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(revision);
  await page.getByTestId("p03-opl-sentence").filter({ hasText: "Process 1 consumes Object 1." }).click();
  await page.getByTestId("p03-right-panel-open").click();
  await expect(page.locator(".inspector-panel__title")).toContainText("关系");
  await expect(page.locator(".inspector-section__heading")).toContainText(["关系信息", "端点与约束", "Control"]);
  await expectInspectorValuesContained(inspector);
  await page.screenshot({ path: test.info().outputPath("relation-inspector-desktop.png") });

  await page.setViewportSize({ width: 820, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(820);
  await expect(page.locator(".workbench-header__actions")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("header-narrow.png") });
  await inspector.scrollIntoViewIfNeeded();
  expect((await inspector.boundingBox())!.width).toBeGreaterThanOrEqual(800);
  await expectInspectorValuesContained(inspector);
  await page.screenshot({ path: test.info().outputPath("relation-inspector-narrow.png") });

  await page.getByTestId("p03-run-validation").click();
  await expect(page.getByTestId("p03-validation-status")).toContainText("已完成");
  const { revision: pinnedRevision } = await copyWorkbenchPermalink(page);
  await page.getByTestId("p03-version-select").selectOption(pinnedRevision);
  await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
  await expect(page.getByTestId("p03-run-validation")).toBeDisabled();
  for (const width of [1600, 1280, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectHeaderContained(page, width);
    await header.screenshot({ path: test.info().outputPath(`header-readonly-${width}.png`) });
  }
  await page.getByTestId("p03-return-head").click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  await expect(page.getByTestId("p03-readonly-banner")).toHaveCount(0);
  for (const width of [1600, 1280, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expectHeaderContained(page, width);
    await header.screenshot({ path: test.info().outputPath(`header-draft-${width}.png`) });
  }
  expect(errors).toEqual([]);
});

async function openNewWorkbench(page: Page) {
  const suffix = Date.now();
  await page.goto("/projects");
  await page.getByTestId("p01-create-project").click();
  await page.getByTestId("ov01-project-name").fill(`智能助手隔离验证：顶部信息栏长项目名称 ${suffix}`);
  await page.getByRole("button", { name: "创建并继续", exact: true }).click();
  await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill(`语义审查修正：咖啡生产流程长模型名称 ${suffix}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
}

async function commitAndRead(page: Page, trigger: Locator): Promise<string> {
  const before = await revisionTag(page);
  await trigger.click();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(before);
  return revisionTag(page);
}

async function revisionTag(page: Page): Promise<string> {
  return (await page.getByTestId("hs-draft-identity").innerText()).trim();
}

function canvasNode(page: Page, label: string): Locator {
  return page.locator(".x6-node").filter({ hasText: label });
}

async function dragRelationEndpoint(page: Page, source: Locator, target: Locator) {
  const from = await nodeCenter(source);
  const to = await nodeCenter(target);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-relation-gesture-phase", "dragging");
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId("p03-canvas")).not.toHaveAttribute("data-relation-gesture-phase", "dragging");
}

async function nodeCenter(node: Locator) {
  const box = await node.boundingBox();
  if (!box) throw new Error("画布节点不可见");
  const centered = box.height <= 32 || await node.locator("ellipse").count() > 0;
  return centered
    ? { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    : { x: box.x + Math.min(20, box.width / 2), y: box.y + Math.min(20, box.height / 2) };
}

async function expectNoOverlap(left: Locator, right: Locator) {
  const leftBox = await left.boundingBox();
  const rightBox = await right.boundingBox();
  if (!leftBox || !rightBox) throw new Error("头部分组不可见");
  expect(leftBox.x + leftBox.width).toBeLessThanOrEqual(rightBox.x + 1);
}

async function expectHeaderControlsAligned(page: Page) {
  const versionBox = await page.getByTestId("p03-version-select").boundingBox();
  if (!versionBox) throw new Error("版本选择框不可见");
  expect(versionBox.height).toBe(32);
  for (const button of await page.locator(".workbench-header__button").all()) {
    const box = await button.boundingBox();
    if (!box) throw new Error("顶部按钮不可见");
    expect(box.height).toBe(versionBox.height);
    expect(box.y).toBe(versionBox.y);
    expect(await button.evaluate(element => getComputedStyle(element).fontSize)).toBe("13px");
  }
  expect(await page.getByTestId("p03-version-select").evaluate(element => getComputedStyle(element).fontSize)).toBe("13px");
}

async function expectHeaderContained(page: Page, width: number) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const header = page.locator(".workbench-header");
  const headerBox = await header.boundingBox();
  if (!headerBox) throw new Error("顶部信息栏不可见");
  const boxes = [];
  for (const item of await header.locator("button, select, strong, .profile-tag, .revision-tag, .readonly-tag, .save-tag").all()) {
    await expect(item).toBeVisible();
    const box = await item.boundingBox();
    if (!box) throw new Error("顶部控件不可见");
    expect(box.x).toBeGreaterThanOrEqual(headerBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(headerBox.x + headerBox.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(headerBox.y + headerBox.height + 1);
    for (const other of boxes) {
      const overlapX = Math.min(box.x + box.width, other.x + other.width) - Math.max(box.x, other.x);
      const overlapY = Math.min(box.y + box.height, other.y + other.height) - Math.max(box.y, other.y);
      expect(overlapX > 1 && overlapY > 1).toBe(false);
    }
    boxes.push(box);
  }
}

async function expectInspectorValuesContained(inspector: Locator) {
  const panelBox = await inspector.boundingBox();
  if (!panelBox) throw new Error("检查器不可见");
  for (const value of await inspector.locator(".form-readonly code, .form-readonly strong").all()) {
    const box = await value.boundingBox();
    if (!box) continue;
    expect(box.x).toBeGreaterThanOrEqual(panelBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
  }
}
