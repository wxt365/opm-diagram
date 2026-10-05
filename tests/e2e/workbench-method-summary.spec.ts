import { expect, test, type Page, type Locator } from "@playwright/test";
import { chooseViewportAction } from "./viewport-controls";
test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5177" });

test("真实画布：6×1证据、定位、跨图、保存重开、历史隔离和失败重试", async ({ page }, info) => {
  const project = process.env.OPM_PLACEMENT_PROJECT; test.skip(!project, "需要明确本地测试项目");
  await page.setViewportSize({ width: 1440, height: 1050 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/projects/${project}`); await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill(`架构方法验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
  const location = new URL(page.url()), model = location.pathname.split("/models/")[1]!.split("/")[0]!, root = location.searchParams.get("context")!;
  const url = `/projects/${project}/models/${model}/workbench`;
  try {
    await page.getByTestId("p03-tab-method").click(); const panel = page.getByTestId("p03-method-panel");
    await expect(panel.getByTestId("p03-method-empty")).toContainText("尚无过程");
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    await edit(page, () => page.getByTestId("p03-tool-process").click());
    await expect(panel.getByTestId("p03-method-role-RESOURCE")).toContainText("未发现消耗关系");
    await chooseViewportAction(page, "fit");
    for (const [capability, role] of [["001", "RESOURCE"], ["004", "SUBJECT"], ["005", "INSTRUMENT"]]) {
      await page.getByTestId(`p03-relation-quick-option-CAP-ISO-PROC-${capability}`).click();
      await edit(page, () => connect(page, node(page, "Object 1"), node(page, "Process 1")));
      await page.getByTestId("p03-tool-select").click();
      const card = panel.getByTestId(`p03-method-role-${role}`); await expect(card).toContainText("有关系 · 待确认");
      await card.getByTestId("p03-method-locate").click();
      await expect(page.locator('[data-opm-text-highlighted="true"]')).toHaveCount(2);
      await expect(page.locator('.x6-edge path[data-opm-selected="true"]')).toHaveCount(1);
    }
    await expect(panel.getByTestId("p03-method-role-INFORMATION")).toContainText("需人工确认");
    await expect(panel.getByTestId("p03-method-role-ENVIRONMENT")).toContainText("需人工确认");
    await page.screenshot({ path: info.outputPath("method-desktop.png") });
    await node(page, "Process 1").click({ position: { x: 20, y: 14 } });
    await page.getByTestId(`opd-add-${root}`).click(); await page.getByTestId("opd-refinement-name").fill("方法子图");
    await page.getByTestId("opd-refine").click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    await expect(page.getByTestId("opd-navigator").locator('[aria-current="page"]')).toContainText("方法子图");
    const child = new URL(page.url()).searchParams.get("context")!;
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    await edit(page, () => page.getByTestId("p03-tool-process").click());
    await chooseViewportAction(page, "fit");
    await rename(page, "Object 1", "子图材料"); await rename(page, "Process 1", "子图过程");
    await page.getByTestId("p03-relation-quick-option-CAP-ISO-PROC-001").click();
    await edit(page, () => connect(page, node(page, "子图材料"), node(page, "子图过程")));
    await page.getByTestId("p03-tool-select").click();
    await page.getByTestId(`p03-context-${root}`).click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    await panel.getByTestId("p03-method-scope").selectOption("model");
    const childProcess = panel.getByTestId("p03-method-process").locator("option").filter({ hasText: "方法子图" });
    await expect(childProcess).toHaveCount(1); await panel.getByTestId("p03-method-process").selectOption((await childProcess.getAttribute("value"))!);
    await panel.getByTestId("p03-method-role-RESOURCE").getByTestId("p03-method-locate").click();
    await expect(page.getByTestId("opd-navigator").locator('[aria-current="page"]')).toContainText("方法子图");
    await expect(page.locator('[data-opm-text-highlighted="true"]')).toHaveCount(2);
    await expect(page.locator('.x6-edge path[data-opm-selected="true"]')).toHaveCount(1);
    const saving = page.waitForResponse(response => response.url().endsWith("/draft/save") && response.status() === 200);
    await page.getByTestId("hs-save").click(); const revision = (await (await saving).json()).revision_id as string;
    await page.goto(`${url}?context=${child}`); await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.getByTestId("p03-tab-method").click();
    await expect(panel.getByTestId("p03-method-role-RESOURCE")).toContainText("消耗关系：子图材料");
    await rename(page, "子图材料", "后续对象名称");
    await expect(panel.getByTestId("p03-method-role-RESOURCE")).toContainText("后续对象名称");
    await expect(page.locator('[data-opm-text-highlighted="true"]')).toHaveCount(0);
    await page.goto(`${url}?context=${child}&revision=${revision}`); await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    await page.getByTestId("p03-tab-method").click(); await expect(panel.getByTestId("p03-method-role-RESOURCE")).toContainText("消耗关系：子图材料");
    await expect(panel).not.toContainText("后续对象名称");
    await panel.getByTestId("p03-method-role-RESOURCE").getByTestId("p03-method-locate").click(); await expect(page.locator('[data-opm-text-highlighted="true"]')).toHaveCount(2);
    await page.route("**/draft/method-summary", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "PERSISTENCE_FAILED", message: "测试连接中断", retryable: true, reason_code: null }) }), { times: 1 });
    await panel.getByTestId("p03-method-refresh").click(); await expect(panel.getByRole("alert")).toContainText("测试连接中断");
    await panel.getByTestId("p03-method-refresh").click(); await expect(panel.getByRole("alert")).toHaveCount(0);
    await expect(panel.getByTestId("p03-method-role-RESOURCE")).toContainText("子图材料");
    await page.setViewportSize({ width: 390, height: 844 }); await panel.scrollIntoViewIfNeeded();
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath("method-mobile.png") }); expect(errors).toEqual([]);
  } catch (error) { await page.screenshot({ path: info.outputPath("method-failure.png") }); throw error; }
  finally {
    await page.goto(`/projects/${project}`); await page.getByTestId(`p02-trash-${model}`).click();
    await page.getByTestId("p02-lifecycle-confirm").click(); await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
  }
});

