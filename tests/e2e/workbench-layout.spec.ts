import { expect, test, type Locator, type Page } from "@playwright/test";
import { copyWorkbenchPermalink } from "./helpers/workbench-revision";

const chromeExecutable = process.env.OPM_E2E_CHROME_EXECUTABLE;
test.use(chromeExecutable ? { launchOptions: { executablePath: chromeExecutable } } : {});

test("底部工作区折叠释放画布空间，只读提示不再占一行", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openNewWorkbench(page, "Canvas space E2E");
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  const toggle = page.getByTestId("p03-bottom-toggle");
  const initialUrl = page.url();
  const revision = await revisionTag(page);
  const canvasHeight = () => page.locator(".canvas-frame").evaluate((el) => el.getBoundingClientRect().height);
  const expandedHeight = await canvasHeight();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("p03-text-panel")).toBeHidden();
  await expect(page.locator(".bottom-panel")).toHaveCSS("height", "38px");
  await expect.poll(canvasHeight).toBe(expandedHeight + 202);
  await expect(page.locator(".validation-status")).toBeVisible();
  expect(page.url()).toBe(initialUrl);
  await expect(page.locator(".revision-tag")).toHaveText(revision);
  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  for (const tab of ["text", "findings", "history", "method"]) {
    await page.getByTestId(`p03-tab-${tab}`).click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#p03-bottom-content")).toBeVisible();
    await page.getByTestId(`p03-tab-${tab}`).click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  }
  const { revision: headRevision } = await copyWorkbenchPermalink(page);
  await page.getByTestId("p03-version-select").selectOption(headRevision);
  await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
  await expect(page.locator('.workbench-header [data-testid="p03-readonly-banner"]')).toHaveText("只读");
  await expect(page.locator(".workbench-notices")).toBeHidden();
  await expect(page.getByTestId("p03-tool-object")).toBeDisabled();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({ path: test.info().outputPath("canvas-bottom-collapsed.png") });
  await toggle.click();
  await expect(page.locator(".bottom-panel")).toHaveCSS("height", "240px");
  await page.getByTestId("p03-tab-text").click();
  await expect(page.getByTestId("p03-text-panel")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("canvas-bottom-expanded.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await toggle.click();
  await expect(page.locator(".bottom-panel")).toHaveCSS("height", "38px");
  await expect(page.locator("#p03-bottom-content")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await toggle.click();
  await expect(page.getByTestId("p03-text-panel")).toBeVisible();
});

test("连线上输入关系名称、双击改名及重开保持 Fact 和 OPL 一致", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openNewWorkbench(page, "On edge labels E2E");
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  const before = await revisionTag(page);
  const commands: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/commands")) {
      const body = request.postDataJSON();
      commands.push(request.url().endsWith("/draft/commands") ? body.command : body);
    }
  });
  await activateRelationCatalogItem(page, "STRUCTURAL", "CAP-ISO-STRUCT-001");
  await dragRelationEndpoint(page, page.locator(".x6-node").first(), page.locator(".x6-node").nth(1));
  const input = page.getByTestId("p03-structural-label-forward_tag");
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveAccessibleName("关系名称 / Relation name");
  const previewPath = page.locator(".x6-edge [data-opm-candidate-cell-id]");
  await expectInputOnEdge(input, previewPath);
  await input.fill("   ");
  await input.press("Enter");
  await expect(page.locator(".revision-tag")).toHaveText(before);
  await expect(committedRelationAnchors(page)).toHaveCount(0);
  await page.getByTestId("p03-zoom-in").click();
  await expectInputOnEdge(input, previewPath);
  await input.fill("supplies");
  await input.dispatchEvent("compositionstart");
  await input.press("Enter");
  await expect(committedRelationAnchors(page)).toHaveCount(0);
  await input.dispatchEvent("compositionend");
  const created = await commitRelationParametersAndRead(page);
  await expect(committedRelationAnchors(page)).toHaveCount(1);
  await expect(page.getByTestId("p03-opl-sentence").filter({ hasText: "supplies" })).toBeVisible();
  expect(commands).toHaveLength(1);
  const factId = await committedRelationAnchors(page).evaluate((el) => el.closest(".x6-edge")?.getAttribute("data-cell-id"));

  const doubleClickEdge = async () => {
    const point = await edgeScreenPoint(committedRelationAnchors(page), 0.7);
    await page.mouse.dblclick(point.x, point.y);
    await expect(page.getByTestId("p03-relation-label-editor")).toBeVisible();
  };
  await doubleClickEdge();
  const rename = page.getByTestId("p03-relation-rename-forward_tag");
  await expect(rename).toHaveValue("supplies");
  await expect(rename).toBeFocused();
  await expect(page.getByTestId("p03-right-panel")).toHaveCount(0);
  await expectInputOnEdge(rename, committedRelationAnchors(page));
  await rename.press("Enter");
  await expect(page.getByTestId("p03-relation-label-editor")).toHaveCount(0);
  await expect(page.locator(".revision-tag")).toHaveText(created);
  expect(commands).toHaveLength(1);

  await doubleClickEdge();
  await rename.fill("cancelled name");
  await rename.press("Escape");
  await expect(page.getByTestId("p03-relation-label-editor")).toHaveCount(0);
  await expect(page.locator(".revision-tag")).toHaveText(created);
  await doubleClickEdge();
  await rename.fill("delivers");
  await page.screenshot({ path: test.info().outputPath("on-edge-label-editor.png") });
  await rename.press("Enter");
  await expect(page.locator(".revision-tag")).not.toHaveText(created);
  const renamed = await revisionTag(page);
  await expect(page.getByTestId("p03-relation-label-editor")).toHaveCount(0);
  await expect(page.getByTestId("p03-opl-sentence").filter({ hasText: "delivers" })).toBeVisible();
  expect(commands).toHaveLength(2);
  expect(commands[1]).toMatchObject({ command_type: "UPDATE_FACT", payload: { fact_id: factId, replacement: { labels: [{ slot_id: "forward_tag", text: "delivers" }] } } });
  expect(Object.keys((commands[1].payload as { replacement: object }).replacement)).toEqual(["labels"]);
  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(renamed);
  await expect(committedRelationAnchors(page)).toHaveCount(1);
  expect(await committedRelationAnchors(page).evaluate((el) => el.closest(".x6-edge")?.getAttribute("data-cell-id"))).toBe(factId);
  await expect(page.getByTestId("p03-opl-sentence").filter({ hasText: "delivers" })).toBeVisible();
  await doubleClickEdge();
  await expect(rename).toHaveValue("delivers");
});

async function edgeScreenPoint(path: Locator, ratio: number) {
  return path.evaluate((element, position) => {
    const edge = element as SVGPathElement;
    const point = edge.getPointAtLength(edge.getTotalLength() * position);
    const matrix = edge.getScreenCTM();
    if (!matrix) throw new Error("连线路径尚未进入可见画布");
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  }, ratio);
}

async function expectInputOnEdge(input: Locator, path: Locator) {
  await expect.poll(async () => {
    const box = await input.boundingBox();
    const point = await edgeScreenPoint(path, 0.35);
    return Boolean(box && point.x >= box.x - 10 && point.x <= box.x + box.width + 10 && Math.abs(point.y - box.y - box.height / 2) < 30);
  }).toBe(true);
}

