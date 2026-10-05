import { expect, test, type Locator, type Page } from "@playwright/test";

const chromeExecutable = process.env.OPM_E2E_CHROME_EXECUTABLE;
test.use(chromeExecutable ? { launchOptions: { executablePath: chromeExecutable } } : {});

test("Feature 默认收起且 State 仅从 Object 一次点击直接创建", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 1000 });
  await openNewWorkbench(page);

  await edit(page, page.getByTestId("p03-tool-object"));
  const owner = canvasNode(page, "Object 1");
  await owner.click();
  await edit(page, page.getByTestId("p03-tool-attribute"));

  const ownerToggle = owner.locator('[data-testid^="p03-feature-toggle-"]');
  await expect(canvasNode(page, "Attribute 1")).toHaveCount(0);
  await expect(ownerToggle).toHaveAttribute("aria-label", "展开所属特征 / Expand features");
  await ownerToggle.click();
  const attribute = canvasNode(page, "Attribute 1");
  await expect(attribute).toBeVisible();
  await attribute.click();
  await expect(page.getByTestId("p03-tool-state")).toBeDisabled();

  await edit(page, page.getByTestId("p03-tool-process"));
  const process = canvasNode(page, "Process 1");
  await process.click();
  await expect(page.getByTestId("p03-tool-state")).toBeDisabled();
  await edit(page, page.getByTestId("p03-tool-operation"));
  const processToggle = process.locator('[data-testid^="p03-feature-toggle-"]');
  await expect(canvasNode(page, "Operation 1")).toHaveCount(0);
  await expect(processToggle).toHaveAttribute("aria-label", "展开所属特征 / Expand features");

  await owner.click();
  await expect(page.getByTestId("p03-tool-state")).toBeEnabled();
  await edit(page, page.getByTestId("p03-tool-state"));
  const state = canvasNode(page, "State 1");
  await expect(state).toBeVisible();
  await expect(page.getByTestId("p03-state-candidate")).toHaveCount(0);

  await state.click();
  await page.getByTestId("p03-right-panel-open").click();
  await expect(page.getByTestId("p03-state-inspector")).toBeVisible();
  const stateName = page.getByTestId("p03-state-inspector-name");
  await stateName.fill("就绪");
  await edit(page, page.getByRole("button", { name: "保存 State", exact: true }));
  await expect(canvasNode(page, "就绪")).toBeVisible();
  await expect(page.getByTestId("p03-state-candidate")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("direct-state-desktop.png") });

  await page.setViewportSize({ width: 820, height: 900 });
  await expect(page.getByTestId("p03-state-inspector")).toBeVisible();
  await expect(canvasNode(page, "就绪")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("direct-state-narrow.png") });
});

async function openNewWorkbench(page: Page) {
  const suffix = Date.now();
  await page.goto("/projects");
  await page.getByTestId("p01-create-project").click();
  await page.getByTestId("ov01-project-name").fill(`Direct state E2E ${suffix}`);
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
