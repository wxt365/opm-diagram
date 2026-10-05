import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { chooseViewportAction } from "./viewport-controls";
test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5177" });
const proofPath = "/private/tmp/opm-history-browser-proof.json";

test("真实画布操作历史：创建改名移动删除、自动手动保存、版本查看与错误重试", async ({ page }, info) => {
  const project = process.env.OPM_PLACEMENT_PROJECT; test.skip(!project, "需要本地测试项目");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/projects/${project}`);
  await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill(`操作历史验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  const model = new URL(page.url()).pathname.split("/models/")[1]!.split("/")[0]!;
  const url = `/projects/${project}/models/${model}/workbench`;
  let succeeded = false;
  try {
    await page.getByTestId("p03-tab-history").click();
    const panel = page.getByTestId("p03-history-panel");
    await expect(panel).toContainText("创建模型");
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    await expect(panel).toContainText("创建对象：Object 1");
    await rename(page, "Object 1", "咖啡豆");
    await expect(panel).toContainText("修改名称：Object 1 → 咖啡豆");
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    await edit(page, () => page.getByTestId("p03-tool-process").click());
    await page.getByTestId("p03-tool-select").click(); await chooseViewportAction(page, "fit");
    const coffee = node(page, "咖啡豆"); await coffee.hover({ position: { x: 20, y: 14 } });
    await edit(page, async () => {
      const box = (await coffee.boundingBox())!;
      await page.mouse.down(); await page.mouse.move(box.x + 90, box.y + 64, { steps: 10 }); await page.mouse.up();
    });
    await expect(panel).toContainText("移动或调整元素：咖啡豆");
    await node(page, "Object 2").click({ button: "right", position: { x: 20, y: 14 } });
    await expect(page.getByTestId("p03-construct-actions-menu")).toBeVisible();
    await edit(page, () => page.getByTestId("p03-construct-delete-action").filter({ hasText: "删除" }).first().click());
    await expect(panel).toContainText("删除元素或关系：Object 2");
    await expect(node(page, "Object 2")).toHaveCount(0);
    await expect(panel).toContainText("自动保存草稿", { timeout: 25000 });
    const saving = page.waitForResponse(response => response.url().endsWith("/draft/save") && response.status() === 200);
    await page.getByTestId("hs-save").click();
    const revision = (await (await saving).json()).revision_id as string;
    await expect(panel).toContainText("手动保存模型");
    await page.screenshot({ path: info.outputPath("history-desktop.png") });
    await rename(page, "咖啡豆", "咖啡豆（后续编辑）");
    await expect(panel).toContainText("咖啡豆 → 咖啡豆（后续编辑）");
    await panel.getByTestId("p03-history-open-version").first().click();
    await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`revision=${revision.replaceAll(".", "\\.")}`));
    await page.getByTestId("p03-tab-history").click();
    await expect(panel).toContainText("该版本及之前");
    await expect(panel).not.toContainText("后续编辑");
    await expect(node(page, "咖啡豆（后续编辑）")).toHaveCount(0);
    await page.goto(url); await expect(page.getByTestId("hs-save")).toBeEnabled();
    await page.getByTestId("p03-tab-history").click();
    await expect(panel).toContainText("后续编辑");
    await page.route("**/draft/operation-history", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "PERSISTENCE_FAILED", message: "测试连接中断", retryable: true, reason_code: null }) }), { times: 1 });
    await panel.getByTestId("p03-history-refresh").click();
    await expect(panel.getByRole("alert")).toContainText("测试连接中断");
    await expect(page.getByTestId("hs-save")).toBeEnabled();
    await panel.getByTestId("p03-history-retry").click();
    await expect(panel).toContainText("手动保存模型"); await expect(panel.getByRole("alert")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    const box = (await panel.boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(391);
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath("history-mobile.png") });
    expect(errors).toEqual([]);
    await writeFile(proofPath, JSON.stringify({ project, model, revision }));
    await info.attach("operation-history-proof", { path: proofPath, contentType: "application/json" });
    succeeded = true;
  } catch (error) { await page.screenshot({ path: info.outputPath("history-failure.png") }); throw error; }
  finally { if (!succeeded || process.env.OPM_HISTORY_PRESERVE_FOR_RESTART !== "true") await trash(page, project!, model); }
});

