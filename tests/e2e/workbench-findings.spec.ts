import { expect, test, type Page, type Locator } from "@playwright/test";
import { chooseViewportAction } from "./viewport-controls";
test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5177" });

test("现有五个案例运行模型校验不修改草稿，明确保留不完整覆盖标识", async ({ page }, info) => {
  const project = process.env.OPM_PLACEMENT_PROJECT; test.skip(!project, "需要明确本地案例项目");
  const models = (await (await page.request.get(`/api/v1/projects/${project}/models?request_id=findings.models`)).json()).data as Array<{ model_id: string; name: string }>;
  const writes: string[] = [], errors: string[] = [], checked: unknown[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/\/draft\/(commands|save|pin)$/.test(new URL(request.url()).pathname)) writes.push(request.url()); });
  for (const model of models.filter(item => /客户演示|工具校验-(PROC|CTRL|STRUCT|NEG)$/.test(item.name))) {
    await page.goto(`/projects/${project}/models/${model.model_id}/workbench`);
    await expect(page.getByTestId("p03-run-validation")).toBeEnabled();
    const token = await page.getByTestId("hs-draft-identity").innerText();
    const response = page.waitForResponse(value => value.url().endsWith('/draft/findings') && value.status() === 200);
    await page.getByTestId("p03-run-validation").click(); const result = (await (await response).json()).data;
    await expect(page.getByTestId("p03-validation-status")).toContainText("已完成");
    expect(result.validation_summary.coverage_state).toBe("INCOMPLETE");
    expect(await page.getByTestId("hs-draft-identity").innerText()).toBe(token);
    checked.push({ name: model.name, blocking: result.validation_summary.blocking });
  }
  expect(checked).toHaveLength(5); expect(writes).toEqual([]); expect(errors).toEqual([]);
  await info.attach("existing-model-validation", { body: JSON.stringify(checked), contentType: "application/json" });
});

