import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { canonicalizeJcs, sha256Jcs } from './canvas06-rfc8785.mjs';
import { startProductionWebServer } from './canvas06-e2e-production-web.mjs';

const ROLE_BY_TARGET_KIND = Object.freeze({ ELEMENT: 'ELEMENT_NODE', STATE: 'STATE_LABEL', FACT: 'FACT_EDGE' });
const VIEWPORTS = Object.freeze({ 'VP-1440X900': { width: 1440, height: 900 }, 'VP-1280X800': { width: 1280, height: 800 }, 'VP-390X844': { width: 390, height: 844 } });
const FIXED_FOCUS_TEST_IDS = Object.freeze({ 'P03-tool-relation-menu': 'p03-tool-relation-menu', 'P03-command-feedback': 'p03-command-feedback' });

/** Common 浏览器捕获的唯一 Projection normalizer。 */
export function normalizeCommonProjection({ subjectId, apiProjection, viewState, focusTargetId }) {
  if (!isObject(apiProjection) || !Array.isArray(apiProjection.constructs) || typeof apiProjection.context_id !== 'string') normalizedFailure('API Projection is invalid.');
  if (!isObject(viewState) || typeof subjectId !== 'string' || typeof focusTargetId !== 'string') normalizedFailure('Common view state is invalid.');
  const committed_cells = apiProjection.constructs.map(normalizeConstruct).sort((left, right) => byteCompare(left.cell_id, right.cell_id));
  const value = {
    projection_version: '0.1.0', subject_id: subjectId, read_revision: viewState.read_revision, context_id: apiProjection.context_id,
    committed_cells, transient_cells: viewState.transient_cells, selection: viewState.selection, panels: viewState.panels,
    relation_candidate: viewState.relation_candidate, catalog: viewState.catalog, finding: viewState.finding,
    feedback: viewState.feedback, focus_target_id: focusTargetId
  };
  if (!isProjectionState(value)) normalizedFailure('Normalized Projection state is invalid.');
  return Object.freeze(value);
}

export function commonProjectionSha256(value) { return sha256Jcs(value); }

/** 生产 Common capture 的唯一几何 preimage owner。 */
export function commonCellGeometryPreimage({ captureId, committedCells, transientCells }) {
  if (typeof captureId !== 'string' || !captureId) geometryFailure('Geometry capture identity is invalid.');
  return Object.freeze({
    schema_id: 'OPM-DEV-CANVAS-06-COMMON-VISUAL-CELL-GEOMETRY-001', schema_version: '0.1', capture_id: captureId,
    committed_cells: normalizeGeometryCells(committedCells, 'COMMITTED'), transient_cells: normalizeGeometryCells(transientCells, 'CANDIDATE')
  });
}

export function commonCellGeometrySha256(value) { return sha256Jcs(value); }