test("真实 P01 到 P03 主路径提交并在三个视口重开", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  const projectName = `E2E P0 ${Date.now()}`;
  const modelName = `模型 ${Date.now()}`;

  await page.goto("/projects");
  await expect(page.getByTestId("p01-project-library")).toBeVisible();
  await page.getByTestId("p01-create-project").click();
  await page.getByTestId("ov01-project-name").fill(projectName);
  await page.getByTestId("ov01-create-project").getByRole("button", { name: "创建并继续" }).click();
  await expect(page.getByTestId("p02-project-detail")).toBeVisible();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill(modelName);
  await page.getByTestId("ov02-create-model").getByRole("button", { name: "创建并打开工作台" }).click();
  await expectWorkbenchReady(page);

  const toolbarBox = await page.getByTestId("p03-canvas-toolchain").boundingBox();
  const paletteBox = await page.getByTestId("p03-relation-tool-palette").boundingBox();
  if (!toolbarBox || !paletteBox) throw new Error("主工具栏或关系工具不可见");
  expect(paletteBox.y).toBeGreaterThanOrEqual(toolbarBox.y);
  expect(paletteBox.y + paletteBox.height).toBeLessThanOrEqual(toolbarBox.y + toolbarBox.height);
  const consumptionTool = page.getByTestId("p03-relation-quick-option-CAP-ISO-PROC-001");
  await expect(consumptionTool).toHaveAttribute("title", "生成/消耗关系 / Result / Consumption\n生成 / Result：过程 → 对象\n消耗 / Consumption：对象 → 过程");
  await expect(page.getByTestId("p03-relation-quick-option-CAP-ISO-PROC-002")).toHaveCount(0);
  const consumptionToolBox = await consumptionTool.boundingBox();
  const consumptionSymbolBox = await consumptionTool.locator(".relation-tool-symbol").boundingBox();
  const proceduralExpandBox = await page.getByTestId("p03-relation-menu-toggle-PROCEDURAL").boundingBox();
  if (!consumptionToolBox || !consumptionSymbolBox || !proceduralExpandBox) throw new Error("关系工具尺寸不可观测");
  expect(Math.round(consumptionToolBox.width)).toBe(34);
  expect(Math.round(consumptionToolBox.height)).toBe(32);
  expect(Math.round(consumptionSymbolBox.width)).toBe(32);
  expect(Math.round(consumptionSymbolBox.height)).toBe(18);
  expect(Math.round(proceduralExpandBox.width)).toBe(28);
  await page.getByTestId("p03-relation-menu-toggle-PROCEDURAL").click();
  const relationMenuBox = await page.getByTestId("p03-relation-menu-PROCEDURAL").boundingBox();
  const relationMenuSymbolBox = await page.getByTestId("p03-relation-menu-option-CAP-ISO-PROC-001").locator(".relation-tool-symbol").boundingBox();
  if (!relationMenuBox || !relationMenuSymbolBox) throw new Error("关系下拉尺寸不可观测");
  expect(relationMenuBox.width).toBeLessThanOrEqual(256);
  expect(Math.round(relationMenuSymbolBox.width)).toBe(42);
  expect(Math.round(relationMenuSymbolBox.height)).toBe(20);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("p03-tool-object")).toHaveAttribute("title", "创建对象 / Create Object");

  const initialRevision = await revisionTag(page);
  await page.getByTestId("p03-relation-quick-option-CAP-ISO-PROC-001").click();
  await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-relation-gesture-phase", "relation-armed");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-relation-gesture-phase", "idle");
  await expect(page.locator(".revision-tag")).toHaveText(initialRevision);

  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await expect(page.locator(".x6-node")).toHaveCount(1);
  await expect(page.getByTestId("p03-right-panel")).toHaveCount(0);
  const editorWidthWithoutInspector = await page.locator(".editor-panel").evaluate((element) => element.getBoundingClientRect().width);
  const propertyRevision = await revisionTag(page);
  await page.locator(".x6-node").first().click({ button: "right", position: { x: 10, y: 10 } });
  await expect(page.getByTestId("p03-construct-open-properties")).toBeVisible();
  await page.getByTestId("p03-construct-open-properties").click();
  await expect(page.getByTestId("p03-right-panel")).toBeVisible();
  const editorWidthWithInspector = await page.locator(".editor-panel").evaluate((element) => element.getBoundingClientRect().width);
  expect(editorWidthWithoutInspector - editorWidthWithInspector).toBeGreaterThanOrEqual(260);
  await expect(page.locator(".revision-tag")).toHaveText(propertyRevision);
  await page.getByTestId("p03-right-panel-close").click();
  await expect(page.getByTestId("p03-right-panel")).toHaveCount(0);
  await expect.poll(() => page.locator(".editor-panel").evaluate((element) => element.getBoundingClientRect().width)).toBe(editorWidthWithoutInspector);
  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  await expect(page.locator(".x6-node")).toHaveCount(2);
  await page.locator(".x6-node").first().click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId("p03-tool-state")).toBeEnabled();
  const stateRevision = await createState(page, canvasNode(page, "Object 1"), "Ready");
  await expect(page.locator(".x6-node")).toHaveCount(3);
  await createState(page, canvasNode(page, "Object 1"), "Finished");
  await expect(page.locator(".x6-node")).toHaveCount(4);
  const committedRevision = await createProceduralRelation(page, canvasNode(page, "Ready"), [canvasNode(page, "Process 1")], "CAP-ISO-PROC-006");
  await expect(committedRelationAnchors(page)).toHaveCount(1);
  await expect(page.getByTestId("p03-opl-sentence")).toHaveText("Process 1 consumes Ready Object 1.");
  expect(stateRevision).not.toBe(committedRevision);

  const resultRevision = await createProceduralRelation(page, canvasNode(page, "Process 1"), [canvasNode(page, "Object 1")], "CAP-ISO-PROC-002");
  await expect(committedRelationAnchors(page)).toHaveCount(2);
  await expect(page.getByTestId("p03-opl-sentence")).toHaveCount(2);
  await expect(page.getByText("Process 1 yields Object 1.", { exact: true })).toBeVisible();

  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  const objectTwo = canvasNode(page, "Object 2");
  await expect(objectTwo).toHaveCount(1);
  const canvasFrame = page.locator(".canvas-frame");
  const frameBox = await canvasFrame.boundingBox();
  if (!frameBox) throw new Error("未找到画布编辑区域");
  const toolbarBottom = await page.getByTestId("p03-canvas-toolchain").evaluate((element) => element.getBoundingClientRect().bottom);
  await expect.poll(async () => (await canvasNode(page, "Ready").boundingBox())?.y ?? Number.NEGATIVE_INFINITY).toBeGreaterThan(toolbarBottom + 4);
  await dragCanvasWithPanTool(page, frameBox, -72, -48);
  await dragCanvasWithPanTool(page, frameBox, 72, 48);
  await page.getByTestId("p03-tool-select").click();
  await expect(page.getByTestId("p03-tool-select")).toHaveAttribute("aria-pressed", "true");
  await createProceduralRelation(page, canvasNode(page, "Ready"), [canvasNode(page, "Process 1"), canvasNode(page, "Finished")], "CAP-ISO-PROC-008");
  await expect(committedRelationAnchors(page)).toHaveCount(3);
  await expect(page.getByText("Process 1 changes Object 1 from Ready to Finished.", { exact: true })).toBeVisible();

  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  const processOne = canvasNode(page, "Process 1");
  const processTwo = canvasNode(page, "Process 2");
  await expect(processTwo).toHaveCount(1);
  await panCanvas(page, frameBox, -260);
  await expect.poll(async () => (await processOne.boundingBox())?.y ?? Number.NEGATIVE_INFINITY).toBeGreaterThan(toolbarBottom + 4);
  await panCanvas(page, frameBox, 260);
  await expect.poll(async () => (await processTwo.boundingBox())?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(frameBox.y + frameBox.height - 32);
  await createProceduralRelation(page, processOne, [processTwo], "CAP-ISO-PROC-013");
  await expect(committedRelationAnchors(page)).toHaveCount(4);
  await expect(page.getByText("Process 1 invokes Process 2.", { exact: true })).toBeVisible();

  await panCanvas(page, frameBox, -260);
  await expect.poll(async () => (await processOne.boundingBox())?.y ?? Number.NEGATIVE_INFINITY).toBeGreaterThan(toolbarBottom + 4);
  await panCanvas(page, frameBox, 260);
  await expect.poll(async () => (await processTwo.boundingBox())?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(frameBox.y + frameBox.height - 32);
  const exceptionRevision = await createProceduralRelation(page, processOne, [processTwo], "CAP-ISO-PROC-015", "PT5M");
  await expect(committedRelationAnchors(page)).toHaveCount(5);
  await expect(page.getByText("When Process 1 exceeds PT5M, Process 2 handles the exception.", { exact: true })).toBeVisible();

  await page.getByTestId("p03-tab-history").click();
  await expect(page.getByTestId("p03-history-panel")).toHaveText("当前修订没有 Operation Record。");
  await page.getByTestId("p03-tab-text").click();

  await page.getByTestId("p03-run-validation").click();
  await expect(page.locator(".validation-status")).toContainText("结果当前");
  await expect(page.locator(".validation-status progress")).toHaveAttribute("value", "100");

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(exceptionRevision);
  await expect(page.locator(".x6-node")).toHaveCount(6);
  await expect(committedRelationAnchors(page)).toHaveCount(5);
  await expect(page.getByTestId("p03-opl-sentence")).toHaveCount(5);
  await expect(page.getByText("Process 1 yields Object 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 changes Object 1 from Ready to Finished.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 invokes Process 2.", { exact: true })).toBeVisible();
  await expect(page.getByText("When Process 1 exceeds PT5M, Process 2 handles the exception.", { exact: true })).toBeVisible();
  await page.getByTestId("p03-opl-sentence").filter({ hasText: "Process 1 invokes Process 2." }).click();
  await expect(page.getByTestId("p03-right-panel")).toHaveCount(0);
  await openSelectedInspector(page);
  await expect(page.locator(".inspector-panel .panel-heading strong")).toHaveText("关系");
  await expect(page.locator(".inspector-panel")).toContainText("CAP-ISO-PROC-013");

  const viewportRevision = await revisionTag(page);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await expectDesktopWorkbenchLayout(page);
    await expect(page.locator(".revision-tag")).toHaveText(viewportRevision);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expectMobileCanvasReachable(page, page.getByText("Process 1", { exact: true }));
  await expect(page.locator(".revision-tag")).toHaveText(viewportRevision);
});

