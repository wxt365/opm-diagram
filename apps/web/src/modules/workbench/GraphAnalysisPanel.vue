<template>
  <section ref="panelRoot" class="graph-panel" aria-label="图谱分析" data-testid="graph-analysis-panel">
    <div class="graph-toolbar">
      <label>分析范围 <select v-model="scope" aria-label="图谱分析范围"><option value="CONTEXT">当前建模图</option><option value="CONTEXT_SUBTREE">当前及下级建模图</option><option value="MODEL">整个模型</option></select></label>
      <input v-model="search" type="search" placeholder="搜索节点名称" aria-label="搜索图谱节点">
      <div class="graph-header-actions">
        <CanvasFullscreenButton :target="panelRoot" />
        <button class="tool-button tool-button--icon" type="button" :aria-pressed="detailsOpen" :disabled="!selected" :title="detailsOpen ? '关闭详情' : '打开详情'" aria-label="切换图谱右侧栏" @click="detailsOpen = !detailsOpen"><PanelRightOpen :size="18" aria-hidden="true" /></button>
      </div>
    </div>
    <p v-if="stale" class="graph-notice" role="status" data-testid="graph-stale">模型或分析范围已变化，更新后查看当前结果。定位已暂停。 <button type="button" :disabled="loading" @click="refresh">更新结果</button></p>
    <p v-if="loading" class="graph-notice" role="status">图谱加载中…</p>
    <p v-if="error" class="graph-error" role="alert">{{ error }} <button type="button" :disabled="loading" @click="refresh">重试</button></p>
    <div class="graph-body">
      <div class="graph-center">
        <GraphAnalysisCanvas ref="canvas" :nodes="display.nodes" :edges="display.edges" :selected-id="selectedId" :search-ids="search.trim() ? matches.map(node => node.id) : []" :labels="labels" :active="active" :identity="`${projectId}/${modelId}`" @select="selectedId = $event" @context-menu="menuAnchor = $event">
          <div class="graph-stats" aria-label="图谱统计"><span><strong>{{ result?.statistics.node_count ?? 0 }}</strong>节点</span><span><strong>{{ result?.statistics.fact_count ?? 0 }}</strong>原始关系</span><span><strong>{{ result?.statistics.derived_count ?? 0 }}</strong>派生关系</span><span><strong>{{ result?.statistics.edge_count ?? 0 }}</strong>渲染边</span></div>
          <section v-if="search.trim()" class="graph-search-results" aria-label="图谱搜索结果">
            <h4>搜索结果（{{ matches.length }}）</h4><button v-for="node in matches.slice(0, 40)" :key="node.id" type="button" class="graph-search-result" @click="chooseSearch(node)">{{ node.label }} · {{ graphKinds[node.kind] }}</button><p v-if="!matches.length">没有匹配节点</p><p v-if="matches.length > 40">仅列出前 40 项，请缩小关键词。</p>
          </section>
          <template #legend="{ zoomPercent, setZoom, fit, resetZoom }">
            <section class="graph-controls-legend" aria-label="图谱图例与筛选" @pointerdown.stop>
              <div class="graph-controls-header">
                <button type="button" class="graph-tools-toggle" :aria-expanded="toolsExpanded" aria-label="展开或收起图谱工具" aria-controls="graph-tools-content" :title="toolsExpanded ? '收起图谱工具' : '展开图谱工具'" @click="toolsExpanded = !toolsExpanded"><SlidersHorizontal :size="16" aria-hidden="true" /></button>
                <div class="graph-legend-group graph-view-tools" role="toolbar" aria-label="图谱视口控制">
                  <CanvasZoomControls class="graph-opd-zoom" :zoom="zoomPercent" :menu-surface="panelRoot" @zoom="setZoom" @fit="fit" @reset="resetZoom" />
                </div>
              </div>
              <div v-if="toolsExpanded" id="graph-tools-content" class="graph-legend-controls">
                <div class="graph-legend-group">
                  <h4>节点</h4>
                  <button v-for="(name, kind) in graphKinds" :key="kind" type="button" class="graph-legend-item" :aria-pressed="kinds.includes(kind)" :data-kind="kind" :title="`${kinds.includes(kind) ? '隐藏' : '显示'}${name}`" @click="toggleFilter(kinds, kind)"><i class="graph-node-swatch" :style="{ background: graphColors[kind] }" />{{ name }}</button>
                </div>
                <div class="graph-legend-group">
                  <h4>关系</h4>
                  <button v-for="type in result?.relation_types ?? []" :key="type.id" type="button" class="graph-legend-item" :aria-pressed="relations.includes(type.id)" :data-relation="type.id" :title="`${relations.includes(type.id) ? '隐藏' : '显示'}${type.label}`" @click="toggleFilter(relations, type.id)"><i class="graph-edge-swatch" :class="{ 'is-derived': type.id === 'STATE_OF' }" :style="{ color: graphRelationColor(type.id) }" /><span>{{ type.label }} ({{ type.count }})</span></button>
                </div>
              </div>
            </section>
          </template>
        </GraphAnalysisCanvas>
        <p v-if="!loading && !error && (!result || !display.nodes.length)" class="graph-empty" role="status">{{ result?.nodes.length ? '筛选后没有节点，请调整筛选条件。' : '当前范围没有可分析的过程、对象或对象状态。' }}</p>
      </div>
      <aside v-if="selected && detailsOpen" class="graph-details" aria-label="图谱元素详情">
        <button type="button" class="graph-close" aria-label="关闭图谱详情" @click="detailsOpen = false">×</button>
        <h3>{{ isEdge(selected) ? '关系信息' : '节点信息' }}</h3>
        <dl>
          <dt>名称</dt><dd>{{ selected.label }}</dd><dt>类型</dt><dd>{{ isEdge(selected) ? graphRelationName(selected.relation_type) : graphKinds[selected.kind] }}</dd>
          <template v-if="isEdge(selected)"><dt>方向</dt><dd>{{ directionNames[selected.direction] }}</dd><dt>关系来源</dt><dd>{{ selected.derived ? '派生的对象状态归属' : '模型原始关系' }}</dd><dt>端点角色</dt><dd v-for="(endpoint, index) in selected.endpoints" :key="index">{{ graphEndpointName(endpoint.role) }} → {{ targetName(endpoint.target_id) }}</dd></template>
          <template v-else-if="selected.owner_id"><dt>所属对象</dt><dd>{{ targetName(selected.owner_id) }}</dd></template>
        </dl>
        <details class="graph-identifiers"><summary>查看技术标识</summary><dl><dt>元素标识</dt><dd>{{ selected.id }}</dd><template v-if="isEdge(selected)"><dt>关系类型标识</dt><dd>{{ selected.relation_type }}</dd><dt>事实标识</dt><dd>{{ selected.fact_id ?? '无' }}</dd></template></dl></details>
        <h4>来源建模图</h4><p v-if="!selected.source_refs.length">无可定位的建模图出现位置</p>
        <button v-for="sourceRef in selected.source_refs" :key="`${sourceRef.context_id}/${sourceRef.occurrence_id}`" type="button" class="graph-source" :disabled="stale || loading" @click="emit('locate', sourceRef)">{{ sourceRef.context_name }} · 在建模图中定位</button>
        <template v-if="!isEdge(selected)"><h4>关联节点</h4><button v-for="neighbor in neighbors" :key="neighbor.id" type="button" class="graph-source" @click="chooseSearch(neighbor)">{{ neighbor.label }}</button></template>
      </aside>
    </div>
    <GraphAnalysisContextMenu v-if="menuAnchor && active" :anchor="menuAnchor" :labels="labels" @toggle-labels="labels = !labels" @close="menuAnchor = null" />
    <footer class="graph-footer" role="status">显示 {{ display.nodes.length }} / {{ result?.nodes.length ?? 0 }} 个节点 · {{ display.edges.length }} / {{ result?.edges.length ?? 0 }} 条边<span v-if="result"> · {{ result.source.draft_token ? `草稿编辑 ${result.source.draft_token.edit_seq}` : '历史版本' }}</span></footer>
    <details v-if="result?.warnings.length" class="graph-warnings"><summary>{{ result.warnings.length }} 项未展示内容或范围提示</summary><ul><li v-for="(warning, index) in result.warnings" :key="index">{{ graphWarningMessage(warning.code) }}</li></ul></details>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { PanelRightOpen, SlidersHorizontal } from "@lucide/vue";
