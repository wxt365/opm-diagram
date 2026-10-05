import { createApp, h, nextTick, reactive } from 'vue';
import OpdCanvas from '../../../apps/web/src/modules/workbench/OpdCanvas.vue';
import { autoLayout } from '../../../apps/web/src/stores/workbench/autoLayout';
import type { OpdNode, ConsumptionRelation } from '../../../apps/web/src/shared/types/modeling';

// 隔离数据只进入真实画布组件，不访问或修改用户模型。
const state = reactive({ nodes: [] as OpdNode[], relations: [] as ConsumptionRelation[], selectedId: '', selectedIds: [] as string[], highlightedTextNodeIds: [] as string[], zoom: 100 });
let app: ReturnType<typeof createApp> | undefined;
const frames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const api = {
  async load(count: number, dense = false) {
    app?.unmount();
    state.nodes = Array.from({ length: count }, (_, index) => ({ id: `node.${index}`, occurrenceId: `occurrence.${index}`,
      label: `元素 ${index}`, kind: index % 2 ? 'process' : 'object', x: 80 + index % 20 * 240, y: 80 + Math.floor(index / 20) * 150,
      valueDomain: '', visibility: 'public', multiplicity: '1', architectureLayer: '任务', occurrenceRole: 'owned' }));
    state.relations = Array.from({ length: dense ? count * 2 : count / 2 }, (_, index) => ({ id: `fact.${index}`, occurrenceId: `occurrence.fact.${index}`,
      sourceId: `node.${index % (count / 2) * 2}`, targetId: `node.${index % (count / 2) * 2 + 1}`, sourceOccurrenceId: `occurrence.${index % (count / 2) * 2}`, targetOccurrenceId: `occurrence.${index % (count / 2) * 2 + 1}`,
      symbolRef: 'symbol.link.consumption', layoutRef: `layout.fact.${index}`, capabilityId: 'CAP-ISO-PROC-001' }));
    state.selectedId = ''; state.selectedIds = []; state.highlightedTextNodeIds = []; state.zoom = 100;
    const started = performance.now();
    app = createApp({ render: () => h(OpdCanvas, { ...state,
      onSelect: (id: string) => { state.selectedId = id; state.selectedIds = [id]; },
      onSelection: (ids: string[]) => { state.selectedIds = ids; state.selectedId = ids.at(-1) ?? ''; },
      onViewportZoom: (zoom: number) => { state.zoom = zoom; },
      onMoveBatch: (layouts: Array<{ occurrence_id: string; layout: { x: number; y: number } }>) => {
        const byId = new Map(layouts.map(item => [item.occurrence_id, item.layout]));
        state.nodes = state.nodes.map(node => ({ ...node, ...byId.get(node.occurrenceId) }));
      },
    }) });
    app.mount('#app'); await nextTick(); await frames();
    // 等待 X6 异步视图实际挂载，而非只统计 Vue 组件安装。
    while (document.querySelectorAll('.x6-node').length < count || document.querySelectorAll('.x6-edge').length < state.relations.length) await frames();
    return performance.now() - started;
  },
  async select(id: string) { const start = performance.now(); state.selectedId = id; state.selectedIds = [id]; await nextTick(); await frames(); return performance.now() - start; },
  async zoom() { const start = performance.now(); state.zoom = 75; await nextTick(); await frames(); return performance.now() - start; },
  async details() {
    const start = performance.now();
    const details = state.nodes.filter(node => node.kind === 'object').flatMap(owner => [
      { ...owner, id: `state.${owner.id}`, occurrenceId: `occurrence.state.${owner.id}`, label: '已完成', kind: 'state' as const, ownerId: owner.id,
        x: owner.x + 16, y: owner.y + 32, stateRoles: ['DEFAULT', 'FINAL'] as OpdNode['stateRoles'] },
      { ...owner, id: `feature.${owner.id}`, occurrenceId: `occurrence.feature.${owner.id}`, label: '重量', kind: 'attribute' as const, ownerId: owner.id, x: owner.x + 180 },
    ]);
    state.nodes = [...state.nodes, ...details]; state.highlightedTextNodeIds = details.filter(node => node.kind === 'attribute').map(node => node.id);
    await nextTick(); await frames(); return performance.now() - start;
  },
  async rename() { state.nodes = state.nodes.map(node => node.id === 'node.0' ? { ...node, label: '咖啡豆' } : node); await nextTick(); await frames(); },
  async remove() { state.nodes = state.nodes.filter(node => node.id !== 'node.0' && node.ownerId !== 'node.0'); state.relations = state.relations.filter(relation => relation.sourceId !== 'node.0'); await nextTick(); await frames(); },
  layout() { const start = performance.now(); const result = autoLayout(state.nodes, state.relations, 'right'); return { ms: performance.now() - start, changes: result.layouts.length, reason: result.reason }; },
  position() { return { x: state.nodes[0]?.x, y: state.nodes[0]?.y }; },
};
Object.assign(window, { canvasPerformance: api });
