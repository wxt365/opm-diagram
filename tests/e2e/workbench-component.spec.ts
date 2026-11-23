import { expect, test } from "@playwright/test";

test("常驻滚动条下小数尺寸空画布保持稳定且小视口仍可滚动", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.addStyleTag({ content: "::-webkit-scrollbar { width: 15px; height: 15px; } ::-webkit-scrollbar-thumb { background: #999; }" });
  await page.evaluate(() => {
    const demo = (window as unknown as { workbenchExample: { first: { setData: (data: unknown) => void } } }).workbenchExample;
    demo.first.setData({ diagrams: [{ id: "root", label: "SD", kind: "SYSTEM_DIAGRAM", depth: 0, nodes: [], relations: [] }] });
  });
  const first = page.locator("#first"), frame = first.locator(".canvas-frame");
  await expect(first.locator(".x6-node")).toHaveCount(0);
  for (const width of [1001.5, 998.25]) {
    await frame.evaluate((element, width) => {
      Object.assign((element as HTMLElement).style, { width: `${width}px`, height: "480.5px" });
    }, width);
    const samples = await frame.evaluate(element => new Promise<string[]>(resolve => {
      const samples: string[] = [];
      function sample() {
        const host = element.querySelector<HTMLElement>(".opd-canvas-host")!;
        const canvas = host.querySelector<HTMLElement>(".opd-canvas")!;
        samples.push(JSON.stringify([element.clientWidth, element.clientHeight, element.scrollWidth, element.scrollHeight,
          host.getBoundingClientRect().width, host.getBoundingClientRect().height, canvas.style.width, canvas.style.height]));
        if (samples.length < 100) requestAnimationFrame(sample); else resolve(samples.slice(40));
      }
      requestAnimationFrame(sample);
    }));
    expect(new Set(samples).size).toBe(1);
    expect(await frame.evaluate(element => {
      const host = element.querySelector(".opd-canvas-host")!.getBoundingClientRect();
      const canvas = element.querySelector(".opd-canvas")!.getBoundingClientRect();
      return { widthFits: canvas.width <= host.width, heightFits: canvas.height <= host.height };
    })).toEqual({ widthFits: true, heightFits: true });
    expect(await frame.evaluate(element => ({ horizontal: element.scrollWidth > element.clientWidth,
      vertical: element.scrollHeight > element.clientHeight }))).toEqual({ horizontal: false, vertical: false });
  }
  await frame.evaluate(element => { Object.assign((element as HTMLElement).style, { width: "400px", height: "240px" }); });
  expect(await frame.evaluate(element => {
    element.scrollLeft = 200; element.scrollTop = 100;
    return { horizontal: element.scrollWidth > element.clientWidth, vertical: element.scrollHeight > element.clientHeight,
      moved: element.scrollLeft > 0 && element.scrollTop > 0 };
  })).toEqual({ horizontal: true, vertical: true, moved: true });
  expect(errors).toEqual([]);
});

test("snapshot method panel stays offline when opened, refreshed and reopened", async ({ page }) => {
  const requests: string[] = [], errors: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const first = page.locator("#first");
  await first.getByTestId("p03-tab-method").click();
  await expect(first.getByTestId("p03-method-panel")).toBeVisible();
  await first.getByTestId("p03-method-refresh").click();
  await first.getByTestId("p03-tab-method").click();
  await first.getByTestId("p03-tab-method").click();
  await expect(first.getByTestId("p03-method-panel")).toBeVisible();
  await expect(first.locator(".method-error")).toHaveCount(0);
  expect(requests).toEqual([]); expect(errors).toEqual([]);
});