test("Self-invocation 与 Undertime Exception 以独立 Runtime 路径提交并重开", async ({ page }) => {
  await openNewWorkbench(page, "Control-free procedural E2E");

  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  const processOne = canvasNode(page, "Process 1");
  const processTwo = canvasNode(page, "Process 2");
  await expect(processOne).toBeVisible();
  await expect(processTwo).toBeVisible();

  await createProceduralRelation(page, processOne, [processOne], "CAP-ISO-PROC-014");
  await expect(page.getByText("Process 1 invokes itself.", { exact: true })).toBeVisible();

  const revision = await createProceduralRelation(page, processOne, [processTwo], "CAP-ISO-PROC-016", "PT3M");
  await expect(committedRelationAnchors(page)).toHaveCount(2);
  await expect(page.getByText("When Process 1 is under PT3M, Process 2 handles the exception.", { exact: true })).toBeVisible();

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(revision);
  await expect(committedRelationAnchors(page)).toHaveCount(2);
  await expect(page.getByText("Process 1 invokes itself.", { exact: true })).toBeVisible();
  await expect(page.getByText("When Process 1 is under PT3M, Process 2 handles the exception.", { exact: true })).toBeVisible();
});

test("Object 左键选择、拖动布局并在刷新后保持位置", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openNewWorkbench(page, "Element layout interaction");

  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  const object = canvasNode(page, "Object 1");
  await expect(object).toBeVisible();
  await object.click({ position: { x: 32, y: 32 } });
  await expect(page.getByTestId("p03-right-panel")).toHaveCount(0);
  await openSelectedInspector(page);
  await expect(page.locator(".inspector-panel .panel-heading strong")).toHaveText("对象");

  const before = await object.boundingBox();
  if (!before) throw new Error("未找到可拖动 Object 的边界");
  const revisionBefore = await revisionTag(page);
  await page.mouse.move(before.x + 40, before.y + 36);
  await page.mouse.down();
  await page.mouse.move(before.x + 120, before.y + 96, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".revision-tag")).not.toHaveText(revisionBefore);
  const revisionAfterMove = await revisionTag(page);
  const moved = await object.boundingBox();
  if (!moved) throw new Error("拖动后 Object 不可见");
  expect(moved.x).toBeGreaterThan(before.x + 60);
  expect(moved.y).toBeGreaterThan(before.y + 40);

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(revisionAfterMove);
  const persisted = await canvasNode(page, "Object 1").boundingBox();
  if (!persisted) throw new Error("刷新后 Object 不可见");
  expect(Math.round(persisted.x)).toBe(Math.round(moved.x));
  expect(Math.round(persisted.y)).toBe(Math.round(moved.y));
});

test("Attribute 拖动布局并在刷新后保持位置", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openNewWorkbench(page, "Attribute layout interaction");

  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  const object = canvasNode(page, "Object 1");
  await object.click({ position: { x: 20, y: 20 } });
  await commitAndRead(page, page.getByTestId("p03-tool-attribute"));
  await object.locator('[data-testid^="p03-feature-toggle-"]').click();
  const attribute = canvasNode(page, "Attribute 1");
  await expect(attribute).toBeVisible();

  const before = await attribute.boundingBox();
  if (!before) throw new Error("未找到可拖动 Attribute 的边界");
  const revisionBefore = await revisionTag(page);
  await page.mouse.move(before.x + 30, before.y + 22);
  await page.mouse.down();
  await page.mouse.move(before.x + 120, before.y + 92, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".revision-tag")).not.toHaveText(revisionBefore);
  const revisionAfterMove = await revisionTag(page);
  const moved = await attribute.boundingBox();
  if (!moved) throw new Error("拖动后 Attribute 不可见");
  expect(moved.x).toBeGreaterThan(before.x + 60);
  expect(moved.y).toBeGreaterThan(before.y + 40);

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(revisionAfterMove);
  await object.locator('[data-testid^="p03-feature-toggle-"]').click();
  const persisted = await canvasNode(page, "Attribute 1").boundingBox();
  if (!persisted) throw new Error("刷新后 Attribute 不可见");
  expect(Math.round(persisted.x)).toBe(Math.round(moved.x));
  expect(Math.round(persisted.y)).toBe(Math.round(moved.y));
});

test("使能关系与 State 指定变体从 Runtime 候选提交并重开", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await openNewWorkbench(page, "Enabling procedural E2E");

  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  const objectOne = canvasNode(page, "Object 1");
  const objectTwo = canvasNode(page, "Object 2");
  const process = canvasNode(page, "Process 1");
  await expect(objectOne).toBeVisible();
  await expect(objectTwo).toBeVisible();
  await expect(process).toBeVisible();

  await createState(page, objectOne, "Ready");
  await createState(page, objectOne, "Finished");
  const ready = canvasNode(page, "Ready");
  await expect(ready).toBeVisible();

  await createProceduralRelation(page, objectOne, [process], "CAP-ISO-PROC-004");
  await createProceduralRelation(page, objectOne, [process], "CAP-ISO-PROC-005");
  await createProceduralRelation(page, ready, [process], "CAP-ISO-PROC-011");
  const revision = await createProceduralRelation(page, ready, [process], "CAP-ISO-PROC-012");
  await expect(committedRelationAnchors(page)).toHaveCount(4);
  await expect(page.getByText("Object 1 handles Process 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 requires Object 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Ready Object 1 handles Process 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 requires Ready Object 1.", { exact: true })).toBeVisible();

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(revision);
  await expect(committedRelationAnchors(page)).toHaveCount(4);
  await expect(page.getByText("Ready Object 1 handles Process 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 requires Ready Object 1.", { exact: true })).toBeVisible();
});

test("Effect 与剩余 State 指定变体从 Runtime 候选提交并重开", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await openNewWorkbench(page, "Transformation procedural E2E");

  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  const objectOne = canvasNode(page, "Object 1");
  const objectTwo = canvasNode(page, "Object 2");
  const process = canvasNode(page, "Process 1");
  await expect(objectOne).toBeVisible();
  await expect(objectTwo).toBeVisible();
  await expect(process).toBeVisible();

  await createState(page, objectOne, "Ready");
  await createState(page, objectOne, "Finished");
  const ready = canvasNode(page, "Ready");
  const finished = canvasNode(page, "Finished");
  await expect(ready).toBeVisible();
  await expect(finished).toBeVisible();

  await createProceduralRelation(page, ready, [process], "CAP-ISO-PROC-006");
  await createProceduralRelation(page, process, [finished], "CAP-ISO-PROC-007");
  await createProceduralRelation(page, objectOne, [process, objectTwo], "CAP-ISO-PROC-003");
  await createProceduralRelation(page, ready, [process, objectOne], "CAP-ISO-PROC-009");
  const revision = await createProceduralRelation(page, objectOne, [process, finished], "CAP-ISO-PROC-010");
  await page.screenshot({ path: test.info().outputPath("state-effect-tool-fidelity.png") });
  const effectSegments = page.locator('.x6-edge[data-cell-id$=".input"], .x6-edge[data-cell-id$=".output"]');
  await expect(effectSegments).toHaveCount(6);
  expect((await edgeVisualSignaturesIn(effectSegments)).every((edge) => !edge.source && isClosedArrow(edge.target))).toBe(true);
  await expect(committedRelationAnchors(page)).toHaveCount(5);
  await expect(page.getByText("Process 1 consumes Ready Object 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 yields Finished Object 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 affects Object 2.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 changes Object 1 from Ready.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 changes Object 1 to Finished.", { exact: true })).toBeVisible();

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(revision);
  await expect(committedRelationAnchors(page)).toHaveCount(5);
  await expect(effectSegments).toHaveCount(6);
  expect((await edgeVisualSignaturesIn(effectSegments)).every((edge) => !edge.source && isClosedArrow(edge.target))).toBe(true);
  await expect(page.getByText("Process 1 consumes Ready Object 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 yields Finished Object 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 affects Object 2.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 changes Object 1 from Ready.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 changes Object 1 to Finished.", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expectMobileCanvasReachable(page, process);
  await expect(effectSegments).toHaveCount(6);
});

test("状态过程关系线在对象内可见且状态框位于连线之上", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openNewWorkbench(page, "State link visibility E2E");
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  const owner = canvasNode(page, "Object 1");
  const process = canvasNode(page, "Process 1");
  await createState(page, owner, "Ready");
  await createState(page, owner, "Finished");
  const ready = canvasNode(page, "Ready");
  const finished = canvasNode(page, "Finished");

  await createProceduralRelation(page, ready, [process], "CAP-ISO-PROC-006");
  await createProceduralRelation(page, process, [finished], "CAP-ISO-PROC-007");
  await createProceduralRelation(page, ready, [process, finished], "CAP-ISO-PROC-008");
  await expect(committedRelationAnchors(page)).toHaveCount(3);
  await page.screenshot({ path: test.info().outputPath("state-procedural-link-visibility.png") });
  const layering = await page.evaluate(() => {
    const nodeCells = Array.from(document.querySelectorAll(".x6-node"));
    const ownerCell = nodeCells.find((cell) => cell.textContent?.replace(/\s+/g, " ").trim() === "Object 1");
    const stateCells = nodeCells.filter((cell) => ["Ready", "Finished"].includes(cell.textContent?.trim() ?? ""));
    const relationCells = Array.from(document.querySelectorAll(".x6-edge"));
    if (!ownerCell || stateCells.length !== 2 || relationCells.length !== 4) throw new Error("状态关系画布元素缺失");
    return relationCells.map((edge) => ({
      aboveOwner: Boolean(ownerCell.compareDocumentPosition(edge) & Node.DOCUMENT_POSITION_FOLLOWING),
      belowStates: stateCells.every((state) => Boolean(edge.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING)),
    }));
  });
  expect(layering).toEqual(Array.from({ length: 4 }, () => ({ aboveOwner: true, belowStates: true })));
});

