import { expect, type Page } from "@playwright/test";

/** 从实际保存并固定的版本取得定位，不把草稿编辑序号当成 Revision。 */
export async function copyWorkbenchPermalink(page: Page) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await page.getByTestId("p03-copy-permalink").click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("revision=");
  const permalink = await page.evaluate(() => navigator.clipboard.readText());
  const revision = new URL(permalink).searchParams.get("revision");
  expect(revision).toMatch(/^revision\./);
  if (!revision) throw new Error("永久链接缺少真实 Revision");
  return { permalink, revision };
}
