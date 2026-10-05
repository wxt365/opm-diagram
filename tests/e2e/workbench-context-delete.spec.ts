import { expect, test, type Page } from "@playwright/test";
test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5176" });

test("真实画布：删除三级子树、取消零提交、父元素保留和保存重开及历史只读", async ({ page }, info) => {
  const project = process.env.OPM_PLACEMENT_PROJECT;
  test.skip(!project, "需要明确本地测试项目");
  await page.setViewportSize({ width: 1440, height: 1000 }); page.setDefaultTimeout(15_000);
  const errors: string[] = [], deletes: unknown[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (/\/draft\/commands$/.test(new URL(request.url()).pathname) && request.postDataJSON()?.command?.command_type === "DELETE_CONTEXT") deletes.push(request.postDataJSON());
  });
  await page.goto(`/projects/${project}`); const projectUrl = page.url();
  await page.getByTestId("p02-create-model").click(); await page.getByTestId("ov02-model-name").fill(`子图删除验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
  const workbenchUrl = page.url(), model = new URL(workbenchUrl).pathname.split("/models/")[1]!.split("/")[0]!;
  const nav = page.getByTestId("opd-navigator");
  try {
    const root = (await nav.locator('[aria-current="page"]').getAttribute("data-testid"))!;
    await addElement(page, "object");
    const parentObjectId = (await page.locator(".x6-node").filter({ hasText: "Object 1" }).getAttribute("data-cell-id"))!;
    await refine(page, "原料处理子图");
    const child = (await nav.locator('[aria-current="page"]').getAttribute("data-testid"))!;
    await addElement(page, "object"); await addElement(page, "state"); await addElement(page, "attribute");
    const childObject = page.locator(".x6-node").filter({ hasText: "Object 1" });
    await childObject.click({ position: { x: 20, y: 14 } }); await refine(page, "原料处理下级图");
    const grandchild = (await nav.locator('[aria-current="page"]').getAttribute("data-testid"))!;
    await addElement(page, "process");
    await expect(nav.locator(".navigator-count")).toHaveText("3");
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    const history = await page.getByTestId("p03-version-select").locator("option").evaluateAll(options => options.map(item => (item as HTMLOptionElement).value));
    const beforeDeleteRevision = history[1]!;
    const beforeCancelToken = await page.getByTestId("hs-draft-identity").innerText();
    // 在下级图中右键祖先子图，删除计划必须覆盖完整子树。
    await page.getByTestId(child).click({ button: "right" }); await page.getByTestId("opd-delete-action").click();
    await expect(page.getByTestId("opd-delete-confirm")).toBeEnabled();
    await expect(page.getByTestId("opd-delete-dialog")).toContainText("原料处理下级图");
    await expect(page.getByTestId("opd-delete-counts")).toContainText("2 张图，2 个元素，1 个属性/操作，1 个状态");
    await page.screenshot({ path: info.outputPath("context-delete-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    const box = await page.getByTestId("opd-delete-dialog").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(391);
    await page.screenshot({ path: info.outputPath("context-delete-mobile.png") });
    await page.getByTestId("opd-delete-cancel").click();
    expect(deletes).toHaveLength(0); await expect(page.getByTestId("hs-draft-identity")).toHaveText(beforeCancelToken);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.getByTestId(grandchild)).toHaveAttribute("aria-current", "page");
    await page.getByTestId(child).click({ button: "right" }); await page.getByTestId("opd-delete-action").click();
    await expect(page.getByTestId("opd-delete-confirm")).toBeEnabled(); await page.getByTestId("opd-delete-confirm").click();
    await expect(page.getByTestId("opd-delete-dialog")).toHaveCount(0); await expect(page.getByTestId(root)).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId(child)).toHaveCount(0); await expect(page.getByTestId(grandchild)).toHaveCount(0);
    expect(deletes).toHaveLength(1);
    const parentObject = page.locator(`.x6-node[data-cell-id="${parentObjectId}"]`);
    await expect(parentObject).toContainText("Object 1"); await expect(parentObject.locator("rect").first()).toHaveAttribute("stroke-width", "2");
    await parentObject.click({ button: "right", position: { x: 20, y: 14 } });
    await expect(page.getByTestId("p03-construct-add-refinement")).toBeEnabled();
    await expect(page.getByTestId("p03-construct-expand-refinement")).toHaveCount(0);
    await page.getByRole("button", { name: "关闭构造操作菜单" }).click();
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    await page.reload(); await expect(page.getByTestId("hs-save")).toBeEnabled(); await expect(nav.locator(".navigator-count")).toHaveText("1");
    await expect(parentObject.locator("rect").first()).toHaveAttribute("stroke-width", "2");
    await page.getByTestId(root).click({ button: "right" }); await expect(page.getByTestId("opd-delete-action")).toBeDisabled(); await page.keyboard.press("Escape");
    await page.getByTestId("p03-version-select").selectOption(beforeDeleteRevision); await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    await expect(nav.locator(".navigator-count")).toHaveText("3");
    await expect(parentObject.locator("rect").first()).toHaveAttribute("stroke-width", "4");
    await page.getByTestId(child).click({ button: "right" }); await expect(page.getByTestId("opd-delete-action")).toBeDisabled();
    await page.keyboard.press("Escape"); await page.getByTestId(child).click();
    await expect(childObject).toBeVisible(); await expect(page.locator(".x6-node").filter({ hasText: "State 1" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("context-delete-history.png") });
    await childObject.locator('[data-testid^="p03-feature-toggle-"]').click();
    await expect(page.locator(".x6-node").filter({ hasText: "Attribute 1" })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await page.goto(workbenchUrl); await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.goto(projectUrl);
    await page.getByTestId(`p02-trash-${model}`).click(); await page.getByTestId("p02-lifecycle-confirm").click();
    await expect(page.getByTestId("p02-lifecycle-dialog")).toHaveCount(0);
  }
});

async function addElement(page: Page, tool: string) {
  const token = await page.getByTestId("hs-draft-identity").innerText();
  await page.getByTestId(`p03-tool-${tool}`).click();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(token); await expect(page.getByTestId("hs-save")).toBeEnabled();
}
async function refine(page: Page, name: string) {
  const row = (await page.getByTestId("opd-navigator").locator('[aria-current="page"]').getAttribute("data-testid"))!;
  await page.getByTestId(row.replace("p03-context-", "opd-add-")).click();
  await page.getByTestId("opd-refinement-name").fill(name); await page.getByTestId("opd-refine").click();
  await expect(page.getByTestId("opd-navigator").locator('[aria-current="page"]')).toContainText(name); await expect(page.getByTestId("hs-save")).toBeEnabled();
}
