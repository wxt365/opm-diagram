import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5176" });

test("状态、属性和操作避让已有节点，容器收缩及保存重开保持一致", async ({ page }, info) => {
  page.setDefaultTimeout(10_000);
  await page.setViewportSize({ width: 1800, height: 1200 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const project = process.env.OPM_PLACEMENT_PROJECT;
  await page.goto(project ? `/projects/${project}` : "/projects");
  if (!project) {
    await page.getByTestId("p01-create-project").click();
    await page.getByTestId("ov01-project-name").fill(`节点定位回归 ${Date.now()}`);
    await page.getByRole("button", { name: "创建并继续", exact: true }).click();
  }
  await expect(page.getByTestId("p02-create-model")).toBeVisible();
  const projectUrl = page.url();
  const name = `节点定位验证-${Date.now()}`;
  await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill(name);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  const modelId = new URL(page.url()).pathname.split("/models/")[1]!.split("/")[0]!;
  try {
    await page.getByRole("button", { name: "收起底部面板 / Collapse bottom panel", exact: true }).click();
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    const owner = page.locator(".x6-node").filter({ hasText: "Object 1" });
    const states = [1, 2, 3].map(index => page.locator(".x6-node").filter({ hasText: `State ${index}` }));
    for (const state of states) {
      await owner.click({ position: { x: 20, y: 14 } });
      await expect(page.getByTestId("p03-tool-state")).toBeEnabled();
      await edit(page, () => page.getByTestId("p03-tool-state").click());
      await expect(state).toBeVisible();
    }
    await separated(states, 5);
    for (const state of states) await contained(owner, state);
    const expanded = (await owner.boundingBox())!;
    await edit(page, () => drag(page, states[2], 0, -36));
    const compact = (await owner.boundingBox())!;
    expect(compact.height).toBeLessThan(expanded.height);
    // 再创建不能覆盖被拖到候选槽位的已有状态。
    await owner.click({ position: { x: 20, y: 14 } });
    await edit(page, () => page.getByTestId("p03-tool-state").click());
    const fourth = page.locator(".x6-node").filter({ hasText: "State 4" });
    const fourthBox = (await fourth.boundingBox())!;
    const oldBoxes = await Promise.all(states.map(state => state.boundingBox()));
    for (const box of oldBoxes) expect(overlaps(fourthBox, box!, 5)).toBe(false);
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    const neighbor = page.locator(".x6-node").filter({ hasText: "Object 2" });
    await owner.click({ position: { x: 20, y: 14 } });
    await edit(page, () => page.getByTestId("p03-tool-attribute").click());
    await owner.locator('[data-testid^="p03-feature-toggle-"]').click();
    const attribute = page.locator(".x6-node").filter({ hasText: "Attribute 1" });
    await expect(attribute).toBeVisible();
    await owner.click({ position: { x: 20, y: 14 } });
    await edit(page, () => page.getByTestId("p03-tool-operation").click());
    await owner.locator('[data-testid^="p03-feature-toggle-"]').click();
    const operation = page.locator(".x6-node").filter({ hasText: "Operation 1" });
    await expect(operation).toBeVisible();
    await separated([owner, neighbor, attribute, operation], 7);
    await expect(operation.locator("ellipse")).toBeVisible();
    const children = [...states, fourth];
    const positionsBefore = await Promise.all([owner, ...children].map(node => node.boundingBox()));
    const ownerBox = positionsBefore[0]!;
    await edit(page, async () => {
      await page.mouse.move(ownerBox.x + 20, ownerBox.y + 14);
      await page.mouse.down();
      await page.mouse.move(ownerBox.x - 20, ownerBox.y - 66, { steps: 12 });
      await page.mouse.up();
    });
    const positionsAfter = await Promise.all([owner, ...children].map(node => node.boundingBox()));
    for (let index = 1; index < positionsAfter.length; index++) {
      expect(positionsAfter[index]!.x - positionsBefore[index]!.x).toBeCloseTo(positionsAfter[0]!.x - positionsBefore[0]!.x, 0);
      expect(positionsAfter[index]!.y - positionsBefore[index]!.y).toBeCloseTo(positionsAfter[0]!.y - positionsBefore[0]!.y, 0);
      await contained(owner, children[index - 1]!);
    }
    const nodes = [owner, neighbor, attribute, operation, ...states, fourth];
    const geometry = await Promise.all(nodes.map(node => node.evaluate(element => ({
      transform: element.getAttribute("transform"), body: element.querySelector('rect,ellipse')?.outerHTML,
    }))));
    await page.getByTestId("hs-save").click();
    await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    await page.screenshot({ path: info.outputPath("node-placement.png") });
    await page.reload();
    await expect(page.getByTestId("hs-save")).toBeEnabled();
    await owner.locator('[data-testid^="p03-feature-toggle-"]').click();
    expect(await Promise.all(nodes.map(node => node.evaluate(element => ({
      transform: element.getAttribute("transform"), body: element.querySelector('rect,ellipse')?.outerHTML,
    }))))).toEqual(geometry);
    expect(errors).toEqual([]);
  } finally {
    // 测试模型移入可恢复回收站，不触及演示模型。
    await page.goto(projectUrl);
    await page.getByTestId(`p02-trash-${modelId}`).click();
    await page.getByTestId("p02-lifecycle-confirm").click();
    await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
  }
});

async function edit(page: Page, action: () => Promise<unknown>) {
  const before = await page.getByTestId("hs-draft-identity").innerText();
  await action();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(before);
  await expect(page.getByTestId("hs-save")).toBeEnabled();
}

async function drag(page: Page, node: Locator, dx: number, dy: number) {
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 12 });
  await page.mouse.up();
}