/** 03B Common 的唯一 Playwright callback。 */
export function createCommonBrowserCaptureCallback(options) {
  assertCallbackOptions(options);
  return async invocation => {
    assertInvocation(invocation);
    const viewport = VIEWPORTS[invocation.viewport_id];
    let web; let browser; let context; let page;
    try {
      web = await startProductionWebServer({ root: options.web_dist_root, host: '127.0.0.1', port: 0, runtimeOrigin: invocation.runtime_base_url });
      const { chromium } = await import('@playwright/test');
      browser = await chromium.launch({ executablePath: options.browser_executable, headless: true, args: options.environment_policy.launch_args });
      context = await browser.newContext({ viewport, locale: options.environment_policy.locale, timezoneId: options.environment_policy.timezone, colorScheme: options.environment_policy.color_scheme, reducedMotion: options.environment_policy.reduced_motion, deviceScaleFactor: options.environment_policy.device_scale_factor });
      page = await context.newPage();
      await page.goto(workbenchRoute(web.origin, invocation), { waitUntil: 'networkidle', timeout: 30000 });
      await uniqueVisible(page.getByTestId('p03-workbench'));
      await setZoom(page, invocation.zoom_id);
      const initialProjection = await fetchProjection(page, invocation);
      await executeSteps(page, invocation, initialProjection);
      const first = await readStableSnapshot(page, invocation);
      await quietWindow(page);
      const second = await readStableSnapshot(page, invocation);
      assertSameSnapshot(first, second);
      const focus = await focusLocator(page, invocation.focus_target_id, second.projection);
      await focus.scrollIntoViewIfNeeded();
      await quietWindow(page);
      const focused = await readStableSnapshot(page, invocation);
      assertSameSnapshot(second, focused);
      const pngPath = await freshPngPath(invocation.attempt_root);
      await page.screenshot({ path: pngPath, animations: options.environment_policy.screenshot_options.animations, caret: options.environment_policy.screenshot_options.caret, scale: options.environment_policy.screenshot_options.scale });
      const png = await readFile(pngPath);
      return Object.freeze({
        schema_id: 'OPM-DEV-CANVAS-06-COMMON-VISUAL-CAPTURE-OBSERVED-RESULT-001', schema_version: '0.1', result_version: '0.1.0', request_id: invocation.request_id, capture_id: invocation.capture_id, subject_id: invocation.subject_id, attempt_ordinal: invocation.attempt_ordinal,
        ui_setup_status: 'READY', stability_status: 'STABLE', png_byte_length: png.length, png_sha256: sha256(png), width: viewport.width, height: viewport.height,
        cell_geometry_sha256: focused.geometry_sha256, normalized_projection: focused.projection, projection_sha256: focused.projection_sha256, observed_cells: focused.observed_cells,
        focus_target_id: invocation.focus_target_id, focus_anchor: invocation.focus_anchor, fault_observation: faultObservation(invocation)
      });
    } catch (error) {
      if (error?.code === 'GOLDEN_COMMON_ADAPTER_INPUT_INVALID' || error?.code === 'GOLDEN_COMMON_NORMALIZED_PROJECTION_INVALID') throw error;
      uiFailure(error instanceof Error ? error.message : 'Common browser capture failed.');
    } finally {
      await page?.close().catch(() => undefined); await context?.close().catch(() => undefined); await browser?.close().catch(() => undefined); await web?.close().catch(() => undefined);
    }
  };
}

function normalizeConstruct(value) {
  if (!isObject(value) || typeof value.occurrence_id !== 'string' || typeof value.target_id !== 'string' || typeof value.target_kind !== 'string' || typeof value.capability_id !== 'string' || !isObject(value.layout)) normalizedFailure('Projection construct is incomplete.');
  const construct_role = ROLE_BY_TARGET_KIND[value.target_kind];
  if (!construct_role) normalizedFailure(`Projection target kind ${value.target_kind} is unsupported.`);
  const geometry = value.layout;
  if (!['x', 'y', 'width', 'height', 'z_order'].every(key => Number.isSafeInteger(geometry[key]))) normalizedFailure('Projection geometry is invalid.');
  if (!Array.isArray(value.state_roles) && value.target_kind === 'STATE') normalizedFailure('State roles are missing.');
  return { cell_id: value.occurrence_id, layer: 'COMMITTED', target_kind: value.target_kind, target_id: value.target_id, construct_role, geometry: { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height, z_order: geometry.z_order }, state_roles: value.target_kind === 'STATE' ? [...value.state_roles] : [], capability_id: value.capability_id };
}

function normalizeGeometryCells(value, layer) {
  if (!Array.isArray(value)) geometryFailure('Geometry cells are invalid.');
  const ids = new Set();
  const cells = value.map(cell => {
    if (!isObject(cell) || typeof cell.cell_id !== 'string' || !cell.cell_id || cell.layer !== layer || !isObject(cell.geometry_css_millipx)) geometryFailure('Geometry cell is incomplete.');
    if (ids.has(cell.cell_id)) geometryFailure('Geometry cell ID is duplicated.');
    ids.add(cell.cell_id);
    const geometry = cell.geometry_css_millipx;
    if (!['x', 'y', 'width', 'height'].every(key => Number.isSafeInteger(geometry[key])) || geometry.width < 0 || geometry.height < 0) geometryFailure('Geometry CSS millipixel value is invalid.');
    return { cell_id: cell.cell_id, layer, geometry_css_millipx: { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height } };
  });
  return cells.sort((left, right) => byteCompare(left.cell_id, right.cell_id));
}