test("原 PROC 案例只读检查客体状态证据并定位所属对象", async ({ page }, info) => {
  const project = process.env.OPM_PLACEMENT_PROJECT; test.skip(!project, "需要明确案例项目");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const models = (await (await page.request.get(`/api/v1/projects/${project}/models?request_id=method.e2e.models`)).json()).data as Array<{ model_id: string; name: string }>;
  const proc = models.find(item => item.name.endsWith("工具校验-PROC")); expect(proc).toBeDefined();
  const writes: string[] = []; page.on("request", request => { if (/\/draft\/(commands|save|pin)$/.test(new URL(request.url()).pathname)) writes.push(request.url()); });
  await page.goto(`/projects/${project}/models/${proc!.model_id}/workbench`); await expect(page.getByTestId("hs-save")).toBeEnabled();
  await page.getByTestId("p03-tab-method").click(); const panel = page.getByTestId("p03-method-panel");
  let checked = 0;
  await expect(panel.getByTestId("p03-method-process")).toBeEnabled();
  const ids = await panel.getByTestId("p03-method-process").locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  for (const id of ids) {
    await panel.getByTestId("p03-method-process").selectOption(id);
    const card = panel.getByTestId("p03-method-role-OBJECT");
    for (const button of await card.getByTestId("p03-method-locate").all()) {
      await button.click(); await expect.poll(() => page.locator('[data-opm-text-highlighted="true"]').count()).toBeGreaterThanOrEqual(2); checked++;
    }
  }
  expect(checked).toBeGreaterThanOrEqual(4); expect(writes).toEqual([]);
  await page.screenshot({ path: info.outputPath("method-state-evidence.png") });
});

function node(page: Page, name: string) { return page.locator(".x6-node").filter({ hasText: name }).first(); }
async function connect(page: Page, source: Locator, target: Locator) {
  await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-relation-gesture-phase", "relation-armed");
  const a = (await source.boundingBox())!, b = (await target.boundingBox())!;
  await page.mouse.move(a.x + 20, a.y + 20); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 }); await page.mouse.up();
}
async function edit(page: Page, action: () => Promise<unknown>) {
  const token = await page.getByTestId("hs-draft-identity").innerText(); await action();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(token); await expect(page.getByTestId("hs-save")).toBeEnabled();
}
async function rename(page: Page, old: string, name: string) {
  await page.getByTestId("p03-tool-select").click();
  await node(page, old).dblclick({ position: { x: 20, y: 14 } });
  await page.getByTestId("p03-name-editor").fill(name); await edit(page, () => page.getByTestId("p03-name-editor").press("Enter"));
}
