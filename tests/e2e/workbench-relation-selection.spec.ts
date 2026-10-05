import { expect, test, type Locator, type Page } from "@playwright/test";
import { chooseViewportAction } from "./viewport-controls";

test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5177" });
const scenarios = [
  { name: "消耗事件", capability: "CAP-ISO-PROC-001", mode: "control", count: 1 },
  { name: "主体实心圆", capability: "CAP-ISO-PROC-004", mode: "binary", count: 1 },
  { name: "手段空心圆", capability: "CAP-ISO-PROC-005", mode: "binary", count: 1 },
  { name: "Effect双线段", capability: "CAP-ISO-PROC-003", mode: "effect", count: 2 },
  { name: "聚合实心三角", capability: "CAP-ISO-STRUCT-005", mode: "fan", count: 3 },
  { name: "泛化空心三角", capability: "CAP-ISO-STRUCT-007", mode: "fan", count: 3 },
];
for (const scenario of scenarios) test(`关系选中反馈：${scenario.name}`, async ({ page }, info) => {
  const project = process.env.OPM_PLACEMENT_PROJECT; test.skip(!project, "需要明确本地测试项目");
  await page.setViewportSize({ width: 1440, height: 1000 }); page.setDefaultTimeout(10_000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/projects/${project}`); const projectUrl = page.url();
  await page.getByTestId("p02-create-model").click(); await page.getByTestId("ov02-model-name").fill(`关系选中-${scenario.name}-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
  const workbenchUrl = page.url(), model = new URL(workbenchUrl).pathname.split("/models/")[1]!.split("/")[0]!;
  try {
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    await edit(page, () => page.getByTestId(scenario.mode === "fan" ? "p03-tool-object" : "p03-tool-process").click());
    if (["fan", "effect"].includes(scenario.mode)) await edit(page, () => page.getByTestId("p03-tool-object").click());
    const source = node(page, "Object 1"), target = node(page, scenario.mode === "fan" ? "Object 2" : "Process 1");
    const last = node(page, scenario.mode === "fan" ? "Object 3" : "Object 2");
    await chooseViewportAction(page, "fit");
    // 三元关系的端点形成三角，确保每个分支都有独立可点击区域。
    if (["fan", "effect"].includes(scenario.mode)) await edit(page, async () => {
      const box = (await last.boundingBox())!;
      await page.mouse.move(box.x + 20, box.y + 14); await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y - 66, { steps: 8 }); await page.mouse.up();
    });
    await chooseViewportAction(page, "fit");
    const beforeCreate = await page.getByTestId("hs-draft-identity").innerText();
    await activate(page, scenario.capability);
    await connect(page, source, target, scenario.mode === "fan");
    if (["fan", "effect"].includes(scenario.mode)) {
      await expect(page.getByTestId("p03-canvas")).toHaveAttribute("data-relation-gesture-phase", "relation-armed");
      await connect(page, source, last);
    }
    await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(beforeCreate);
    await expect(page.getByTestId("hs-save")).toBeEnabled(); await page.getByTestId("p03-tool-select").click();
    const lines = page.locator('.x6-edge path[data-opm-selected]'); await expect(lines).toHaveCount(scenario.count);
    await clickLine(page, lines.first());
    if (scenario.mode === "control") {
      await page.getByTestId("p03-right-panel-open").click(); await page.getByTestId("p03-control-open").click();
      await page.getByTestId("p03-control-option-CAP-ISO-CTRL-001").click();
      await edit(page, () => page.getByTestId("p03-control-preview-confirm").click());
      await page.getByTestId("p03-right-panel-close").click();
    }
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    await blank(page);
    const unselected = await appearance(lines), token = await page.getByTestId("hs-draft-identity").innerText();
    const writes: string[] = []; page.on("request", request => { if (/\/draft\/(commands|save|pin)$/.test(new URL(request.url()).pathname)) writes.push(request.url()); });
    for (const line of await lines.all()) {
      await clickLine(page, line); await selected(lines);
      const current = await appearance(lines);
      expect(current.map(item => item.shape)).toEqual(unselected.map(item => item.shape));
      current.forEach((item, index) => {
        if (item.marker) {
          expect(item.marker.stroke).toBe("#0b6bcb");
          const fill = unselected[index]!.marker?.fill;
          expect(item.marker.fill).toBe(fill === "#20242a" ? "#0b6bcb" : fill);
        }
      });
      await blank(page); await expect.poll(() => appearance(lines)).toEqual(unselected);
    }
    if (scenario.mode === "fan") {
      const junction = page.locator('.x6-node[data-cell-id$=".junction"]');
      await junction.click(); await selected(lines);
      await expect(junction.locator("polygon")).toHaveAttribute("stroke", "#0b6bcb");
      await expect(junction.locator("polygon")).toHaveAttribute("fill", scenario.capability.endsWith("005") ? "#0b6bcb" : "#ffffff");
      await junction.click({ button: "right" }); await expect(page.getByTestId("p03-construct-open-properties")).toBeVisible();
      await page.getByRole("button", { name: "关闭构造操作菜单" }).click({ position: { x: 10, y: 10 } });
    } else await clickLine(page, lines.first());
    await selected(lines);
    if (scenario.mode === "control") await expect(page.locator(".x6-edge text")).toHaveAttribute("fill", "#0b6bcb");
    await page.screenshot({ path: info.outputPath("selected-desktop.png") });
    await source.click({ position: { x: 20, y: 14 } }); await expect.poll(() => appearance(lines)).toEqual(unselected);
    await clickLine(page, lines.first()); await selected(lines);
    await page.getByTestId("p03-zoom-in").click(); await selected(lines);
    await page.setViewportSize({ width: 390, height: 844 }); await chooseViewportAction(page, "fit");
    await page.getByTestId("p03-canvas").scrollIntoViewIfNeeded(); await selected(lines);
    await page.screenshot({ path: info.outputPath("selected-mobile.png") });
    expect(await page.getByTestId("hs-draft-identity").innerText()).toBe(token); expect(writes).toEqual([]);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const versions = await page.getByTestId("p03-version-select").locator("option").evaluateAll(options => options.map(item => (item as HTMLOptionElement).value));
    await page.getByTestId("p03-version-select").selectOption(versions[1]!); await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    await chooseViewportAction(page, "fit"); await clickLine(page, lines.first()); await selected(lines);
    await blank(page); for (const line of await lines.all()) await expect(line).toHaveAttribute("data-opm-selected", "false");
    expect(writes).toEqual([]); expect(errors).toEqual([]);
  } catch (error) { await page.screenshot({ path: info.outputPath("failure.png") }); throw error; }
  finally {
    await page.goto(workbenchUrl); await expect(page.getByTestId("hs-save")).toBeEnabled();
    await page.goto(projectUrl); await page.getByTestId(`p02-trash-${model}`).click(); await page.getByTestId("p02-lifecycle-confirm").click();
    await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
  }
});
function node(page: Page, label: string) { return page.locator(".x6-node").filter({ hasText: label }); }
async function edit(page: Page, action: () => Promise<unknown>) {
  const token = await page.getByTestId("hs-draft-identity").innerText(); await action();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(token); await expect(page.getByTestId("hs-save")).toBeEnabled();
}
async function activate(page: Page, capability: string) {
  const quick = page.getByTestId(`p03-relation-quick-option-${capability}`);
  if (await quick.count()) await quick.click();
  else { await page.getByTestId(`p03-relation-menu-toggle-${capability.includes("STRUCT") ? "STRUCTURAL" : "PROCEDURAL"}`).click(); await page.getByTestId(`p03-relation-menu-option-${capability}`).click(); }
}
async function connect(page: Page, source: Locator, target: Locator, shift = false) {
  const a = (await source.boundingBox())!, b = (await target.boundingBox())!;
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(a.x + 20, a.y + 20); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 }); await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
  await expect(page.getByTestId("p03-canvas")).not.toHaveAttribute("data-relation-gesture-phase", "candidate-filtering");
}
async function clickLine(page: Page, line: Locator) {
  const point = await line.evaluate(element => {
    const path = element as SVGPathElement, p = path.getPointAtLength(path.getTotalLength() * 0.4);
    const screen = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!); return { x: screen.x, y: screen.y };
  });
  await page.mouse.click(point.x, point.y);
}
async function blank(page: Page) {
  const frame = (await page.locator(".canvas-frame").boundingBox())!; await page.mouse.click(frame.x + 18, frame.y + 18);
  await expect(page.locator('.x6-edge path[data-opm-selected="true"]')).toHaveCount(0);
}
async function selected(lines: Locator) {
  for (const line of await lines.all()) { await expect(line).toHaveAttribute("stroke", "#0b6bcb"); await expect(line).toHaveAttribute("stroke-width", "3"); }
}
async function appearance(lines: Locator) {
  return lines.evaluateAll(items => items.map(line => {
    const id = line.getAttribute("marker-end")?.match(/^url\(#(.+)\)$/)?.[1];
    const marker = id ? document.getElementById(id)?.firstElementChild : undefined;
    return { stroke: line.getAttribute("stroke"), width: line.getAttribute("stroke-width"), shape: marker ? { tag: marker.tagName, path: marker.getAttribute("d"), r: marker.getAttribute("r") } : null,
      marker: marker ? { fill: marker.getAttribute("fill"), stroke: marker.getAttribute("stroke") } : null };
  }));
}
