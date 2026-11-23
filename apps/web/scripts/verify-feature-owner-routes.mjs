// Isolated Vue/X6 + real layout store; never opens a user model.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const harness = `
import {createApp,h,reactive,ref,computed} from 'vue';
import {Graph} from '@antv/x6';
import OpdCanvas from '/src/modules/workbench/OpdCanvas.vue';
import {createWorkbenchLayout} from '/src/stores/workbench/workbenchLayout.ts';
import {createWorkbenchState} from '/src/stores/workbench/workbenchState.ts';
import '/src/shared/styles/workbench-canvas.css';
const node=(id,kind,x,y,ownerId)=>({id,kind,x,y,ownerId,occurrenceId:'occ.'+id,label:id,
  valueDomain:'',visibility:'public',multiplicity:'1',architectureLayer:'任务',occurrenceRole:'owned'});
const w=createWorkbenchState();w.resourceState='ready';
w.nodes=JSON.parse(sessionStorage.getItem('owner-draft')||'null')||[
  node('object','object',80,180),node('attribute','attribute',430,260,'object'),
  node('attribute2','attribute',430,410,'object'),node('process','process',800,180),node('operation','operation',1110,350,'process')];
w.relations=[];
const state=reactive({readonly:false,zoom:100,layoutPreview:false,interactionTool:'select'}),selectedIds=ref([]);
const fixture=window.__ownerFixture={w,state,changes:[],batches:[]};
const layout=createWorkbenchLayout({workbench:w,draftToken:ref({}),isReadonly:computed(()=>state.readonly),selectedIds,
  projectId:ref('fixture'),modelId:ref('fixture'),editingIdentity:computed(()=> 'fixture'),
  relationCandidate:{phase:'idle'},controlCandidate:{phase:'idle'},structuralUpdateCandidate:{phase:'idle'},
  getLoadSequence:()=>1,hasDraftSession:()=>true,canEdit:()=>true,saving:ref(false),block:()=>{},
  execute:async command=>{fixture.batches.push(JSON.parse(JSON.stringify(command)));sessionStorage.setItem('owner-draft',JSON.stringify(w.nodes));return true}});
fixture.layout=layout;
const addEdge=Graph.prototype.addEdge;
Graph.prototype.addEdge=function(...args){fixture.graph=this;return addEdge.apply(this,args)};
fixture.path=id=>fixture.graph.findViewByCell(fixture.graph.getCellById(id)).getConnectionPathData();
fixture.point=(id,ratio=0.5)=>{const p=fixture.graph.findViewByCell(fixture.graph.getCellById(id)).getPointAtRatio(ratio);
  const c=fixture.graph.localToClient(p);return{x:c.x,y:c.y}};
createApp({setup(){return()=>h('div',[
 h('button',{'data-testid':'save',onClick:()=>layout.flushLayouts()},'保存'),
 h('div',{style:'width:1360px;height:770px;margin:24px'},[h(OpdCanvas,{...state,nodes:w.nodes,relations:w.relations,
  selectedId:w.selectedId,selectedIds:selectedIds.value,
  onSelect:id=>{w.selectedId=id;selectedIds.value=[id]},onSelection:ids=>{selectedIds.value=ids;w.selectedId=ids.at(-1)||''},
  onViewportZoom:zoom=>{state.zoom=zoom},onMoveBatch:layout.moveElements,
  onRouteChange:(id,route)=>{fixture.changes.push(JSON.parse(JSON.stringify({id,route})));layout.editRelationRoute(id,route)}
 })])])}}).mount('#app');
