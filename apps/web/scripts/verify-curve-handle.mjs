// Real Vue/X6 interaction regression; uses an isolated model and session-only draft storage.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const harness = `
import {createApp,h,reactive} from 'vue';
import {Graph} from '@antv/x6';
import OpdCanvas from '/src/modules/workbench/OpdCanvas.vue';
import '/src/shared/styles/workbench-canvas.css';
const node=(id,kind,x,y)=>({id,kind,x,y,occurrenceId:'occ.'+id,label:id,
  valueDomain:'',visibility:'public',multiplicity:'1',architectureLayer:'任务',occurrenceRole:'owned'});
const relation={id:'relation',occurrenceId:'occ.relation',sourceId:'object',targetId:'process',
  sourceOccurrenceId:'occ.object',targetOccurrenceId:'occ.process',symbolRef:'symbol.link.consumption',
  layoutRef:'layout.relation',capabilityId:'CAP-ISO-PROC-001'};
const state=reactive({nodes:[node('object','object',100,160),node('process','process',740,280)],
  relations:[{...relation,edgeRoutes:JSON.parse(sessionStorage.getItem('curve-draft')||'[]')}],
  selectedId:'',zoom:100,readonly:false,layoutPreview:false,interactionTool:'select'});
const fixture=window.__curveFixture={state,changes:[]};
const addEdge=Graph.prototype.addEdge;
Graph.prototype.addEdge=function(...args){fixture.graph=this;return addEdge.apply(this,args)};
fixture.path=()=>fixture.graph.findViewByCell(fixture.graph.getCellById('relation')).getConnectionPathData();
fixture.vertices=()=>fixture.graph.getCellById('relation').getVertices().map(p=>({x:p.x,y:p.y}));
fixture.midpoint=()=>{const p=fixture.graph.findViewByCell(fixture.graph.getCellById('relation')).getPointAtRatio(0.5);
  const c=fixture.graph.localToClient(p);return {x:c.x,y:c.y}};
createApp({setup(){return ()=>h('div',[
  h('button',{'data-testid':'save',onClick:()=>sessionStorage.setItem('curve-draft',JSON.stringify(state.relations[0].edgeRoutes))},'保存草稿'),
  h('div',{style:'width:1260px;height:720px;margin:20px'},[h(OpdCanvas,{...state,
    onSelect:id=>{state.selectedId=id},onViewportZoom:zoom=>{state.zoom=zoom},
    onRouteChange:(id,route)=>{fixture.changes.push(JSON.parse(JSON.stringify({id,route})));
      state.relations=state.relations.map(r=>r.occurrenceId===id?{...r,edgeRoutes:[route]}:r)}
  })])])}}).mount('#app');
