import { expect, test, type Page, type Locator } from "@playwright/test";

test("状态容器联动、Operation 拖动和反向展示关系在保存重开后保持一致", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/projects");
  await page.getByTestId("p01-create-project").click();
  await page.getByTestId("ov01-project-name").fill(`状态布局回归 ${Date.now()}`);
  await page.getByRole("button", { name: "创建并继续", exact: true }).click();
  await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill("咖啡机");
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  await edit(page, () => page.getByTestId("p03-tool-object").click());
  const owner = page.locator(".x6-node").filter({ hasText: "Object 1" });
  await owner.click();
  await edit(page, () => page.getByTestId("p03-tool-attribute").click());
  const attribute = page.locator(".x6-node").filter({ hasText: "Attribute 1" });
  await edit(page, () => drag(page, attribute, -200, 300));
  await owner.click();
  await edit(page, () => page.getByTestId("p03-tool-operation").click());
  const operation = page.locator(".x6-node").filter({ hasText: "Operation 1" });
  await expect(operation.locator("ellipse")).toBeVisible();
  await edit(page, () => drag(page, operation, 270, 120));

  for (const name of ["待机", "运行中"]) {
    await owner.click({ position: { x: 20, y: 14 } });
    await page.getByTestId("p03-tool-state").click();
    await owner.click({ position: { x: 20, y: 14 } });
    await page.getByTestId("p03-state-name").fill(name);
    if (name === "运行中") await page.getByTestId("p03-state-candidate").getByLabel("FINAL", { exact: true }).check();
    await edit(page, () => page.getByTestId("p03-state-candidate").getByRole("button", { name: "创建", exact: true }).click());
  }
  const states = [page.locator(".x6-node").filter({ hasText: "待机" }), page.locator(".x6-node").filter({ hasText: "运行中" })];
  for (const state of states) await contained(owner, state);
  const oldState = await states[0].boundingBox();
  await edit(page, () => drag(page, states[0], 20, 0));
  expect((await states[0].boundingBox())!.x).toBeGreaterThan(oldState!.x);
  await edit(page, () => drag(page, states[0], -200, -150));
  await contained(owner, states[0]);
  const before = await Promise.all([owner, ...states].map(node => node.boundingBox()));
  const commands: unknown[] = [];
  const collect = (request: import("@playwright/test").Request) => {
    if (request.method() === "POST" && request.url().endsWith("/draft/commands")) commands.push(request.postDataJSON());
  };
  page.on("request", collect);
  await edit(page, () => drag(page, owner, 150, 170, true));
  page.off("request", collect);
  expect(commands).toHaveLength(1);
  const after = await Promise.all([owner, ...states].map(node => node.boundingBox()));
  const dx = after[0]!.x - before[0]!.x, dy = after[0]!.y - before[0]!.y;
  for (const index of [1, 2]) {
    expect(after[index]!.x - before[index]!.x).toBeCloseTo(dx, 0);
    expect(after[index]!.y - before[index]!.y).toBeCloseTo(dy, 0);
    await contained(owner, states[index - 1]);
  }
  const stateId = await states[1].getAttribute("data-cell-id");
  const outline = page.locator(`.x6-node[data-cell-id="state.final-outline.${stateId}"]`);
  const outlineBox = await outline.boundingBox();
  expect(outlineBox!.x + outlineBox!.width / 2).toBeCloseTo(after[2]!.x + after[2]!.width / 2, 0);
  expect(outlineBox!.y + outlineBox!.height / 2).toBeCloseTo(after[2]!.y + after[2]!.height / 2, 0);

  await page.getByTestId("p03-relation-menu-toggle-STRUCTURAL").click();
  await page.getByTestId("p03-relation-menu-option-CAP-ISO-STRUCT-006").click();
  await edit(page, async () => {
    const from = (await attribute.boundingBox())!, to = (await owner.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down(); await page.mouse.move(to.x + 20, to.y + 14, { steps: 12 }); await page.mouse.up();
  });
  await page.keyboard.press("Escape");
  const outer = page.locator('.x6-node[data-cell-id$=".junction"]');
  const inner = page.locator('.x6-node[data-cell-id$=".junction.inner"]');
  await expect(outer.locator("polygon")).toHaveAttribute("fill", "#ffffff");
  await expect(inner.locator("polygon")).toHaveAttribute("fill", "#20242a");
  await expect(page.locator('.x6-edge path[marker-end]')).toHaveCount(0);
  const positions = await Promise.all([owner, attribute, operation, ...states].map(node => node.getAttribute("transform")));
  await page.getByTestId("hs-save").click();
  await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
  await page.screenshot({ path: test.info().outputPath("owned-layout.png") });
  await page.reload();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  for (const [index, node] of [owner, attribute, operation, ...states].entries()) await expect(node).toHaveAttribute("transform", positions[index]!);
  await expect(inner).toBeVisible();
  expect(errors).toEqual([]);
});

async function edit(page: Page, action: () => Promise<unknown>) {
  const before = await page.getByTestId("hs-draft-identity").innerText();
  await action();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(before);
  await expect(page.getByTestId("hs-save")).toBeEnabled();
}

async function drag(page: Page, node: Locator, dx: number, dy: number, header = false) {
  const box = (await node.boundingBox())!;
  const x = box.x + (header ? 20 : box.width / 2), y = box.y + (header ? 14 : box.height / 2);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 15 }); await page.mouse.up();
}

async function contained(owner: Locator, state: Locator) {
  const box = (await owner.boundingBox())!, child = (await state.boundingBox())!;
  expect(child.x).toBeGreaterThanOrEqual(box.x + 7);
  expect(child.y).toBeGreaterThanOrEqual(box.y + 27);
  expect(child.x + child.width).toBeLessThanOrEqual(box.x + box.width - 7);
  expect(child.y + child.height).toBeLessThanOrEqual(box.y + box.height - 7);
}
