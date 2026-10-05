import { expect, test, type Locator, type Page } from "@playwright/test";

const cases = [
  { name: "消耗事件", base: "CAP-ISO-PROC-001", control: "CAP-ISO-CTRL-001", letter: "e", state: false },
  { name: "主体事件", base: "CAP-ISO-PROC-004", control: "CAP-ISO-CTRL-002", letter: "e", state: false },
  { name: "手段条件", base: "CAP-ISO-PROC-005", control: "CAP-ISO-CTRL-006", letter: "c", state: false },
  { name: "状态消耗事件", base: "CAP-ISO-PROC-006", control: "CAP-ISO-CTRL-003", letter: "e", state: true },
];

for (const scenario of cases) {
  test(`${scenario.name}的文字在短线、各方向、缩放及重开后与端点分离`, async ({ page }, info) => {
    page.setDefaultTimeout(10_000);
    await page.setViewportSize({ width: 1800, height: 1100 });
    const base = process.env.OPM_CONTROL_SPACING_BASE;
    const target = (path: string) => base ? new URL(path, base).href : path;
    const existingProject = process.env.OPM_CONTROL_SPACING_PROJECT;
    if (existingProject) await page.goto(target(`/projects/${existingProject}`));
    else {
      await page.goto(target("/projects"));
      await page.getByTestId("p01-create-project").click();
      await page.getByTestId("ov01-project-name").fill(`控制字母间距回归 ${Date.now()}`);
      await page.getByTestId("ov01-create-project").getByRole("button", { name: "创建并继续" }).click();
    }
    await expect(page.getByTestId("p02-create-model")).toBeVisible();
    const projectUrl = page.url();
    const name = `间距验证-${scenario.name}-${Date.now()}`;
    await page.getByTestId("p02-create-model").click();
    await page.getByTestId("ov02-model-name").fill(name);
    await page.getByTestId("ov02-create-model").getByRole("button", { name: "创建并打开工作台" }).click();
    await expect(page.getByTestId("p03-tool-object")).toBeEnabled();
    const workbenchUrl = page.url();
    const modelId = new URL(workbenchUrl).pathname.split("/models/")[1]!.split("/")[0]!;
    try {
      await edit(page, page.getByTestId("p03-tool-object"));
      const object = page.locator(".x6-node").filter({ hasText: "Object 1" });
      await moveNode(page, object, 470, 450);
      if (scenario.state) {
        await object.click({ position: { x: 20, y: 20 } });
        await edit(page, page.getByTestId("p03-tool-state"));
      }
      await edit(page, page.getByTestId("p03-tool-process"));
      const processNode = page.locator(".x6-node").filter({ hasText: "Process 1" });
      await moveNode(page, processNode, 670, 450);
      const source = scenario.state ? page.locator(".x6-node").filter({ hasText: "State 1" }) : object;
      const quick = page.getByTestId(`p03-relation-quick-option-${scenario.base}`);
      if (await quick.count()) await quick.click();
      else {
        await page.getByTestId("p03-relation-menu-toggle-PROCEDURAL").click();
        await page.getByTestId(`p03-relation-menu-option-${scenario.base}`).click();
      }
      const from = await point(source);
      const to = await point(processNode);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await page.mouse.up();
      await expect(page.locator(".x6-edge")).toHaveCount(1);
      await page.getByTestId("p03-tool-select").click();
      const edgePoint = await page.locator('.x6-edge path[data-opm-capture-cell-id]').evaluate((element) => {
        const path = element as SVGPathElement;
        const p = path.getPointAtLength(path.getTotalLength() / 2);
        const screen = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!);
        return { x: screen.x, y: screen.y };
      });
      await page.mouse.click(edgePoint.x, edgePoint.y);
      await page.getByTestId("p03-right-panel-open").click();
      await page.getByTestId("p03-control-open").click();
      await page.getByTestId(`p03-control-option-${scenario.control}`).click();
      await expect(page.getByTestId("p03-control-preview")).toBeVisible();
      await expect(page.locator(".x6-edge text").filter({ hasText: scenario.letter })).toHaveCount(1);
      await checkGap(page);
      await edit(page, page.getByTestId("p03-control-preview-confirm"));
      await page.getByTestId("p03-right-panel-open").click();
      await expect(page.locator(".x6-edge")).toHaveCount(1);
      const opl = await page.getByTestId("p03-opl-sentence").allTextContents();
      expect(opl.join(" ")).toContain("Process 1");
      const sourceBox = await source.boundingBox();
      if (!sourceBox) throw new Error("源节点不可见");
      const samples: unknown[] = [];
      for (const [direction, x, y] of [
        ["短水平向右", sourceBox.x + sourceBox.width + 34, sourceBox.y + sourceBox.height / 2 - 36],
        ["水平向左", sourceBox.x - 194, sourceBox.y + sourceBox.height / 2 - 36],
        ["垂直向下", sourceBox.x + sourceBox.width / 2 - 80, sourceBox.y + sourceBox.height + 100],
        ["垂直向上", sourceBox.x + sourceBox.width / 2 - 80, sourceBox.y - 172],
        ["斜向", sourceBox.x + sourceBox.width + 120, sourceBox.y + sourceBox.height + 80],
      ] as const) {
        await moveNode(page, processNode, x, y);
        samples.push({ direction, geometry: await checkGap(page) });
      }
      for (const zoom of [80, 150, 100]) {
        await setZoom(page, zoom);
        samples.push({ zoom, geometry: await checkGap(page) });
      }
      await page.locator(".canvas-frame").screenshot({ path: info.outputPath("control-spacing-canvas.png") });
      await page.getByTestId("hs-save").click();
      await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
      await page.reload();
      await expect(page.locator(".x6-edge text")).toHaveText(scenario.letter);
      await checkGap(page);
      await expect(page.getByTestId("p03-opl-sentence")).toHaveText(opl);
      await info.attach("间距测量", { body: JSON.stringify(samples, null, 2), contentType: "application/json" });
    } catch (error) {
      await page.screenshot({ path: info.outputPath("failure.png") });
      throw error;
    } finally {
      // 只清理本测试新建的模型，保留用户的演示数据。
      await page.goto(projectUrl);
      await page.getByTestId(`p02-trash-${modelId}`).click();
      await page.getByTestId("p02-lifecycle-confirm").click();
      await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
      await page.getByTestId("p02-trash-tab").click();
      await page.getByTestId(`p02-purge-${modelId}`).click();
      await page.getByTestId("p02-purge-name").fill(name);
      await page.getByTestId("p02-lifecycle-confirm").click();
      await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
      await expect(page.getByTestId(`p02-purge-${modelId}`)).toHaveCount(0);
    }
  });
}

