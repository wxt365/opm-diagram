import { expect, test } from "@playwright/test";

const workbenchPath = "/projects/project-raw-material/models/model-processing/workbench";

test("桌面工作台保留底栏和校验区的固定高度", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(workbenchPath);
  await expect(page.getByTestId("p03-workbench")).toBeVisible();

  const layout = await page.locator(".workbench").evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`未找到 ${selector}`);
      return Math.round(element.getBoundingClientRect().height);
    };
    return { bottom: rect(".bottom-panel"), validation: rect(".validation-status") };
  });

  expect(layout).toEqual({ bottom: 240, validation: 43 });

  await page.getByTestId("p03-create-baseline").click();
  await page.getByTestId("overlay-baseline").getByRole("button", { name: "生成不可变基线" }).click();
  await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();

  const readonlyLayout = await page.locator(".workbench").evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`未找到 ${selector}`);
      return Math.round(element.getBoundingClientRect().height);
    };
    return { bottom: rect(".bottom-panel"), validation: rect(".validation-status") };
  });

  expect(readonlyLayout).toEqual({ bottom: 240, validation: 43 });
});

test("移动工作台不覆盖工具栏，且可滚动至过程结点", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(workbenchPath);
  await expect(page.getByTestId("p03-canvas")).toBeVisible();

  const toolbarLayout = await page.locator(".editor-toolbar").evaluate(() => {
    const toolbar = document.querySelector<HTMLElement>(".editor-toolbar");
    const frame = document.querySelector<HTMLElement>(".canvas-frame");
    if (!toolbar || !frame) throw new Error("缺少工具栏或画布");
    const toolbarRect = toolbar.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const controls = Array.from(toolbar.querySelectorAll<HTMLElement>("[data-testid^='p03-']"));
    return {
      toolbarBottom: toolbarRect.bottom,
      frameTop: frameRect.top,
      controlsInsideToolbar: controls.every((control) => {
        const rect = control.getBoundingClientRect();
        return rect.top >= toolbarRect.top && rect.bottom <= toolbarRect.bottom;
      }),
    };
  });
  expect(toolbarLayout.controlsInsideToolbar).toBe(true);
  expect(toolbarLayout.frameTop).toBeGreaterThanOrEqual(toolbarLayout.toolbarBottom);

  const frame = page.locator(".canvas-frame");
  const process = page.locator(".x6-node").filter({ hasText: "Processing" });
  await expect(process).toHaveCount(1);
  const before = await frame.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(before.scrollWidth).toBeGreaterThan(before.clientWidth);

  await frame.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  const after = await page.locator(".canvas-frame").evaluate(() => {
    const frameRect = document.querySelector(".canvas-frame")?.getBoundingClientRect();
    const processRect = Array.from(document.querySelectorAll(".x6-node")).find((node) => node.textContent?.includes("Processing"))?.getBoundingClientRect();
    if (!frameRect || !processRect) throw new Error("缺少画布或过程结点");
    return { frameLeft: frameRect.left, frameRight: frameRect.right, processLeft: processRect.left, processRight: processRect.right };
  });
  expect(after.processLeft).toBeGreaterThanOrEqual(after.frameLeft);
  expect(after.processRight).toBeLessThanOrEqual(after.frameRight);
});