test("生成消耗共用一个工具，双向拖线保持独立 Fact、OPL 和重开结果", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openNewWorkbench(page, "Combined transformation E2E");
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  const commands: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/commands")) {
      const body = request.postDataJSON();
      commands.push(request.url().endsWith("/draft/commands") ? body.command : body);
    }
  });
  const object = canvasNode(page, "Object 1");
  const process = canvasNode(page, "Process 1");
  // 两次都点击同一个入口，仅改变用户拖线方向。
  await createProceduralRelation(page, object, [process], "CAP-ISO-PROC-001");
  await createProceduralRelation(page, process, [object], "CAP-ISO-PROC-001");
  expect(commands).toHaveLength(2);
  expect(commands[0]).toMatchObject({ command_type: "CREATE_FACT", payload: { capability_ref: { capability_id: "CAP-ISO-PROC-001" } } });
  expect(commands[1]).toMatchObject({ command_type: "CREATE_FACT", payload: { capability_ref: { capability_id: "CAP-ISO-PROC-002" } } });
  await expect(committedRelationAnchors(page)).toHaveCount(2);
  const signatures = await edgeVisualSignatures(page);
  expect(signatures.every((edge) => isClosedArrow(edge.target))).toBe(true);
  expect(new Set(signatures.map((edge) => edge.path)).size).toBe(2);
  await expect(page.getByText("Process 1 consumes Object 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 yields Object 1.", { exact: true })).toBeVisible();
  const revision = await revisionTag(page);
  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(revision);
  await expect(committedRelationAnchors(page)).toHaveCount(2);
  expect(await edgeVisualSignatures(page)).toEqual(signatures);
  await expect(page.getByText("Process 1 consumes Object 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 yields Object 1.", { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("combined-transformation.png") });
});

test("16 类 Procedural Link 以冻结的 SVG marker、路径和时间注记呈现", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1800 });
  await openNewWorkbench(page, "Procedural symbol visual E2E");

  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  const objectOne = canvasNode(page, "Object 1");
  const objectTwo = canvasNode(page, "Object 2");
  const processOne = canvasNode(page, "Process 1");
  const processTwo = canvasNode(page, "Process 2");
  await createState(page, objectOne, "Ready");
  await createState(page, objectTwo, "Finished");
  const ready = canvasNode(page, "Ready");
  const finished = canvasNode(page, "Finished");

  await createProceduralRelation(page, objectOne, [processOne], "CAP-ISO-PROC-001");
  await createProceduralRelation(page, processOne, [objectOne], "CAP-ISO-PROC-002");
  await createProceduralRelation(page, objectOne, [processOne, objectTwo], "CAP-ISO-PROC-003");
  await createProceduralRelation(page, objectTwo, [processOne], "CAP-ISO-PROC-004");
  await createProceduralRelation(page, objectTwo, [processOne], "CAP-ISO-PROC-005");
  await createProceduralRelation(page, ready, [processOne], "CAP-ISO-PROC-006");
  await createProceduralRelation(page, processOne, [finished], "CAP-ISO-PROC-007");
  await createProceduralRelation(page, ready, [processOne, finished], "CAP-ISO-PROC-008");
  await createProceduralRelation(page, ready, [processOne, objectTwo], "CAP-ISO-PROC-009");
  await createProceduralRelation(page, objectOne, [processOne, finished], "CAP-ISO-PROC-010");
  await createProceduralRelation(page, ready, [processOne], "CAP-ISO-PROC-011");
  await createProceduralRelation(page, ready, [processOne], "CAP-ISO-PROC-012");
  await createProceduralRelation(page, processOne, [processTwo], "CAP-ISO-PROC-013");
  await createProceduralRelation(page, processOne, [processOne], "CAP-ISO-PROC-014");
  await createProceduralRelation(page, processOne, [processTwo], "CAP-ISO-PROC-015", "PT5M");
  await createProceduralRelation(page, processOne, [processTwo], "CAP-ISO-PROC-016", "PT3M");

  const edges = page.locator(".x6-edge");
  await expect(committedRelationAnchors(page)).toHaveCount(16);
  await expect(edges).toHaveCount(20);
  const visualSignatures = await edgeVisualSignatures(page);
  expect(visualSignatures.filter((edge) => isClosedArrow(edge.target))).toHaveLength(16);
  expect(visualSignatures.filter((edge) => isClosedArrow(edge.source))).toHaveLength(0);
  expect(visualSignatures.filter((edge) => isCircle(edge.target, "#20242a"))).toHaveLength(2);
  expect(visualSignatures.filter((edge) => isCircle(edge.target, "#ffffff"))).toHaveLength(2);
  expect(visualSignatures.filter((edge) => isLightningPath(edge.path))).toHaveLength(1);
  expect(visualSignatures.filter((edge) => pathSegmentCount(edge.path) >= 4 && !isLightningPath(edge.path))).toHaveLength(1);
  await expect(page.getByText("/ PT5M", { exact: true })).toHaveCount(1);
  await expect(page.getByText("// PT3M", { exact: true })).toHaveCount(1);
});