test("真实画布错误关系：全模型校验、跨图定位、失败重试、修改修复及保存重开", async ({ page }, info) => {
  const project = process.env.OPM_PLACEMENT_PROJECT; test.skip(!project, "需要明确本地测试项目");
  await page.setViewportSize({ width: 1440, height: 1000 }); page.setDefaultTimeout(15_000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/projects/${project}`);
  await page.getByTestId("p02-create-model").click(); await page.getByTestId("ov02-model-name").fill(`问题校验验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
  const model = new URL(page.url()).pathname.split("/models/")[1]!.split("/")[0]!;
  const root = new URL(page.url()).searchParams.get("context")!;
  const url = `/projects/${project}/models/${model}/workbench`;
  const queryWrites: string[] = [];
  let checking = false;
  page.on("request", request => { if (checking && /\/draft\/(commands|save|pin)$/.test(new URL(request.url()).pathname)) queryWrites.push(request.url()); });
  try {
    await edit(page, () => page.getByTestId("p03-tool-process").click());
    await page.getByTestId(`opd-add-${root}`).click(); await page.getByTestId("opd-refinement-name").fill("烘焙子图");
    await page.getByTestId("opd-refine").click(); await expect(page.getByTestId("opd-navigator").locator('[aria-current="page"]')).toContainText("烘焙子图");
    await expect(page.getByTestId("hs-save")).toBeEnabled();
    const child = new URL(page.url()).searchParams.get("context")!;
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    await edit(page, () => page.getByTestId("p03-tool-process").click());
    await state(page, "Object 1", "待烘焙"); await state(page, "Object 2", "已烘焙");
    await chooseViewportAction(page, "fit");
    await page.getByTestId("p03-relation-menu-toggle-PROCEDURAL").click();
    await page.getByTestId("p03-relation-menu-option-CAP-ISO-PROC-008").click();
    const before = await page.getByTestId("hs-draft-identity").innerText();
    await drag(page, canvasNode(page, "待烘焙"), canvasNode(page, "Process 1"));
    await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-relation-gesture-phase", "relation-armed");
    await drag(page, canvasNode(page, "待烘焙"), canvasNode(page, "已烘焙"));
    await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(before);
    await page.getByTestId("p03-tool-select").click();
    await page.getByTestId(`p03-context-${root}`).click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    const token = await page.getByTestId("hs-draft-identity").innerText(); checking = true;
    await page.getByTestId("p03-run-validation").click();
    await expect(page.getByTestId("p03-validation-status")).toContainText("已完成 · 部分规则");
    await expect(page.getByTestId("p03-validation-status")).toContainText("阻断 1");
    const row = page.locator('[data-testid^="p03-finding-finding."]').first();
    await expect(row).toContainText("同一个对象"); await expect(row).toContainText("烘焙子图");
    await row.click(); await expect(page.getByTestId("p03-finding-detail")).toContainText("修复建议");
    await page.getByTestId("p03-finding-locate").click();
    await expect(page.getByTestId(`p03-context-${child}`)).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveURL(new RegExp(`context=${child.replaceAll(".", "\\.")}`));
    await expect(page.locator('[data-opm-finding-highlighted="true"]')).toHaveCount(5);
    await expect(page.locator('.x6-edge path[data-opm-finding-highlight="true"]')).toHaveCount(2);
    for (const path of await page.locator('.x6-edge path[data-opm-finding-highlight="true"]').all()) await expect(path).toHaveAttribute("stroke", "#0b6bcb");
    await page.screenshot({ path: info.outputPath("finding-cross-context-desktop.png") });
    expect(await page.getByTestId("hs-draft-identity").innerText()).toBe(token);
    expect(queryWrites).toEqual([]); checking = false;

    await page.setViewportSize({ width: 390, height: 844 });
    await chooseViewportAction(page, "fit");
    const panel = (await page.getByTestId("p03-findings-panel").boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0); expect(panel.x + panel.width).toBeLessThanOrEqual(391);
    await page.getByTestId("p03-finding-locate").scrollIntoViewIfNeeded();
    const locate = (await page.getByTestId("p03-finding-locate").boundingBox())!;
    expect(locate.x).toBeGreaterThanOrEqual(0); expect(locate.x + locate.width).toBeLessThanOrEqual(391);
    await page.screenshot({ path: info.outputPath("finding-mobile.png") });
    await page.setViewportSize({ width: 1440, height: 1000 });
    // 只切断一次校验查询，随后使用真实服务重试。
    await page.route('**/draft/findings', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "测试连接暂不可用", retryable: true } }) }), { times: 1 });
    await page.getByTestId("p03-run-validation").click();
    await expect(page.getByTestId("p03-validation-status")).toContainText("校验失败");
    await expect(page.getByTestId("p03-findings-panel").getByRole("alert")).toContainText("重试");
    await page.getByTestId("p03-run-validation").click();
    await expect(page.getByTestId("p03-validation-status")).toContainText("已完成");
    await row.click(); await page.getByTestId("p03-finding-locate").click();
    // 在画布中删除错误关系，再用同一对象的两种状态建立正确关系。
    const edge = page.locator('.x6-edge path[data-opm-finding-highlight="true"]').first();
    await edge.click({ button: "right", force: true });
    await expect(page.getByTestId("p03-construct-actions-menu")).toBeVisible();
    await edit(page, () => page.getByTestId("p03-construct-delete-action").filter({ hasText: "删除" }).first().click());
    await expect(page.getByTestId("p03-validation-status")).toContainText("需重新校验");
    await expect(page.locator('[data-opm-finding-highlighted="true"]')).toHaveCount(0);
    await state(page, "Object 1", "烘焙完成");
    await chooseViewportAction(page, "fit");
    await page.getByTestId("p03-relation-menu-toggle-PROCEDURAL").click();
    await page.getByTestId("p03-relation-menu-option-CAP-ISO-PROC-008").click();
    await drag(page, canvasNode(page, "待烘焙"), canvasNode(page, "Process 1"));
    await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-relation-gesture-phase", "relation-armed");
    await edit(page, () => drag(page, canvasNode(page, "Process 1"), canvasNode(page, "烘焙完成")));
    await page.getByTestId("p03-tool-select").click(); await page.getByTestId("p03-run-validation").click();
    await expect(page.getByTestId("p03-findings-empty")).toHaveText("已覆盖规则未发现问题。");
    await expect(page.getByTestId("p03-finding-locate")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("finding-empty.png") });
    await expect(page.getByTestId("p03-validation-status")).toContainText("阻断 0");
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    await page.reload(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    await page.getByTestId("p03-run-validation").click(); await expect(page.getByTestId("p03-findings-empty")).toHaveText("已覆盖规则未发现问题。");
    const revision = await page.getByTestId("p03-version-select").locator('option:not([value="head"])').first().getAttribute("value");
    expect(revision).toBeTruthy();
    const savedToken = await page.getByTestId("hs-draft-identity").innerText();
    const taskCheck = await page.evaluate(async ({ project, model, revision }) => {
      const runtime = window as unknown as { __OPM_LOCAL_SESSION__: string; __OPM_ACTIVE_PROFILE_BINDING__: unknown };
      const body = { request_id: `request.saved.validation.${crypto.randomUUID()}`, command_id: `command.saved.validation.${crypto.randomUUID()}`,
        input_revision: revision, binding: runtime.__OPM_ACTIVE_PROFILE_BINDING__, scope: "FULL" };
      const headers = { "Content-Type": "application/json", "X-OPM-Session": runtime.__OPM_LOCAL_SESSION__ };
      const endpoint = `/api/v1/projects/${project}/models/${model}/validation-tasks`;
      const first = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
      const accepted = await first.json(); body.request_id = `request.saved.retry.${crypto.randomUUID()}`;
      const second = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
      const repeated = await second.json();
      const query = await fetch(`/api/v1/tasks/${accepted.data?.task_id}?request_id=query.saved.task`);
      return { status: first.status, repeatStatus: second.status, accepted, repeated, query: await query.json() };
    }, { project: project!, model, revision: revision! });
    expect(taskCheck.status).toBe(202); expect(taskCheck.repeatStatus).toBe(202);
    expect(taskCheck.repeated.data).toEqual(taskCheck.accepted.data);
    expect(taskCheck.query.data).toEqual(taskCheck.accepted.data);
    expect(taskCheck.query.meta.read_revision).toBe(revision);
    expect(taskCheck.accepted.data.input_revision).toBe(revision);
    expect(taskCheck.accepted.data.state).toBe("COMPLETED");
    expect(await page.getByTestId("hs-draft-identity").innerText()).toBe(savedToken);
    await info.attach("saved-validation-task", { body: JSON.stringify({ project, model, revision, task: taskCheck.accepted.data }), contentType: "application/json" });
    // 留下重启后只读复核所需的任务身份；该隔离模型随后按原流程移入回收站。
    await import("node:fs/promises").then(fs => fs.writeFile(info.outputPath("saved-validation-task.json"), JSON.stringify({ project, model, revision, task: taskCheck.accepted.data })));
    await page.goto(`${url}?context=${child}&revision=${revision}`); await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    await expect(page.getByTestId("p03-run-validation")).toBeDisabled(); await page.getByTestId("p03-tab-findings").click();
    await expect(page.getByTestId("p03-validation-coverage")).toContainText("历史版本");
    await page.screenshot({ path: info.outputPath("finding-readonly.png") });
    expect(errors).toEqual([]);
  } catch (error) {
    await page.screenshot({ path: info.outputPath("finding-failure.png") });
    await info.attach("canvas-nodes", { body: JSON.stringify(await page.locator(".x6-node").allTextContents()), contentType: "application/json" });
    throw error;
  } finally {
    await page.goto(`/projects/${project}`); await page.getByTestId(`p02-trash-${model}`).click();
    await page.getByTestId("p02-lifecycle-confirm").click(); await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
  }
});

