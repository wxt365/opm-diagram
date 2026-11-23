import { expect, test } from "@playwright/test";

test("390px 视口切换和历史返回不会被导航拖拽条撑宽", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/projects");
  await page.getByTestId("p01-create-project").click();
  await page.getByTestId("ov01-project-name").fill(`窄屏回归 ${Date.now()}`);
  await page.getByTestId("ov01-create-project").getByRole("button", { name: "创建并继续" }).click();
  await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill(`窄屏长模型名称-${"W".repeat(80)}`);
  await page.getByTestId("ov02-create-model").getByRole("button", { name: "创建并打开工作台" }).click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  const identity = await page.getByTestId("hs-draft-identity").innerText();
  await page.getByTestId("p03-tool-object").click();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(identity);
  await page.getByTestId("hs-save").click();
  await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
  const check = async () => {
    // Inspect immediately after viewport changes; polling could conceal the race.
    expect(await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth })))
      .toEqual({ viewport: 390, page: 390 });
    await expect(page.getByTestId("opd-navigator-resizer")).toBeHidden();
    await expect(page.getByTestId("hs-save")).toBeVisible();
  };
  for (let i = 0; i < 12; i++) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await check();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const version = await page.getByTestId("p03-version-select").locator('option:not([value="head"])').first().getAttribute("value");
  await page.getByTestId("p03-version-select").selectOption(version!);
  await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
  await page.getByTestId("p03-return-head").click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 }); await check();
  await page.reload(); await expect(page.getByTestId("hs-save")).toBeEnabled(); await check();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByTestId("opd-navigator-resizer")).toBeVisible();
});