test("imported relative state coordinates load inside each owner without auto-layout", async ({ page }) => {
  const errors: string[] = [], requests: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(request.url()); });
  await page.goto("/");
  await page.evaluate(() => {
    const demo = (window as unknown as { workbenchExample: { first: { setData: (data: unknown) => void } } }).workbenchExample;
    const common = { valueDomain: "", visibility: "public", multiplicity: "1", architectureLayer: "产品", occurrenceRole: "owned" };
    demo.first.setData({ diagrams: [{ id: "root", label: "SD", kind: "SYSTEM_DIAGRAM", depth: 0, relations: [], nodes: [
      ...[0, 1].map(index => ({ ...common, id: `owner${index}`, occurrenceId: `occ.owner${index}`, kind: "object", label: "开题是否通过并确认完成？", x: 84, y: 334 + index * 308, width: 280, height: 96 })),
      ...[0, 1].flatMap(index => [0, 1].map(state => ({ ...common, id: `s${index}.${state}`, occurrenceId: `occ.s${index}.${state}`, kind: "state", ownerId: `owner${index}`, label: state ? "不通过" : "通过", x: 12 + state * 128, y: 50, width: 116, height: 28 }))),
    ] }] });
  });
  const first = page.locator("#first");
  await expect(first.locator(".x6-node")).toHaveCount(6);
  for (const index of [0, 1]) {
    await expect(first.getByTestId(`p03-occurrence-occ.owner${index}`)).toHaveAttribute("height", "96");
    for (const state of [0, 1]) {
      const actual = await first.getByTestId(`p03-occurrence-occ.s${index}.${state}`).locator("..").evaluate(element => {
        const matrix = (element as unknown as SVGGraphicsElement).transform.baseVal.consolidate()!.matrix;
        return { x: matrix.e, y: matrix.f };
      });
      expect(actual).toEqual({ x: 92 + state * 124, y: 362 + index * 308 });
    }
  }
  expect(requests).toEqual([]); expect(errors).toEqual([]);
});

test("state labels wrap completely and repeated container growth keeps one feature connector", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  for (let step = 0; step < 8; step++) {
    await page.evaluate(index => {
      const demo = (window as unknown as { workbenchExample: { first: { setData: (data: unknown) => void } } }).workbenchExample;
      const common = { valueDomain: "", visibility: "public", multiplicity: "1", architectureLayer: "产品", occurrenceRole: "owned" };
      demo.first.setData({ diagrams: [{ id: "root", label: "SD", kind: "SYSTEM_DIAGRAM", depth: 0, relations: [], nodes: [
        { ...common, id: "owner", occurrenceId: "occ.owner", kind: "object", label: "咖啡豆", x: 60, y: 80, width: 224, height: 120 + index * 16 },
        { ...common, id: "s", occurrenceId: "occ.s", kind: "state", ownerId: "owner", label: "已经完成烘焙并且检验合格等待出库的咖啡豆", x: 68, y: 108, width: 208, height: 44, stateRoles: ["FINAL"] },
        { ...common, id: "feature", occurrenceId: "occ.feature", kind: "attribute", ownerId: "owner", label: "烘焙程度", x: 340, y: 220 + index * 16, width: 160, height: 72 },
      ] }] });
    }, step);
    const first = page.locator("#first");
    await expect(first.getByTestId("p03-occurrence-occ.owner")).toHaveAttribute("height", String(120 + step * 16));
    const state = first.getByTestId("p03-occurrence-occ.s").locator("..");
    const label = state.locator("text").first();
    await expect(label.locator("tspan.v-line")).toHaveCount(2);
    await expect(label).toHaveText("已经完成烘焙并且检验合格等待出库的咖啡豆");
    expect(await label.evaluate(element => {
      const box = (element as SVGGraphicsElement).getBBox();
      const body = element.parentElement!.querySelector('rect')!.getBBox();
      const matrix = (element as SVGGraphicsElement).transform.baseVal.consolidate()!.matrix;
      return box.x + matrix.e >= body.x && box.x + box.width + matrix.e <= body.x + body.width
        && box.y + matrix.f >= body.y && box.y + box.height + matrix.f <= body.y + body.height;
    })).toBe(true);
    await expect(first.locator('[data-cell-id="feature.owner-group.owner.characterization.junction"]')).toHaveCount(1);
    await expect(first.locator('[data-cell-id="feature.owner-group.owner.characterization.member.feature"]')).toHaveCount(1);
    await expect(first.locator('[data-cell-id="state.final-outline.s"] rect')).toHaveAttribute("height", "38");
  }
  expect(errors).toEqual([]);
});

