import assert from 'node:assert/strict';
import test from 'node:test';

import { projectCatalogCriticalRegions } from './canvas06-common-critical-regions.mjs';

test('Common critical region projection preserves order and applies every active UI mapping', () => {
  assert.deepEqual(projectCatalogCriticalRegions([
    { region_id: 'FOCUS_BBOX', kind: 'CANVAS' },
    { region_id: 'LABEL_SLOT:label.primary', kind: 'LABEL' },
    { region_id: 'COMPLETENESS', kind: 'LABEL' },
    { region_id: 'JUNCTION_MARKER', kind: 'JUNCTION' },
    { region_id: 'CATALOG', kind: 'TOOLBAR' }
  ]), [
    { region_id: 'FOCUS_BBOX', kind: 'FOCUS_BBOX' },
    { region_id: 'LABEL_SLOT:label.primary', kind: 'LABEL_SLOT' },
    { region_id: 'COMPLETENESS', kind: 'COMPLETENESS' },
    { region_id: 'JUNCTION_MARKER', kind: 'JUNCTION_MARKER' },
    { region_id: 'CATALOG', kind: 'CANVAS' }
  ]);
});

for (const [name, input] of [
  ['unsupported Catalog UI kind', [{ region_id: 'node', kind: 'NODE' }]],
  ['unknown Catalog UI kind', [{ region_id: 'other', kind: 'OTHER' }]],
  ['empty region array', []],
  ['invalid region object', [{ region_id: '', kind: 'CANVAS' }]]
]) test(`Common critical region projection rejects ${name}`, () => {
  assert.throws(() => projectCatalogCriticalRegions(input), error => error.code === 'GOLDEN_COMMON_CRITICAL_REGION_INVALID' && error.exitCode === 2);
});