function assertCallbackOptions(value) {
  if (!isObject(value) || !sameKeys(value, ['browser_executable', 'environment_policy', 'web_dist_root']) || typeof value.browser_executable !== 'string' || !value.browser_executable.startsWith('/') || typeof value.web_dist_root !== 'string' || !value.web_dist_root.startsWith('/') || !isObject(value.environment_policy)) adapterInput('Common browser callback options are invalid.');
  const policy = value.environment_policy;
  if (!Array.isArray(policy.launch_args) || typeof policy.locale !== 'string' || typeof policy.timezone !== 'string' || !['light', 'dark'].includes(policy.color_scheme) || !['reduce', 'no-preference'].includes(policy.reduced_motion) || !Number.isSafeInteger(policy.device_scale_factor) || policy.device_scale_factor < 1 || !isObject(policy.screenshot_options) || !['disabled', 'allow'].includes(policy.screenshot_options.animations) || !['hide', 'initial'].includes(policy.screenshot_options.caret) || !['css', 'device'].includes(policy.screenshot_options.scale)) adapterInput('Common browser environment policy is invalid.');
}

function assertInvocation(value) {
  if (!isObject(value) || value.schema_id !== 'OPM-DEV-CANVAS-06-COMMON-VISUAL-CAPTURE-INVOCATION-001' || value.schema_version !== '0.2' || !VIEWPORTS[value.viewport_id] || !['Z-025', 'Z-100', 'Z-400'].includes(value.zoom_id) || !Array.isArray(value.capture_setup?.steps) || typeof value.runtime_base_url !== 'string' || !value.runtime_base_url.startsWith('http://127.0.0.1:') || typeof value.attempt_root !== 'string' || !value.attempt_root.startsWith('/') || !isObject(value.expected_projection)) adapterInput('Common Capture Invocation is invalid.');
}

function workbenchRoute(webOrigin, invocation) { return `${webOrigin}/projects/${encodeURIComponent(invocation.project_id)}/models/${encodeURIComponent(invocation.model_id)}/workbench?context=${encodeURIComponent(invocation.context_id)}&revision=${encodeURIComponent(invocation.expected_revision)}`; }

async function executeSteps(page, invocation, initialProjection) {
  for (const step of invocation.capture_setup.steps) {
    switch (step.step_type) {
      case 'SELECT_OCCURRENCE': await clickTestId(page, `p03-occurrence-${step.occurrence_id}`); break;
      case 'SELECT_RELATION_TOOL': if (step.capability_id !== 'CAP-ISO-PROC-001') uiFailure('Relation tool capability is unsupported.'); await clickTestId(page, 'p03-tool-procedural-relation'); break;
      case 'SELECT_ENDPOINT': await clickTestId(page, `p03-occurrence-${occurrenceForTarget(initialProjection, step.target_id)}`); break;
      case 'WAIT_CAPABILITY_OPTIONS': await uniqueVisible(page.getByTestId('p03-relation-catalog')); break;
      case 'SELECT_EXACT_OPTION': await clickTestId(page, `p03-relation-option-${step.capability_id}`); break;
      case 'OPEN_RIGHT_PANEL': await clickTestId(page, 'p03-right-panel-open'); break;
      case 'OPEN_RELATION_CATALOG': await clickTestId(page, 'p03-tool-relation-menu'); break;
      case 'CLEAR_RELATION_SEARCH': await uniqueVisible(page.getByTestId('p03-relation-catalog-search')); await page.getByTestId('p03-relation-catalog-search').fill(''); break;
      case 'EXPAND_GROUP': await clickTestId(page, `p03-relation-catalog-toggle-${step.group_id}`); break;
      case 'OPEN_BOTTOM_PANEL': await clickTestId(page, `p03-tab-${step.panel_mode === 'FINDINGS' ? 'findings' : 'history'}`); break;
      case 'SELECT_FINDING': await clickTestId(page, `p03-finding-${step.finding_id}`); break;
      case 'LOCATE_FINDING': await clickTestId(page, 'p03-finding-locate'); break;
      case 'SUBMIT_ONE_SHOT_FAULT_COMMAND': if (step.command_id !== 'command.visual.blocked-feedback.persistence-failed') uiFailure('Fault command identity is invalid.'); await clickTestId(page, 'p03-release-visual-common-fault-command'); break;
      default: uiFailure('Capture setup step is unsupported.');
    }
  }
}

