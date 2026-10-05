import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { chooseViewportAction } from "./viewport-controls";
import type { ProjectionConstructWire, TextSentenceWire, TextTraceWire } from "../../apps/web/src/shared/api/localRuntimeApi";

test.use({ baseURL: process.env.OPM_PLACEMENT_BASE ?? "http://127.0.0.1:5177" });

test("现有案例每条 OPL 定位整组元素与下载，切图/只读/窄屏不写入", async ({ page }, info) => {
  const project = process.env.OPM_PLACEMENT_PROJECT; test.skip(!project, "需要明确本地案例项目");
  await page.setViewportSize({ width: 1600, height: 1100 }); page.setDefaultTimeout(15_000);
  const errors: string[] = [], writes: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", req => { if (/\/draft\/(commands|save|pin)$/.test(new URL(req.url()).pathname)) writes.push(req.url()); });
  const models = (await (await page.request.get(`/api/v1/projects/${project}/models?request_id=opl.e2e.models`)).json()).data as Array<{ model_id: string; name: string }>;
  let sentenceCount = 0, contextCount = 0, customerTextContext = "";
  for (const model of models.filter(item => /客户演示|工具校验-(PROC|CTRL|STRUCT|NEG)$/.test(item.name))) {
    const url = `/projects/${project}/models/${model.model_id}/workbench`;
    await open(page, url);
    const contextIds = await page.getByTestId("opd-navigator").locator('[data-testid^="p03-context-"]').evaluateAll(items => items.map(item => item.getAttribute("data-testid")!.slice("p03-context-".length)));
    for (const context of contextIds) {
      const snapshot = await open(page, `${url}?context=${context}`); contextCount++;
      const { constructs, sentences, traces } = snapshot;
      const token = await page.getByTestId("hs-draft-identity").innerText();
      await expect(page.locator('[data-opm-text-highlighted="true"]')).toHaveCount(0);
      if (!sentences.length) { await expect(page.getByTestId("p03-opl-export")).toBeDisabled(); continue; }
      if (model.name.includes("客户演示")) customerTextContext = context;
      await chooseViewportAction(page, "fit");
      for (const sentence of sentences) {
        const trace = traces.find(item => item.sentence_id === sentence.sentence_id)!;
        expect(trace).toBeDefined();
        const nodes = constructs.filter(item => /NODE$/.test(item.construct_role));
        const ids = new Set(nodes.filter(item => trace.occurrence_ids.includes(item.occurrence_id)).map(item => item.target_id));
        for (const id of ids) { const owner = nodes.find(item => item.target_id === id)?.owner_id; if (owner) ids.add(owner); }
        const line = page.getByTestId("p03-opl-sentence").filter({ hasText: sentence.text }).first();
        await line.click(); await expect(line).toHaveAttribute("aria-pressed", "true");
        await expect.poll(() => highlighted(page)).toEqual([...ids].sort());
        for (const id of ids) {
          const occurrence = nodes.find(item => item.target_id === id)!.occurrence_id;
          await expect(page.getByTestId(`p03-occurrence-${occurrence}`)).toHaveAttribute("fill", "#eaf3fc");
          await expect(page.getByTestId(`p03-occurrence-${occurrence}`)).toHaveAttribute("stroke", "#0b6bcb");
        }
        for (const fact of trace.fact_ids) {
          const paths = page.locator(`.x6-edge[data-cell-id="${fact}"] path[data-opm-selected], .x6-edge[data-cell-id^="${fact}."] path[data-opm-selected]`);
          expect(await paths.count()).toBeGreaterThan(0);
          for (const path of await paths.all()) await expect(path).toHaveAttribute("stroke", "#0b6bcb");
        }
        sentenceCount++;
        if (model.name.includes("客户演示") && /exhibits/.test(sentence.text)) {
          await page.screenshot({ path: info.outputPath("attribute-highlight-desktop.png") });
          const owner = nodes.find(item => item.label === "包裹")!;
          const toggle = page.getByTestId(`p03-feature-toggle-${owner.occurrence_id}`);
          await expect(toggle).toHaveAttribute("aria-label", "收起所属特征 / Collapse features");
          await toggle.click(); await expect(page.locator('[data-opm-text-highlighted="true"]')).toHaveCount(0);
          await expect(page.locator('.x6-node').filter({ hasText: "包裹重量" })).toHaveCount(0);
        }
      }
      await download(page, sentences, info.outputPath(`${model.model_id}-${context}.opl.txt`));
      // 空白取消定位，画布节点另选也清除整句高亮。
      await blank(page); await expect(page.locator('[data-opm-text-highlighted="true"]')).toHaveCount(0);
      await page.getByTestId("p03-opl-sentence").first().click();
      const node = page.locator(".x6-node").filter({ hasText: constructs.find(item => /^(OBJECT|PROCESS)_NODE$/.test(item.construct_role))!.label! }).first();
      await node.click({ position: { x: 20, y: 14 } });
      await expect(page.locator('[data-opm-text-highlighted="true"]')).toHaveCount(0);
      expect(await page.getByTestId("hs-draft-identity").innerText()).toBe(token);
    }
  }
  expect(contextCount).toBeGreaterThanOrEqual(7); expect(sentenceCount).toBeGreaterThanOrEqual(52);
  // 读取当前已保存历史版本，定位及导出保持可用。
  const customer = models.find(item => item.name.includes("客户演示"))!;
  const customerUrl = `/projects/${project}/models/${customer.model_id}/workbench`;
  const snapshot = await open(page, `${customerUrl}?context=${customerTextContext}`);
  const revision = await page.getByTestId("p03-version-select").locator('option:not([value="head"])').first().getAttribute("value");
  await page.goto(`${customerUrl}?context=${customerTextContext}&revision=${revision}`);
  await expect(page.getByTestId("p03-readonly-banner")).toBeVisible();
  await expect(page.getByTestId("p03-opl-export")).toBeEnabled();
  const stateLine = page.getByTestId("p03-opl-sentence").filter({ hasText: "复核 changes 包裹 from 待检 to 合格." });
  await stateLine.click(); await expect(page.locator('[data-opm-text-highlighted="true"]')).toHaveCount(4);
  await page.screenshot({ path: info.outputPath("state-highlight-readonly.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await chooseViewportAction(page, "fit"); await stateLine.click();
  await expect(page.locator('[data-opm-text-highlighted="true"]')).toHaveCount(4);
  const button = (await page.getByTestId("p03-opl-export").boundingBox())!;
  expect(button.x).toBeGreaterThanOrEqual(0); expect(button.x + button.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath("opl-mobile.png") });
  // 文件验证以只读面板当前内容为准，不能混入其他 OPD 或状态提示。
  const texts = await page.getByTestId("p03-opl-sentence").allTextContents();
  await download(page, texts.map((text, i) => ({ text, sentence_id: `s.${i}`, ordinal: i })), info.outputPath("readonly-mobile.opl.txt"));
  expect(writes).toEqual([]); expect(errors).toEqual([]);
  await info.attach("coverage", { body: JSON.stringify({ contextCount, sentenceCount, writes: writes.length, pageerrors: errors.length, initialSentences: snapshot.sentences.length }), contentType: "application/json" });
});

test("新建画布实际连接后可整句定位、取消与导出", async ({ page }, info) => {
  const project = process.env.OPM_PLACEMENT_PROJECT; test.skip(!project, "需要明确测试项目");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/projects/${project}`);
  await page.getByTestId("p02-create-model").click(); await page.getByTestId("ov02-model-name").fill(`OPL面板验证-${Date.now()}`);
  await page.getByRole("button", { name: "创建并打开工作台", exact: true }).click(); await expect(page.getByTestId("hs-save")).toBeEnabled();
  const model = new URL(page.url()).pathname.split("/models/")[1]!.split("/")[0]!;
  try {
    await expect(page.getByTestId("p03-opl-export")).toBeDisabled();
    await edit(page, () => page.getByTestId("p03-tool-object").click());
    await edit(page, () => page.getByTestId("p03-tool-process").click());
    await page.getByTestId("p03-relation-quick-option-CAP-ISO-PROC-001").click();
    await edit(page, async () => {
      const a = (await page.locator('.x6-node').filter({ hasText: "Object 1" }).boundingBox())!;
      const b = (await page.locator('.x6-node').filter({ hasText: "Process 1" }).boundingBox())!;
      await page.mouse.move(a.x + 20, a.y + 20); await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 }); await page.mouse.up();
    });
    await page.getByTestId("p03-tool-select").click();
    const line = page.getByTestId("p03-opl-sentence"); await expect(line).toHaveText("Process 1 consumes Object 1.");
    const token = await page.getByTestId("hs-draft-identity").innerText();
    await line.click(); await expect(page.locator('[data-opm-text-highlighted="true"]')).toHaveCount(2);
    await expect(page.locator('.x6-edge path[data-opm-selected="true"]')).toHaveCount(1);
    await download(page, [{ text: "Process 1 consumes Object 1.", sentence_id: "s", ordinal: 0 }], info.outputPath("new-model.opl.txt"));
    await blank(page); await expect(page.locator('[data-opm-text-highlighted="true"]')).toHaveCount(0);
    expect(await page.getByTestId("hs-draft-identity").innerText()).toBe(token);
  } finally {
    await page.goto(`/projects/${project}`); await page.getByTestId(`p02-trash-${model}`).click();
    await page.getByTestId("p02-lifecycle-confirm").click(); await expect(page.getByTestId("p02-lifecycle-dialog")).not.toBeVisible();
  }
});

async function open(page: Page, url: string) {
  const projection = page.waitForResponse(res => res.url().endsWith('/draft/projection') && res.status() === 200);
  const text = page.waitForResponse(res => res.url().endsWith('/draft/text') && res.status() === 200);
  await page.goto(url); const p = (await (await projection).json()).data; const t = (await (await text).json()).data;
  await expect(page.getByTestId("hs-save")).toBeEnabled();
  await expect(page.getByTestId("p03-opl-sentence")).toHaveCount(t.sentences.length);
  return { constructs: p.constructs as ProjectionConstructWire[], sentences: t.sentences as TextSentenceWire[], traces: t.traces as TextTraceWire[] };
}
async function highlighted(page: Page) {
  return page.locator('[data-opm-text-highlighted="true"]').evaluateAll(items => items.map(item => item.closest('.x6-node')!.getAttribute('data-cell-id')!).sort());
}
async function blank(page: Page) {
  const box = (await page.locator('.canvas-frame').boundingBox())!; await page.mouse.click(box.x + 18, box.y + 18);
  await expect(page.locator('.x6-edge path[data-opm-selected="true"]')).toHaveCount(0);
}
async function download(page: Page, sentences: TextSentenceWire[], path: string) {
  const event = page.waitForEvent("download"); await page.getByTestId("p03-opl-export").click(); const file = await event;
  expect(file.suggestedFilename()).toMatch(/\.opl\.txt$/); await file.saveAs(path);
  expect(await readFile(path, "utf8")).toBe(sentences.map(line => line.text).join("\n") + "\n");
}
async function edit(page: Page, action: () => Promise<unknown>) {
  const token = await page.getByTestId("hs-draft-identity").innerText(); await action();
  await expect(page.getByTestId("hs-draft-identity")).not.toHaveText(token); await expect(page.getByTestId("hs-save")).toBeEnabled();
}