import type { GraphEdge, GraphNode, GraphSourceRef } from "@/shared/api/generated/draftWorkspaceContract";
import { useWorkbenchServices, unavailableWorkbenchServices } from "@/workbench/services";
import GraphAnalysisCanvas from "./GraphAnalysisCanvas.vue";
import GraphAnalysisContextMenu from "./GraphAnalysisContextMenu.vue";
import CanvasFullscreenButton from "./CanvasFullscreenButton.vue";
import CanvasZoomControls from "./CanvasZoomControls.vue";
import { filterGraph, graphColors, graphKinds, graphNeighborhood, graphRelationColor, graphRelationName, graphEndpointName, graphWarningMessage, localizeGraph } from "./graphAnalysisModel";
import { useGraphAnalysis, type GraphAnalysisProps } from "./useGraphAnalysis";

const props = defineProps<GraphAnalysisProps>();
const emit = defineEmits<{ locate: [source: GraphSourceRef] }>();
const api = (useWorkbenchServices() ?? unavailableWorkbenchServices).api;
const { result: rawResult, loading, error, stale, scope, refresh } = useGraphAnalysis(props, api);
const result = computed(() => rawResult.value ? localizeGraph(rawResult.value) : null);
const kinds = ref<string[]>(Object.keys(graphKinds)), relations = ref<string[]>([]);
function toggleFilter(values: string[], id: string) {
  const index = values.indexOf(id);
  if (index < 0) values.push(id); else values.splice(index, 1);
}
const search = ref(""), selectedId = ref(""), labels = ref(true), canvas = ref<InstanceType<typeof GraphAnalysisCanvas>>();
const menuAnchor = ref<{ clientX: number; clientY: number } | null>(null);
const toolsExpanded = ref(false);
const panelRoot = ref<HTMLElement>();
const detailsOpen = ref(true);
const directionNames = { DIRECTED: "单向", UNDIRECTED: "无向", BIDIRECTIONAL: "双向" };
const display = computed(() => result.value ? filterGraph(result.value, { kinds: kinds.value, relations: relations.value }) : { nodes: [], edges: [] });
const matches = computed(() => result.value?.nodes.filter(node => node.label.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())) ?? []);
const selected = computed(() => display.value.nodes.find(node => node.id === selectedId.value) ?? display.value.edges.find(edge => edge.id === selectedId.value));
function targetName(id: string) { return result.value?.nodes.find(node => node.id === id)?.label ?? '未显示的关联节点'; }
const neighbors = computed(() => { const ids = graphNeighborhood(selectedId.value, display.value.edges, 1); return display.value.nodes.filter(node => node.id !== selectedId.value && ids.has(node.id)); });
function isEdge(value: GraphNode | GraphEdge): value is GraphEdge { return "relation_type" in value; }
async function chooseSearch(node: GraphNode) {
  if (!kinds.value.includes(node.kind)) kinds.value.push(node.kind);
  selectedId.value = node.id;
  await nextTick(); canvas.value?.focus(node.id);
}
watch(result, (value, previous) => {
  const previouslyKnown = new Set(previous?.relation_types.map(type => type.id));
  relations.value = value?.relation_types.filter(type => !previouslyKnown.has(type.id) || relations.value.includes(type.id)).map(type => type.id) ?? [];
});
watch(display, value => {
  if (!value.nodes.some(node => node.id === selectedId.value) && !value.edges.some(edge => edge.id === selectedId.value)) selectedId.value = "";
});
watch(selectedId, id => { if (id) detailsOpen.value = true; });
watch(() => [props.active, props.projectId, props.modelId], () => { menuAnchor.value = null; });
watch(() => `${props.projectId}/${props.modelId}`, () => { kinds.value = Object.keys(graphKinds); search.value = ""; selectedId.value = ""; });
</script>

