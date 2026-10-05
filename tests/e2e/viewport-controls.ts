import type { Page } from "@playwright/test";

export async function chooseViewportAction(page: Page, action: "fit" | "reset") {
  await page.getByTestId("p03-zoom-menu-toggle").click();
  await page.getByTestId(`p03-zoom-${action}`).click();
  // 视口适应按帧执行，等待图形变换完成后再读取连线点击坐标。
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