`;
const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
  server: { host: "127.0.0.1", port: 3189, strictPort: true },
  plugins: [{ name: "owner-route-browser-check",
    configureServer(vite) { vite.middlewares.use((req, res, next) => {
      if (req.url !== "/__owner_check") return next();
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end('<html><body style="margin:0"><div id="app"></div><script type="module" src="/__owner_harness.ts"></script></body></html>');
    }); },
    resolveId(id) { if (id === "/__owner_harness.ts") return "\0owner-check"; },
    load(id) { if (id === "\0owner-check") return harness; },
  }],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1480, height: 940 } }), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const group = "feature.owner-group.object.characterization", branch = group + ".member.attribute";
  const operation = "feature.owner-group.process.composition.member.operation";
  async function toggle(id) { await page.getByTestId('p03-feature-toggle-occ.' + id).click(); await settle(); }
  async function load() {
    await page.goto("http://127.0.0.1:3189/__owner_check");
    await page.getByTestId("p03-feature-toggle-occ.object").waitFor(); await toggle("object"); await toggle("process");
  }
  async function select(id, ratio = 0.5) {
    const point = await page.evaluate(({id,ratio}) => {
      for (const r of [ratio,.15,.25,.75,.9]) {
        const point=window.__ownerFixture.point(id,r);
        if(document.elementFromPoint(point.x,point.y)?.closest('.x6-edge')?.getAttribute('data-cell-id')===id)return point;
      }
      throw new Error('No exposed point on '+id);
    }, {id,ratio});
    await page.mouse.click(point.x,point.y); await page.getByTestId("p03-route-toolbar").waitFor(); await settle();
  }
  async function dragControl(dx,dy) {
    const control=page.getByTestId('p03-curve-handle').or(page.locator('.x6-edge-tool-vertex')).first();
    const box=await control.boundingBox();assert(box);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+dx,box.y+box.height/2+dy,{steps:8});await page.mouse.up();await settle();
  }
  await load();
  const original = await page.evaluate(id=>window.__ownerFixture.path(id),branch);
  await select(branch);
  assert.equal(await page.evaluate(()=>window.__ownerFixture.changes.length),0);
  await dragControl(55,70);
  const edited = await page.evaluate(id=>({path:window.__ownerFixture.path(id),change:window.__ownerFixture.changes.at(-1),nodes:window.__ownerFixture.w.nodes}),branch);
  assert.notEqual(edited.path,original);assert.equal(edited.change.id,'occ.attribute');assert.equal(edited.change.route.segment,'feature.owner');
  assert.deepEqual(edited.nodes.find(n=>n.id==='attribute2').edgeRoutes,undefined);
  // A selected ownership line must not delete its owner or feature.
  await page.keyboard.press('Delete');assert.equal(await page.evaluate(()=>window.__ownerFixture.w.nodes.length),5);
  await page.getByTestId('save').click();
  assert.equal(await page.evaluate(()=>window.__ownerFixture.batches[0].payload.layouts[0].occurrence_id),'occ.attribute');
  await load();await select(branch);
  assert.deepEqual(await page.evaluate(()=>window.__ownerFixture.w.nodes.find(n=>n.id==='attribute').edgeRoutes),[edited.change.route]);
  await toggle('object');await toggle('object');await select(branch);
  assert.deepEqual(await page.evaluate(id=>window.__ownerFixture.graph.getCellById(id).getVertices().map(p=>({x:p.x,y:p.y})),branch),edited.change.route.points);
  await page.getByTestId('p03-route-toolbar').getByRole('button',{name:'恢复自动',exact:true}).click();await settle();
  assert.equal(await page.evaluate(()=>window.__ownerFixture.changes.at(-1).route.mode),'AUTO');
  // Shared root and operation branches use their own occurrence layouts.
  await select(group);await dragControl(0,-35);
  assert.equal(await page.evaluate(()=>window.__ownerFixture.changes.at(-1).id),'occ.object');
  assert.equal(await page.evaluate(()=>window.__ownerFixture.changes.at(-1).route.segment),'feature.characterization');
  await select(operation);await dragControl(35,50);
  assert.equal(await page.evaluate(()=>window.__ownerFixture.changes.at(-1).id),'occ.operation');
  // Drag the triangle itself; this edits owner layout, not its root/branch bends.
  const junctionId = group + '.junction';
  const junctionHandle = id => page.locator(`[data-testid="p03-junction-handle"][data-cell-id="${id}"]`);
  async function dragJunction(id, dx, dy, cancel = false) {
    const box = await junctionHandle(id).boundingBox(); assert(box);
    await page.mouse.move(box.x + box.width/2, box.y + box.height/2); await page.mouse.down();
    await page.mouse.move(box.x + box.width/2 + dx, box.y + box.height/2 + dy, {steps: 8});
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up(); await settle();
  }
  const junctionBefore = await page.evaluate(id => window.__ownerFixture.graph.getCellById(id).getPosition(), junctionId);
  let changeCount = await page.evaluate(()=>window.__ownerFixture.changes.length);
  await junctionHandle(junctionId).click(); await page.getByTestId('p03-junction-toolbar').waitFor();
  assert.equal(await page.evaluate(()=>window.__ownerFixture.changes.length),changeCount);
  await dragJunction(junctionId, 80, 60, true);
  assert.deepEqual(await page.evaluate(id=>window.__ownerFixture.graph.getCellById(id).getPosition(),junctionId),junctionBefore);
  assert.equal(await page.evaluate(()=>window.__ownerFixture.changes.length),changeCount);
  const branchBefore = await page.evaluate(id=>window.__ownerFixture.path(id),branch);
  await dragJunction(junctionId, 80, 60);
  assert.equal(await page.evaluate(()=>window.__ownerFixture.changes.length),changeCount+1);
  assert.notEqual(await page.evaluate(id=>window.__ownerFixture.path(id),branch),branchBefore);
  const junctionRoute = await page.evaluate(()=>window.__ownerFixture.changes.at(-1));
  assert.equal(junctionRoute.id,'occ.object');assert.equal(junctionRoute.route.segment,'feature.characterization.junction');
  await page.keyboard.press('Delete');assert.equal(await page.evaluate(()=>window.__ownerFixture.w.nodes.length),5);
  const junctionMoved = await page.evaluate(id=>window.__ownerFixture.graph.getCellById(id).getPosition(),junctionId);
  await page.getByTestId('save').click();await load();
  assert.deepEqual(await page.evaluate(id=>window.__ownerFixture.graph.getCellById(id).getPosition(),junctionId),junctionMoved);
  await toggle('object');await toggle('object');
  assert.deepEqual(await page.evaluate(id=>window.__ownerFixture.graph.getCellById(id).getPosition(),junctionId),junctionMoved);
  await junctionHandle(junctionId).click();
  await page.getByTestId('p03-junction-toolbar').getByRole('button',{name:'恢复自动位置',exact:true}).click();await settle();
  assert.deepEqual(await page.evaluate(id=>window.__ownerFixture.graph.getCellById(id).getPosition(),junctionId),junctionBefore);
  const operationJunction = 'feature.owner-group.process.composition.junction';
  await page.evaluate(()=>{window.__ownerFixture.state.zoom=75});await settle();
  await page.evaluate(()=>window.__ownerFixture.graph.translate(40,30));await settle();
  await dragJunction(operationJunction,-50,65);
  assert.equal(await page.evaluate(()=>window.__ownerFixture.changes.at(-1).route.segment),'feature.composition.junction');
  const processPoint = await page.evaluate(()=>window.__ownerFixture.changes.at(-1).route.points[0]);
  const processBefore = await page.evaluate(()=>JSON.parse(JSON.stringify(window.__ownerFixture.w.nodes.find(n=>n.id==='process'))));
  await page.evaluate(async node=>{await window.__ownerFixture.layout.moveElements([{occurrence_id:node.occurrenceId,layout:{x:node.x+40,y:node.y+30,width:180,height:72}}])},processBefore);await settle();
  assert.deepEqual(await page.evaluate(()=>window.__ownerFixture.w.nodes.find(n=>n.id==='process').edgeRoutes.find(r=>r.segment==='feature.composition.junction').points[0]),{x:processPoint.x+40,y:processPoint.y+30});
  await page.evaluate(()=>window.__ownerFixture.layout.undoLayout());await settle();
  assert.deepEqual(await page.evaluate(()=>window.__ownerFixture.w.nodes.find(n=>n.id==='process').edgeRoutes.find(r=>r.segment==='feature.composition.junction').points[0]),processPoint);
  const marker=page.locator(`[data-cell-id="${group}.junction.inner"]`);assert.equal(await marker.count(),1);
  const count=await page.evaluate(()=>window.__ownerFixture.changes.length);
  await page.evaluate(()=>{window.__ownerFixture.state.readonly=true});await settle();
  assert.equal(await page.getByTestId('p03-route-toolbar').count(),0);assert.equal(await page.getByTestId('p03-curve-handle').count(),0);
  assert.equal(await page.getByTestId('p03-junction-handle').count(),0);
  assert.equal(await page.evaluate(()=>window.__ownerFixture.changes.length),count);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({branchDrag:true,saveReload:true,foldReopen:true,reset:true,rootDrag:true,operationDrag:true,junctionDrag:true,junctionCancel:true,junctionSaveReload:true,junctionReset:true,junctionViewport:true,junctionOwnerMove:true,junctionUndo:true,markerPreserved:true,readonly:true,errors}));
} finally { await browser?.close(); await server.close(); }
