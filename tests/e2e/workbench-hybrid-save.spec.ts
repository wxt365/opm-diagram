import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const location = "/projects/project.draft.http/models/model.golden.proc/workbench?context=context.sd.root";
async function edit(page: Page, action: () => Promise<void>) {
  const before = await page.getByTestId("hs-draft-identity").innerText();
  await action();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(before);
  await expect(page.getByTestId("hs-save")).toBeEnabled();
}

test("临时 V2 模型编辑、手动去重、10秒自动保存、Pin 与 EXACT 重开", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(location);
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  const headUrl = page.url();
  const originalHistory = await page.getByTestId("p03-version-select").locator("option").count();
  const secondContextNodes = 3;
  let edits = 0, saves = 0;
  page.on("request", request => { if (request.url().endsWith("/draft/commands")) edits++; if (request.url().endsWith("/draft/save")) saves++; });
  await edit(page, () => page.getByTestId("p03-tool-object").click());
  await edit(page, () => page.getByTestId("p03-tool-process").click());
  expect(await page.getByTestId("p03-version-select").locator("option").count()).toBe(originalHistory);
  expect(page.url()).toBe(headUrl);
  await page.getByTestId("hs-save").click();
  await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
  const afterSave = await page.getByTestId("p03-version-select").locator("option").count();
  expect(afterSave).toBe(originalHistory + 1);
  await page.keyboard.press("Control+s");
  await expect.poll(() => saves).toBe(2);
  await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
  expect(await page.getByTestId("p03-version-select").locator("option").count()).toBe(afterSave);

  const object = page.locator('.x6-node[data-cell-id="element.raw.material"]');
  await object.dblclick({ position: { x: 12, y: 12 }, timeout: 10000 });
  await expect(page.getByTestId("p03-name-editor")).toBeVisible();
  const editsBeforeName = edits, savesBeforeName = saves;
  await page.getByTestId("p03-name-editor").fill("   ");
  await page.keyboard.press("Control+s");
  await expect(page.getByTestId("p03-command-feedback")).toContainText("非空白");
  expect(edits).toBe(editsBeforeName); expect(saves).toBe(savesBeforeName);
  await page.getByTestId("p03-name-editor").fill(`保存对象 ${originalHistory}`);
  await edit(page, () => page.keyboard.press("Control+s"));
  await expect(page.getByTestId("p03-name-editor")).toHaveCount(0);
  await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
  const namedHistory = await page.getByTestId("p03-version-select").locator("option").count();
  await edit(page, () => page.getByTestId("p03-tool-object").click());
  await expect(page.getByTestId("hs-save-state")).toContainText("等待保存");
  await expect(page.getByTestId("hs-save-state")).toHaveText("已自动保存", { timeout: 18000 });
  expect(await page.getByTestId("p03-version-select").locator("option").count()).toBe(namedHistory);
  const latest = await page.getByTestId("hs-draft-identity").innerText();
  const nodeCount = await page.locator(".x6-node").count();
  await page.reload();
  await expect(page.getByTestId("hs-draft-identity")).toHaveText(latest);
  await expect(page.locator(".x6-node")).toHaveCount(nodeCount);

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("p03-copy-permalink").click();
  await expect(page.getByTestId("p03-command-feedback")).toContainText("已复制");
  const permalink = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(permalink).searchParams.get("revision")).toMatch(/^revision\./);
  expect(page.url()).toBe(headUrl);
  await page.screenshot({ path: test.info().outputPath("draft-desktop.png") });
  await page.goto(permalink);
  await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
  await expect(page.locator(".x6-node")).toHaveCount(nodeCount);
  await expect(page.getByTestId("hs-save")).toHaveCount(0);
  const editsBefore = edits;
  await page.keyboard.press("Control+s"); expect(edits).toBe(editsBefore);
  await page.getByTestId("p03-return-head").click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  await page.getByTestId("p03-context-context.browser.second").click();
  await expect(page.locator(".x6-node")).toHaveCount(secondContextNodes);
  await page.getByTestId("p03-context-context.sd.root").click();
  await expect(page.locator(".x6-node")).toHaveCount(nodeCount);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("hs-save")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("draft-mobile.png") });
});

test("真实编辑已commit但响应丢失，刷新以原收据恢复且不重复创建", async ({ page }) => {
  await page.goto(location); await expect(page.getByTestId("hs-save")).toBeEnabled();
  const before = await page.locator(".x6-node").count();
  let sent = 0;
  await page.route("**/draft/commands", async route => {
    sent++;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort("failed");
  });
  await page.getByTestId("p03-tool-object").click();
  await expect(page.getByTestId("hs-save-state")).toHaveText("存在待确认操作");
  await expect(page.getByTestId("hs-retry-delivery")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  await expect(page.locator(".x6-node")).toHaveCount(before + 1);
  expect(sent).toBe(1);
  const pending = await page.evaluate(async () => {
    const { DraftDelivery } = await import("/src/shared/api/draftDelivery.ts");
    return new DraftDelivery().pending("project.draft.http", "model.golden.proc");
  });
  expect(pending).toHaveLength(0);
});

test("保存响应迟到时后续编辑可继续，旧捕获不会回滚画布", async ({ page }) => {
  await page.goto(location); await expect(page.getByTestId("hs-save")).toBeEnabled();
  await edit(page, () => page.getByTestId("p03-tool-process").click());
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let captured = -1;
  await page.route("**/draft/save", async route => {
    captured = route.request().postDataJSON().target_draft_token.edit_seq;
    const response = await route.fetch(); expect(response.ok()).toBe(true);
    await waiting; await route.fulfill({ response });
  });
  await page.getByTestId("hs-save").click();
  await expect.poll(() => captured).toBeGreaterThan(-1);
  await expect(page.getByTestId("hs-save-state")).toHaveText("保存中");
  const oldIdentity = await page.getByTestId("hs-draft-identity").innerText();
  await page.getByTestId("p03-tool-object").click();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(oldIdentity);
  const newIdentity = await page.getByTestId("hs-draft-identity").innerText();
  release();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  await expect(page.getByTestId("hs-draft-identity")).toHaveText(newIdentity);
  await expect(page.getByTestId("hs-save-state")).toContainText("等待保存");
});
