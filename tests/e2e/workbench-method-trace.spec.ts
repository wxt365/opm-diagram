import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { chooseViewportAction } from "./viewport-controls";

test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5177" });
test("真实画布：关联方向、历史、回环闭包迁移、编辑重开及解除引用后删除", async ({ page }, info) => {
  test.setTimeout(240_000);
  const project = process.env.OPM_PLACEMENT_PROJECT; test.skip(!project, "需要明确隔离模型所在项目");
  const models: string[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(`/projects/${project}`); await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill(`架构关联验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  const model = new URL(page.url()).pathname.split("/models/")[1]!.split("/")[0]!, root = new URL(page.url()).searchParams.get("context")!;
  models.push(model); const sourceUrl = `/projects/${project}/models/${model}/workbench`;
  const panel = page.getByTestId("p03-method-panel"), links = page.getByTestId("p03-method-links"), level = page.getByTestId("p03-method-level");
  try {
    await page.getByTestId("p03-tab-method").click(); await expect(level).toBeEnabled(); await edit(page, () => level.selectOption("MISSION"));
    await edit(page, () => page.getByTestId("p03-tool-process").click()); await chooseViewportAction(page, "fit");
    await node(page, "Process 1").click({ position: { x: 20, y: 14 } });
    const child = await refine(page, root, "功能关联图"); await edit(page, () => level.selectOption("FUNCTION"));
    await edit(page, () => page.getByTestId("p03-tool-process").click()); await chooseViewportAction(page, "fit");
    await node(page, "Process 1").click({ position: { x: 20, y: 14 } });
    const grandchild = await refine(page, child, "产品关联图"); await edit(page, () => level.selectOption("PRODUCT"));
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    await page.getByTestId(`p03-context-${child}`).click(); await expect(level).toHaveValue("FUNCTION");
    const unchanged = await page.getByTestId("hs-draft-identity").innerText();
    await page.getByTestId("p03-method-link-target").selectOption(grandchild);
    await page.route("**/draft/capabilities", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "PERSISTENCE_FAILED", message: "测试关联失败", retryable: false, reason_code: null }) }), { times: 1 });
    await page.getByTestId("p03-method-link-add").click(); await expect(page.getByTestId("p03-command-feedback")).toContainText("测试关联失败");
    expect(await page.getByTestId("hs-draft-identity").innerText()).toBe(unchanged); await expect(links).toContainText("尚无架构关联");
    await addLink(page, grandchild, "INPUT"); await expect(links).toContainText("出站"); await expect(links).toContainText("提供输入给");
    await page.getByTestId("p03-method-link-target").selectOption(grandchild); await expect(page.getByTestId("p03-method-link-add")).toBeDisabled();
    await links.getByRole("button", { name: "产品关联图", exact: true }).click(); await expect(level).toHaveValue("PRODUCT"); await expect(links).toContainText("入站");
    await addLink(page, child, "TRACE"); await expect(links).toContainText("追溯到");
    await page.getByTestId(`p03-context-${root}`).click(); await expect(level).toHaveValue("MISSION"); await addLink(page, child, "GENERATES");
    await expect(links).toContainText("生成"); await page.getByTestId(`p03-context-${child}`).click(); await expect(level).toHaveValue("FUNCTION");
    await expect(links.locator("li")).toHaveCount(3);
    await links.locator("strong").scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("trace-links-desktop-top.png") });
    await links.locator("li").last().scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("trace-links-desktop-bottom.png") });
    await page.screenshot({ path: info.outputPath("trace-desktop.png") });
    const saving = page.waitForResponse(response => response.url().endsWith("/draft/save") && response.status() === 200);
    await page.getByTestId("hs-save").click(); const revision = (await (await saving).json()).revision_id as string;
    await page.getByTestId(`p03-context-${child}`).click({ button: "right" }); await page.getByTestId("opd-delete-action").click();
    await expect(page.getByTestId("opd-delete-confirm")).toBeDisabled();
    await page.getByTestId("opd-delete-cancel").click();
    await deleteLink(page, "生成"); await expect(links.locator("li")).toHaveCount(2);
    const sourceBeforeToken = await page.getByTestId("hs-draft-identity").innerText();
    const sourceBeforeTransfer = await download(page, child, info.outputPath("trace-source-before.opd.json"));
    await page.goto(`${sourceUrl}?context=${child}&revision=${revision}`); await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    await page.getByTestId("p03-tab-method").click(); await expect(links.locator("li")).toHaveCount(3);
    for (const button of await links.getByTestId("p03-method-link-delete").all()) await expect(button).toBeDisabled();
    await expect(page.getByTestId("p03-method-link-add")).toBeDisabled();
    const path = info.outputPath("trace.opd.json"), exported = await download(page, child, path);
    expect(exported.semantic_revision.schema_version).toBe("0.5"); expect(exported.semantic_revision.contexts).toHaveLength(3);
    expect(exported.semantic_revision.contexts.flatMap((context: any) => context.architecture_links ?? [])).toHaveLength(3);
    await links.getByRole("button", { name: "产品关联图", exact: true }).first().click(); await expect(level).toHaveValue("PRODUCT"); expect(new URL(page.url()).searchParams.get("revision")).toBe(revision);
    await page.setViewportSize({ width: 390, height: 844 }); await links.scrollIntoViewIfNeeded();
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await links.locator("strong").scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("trace-links-mobile-top.png") });
    await links.locator("li").last().scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("trace-links-mobile-bottom.png") });
    await page.screenshot({ path: info.outputPath("trace-mobile.png") }); await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(`/projects/${project}`); await page.getByTestId("p02-import-opd-json").click(); await page.getByTestId("opd-json-file").setInputFiles(path);
    await page.getByTestId("opd-json-model-name").fill(`架构关联导入验证-${Date.now()}`);
    const importing = page.waitForResponse(response => response.url().endsWith("/opd-json/import") && response.status() === 201);
    await page.getByTestId("opd-json-import-confirm").click(); models.push((await (await importing).json()).data.model_id);
    await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.getByTestId("p03-tab-method").click(); await expect(links.locator("li")).toHaveCount(3);
    await edit(page, () => page.getByTestId("p03-tool-object").click()); await expect(links.locator("li")).toHaveCount(3);
    await edit(page, () => level.selectOption("PRODUCT"));
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    await page.reload(); await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.getByTestId("p03-tab-method").click(); await expect(level).toHaveValue("PRODUCT"); await expect(links.locator("li")).toHaveCount(3);
    const reopened = await download(page, child, info.outputPath("trace-reopened.opd.json"));
    expect(reopened.semantic_revision.schema_version).toBe("0.5");
    expect(reopened.semantic_revision.elements).toHaveLength(exported.semantic_revision.elements.length + 1);
    expect(reopened.semantic_revision.contexts.find((context: any) => context.context_id === child).occurrence_ids.length).toBe(exported.semantic_revision.contexts.find((context: any) => context.context_id === child).occurrence_ids.length + 1);
    await expect(node(page, "Object 1")).toBeVisible();
    expect(reopened.semantic_revision.contexts.map((context: any) => context.architecture_links)).toEqual(exported.semantic_revision.contexts.map((context: any) => context.architecture_links));
    await page.goto(`${sourceUrl}?context=${child}`); await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.getByTestId("p03-tab-method").click(); await expect(level).toHaveValue("FUNCTION"); await expect(links.locator("li")).toHaveCount(2);
    expect(await page.getByTestId("hs-draft-identity").innerText()).toBe(sourceBeforeToken);
    const sourceAfterTransfer = await download(page, child, info.outputPath("trace-source-after.opd.json"));
    for (const field of ["contexts", "elements", "features", "states", "facts", "occurrences", "layouts", "state_presentations", "refinement_edges"]) expect(sourceAfterTransfer.semantic_revision[field]).toEqual(sourceBeforeTransfer.semantic_revision[field]);
    await expect(node(page, "Object 1")).toHaveCount(0);
    // 外部入站关联已从目标解除；剩下两条内部回环随子树删除。
    await page.getByTestId(`p03-context-${child}`).click({ button: "right" }); await page.getByTestId("opd-delete-action").click(); await expect(page.getByTestId("opd-delete-confirm")).toBeEnabled();
    await edit(page, () => page.getByTestId("opd-delete-confirm").click()); await expect(page.getByTestId(`p03-context-${child}`)).toHaveCount(0); await expect(page.getByTestId(`p03-context-${grandchild}`)).toHaveCount(0);
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存"); await page.reload(); await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.getByTestId("p03-tab-method").click(); await expect(links).toContainText("尚无架构关联");
    const deleted = await download(page, root, info.outputPath("trace-deleted.opd.json")); expect(deleted.semantic_revision.schema_version).toBe("0.5"); expect(deleted.semantic_revision.contexts).toHaveLength(1);
    expect(errors).toEqual([]);
  } catch (error) { await page.screenshot({ path: info.outputPath("trace-failure.png") }); throw error; }
  finally {
    for (const id of models.reverse()) {
      await page.goto(`/projects/${project}`); await page.getByTestId(`p02-trash-${id}`).click(); await page.getByTestId("p02-lifecycle-confirm").click(); await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
    }
  }
});
function node(page: Page, name: string) { return page.locator(".x6-node").filter({ hasText: name }).first(); }
async function edit(page: Page, action: () => Promise<unknown>) {
  const token = await page.getByTestId("hs-draft-identity").innerText(); await action(); await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(token); await expect(page.getByTestId("hs-save")).toBeEnabled();
}
async function refine(page: Page, parent: string, name: string) {
  await page.getByTestId(`opd-add-${parent}`).click(); await page.getByTestId("opd-refinement-name").fill(name); await edit(page, () => page.getByTestId("opd-refine").click());
  await expect(page.getByTestId("opd-navigator").locator('[aria-current="page"]')).toContainText(name); return new URL(page.url()).searchParams.get("context")!;
}
async function addLink(page: Page, target: string, kind: string) {
  await page.getByTestId("p03-method-link-kind").selectOption(kind); await page.getByTestId("p03-method-link-target").selectOption(target); await edit(page, () => page.getByTestId("p03-method-link-add").click());
}
async function deleteLink(page: Page, text: string) {
  await page.getByTestId("p03-method-links").locator("li").filter({ hasText: text }).getByTestId("p03-method-link-delete").click(); await edit(page, () => page.getByTestId("p03-method-link-delete-confirm").click());
}
async function download(page: Page, context: string, path: string) {
  await page.getByTestId(`p03-context-${context}`).click({ button: "right" }); const ready = page.waitForEvent("download"); await page.getByTestId("opd-export-json").click(); await (await ready).saveAs(path); return JSON.parse(await readFile(path, "utf8"));
}
