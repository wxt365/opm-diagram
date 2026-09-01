const CAPTURE_KIND_BY_UI_KIND = Object.freeze({
  CANVAS: 'FOCUS_BBOX',
  JUNCTION: 'JUNCTION_MARKER',
  TOOLBAR: 'CANVAS'
});

/** 将 Catalog UI 区域投影为 Capture Plan 区域；该模块是唯一转换 owner。 */
export function projectCatalogCriticalRegions(catalogRegions) {
  if (!Array.isArray(catalogRegions) || catalogRegions.length === 0) fail('Critical regions must be a non-empty array.');
  return catalogRegions.map((region, index) => projectRegion(region, index));
}

function projectRegion(region, index) {
  if (!isPlainObject(region) || typeof region.region_id !== 'string' || region.region_id.length === 0 || typeof region.kind !== 'string') fail(`Critical region ${index} is invalid.`);
  if (region.kind === 'LABEL') return { region_id: region.region_id, kind: region.region_id === 'COMPLETENESS' ? 'COMPLETENESS' : 'LABEL_SLOT' };
  const kind = CAPTURE_KIND_BY_UI_KIND[region.kind];
  if (!kind) fail(`Catalog critical region kind is not projectable: ${region.kind}.`);
  return { region_id: region.region_id, kind };
}

function isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function fail(message) { const error = new Error(message); error.code = 'GOLDEN_COMMON_CRITICAL_REGION_INVALID'; error.exitCode = 2; throw error; }