`;
const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
  server: { host: "127.0.0.1", port: 3188, strictPort: true },
  plugins: [{
    name: "curve-handle-browser-check",
    configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        if (req.url !== "/__curve_check") return next();
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end('<html><body style="margin:0"><div id="app"></div><script type="module" src="/__curve_harness.ts"></script></body></html>');
      });
    },
    resolveId(id) { if (id === "/__curve_harness.ts") return "\0curve-handle-check"; },
    load(id) { if (id === "\0curve-handle-check") return harness; },
  }],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  async function load() {
    await page.goto("http://127.0.0.1:3188/__curve_check");
    await page.waitForFunction(() => !!window.__curveFixture?.graph?.getCellById('relation'));
    await settle();
  }
  async function select() {
    const midpoint = await page.evaluate(() => window.__curveFixture.midpoint());
    await page.mouse.click(midpoint.x, midpoint.y);
    await page.getByTestId("p03-route-toolbar").waitFor();
    await settle();
  }
  const handle = page.getByTestId("p03-curve-handle");
  async function handleCenter() {
    const box = await handle.boundingBox();
    assert(box, "selected automatic curve must expose its handle");
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  await load();
  await select();
  await handle.waitFor();
  // Selection changes the stroke width and its endpoint trim, never route data.
  assert.deepEqual(await page.evaluate(() => ({ vertices: window.__curveFixture.vertices(), changes: window.__curveFixture.changes })), { vertices: [], changes: [] });
  const initial = await page.evaluate(() => window.__curveFixture.path());
  await handle.click();
  assert.equal(await page.evaluate(() => window.__curveFixture.changes.length), 0);

  // The handle stays on the real path after zoom and pan.
  await page.evaluate(() => { const f = window.__curveFixture; f.state.zoom = 135; });
  await settle();
  await page.evaluate(() => { const g = window.__curveFixture.graph, t = g.translate(); g.translate(t.tx + 30, t.ty + 45); });
  await settle();
  const positioned = await handleCenter(), midpoint = await page.evaluate(() => window.__curveFixture.midpoint());
  assert(Math.hypot(positioned.x - midpoint.x, positioned.y - midpoint.y) < 2);
  await page.mouse.move(positioned.x, positioned.y); await page.mouse.down();
  await page.mouse.move(positioned.x + 45, positioned.y + 75, { steps: 8 });
  assert.notEqual(await page.evaluate(() => window.__curveFixture.path()), initial);
  assert.equal(await page.evaluate(() => window.__curveFixture.changes.length), 0);
  await page.mouse.up();
  await page.waitForFunction(() => window.__curveFixture.changes.length === 1);
  await settle();
  const saved = await page.evaluate(() => ({ path: window.__curveFixture.path(), change: window.__curveFixture.changes[0] }));
  assert.equal(saved.change.id, "occ.relation");
  assert.equal(saved.change.route.mode, "MANUAL");
  assert.equal(saved.change.route.style, "CURVE");
  assert.equal(saved.change.route.points.length, 1);
  await page.getByTestId("save").click();
  await load(); await select();
  await page.waitForSelector(".x6-edge-tool-vertex");
  assert.equal(await page.evaluate(() => window.__curveFixture.path()), saved.path);
  assert.deepEqual(await page.evaluate(() => window.__curveFixture.vertices()), saved.change.route.points);
  assert.equal(await handle.count(), 0);

  // A reloaded manual point remains editable through the standard X6 vertex tool.
  const vertex = page.locator(".x6-edge-tool-vertex").first(), vb = await vertex.boundingBox();
  assert(vb);
  await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2); await page.mouse.down();
  await page.mouse.move(vb.x + vb.width / 2 + 20, vb.y + vb.height / 2 + 25, { steps: 5 }); await page.mouse.up();
  await page.waitForFunction(() => window.__curveFixture.changes.length === 1);
  assert.notDeepEqual(await page.evaluate(() => window.__curveFixture.vertices()), saved.change.route.points);
  await page.getByTestId("p03-route-toolbar").getByRole("button", { name: "恢复自动", exact: true }).click();
  await handle.waitFor();
  await settle();
  assert.equal(await page.evaluate(() => window.__curveFixture.changes.at(-1).route.mode), "AUTO");
  const automatic = await page.evaluate(() => window.__curveFixture.path());
  const beforeCancel = await page.evaluate(() => window.__curveFixture.changes.length);
  const point = await handleCenter();
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x, point.y + 60, { steps: 5 });
  await page.keyboard.press("Escape"); await page.mouse.up(); await settle();
  assert.equal(await page.evaluate(() => window.__curveFixture.path()), automatic);
  assert.equal(await page.evaluate(() => window.__curveFixture.changes.length), beforeCancel);

  for (const patch of [{ readonly: true }, { layoutPreview: true }, { interactionTool: "pan" }]) {
    await page.evaluate(p => Object.assign(window.__curveFixture.state, p), patch); await settle();
    assert.equal(await handle.count(), 0);
    await page.evaluate(() => Object.assign(window.__curveFixture.state, { readonly: false, layoutPreview: false, interactionTool: "select" }));
    await handle.waitFor();
  }
  // Selection changes must discard an unfinished preview too.
  const last = await handleCenter();
  await page.mouse.move(last.x, last.y); await page.mouse.down();
  await page.mouse.move(last.x + 20, last.y + 30);
  await page.evaluate(() => { window.__curveFixture.state.selectedId = "object"; }); await settle(); await page.mouse.up();
  assert.deepEqual(await page.evaluate(() => window.__curveFixture.vertices()), []);
  assert.equal(await page.evaluate(() => window.__curveFixture.changes.length), beforeCancel);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ selectionUnchanged: true, zoomAndPan: true, dragAndCommit: true, savedReload: true,
    nativePointDrag: true, resetAutomatic: true, escapeCancel: true, selectionCancel: true, readonlyAndPreview: true, errors }));
} finally {
  await browser?.close();
  await server.close();
}