test("八类 Control 从基础 Procedural Fact 的 Runtime 候选提交并重开", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await openNewWorkbench(page, "Control links E2E");

  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  const objectOne = canvasNode(page, "Object 1");
  const objectTwo = canvasNode(page, "Object 2");
  const process = canvasNode(page, "Process 1");
  await expect(objectOne).toBeVisible();
  await expect(objectTwo).toBeVisible();
  await expect(process).toBeVisible();

  await createState(page, objectOne, "Ready");
  await createState(page, objectTwo, "Available");
  const ready = canvasNode(page, "Ready");
  const available = canvasNode(page, "Available");
  await expect(ready).toBeVisible();
  await expect(available).toBeVisible();

  await createProceduralRelation(page, objectOne, [process], "CAP-ISO-PROC-001");
  await createProceduralRelation(page, objectTwo, [process], "CAP-ISO-PROC-004");
  await createProceduralRelation(page, ready, [process], "CAP-ISO-PROC-006");
  await createProceduralRelation(page, available, [process], "CAP-ISO-PROC-011");
  await expect(committedRelationAnchors(page)).toHaveCount(4);

  await applyControlForText(page, "Process 1 consumes Object 1.", "CAP-ISO-CTRL-001");
  await applyControlForText(page, "Object 2 handles Process 1.", "CAP-ISO-CTRL-002");
  await applyControlForText(page, "Process 1 consumes Ready Object 1.", "CAP-ISO-CTRL-003");
  await applyControlForText(page, "Available Object 2 handles Process 1.", "CAP-ISO-CTRL-004");
  await expect(page.locator(".x6-edge-label").filter({ hasText: "e" })).toHaveCount(4);

  await createProceduralRelation(page, objectOne, [process, objectTwo], "CAP-ISO-PROC-003");
  await applyControlForText(page, "Process 1 affects Object 2.", "CAP-ISO-CTRL-005");
  await createProceduralRelation(page, objectOne, [process], "CAP-ISO-PROC-005");
  await applyControlForText(page, "Process 1 requires Object 1.", "CAP-ISO-CTRL-006");
  await createProceduralRelation(page, ready, [process, objectOne], "CAP-ISO-PROC-009");
  await applyControlForText(page, "Process 1 changes Object 1 from Ready.", "CAP-ISO-CTRL-007");
  await createProceduralRelation(page, ready, [process], "CAP-ISO-PROC-012");
  const revision = await applyControlForText(page, "Process 1 requires Ready Object 1.", "CAP-ISO-CTRL-008");
  await expect(page.locator(".x6-edge-label").filter({ hasText: "c" })).toHaveCount(4);
  await expect(page.getByText("Object 1 initiates Process 1, which consumes Object 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Object 2 initiates and handles Process 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Ready Object 1 initiates Process 1, which consumes Object 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Available Object 2 initiates and handles Process 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 occurs if Object 1 exists, in which case Process 1 affects Object 2, otherwise Process 1 is skipped.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 occurs if Object 1 exists, else Process 1 is skipped.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 occurs if there is Ready Object 1 in which case Process 1 changes Object 1 from Ready, else Process 1 is skipped.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 occurs if Ready Object 1 exists, else Process 1 is skipped.", { exact: true })).toBeVisible();

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(revision);
  await expect(committedRelationAnchors(page)).toHaveCount(8);
  await expect(page.locator(".x6-edge-label").filter({ hasText: "c" })).toHaveCount(4);
  const traceCases = [
    ["Object 1 initiates Process 1, which consumes Object 1.", "CAP-ISO-CTRL-001"],
    ["Object 2 initiates and handles Process 1.", "CAP-ISO-CTRL-002"],
    ["Ready Object 1 initiates Process 1, which consumes Object 1.", "CAP-ISO-CTRL-003"],
    ["Available Object 2 initiates and handles Process 1.", "CAP-ISO-CTRL-004"],
    ["Process 1 occurs if Object 1 exists, in which case Process 1 affects Object 2, otherwise Process 1 is skipped.", "CAP-ISO-CTRL-005"],
    ["Process 1 occurs if Object 1 exists, else Process 1 is skipped.", "CAP-ISO-CTRL-006"],
    ["Process 1 occurs if there is Ready Object 1 in which case Process 1 changes Object 1 from Ready, else Process 1 is skipped.", "CAP-ISO-CTRL-007"],
    ["Process 1 occurs if Ready Object 1 exists, else Process 1 is skipped.", "CAP-ISO-CTRL-008"],
  ] as const;
  for (const [sentence, capabilityId] of traceCases) {
    await page.getByText(sentence, { exact: true }).click();
    await openSelectedInspector(page);
    await expect(page.locator(".inspector-panel")).toContainText(capabilityId);
  }
});

test("Feature Value State 支持 Exhibition 与 State-specified Characterization 并重开", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await openNewWorkbench(page, "Feature structural E2E");

  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  const object = canvasNode(page, "Object 1");
  await expect(object).toBeVisible();
  await object.click({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId("p03-tool-attribute")).toBeEnabled();
  await commitAndRead(page, page.getByTestId("p03-tool-attribute"));
  await object.locator('[data-testid^="p03-feature-toggle-"]').click();

  const attribute = canvasNode(page, "Attribute 1");
  await expect(attribute).toBeVisible();
  await createFeatureState(page, attribute, "High");
  const high = canvasNode(page, "High");
  await expect(high).toBeVisible();

  const exhibitionRevision = await createStructuralRelation(page, attribute, object, "CAP-ISO-STRUCT-006", "COMPLETE", undefined, true);
  await expect(committedRelationAnchors(page)).toHaveCount(1);

  const characterizationRevision = await createStructuralRelation(page, high, object, "CAP-ISO-STRUCT-009");
  expect(exhibitionRevision).not.toBe(characterizationRevision);
  await expect(committedRelationAnchors(page)).toHaveCount(2);
  await expect(page.locator(".x6-node").filter({ hasText: "Attribute 1" })).toHaveCount(1);
  await expect(page.locator(".x6-node").filter({ hasText: "High" })).toHaveCount(1);

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(characterizationRevision);
  await object.locator('[data-testid^="p03-feature-toggle-"]').click();
  await expect(committedRelationAnchors(page)).toHaveCount(2);
  await expect(page.locator(".x6-node").filter({ hasText: "Attribute 1" })).toHaveCount(1);
  await expect(page.locator(".x6-node").filter({ hasText: "High" })).toHaveCount(1);
});

test("Structural tagged 与 Aggregation fan 以稳定 Fact ID 更新完整性并重开", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await openNewWorkbench(page, "Structural tagged fan E2E");

  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  const whole = canvasNode(page, "Object 1");
  const partA = canvasNode(page, "Object 2");
  const partB = canvasNode(page, "Object 3");
  await expect(whole).toBeVisible();
  await expect(partA).toBeVisible();
  await expect(partB).toBeVisible();

  const taggedRevision = await createStructuralRelation(page, whole, partA, "CAP-ISO-STRUCT-003", undefined, {
    forward_tag: "contains",
    reverse_tag: "belongs to",
  });
  await expect(committedRelationAnchors(page)).toHaveCount(1);

  const fanRevision = await createStructuralRelation(page, whole, [partA, partB], "CAP-ISO-STRUCT-005", "INCOMPLETE");
  expect(taggedRevision).not.toBe(fanRevision);
  await expect(committedRelationAnchors(page)).toHaveCount(2);
  await expect(page.getByText("...", { exact: true })).toHaveCount(1);

  const fanFactId = await selectIncompleteFan(page);
  await page.getByTestId("p03-structural-update-open").click();
  await expect(page.getByTestId("p03-structural-update")).toBeVisible();
  await page.getByTestId("p03-structural-update-completeness").selectOption("COMPLETE");
  const completeRevision = await commitAndRead(page, page.getByTestId("p03-structural-update").getByRole("button", { name: "保存", exact: true }));
  await expect(committedRelationAnchors(page)).toHaveCount(2);
  await expect(page.locator(`[data-cell-id="${fanFactId}.root"]`)).toHaveCount(1);
  await expect(page.getByText("...", { exact: true })).toHaveCount(0);

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(completeRevision);
  await expect(page.locator(`[data-cell-id="${fanFactId}.root"]`)).toHaveCount(1);
  await expect(page.getByText("...", { exact: true })).toHaveCount(0);
});