function canvasNode(page: Page, label: string) { return page.locator('.x6-node').filter({ hasText: label }).first(); }
async function edit(page: Page, action: () => Promise<unknown>) {
  const token = await page.getByTestId("hs-draft-identity").innerText(); await action();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(token); await expect(page.getByTestId("hs-save")).toBeEnabled();
}
async function state(page: Page, owner: string, name: string) {
  const before = new Set(await page.locator('.x6-node').evaluateAll(items => items.map(item => item.getAttribute('data-cell-id'))));
  await canvasNode(page, owner).click({ position: { x: 20, y: 14 } });
  await edit(page, () => page.getByTestId("p03-tool-state").click());
  const id = (await page.locator('.x6-node').evaluateAll(items => items.map(item => item.getAttribute('data-cell-id')))).find(id => id && !before.has(id));
  await page.locator(`.x6-node[data-cell-id="${id}"]`).click();
  if (!await page.getByTestId("p03-state-inspector").count()) await page.getByTestId("p03-right-panel-open").click();
  await page.getByTestId("p03-state-inspector-name").fill(name);
  await edit(page, () => page.getByRole("button", { name: "保存 State", exact: true }).click());
  await page.getByTestId("p03-right-panel-close").click();
}
async function drag(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded(); await target.scrollIntoViewIfNeeded();
  // 等待实际节点布局稳定，避免适应视图的下一帧让手工计算的坐标过期。
  await source.hover(); await page.mouse.down();
  await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-relation-gesture-phase", "dragging");
  const b = (await target.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 }); await page.mouse.up();
  await expect(page.getByTestId("p03-canvas")).not.toHaveAttribute("data-relation-gesture-phase", "dragging");
  await expect(page.getByTestId("p03-canvas")).not.toHaveAttribute("data-relation-gesture-phase", "candidate-filtering");
}
