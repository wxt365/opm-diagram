import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { chooseViewportAction } from "./viewport-controls";

test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5177" });

type Package = { format: string; format_version: string; entry_context_id: string; source: { model_id: string }; semantic_revision: Record<string, any> };
const fields = ["elements", "features", "states", "facts", "contexts", "occurrences", "layouts", "refinement_edges", "state_presentations"];

test("真实画布 OPD JSON 跨项目迁移、只读导出、异常零写入和重新编辑保存", async ({ page }, info) => {
  test.setTimeout(240_000); page.setDefaultTimeout(15_000);
  const project = process.env.OPM_PLACEMENT_PROJECT;
  test.skip(!project, "需要明确隔离测试所在项目");
  await page.setViewportSize({ width: 1800, height: 1200 });
  const errors: string[] = [], models: { project: string; model: string }[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`/projects/${project}`);
    await page.getByTestId("p02-create-model").click(); await page.getByTestId("ov02-model-name").fill(`JSON 来源验证-${Date.now()}`);
    await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    const sourceUrl = page.url(), sourceModel = modelId(sourceUrl); models.push({ project: project!, model: sourceModel });
    const nav = page.getByTestId("opd-navigator"); const root = (await nav.locator('[aria-current="page"]').getAttribute("data-testid"))!;
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    await edit(page, () => page.getByTestId("p03-tool-process").click());
    await node(page, "Process 1").click({ position: { x: 20, y: 14 } }); await refine(page, "烘焙子图");
    const child = (await nav.locator('[aria-current="page"]').getAttribute("data-testid"))!;
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    const owner = node(page, "Object 1"); await owner.click({ position: { x: 20, y: 14 } });
    await edit(page, () => page.getByTestId("p03-tool-state").click()); await owner.click({ position: { x: 20, y: 14 } });
    await edit(page, () => page.getByTestId("p03-tool-attribute").click());
    await edit(page, () => page.getByTestId("p03-tool-process").click());
    await chooseViewportAction(page, "reset");
    await page.getByTestId("p03-relation-quick-option-CAP-ISO-PROC-001").click();
    await edit(page, () => connect(page, owner, node(page, "Process 1"))); await page.getByTestId("p03-tool-select").click();
    await page.getByTestId(root).click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    await node(page, "Object 1").click({ position: { x: 20, y: 14 } }); await refine(page, "无关兄弟图");
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    await page.getByTestId(child).click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    const before = await page.getByTestId("hs-draft-identity").innerText();
    const rootFile = await download(page, root, info.outputPath("root.opd.json")); expect(rootFile.semantic_revision.contexts).toHaveLength(3);
    const filePath = info.outputPath("child.opd.json"), original = await download(page, child, filePath);
    expect(original.format).toBe("OPM-OPD-JSON"); expect(original.format_version).toBe("1.0");
    expect(original.semantic_revision.contexts).toHaveLength(2); expect(original.semantic_revision.refinement_edges).toHaveLength(1);
    expect(original.semantic_revision.states).toHaveLength(1); expect(original.semantic_revision.features).toHaveLength(1); expect(original.semantic_revision.facts).toHaveLength(1);
    expect(await page.getByTestId("hs-draft-identity").innerText()).toBe(before);
    // 固定历史版本也可以导出，不能触发编辑或保存。
    const versions = await page.getByTestId("p03-version-select").locator("option").evaluateAll(options => options.map(item => (item as HTMLOptionElement).value));
    await page.getByTestId("p03-version-select").selectOption(versions[1]!); await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    const historical = await download(page, child, info.outputPath("history.opd.json"));
    for (const field of fields) expect(historical.semantic_revision[field]).toEqual(original.semantic_revision[field]);
    await page.goto("/projects"); await page.getByTestId("p01-create-project").click();
    await page.getByTestId("ov01-project-name").fill(`JSON 目标环境验证-${Date.now()}`);
    await page.getByRole("button", { name: "创建并继续", exact: true }).click(); await expect(page.getByTestId("p02-create-model")).toBeVisible();
    const targetUrl = page.url(), targetProject = new URL(targetUrl).pathname.split("/projects/")[1]!;
    await page.getByTestId("p02-import-opd-json").click();
    for (const [name, data, message] of [["broken", "{", "JSON 文件无法解析"], ["version", JSON.stringify({ ...original, format_version: "99" }), "文件不是支持的 OPD JSON 1.0 格式"]]) {
      await page.getByTestId("opd-json-file").setInputFiles({ name: `${name}.json`, mimeType: "application/json", buffer: Buffer.from(data!) });
      await expect(page.getByTestId("opd-json-import-error")).toContainText(message!); await expect(page.getByTestId("opd-json-import-confirm")).toBeDisabled();
    }
    const conflict = structuredClone(original); conflict.semantic_revision.profile_binding.binding_digest.digest = "0".repeat(64);
    await page.getByTestId("opd-json-file").setInputFiles({ name: "conflict.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(conflict)) });
    await page.getByTestId("opd-json-import-confirm").click(); await expect(page.getByTestId("opd-json-import-error")).toContainText("不一致");
    const empty = await page.request.get(new URL(`/api/v1/projects/${targetProject}/models?request_id=request.transfer-check`, page.url()).href);
    expect(empty.status()).toBe(200); expect((await empty.json()).data).toHaveLength(0);
    await page.getByTestId("opd-json-file").setInputFiles(filePath); await expect(page.getByTestId("opd-json-preview")).toContainText("烘焙子图 · 2 张图");
    await page.getByTestId("opd-json-model-name").fill("跨环境烘焙子图");
    await page.screenshot({ path: info.outputPath("import-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    const box = (await page.getByTestId("opd-json-import-dialog").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(391);
    await page.screenshot({ path: info.outputPath("import-mobile.png") });
    await page.setViewportSize({ width: 1800, height: 1200 });
    const response = page.waitForResponse(response => response.url().endsWith("/opd-json/import") && response.status() === 201);
    await page.getByTestId("opd-json-import-confirm").click(); const result = await (await response).json();
    models.push({ project: targetProject, model: result.data.model_id });
    await expect(page.getByTestId("hs-save")).toBeEnabled();
    expect(new URL(page.url()).searchParams.get("context")).toBe(original.entry_context_id);
    await expect(page.getByTestId(child)).toHaveAttribute("aria-current", "page");
    await expect(nav.locator(".navigator-count")).toHaveText("2");
    const restored = await download(page, child, info.outputPath("restored.opd.json"));
    expect(restored.source.model_id).not.toBe(original.source.model_id);
    for (const field of fields) expect(restored.semantic_revision[field]).toEqual(original.semantic_revision[field]);
    await expect(node(page, "State 1")).toBeVisible(); await chooseViewportAction(page, "fit");
    await page.screenshot({ path: info.outputPath("restored-canvas.png") });
    // 实际移动导入对象并新增过程，保存重开后验证语义和新布局。
    await page.getByTestId("p03-tool-select").click(); await edit(page, () => drag(page, node(page, "Object 1"), -60, 80));
    await edit(page, () => page.getByTestId("p03-tool-process").click());
    const changed = await download(page, child, info.outputPath("edited.opd.json"));
    expect(changed.semantic_revision.layouts).not.toEqual(original.semantic_revision.layouts);
    expect(changed.semantic_revision.elements).toHaveLength(original.semantic_revision.elements.length + 1);
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    await page.reload(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    const reopened = await download(page, child, info.outputPath("reopened.opd.json"));
    for (const field of fields) expect(reopened.semantic_revision[field]).toEqual(changed.semantic_revision[field]);
    await page.goto(sourceUrl); await expect(page.getByTestId("hs-save")).toBeEnabled();
    expect(await page.getByTestId("hs-draft-identity").innerText()).toBe(before);
    const untouched = await download(page, root, info.outputPath("source-untouched.opd.json"));
    for (const field of fields) expect(untouched.semantic_revision[field]).toEqual(rootFile.semantic_revision[field]);
    expect(errors).toEqual([]);
  } catch (error) {
    await page.screenshot({ path: info.outputPath("failure.png") }); throw error;
  } finally {
    for (const item of models.reverse()) {
      await page.goto(`/projects/${item.project}`); await page.getByTestId(`p02-trash-${item.model}`).click(); await page.getByTestId("p02-lifecycle-confirm").click();
      await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
    }
  }
});
function modelId(url: string) { return new URL(url).pathname.split("/models/")[1]!.split("/")[0]!; }
function node(page: Page, name: string) { return page.locator(".x6-node").filter({ hasText: name }).last(); }
async function edit(page: Page, action: () => Promise<unknown>) {
  const token = await page.getByTestId("hs-draft-identity").innerText(); await action();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(token); await expect(page.getByTestId("hs-save")).toBeEnabled();
}
async function refine(page: Page, name: string) {
  const row = (await page.getByTestId("opd-navigator").locator('[aria-current="page"]').getAttribute("data-testid"))!;
  await page.getByTestId(row.replace("p03-context-", "opd-add-")).click(); await page.getByTestId("opd-refinement-name").fill(name); await page.getByTestId("opd-refine").click();
  await expect(page.getByTestId("opd-navigator").locator('[aria-current="page"]')).toContainText(name); await expect(page.getByTestId("hs-save")).toBeEnabled();
}
async function download(page: Page, row: string, path: string): Promise<Package> {
  await page.getByTestId(row).click({ button: "right" }); await expect(page.getByTestId("opd-export-json")).toBeEnabled();
  const ready = page.waitForEvent("download"); await page.getByTestId("opd-export-json").click(); const file = await ready;
  expect(file.suggestedFilename()).toMatch(/\.opd\.json$/); await file.saveAs(path); return JSON.parse(await readFile(path, "utf8"));
}
async function connect(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!, b = (await to.boundingBox())!;
  await page.mouse.move(a.x + 20, a.y + a.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await page.mouse.up();
}
async function drag(page: Page, item: Locator, dx: number, dy: number) {
  const box = (await item.boundingBox())!; await page.mouse.move(box.x + box.width / 4, box.y + box.height / 4); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 4 + dx, box.y + box.height / 4 + dy, { steps: 12 }); await page.mouse.up();
}