test("十类 Structural Link 均通过 Runtime 候选生成 OPL、Trace 并在重开后保持", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1400 });
  await openNewWorkbench(page, "All structural E2E");

  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  const objectOne = canvasNode(page, "Object 1");
  const objectTwo = canvasNode(page, "Object 2");
  const objectThree = canvasNode(page, "Object 3");
  await expect(objectOne).toBeVisible();
  await expect(objectTwo).toBeVisible();
  await expect(objectThree).toBeVisible();
  const firstBox = await objectOne.boundingBox();
  const secondBox = await objectTwo.boundingBox();
  if (!firstBox || !secondBox) throw new Error("未找到 Structural Object 边界");
  expect(secondBox.y - firstBox.y).toBeGreaterThanOrEqual(176);

  await objectOne.click({ position: { x: 20, y: 20 } });
  await commitAndRead(page, page.getByTestId("p03-tool-attribute"));
  await objectOne.locator('[data-testid^="p03-feature-toggle-"]').click();
  const attribute = canvasNode(page, "Attribute 1");
  await createState(page, objectOne, "Ready");
  await createState(page, objectTwo, "Finished");
  await createFeatureState(page, attribute, "High");
  const ready = canvasNode(page, "Ready");
  const finished = canvasNode(page, "Finished");
  const high = canvasNode(page, "High");
  const preexistingEdgeIds = new Set(await page.locator(".x6-edge").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-cell-id"))));

  await createStructuralRelation(page, objectOne, objectTwo, "CAP-ISO-STRUCT-001", undefined, { forward_tag: "owns" });
  expect(isOpenArrow((await latestCommittedEdgeSignature(page)).target)).toBe(true);
  await createStructuralRelation(page, objectOne, objectTwo, "CAP-ISO-STRUCT-002");
  expect(isOpenArrow((await latestCommittedEdgeSignature(page)).target)).toBe(true);
  await createStructuralRelation(page, objectOne, objectTwo, "CAP-ISO-STRUCT-003", undefined, { forward_tag: "includes", reverse_tag: "belongs to" });
  expect(isOpenHarpoon((await latestCommittedEdgeSignature(page)).source) && isOpenHarpoon((await latestCommittedEdgeSignature(page)).target)).toBe(true);
  await createStructuralRelation(page, objectOne, objectTwo, "CAP-ISO-STRUCT-004");
  expect(isOpenHarpoon((await latestCommittedEdgeSignature(page)).source) && isOpenHarpoon((await latestCommittedEdgeSignature(page)).target)).toBe(true);
  const binaryIds = (await page.locator(".x6-edge").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-cell-id") ?? "")))
    .filter((id) => !preexistingEdgeIds.has(id));
  expect(binaryIds).toHaveLength(4);
  const binaryEdges = page.locator(binaryIds.map((id) => `.x6-edge[data-cell-id="${id}"]`).join(", "));
  const binaryPaths = (await edgeVisualSignaturesIn(binaryEdges)).map((edge) => edge.path).sort();
  const pathBounds = await binaryEdges.evaluateAll((elements) => elements.map((element) => {
    const path = element.querySelector<SVGPathElement>('path[stroke="#20242a"]');
    if (!path) throw new Error("未找到 Structural SVG 路径");
    const box = path.getBoundingClientRect();
    return { left: box.left, right: box.right };
  }));
  expect(pathBounds.filter((box) => box.left < firstBox.x - 8)).toHaveLength(2);
  expect(pathBounds.filter((box) => box.right > firstBox.x + firstBox.width + 8)).toHaveLength(2);
  await page.screenshot({ path: test.info().outputPath("structural-open-markers.png") });
  await createStructuralRelation(page, objectOne, [objectTwo, objectThree], "CAP-ISO-STRUCT-005", "COMPLETE");
  await createStructuralRelation(page, objectOne, attribute, "CAP-ISO-STRUCT-006", "COMPLETE");
  await createStructuralRelation(page, objectOne, [objectTwo, objectThree], "CAP-ISO-STRUCT-007", "COMPLETE");
  await createStructuralRelation(page, objectOne, objectTwo, "CAP-ISO-STRUCT-008");
  await expect(page.locator('.x6-node[data-cell-id$=".junction.inner"] ellipse')).toHaveCount(1);
  const exhibitionTriangleCount = await page.locator('.x6-node[data-cell-id$=".junction.inner"] polygon').count();
  await createStructuralRelation(page, objectOne, high, "CAP-ISO-STRUCT-009");
  await expect(page.locator('.x6-node[data-cell-id$=".junction.inner"] polygon')).toHaveCount(exhibitionTriangleCount + 1);
  await page.screenshot({ path: test.info().outputPath("structural-triangle-junctions.png") });
  const revision = await createStructuralRelation(page, ready, finished, "CAP-ISO-STRUCT-010", undefined, { forward_tag: "transfers" });
  expect(isOpenArrow((await latestCommittedEdgeSignature(page)).target)).toBe(true);

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(revision);
  await expect(page.getByTestId("p03-opl-sentence")).toHaveCount(11);
  await objectOne.locator('[data-testid^="p03-feature-toggle-"]').click();
  await expect(page.locator('.x6-node[data-cell-id$=".junction.inner"] ellipse')).toHaveCount(1);
  await expect(page.locator('.x6-node[data-cell-id$=".junction.inner"] polygon')).toHaveCount(exhibitionTriangleCount + 1);
  const reopenedEdges = await edgeVisualSignatures(page);
  expect(reopenedEdges.filter((edge) => isOpenArrow(edge.target))).toHaveLength(3);
  expect(reopenedEdges.filter((edge) => isOpenHarpoon(edge.source) && isOpenHarpoon(edge.target))).toHaveLength(2);
  const reopenedBinaryPaths = await page.locator(".x6-edge").evaluateAll((elements, ids) => elements
    .filter((element) => ids.includes(element.getAttribute("data-cell-id") ?? ""))
    .map((element) => element.querySelector('path[stroke="#20242a"]')?.getAttribute("d") ?? "").sort(), binaryIds);
  expect(reopenedBinaryPaths).toEqual(binaryPaths);
  await page.screenshot({ path: test.info().outputPath("structural-symbols-reopened.png") });

  const traceCases = [
    ["Object 1 owns Object 2.", "CAP-ISO-STRUCT-001"],
    ["Object 1 relates to Object 2.", "CAP-ISO-STRUCT-002"],
    ["Object 1 includes Object 2.", "CAP-ISO-STRUCT-003"],
    ["Object 1 and Object 2 are related.", "CAP-ISO-STRUCT-004"],
    ["Object 1 consists of Object 2 and Object 3.", "CAP-ISO-STRUCT-005"],
    ["Object 1 exhibits Attribute 1.", "CAP-ISO-STRUCT-006"],
    ["Object 2 and Object 3 are Object 1.", "CAP-ISO-STRUCT-007"],
    ["Object 2 is an instance of Object 1.", "CAP-ISO-STRUCT-008"],
    ["Object 1 exhibits High Attribute 1.", "CAP-ISO-STRUCT-009"],
    ["Ready Object 1 transfers Finished Object 2.", "CAP-ISO-STRUCT-010"],
  ] as const;
  for (const [sentence, capabilityId] of traceCases) {
    await page.getByTestId("p03-opl-sentence").filter({ hasText: sentence }).click();
    await openSelectedInspector(page);
    await expect(page.locator(".inspector-panel")).toContainText(capabilityId);
  }
});

async function openNewWorkbench(page: Page, prefix: string) {
  const suffix = Date.now();
  await page.goto("/projects");
  await expect(page.getByTestId("p01-project-library")).toBeVisible();
  await page.getByTestId("p01-create-project").click();
  await page.getByTestId("ov01-project-name").fill(`${prefix} ${suffix}`);
  await page.getByTestId("ov01-create-project").getByRole("button", { name: "创建并继续" }).click();
  await expect(page.getByTestId("p02-project-detail")).toBeVisible();
  await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill(`模型 ${suffix}`);
  await page.getByTestId("ov02-create-model").getByRole("button", { name: "创建并打开工作台" }).click();
  await expectWorkbenchReady(page);
}