async function readStableSnapshot(page, invocation) {
  await twoRaf(page); await assertFontsLoaded(page);
  const apiProjection = await fetchProjection(page, invocation); const viewState = await readViewState(page); const geometry = await readGeometry(page, invocation);
  const projection = normalizeCommonProjection({ subjectId: invocation.subject_id, apiProjection, viewState, focusTargetId: invocation.focus_target_id });
  const projection_sha256 = commonProjectionSha256(projection);
  if (projection_sha256 !== invocation.expected_projection_sha256) uiFailure('Normalized Projection digest differs from Capture Invocation.');
  return Object.freeze({ projection, projection_sha256, view_state: viewState, geometry, geometry_sha256: commonCellGeometrySha256(geometry), observed_cells: geometry.committed_cells.length + geometry.transient_cells.length });
}

async function fetchProjection(page, invocation) {
  return page.evaluate(async ({ projectId, modelId, contextId, revisionId, captureId, attemptOrdinal }) => {
    const path = `/api/v1/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/contexts/${encodeURIComponent(contextId)}/projection?request_id=golden.common.${encodeURIComponent(captureId)}.${attemptOrdinal}&revision=${encodeURIComponent(revisionId)}`;
    const response = await fetch(path, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Projection request failed: ${response.status}`);
    const payload = await response.json();
    if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') throw new Error('Projection response is invalid.');
    return payload.data;
  }, { projectId: invocation.project_id, modelId: invocation.model_id, contextId: invocation.context_id, revisionId: invocation.expected_revision, captureId: invocation.capture_id, attemptOrdinal: invocation.attempt_ordinal });
}

async function readViewState(page) {
  const locator = page.getByTestId('p03-capture-view-state'); await uniqueVisible(locator);
  const raw = await locator.evaluate(element => {
    const attribute = name => element.getAttribute(name) ?? '';
    return { read_revision: attribute('data-read-revision'), selection_kind: attribute('data-selection-kind'), selection_target_id: attribute('data-selection-target-id'), right_open: attribute('data-right-open'), right_mode: attribute('data-right-mode'), bottom_open: attribute('data-bottom-open'), bottom_mode: attribute('data-bottom-mode'), candidate_state: attribute('data-relation-candidate-state'), candidate_capability_id: attribute('data-relation-candidate-capability-id'), candidate_id: attribute('data-relation-candidate-id'), candidate_source_target_id: attribute('data-relation-candidate-source-target-id'), candidate_target_target_id: attribute('data-relation-candidate-target-target-id'), catalog_open: attribute('data-catalog-open'), catalog_search: attribute('data-catalog-search'), catalog_procedural_count: attribute('data-catalog-procedural-count'), catalog_control_count: attribute('data-catalog-control-count'), catalog_structural_count: attribute('data-catalog-structural-count'), finding_selected_id: attribute('data-finding-selected-id'), finding_highlighted_target_id: attribute('data-finding-highlighted-target-id'), feedback_current_code: attribute('data-feedback-current-code'), history_codes: [...element.querySelectorAll('[data-opm-history-code]')].map(item => item.getAttribute('data-opm-history-code') ?? '') };
  });
  if (!raw.read_revision || !['none', 'single-element', 'relation'].includes(raw.selection_kind) || !['true', 'false'].includes(raw.right_open) || !['true', 'false'].includes(raw.bottom_open) || !['none', 'preview'].includes(raw.candidate_state) || !['true', 'false'].includes(raw.catalog_open)) uiFailure('P03 capture view state is invalid.');
  const preview = raw.candidate_state === 'preview'; const candidateFields = [raw.candidate_capability_id, raw.candidate_id, raw.candidate_source_target_id, raw.candidate_target_target_id];
  if ((preview && candidateFields.some(value => !value)) || (!preview && candidateFields.some(Boolean))) uiFailure('P03 candidate view state is invalid.');
  if (raw.history_codes.some(value => !['VALIDATION_BLOCKED', 'REVISION_CONFLICT', 'READONLY'].includes(value))) uiFailure('P03 history code is invalid.');
  return Object.freeze({ read_revision: raw.read_revision, transient_cells: preview ? [{ cell_id: raw.candidate_id, layer: 'CANDIDATE', target_kind: 'FACT', capability_id: raw.candidate_capability_id, source_target_id: raw.candidate_source_target_id, target_target_id: raw.candidate_target_target_id, state: 'preview' }] : [], selection: { kind: raw.selection_kind, target_id: nullIfEmpty(raw.selection_target_id) }, panels: { right_open: raw.right_open === 'true', right_mode: nullIfEmpty(raw.right_mode), bottom_open: raw.bottom_open === 'true', bottom_mode: nullIfEmpty(raw.bottom_mode) }, relation_candidate: { state: raw.candidate_state, capability_id: nullIfEmpty(raw.candidate_capability_id), candidate_id: nullIfEmpty(raw.candidate_id) }, catalog: { open: raw.catalog_open === 'true', search: raw.catalog_search, procedural_count: parseCount(raw.catalog_procedural_count), control_count: parseCount(raw.catalog_control_count), structural_count: parseCount(raw.catalog_structural_count) }, finding: { selected_finding_id: nullIfEmpty(raw.finding_selected_id), highlighted_target_id: nullIfEmpty(raw.finding_highlighted_target_id) }, feedback: { current_code: nullIfEmpty(raw.feedback_current_code), history_codes: raw.history_codes } });
}

async function readGeometry(page, invocation) {
  const raw = await page.locator('[data-opm-capture-cell-id], [data-opm-candidate-cell-id]').evaluateAll(elements => {
    const canvas = document.querySelector('[data-testid="p03-canvas"]'); if (!canvas) throw new Error('P03 canvas is missing.');
    const canvasRect = canvas.getBoundingClientRect();
    return elements.map(element => { if (!canvas.contains(element)) throw new Error('Geometry anchor is outside canvas.'); const rect = element.getBoundingClientRect(); const committed = element.getAttribute('data-opm-capture-cell-id'); const candidate = element.getAttribute('data-opm-candidate-cell-id'); if (Boolean(committed) === Boolean(candidate)) throw new Error('Geometry anchor identity is invalid.'); return { cell_id: committed ?? candidate, layer: committed ? 'COMMITTED' : 'CANDIDATE', x: rect.x - canvasRect.x, y: rect.y - canvasRect.y, width: rect.width, height: rect.height }; });
  });
  const toCell = item => ({ cell_id: item.cell_id, layer: item.layer, geometry_css_millipx: { x: cssMillipixel(item.x), y: cssMillipixel(item.y), width: cssMillipixel(item.width), height: cssMillipixel(item.height) } });
  const geometry = commonCellGeometryPreimage({ captureId: invocation.capture_id, committedCells: raw.filter(item => item.layer === 'COMMITTED').map(toCell), transientCells: raw.filter(item => item.layer === 'CANDIDATE').map(toCell) });
  if (geometry.committed_cells.length + geometry.transient_cells.length !== invocation.expected_cells) uiFailure('Geometry cell count differs from Capture Invocation.');
  if (invocation.subject_id === 'CANDIDATE_LAYER') { if (geometry.transient_cells.length !== 1 || geometry.transient_cells[0].cell_id !== 'candidate.visual.candidate-layer') uiFailure('Candidate geometry anchor is invalid.'); } else if (geometry.transient_cells.length !== 0) uiFailure('Unexpected transient geometry anchor exists.');
  return geometry;
}

async function quietWindow(page) { await page.waitForLoadState('networkidle'); await page.waitForTimeout(200); await twoRaf(page); await assertFontsLoaded(page); }
async function twoRaf(page) { await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)))); }
async function assertFontsLoaded(page) { const status = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.status; }); if (status !== 'loaded') uiFailure('Document fonts are not loaded.'); }
async function focusLocator(page, focusTargetId, projection) { const mappedCellIds = projection.committed_cells.filter(cell => cell.target_id === focusTargetId).map(cell => cell.cell_id); if (mappedCellIds.length > 1) uiFailure('Focus target maps to multiple Runtime occurrences.'); const candidates = [page.locator(`[data-opm-capture-cell-id="${cssEscape(focusTargetId)}"]`), mappedCellIds.length === 1 ? page.locator(`[data-opm-capture-cell-id="${cssEscape(mappedCellIds[0])}"]`) : null, page.locator(`[data-opm-candidate-cell-id="${cssEscape(focusTargetId)}"]`), FIXED_FOCUS_TEST_IDS[focusTargetId] ? page.getByTestId(FIXED_FOCUS_TEST_IDS[focusTargetId]) : null].filter(Boolean); for (const locator of candidates) { if (await locator.count() === 0) continue; await uniqueVisible(locator); return locator; } uiFailure('Focus anchor is missing.'); }
async function setZoom(page, zoomId) { const target = Number(zoomId.slice(2)); const output = page.getByTestId('p03-zoom-output'); await uniqueVisible(output); for (let current = Number((await output.textContent())?.replace('%', '')); current !== target;) { if (!Number.isSafeInteger(current) || current < 25 || current > 400) uiFailure('P03 zoom output is invalid.'); await clickTestId(page, current < target ? 'p03-zoom-in' : 'p03-zoom-out'); const next = Number((await output.textContent())?.replace('%', '')); if (next === current) uiFailure('P03 cannot reach requested zoom.'); current = next; } }
async function clickTestId(page, id) { const locator = page.getByTestId(id); await uniqueVisible(locator); await locator.click(); }
async function uniqueVisible(locator) { if (await locator.count() !== 1 || !await locator.isVisible()) uiFailure('Required P03 locator is not uniquely visible.'); }
function occurrenceForTarget(projection, targetId) { const matches = projection.constructs?.filter(value => value.target_id === targetId) ?? []; if (matches.length !== 1 || typeof matches[0].occurrence_id !== 'string') uiFailure('Endpoint occurrence mapping is invalid.'); return matches[0].occurrence_id; }
function assertSameSnapshot(left, right) { if (left.geometry_sha256 !== right.geometry_sha256 || left.projection_sha256 !== right.projection_sha256 || canonicalizeJcs(left.view_state) !== canonicalizeJcs(right.view_state)) uiFailure('Common capture did not stabilize.'); }
function faultObservation(invocation) { return invocation.fault_mode === 'BLOCKED_FEEDBACK_ONE_SHOT' ? { mode: 'BLOCKED_FEEDBACK_ONE_SHOT', trigger_count: 1, error_code: 'PERSISTENCE_FAILED' } : { mode: 'NONE', trigger_count: 0, error_code: null }; }
async function freshPngPath(attemptRoot) { const info = await lstat(attemptRoot).catch(() => null); if (!info?.isDirectory() || info.isSymbolicLink()) uiFailure('Attempt root is not an adapter-created directory.'); const path = resolve(attemptRoot, 'capture.png'); try { await lstat(path); uiFailure('Attempt capture PNG already exists.'); } catch (error) { if (error?.code !== 'ENOENT') throw error; } return path; }
function cssMillipixel(value) { if (!Number.isFinite(value)) geometryFailure('Geometry CSS pixel value is invalid.'); const result = Math.round(value * 1000); if (!Number.isSafeInteger(result)) geometryFailure('Geometry CSS millipixel value is unsafe.'); return result; }
function isProjectionState(value) { return typeof value.read_revision === 'string' && Array.isArray(value.transient_cells) && isObject(value.selection) && isObject(value.panels) && isObject(value.relation_candidate) && isObject(value.catalog) && isObject(value.finding) && isObject(value.feedback); }
function sameKeys(value, keys) { const actual = Object.keys(value).sort(); return actual.length === keys.length && actual.every((key, index) => key === keys.slice().sort()[index]); }
function nullIfEmpty(value) { return value === '' ? null : value; }
function parseCount(value) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 0) uiFailure('P03 catalog count is invalid.'); return number; }
function cssEscape(value) { if (typeof value !== 'string' || !value || /["\\\0]/u.test(value)) uiFailure('Focus target is unsafe.'); return value.replace(/[^a-zA-Z0-9_-]/g, char => `\\${char.codePointAt(0).toString(16)} `); }
function byteCompare(left, right) { return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function isObject(value) { return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype; }
function adapterInput(message) { const error = new Error(message); error.code = 'GOLDEN_COMMON_ADAPTER_INPUT_INVALID'; error.exitCode = 2; throw error; }
function normalizedFailure(message) { const error = new Error(message); error.code = 'GOLDEN_COMMON_NORMALIZED_PROJECTION_INVALID'; error.exitCode = 3; throw error; }
function geometryFailure(message) { const error = new Error(message); error.code = 'GOLDEN_COMMON_UI_SETUP_FAILED'; error.exitCode = 3; throw error; }
function uiFailure(message) { const error = new Error(message); error.code = 'GOLDEN_COMMON_UI_SETUP_FAILED'; error.exitCode = 3; throw error; }
