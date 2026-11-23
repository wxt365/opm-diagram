import { expect, test } from "@playwright/test";

test.use({ baseURL: process.env.OPM_GRAPH_BASE ?? "http://127.0.0.1:5173", ...(process.env.OPM_GRAPH_BROWSER ? { channel: process.env.OPM_GRAPH_BROWSER } : {}) });

test("真实模型图谱：生成、筛选、定位、历史只读和布局", async ({ page }, info) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  const failures: string[] = [], writes: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("request", request => { if (/\/draft\/(commands|save|pin)$/.test(new URL(request.url()).pathname)) writes.push(request.url()); });
  const projects = await (await page.request.get("/api/v1/projects?request_id=query.graph.e2e.projects")).json();
  let project = "", model = "";
  for (const item of projects.data.filter((entry: { project_id: string }) => !process.env.OPM_GRAPH_PROJECT || entry.project_id === process.env.OPM_GRAPH_PROJECT)) {
    const models = await (await page.request.get(`/api/v1/projects/${item.project_id}/models?request_id=query.graph.e2e.models&archive_state=ACTIVE`)).json();
    if (models.data?.length) { project = item.project_id; model = (models.data.find((entry: { name: string }) => entry.name.includes("[")) ?? models.data[0]).model_id; break; }
  }
  expect(project, "需要至少一个现有模型；测试不创建或修改用户模型").not.toBe("");
  await page.goto(`/projects/${project}/models/${model}/workbench`);
  await expect(page.getByTestId("editor-mode-graph")).toBeEnabled();
  const graphResponse = page.waitForResponse(response => response.url().endsWith("/graph-analysis") && response.request().method() === "POST");
  await page.getByTestId("editor-mode-graph").click();
  const response = await graphResponse; expect(response.status(), await response.text()).toBe(200);
  expect(response.request().postDataJSON().scope).toBe("MODEL");
  const data = await response.json(); expect(data.nodes.length).toBeGreaterThan(0); expect(data.source.scope).toBe("MODEL");
  const panel = page.getByTestId("graph-analysis-panel"); await expect(panel).toBeVisible();
  await expect(panel.locator(".x6-node")).toHaveCount(data.nodes.length);
  await expect(panel.locator(".graph-layout-status")).toHaveCount(0);
  await expect(panel.locator(".graph-view-tools button")).toHaveCount(3);
  expect(Number((await panel.getByTestId("p03-zoom-output").inputValue())?.replace("%", ""))).toBeGreaterThan(0);
  await panel.locator(".graph-tools-toggle").click();
  await expect(panel.locator(".graph-legend-controls")).not.toContainText(/Consumption|Result|Effect|Agent|Instrument|Tagged|Aggregation/);
  await page.screenshot({ path: info.outputPath("graph-analysis-spread.png") });
  await expect(panel.locator(".graph-layout-status")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("graph-analysis-circular.png") });
  for (let i = 0; i < 3; i++) await panel.getByRole("button", { name: "放大视图 / Zoom in", exact: true }).click();
  const beforeDrag = await panel.locator('.x6-node').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return `${box.x},${box.y}`; }));
  const dragPoint = await panel.locator('.x6-node').evaluateAll(nodes => {
    const viewport = document.querySelector('[data-testid="graph-analysis-canvas"]')!.getBoundingClientRect();
    for (const node of nodes) { const box = (node.querySelector('circle') ?? node).getBoundingClientRect();
      if (box.left > viewport.left + 80 && box.left < viewport.right - 160 && box.top > viewport.top + 60 && box.bottom < viewport.bottom - 100)
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    }
    return null;
  });
  expect(dragPoint).not.toBeNull();
  await page.mouse.move(dragPoint!.x, dragPoint!.y); await page.mouse.down();
  await page.mouse.move(dragPoint!.x + 70, dragPoint!.y + 35, { steps: 10 }); await page.mouse.up();
  await expect(panel.locator('.graph-layout-status')).toHaveCount(0, { timeout: 15000 });
  await expect.poll(async () => {
    const after = await panel.locator('.x6-node').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return `${box.x},${box.y}`; }));
    return after.filter((transform, i) => transform !== beforeDrag[i]).length;
  }).toBeGreaterThan(1);
  await page.screenshot({ path: info.outputPath('graph-analysis-force-directed.png') });
  const started = Date.now();
  await panel.getByLabel("图谱分析范围").selectOption("MODEL");
  await expect(panel.getByTestId("graph-refresh")).toHaveCount(0);
  await expect(panel.locator(".graph-layout-status")).toHaveCount(0);
  console.info(`Graph browser scope refresh ${Date.now() - started}ms`);
  await panel.getByLabel("搜索图谱节点").fill(data.nodes[0].label);
  await panel.locator(".graph-search-result").first().click();
  await expect(panel.getByLabel("图谱元素详情")).toBeVisible();
  await page.screenshot({ path: info.outputPath("graph-analysis-desktop.png") });
  if (data.nodes[0].source_refs.length) {
    await panel.locator(".graph-details .graph-source").first().click();
    await expect(page.getByTestId("editor-mode-opd")).toHaveAttribute("aria-selected", "true");
    await page.getByTestId("editor-mode-graph").click(); await expect(panel.getByLabel("搜索图谱节点")).toHaveValue(data.nodes[0].label);
  }
  await page.setViewportSize({ width: 650, height: 950 });
  await expect(panel.getByTestId("graph-analysis-canvas")).toBeVisible();
  await page.screenshot({ path: info.outputPath("graph-analysis-narrow.png") });
  await page.setViewportSize({ width: 1500, height: 1000 });
  const revision = await page.locator('[data-testid="hs-draft-identity"]').textContent(); expect(revision).toBeTruthy();
  const history = await (await page.request.get(`/api/v1/projects/${project}/models/${model}/revisions?request_id=query.graph.e2e.revisions`)).json();
  if (history.data?.length) {
    await page.goto(`/projects/${project}/models/${model}/workbench?revision=${history.data[0].revision_id}`);
    await expect(page.getByTestId("editor-mode-graph")).toBeEnabled();
    const historic = page.waitForResponse(r => /\/revisions\/[^/]+\/graph-analysis$/.test(r.url()));
    await page.getByTestId("editor-mode-graph").click(); expect((await historic).status()).toBe(200);
    await expect(page.getByTestId("graph-analysis-panel").locator(".x6-node").first()).toBeVisible();
  }
  // Synthetic response stresses rendering without creating database fixtures or editing user data.
  for (const [nodeCount, edgeCount] of [[300, 1000], [1000, 5000]]) {
    await page.route("**/graph-analysis", async route => {
      const input = route.request().postDataJSON();
      const nodes = Array.from({ length: nodeCount! }, (_, i) => ({ ...data.nodes[0], id: `node.synthetic.${i}`, label: `测试节点 ${i}`, kind: i % 2 ? "PROCESS" : "OBJECT", source_refs: [] }));
      const edges = Array.from({ length: edgeCount! }, (_, i) => ({ id: `edge.synthetic.${i}`, source: nodes[i % nodes.length]!.id, target: nodes[(i * 7 + 1) % nodes.length]!.id,
        relation_type: "TEST", label: "测试关系", direction: "DIRECTED", fact_id: `fact.synthetic.${i}`, group_id: `fact.synthetic.${i}`, derived: false, endpoints: [], source_refs: [] }));
      await route.fulfill({ json: { ...data, source: { ...data.source, request_id: input.request_id, context_id: input.context_id, scope: input.scope, draft_token: input.draft_token ?? null,
        revision_id: input.draft_token ? null : history.data[0].revision_id }, nodes, edges, relation_types: [{ id: "TEST", label: "测试关系", count: edgeCount }], warnings: [],
        statistics: { node_count: nodeCount, fact_count: edgeCount, derived_count: 0, edge_count: edgeCount, excluded_count: 0 } } });
    });
    const panel = page.getByTestId("graph-analysis-panel");
    const start = Date.now(); await panel.getByLabel("图谱分析范围").selectOption(nodeCount === 300 ? "CONTEXT" : "MODEL");
    await expect(panel.locator(".x6-node")).toHaveCount(nodeCount!, { timeout: 20000 });
    await expect(panel.locator(".x6-edge")).toHaveCount(edgeCount!, { timeout: 20000 });
    console.info(`Graph browser synthetic ${nodeCount}/${edgeCount} refresh-to-render ${Date.now() - start}ms`);
    const tools = panel.getByRole('button', { name: '展开或收起图谱工具', exact: true });
    if (await tools.getAttribute('aria-expanded') !== 'true') await tools.click();
    const filterStart = Date.now(); await panel.locator('button[data-kind="PROCESS"]').click();
    await expect(panel.locator(".x6-node")).toHaveCount(nodeCount! / 2, { timeout: 10000 });
    console.info(`Graph browser synthetic filter ${Date.now() - filterStart}ms`);
    await panel.locator('button[data-kind="PROCESS"]').click();
    await page.unroute("**/graph-analysis");
  }
  expect(writes).toEqual([]); expect(failures).toEqual([]);
});