<style scoped>
.graph-panel { display:flex; flex:1; flex-direction:column; min-height:440px; min-width:0; overflow:hidden; color:#334155; background:#fff; }
.graph-panel:fullscreen { width:100%; height:100%; min-height:0; }
.graph-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:12px; padding:10px 12px; border-bottom:1px solid #dbe3ea; font-size:12px; }
.graph-header-actions { display:flex; align-items:center; gap:4px; margin-left:auto; }.graph-header-actions button { background:transparent; }
.graph-panel label { display:flex; flex-direction:row; align-items:center; gap:6px; font-weight:normal; }
.graph-toolbar input[type=search] { width:175px; }.graph-toolbar select,.graph-toolbar input[type=search] { border:1px solid #dbe3ea; border-radius:4px; padding:5px 8px; background:#fff; color:#334155; }
.graph-search-results button,.graph-details button,.graph-notice button,.graph-error button { display:inline-flex; align-items:center; justify-content:center; gap:4px; min-width:32px; min-height:32px; padding:4px 8px; color:#4a5762; font:inherit; font-size:12px; border:1px solid transparent; border-radius:3px; background:#fff; cursor:pointer; }
.graph-details .graph-source,.graph-search-results .graph-search-result { justify-content:flex-start; }
.graph-search-results button:hover:not(:disabled),.graph-details button:hover:not(:disabled),.graph-notice button:hover:not(:disabled),.graph-error button:hover:not(:disabled) { color:#0b5fae; background:#eaf3fc; border-color:#bfd9f2; }
.graph-search-results button:disabled,.graph-details button:disabled,.graph-notice button:disabled,.graph-error button:disabled { cursor:not-allowed; opacity:.48; }
.graph-search-results button:focus-visible,.graph-details button:focus-visible,.graph-notice button:focus-visible,.graph-error button:focus-visible,.graph-panel input:focus-visible,.graph-panel select:focus-visible { outline:2px solid #0b6bcb; outline-offset:2px; }
.graph-body { display:flex; flex:1; min-height:360px; overflow:hidden; }
.graph-panel h3 { font-size:15px; margin:0 0 14px; }.graph-panel h4 { margin:18px 0 8px; font-size:12px; }
.graph-center { position:relative; display:flex; flex:1; min-width:0; }.graph-empty { position:absolute; left:12px; top:70px; right:12px; text-align:center; color:#64748b; pointer-events:none; }
.graph-details { position:relative; width:265px; flex-shrink:0; padding:18px; overflow:auto; border-left:1px solid #dbe3ea; font-size:12px; }.graph-close { position:absolute; top:8px; right:8px; }.graph-details dt { color:#64748b; margin-top:14px; }.graph-details dd { margin:5px 0 0; overflow-wrap:anywhere; line-height:1.6; }.graph-source,.graph-search-result { width:100%; margin:6px 0; text-align:left; overflow-wrap:anywhere; }
.graph-identifiers { margin-top:14px; color:#64748b; }
.graph-stats { position:absolute; top:12px; left:12px; display:flex; flex-wrap:wrap; gap:12px; max-width:calc(100% - 190px); padding:7px 10px; border:1px solid #d4dde4; border-radius:7px; background:#fffffff2; color:#64748b; font-size:11px; pointer-events:none; }
.graph-stats span { white-space:nowrap; }.graph-stats strong { margin-right:4px; color:#344250; font-size:14px; font-weight:600; }
.graph-controls-legend { position:absolute; right:12px; bottom:12px; display:flex; flex-direction:column-reverse; width:max-content; max-width:calc(100% - 24px); background:#fffffff2; border:1px solid #d4dde4; border-radius:7px; font-size:12px; box-shadow:0 2px 8px #23354714; }
.graph-opd-zoom { position:static; border:0; padding:0; box-shadow:none; background:transparent; }
.graph-controls-header { display:flex; align-items:center; justify-content:flex-end; width:100%; }
.graph-controls-header :deep(.tool-button) { min-width:28px; min-height:28px; padding:4px; border-radius:3px; }
.graph-view-tools { padding:4px 6px; flex-shrink:0; }
.graph-tools-toggle { display:flex; align-items:center; justify-content:center; align-self:center; order:1; flex:0 0 36px; width:36px; height:36px; min-height:36px; max-height:36px; padding:8px; border:0; border-radius:6px; background:#eaf3fc; color:#0b5fae; cursor:pointer; }
.graph-tools-toggle:focus-visible { outline:2px solid #0b6bcb; outline-offset:-2px; }
.graph-legend-controls { display:grid; gap:10px; width:100%; min-width:0; contain:inline-size; padding:8px 6px; border-bottom:1px solid #e1e7ec; }
.graph-legend-controls .graph-legend-group { display:grid; grid-template-columns:1fr; gap:2px; }
.graph-legend-controls .graph-legend-group:first-child { display:flex; flex-wrap:nowrap; }
.graph-legend-controls .graph-legend-group:first-child h4 { display:none; }
.graph-legend-controls .graph-legend-group + .graph-legend-group { border-left:0; border-top:1px solid #e1e7ec; padding:8px 0 0; }
.graph-legend-group { display:flex; align-items:center; gap:6px; flex-shrink:0; }
.graph-legend-group + .graph-legend-group { border-left:1px solid #e1e7ec; padding-left:12px; }
.graph-legend-controls h4 { margin:0 4px 0 0; flex-shrink:0; color:#748698; font-size:11px; font-weight:400; white-space:nowrap; }
.graph-legend-item { display:inline-flex; align-items:center; gap:6px; flex-shrink:0; min-height:28px; padding:4px 6px; border:1px solid transparent; border-radius:3px; background:transparent; color:#4a5762; font:inherit; font-size:12px; text-align:left; white-space:nowrap; cursor:pointer; }
.graph-legend-item:hover { background:#eaf3fc; border-color:#bfd9f2; }.graph-legend-item:focus-visible { outline:2px solid #0b6bcb; outline-offset:-2px; }
.graph-legend-item[aria-pressed="false"] { opacity:.45; }.graph-legend-item[aria-pressed="false"] span { text-decoration:line-through; }
.graph-node-swatch { width:9px; height:9px; border-radius:50%; flex-shrink:0; }.graph-edge-swatch { width:18px; border-top:2px solid currentColor; flex-shrink:0; }.graph-edge-swatch.is-derived { border-top-style:dashed; }
.graph-search-results { position:absolute; top:62px; left:12px; width:230px; max-width:calc(100% - 24px); max-height:calc(100% - 120px); overflow:auto; padding:10px; border:1px solid #d4dde4; border-radius:7px; background:#fffffff5; font-size:12px; }.graph-search-results h4 { margin:0 0 6px; }
.graph-footer { padding:8px 12px; border-top:1px solid #dbe3ea; font-size:12px; color:#64748b; }.graph-notice,.graph-error { margin:0; padding:8px 12px; font-size:12px; background:#fff6df; }.graph-error { color:#a12828; }.graph-warnings { padding:7px 12px; font-size:12px; max-height:120px; overflow:auto; background:#fff9ec; }
@media(max-width:1000px) { .graph-details { width:210px; } }
@media(max-width:680px) { .graph-body { flex-wrap:wrap; overflow:auto; }.graph-details { width:100%; box-sizing:border-box; max-height:260px; }.graph-center { width:100%; flex-basis:100%; min-height:380px; } }
</style>
