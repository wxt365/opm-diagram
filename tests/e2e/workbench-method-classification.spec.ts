import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { chooseViewportAction } from "./viewport-controls";

test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5177" });

test("真实画布：三层分类、细化定位、历史隔离、JSON 迁移及继续编辑重开", async ({ page }, info) => {
  test.setTimeout(240_000);
  const project = process.env.OPM_PLACEMENT_PROJECT; test.skip(!project, "需要明确隔离模型所在项目");
  await page.setViewportSize({ width: 1440, height: 1050 });
  const models: string[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/projects/${project}`); await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill(`架构分类验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  const source = new URL(page.url()), model = source.pathname.split("/models/")[1]!.split("/")[0]!, root = source.searchParams.get("context")!;
  models.push(model);
  const sourceUrl = `/projects/${project}/models/${model}/workbench`;
  const level = page.getByTestId("p03-method-level"), panel = page.getByTestId("p03-method-panel");
  try {
    await page.getByTestId("p03-tab-method").click(); await expect(level).toBeEnabled(); await expect(level).toHaveValue("");
    const unchangedToken = await page.getByTestId("hs-draft-identity").innerText();
    await page.route("**/draft/capabilities", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "PERSISTENCE_FAILED", message: "测试分类失败", retryable: false, reason_code: null }) }), { times: 1 });
    await level.selectOption("MISSION"); await expect(page.getByTestId("p03-command-feedback")).toContainText("测试分类失败");
    await expect(level).toHaveValue(""); expect(await page.getByTestId("hs-draft-identity").innerText()).toBe(unchangedToken);
    await edit(page, () => level.selectOption("MISSION")); await expect(level).toHaveValue("MISSION");
    // 在实际画布创建对象和过程，父图分类在普通编辑后仍保留。
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    await edit(page, () => page.getByTestId("p03-tool-process").click()); await expect(level).toHaveValue("MISSION");
    await chooseViewportAction(page, "fit");
    await node(page, "Process 1").click({ position: { x: 20, y: 14 } });
    const child = await refine(page, root, "功能细化图");
    await expect(level).toHaveValue(""); await edit(page, () => level.selectOption("FUNCTION")); await expect(level).toHaveValue("FUNCTION");
    await edit(page, () => page.getByTestId("p03-tool-process").click()); await chooseViewportAction(page, "fit");
    await rename(page, "Process 1", "子图关注过程");
    await node(page, "子图关注过程").click({ position: { x: 20, y: 14 } });
    const grandchild = await refine(page, child, "产品细化图");
    await expect(level).toHaveValue(""); await edit(page, () => level.selectOption("PRODUCT")); await expect(level).toHaveValue("PRODUCT");
    await edit(page, () => page.getByTestId("p03-tool-object").click()); await expect(level).toHaveValue("PRODUCT");
    await panel.getByTestId("p03-method-context-list").locator("summary").click();
    await expect(panel.getByTestId("p03-method-context-list")).toContainText("任务架构");
    await expect(panel.getByTestId("p03-method-context-list")).toContainText("功能架构");
    await expect(panel.getByTestId("p03-method-context-list")).toContainText("产品架构");
    await panel.locator('[data-testid^="p03-method-parent-"]').click();
    await expect(page.getByTestId(`p03-context-${child}`)).toHaveAttribute("aria-current", "page"); await expect(level).toHaveValue("FUNCTION");
    await expect(page.locator('[data-opm-text-highlighted="true"]')).toHaveCount(1);
    await expect(node(page, "子图关注过程")).toBeVisible();
    await panel.getByTestId("p03-method-refinements").getByRole("button", { name: "产品细化图 · 产品架构", exact: true }).click();
    await expect(page.getByTestId(`p03-context-${grandchild}`)).toHaveAttribute("aria-current", "page"); await expect(level).toHaveValue("PRODUCT");
    await page.screenshot({ path: info.outputPath("classification-desktop.png") });
    const saving = page.waitForResponse(response => response.url().endsWith("/draft/save") && response.status() === 200);
    await page.getByTestId("hs-save").click(); const revision = (await (await saving).json()).revision_id as string;
    await edit(page, () => level.selectOption("")); await expect(level).toHaveValue("");
    await page.goto(`${sourceUrl}?context=${grandchild}&revision=${revision}`);
    await expect(page.getByTestId("p03-readonly-banner")).toBeVisible(); await page.getByTestId("p03-tab-method").click();
    await expect(level).toHaveValue("PRODUCT"); await expect(level).toBeDisabled();
    const path = info.outputPath("classification.opd.json");
    const exported = await download(page, grandchild, path);
    expect(exported.semantic_revision.schema_version).toBe("0.4");
    expect(exported.semantic_revision.contexts.map((context: any) => context.architecture_level)).toEqual(["MISSION", "FUNCTION", "PRODUCT"]);
    await panel.locator('[data-testid^="p03-method-parent-"]').click();
    await expect(level).toHaveValue("FUNCTION"); await expect(level).toBeDisabled();
    expect(new URL(page.url()).searchParams.get("revision")).toBe(revision);
    await page.setViewportSize({ width: 390, height: 844 }); await panel.scrollIntoViewIfNeeded();
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath("classification-mobile.png") });
    await page.setViewportSize({ width: 1440, height: 1050 });
    // 从固定历史文件导入独立模型，当前源草稿的清除操作不会进入迁移文件。
    await page.goto(`/projects/${project}`); await page.getByTestId("p02-import-opd-json").click();
    await page.getByTestId("opd-json-file").setInputFiles(path);
    await page.getByTestId("opd-json-model-name").fill(`架构分类导入验证-${Date.now()}`);
    const importing = page.waitForResponse(response => response.url().endsWith("/opd-json/import") && response.status() === 201);
    await page.getByTestId("opd-json-import-confirm").click(); models.push((await (await importing).json()).data.model_id);
    await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.getByTestId("p03-tab-method").click();
    await expect(level).toHaveValue("PRODUCT"); await edit(page, () => page.getByTestId("p03-tool-process").click());
    await expect(level).toHaveValue("PRODUCT"); await chooseViewportAction(page, "fit"); await rename(page, "Process 1", "导入后编辑过程");
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    await page.reload(); await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.getByTestId("p03-tab-method").click();
    await expect(level).toHaveValue("PRODUCT"); await expect(node(page, "导入后编辑过程")).toBeVisible();
    const reopened = await download(page, grandchild, info.outputPath("classification-reopened.opd.json"));
    expect(reopened.semantic_revision.contexts.map(({ occurrence_ids: _ids, ...context }: any) => context)).toEqual(exported.semantic_revision.contexts.map(({ occurrence_ids: _ids, ...context }: any) => context));
    expect(reopened.semantic_revision.contexts.find((context: any) => context.context_id === grandchild).occurrence_ids.length).toBe(exported.semantic_revision.contexts.find((context: any) => context.context_id === grandchild).occurrence_ids.length + 1);
    expect(reopened.semantic_revision.refinement_edges).toEqual(exported.semantic_revision.refinement_edges);
    await page.goto(`${sourceUrl}?context=${grandchild}`); await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.getByTestId("p03-tab-method").click();
    await expect(level).toHaveValue(""); await expect(panel).not.toContainText("导入后编辑过程");
    await page.route("**/draft/method-summary", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "PERSISTENCE_FAILED", message: "测试读取失败", retryable: true, reason_code: null }) }), { times: 1 });
    await panel.getByTestId("p03-method-refresh").click(); await expect(panel.getByRole("alert")).toContainText("测试读取失败"); await expect(level).toBeDisabled();
    await panel.getByTestId("p03-method-refresh").click(); await expect(level).toBeEnabled(); await expect(level).toHaveValue("");
    await page.getByTestId(`p03-context-${child}`).click({ button: "right" }); await page.getByTestId("opd-delete-action").click();
    await expect(page.getByTestId("opd-delete-confirm")).toBeEnabled(); await edit(page, () => page.getByTestId("opd-delete-confirm").click());
    await expect(page.getByTestId(`p03-context-${root}`)).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId(`p03-context-${child}`)).toHaveCount(0); await expect(page.getByTestId(`p03-context-${grandchild}`)).toHaveCount(0);
    await expect(level).toHaveValue("MISSION");
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    await page.reload(); await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.getByTestId("p03-tab-method").click(); await expect(level).toHaveValue("MISSION");
    const deleted = await download(page, root, info.outputPath("classification-deleted.opd.json"));
    expect(deleted.semantic_revision.schema_version).toBe("0.4"); expect(deleted.semantic_revision.contexts).toHaveLength(1);
    expect(deleted.semantic_revision.refinement_edges).toEqual([]);
    expect(errors).toEqual([]);
  } catch (error) { await page.screenshot({ path: info.outputPath("classification-failure.png") }); throw error; }
  finally {
    for (const id of models.reverse()) {
      await page.goto(`/projects/${project}`); await page.getByTestId(`p02-trash-${id}`).click(); await page.getByTestId("p02-lifecycle-confirm").click();
      await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
    }
  }
});
function node(page: Page, name: string) { return page.locator(".x6-node").filter({ hasText: name }).first(); }
async function edit(page: Page, action: () => Promise<unknown>) {
  const token = await page.getByTestId("hs-draft-identity").innerText(); await action();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(token); await expect(page.getByTestId("hs-save")).toBeEnabled();
}
async function refine(page: Page, parent: string, name: string) {
  await page.getByTestId(`opd-add-${parent}`).click(); await page.getByTestId("opd-refinement-name").fill(name);
  await edit(page, () => page.getByTestId("opd-refine").click());
  await expect(page.getByTestId("opd-navigator").locator('[aria-current="page"]')).toContainText(name);
  return new URL(page.url()).searchParams.get("context")!;
}
async function rename(page: Page, old: string, name: string) {
  await page.getByTestId("p03-tool-select").click(); await node(page, old).dblclick({ position: { x: 20, y: 14 } });
  await page.getByTestId("p03-name-editor").fill(name); await edit(page, () => page.getByTestId("p03-name-editor").press("Enter"));
}
async function download(page: Page, context: string, path: string) {
  await page.getByTestId(`p03-context-${context}`).click({ button: "right" }); await expect(page.getByTestId("opd-export-json")).toBeEnabled();
  const ready = page.waitForEvent("download"); await page.getByTestId("opd-export-json").click(); await (await ready).saveAs(path);
  return JSON.parse(await readFile(path, "utf8"));
}
