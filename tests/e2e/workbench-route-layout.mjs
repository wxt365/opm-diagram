// Runs against DraftBrowserFixtureTest's isolated runtime on 17851, never the user's model.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const backend = 'http://127.0.0.1:17851';
const base = `${backend}/api/v1/projects/project.draft.http/models/model.golden.proc`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const errors = [], commands = [], saveResponses = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.url().endsWith('/draft/commands')) commands.push(request.postDataJSON()); });
page.on('response', async response => { if (response.url().endsWith('/draft/save')) saveResponses.push({ status: response.status(), body: await response.json() }); });
await mkdir('.codex', { recursive: true });

async function mount(revision) {
  await page.goto('http://localhost:3000/route-layout-check');
  await page.evaluate(async revision => {
    const { init } = await import('/node_modules/@opm/workbench/index.js');
    window.routeCheck = init(document.getElementById('canvas'), { backendUrl: 'http://localhost:17851',
      binding: { projectId: 'project.draft.http', modelId: 'model.golden.proc' },
      context: { activeContextId: 'context.sd.root', ...(revision ? { revision } : {}) },
      projectNavigation: false, showHeader: true, showVersionControls: true });
  }, revision);
  await expect(page.locator('.x6-edge')).toHaveCount(1);
  if (!revision) await expect(page.getByTestId('hs-save')).toBeEnabled();
  await page.getByTestId('p03-tool-select').click();
  await page.evaluate(async () => { window.routeCheck.resize(); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
}
async function edgePoint(fraction = 0.5) {
  return page.locator('.x6-edge path[data-opm-capture-cell-id]').evaluate((element, fraction) => {
    const point = element.getPointAtLength(element.getTotalLength() * fraction);
    const client = point.matrixTransform(element.getScreenCTM());
    return { x: client.x, y: client.y };
  }, fraction);
}
async function clickEdge(button = 'left') {
  const point = await edgePoint(); await page.mouse.click(point.x, point.y, { button });
}
async function routeInProjection(revision) {
  const response = await fetch(`${base}/contexts/context.sd.root/projection?request_id=route-browser&revision=${revision}`);
  assert.equal(response.status, 200);
  return (await response.json()).data.constructs.find(item => item.occurrence_id === 'occurrence.fact').layout.edge_routes;
}
try {
  await page.route('http://localhost:3000/route-layout-check', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><link rel="stylesheet" href="/node_modules/@opm/workbench/style.css"><style>body{margin:0}#canvas{height:1100px}</style><div id="canvas"></div></html>' }));
  await mount();
  const beforeSelection = commands.length;
  await clickEdge();
  const toolbar = page.getByTestId('p03-route-toolbar');
  await expect(toolbar).toBeVisible();
  assert.equal(commands.length, beforeSelection, 'selecting an edge must not submit edits');
  await toolbar.getByRole('button', { name: '恢复自动', exact: true }).click();
  await toolbar.getByRole('button', { name: '曲线', exact: true }).click();
  await expect(page.getByTestId('opd-undo-layout')).toBeEnabled();
  await expect(page.locator('.x6-edge path[data-opm-capture-cell-id]')).toHaveAttribute('d', /^M [^LC]+ C [^LC]+$/);
  const curve = await page.locator('.x6-edge path[data-opm-capture-cell-id]').getAttribute('d');
  await page.getByTestId('opd-undo-layout').click();
  await expect(page.getByTestId('opd-redo-layout')).toBeEnabled();
  await page.getByTestId('opd-redo-layout').click();
  await expect(page.locator('.x6-edge path[data-opm-capture-cell-id]')).toHaveAttribute('d', curve);
  await clickEdge('right');
  await expect(page.getByTestId('p03-route-menu')).toBeVisible();
  await page.getByTestId('p03-route-menu').getByRole('button', { name: '添加控制点' }).click();
  const handles = page.locator('.x6-edge-tool-vertex');
  await expect(handles).toHaveCount(1);
  await handles.first().hover();
  const handle = await handles.first().boundingBox();
  const beforeDrag = Number(await handles.first().getAttribute('cy'));
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 100, { steps: 12 }); await page.mouse.up();
  await expect(handles).toHaveCount(1);
  await expect.poll(async () => Number(await handles.first().getAttribute('cy'))).toBeGreaterThan(beforeDrag + 60);
  const manual = await page.locator('.x6-edge path[data-opm-capture-cell-id]').getAttribute('d');
  assert.notEqual(manual, curve);
  await page.getByTestId('hs-save').click();
  await expect(page.getByTestId('hs-save-state')).toHaveText('已手动保存');
  assert.ok(saveResponses.every(item => item.status === 200), JSON.stringify(saveResponses));
  const revision = saveResponses.at(-1).body.revision_id;
  const persisted = await routeInProjection(revision);
  assert.equal(persisted[0].style, 'CURVE'); assert.equal(persisted[0].mode, 'MANUAL'); assert.equal(persisted[0].points.length, 1);
  await page.reload();
  // Reload the component page with the binding again (the route is deliberately a plain host).
  await mount();
  await clickEdge(); await expect(handles).toHaveCount(1);
  await expect(page.locator('.x6-edge path[data-opm-capture-cell-id]')).toHaveAttribute('d', manual);
  await handles.first().dblclick();
  await expect(handles).toHaveCount(0);
  await toolbar.getByRole('button', { name: '恢复自动', exact: true }).click();
  await page.getByTestId('hs-save').click();
  await expect(page.getByTestId('hs-save-state')).toHaveText('已手动保存');
  const reset = await routeInProjection(saveResponses.at(-1).body.revision_id);
  assert.deepEqual(reset, [{ segment: 'main', style: 'ROUNDED', mode: 'AUTO', points: [] }]);
  await mount(revision);
  await clickEdge();
  await expect(toolbar).toHaveCount(0); await expect(handles).toHaveCount(0); await expect(page.getByTestId('hs-save')).toHaveCount(0);
  const readonlyCommands = commands.length;
  await page.keyboard.press('Control+s');
  assert.equal(commands.length, readonlyCommands);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: '.codex/route-layout-browser.png' });
  const report = { checks: ['selection without edits', 'style', 'undo/redo', 'context menu add', 'vertex drag', 'save', 'reopen', 'vertex double-click delete', 'reset', 'readonly'], persisted, commands: commands.length, saves: saveResponses.length, errors };
  await writeFile('.codex/route-layout-browser-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  await page.screenshot({ path: '.codex/route-layout-browser-failed.png' });
  await writeFile('.codex/route-layout-browser-failed.html', await page.content());
  console.error(JSON.stringify({ errors, commands, saveResponses })); throw error;
} finally { await browser.close(); }
