import { expect, test, type Locator, type Page } from "@playwright/test";

test("关系拖线在空白释放时零提交，合法端点松开后只提交一次并可重开", async ({ page }) => {
  await openNewWorkbench(page);
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  const object = canvasNode(page, "Object 1");
  const process = canvasNode(page, "Process 1");
  const revisionBeforeGesture = await revisionTag(page);

  await activateRelationCatalogItem(page, "CAP-ISO-PROC-001");
  await dragToBlank(page, object);
  await expect(page.getByTestId("p03-relation-target")).toHaveCount(0);
  await expect(page.locator(".revision-tag")).toHaveText(revisionBeforeGesture);
  await expect(page.locator(".x6-edge")).toHaveCount(0);
  await expect(page.getByTestId("p03-opl-sentence")).toHaveCount(0);

  await activateRelationCatalogItem(page, "CAP-ISO-PROC-001");
  await dragRelationEndpoint(page, object, process);
  await expect(page.locator(".revision-tag")).not.toHaveText(revisionBeforeGesture);
  const committedRevision = await revisionTag(page);
  await expect(page.getByTestId("p03-relation-preview")).toHaveCount(0);
  await expect(page.locator(".x6-edge")).toHaveCount(1);
  await expect(page.getByTestId("p03-opl-sentence")).toHaveText("Process 1 consumes Object 1.");

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(committedRevision);
  await expect(page.locator(".x6-edge")).toHaveCount(1);
  await expect(page.getByTestId("p03-opl-sentence")).toHaveText("Process 1 consumes Object 1.");
});

test("同一对元素的多条普通二元关系使用不同稳定轨道", async ({ page }) => {
  await openNewWorkbench(page);
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  const object = canvasNode(page, "Object 1");
  const process = canvasNode(page, "Process 1");

  await activateRelationCatalogItem(page, "CAP-ISO-PROC-001");
  const firstRevision = await revisionTag(page);
  await dragRelationEndpoint(page, object, process);
  await expect(page.locator(".revision-tag")).not.toHaveText(firstRevision);

  await activateRelationCatalogItem(page, "CAP-ISO-PROC-004");
  const secondRevision = await revisionTag(page);
  await dragRelationEndpoint(page, object, process);
  await expect(page.locator(".revision-tag")).not.toHaveText(secondRevision);

  const committedPaths = page.locator('.x6-edge path[data-opm-capture-cell-id]');
  await expect(committedPaths).toHaveCount(2);
  const paths = await committedPaths.evaluateAll((items) => items.map((item) => item.getAttribute("d")));
  expect(new Set(paths).size).toBe(2);

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator('.x6-edge path[data-opm-capture-cell-id]')).toHaveCount(paths.length);
  const reopenedPaths = await page.locator('.x6-edge path[data-opm-capture-cell-id]').evaluateAll((items) => items.map((item) => item.getAttribute("d")));
  expect(reopenedPaths).toEqual(paths);
});

test("带必填标签的关系使用画布内联输入，切换关系工具时静默取消", async ({ page }) => {
  await openNewWorkbench(page);
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  const source = canvasNode(page, "Object 1");
  const target = canvasNode(page, "Object 2");
  const revisionBefore = await revisionTag(page);
  const editorWidthBefore = await page.locator(".editor-panel").evaluate((element) => element.getBoundingClientRect().width);

  await activateRelationCatalogItem(page, "CAP-ISO-STRUCT-001", "STRUCTURAL");
  await dragRelationEndpoint(page, source, target);

  const parameterEditor = page.getByTestId("p03-relation-candidate");
  await expect(parameterEditor).toBeVisible();
  await expect(page.getByTestId("p03-right-panel")).toHaveCount(0);
  await expect(parameterEditor.getByRole("button", { name: /创建关系|确认创建/ })).toHaveCount(0);
  await expect(page.getByTestId("p03-structural-label-forward_tag")).toBeFocused();
  await expect.poll(() => page.locator(".editor-panel").evaluate((element) => element.getBoundingClientRect().width)).toBe(editorWidthBefore);

  await activateRelationCatalogItem(page, "CAP-ISO-STRUCT-006", "STRUCTURAL");
  await expect(parameterEditor).toHaveCount(0);
  await expect(page.getByTestId("p03-relation-quick-option-CAP-ISO-STRUCT-006")).toHaveClass(/is-active/);
  await expect(page.getByTestId("p03-command-feedback")).toHaveCount(0);
  await expect(page.locator(".revision-tag")).toHaveText(revisionBefore);
  await expect(page.locator(".x6-edge")).toHaveCount(0);
});