test("服务重启后操作历史与保存版本保留", async ({ page }, info) => {
  test.skip(process.env.OPM_HISTORY_RESTART_PROOF !== "true", "仅在重启实际服务后执行");
  const { project, model, revision } = JSON.parse(await readFile(proofPath, "utf8")) as { project: string; model: string; revision: string };
  try {
    await page.goto(`/projects/${project}/models/${model}/workbench`);
    await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.getByTestId("p03-tab-history").click();
    const panel = page.getByTestId("p03-history-panel");
    await expect(panel).toContainText("创建对象：Object 1"); await expect(panel).toContainText("删除元素或关系：Object 2");
    await expect(panel).toContainText("自动保存草稿"); await expect(panel).toContainText("手动保存模型");
    await expect(panel).toContainText("咖啡豆 → 咖啡豆（后续编辑）");
    await panel.getByTestId("p03-history-open-version").first().click();
    await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`revision=${revision.replaceAll(".", "\\.")}`));
    await expect(panel).not.toContainText("后续编辑");
    await page.screenshot({ path: info.outputPath("history-after-restart.png") });
  } finally { await trash(page, project, model); }
});

test("跨 OPD 显示整个模型的历史，并能打开固定版本", async ({ page, context }, info) => {
  const project = process.env.OPM_PLACEMENT_PROJECT; test.skip(!project, "需要本地测试项目");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/projects/${project}`); await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill(`多图历史验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  const location = new URL(page.url()), model = location.pathname.split("/models/")[1]!.split("/")[0]!, root = location.searchParams.get("context")!;
  try {
    await edit(page, () => page.getByTestId("p03-tool-object").click()); await rename(page, "Object 1", "根图对象");
    await edit(page, () => page.getByTestId("p03-tool-process").click());
    await page.getByTestId(`opd-add-${root}`).click(); await page.getByTestId("opd-refinement-name").fill("历史子图");
    await page.getByTestId("opd-refine").click(); await expect(page.getByTestId("opd-navigator").locator('[aria-current="page"]')).toContainText("历史子图");
    await expect(page.getByTestId("hs-save")).toBeEnabled();
    await edit(page, () => page.getByTestId("p03-tool-object").click()); await rename(page, "Object 1", "子图对象");
    await page.getByTestId("p03-tab-history").click(); const panel = page.getByTestId("p03-history-panel");
    await expect(panel).toContainText("修改名称：Object 1 → 根图对象"); await expect(panel).toContainText("OPD：历史子图");
    await expect(panel).toContainText("添加子图：历史子图");
    const pinned = page.waitForResponse(response => response.url().endsWith("/draft/pin") && response.status() === 200);
    await page.getByTestId("p03-copy-permalink").click(); const revision = (await (await pinned).json()).revision_id as string;
    await expect(panel).toContainText("固定模型版本");
    await page.getByTestId(`p03-context-${root}`).click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    await expect(panel).toContainText("修改名称：Object 1 → 子图对象");
    await panel.locator(".history-record").filter({ hasText: "固定模型版本" }).getByTestId("p03-history-open-version").click();
    await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`revision=${revision.replaceAll(".", "\\.")}`));
    await expect(panel).toContainText("OPD：历史子图");
    await page.screenshot({ path: info.outputPath("history-cross-opd-pin.png") });
  } finally { await trash(page, project!, model); }
});

function node(page: Page, name: string) { return page.locator(".x6-node").filter({ hasText: name }).first(); }
async function edit(page: Page, action: () => Promise<unknown>) {
  const token = await page.getByTestId("hs-draft-identity").innerText(); await action();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(token); await expect(page.getByTestId("hs-save")).toBeEnabled();
}
async function rename(page: Page, old: string, name: string) {
  await node(page, old).dblclick({ position: { x: 20, y: 14 } });
  await page.getByTestId("p03-name-editor").fill(name); await edit(page, () => page.getByTestId("p03-name-editor").press("Enter"));
}
async function trash(page: Page, project: string, model: string) {
  await page.goto(`/projects/${project}`); await page.getByTestId(`p02-trash-${model}`).click();
  await page.getByTestId("p02-lifecycle-confirm").click(); await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
}
