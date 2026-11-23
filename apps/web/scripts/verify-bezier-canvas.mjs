// Browser regression fixture; does not load or change any business model.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const harness = `
import {Graph} from '@antv/x6';
import {routeRelations} from '/src/modules/workbench/opd/core/relation-routing.ts';
import {reconcileRelationRenderSpecs} from '/src/modules/workbench/opd/core/x6-relation-adapter.ts';
import {layoutParallelBinaryRelations} from '/src/modules/workbench/opd/core/parallel-relation-layout.ts';
const graph=new Graph({container:document.getElementById('canvas'),width:1480,height:900,
  background:{color:'#fafbfc'},grid:{size:20,visible:true},interacting:true,async:false});
let nodes=[
  {id:'a',label:'研究范围',kind:'object',x:80,y:150,width:160,height:72},
  {id:'b',label:'证据核验',kind:'process',x:490,y:270,width:180,height:100},
  {id:'c',label:'投资判断',kind:'object',x:1000,y:220,width:160,height:72},
  {id:'d',label:'行业事实',kind:'object',x:80,y:380,width:160,height:72},
  {id:'e',label:'审计记录',kind:'object',x:1000,y:460,width:160,height:72},
  {id:'obstacle',label:'中间业务对象',kind:'object',x:750,y:170,width:150,height:150},
  {id:'near',label:'相近节点',kind:'object',x:80,y:620,width:160,height:72},
  {id:'near2',label:'轻微弧度',kind:'object',x:280,y:620,width:160,height:72},
];
nodes.forEach(n=>graph.addNode({...n,shape:n.kind==='process'?'ellipse':'rect',attrs:{
  body:{stroke:n.kind==='process'?'#14b8a6':'#f28c28',strokeWidth:2,fill:'#fff',rx:8,ry:8},
  label:{text:n.label,fill:'#364152',fontSize:16}}}));
const pairs=[['a','b'],['d','b'],['a','c'],['b','c'],['b','e'],['c','b'],['near','near2']];
const specs=pairs.map(([source,target],i)=>({relationId:'r'+i,occurrenceId:'o'+i,primaryCellId:'r'+i,
  family:'PROCEDURAL',symbolId:'consumption',cells:[{kind:'edge',id:'r'+i,source,target,data:{},
  labels:i===2?[{position:0.5,text:'跨层联系',fontSize:12}]:[],line:{stroke:'#20242a',strokeWidth:2,
  targetMarker:{name:'classic',width:10,height:8,fill:'#fff',stroke:'#20242a'}}}]}));
let state=new Map();
function render(){
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const parallel=layoutParallelBinaryRelations(specs,id=>{const n=byId.get(id);return n&&{
    x:n.x+n.width/2,y:n.y+n.height/2,width:n.width,height:n.height};});
  const routed=routeRelations(parallel,[],nodes);
  state=reconcileRelationRenderSpecs(graph,state,routed);return routed;
}
const routed=render();
window.__bezierTest={graph,routed,move(id,x,y){
  nodes=nodes.map(n=>n.id===id?{...n,x,y}:n);graph.getCellById(id).position(x,y);return render();
}};
`;

const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
  server: { host: "127.0.0.1", port: 3187, strictPort: true },
  plugins: [{
    name: "bezier-browser-check",
    configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        if (req.url !== "/__bezier_check") return next();
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end('<html><body style="margin:0;font-family:Arial"><h2 style="margin:20px;color:#364152">OPM 曲线渲染验证</h2><div id="canvas"></div><script type="module" src="/__bezier_harness.ts"></script></body></html>');
      });
    },
    resolveId(id) { if (id === "/__bezier_harness.ts") return "\0bezier-check"; },
    load(id) { if (id === "\0bezier-check") return harness; },
  }],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1480, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:3187/__bezier_check");
  await page.waitForFunction(() => !!window.__bezierTest, {}, { timeout: 30000 });
  const result = await page.evaluate(() => {
    const { graph } = window.__bezierTest;
    const edges = graph.getEdges().map(edge => {
      const view = graph.findViewByCell(edge), el = view.container.querySelector('path[stroke="#8793a1"]');
      const marker = el?.getAttribute("marker-end"), markerId = marker?.match(/#([^)]*)/)?.[1];
      return { id: edge.id, connector: edge.getConnector().name, curved: (el?.getAttribute("d") ?? "").includes("C"),
        marker, orient: markerId ? document.getElementById(markerId)?.getAttribute("orient") : null, width: el?.getAttribute("stroke-width") };
    });
    const edge = graph.getCellById("r0"), before = graph.findViewByCell(edge).getConnectionPathData();
    window.__bezierTest.move("b", 490, 390);
    const after = graph.findViewByCell(edge).getConnectionPathData();
    window.__bezierTest.move("b", 490, 270);
    return { edges, moveUpdatesPath: before !== after };
  });
  if (process.env.CANVAS_SCREENSHOT) await page.screenshot({ path: process.env.CANVAS_SCREENSHOT, fullPage: true });
  console.log(JSON.stringify({ ...result, errors }));
  assert.deepEqual(errors, []);
  assert.equal(result.edges.length, 7);
  assert(result.edges.every(edge => edge.curved && edge.marker && edge.orient === "auto" && edge.width === "1.35"));
  assert(result.moveUpdatesPath);
} finally {
  await browser?.close();
  await server.close();
}
