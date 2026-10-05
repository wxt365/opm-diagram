import { expect, test, type Page, type Locator } from "@playwright/test";

test("中文节点改名支持Enter和点击画布提交，保持OPL、刷新与无边框样式一致", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("/projects");
  await page.getByTestId("p01-create-project").click();
  await page.getByTestId("ov01-project-name").fill(`名称回归 ${Date.now()}`);
  await page.getByRole("button", { name: "创建并继续", exact: true }).click();
  await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill("咖啡模型");
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  await edit(page, () => page.getByTestId("p03-tool-object").click());
  await edit(page, () => page.getByTestId("p03-tool-process").click());
  const objectId = await page.locator(".x6-node").filter({ hasText: "Object 1" }).getAttribute("data-cell-id");
  const processId = await page.locator(".x6-node").filter({ hasText: "Process 1" }).getAttribute("data-cell-id");
  const object = page.locator(`.x6-node[data-cell-id="${objectId}"]`);
  const process = page.locator(`.x6-node[data-cell-id="${processId}"]`);
  const transformation = page.getByTestId("p03-relation-quick-option-CAP-ISO-PROC-001");
  const transformationHint = "生成/消耗关系 / Result / Consumption\n生成 / Result：过程 → 对象\n消耗 / Consumption：对象 → 过程";
  await expect(transformation).toHaveAttribute("title", transformationHint);
  await page.getByTestId("p03-relation-menu-toggle-PROCEDURAL").click();
  await expect(page.getByTestId("p03-relation-menu-option-CAP-ISO-PROC-001")).toHaveAttribute("title", transformationHint);
  await page.keyboard.press("Escape");
  await transformation.click();
  await edit(page, async () => {
    const from = await object.boundingBox(), to = await process.boundingBox();
    expect(from).not.toBeNull(); expect(to).not.toBeNull();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down(); await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 10 }); await page.mouse.up();
  });
  await page.keyboard.press("Escape");

  let input = await open(page, object);
  await input.fill("咖啡豆");
  await expectBorderless(input);
  await page.screenshot({ path: test.info().outputPath("object-editing.png") });
  await edit(page, () => input.press("Enter"));
  await expect(input).toHaveCount(0); await expect(object).toContainText("咖啡豆");
  await expect(page.getByTestId("p03-opl-sentence").filter({ hasText: "咖啡豆" }).first()).toBeVisible();

  input = await open(page, object); await input.fill("烘焙咖啡豆");
  await edit(page, () => clickBlank(page));
  await expect(input).toHaveCount(0); await expect(object).toContainText("烘焙咖啡豆");
  const identity = await page.getByTestId("hs-draft-identity").innerText();
  input = await open(page, object); await input.fill("不应保存"); await input.press("Escape");
  await expect(object).toContainText("烘焙咖啡豆");
  input = await open(page, object); await clickBlank(page); await expect(input).toHaveCount(0);
  await expect(page.getByTestId("hs-draft-identity")).toHaveText(identity);

  input = await open(page, process); await input.fill("   "); await clickBlank(page);
  await expect(input).toBeFocused(); await expect(input).toHaveValue("   ");
  await expect(page.getByTestId("p03-command-feedback")).toContainText("非空白");
  await expect(page.getByTestId("hs-draft-identity")).toHaveText(identity);
  await input.fill("研磨"); await edit(page, () => clickBlank(page));
  await expect(process).toContainText("研磨");
  await expect(page.getByTestId("p03-opl-sentence").filter({ hasText: "研磨" }).first()).toBeVisible();

  await page.getByTestId("p03-zoom-in").click();
  input = await open(page, process); await expectBorderless(input);
  const field = await input.boundingBox(), shape = await process.boundingBox();
  expect(Math.abs(field!.x + field!.width / 2 - shape!.x - shape!.width / 2)).toBeLessThan(2);
  expect(Math.abs(field!.y + field!.height / 2 - shape!.y - shape!.height / 2)).toBeLessThan(2);
  await page.screenshot({ path: test.info().outputPath("process-editing-zoom.png") });
  await input.fill("精细研磨"); await page.getByTestId("hs-save").click();
  await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
  await expect(process).toContainText("精细研磨");
  const finalIdentity = await page.getByTestId("hs-draft-identity").innerText();
  await page.reload();
  await expect(object).toContainText("烘焙咖啡豆"); await expect(process).toContainText("精细研磨");
  await expect(page.getByTestId("hs-draft-identity")).toHaveText(finalIdentity);

  await object.click(); await page.getByTestId("p03-right-panel-open").click();
  const property = page.getByTestId("p03-inspector-name");
  await expect(property).toHaveValue("烘焙咖啡豆");
  await expect(page.getByTestId("p03-right-panel")).not.toContainText("属性更新命令不在 P0 范围");
  await property.fill("阿拉比卡咖啡豆"); await edit(page, () => property.press("Enter"));
  await expect(object).toContainText("阿拉比卡咖啡豆");
  await expect(page.getByTestId("p03-opl-sentence").filter({ hasText: "阿拉比卡咖啡豆" }).first()).toBeVisible();
  await property.fill("取消修改"); await property.press("Escape"); await expect(property).toHaveValue("阿拉比卡咖啡豆");
  await property.fill("   "); await clickBlank(page);
  await expect(property).toHaveValue("   "); await expect(property).toBeFocused();
  await property.fill("精品咖啡豆"); await edit(page, () => clickBlank(page));
  await process.click(); await expect(property).toHaveValue("精细研磨");
  await property.fill("咖啡研磨"); await page.keyboard.press("Control+s");
  await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
  await expect(process).toContainText("咖啡研磨");
  await page.screenshot({ path: test.info().outputPath("inspector-name.png") });
  await page.reload(); await expect(object).toContainText("精品咖啡豆"); await expect(process).toContainText("咖啡研磨");
  await expect(page.getByTestId("p03-opl-sentence").filter({ hasText: "精品咖啡豆" }).first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

async function open(page: Page, node: Locator) {
  await node.dblclick({ position: { x: 15, y: 30 } });
  const input = page.getByTestId("p03-name-editor"); await expect(input).toBeFocused(); return input;
}
async function edit(page: Page, action: () => Promise<unknown>) {
  const before = await page.getByTestId("hs-draft-identity").innerText();
  await action(); await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(before);
}
async function clickBlank(page: Page) {
  const canvas = page.getByTestId("p03-canvas"); const box = await canvas.boundingBox();
  await canvas.click({ position: { x: box!.width - 30, y: box!.height - 30 } });
}
async function expectBorderless(input: Locator) {
  expect(await input.evaluate(element => {
    const style = getComputedStyle(element); return { border: style.borderTopWidth, outline: style.outlineStyle, shadow: style.boxShadow };
  })).toEqual({ border: "0px", outline: "none", shadow: "none" });
}
