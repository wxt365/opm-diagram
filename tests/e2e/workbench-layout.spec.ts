import { expect, test, type Locator, type Page } from "@playwright/test";

test("真实 P01 到 P03 主路径提交并在三个视口重开", async ({ page }) => {
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

  const initialRevision = await revisionTag(page);
  await page.getByTestId("p03-tool-consumption").click();
  await expect(page.locator(".command-feedback")).toContainText("请先创建一个 Object 和一个 Process");
  await expect(page.locator(".revision-tag")).toHaveText(initialRevision);

  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await expect(page.locator(".x6-node")).toHaveCount(1);
  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  await expect(page.locator(".x6-node")).toHaveCount(2);
  await page.locator(".x6-node").first().click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId("p03-tool-state")).toBeEnabled();
  await page.getByTestId("p03-tool-state").click();
  await page.locator(".x6-node").first().click();
  await expect(page.getByTestId("p03-state-candidate")).toBeVisible();
  await page.getByTestId("p03-state-name").fill("Ready");
  const stateRevision = await commitAndRead(page, page.getByTestId("p03-state-candidate").getByRole("button", { name: "创建", exact: true }));
  await expect(page.locator(".x6-node")).toHaveCount(3);
  await page.locator(".x6-node").nth(2).click();
  const committedRevision = await commitAndRead(page, page.getByTestId("p03-tool-consumption"));
  await expect(page.locator(".x6-edge")).toHaveCount(1);
  await expect(page.getByTestId("p03-opl-sentence")).toHaveText("Process 1 consumes Ready Object 1.");
  expect(stateRevision).not.toBe(committedRevision);

  await page.locator(".x6-node").nth(1).click();
  await page.getByTestId("p03-tool-procedural-relation").click();
  await expect(page.getByTestId("p03-relation-target")).toBeVisible();
  await page.locator(".x6-node").first().click({ position: { x: 10, y: 10 } });
  await page.getByTestId("p03-relation-resolve").click();
  await expect(page.getByTestId("p03-relation-catalog")).toBeVisible();
  const resultRevision = await commitAndRead(page, page.getByTestId("p03-relation-option-CAP-ISO-PROC-002"));
  await expect(page.locator(".x6-edge")).toHaveCount(2);
  await expect(page.getByTestId("p03-opl-sentence")).toHaveCount(2);
  await expect(page.getByText("Process 1 yields Object 1.", { exact: true })).toBeVisible();

  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  const objectTwo = canvasNode(page, "Object 2");
  await expect(objectTwo).toHaveCount(1);
  const canvasFrame = page.locator(".canvas-frame");
  const frameBox = await canvasFrame.boundingBox();
  if (!frameBox) throw new Error("未找到画布编辑区域");
  await page.getByTestId("p03-canvas").hover({ position: { x: frameBox.width - 24, y: 36 } });
  await page.mouse.wheel(0, 260);
  await expect.poll(async () => (await objectTwo.boundingBox())?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(frameBox.y + frameBox.height - 32);
  await objectTwo.click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId("p03-tool-state")).toBeEnabled();
  await page.getByTestId("p03-tool-state").click();
  await objectTwo.click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId("p03-state-candidate")).toBeVisible();
  await page.getByTestId("p03-state-name").fill("Finished");
  await commitAndRead(page, page.getByTestId("p03-state-candidate").getByRole("button", { name: "创建", exact: true }));

  await page.getByTestId("p03-canvas").hover({ position: { x: frameBox.width - 24, y: 36 } });
  await page.mouse.wheel(0, -260);
  const toolbarBottom = await page.locator(".editor-toolbar").evaluate((element) => element.getBoundingClientRect().bottom);
  await expect.poll(async () => (await canvasNode(page, "Ready").boundingBox())?.y ?? Number.NEGATIVE_INFINITY).toBeGreaterThan(toolbarBottom + 4);
  await canvasNode(page, "Ready").click();
  await page.getByTestId("p03-tool-procedural-relation").click();
  await canvasNode(page, "Process 1").click();
  await page.getByTestId("p03-canvas").hover({ position: { x: frameBox.width - 24, y: 36 } });
  await page.mouse.wheel(0, 260);
  await expect.poll(async () => (await canvasNode(page, "Finished").boundingBox())?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(frameBox.y + frameBox.height - 32);
  await canvasNode(page, "Finished").click();
  await page.getByTestId("p03-relation-resolve").click();
  await expect(page.getByTestId("p03-relation-option-CAP-ISO-PROC-008")).toBeVisible();
  await commitAndRead(page, page.getByTestId("p03-relation-option-CAP-ISO-PROC-008"));
  await expect(page.locator(".x6-edge")).toHaveCount(4);
  await expect(page.getByText("Process 1 changes Ready Object 1 to Finished Object 2.", { exact: true })).toBeVisible();

  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  const processOne = canvasNode(page, "Process 1");
  const processTwo = canvasNode(page, "Process 2");
  await expect(processTwo).toHaveCount(1);
  await panCanvas(page, frameBox, -260);
  await expect.poll(async () => (await processOne.boundingBox())?.y ?? Number.NEGATIVE_INFINITY).toBeGreaterThan(toolbarBottom + 4);
  await processOne.click();
  await page.getByTestId("p03-tool-procedural-relation").click();
  await panCanvas(page, frameBox, 260);
  await expect.poll(async () => (await processTwo.boundingBox())?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(frameBox.y + frameBox.height - 32);
  await processTwo.click();
  await page.getByTestId("p03-relation-resolve").click();
  await expect(page.getByTestId("p03-relation-option-CAP-ISO-PROC-013")).toBeVisible();
  await commitAndRead(page, page.getByTestId("p03-relation-option-CAP-ISO-PROC-013"));
  await expect(page.locator(".x6-edge")).toHaveCount(5);
  await expect(page.getByText("Process 1 invokes Process 2.", { exact: true })).toBeVisible();

  await panCanvas(page, frameBox, -260);
  await expect.poll(async () => (await processOne.boundingBox())?.y ?? Number.NEGATIVE_INFINITY).toBeGreaterThan(toolbarBottom + 4);
  await processOne.click();
  await page.getByTestId("p03-tool-procedural-relation").click();
  await panCanvas(page, frameBox, 260);
  await expect.poll(async () => (await processTwo.boundingBox())?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(frameBox.y + frameBox.height - 32);
  await processTwo.click();
  await page.getByTestId("p03-relation-resolve").click();
  await expect(page.getByTestId("p03-relation-option-CAP-ISO-PROC-015")).toBeVisible();
  await page.getByTestId("p03-relation-duration").fill("PT5M");
  const exceptionRevision = await commitAndRead(page, page.getByTestId("p03-relation-option-CAP-ISO-PROC-015"));
  await expect(page.locator(".x6-edge")).toHaveCount(6);
  await expect(page.getByText("When Process 1 exceeds PT5M, Process 2 handles the exception.", { exact: true })).toBeVisible();

  await page.getByTestId("p03-tab-history").click();
  await expect(page.getByTestId("p03-history-panel").locator("p")).toHaveCount(12);
  await page.getByTestId("p03-tab-text").click();

  await page.getByTestId("p03-run-validation").click();
  await expect(page.locator(".validation-status")).toContainText("结果当前");
  await expect(page.locator(".validation-status progress")).toHaveAttribute("value", "100");

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(exceptionRevision);
  await expect(page.locator(".x6-node")).toHaveCount(6);
  await expect(page.locator(".x6-edge")).toHaveCount(6);
  await expect(page.getByTestId("p03-opl-sentence")).toHaveCount(5);
  await expect(page.getByText("Process 1 yields Object 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 changes Ready Object 1 to Finished Object 2.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 invokes Process 2.", { exact: true })).toBeVisible();
  await expect(page.getByText("When Process 1 exceeds PT5M, Process 2 handles the exception.", { exact: true })).toBeVisible();

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
  const canvasFrame = page.locator(".canvas-frame");
  const frameBox = await canvasFrame.boundingBox();
  if (!frameBox) throw new Error("未找到画布编辑区域");
  await expect(processOne).toBeVisible();
  await expect(processTwo).toBeVisible();

  await processOne.click({ position: { x: 20, y: 20 } });
  await page.getByTestId("p03-tool-procedural-relation").click();
  await processOne.click({ position: { x: 20, y: 20 } });
  await page.getByTestId("p03-relation-resolve").click();
  await expect(page.getByTestId("p03-relation-option-CAP-ISO-PROC-014")).toBeVisible();
  await commitAndRead(page, page.getByTestId("p03-relation-option-CAP-ISO-PROC-014"));
  await expect(page.getByText("Process 1 invokes itself.", { exact: true })).toBeVisible();

  await processOne.click({ position: { x: 20, y: 20 } });
  await page.getByTestId("p03-tool-procedural-relation").click();
  await panCanvas(page, frameBox, 260);
  await expect.poll(async () => (await processTwo.boundingBox())?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(frameBox.y + frameBox.height - 32);
  await processTwo.click({ position: { x: 20, y: 20 } });
  await page.getByTestId("p03-relation-resolve").click();
  await expect(page.getByTestId("p03-relation-option-CAP-ISO-PROC-016")).toBeVisible();
  await page.getByTestId("p03-relation-duration").fill("PT3M");
  const revision = await commitAndRead(page, page.getByTestId("p03-relation-option-CAP-ISO-PROC-016"));
  await expect(page.locator(".x6-edge")).toHaveCount(2);
  await expect(page.getByText("When Process 1 is under PT3M, Process 2 handles the exception.", { exact: true })).toBeVisible();

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(revision);
  await expect(page.locator(".x6-edge")).toHaveCount(2);
  await expect(page.getByText("Process 1 invokes itself.", { exact: true })).toBeVisible();
  await expect(page.getByText("When Process 1 is under PT3M, Process 2 handles the exception.", { exact: true })).toBeVisible();
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
  await createState(page, objectTwo, "Finished");
  const ready = canvasNode(page, "Ready");
  await expect(ready).toBeVisible();

  await createProceduralRelation(page, objectOne, [process], "CAP-ISO-PROC-004");
  await createProceduralRelation(page, objectOne, [process], "CAP-ISO-PROC-005");
  await createProceduralRelation(page, ready, [process], "CAP-ISO-PROC-011");
  const revision = await createProceduralRelation(page, ready, [process], "CAP-ISO-PROC-012");
  await expect(page.locator(".x6-edge")).toHaveCount(4);
  await expect(page.getByText("Object 1 handles Process 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 requires Object 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Ready Object 1 handles Process 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 requires Ready Object 1.", { exact: true })).toBeVisible();

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(revision);
  await expect(page.locator(".x6-edge")).toHaveCount(4);
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
  await createState(page, objectTwo, "Finished");
  const ready = canvasNode(page, "Ready");
  const finished = canvasNode(page, "Finished");
  await expect(ready).toBeVisible();
  await expect(finished).toBeVisible();

  await createProceduralRelation(page, ready, [process], "CAP-ISO-PROC-006");
  await createProceduralRelation(page, process, [finished], "CAP-ISO-PROC-007");
  await createProceduralRelation(page, objectOne, [process, objectTwo], "CAP-ISO-PROC-003");
  await createProceduralRelation(page, ready, [process, objectTwo], "CAP-ISO-PROC-009");
  const revision = await createProceduralRelation(page, objectOne, [process, finished], "CAP-ISO-PROC-010");
  await expect(page.locator(".x6-edge")).toHaveCount(8);
  await expect(page.getByText("Process 1 consumes Ready Object 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 yields Finished Object 2.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 affects Object 2.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 changes Ready Object 1 to Object 2.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 changes Object 1 to Finished Object 2.", { exact: true })).toBeVisible();

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(revision);
  await expect(page.locator(".x6-edge")).toHaveCount(8);
  await expect(page.getByText("Process 1 consumes Ready Object 1.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 yields Finished Object 2.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 affects Object 2.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 changes Ready Object 1 to Object 2.", { exact: true })).toBeVisible();
  await expect(page.getByText("Process 1 changes Object 1 to Finished Object 2.", { exact: true })).toBeVisible();
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
  await expect(edges).toHaveCount(20);
  const visualSignatures = await edgeVisualSignatures(page);
  expect(visualSignatures.filter((edge) => isClosedArrow(edge.target))).toHaveLength(16);
  expect(visualSignatures.filter((edge) => isClosedArrow(edge.source))).toHaveLength(8);
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
  await expect(page.locator(".x6-edge")).toHaveCount(4);

  await applyControl(page, 0, "CAP-ISO-CTRL-001");
  await applyControl(page, 1, "CAP-ISO-CTRL-002");
  await applyControl(page, 2, "CAP-ISO-CTRL-003");
  await applyControl(page, 3, "CAP-ISO-CTRL-004");
  await expect(page.locator(".x6-edge-label").filter({ hasText: "e" })).toHaveCount(4);

  await applyControl(page, 0, "CAP-ISO-CTRL-005");
  await applyControl(page, 1, "CAP-ISO-CTRL-006");
  await applyControl(page, 2, "CAP-ISO-CTRL-007");
  const revision = await applyControl(page, 3, "CAP-ISO-CTRL-008");
  await expect(page.locator(".x6-edge-label").filter({ hasText: "c" })).toHaveCount(4);

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(revision);
  await expect(page.locator(".x6-edge")).toHaveCount(4);
  await expect(page.locator(".x6-edge-label").filter({ hasText: "c" })).toHaveCount(4);
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

  const attribute = canvasNode(page, "Attribute 1");
  await expect(attribute).toBeVisible();
  await createState(page, attribute, "High");
  const high = canvasNode(page, "High");
  await expect(high).toBeVisible();

  const exhibitionRevision = await createStructuralRelation(page, object, attribute, "CAP-ISO-STRUCT-006", "COMPLETE");
  await expect(page.locator(".x6-edge")).toHaveCount(2);

  const characterizationRevision = await createStructuralRelation(page, object, high, "CAP-ISO-STRUCT-009");
  expect(exhibitionRevision).not.toBe(characterizationRevision);
  await expect(page.locator(".x6-edge")).toHaveCount(4);
  await expect(page.locator(".x6-node").filter({ hasText: "Attribute 1" })).toHaveCount(1);
  await expect(page.locator(".x6-node").filter({ hasText: "High" })).toHaveCount(1);

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(characterizationRevision);
  await expect(page.locator(".x6-edge")).toHaveCount(4);
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
  await expect(page.locator(".x6-edge")).toHaveCount(1);

  const fanRevision = await createStructuralRelation(page, whole, [partA, partB], "CAP-ISO-STRUCT-005", "INCOMPLETE");
  expect(taggedRevision).not.toBe(fanRevision);
  await expect(page.locator(".x6-edge")).toHaveCount(4);
  await expect(page.getByText("...", { exact: true })).toHaveCount(1);

  const fanFactId = await selectIncompleteFan(page);
  await page.getByTestId("p03-structural-update-open").click();
  await expect(page.getByTestId("p03-structural-update")).toBeVisible();
  await page.getByTestId("p03-structural-update-completeness").selectOption("COMPLETE");
  const completeRevision = await commitAndRead(page, page.getByTestId("p03-structural-update").getByRole("button", { name: "保存", exact: true }));
  await expect(page.locator(".x6-edge")).toHaveCount(4);
  await expect(page.locator(`[data-cell-id="${fanFactId}.root"]`)).toHaveCount(1);
  await expect(page.getByText("...", { exact: true })).toHaveCount(0);

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(completeRevision);
  await expect(page.locator(`[data-cell-id="${fanFactId}.root"]`)).toHaveCount(1);
  await expect(page.getByText("...", { exact: true })).toHaveCount(0);
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

async function createState(page: Page, owner: Locator, name: string) {
  await owner.click({ position: { x: 20, y: 20 } });
  await page.getByTestId("p03-tool-state").click();
  await owner.click({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId("p03-state-candidate")).toBeVisible();
  await page.getByTestId("p03-state-name").fill(name);
  await commitAndRead(page, page.getByTestId("p03-state-candidate").getByRole("button", { name: "创建", exact: true }));
}

async function createProceduralRelation(page: Page, source: Locator, targets: Locator[], capabilityId: string, duration?: string): Promise<string> {
  await source.click({ position: { x: 20, y: 20 } });
  await page.getByTestId("p03-tool-procedural-relation").click();
  for (const target of targets) await target.click({ position: { x: 20, y: 20 } });
  await page.getByTestId("p03-relation-resolve").click();
  const option = page.getByTestId(`p03-relation-option-${capabilityId}`);
  await expect(option).toBeVisible();
  if (duration) await page.getByTestId("p03-relation-duration").fill(duration);
  return commitAndRead(page, option);
}

function pathSegmentCount(path: string): number {
  return (path.match(/[LCQ]/g) ?? []).length;
}

type EdgeMarker = { shape: string; fill: string | null; path: string | null } | null;

type EdgeVisualSignature = { source: EdgeMarker; target: EdgeMarker; path: string };

async function edgeVisualSignatures(page: Page): Promise<EdgeVisualSignature[]> {
  return page.locator(".x6-edge").evaluateAll((elements) => elements.map((element) => {
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

function isClosedArrow(marker: EdgeMarker): boolean {
  return marker?.shape === "path" && marker.fill === "#ffffff" && Boolean(marker.path?.match(/[Ll]/));
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
): Promise<string> {
  await source.click({ position: { x: 20, y: 20 } });
  await page.getByTestId("p03-tool-structural-relation").click();
  for (const endpoint of Array.isArray(target) ? target : [target]) await endpoint.click({ position: { x: 20, y: 20 } });
  await page.getByTestId("p03-relation-resolve").click();
  const option = page.getByTestId(`p03-relation-option-${capabilityId}`);
  await expect(option).toBeVisible();
  await option.click();
  const form = page.getByTestId("p03-structural-candidate");
  await expect(form).toBeVisible();
  if (completeness) await page.getByTestId("p03-structural-completeness").selectOption(completeness);
  for (const [slot, text] of Object.entries(labels ?? {})) await page.getByTestId(`p03-structural-label-${slot}`).fill(text);
  return commitAndRead(page, form.getByRole("button", { name: "创建", exact: true }));
}

async function selectIncompleteFan(page: Page): Promise<string> {
  const root = page.locator('.x6-edge[data-cell-id$=".root"]');
  await expect(root).toHaveCount(1);
  const cellId = await root.getAttribute("data-cell-id");
  await root.locator('path[cursor="pointer"]').click({ force: true });
  await expect(page.getByText("不完整", { exact: true })).toBeVisible();
  const factId = cellId?.replace(/\.root$/, "");
  if (!factId) throw new Error("未找到 Aggregation fan 的稳定 Fact ID");
  return factId;
}

async function applyControl(page: Page, relationIndex: number, capabilityId: string): Promise<string> {
  await page.locator(".x6-edge").nth(relationIndex).click();
  await expect(page.getByTestId("p03-control-open")).toBeVisible();
  await page.getByTestId("p03-control-open").click();
  await expect(page.getByTestId("p03-control-catalog")).toBeVisible();
  const option = page.getByTestId(`p03-control-option-${capabilityId}`);
  await expect(option).toBeVisible();
  return commitAndRead(page, option);
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

async function panCanvas(page: Page, frame: { x: number; y: number; width: number; height: number }, deltaY: number) {
  await page.getByTestId("p03-canvas").hover({ position: { x: frame.width - 24, y: 36 } });
  await page.mouse.wheel(0, deltaY);
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
  expect(layout.validation).toBe(43);
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