async function createState(page: Page, owner: Locator, name: string): Promise<string> {
  const beforeIds = new Set(await page.locator(".x6-node").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-cell-id"))));
  await owner.click({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId("p03-tool-state")).toBeEnabled();
  await commitAndRead(page, page.getByTestId("p03-tool-state"));
  let createdId: string | null | undefined;
  await expect.poll(async () => {
    createdId = (await page.locator(".x6-node").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-cell-id"))))
      .find(id => id && !beforeIds.has(id));
    return createdId ?? "";
  }).not.toBe("");
  if (!createdId) throw new Error("未找到直接创建的 State");
  await page.locator(`.x6-node[data-cell-id="${createdId}"]`).click();
  if (!await page.getByTestId("p03-state-inspector").count()) await page.getByTestId("p03-right-panel-open").click();
  await page.getByTestId("p03-state-inspector-name").fill(name);
  const revision = await commitAndRead(page, page.getByRole("button", { name: "保存 State", exact: true }));
  await page.getByTestId("p03-right-panel-close").click();
  return revision;
}

async function createFeatureState(page: Page, owner: Locator, name: string): Promise<string> {
  const ownerId = await owner.getAttribute("data-cell-id");
  if (!ownerId) throw new Error("Feature X6 cell ID 不存在");
  const ownerElementId = await page.evaluate(async ({ ownerId, name }) => {
    const match = window.location.pathname.match(/^\/projects\/([^/]+)\/models\/([^/]+)\/workbench$/);
    const session = (window as Window & { __OPM_LOCAL_SESSION__?: string }).__OPM_LOCAL_SESSION__;
    if (!match || !session) throw new Error("无法读取草稿工作台身份");
    const [, projectId, modelId] = match;
    const requestId = (prefix: string) => `${prefix}.e2e.${crypto.randomUUID().replaceAll("-", "")}`;
    const post = async (operation: string, body: unknown) => {
      const response = await fetch(`/api/v2/projects/${encodeURIComponent(projectId!)}/models/${encodeURIComponent(modelId!)}/draft/${operation}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-OPM-Session": session },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(`草稿 ${operation} 失败：${JSON.stringify(payload)}`);
      return payload;
    };
    const opened = await post("open", { request_id: requestId("open"), context_id: null });
    const token = opened.draft_token;
    const contextId = opened.context_id;
    const scope = { context_id: contextId, selection_id: ownerId, intent: "CREATE_STATE", endpoints: [] };
    const capabilities = await post("capabilities", { request_id: requestId("capabilities"), draft_token: token, scope });
    const option = capabilities.data.options.find((item: { command_type: string; enabled: boolean }) => item.command_type === "CREATE_STATE" && item.enabled);
    if (!option) throw new Error("Feature State 没有可用的 Runtime 候选");
    const projection = await post("projection", { request_id: requestId("projection"), draft_token: token, context_id: contextId });
    const feature = projection.data.constructs.find((item: { target_id: string }) => item.target_id === ownerId);
    if (!feature?.owner_id) throw new Error("Feature owner 不存在");
    await post("commands", {
      request_id: requestId("edit"),
      command_id: requestId("command"),
      expected_draft_token: token,
      scope,
      authorization: { capability_query_id: option.capability_query_id, selected_option_id: option.option_id },
      command: {
        command_type: "CREATE_STATE",
        payload: {
          context_id: contextId,
          owner_ref: { target_kind: "FEATURE", target_id: ownerId },
          capability_ref: option.capability_ref,
          name_or_value: name,
          state_roles: [],
          occurrence: { ownership: "OWNED", construct_role: "FEATURE_STATE_NODE" },
          layout: { x: feature.layout.x + 36, y: feature.layout.y + 32 },
        },
      },
    });
    return feature.owner_id as string;
  }, { ownerId, name });
  await page.reload();
  await expectWorkbenchReady(page);
  const toggle = page.locator(`.x6-node[data-cell-id="${ownerElementId}"] [data-testid^="p03-feature-toggle-"]`);
  if (await toggle.getAttribute("aria-label") === "展开所属特征 / Expand features") await toggle.click();
  await expect(canvasNode(page, name)).toBeVisible();
  return revisionTag(page);
}

async function createProceduralRelation(page: Page, source: Locator, targets: Locator[], capabilityId: string, duration?: string): Promise<string> {
  const revisionBefore = await revisionTag(page);
  await activateRelationCatalogItem(page, "PROCEDURAL", capabilityId);
  for (const [index, target] of targets.entries()) {
    if (index > 0) await prepareNextRelationEndpoint(page);
    await dragRelationEndpoint(page, source, target);
  }
  let revision: string;
  if (duration) {
    await expect(page.getByTestId("p03-relation-preview")).toBeVisible();
    await page.getByTestId("p03-relation-duration").fill(duration);
    revision = await commitRelationParametersAndRead(page);
  } else {
    await expect(page.locator(".revision-tag")).not.toHaveText(revisionBefore);
    revision = await revisionTag(page);
  }
  await expect(page.getByTestId("p03-relation-preview")).toHaveCount(0);
  await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-relation-preview-id", "");
  await expect.poll(() => candidateCellIds(page)).toEqual([]);
  return revision;
}

function pathSegmentCount(path: string): number {
  return (path.match(/[LCQ]/g) ?? []).length;
}

type EdgeMarker = { shape: string; fill: string | null; path: string | null } | null;

type EdgeVisualSignature = { source: EdgeMarker; target: EdgeMarker; path: string };

async function edgeVisualSignatures(page: Page): Promise<EdgeVisualSignature[]> {
  return edgeVisualSignaturesIn(page.locator(".x6-edge"));
}

async function edgeVisualSignaturesIn(edges: Locator): Promise<EdgeVisualSignature[]> {
  return edges.evaluateAll((elements) => elements.map((element) => {
    const line = Array.from(element.querySelectorAll<SVGPathElement>("path"))
      .find((path) => path.getAttribute("stroke") === "#20242a");
    if (!line) throw new Error("未找到关系线 SVG 路径");
    const marker = (attribute: "marker-start" | "marker-end") => {
      const markerId = line.getAttribute(attribute)?.match(/^url\(#(.+)\)$/)?.[1];
      const shape = markerId ? document.getElementById(markerId)?.firstElementChild : undefined;
      return shape ? { shape: shape.tagName.toLowerCase(), fill: shape.getAttribute("fill"), path: shape.getAttribute("d") } : null;
    };
    return { source: marker("marker-start"), target: marker("marker-end"), path: line.getAttribute("d") ?? "" };
  }));
}

async function latestCommittedEdgeSignature(page: Page): Promise<EdgeVisualSignature> {
  const edge = committedRelationAnchors(page).last().locator("xpath=ancestor::*[contains(@class, 'x6-edge')][1]");
  const signatures = await edgeVisualSignaturesIn(edge);
  if (signatures.length !== 1) throw new Error("未找到最新提交的关系线");
  return signatures[0]!;
}

function isClosedArrow(marker: EdgeMarker): boolean {
  return marker?.shape === "path" && marker.fill === "#ffffff" && Boolean(marker.path?.match(/[Ll]/));
}

function isOpenArrow(marker: EdgeMarker): boolean {
  return marker?.shape === "path" && marker.fill === "none" && (marker.path?.match(/[Ll]/g) ?? []).length === 2;
}

function isOpenHarpoon(marker: EdgeMarker): boolean {
  return marker?.shape === "path" && marker.fill === "none" && (marker.path?.match(/[Ll]/g) ?? []).length === 1;
}

function isCircle(marker: EdgeMarker, fill: "#20242a" | "#ffffff"): boolean {
  return marker?.shape === "circle" && marker.fill === fill;
}

function isLightningPath(path: string): boolean {
  const points = Array.from(path.matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)).map((match) => Number(match[1]));
  if (points.length < 5) return false;
  const xChanges = points.slice(1).map((point, index) => Math.sign(point - points[index])).filter(Boolean);
  const reversals = xChanges.filter((change, index) => index > 0 && change !== xChanges[index - 1]);
  return xChanges.length >= 4 && reversals.length >= 2;
}

async function createStructuralRelation(
  page: Page,
  source: Locator,
  target: Locator | Locator[],
  capabilityId: string,
  completeness?: "COMPLETE" | "INCOMPLETE",
  labels?: Record<string, string>,
  reselectBeforeConfirm = false,
): Promise<string> {
  const revisionBefore = await revisionTag(page);
  await activateRelationCatalogItem(page, "STRUCTURAL", capabilityId);
  const targets = Array.isArray(target) ? target : [target];
  for (const [index, endpoint] of targets.entries()) {
    await dragRelationEndpoint(page, source, endpoint, {
      shift: index < targets.length - 1,
      alt: index === targets.length - 1 && completeness === "INCOMPLETE",
    });
  }
  const form = page.getByTestId("p03-relation-candidate");
  let revision: string;
  if (labels || completeness === "INCOMPLETE") {
    await expect(form).toBeVisible();
    if (labels) {
      if (completeness) await page.getByTestId("p03-structural-completeness").selectOption(completeness);
      for (const [slot, text] of Object.entries(labels)) await page.getByTestId(`p03-structural-label-${slot}`).fill(text);
      revision = await commitRelationParametersAndRead(page);
    } else {
      const before = await revisionTag(page);
      await page.getByTestId("p03-structural-completeness").selectOption(completeness ?? "COMPLETE");
      await expect(page.locator(".revision-tag")).not.toHaveText(before);
      revision = await revisionTag(page);
    }
  } else {
    await expect(page.locator(".revision-tag")).not.toHaveText(revisionBefore);
    revision = await revisionTag(page);
  }
  if (reselectBeforeConfirm) {
    const relationCount = await committedRelationAnchors(page).count();
    const otherCapabilityId = capabilityId === "CAP-ISO-STRUCT-007" ? "CAP-ISO-STRUCT-006" : "CAP-ISO-STRUCT-007";
    await activateRelationCatalogItem(page, "STRUCTURAL", otherCapabilityId);
    await expect(committedRelationAnchors(page)).toHaveCount(relationCount);
    await expect(page.locator(".revision-tag")).toHaveText(revision);
    await expect(page.getByTestId(`p03-relation-quick-option-${otherCapabilityId}`)).toHaveClass(/is-active/);
  }
  await expect(page.getByTestId("p03-relation-preview")).toHaveCount(0);
  await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-relation-preview-id", "");
  await expect.poll(() => candidateCellIds(page)).toEqual([]);
  return revision;
}

async function selectIncompleteFan(page: Page): Promise<string> {
  const root = page.locator('.x6-edge[data-cell-id$=".root"]');
  await expect(root).toHaveCount(1);
  const cellId = await root.getAttribute("data-cell-id");
  await page.getByTestId("p03-opl-sentence").filter({ hasText: "and at least one other part." }).click();
  await openSelectedInspector(page);
  await expect(page.getByText("不完整", { exact: true })).toBeVisible();
  const factId = cellId?.replace(/\.root$/, "");
  if (!factId) throw new Error("未找到 Aggregation fan 的稳定 Fact ID");
  return factId;
}

async function applyControlForText(page: Page, relationText: string, capabilityId: string): Promise<string> {
  await page.getByRole("button", { name: relationText, exact: true }).click();
  await openSelectedInspector(page);
  return applySelectedControl(page, capabilityId);
}

async function openSelectedInspector(page: Page) {
  if (!await page.getByTestId("p03-right-panel").isVisible()) await page.getByTestId("p03-right-panel-open").click();
}

async function applySelectedControl(page: Page, capabilityId: string): Promise<string> {
  await activateRelationCatalogItem(page, "CONTROL", capabilityId);
  await expect(page.getByTestId("p03-control-preview")).toBeVisible();
  const revision = await commitAndRead(page, page.getByTestId("p03-control-preview-confirm"));
  await expect(page.getByTestId("p03-control-preview")).toHaveCount(0);
  await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-relation-preview-id", "");
  await expect.poll(() => candidateCellIds(page)).toEqual([]);
  return revision;
}

async function activateRelationCatalogItem(
  page: Page,
  family: "PROCEDURAL" | "CONTROL" | "STRUCTURAL",
  capabilityId: string,
  expectedPhase = "relation-armed",
) {
  if (capabilityId === "CAP-ISO-PROC-002") capabilityId = "CAP-ISO-PROC-001";
  await expect(page.getByTestId(`p03-relation-toolbar-${family}`)).toBeVisible();
  const quickItem = page.getByTestId(`p03-relation-quick-option-${capabilityId}`);
  const item = await quickItem.count()
    ? quickItem
    : page.getByTestId(`p03-relation-menu-option-${capabilityId}`);
  if (!await quickItem.count()) await page.getByTestId(`p03-relation-menu-toggle-${family}`).click();
  await expect(item).toBeEnabled();
  await item.click();
  if (family !== "CONTROL") {
    await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-relation-gesture-phase", expectedPhase);
  }
}

async function dragRelationEndpoint(page: Page, source: Locator, target: Locator, modifiers: { shift?: boolean; alt?: boolean } = {}) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sourcePoint = await nodeGesturePoint(source);
  const targetPoint = await nodeGesturePoint(target);
  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  if (modifiers.shift) await page.keyboard.down("Shift");
  if (modifiers.alt) await page.keyboard.down("Alt");
  await page.mouse.down();
  await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-relation-gesture-phase", "dragging");
  await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 8 });
  await page.mouse.up();
  if (modifiers.alt) await page.keyboard.up("Alt");
  if (modifiers.shift) await page.keyboard.up("Shift");
  await expect(page.getByTestId("p03-canvas")).not.toHaveAttribute("data-relation-gesture-phase", "dragging");
  // fan 的下一段必须等待本段异步候选查询完成，不能在 filtering 时提前按下鼠标。
  await expect(page.getByTestId("p03-canvas")).not.toHaveAttribute("data-relation-gesture-phase", "candidate-filtering");
}

async function nodeGesturePoint(node: Locator) {
  const box = await node.boundingBox();
  if (!box) throw new Error("关系端点不可见");
  const centered = box.height <= 32 || await node.locator("ellipse").count() > 0;
  return centered
    ? { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    : { x: box.x + Math.min(20, box.width / 2), y: box.y + Math.min(20, box.height / 2) };
}

async function prepareNextRelationEndpoint(page: Page) {
  const canvas = page.getByTestId("p03-canvas");
  const continueMessage = page.locator(".canvas-state").filter({ hasText: "继续拖线" });
  await expect(continueMessage).toBeVisible();
  await expect(canvas).toHaveAttribute("data-relation-gesture-phase", "relation-armed");
}

function committedRelationAnchors(page: Page): Locator {
  return page.locator('.x6-edge [data-opm-capture-cell-id]');
}

async function candidateCellIds(page: Page): Promise<string[]> {
  return page.locator('[data-opm-candidate-cell-id]').evaluateAll((elements) => elements.map((element) =>
    element.closest('.x6-cell')?.getAttribute('data-cell-id') ?? 'unknown',
  ));
}

async function commitAndRead(page: Page, trigger: Locator): Promise<string> {
  const before = await revisionTag(page);
  await trigger.click();
  await expect(page.locator(".revision-tag")).not.toHaveText(before);
  return revisionTag(page);
}

async function commitRelationParametersAndRead(page: Page): Promise<string> {
  const before = await revisionTag(page);
  await page.getByTestId("p03-relation-candidate").locator("input").last().press("Enter");
  await expect(page.locator(".revision-tag")).not.toHaveText(before);
  return revisionTag(page);
}

async function revisionTag(page: Page): Promise<string> {
  return (await page.locator(".revision-tag").innerText()).trim();
}

function canvasNode(page: Page, label: string): Locator {
  return page.locator(".x6-node").filter({ hasText: label });
}

async function panCanvas(page: Page, frame: { x: number; y: number; width: number; height: number }, deltaY: number) {
  await page.getByTestId("p03-tool-pan").click();
  await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-canvas-tool", "pan");
  await page.locator(".opd-canvas-host").hover({ position: { x: frame.width - 24, y: 36 } });
  await page.mouse.wheel(0, deltaY);
}

async function dragCanvasWithPanTool(page: Page, frame: { x: number; y: number; width: number; height: number }, deltaX: number, deltaY: number) {
  const trackedNode = page.locator(".x6-node").first();
  const before = await trackedNode.boundingBox();
  if (!before) throw new Error("平移前节点位置不可观测");
  await page.getByTestId("p03-tool-pan").click();
  await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-canvas-tool", "pan");
  const start = { x: frame.x + frame.width - 120, y: frame.y + frame.height - 120 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + deltaX, start.y + deltaY, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => {
    const after = await trackedNode.boundingBox();
    return after ? { x: Math.round(after.x - before.x), y: Math.round(after.y - before.y) } : null;
  }).toEqual({ x: deltaX, y: deltaY });
}


async function expectWorkbenchReady(page: Page) {
  await expect(page.getByTestId("p03-workbench")).toBeVisible();
  await expect(page.locator(".revision-tag")).not.toHaveText("草稿 -");
}

async function expectDesktopWorkbenchLayout(page: Page) {
  const layout = await page.locator(".workbench").evaluate(() => {
    const height = (selector: string) => Math.round(document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().height ?? 0);
    return {
      bottom: height(".bottom-panel"),
      validation: height(".validation-status"),
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });

  expect(layout.bottom).toBe(240);
  expect(layout.validation).toBe(38);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
}

async function expectMobileCanvasReachable(page: Page, process: Locator) {
  const toolbar = page.locator(".editor-toolbar");
  const frame = page.locator(".canvas-frame");
  await frame.scrollIntoViewIfNeeded();
  await expect(toolbar).toHaveCSS("overflow-x", "auto");

  const layout = await page.locator(".editor-panel").evaluate(() => {
    const toolbarRect = document.querySelector<HTMLElement>(".editor-toolbar")?.getBoundingClientRect();
    const frameRect = document.querySelector<HTMLElement>(".canvas-frame")?.getBoundingClientRect();
    return {
      toolbarBottom: Math.round(toolbarRect?.bottom ?? 0),
      frameTop: Math.round(frameRect?.top ?? 0),
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(layout.frameTop).toBeGreaterThanOrEqual(layout.toolbarBottom);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);

  const frameBox = await frame.boundingBox();
  const canvas = page.getByTestId("p03-canvas");
  const canvasBox = await canvas.boundingBox();
  const before = await process.boundingBox();
  if (!frameBox || !canvasBox || !before) throw new Error("未找到移动端画布或过程结点");
  expect(before.x).toBeGreaterThan(frameBox.x + frameBox.width);

  await canvas.hover({
    position: {
      x: Math.min(frameBox.width - 32, canvasBox.width - 32),
      y: Math.min(frameBox.height - 28, canvasBox.height - 28),
    },
  });
  await page.mouse.wheel(320, 0);

  await expect.poll(async () => (await process.boundingBox())?.x ?? Number.POSITIVE_INFINITY).toBeLessThan(frameBox.x + frameBox.width);
}
