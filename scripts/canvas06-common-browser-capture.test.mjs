import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { commonCellGeometryPreimage, commonCellGeometrySha256, commonProjectionSha256, normalizeCommonProjection } from './canvas06-common-browser-capture.mjs';

const ROOT = 'packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-37c5412a9c12/dev-canvas-06/common-fixtures/0.2.0/visual';
const SUBJECTS = ['STATE_ROLES', 'LONG_LABELS', 'FUNDAMENTAL_FAN', 'CANDIDATE_LAYER', 'INSPECTOR', 'TOOLCHAIN_CATALOG', 'FINDING_FOCUS', 'BLOCKED_FEEDBACK'];

test('Common Projection Normalizer 对八类 fixture 的 committed cells 使用唯一 API 映射', async () => {
  for (const subject of SUBJECTS) {
    const fixture = JSON.parse(await readFile(`${ROOT}/${subject}.json`, 'utf8'));
    const expected = fixture.expected_projection;
    const apiProjection = {
      context_id: expected.context_id,
      constructs: expected.committed_cells.map(cell => ({
        occurrence_id: cell.cell_id, target_id: cell.target_id, target_kind: cell.target_kind,
        capability_id: cell.capability_id, state_roles: cell.state_roles, layout: cell.geometry
      }))
    };
    const normalized = normalizeCommonProjection({
      subjectId: subject, apiProjection, focusTargetId: expected.focus_target_id,
      viewState: {
        read_revision: expected.read_revision, transient_cells: expected.transient_cells, selection: expected.selection,
        panels: expected.panels, relation_candidate: expected.relation_candidate, catalog: expected.catalog,
        finding: expected.finding, feedback: expected.feedback
      }
    });
    assert.deepEqual(normalized, expected, subject);
    assert.equal(commonProjectionSha256(normalized), commonProjectionSha256(expected), subject);
  }
});

test('Common Projection Normalizer 拒绝无法映射的 target kind', () => {
  assert.throws(() => normalizeCommonProjection({
    subjectId: 'STATE_ROLES', focusTargetId: 'occurrence.1',
    apiProjection: { context_id: 'context.1', constructs: [{ occurrence_id: 'occurrence.1', target_id: 'feature.1', target_kind: 'FEATURE', capability_id: 'CAP-1', layout: { x: 0, y: 0, width: 1, height: 1, z_order: 1 } }] },
    viewState: { read_revision: 'revision.1', transient_cells: [], selection: {}, panels: {}, relation_candidate: {}, catalog: {}, finding: {}, feedback: {} }
  }), error => error.code === 'GOLDEN_COMMON_NORMALIZED_PROJECTION_INVALID');
});

test('生产 Geometry preimage 使用 CSS 毫像素并按 UTF-8 cell ID 排序', () => {
  const value = commonCellGeometryPreimage({
    captureId: 'capture.geometry.1',
    committedCells: [
      { cell_id: 'occurrence.z', layer: 'COMMITTED', geometry_css_millipx: { x: 250, y: 0, width: 1000, height: 2000 } },
      { cell_id: 'occurrence.a', layer: 'COMMITTED', geometry_css_millipx: { x: 0, y: 0, width: 1000, height: 2000 } },
    ],
    transientCells: [{ cell_id: 'candidate.visual.candidate-layer', layer: 'CANDIDATE', geometry_css_millipx: { x: 0, y: 0, width: 1, height: 1 } }],
  });

  assert.equal(value.schema_id, 'OPM-DEV-CANVAS-06-COMMON-VISUAL-CELL-GEOMETRY-001');
  assert.deepEqual(value.committed_cells.map(item => item.cell_id), ['occurrence.a', 'occurrence.z']);
  assert.match(commonCellGeometrySha256(value), /^[a-f0-9]{64}$/);
  assert.throws(() => commonCellGeometryPreimage({
    captureId: 'capture.geometry.1',
    committedCells: [{ cell_id: 'occurrence.a', layer: 'COMMITTED', geometry_css_millipx: { x: 0, y: 0, width: -1, height: 1 } }],
    transientCells: [],
  }), error => error.code === 'GOLDEN_COMMON_UI_SETUP_FAILED');
});
