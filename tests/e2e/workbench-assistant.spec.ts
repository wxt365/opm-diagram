import { readFile, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

test.use({ baseURL: process.env.OPM_ASSISTANT_BASE ?? "http://127.0.0.1:5177" });

test("真实 DeepSeek 多轮提案、画布预览、应用、保存重开与只读保护", async ({ page }, info) => {
  test.setTimeout(600_000);
  test.skip(!process.env.OPM_ASSISTANT_PROOF, "需明确隔离助手模型身份，禁止复用用户模型");
  const scope = JSON.parse(await readFile(process.env.OPM_ASSISTANT_PROOF!, "utf8"));
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto(`/projects/${scope.projectId}`);
  await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill(`助手画布验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  await page.getByTestId("p03-bottom-toggle").click();
  if (await page.getByTestId("p03-right-panel-close").isVisible()) await page.getByTestId("p03-right-panel-close").click();
  await page.getByTestId("left-tab-assistant").click();
  const panel = page.getByTestId("assistant-panel"); await expect(panel).toBeVisible();
  await expect(page.getByTestId("p03-bottom-content")).toBeHidden();
  await expect(page.getByTestId("p03-tab-assistant")).toHaveCount(0);
  await expect(panel.getByRole("combobox")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "刷新", exact: true })).toHaveCount(0);
  await panel.getByTestId("assistant-input").fill("尚未发送的咖啡建模需求");
  await page.getByTestId("left-tab-navigation").click(); await expect(panel).toBeHidden();
  await page.getByTestId("left-tab-assistant").click();
  await expect(panel.getByTestId("assistant-input")).toHaveValue("尚未发送的咖啡建模需求");
  await prompt(page, "创建名为咖啡豆的对象，x=120,y=160。");
  await page.getByRole("button", { name: "退出预览", exact: true }).click();
  const token = await page.getByTestId("hs-draft-identity").innerText();
  if (await panel.getByTestId("assistant-preview").last().isVisible()) await panel.getByTestId("assistant-preview").last().click();
  await expect(page.getByTestId("assistant-canvas-preview")).toBeVisible();
  await expect(node(page, "咖啡豆")).toBeVisible();
  expect(await page.getByTestId("hs-draft-identity").innerText()).toBe(token);
  await page.getByRole("button", { name: "退出预览", exact: true }).click();
  await expect(node(page, "咖啡豆")).toHaveCount(0);
  await apply(page); await expect(node(page, "咖啡豆")).toBeVisible();
  for (const [request, label] of [
    ["为咖啡豆添加待烘焙状态，放在对象内部合适位置，名称为待烘焙。", "待烘焙"],
    ["再为同一个咖啡豆对象添加已烘焙状态，放在对象内部避免与待烘焙重叠。", "已烘焙"],
    ["添加名为烘焙的过程，x=500,y=160。", "烘焙"],
    ["连接待烘焙状态、烘焙过程和已烘焙状态，使烘焙将咖啡豆从待烘焙变为已烘焙。只提出对应的一个状态变化关系提案。", ""],
    ["将烘焙过程重命名为咖啡烘焙，不新增过程。", "咖啡烘焙"],
    ["移动咖啡烘焙过程到 x=480,y=220，只调整本图位置。", "咖啡烘焙"],
  ]) {
    await prompt(page, request!); await apply(page);
    if (label) await expect(node(page, label)).toBeVisible();
  }
  expect(await page.locator('.x6-node').filter({ hasText: "咖啡豆" }).count()).toBeGreaterThan(0);
  await expect(page.locator('.x6-edge')).not.toHaveCount(0);
  await page.getByRole("tab", { name: "OPL / OPT" }).click();
  await expect(page.getByTestId("p03-opl-sentence")).toContainText("咖啡烘焙 changes 咖啡豆 from 待烘焙 to 已烘焙");
  await page.getByTestId("left-tab-assistant").click();
  await expect(panel.getByTestId("assistant-proposal")).toHaveCount(7);
  await page.getByTestId("p03-bottom-toggle").click();
  await page.screenshot({ path: info.outputPath("assistant-desktop.png") });
  await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
  await page.reload(); await expect(page.getByTestId("hs-save")).toBeEnabled();
  await expect(node(page, "已烘焙")).toBeVisible(); await expect(node(page, "咖啡烘焙")).toBeVisible();
  await page.getByTestId("left-tab-assistant").click();
  await expect(panel.getByTestId("assistant-proposal")).toHaveCount(7);
  const modelId = new URL(page.url()).pathname.match(/\/models\/([^/]+)\/workbench/)![1];
  const contextId = (await page.getByTestId("opd-navigator").locator('[aria-current="page"]').getAttribute("data-testid"))!.replace("p03-context-", "");
  const session = await page.evaluate(() => window.__OPM_LOCAL_SESSION__);
  const response = await page.request.post('/api/assistant/list', { headers: { Origin: new URL(page.url()).origin, 'X-OPM-Session': session! }, data: { projectId: scope.projectId, modelId, contextId } });
  expect(response.status()).toBe(200); const conversations = await response.json(); expect(conversations).toHaveLength(1);
  const conversationId = conversations[0].id;
  await writeFile(info.outputPath("assistant-scope.json"), JSON.stringify({ projectId: scope.projectId, modelId, contextId, conversationId }));
  await page.setViewportSize({ width: 780, height: 900 });
  const box = (await panel.boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(781);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("assistant-narrow.png") });
  await page.setViewportSize({ width: 390, height: 844 }); await panel.scrollIntoViewIfNeeded();
  const mobile = (await panel.boundingBox())!; expect(mobile.x).toBeGreaterThanOrEqual(0); expect(mobile.x + mobile.width).toBeLessThanOrEqual(391);
  await expect(panel.getByTestId("assistant-input")).toBeVisible();
  await page.screenshot({ path: info.outputPath("assistant-mobile.png") });
  await page.setViewportSize({ width: 1600, height: 1100 });
  const versions = await page.getByTestId("p03-version-select").locator("option").evaluateAll(items => items.map(x => (x as HTMLOptionElement).value));
  await page.getByTestId("p03-version-select").selectOption(versions[1]!);
  await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
  await expect(panel.getByTestId("assistant-input")).toBeDisabled(); await expect(panel.getByTestId("assistant-new")).toHaveCount(0);
  expect(errors).toEqual([]);
});
function node(page: Page, name: string) { return page.locator(".x6-node").filter({ has: page.locator("text", { hasText: new RegExp(`^${name}$`) }) }).last(); }
async function prompt(page: Page, text: string) {
  const panel = page.getByTestId("assistant-panel"), count = await panel.getByTestId("assistant-proposal").count();
  await panel.getByTestId("assistant-input").fill(text); await panel.getByTestId("assistant-send").click();
  await expect(panel.getByTestId("assistant-running")).toBeVisible();
  await expect(panel.getByTestId("assistant-running")).toHaveCount(0, { timeout: 120_000 });
  await expect(panel.getByTestId("assistant-proposal")).toHaveCount(count + 1);
  await expect(panel.getByTestId("assistant-proposal").last()).toContainText("待应用");
  if (await panel.getByTestId("assistant-preview").last().isVisible()) await panel.getByTestId("assistant-preview").last().click(); await expect(page.getByTestId("assistant-canvas-preview")).toBeVisible();
}
async function apply(page: Page) {
  const before = await page.getByTestId("hs-draft-identity").innerText();
  await page.getByTestId("assistant-apply").last().click();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(before, { timeout: 20_000 });
  await expect(page.getByTestId("assistant-proposal").last()).toContainText("已应用");
  await expect(page.getByTestId("assistant-canvas-preview")).toHaveCount(0);
}
