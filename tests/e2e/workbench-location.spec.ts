import { expect, test, type Page } from "@playwright/test";
import { copyWorkbenchPermalink } from "./helpers/workbench-revision";

async function createWorkbench(page: Page) {
  await page.goto("/projects");
  await page.getByTestId("p01-create-project").click();
  await page.getByTestId("ov01-project-name").fill(`URL 回归 ${Date.now()}`);
  await page.getByTestId("ov01-create-project").getByRole("button", { name: "创建并继续" }).click();
  await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill("URL 模型");
  await page.getByTestId("ov02-create-model").getByRole("button", { name: "创建并打开工作台" }).click();
  await expect(page.getByTestId("p03-tool-object")).toBeEnabled();
  await expect.poll(() => new URL(page.url()).searchParams.has("context")).toBe(true);
}

async function commit(page: Page, action: () => Promise<void>) {
  const before = await page.locator(".revision-tag").innerText();
  await action();
  await expect(page.locator(".revision-tag")).not.toHaveText(before);
  await expect(page.getByTestId("p03-tool-object")).toBeEnabled();
}

test("HEAD 连续编辑地址不变，永久链接只读，刷新与前进后退恢复定位", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await createWorkbench(page);
  const headUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  expect(new URL(headUrl).searchParams.has("revision")).toBe(false);
  await commit(page, () => page.getByTestId("p03-tool-object").click());
  expect(page.url()).toBe(headUrl);
  const node = page.locator(".x6-node").first();
  const box = await node.boundingBox();
  if (!box) throw new Error("对象未进入画布");
  const canvasBounds = await page.locator(".canvas-frame").boundingBox();
  await commit(page, async () => {
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 110, box.y + 80, { steps: 8 });
    await page.mouse.up();
  });
  expect(page.url()).toBe(headUrl);
  expect(await page.locator(".canvas-frame").boundingBox()).toEqual(canvasBounds);
  await commit(page, () => page.getByTestId("p03-tool-process").click());
  expect(page.url()).toBe(headUrl);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  const { permalink, revision } = await copyWorkbenchPermalink(page);
  expect(page.url()).toBe(headUrl);

  await page.getByTestId("p03-version-select").selectOption(revision);
  await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
  await expect(page.getByTestId("p03-tool-object")).toBeDisabled();
  expect(page.url()).toBe(permalink);
  await page.reload();
  await expect(page.locator(".revision-tag")).toHaveText(`固定版本 ${revision}`);
  const beforeReadonlyDrag = await node.boundingBox();
  if (!beforeReadonlyDrag) throw new Error("只读对象不可见");
  await page.mouse.move(beforeReadonlyDrag.x + 30, beforeReadonlyDrag.y + 30);
  await page.mouse.down();
  await page.mouse.move(beforeReadonlyDrag.x + 80, beforeReadonlyDrag.y + 60, { steps: 5 });
  await page.mouse.up();
  expect(await node.boundingBox()).toEqual(beforeReadonlyDrag);
  await page.getByTestId("p03-return-head").click();
  await expect(page.getByTestId("p03-tool-object")).toBeEnabled();
  expect(page.url()).toBe(headUrl);
  await commit(page, () => page.getByTestId("p03-tool-object").click());
  const latest = await page.locator(".revision-tag").innerText();
  await page.goBack();
  await expect(page.locator(".revision-tag")).toHaveText(`固定版本 ${revision}`);
  await expect(page.getByTestId("p03-tool-object")).toBeDisabled();
  await page.goForward();
  await expect(page.locator(".revision-tag")).toHaveText(latest);
  await expect(page.locator(".x6-node")).toHaveCount(3);
  expect(page.url()).toBe(headUrl);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator(".revision-tag")).toHaveText(latest);
  await expect(page.getByTestId("p03-copy-permalink")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("head-mobile.png") });
});

test("head 兼容入口与 Context 回退规范化，非法或跨 Model 精确版本拒绝且不漂移", async ({ page }) => {
  await createWorkbench(page);
  const headUrl = page.url();
  await commit(page, () => page.getByTestId("p03-tool-object").click());
  const { revision } = await copyWorkbenchPermalink(page);
  const compatibility = new URL(headUrl);
  compatibility.search = "?revision=head&context=context.foreign";
  await page.goto(compatibility.href);
  await expect(page.getByTestId("p03-tool-object")).toBeEnabled();
  await expect(page.getByTestId("p03-command-feedback")).toContainText("该版本的根系统图");
  expect(page.url()).toBe(headUrl);
  const exact = new URL(headUrl);
  exact.search = `?revision=${revision}`;
  await page.goto(exact.href);
  await expect(page.getByTestId("p03-tool-object")).toBeDisabled();
  await expect(page.locator(".revision-tag")).toHaveText(`固定版本 ${revision}`);
  expect(new URL(page.url()).searchParams.get("context")).toBe(new URL(headUrl).searchParams.get("context"));
  for (const value of ["revision.missing", "../bad", ""]) {
    const invalid = new URL(headUrl);
    invalid.searchParams.set("revision", value);
    await page.goto(invalid.href);
    await expect(page.getByTestId("p03-command-feedback")).toContainText(value === "revision.missing" ? "修订不存在" : "Revision 格式非法");
    expect(page.url()).toBe(invalid.href);
    await expect(page.locator(".x6-node")).toHaveCount(0);
    await expect(page.getByTestId("p03-tool-object")).toBeDisabled();
  }
  await createWorkbench(page);
  const crossModel = new URL(page.url());
  crossModel.searchParams.set("revision", revision);
  await page.goto(crossModel.href);
  await expect(page.getByTestId("p03-command-feedback")).toContainText("修订不存在");
  expect(page.url()).toBe(crossModel.href);
  await expect(page.getByTestId("p03-tool-object")).toBeDisabled();
});