test("非法关系端点反馈悬浮显示且不改变工作台布局或 Revision", async ({ page }) => {
  await openNewWorkbench(page);
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  const revisionBefore = await revisionTag(page);
  const grid = page.locator(".workbench-grid");
  const geometryBefore = await grid.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  });

  await activateRelationCatalogItem(page, "CAP-ISO-PROC-013");
  await dragRelationEndpoint(page, canvasNode(page, "Object 1"), canvasNode(page, "Process 1"));

  const feedback = page.getByTestId("p03-command-feedback");
  await expect(feedback).toContainText("所选端点没有与目录项匹配的 Runtime 候选");
  await expect(page.locator(".canvas-surface").getByTestId("p03-command-feedback")).toHaveCount(1);
  await expect(page.locator(".workbench-notices").getByTestId("p03-command-feedback")).toHaveCount(0);
  await expect.poll(() => grid.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  })).toEqual(geometryBefore);
  await expect(page.locator(".revision-tag")).toHaveText(revisionBefore);
});

async function openNewWorkbench(page: Page) {
  const suffix = Date.now();
  await page.goto("/projects");
  await expect(page.getByTestId("p01-project-library")).toBeVisible();
  await page.getByTestId("p01-create-project").click();
  await page.getByTestId("ov01-project-name").fill(`Relation gesture ${suffix}`);
  await page.getByTestId("ov01-create-project").getByRole("button", { name: "创建并继续" }).click();
  await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill(`模型 ${suffix}`);
  await page.getByTestId("ov02-create-model").getByRole("button", { name: "创建并打开工作台" }).click();
  await expectWorkbenchReady(page);
}

async function activateRelationCatalogItem(page: Page, capabilityId: string, family: "PROCEDURAL" | "STRUCTURAL" = "PROCEDURAL") {
  await expect(page.getByTestId(`p03-relation-toolbar-${family}`)).toBeVisible();
  const quickItem = page.getByTestId(`p03-relation-quick-option-${capabilityId}`);
  const item = await quickItem.count()
    ? quickItem
    : page.getByTestId(`p03-relation-menu-option-${capabilityId}`);
  if (!await quickItem.count()) await page.getByTestId(`p03-relation-menu-toggle-${family}`).click();
  await expect(item).toBeEnabled();
  await item.click();
  await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-relation-gesture-phase", "relation-armed");
}

async function dragRelationEndpoint(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sourcePoint = await nodeGesturePoint(source);
  const targetPoint = await nodeGesturePoint(target);
  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-relation-gesture-phase", "dragging");
  await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("p03-canvas")).not.toHaveAttribute("data-relation-gesture-phase", "dragging");
}

async function dragToBlank(page: Page, source: Locator) {
  await source.scrollIntoViewIfNeeded();
  const canvasBox = await page.getByTestId("p03-canvas").boundingBox();
  if (!canvasBox) throw new Error("关系拖线区域不可见");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("关系拖线视口不可用");
  const sourcePoint = await nodeGesturePoint(source);
  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-relation-gesture-phase", "dragging");
  const releaseX = Math.min(canvasBox.x + canvasBox.width - 24, viewport.width - 24);
  const releaseY = Math.min(canvasBox.y + canvasBox.height - 24, viewport.height - 24);
  await page.mouse.move(releaseX, releaseY, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-relation-gesture-phase", "idle");
}

async function nodeGesturePoint(node: Locator) {
  const box = await node.boundingBox();
  if (!box) throw new Error("关系端点不可见");
  const centered = box.height <= 32 || await node.locator("ellipse").count() > 0;
  return centered
    ? { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    : { x: box.x + Math.min(20, box.width / 2), y: box.y + Math.min(20, box.height / 2) };
}

async function commitAndRead(page: Page, trigger: Locator): Promise<string> {
  const before = await revisionTag(page);
  await trigger.click();
  await expect(page.locator(".revision-tag")).not.toHaveText(before);
  return revisionTag(page);
}

async function revisionTag(page: Page): Promise<string> {
  return (await page.locator(".revision-tag").innerText()).trim();
}

function canvasNode(page: Page, label: string): Locator {
  return page.locator(".x6-node").filter({ hasText: label });
}

async function expectWorkbenchReady(page: Page) {
  await expect(page.getByTestId("p03-workbench")).toBeVisible();
  await expect(page.locator(".revision-tag")).not.toHaveText("草稿 -");
}