test("blank panning survives existing text selection and repeated single drags", async ({ page }) => {
  const errors: string[] = [], apiRequests: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
  await page.goto("/");
  await page.locator(".examples").evaluate(element => { (element as HTMLElement).style.gridTemplateColumns = "1fr"; });
  await page.locator("#first").evaluate(element => { element.style.height = "1100px"; });
  const first = page.locator("#first"), canvas = first.getByTestId("p03-canvas");
  await expect(first.locator(".x6-node")).toHaveCount(2);
  await canvas.evaluate(element => {
    element.addEventListener("dragstart", () => { element.setAttribute("data-native-drag-started", "true"); });
    element.addEventListener("pointercancel", () => { element.setAttribute("data-pan-cancelled", "true"); });
  });
  const viewport = first.locator(".x6-graph-svg-viewport");
  for (const tool of ["select", "pan", "select"]) {
    await first.getByTestId(`p03-tool-${tool}`).click();
    await canvas.evaluate(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      const bounds = (await canvas.boundingBox())!;
      const before = await viewport.evaluate(element => {
        const matrix = new DOMMatrix(element.getAttribute("transform") ?? undefined);
        return { x: matrix.e, y: matrix.f };
      });
      await page.mouse.move(bounds.x + 12, bounds.y + 12); await page.mouse.down();
      await page.mouse.move(bounds.x + 44, bounds.y + 28, { steps: 10 }); await page.mouse.up();
      const after = await viewport.evaluate(element => {
        const matrix = new DOMMatrix(element.getAttribute("transform") ?? undefined);
        return { x: matrix.e, y: matrix.f };
      });
      expect(after.x - before.x).toBeCloseTo(32, 0); expect(after.y - before.y).toBeCloseTo(16, 0);
      await expect(canvas).not.toHaveAttribute("data-pan-cancelled", "true");
    }
  }
  await expect(canvas).toHaveClass(/\bx6-graph\b/);
  await expect(canvas).not.toHaveAttribute("data-native-drag-started", "true");
  // Browsers may attempt native dragging of an existing selection; the canvas must cancel it.
  expect(await canvas.evaluate(element => element.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true })))).toBe(false);
  await first.locator(".x6-node").filter({ hasText: "原料 A" }).click();
  await expect(page.locator("#selection")).toHaveText("第一实例：object");
  await canvas.click({ position: { x: 12, y: 12 } });
  await expect(page.locator("#selection")).toHaveText("第一实例：");
  expect(apiRequests).toEqual([]); expect(errors).toEqual([]);
});

test("built package renders real X6 without host services and isolates instances", async ({ page }) => {
  const errors: string[] = [], apiRequests: string[] = [];
  page.on("pageerror", error => { errors.push(error.message); console.error(error.stack); });
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
  await page.goto("/");
  const first = page.locator("#first"), second = page.locator("#second");
  await expect(first.locator(".x6-node")).toHaveCount(2);
  await expect(second.locator(".x6-node")).toHaveCount(2);
  await expect(first.locator(".workbench-header")).toHaveCount(0);
  await expect(second.locator(".workbench-header")).toContainText("第二模型");
  await expect(second.getByTestId("p03-project-name")).toHaveText("项目 / 宿主项目");
  await expect(second.locator(".profile-tag")).toHaveCount(0);
  await expect(second.getByTestId("hs-draft-identity")).toHaveCount(0);
  await expect(second.getByTestId("p03-version-select")).toHaveCount(0);
  await page.evaluate(() => {
    const demo = (window as unknown as { workbenchExample: { second: { setOption: (option: Record<string, unknown>) => void } } }).workbenchExample;
    demo.second.setOption({ showProfile: true, showVersionControls: true });
  });
  await expect(second.locator(".profile-tag")).toHaveText("profile.test 0.2.0");
  await expect(second.getByTestId("p03-version-select")).toHaveCount(1);
  await page.evaluate(() => {
    const demo = (window as unknown as { workbenchExample: { second: { setOption: (option: Record<string, unknown>) => void } } }).workbenchExample;
    demo.second.setOption({ showProfile: false, showVersionControls: false });
  });
  await expect(page.locator("#replace")).toHaveCSS("background-color", "rgb(237, 119, 155)");
  const firstId = await first.getByTestId("left-tab-navigation").getAttribute("id");
  expect(firstId).not.toBe(await second.getByTestId("left-tab-navigation").getAttribute("id"));
  await first.locator(".x6-node").filter({ hasText: "原料 A" }).click();
  await expect(page.locator("#selection")).toHaveText("第一实例：object");
  await first.getByTestId("p03-context-child").click();
  await expect(first.locator(".x6-node")).toHaveCount(0);
  await expect(second.locator(".x6-node")).toHaveCount(2);
  await page.locator("#replace").click();
  await first.getByTestId("p03-context-root").click();
  await expect(first.locator(".x6-node").filter({ hasText: "替换后的原料" })).toHaveCount(1);
  await page.locator("#destroy").click();
  await expect(first.locator(".opm-workbench")).toHaveCount(0);
  await second.locator(".x6-node").filter({ hasText: "原料 B" }).click();
  await expect(page.locator("#selection")).toHaveText("第二实例：object");
  await page.keyboard.press("Delete");
  await expect(second.locator(".x6-node")).toHaveCount(2);
  expect(apiRequests).toEqual([]); expect(errors).toEqual([]);
});
