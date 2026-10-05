import { expect, test, type Locator, type Page } from "@playwright/test";

const chromeExecutable = process.env.OPM_E2E_CHROME_EXECUTABLE;
test.use(chromeExecutable ? { launchOptions: { executablePath: chromeExecutable } } : {});

test("Attribute/Operation 显示 owner 连线、可折叠并支持两种名称编辑", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 1000 });
  await openNewWorkbench(page);

  await edit(page, page.getByTestId("p03-tool-object"));
  const owner = canvasNode(page, "Object 1");
  const ownerId = await owner.getAttribute("data-cell-id");
  if (!ownerId) throw new Error("Object X6 cell ID 不存在");
  for (let index = 0; index < 3; index += 1) {
    await owner.click();
    await edit(page, page.getByTestId("p03-tool-attribute"));
  }

  const toggle = owner.locator('[data-testid^="p03-feature-toggle-"]');
  for (const label of ["Attribute 1", "Attribute 2", "Attribute 3"]) await expect(canvasNode(page, label)).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-label", "展开所属特征 / Expand features");
  await toggle.click();
  const attribute = canvasNode(page, "Attribute 1");
  for (const label of ["Attribute 1", "Attribute 2", "Attribute 3"]) await expect(canvasNode(page, label)).toBeVisible();
  const attributeRelationId = `feature.owner-group.${ownerId}.characterization`;
  const ownerEdge = page.locator(`.x6-edge[data-cell-id="${attributeRelationId}"]`);
  const attributeMarker = page.locator(`.x6-node[data-cell-id="${attributeRelationId}.junction"]`);
  const attributeInnerMarker = page.locator(`.x6-node[data-cell-id="${attributeRelationId}.junction.inner"]`);
  await expect(ownerEdge).toHaveCount(1);
  await expect(attributeMarker).toBeVisible();
  await expect(attributeInnerMarker).toBeVisible();
  await expect(page.locator(`.x6-edge[data-cell-id^="${attributeRelationId}.member."]`)).toHaveCount(3);
  await expect(ownerEdge.locator("path[marker-start], path[marker-end]")).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-label", "收起所属特征 / Collapse features");

  const draftIdentity = await page.getByTestId("hs-draft-identity").innerText();
  await page.screenshot({ path: test.info().outputPath("attribute-owner-expanded.png") });
  await toggle.click();
  await expect(attribute).toBeHidden();
  await expect(ownerEdge).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-label", "展开所属特征 / Expand features");
  await expect(page.getByTestId("hs-draft-identity")).toHaveText(draftIdentity);

  await toggle.click();
  await expect(attribute).toBeVisible();
  await expect(ownerEdge).toHaveCount(1);
  await expect(toggle).toHaveAttribute("aria-label", "收起所属特征 / Collapse features");
  await expect(page.getByTestId("hs-draft-identity")).toHaveText(draftIdentity);

  await page.reload();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  await expect(canvasNode(page, "Attribute 1")).toHaveCount(0);
  await owner.locator('[data-testid^="p03-feature-toggle-"]').click();
  await expect(canvasNode(page, "Attribute 1")).toBeVisible();
  await expect(page.locator(`.x6-edge[data-cell-id="${attributeRelationId}"]`)).toHaveCount(1);

  await edit(page, page.getByTestId("p03-tool-process"));
  const process = canvasNode(page, "Process 1");
  const processId = await process.getAttribute("data-cell-id");
  if (!processId) throw new Error("Process X6 cell ID 不存在");
  for (let index = 0; index < 2; index += 1) {
    await process.click();
    await edit(page, page.getByTestId("p03-tool-operation"));
  }
  const processToggle = process.locator('[data-testid^="p03-feature-toggle-"]');
  for (const label of ["Operation 1", "Operation 2"]) await expect(canvasNode(page, label)).toHaveCount(0);
  await expect(processToggle).toHaveAttribute("aria-label", "展开所属特征 / Expand features");
  await processToggle.click();
  const operation = canvasNode(page, "Operation 1");
  for (const label of ["Operation 1", "Operation 2"]) await expect(canvasNode(page, label)).toBeVisible();
  const operationRelationId = `feature.owner-group.${processId}.composition`;
  const operationEdge = page.locator(`.x6-edge[data-cell-id="${operationRelationId}"]`);
  const operationMarker = page.locator(`.x6-node[data-cell-id="${operationRelationId}.junction"]`);
  await expect(operationEdge).toHaveCount(1);
  await expect(operationMarker).toBeVisible();
  await expect(page.locator(`.x6-edge[data-cell-id^="${operationRelationId}.member."]`)).toHaveCount(2);
  await expect(page.locator(`.x6-node[data-cell-id="${operationRelationId}.junction.inner"]`)).toHaveCount(0);
  await processToggle.click();
  await expect(operation).toBeHidden();
  await expect(operationEdge).toHaveCount(0);
  await processToggle.click();
  await expect(operation).toBeVisible();

  await operation.click();
  await page.getByTestId("p03-right-panel-open").click();
  const inspectorName = page.getByTestId("p03-inspector-name");
  await inspectorName.fill("检查操作");
  await inspectorName.press("Enter");
  await expect(canvasNode(page, "检查操作")).toBeVisible();
  await canvasNode(page, "检查操作").dblclick();
  const canvasName = page.getByTestId("p03-name-editor");
  await canvasName.fill("执行检查");
  await canvasName.press("Enter");
  await expect(canvasNode(page, "执行检查")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("feature-owner-operation-renamed.png") });
  await page.setViewportSize({ width: 820, height: 900 });
  await expect(canvasNode(page, "执行检查")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("feature-owner-narrow.png") });
});

async function openNewWorkbench(page: Page) {
  const suffix = Date.now();
  await page.goto("/projects");
  await page.getByTestId("p01-create-project").click();
  await page.getByTestId("ov01-project-name").fill(`Attribute owner E2E ${suffix}`);
  await page.getByRole("button", { name: "创建并继续", exact: true }).click();
  await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill(`模型 ${suffix}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
}

async function edit(page: Page, trigger: Locator) {
  const before = await page.getByTestId("hs-draft-identity").innerText();
  await trigger.click();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(before);
}

function canvasNode(page: Page, label: string) {
  return page.locator(".x6-node").filter({ hasText: label });
}