type Box = { x: number; y: number; width: number; height: number };
function overlaps(a: Box, b: Box, gap: number) {
  return a.x < b.x + b.width + gap && b.x < a.x + a.width + gap
    && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;
}

async function separated(nodes: Locator[], gap: number) {
  const boxes = await Promise.all(nodes.map(node => node.boundingBox()));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!, gap), JSON.stringify({ i, j, boxes })).toBe(false);
}

async function contained(owner: Locator, state: Locator) {
  const outer = (await owner.boundingBox())!, inner = (await state.boundingBox())!;
  expect(inner.x).toBeGreaterThanOrEqual(outer.x + 7);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y + 27);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width - 7);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height - 7);
}

const casePages = [
  { name: "SD1", model: "model.8b8024549f2a45b8b32a814b794a187b", context: "context.refinement.30299e829f544dd994c1c870f569781c" },
  { name: "PROC", model: "model.332a2cb78df2414986fb1c2862788e7c", context: "context.root.4878a41ab3a443ea8e2c4d9ef05fa538" },
  { name: "STRUCT", model: "model.05e82787edd7408d887b9fe637be430c", context: "context.root.52aac68656d241fba974728fb3eca190" },
];

for (const scenario of casePages) {
  test(`整理后的 ${scenario.name} 案例节点无叠压`, async ({ page }, info) => {
    const project = process.env.OPM_PLACEMENT_PROJECT;
    test.skip(!project, "仅在明确指定演示项目时执行只读案例回归");
    await page.setViewportSize({ width: 1800, height: 1200 });
    const response = page.waitForResponse(response => response.url().includes(`/models/${scenario.model}/draft/projection`) && response.ok());
    await page.goto(`/projects/${project}/models/${scenario.model}/workbench?context=${scenario.context}`);
    const projection = await (await response).json();
    await expect(page.getByTestId("hs-save")).toBeEnabled();
    await page.getByRole("button", { name: "收起底部面板 / Collapse bottom panel", exact: true }).click();
    const toggles = page.locator('.x6-node [data-testid^="p03-feature-toggle-"]');
    for (let index = 0; index < await toggles.count(); index++) await toggles.nth(index).click();
    const constructs = projection.data.constructs as Array<{ target_id: string; target_kind: string; owner_id?: string }>;
    const cell = (id: string) => page.locator(`.x6-node[data-cell-id="${id}"]`);
    const elements = constructs.filter(node => node.target_kind === "ELEMENT" || node.target_kind === "FEATURE");
    await separated(elements.map(node => cell(node.target_id)), 0);
    for (const state of constructs.filter(node => node.target_kind === "STATE")) await contained(cell(state.owner_id!), cell(state.target_id));
    const owners = new Set(constructs.filter(node => node.target_kind === "STATE").map(node => node.owner_id));
    for (const owner of owners) await separated(constructs.filter(node => node.target_kind === "STATE" && node.owner_id === owner).map(node => cell(node.target_id)), 4);
    await page.screenshot({ path: info.outputPath(`${scenario.name}-after.png`) });
  });
}