async function edit(page: Page, trigger: Locator) {
  const before = await page.locator(".revision-tag").innerText();
  await trigger.click();
  await expect(page.locator(".revision-tag")).not.toHaveText(before);
}

async function point(node: Locator) {
  const box = await node.boundingBox();
  if (!box) throw new Error("节点不可见");
  return await node.locator("ellipse").count() || box.height <= 32
    ? { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    : { x: box.x + 20, y: box.y + 20 };
}

async function moveNode(page: Page, node: Locator, x: number, y: number) {
  await page.getByTestId("p03-tool-select").click();
  const box = await node.boundingBox();
  if (!box) throw new Error("节点不可见");
  const start = await point(node);
  const before = await page.locator(".revision-tag").innerText();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + x - box.x, start.y + y - box.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".revision-tag")).not.toHaveText(before);
}

async function setZoom(page: Page, zoom: number) {
  const output = page.getByTestId("p03-zoom-output");
  let current = Number((await output.inputValue()).replace("%", ""));
  while (current !== zoom) {
    await page.getByTestId(current < zoom ? "p03-zoom-in" : "p03-zoom-out").click();
    current += current < zoom ? 10 : -10;
    await expect(output).toHaveValue(`${current}%`);
  }
}

async function checkGap(page: Page) {
  const measurements = await page.locator(".x6-edge").evaluateAll((edges) => edges.flatMap((edge) => {
    const background = edge.querySelector<SVGGraphicsElement>(".x6-edge-label rect");
    const path = edge.querySelector<SVGPathElement>("path[marker-end]");
    if (!background || !path) return [];
    const length = path.getTotalLength();
    const end = path.getPointAtLength(length);
    const previous = path.getPointAtLength(Math.max(0, length - 1));
    const transform = path.getScreenCTM()!;
    const tip = new DOMPoint(end.x, end.y).matrixTransform(transform);
    const prev = new DOMPoint(previous.x, previous.y).matrixTransform(transform);
    const dx = tip.x - prev.x;
    const dy = tip.y - prev.y;
    const norm = Math.hypot(dx, dy);
    const bounds = background.getBoundingClientRect();
    const scale = Math.hypot(transform.a, transform.b);
    // 从字母背景最近边缘到端点沿末段切线测量，扣除含描边的 11px 标记。
    const nearest = Math.min(...[
      [bounds.left, bounds.top], [bounds.right, bounds.top],
      [bounds.left, bounds.bottom], [bounds.right, bounds.bottom],
    ].map(([x, y]) => ((tip.x - x!) * dx + (tip.y - y!) * dy) / norm / scale));
    return [{ length, gap: nearest - 11, scale, letter: edge.querySelector("text")?.textContent }];
  }));
  expect(measurements).toHaveLength(1);
  expect(measurements[0]!.gap, JSON.stringify(measurements)).toBeGreaterThanOrEqual(4);
  return measurements[0]!;
}
