import { expect, test, type Locator, type Page } from "@playwright/test";

test("右键一次点击删除，Backspace 无菜单直接删除并按 committed revision 重开", async ({ page }) => {
  await openNewWorkbench(page);
  await commitAndRead(page, page.getByTestId("p03-tool-object"));
  await commitAndRead(page, page.getByTestId("p03-tool-process"));
  const object = canvasNode(page, "Object 1");
  const process = canvasNode(page, "Process 1");
  await expect(object).toBeVisible();
  await expect(process).toBeVisible();

  const beforeCancel = await revisionTag(page);
  await process.click({ button: "right", position: { x: 24, y: 24 } });
  await expect(page.getByTestId("p03-construct-actions-menu")).toBeVisible();
  await expectOverlayInsideCanvas(page, "p03-construct-actions-menu");
  await expect(page.getByTestId("p03-construct-actions-menu")).toHaveCSS("width", "208px");
  await page.locator(".construct-context-menu__dismiss").click({ position: { x: 4, y: 4 } });
  await expect(page.getByTestId("p03-construct-actions-menu")).toHaveCount(0);
  await expect(page.locator(".revision-tag")).toHaveText(beforeCancel);
  await expect(process).toBeVisible();

  await object.click({ button: "right", position: { x: 24, y: 24 } });
  await expect(page.getByTestId("p03-construct-actions-menu")).toBeVisible();
  const revisionAfterObjectDelete = await commitAndRead(page, page.getByTestId("p03-construct-delete-action").first());
  await expect(page.getByTestId("p03-delete-impact-dialog")).toHaveCount(0);
  await expect(canvasNode(page, "Object 1")).toHaveCount(0);
  await expect(canvasNode(page, "Process 1")).toHaveCount(1);

  await process.click({ position: { x: 24, y: 24 } });
  const beforeKeyboardDelete = await revisionTag(page);
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("p03-construct-actions-menu")).toHaveCount(0);
  await expect(page.locator(".revision-tag")).not.toHaveText(beforeKeyboardDelete);
  const revisionAfterKeyboardDelete = await revisionTag(page);
  expect(revisionAfterKeyboardDelete).not.toBe(revisionAfterObjectDelete);
  await expect(page.locator(".x6-node")).toHaveCount(0);

  await page.reload();
  await expectWorkbenchReady(page);
  await expect(page.locator(".revision-tag")).toHaveText(revisionAfterKeyboardDelete);
  await expect(page.locator(".x6-node")).toHaveCount(0);
});

async function openNewWorkbench(page: Page) {
  const suffix = Date.now();
  await page.goto("/projects");
  await expect(page.getByTestId("p01-project-library")).toBeVisible();
  await page.getByTestId("p01-create-project").click();
  await page.getByTestId("ov01-project-name").fill(`Construct lifecycle ${suffix}`);
  await page.getByTestId("ov01-create-project").getByRole("button", { name: "创建并继续" }).click();
  await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill(`模型 ${suffix}`);
  await page.getByTestId("ov02-create-model").getByRole("button", { name: "创建并打开工作台" }).click();
  await expectWorkbenchReady(page);
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

async function expectOverlayInsideCanvas(page: Page, testId: string) {
  const surface = await page.locator(".canvas-surface").boundingBox();
  const overlay = await page.getByTestId(testId).boundingBox();
  expect(surface).not.toBeNull();
  expect(overlay).not.toBeNull();
  expect(overlay!.x).toBeGreaterThanOrEqual(surface!.x);
  expect(overlay!.y).toBeGreaterThanOrEqual(surface!.y);
  expect(overlay!.x + overlay!.width).toBeLessThanOrEqual(surface!.x + surface!.width);
  expect(overlay!.y + overlay!.height).toBeLessThanOrEqual(surface!.y + surface!.height);
}
