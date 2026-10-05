import { expect, test, type Locator, type Page } from "@playwright/test";

const useContextMenu = process.env.OPM_ARRANGEMENT_CONTEXT_MENU === "true";

test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5176" });

test("真实画布六种对齐、两种分布、状态随动及保存重开", async ({ page }, info) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(10_000);
  await page.setViewportSize({ width: 1800, height: 1400 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const project = process.env.OPM_PLACEMENT_PROJECT;
  await page.goto(project ? `/projects/${project}` : "/projects");
  if (!project) {
    await page.getByTestId("p01-create-project").click();
    await page.getByTestId("ov01-project-name").fill(`排列验证 ${Date.now()}`);
    await page.getByRole("button", { name: "创建并继续", exact: true }).click();
  }
  await expect(page.getByTestId("p02-create-model")).toBeVisible();
  const projectUrl = page.url();
  await page.getByTestId("p02-create-model").click();
  await page.getByTestId("ov02-model-name").fill(`对齐与等距验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click();
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  const modelId = new URL(page.url()).pathname.split("/models/")[1]!.split("/")[0]!;
  const requests: Array<{ command: { command_type: string; payload: { layouts: unknown[] } } }> = [];
  page.on("request", request => {
    if (request.url().includes(`/models/${modelId}/draft/commands`)) requests.push(request.postDataJSON());
  });
  try {
    await page.getByRole("button", { name: "收起底部面板 / Collapse bottom panel", exact: true }).click();
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    const owner = node(page, "Object 1"), child = node(page, "State 1");
    for (let index = 0; index < 3; index++) {
      await owner.click({ position: { x: 20, y: 14 } });
      await edit(page, () => page.getByTestId("p03-tool-state").click());
    }
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    await edit(page, () => page.getByTestId("p03-tool-process").click());
    const other = node(page, "Object 2"), process = node(page, "Process 1");
    const nodes = [owner, other, process], states = [child, node(page, "State 2"), node(page, "State 3")];
    for (const [index, item] of nodes.entries()) {
      await item.click({ position: { x: 20, y: 14 } });
      const box = (await item.boundingBox())!;
      await edit(page, () => drag(page, item, Math.round(([450, 750, 1120][index]! - box.x) / 16) * 16,
        Math.round(([450, 650, 920][index]! - box.y) / 16) * 16));
    }
    await owner.click({ position: { x: 20, y: 14 } });
    await page.getByTestId("opd-layout-menu-toggle").click();
    await expect(page.getByTestId("opd-layout-left")).toBeDisabled();
    await page.keyboard.press("Escape"); await expect(page.getByTestId("opd-layout-menu")).not.toBeVisible();
    await other.click({ modifiers: ["Shift"], position: { x: 20, y: 14 } });
    await page.getByTestId("opd-layout-menu-toggle").click();
    await expect(page.getByTestId("opd-layout-left")).toBeEnabled();
    await expect(page.getByTestId("opd-layout-distribute-x")).toBeDisabled();
    await page.keyboard.press("Escape");
    await process.click({ modifiers: ["Control"], position: { x: 20, y: 14 } });
    await child.click({ modifiers: ["Meta"] });
    for (const item of [...nodes, child]) await expect(item.locator("rect,ellipse").first()).toHaveAttribute("fill", "#eaf3fc");
    const before = await geometry([...nodes, ...states]);
    expect(before[0]!.height).toBeGreaterThan(before[2]!.height);
    // 每项从同一几何开始，避免先前的对齐掩盖错误。
    for (const action of ["left", "center-x", "right", "top", "center-y", "bottom"] as const) {
      const count = requests.length, seq = await editSeq(page);
      await arrange(page, action);
      expect(requests).toHaveLength(count + 1); expect(await editSeq(page)).toBe(seq + 1);
      expect(requests.at(-1)!.command.command_type).toBe("UPDATE_LAYOUT_BATCH");
      const after = await geometry([...nodes, ...states]), reference = before[2]!;
      expect(after[2]).toEqual(reference);
      for (let index = 0; index < 2; index++) {
        const box = after[index]!;
        const expected = action === "left" ? reference.x : action === "center-x" ? reference.x + (reference.width - box.width) / 2
          : action === "right" ? reference.x + reference.width - box.width : action === "top" ? reference.y
          : action === "center-y" ? reference.y + (reference.height - box.height) / 2 : reference.y + reference.height - box.height;
        expect(action === "left" || action === "center-x" || action === "right" ? box.x : box.y).toBeCloseTo(expected, 1);
        expect(box.width).toBe(before[index]!.width); expect(box.height).toBe(before[index]!.height);
      }
      for (let index = 3; index < 6; index++) {
        expect(after[index]!.x - before[index]!.x).toBeCloseTo(after[0]!.x - before[0]!.x, 1);
        expect(after[index]!.y - before[index]!.y).toBeCloseTo(after[0]!.y - before[0]!.y, 1);
      }
      // 重复执行没有编辑请求，也没有虚假历史。
      await page.getByTestId("opd-layout-menu-toggle").click(); await page.getByTestId(`opd-layout-${action}`).click();
      await expect(page.getByTestId("p03-command-feedback")).toContainText("已符合该布局");
      expect(requests).toHaveLength(count + 1);
      if (action === "left") {
        await page.getByTestId("opd-layout-menu-toggle").click();
        await page.screenshot({ path: info.outputPath("align-menu.png") });
        // 已对齐后横向空间不足，应拒绝整批而不改变画布。
        const negativeCount = requests.length;
        await page.getByTestId("opd-layout-distribute-x").click();
        await expect(page.getByTestId("p03-command-feedback")).toContainText("空间不足");
        expect(requests).toHaveLength(negativeCount); expect(await geometry([...nodes, ...states])).toEqual(after);
      }
      await edit(page, () => layoutHistory(page, false));
      expect(await geometry([...nodes, ...states])).toEqual(before);
    }
    for (const action of ["distribute-x", "distribute-y"] as const) {
      const count = requests.length; await arrange(page, action); expect(requests).toHaveLength(count + 1);
      const after = await geometry(nodes), axis = action === "distribute-x" ? "x" : "y", size = axis === "x" ? "width" : "height";
      expect(after[0]).toEqual(before[0]); expect(after[2]).toEqual(before[2]);
      expect(after[1]![axis] - after[0]![axis] - after[0]![size]).toBeCloseTo(after[2]![axis] - after[1]![axis] - after[1]![size], 1);
      await edit(page, () => layoutHistory(page, false)); expect(await geometry([...nodes, ...states])).toEqual(before);
      await edit(page, () => layoutHistory(page, true)); expect(await geometry(nodes)).toEqual(after);
      await edit(page, () => layoutHistory(page, false));
    }
    // 独立状态在同一所属节点内进行合法对齐；混选时提供原因。
    await states[0]!.click(); await states[1]!.click({ modifiers: ["Shift"] });
    const stateBefore = await geometry([owner, ...states]);
    await arrange(page, "top");
    const stateAfter = await geometry([owner, ...states]);
    expect(stateAfter[0]).toEqual(stateBefore[0]);
    expect(stateAfter[1]!.y).toBeCloseTo(stateAfter[2]!.y, 1);
    await edit(page, () => layoutHistory(page, false));
    expect(await geometry([owner, ...states])).toEqual(stateBefore);
    await arrange(page, "left", false);
    await expect(page.getByTestId("p03-command-feedback")).toContainText("已符合该布局");
    await other.click({ modifiers: ["Shift"], position: { x: 20, y: 14 } });
    await page.getByTestId("opd-layout-menu-toggle").click();
    await expect(page.getByTestId("opd-layout-left")).toBeDisabled();
    await expect(page.getByTestId("opd-layout-menu")).toContainText("独立状态只能");
    await other.click({ position: { x: 20, y: 14 } });
    await expect(page.getByTestId("opd-layout-menu")).not.toBeVisible();
    await owner.click({ position: { x: 20, y: 14 } });
    await other.click({ modifiers: ["Shift"], position: { x: 20, y: 14 } });
    await process.click({ modifiers: ["Shift"], position: { x: 20, y: 14 } });
    await arrange(page, "distribute-y");
    const saved = await geometry([...nodes, ...states]);
    await page.getByTestId("hs-save").click(); await expect(page.getByTestId("hs-save-state")).toHaveText("已手动保存");
    await page.reload(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    expect(await geometry([...nodes, ...states])).toEqual(saved);
    await expect(page.getByTestId("opd-undo-layout")).toBeDisabled();
    const versions = await page.getByTestId("p03-version-select").locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
    await page.getByTestId("p03-version-select").selectOption(versions[1]!);
    await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
    // 已保存版本沿既有只读界面隐藏编辑工具栏。
    await expect(page.getByTestId("opd-layout-menu-toggle")).toHaveCount(0);
    await page.getByTestId("p03-return-head").click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("opd-layout-menu-toggle").click();
    const menu = page.getByTestId("opd-layout-menu"), bounds = (await menu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
    await page.screenshot({ path: info.outputPath("align-menu-mobile.png") });
    await page.keyboard.press("Escape"); await expect(menu).not.toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await page.goto(projectUrl);
    await page.getByTestId(`p02-trash-${modelId}`).click();
    await page.getByTestId("p02-lifecycle-confirm").click();
    await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
  }
});

function node(page: Page, name: string) { return page.locator(".x6-node").filter({ hasText: name }); }
async function editSeq(page: Page) { return Number((await page.getByTestId("hs-draft-identity").innerText()).split("编辑 ")[1]); }
async function edit(page: Page, action: () => Promise<unknown>) {
  const before = await page.getByTestId("hs-draft-identity").innerText(); await action();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(before);
  await expect(page.getByTestId("hs-save")).toBeEnabled(); await expect(page.getByTestId("p03-tool-object")).toBeEnabled();
}
async function arrange(page: Page, action: string, changed = true) {
  const invoke = async () => {
    if (useContextMenu) {
      await page.getByTestId("p03-canvas").click({ button: "right", position: { x: 8, y: 8 } });
      await page.getByTestId("opd-blank-arrange").click(); await page.getByTestId(`opd-blank-layout-${action}`).click();
    } else { await page.getByTestId("opd-layout-menu-toggle").click(); await page.getByTestId(`opd-layout-${action}`).click(); }
  };
  if (changed) await edit(page, invoke); else await invoke();
}
async function layoutHistory(page: Page, redo: boolean) {
  if (useContextMenu) {
    await page.getByTestId("p03-canvas").click({ button: "right", position: { x: 8, y: 8 } });
    await page.getByTestId(redo ? "opd-blank-redo" : "opd-blank-undo").click();
  } else await page.getByTestId(redo ? "opd-redo-layout" : "opd-undo-layout").click();
}
async function drag(page: Page, node: Locator, dx: number, dy: number) {
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 14); await page.mouse.down();
  await page.mouse.move(box.x + 20 + dx, box.y + 14 + dy, { steps: 12 }); await page.mouse.up();
}
async function geometry(nodes: Locator[]) {
  return Promise.all(nodes.map(node => node.evaluate(element => {
    const box = element.querySelector("rect,ellipse")!.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  })));
}
