<template>
  <section class="mindmap-panel" data-testid="mindmap-panel" aria-label="脑图分析" @keydown.stop="onPanelKey">
    <div class="mindmap-toolbar">
      <div class="mindmap-actions">
        <button type="button" :disabled="!document || readonly || generating" data-testid="mindmap-add-child" @click="add(true)">添加子节点</button>
        <button type="button" :disabled="!selected?.parent_id || readonly || generating" @click="add(false)">添加同级</button>
        <button type="button" aria-label="撤销脑图编辑" :disabled="!past.length || readonly || generating" @click="history(false)"><Undo2 :size="15" /></button>
        <button type="button" aria-label="重做脑图编辑" :disabled="!future.length || readonly || generating" @click="history(true)"><Redo2 :size="15" /></button>
        <button type="button" :disabled="!selected?.parent_id || readonly || generating" @click="pendingDelete = true"><Trash2 :size="15" />删除</button>
      </div>
      <div class="mindmap-actions">
        <span role="status" data-testid="mindmap-save-state">{{ saveLabel }}</span>
        <button type="button" :disabled="!dirty || saving || readonly || generating" data-testid="mindmap-save" @click="save">保存分析</button>
        <button type="button" :disabled="!document" @click="exportJson">导出 JSON</button>
        <button type="button" :disabled="readonly || generating || !document" @click="fileInput?.click()">导入 JSON</button>
        <input ref="fileInput" class="sr-only" type="file" accept=".json,application/json" aria-label="导入脑图 JSON" data-testid="mindmap-import" @change="importJson">
      </div>
    </div>
    <p v-if="error" class="mindmap-error" role="alert">{{ error }} <button type="button" @click="save">重试保存</button><button type="button" @click="load(true)">丢弃本地修改并重新读取</button></p>
    <p v-if="pendingDelete && selected" class="mindmap-notice">删除“{{ selected.label }}”及其分析子节点、关联说明？正式模型元素保留。<button type="button" @click="remove">确认删除分析</button><button type="button" @click="pendingDelete = false">取消</button></p>
    <div class="mindmap-main">
      <div ref="viewport" class="mindmap-viewport" tabindex="0" aria-label="脑图画布，Tab 新增子节点，Enter 新增同级，F2 改名" data-testid="mindmap-canvas" @keydown="onKey" @pointerdown="startPan" @wheel.prevent="onWheel">
        <div class="mindmap-search"><Search :size="14" /><input v-model="search" aria-label="搜索分析节点" placeholder="搜索分析节点" @input="findNode"></div>
        <div v-if="document" class="mindmap-scene" :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }">
          <svg class="mindmap-connectors" :width="sceneWidth" :height="sceneHeight" aria-hidden="true"><path v-for="edge in edges" :key="edge.id" :d="edge.path" /></svg>
          <div
            v-for="item in layout" :key="item.node.id" class="mindmap-node" :class="{ 'is-selected': item.node.id === selectedId, 'is-match': search && item.node.label.includes(search), 'is-topic': item.node.kind === 'TOPIC' }"
            :style="{ left: `${item.x}px`, top: `${item.y}px` }" :draggable="!readonly && !generating && !!item.node.parent_id" :data-testid="`mindmap-node-${item.node.id}`"
            @dragstart="draggedId = item.node.id" @dragover.prevent @drop.prevent="reparent(item.node.id)"
          >
            <button class="mindmap-node__body" type="button" :title="item.node.label" @click="select(item.node.id)" @dblclick="rename"><span class="mindmap-node__kind">{{ mindmapKinds[item.node.kind] }}</span><strong>{{ item.node.label }}</strong></button>
            <button v-if="document.nodes.some(node => node.parent_id === item.node.id)" class="mindmap-node__collapse" type="button" :aria-label="item.node.collapsed ? `展开 ${item.node.label}` : `折叠 ${item.node.label}`" :disabled="readonly || generating" @click="edit(doc => { doc.nodes.find(node => node.id === item.node.id)!.collapsed = !item.node.collapsed; })">{{ item.node.collapsed ? '+' : '−' }}</button>
          </div>
        </div>
        <p v-if="loading" class="mindmap-empty">正在读取分析资料…</p>
        <div class="mindmap-zoom"><button type="button" aria-label="缩小脑图" @click="zoom = Math.max(.2, zoom - .1)">−</button><span>{{ Math.round(zoom * 100) }}%</span><button type="button" aria-label="放大脑图" @click="zoom = Math.min(2.5, zoom + .1)">+</button><button type="button" @click="fit">适应</button></div>
      </div>
      <aside v-if="selected" class="mindmap-details" aria-label="分析节点详情">
        <div class="mindmap-details__heading"><strong>分析节点</strong><span>{{ mindmapKinds[selected.kind] }}</span></div>
        <label>名称<input ref="nameInput" :value="selected.label" maxlength="256" :disabled="readonly || generating" data-testid="mindmap-node-label" @input="update('label', ($event.target as HTMLInputElement).value.trim() || selected.label)"></label>
        <label>类型<select :value="selected.kind" :disabled="readonly || generating || !selected.parent_id" data-testid="mindmap-node-kind" @change="update('kind', ($event.target as HTMLSelectElement).value)"><option v-for="(label, kind) in mindmapKinds" :key="kind" :value="kind">{{ label }}</option></select></label>
        <label v-if="['STATE', 'ATTRIBUTE'].includes(selected.kind)">所属{{ selected.kind === 'STATE' ? '对象' : '元素' }}<select :value="selected.owner_id || ''" :disabled="readonly || generating" data-testid="mindmap-node-owner" @change="update('owner_id', ($event.target as HTMLSelectElement).value || null)"><option value="">待明确</option><option v-for="node in document!.nodes.filter(node => node.id !== selectedId && (selected!.kind === 'STATE' ? node.kind === 'OBJECT' : ['OBJECT', 'PROCESS'].includes(node.kind)))" :key="node.id" :value="node.id">{{ node.label }}</option></select></label>
        <label v-if="['OBJECT', 'PROCESS', 'STATE'].includes(selected.kind)">复用分析实体<select :value="selected.entity_ref || ''" :disabled="readonly || generating" @change="update('entity_ref', ($event.target as HTMLSelectElement).value || null)"><option value="">独立实体</option><option v-for="node in document!.nodes.filter(node => node.id !== selectedId && node.kind === selected!.kind && !node.entity_ref)" :key="node.id" :value="node.id">{{ node.label }} · {{ node.id.slice(-5) }}</option></select></label>
        <label v-if="!selected.entity_ref && ['OBJECT', 'PROCESS', 'STATE'].includes(selected.kind)">绑定现有模型<select :value="selected.target_id || ''" :disabled="readonly || generating" @change="update('target_id', ($event.target as HTMLSelectElement).value || null)"><option value="">按转换来源复用 / 新建</option><option v-for="node in targets.filter(item => item.kind === selected!.kind)" :key="node.id" :value="node.id">{{ node.label }} · {{ node.id.slice(-5) }}</option></select></label>
        <label>业务说明<textarea :value="selected.note" rows="3" maxlength="4000" :disabled="readonly || generating" @input="update('note', ($event.target as HTMLTextAreaElement).value)" /></label>
        <button type="button" :disabled="readonly || generating" @click="addingRelation = !addingRelation">{{ addingRelation ? '收起关系说明' : '添加关系说明' }}</button>
        <form v-if="addingRelation" class="mindmap-relation-form" @submit.prevent="addRelation">
          <label>关系说明<input v-model="relationLabel" maxlength="256" required data-testid="mindmap-relation-label"></label>
          <label>关系类型<select v-model="relationCapability" data-testid="mindmap-relation-kind"><option value="">语义待明确</option><option v-for="item in relationKinds" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
          <label v-for="index in (relationCapability === 'CAP-ISO-PROC-008' ? 3 : 2)" :key="index">{{ relationCapability === 'CAP-ISO-PROC-008' ? ['输入状态', '过程', '输出状态'][index - 1] : `端点 ${index}` }}<select v-model="relationEndpoints[index - 1]" :data-testid="`mindmap-relation-endpoint-${index}`" required><option value="">选择分析节点</option><option v-for="node in document!.nodes.filter(node => ['OBJECT', 'PROCESS', 'STATE'].includes(node.kind))" :key="node.id" :value="node.id">{{ node.label }} · {{ mindmapKinds[node.kind] }}</option></select></label>
          <button type="submit" :disabled="readonly || generating">保存关系说明</button>
        </form>
        <div v-for="relation in document!.relations" :key="relation.id" class="mindmap-relation-item"><span>{{ relation.label }}</span><button type="button" :disabled="readonly || generating" aria-label="删除关系说明" @click="edit(doc => { doc.relations = doc.relations.filter(item => item.id !== relation.id); })"><X :size="13" /></button></div>
        <details><summary>暂不纳入本次转换</summary><label v-for="item in excludable" :key="item.id" class="mindmap-exclusion"><input v-model="excludedIds" type="checkbox" :value="item.id">{{ item.label }}</label></details>
        <section v-if="conversionIssues.length" ref="conversionIssuePanel" class="mindmap-conversion-issues" data-testid="mindmap-conversion-issues" aria-label="转换前需要处理">
          <strong>转换前需要处理 {{ conversionIssues.length }} 项</strong>
          <p>这些内容仍保留在脑图，处理后可在当前模型生成预览，无须新建 OPD 或会话。</p>
          <div v-for="issue in conversionIssues" :key="issue.id">
            <button type="button" @click="locateIssue(issue.id)">{{ issue.label }} · 定位</button>
            <p>{{ issue.message }}</p>
            <label class="mindmap-exclusion"><input v-model="excludedIds" type="checkbox" :value="issue.id" :disabled="readonly || generating">暂不纳入“{{ issue.label }}”</label>
          </div>
        </section>
        <p v-if="excludedIds.length" class="mindmap-hint" data-testid="mindmap-excluded-summary">本次未纳入 {{ excludedIds.length }} 项，原文保留在脑图。具体原因见助手方案说明。</p>
        <label>生成到 OPD<select v-model="targetContext" aria-label="转换目标 OPD"><option v-for="context in contexts" :key="context.id" :value="context.id">{{ context.label }}</option></select></label>
        <button class="mindmap-primary" type="button" :disabled="readonly || generating || saving || !document || !!conversionIssues.length" data-testid="mindmap-convert" @click="convert">生成 OPD 预览</button>
        <p class="mindmap-hint">分析树线表示分组。关系说明决定 OPM 语义；生成后校验并统一确认。</p>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Redo2, Search, Trash2, Undo2, X } from '@lucide/vue';
import type { DraftToken, MindmapNode, MindmapResult } from '@/shared/api/generated/draftWorkspaceContract';
import { descendants, importMindmap, mindmapConversionIssues, mindmapKinds, mindmapLayout, newMindmapId } from './mindmapModel';
import { useMindmap } from './useMindmap';
const props = defineProps<{ projectId: string; modelId: string; token: DraftToken | null; readonly: boolean; generating: boolean; contexts: Array<{ id: string; label: string }>; activeContext: string; targets: Array<{ id: string; label: string; kind: string }> }>();
const emit = defineEmits<{ changed: [result: MindmapResult]; invalidated: [];  convert: [value: { contextId: string; excludedIds: string[] }] }>();
const selectedId = ref('');
const { document, result, error, loading, saving, dirty, past, future, saveLabel, load, edit, history, save } = useMindmap(props, value => { emit('changed', value); if (!selectedId.value || !value.document.nodes.some(node => node.id === selectedId.value)) { selectedId.value = value.document.root_id; void nextTick(fit); } }, () => emit('invalidated'));
const selected = computed(() => document.value?.nodes.find(node => node.id === selectedId.value));
const viewport = ref<HTMLElement>(), nameInput = ref<HTMLInputElement>(), fileInput = ref<HTMLInputElement>();
const pan = ref({ x: 10, y: 10 }), zoom = ref(.8), search = ref(''), draggedId = ref(''), pendingDelete = ref(false);
const addingRelation = ref(false), relationLabel = ref(''), relationCapability = ref(''), relationEndpoints = ref<string[]>([]), excludedIds = ref<string[]>([]), targetContext = ref(props.contexts[0]?.id ?? props.activeContext);
const relationKinds = [ { id: 'CAP-ISO-PROC-001', label: '消耗 · 对象 → 过程' }, { id: 'CAP-ISO-PROC-002', label: '结果 · 过程 → 对象' }, { id: 'CAP-ISO-PROC-003', label: '作用 · 对象 → 过程' }, { id: 'CAP-ISO-PROC-004', label: '执行者 · 对象 → 过程' }, { id: 'CAP-ISO-PROC-005', label: '工具 · 对象 → 过程' }, { id: 'CAP-ISO-PROC-008', label: '状态变化 · 输入状态 → 过程 → 输出状态' } ];
const layout = computed(() => document.value ? mindmapLayout(document.value) : []);
const sceneWidth = computed(() => Math.max(500, ...layout.value.map(item => item.x + 210))), sceneHeight = computed(() => Math.max(300, ...layout.value.map(item => item.y + 80)));
const edges = computed(() => layout.value.filter(item => item.parent).map(item => { const parent = layout.value.find(p => p.node.id === item.parent)!; const x = parent.x + 180, y = parent.y + 28; return { id: item.node.id, path: `M${x},${y} C${x + 20},${y} ${item.x - 20},${item.y + 28} ${item.x},${item.y + 28}` }; }));
const excludable = computed(() => document.value ? [...document.value.nodes.filter(node => node.kind !== 'TOPIC'), ...document.value.relations] : []);
const conversionIssues = computed(() => document.value ? mindmapConversionIssues(document.value, excludedIds.value) : []);
const conversionIssuePanel = ref<HTMLElement>();
function locateIssue(id: string) { const relation = document.value?.relations.find(item => item.id === id); const target = relation?.endpoints[0] ?? id;
  select(target); reveal(target); const item = layout.value.find(item => item.node.id === target); if (item && viewport.value) pan.value = { x: viewport.value.clientWidth / 2 - (item.x + 90) * zoom.value, y: viewport.value.clientHeight / 2 - (item.y + 28) * zoom.value }; }
watch(() => JSON.stringify([document.value?.id, targetContext.value, result.value?.conversions.filter(item => item.context_id === targetContext.value).at(-1)?.command_id]), () => {
  const conversion = result.value?.conversions.filter(item => item.context_id === targetContext.value).at(-1);
  excludedIds.value = conversion?.excluded_ids.filter(id => excludable.value.some(item => item.id === id)) ?? [];
});
function select(id: string) { selectedId.value = id; pendingDelete.value = false; }
function update(field: keyof MindmapNode, value: unknown) { edit(doc => { const node = doc.nodes.find(node => node.id === selectedId.value)!; Object.assign(node, { [field]: value }); if (field === 'kind') { node.owner_id = null; node.entity_ref = null; node.target_id = null; } }); }
async function add(child: boolean) { if (props.readonly || props.generating || !selected.value || !document.value) return; const parentId = child ? selectedId.value : selected.value.parent_id; if (!parentId) return;
  if (document.value.nodes.length >= 300) { error.value = '脑图最多支持 300 个节点。'; return; }
  const id = newMindmapId(); edit(doc => { doc.nodes.find(node => node.id === parentId)!.collapsed = false; doc.nodes.push({ id, parent_id: parentId, order: doc.nodes.filter(node => node.parent_id === parentId).length, label: '新节点', kind: 'UNCLASSIFIED', note: '', owner_id: null, entity_ref: null, target_id: null, collapsed: false }); }); selectedId.value = id; await rename(); }
async function rename() { await nextTick(); nameInput.value?.focus(); nameInput.value?.select(); }
function remove() { if (!document.value || !selected.value?.parent_id) return; const removed = descendants(document.value, selectedId.value), parent = selected.value.parent_id;
  edit(doc => { doc.nodes = doc.nodes.filter(node => !removed.has(node.id)); doc.relations = doc.relations.filter(relation => relation.endpoints.every(id => !removed.has(id))); for (const node of doc.nodes) { if (node.owner_id && removed.has(node.owner_id)) node.owner_id = null; if (node.entity_ref && removed.has(node.entity_ref)) node.entity_ref = null; } }); selectedId.value = parent; pendingDelete.value = false; }
function reparent(parentId: string) { if (!document.value || !draggedId.value || descendants(document.value, draggedId.value).has(parentId)) return;
  edit(doc => { const node = doc.nodes.find(item => item.id === draggedId.value)!; node.parent_id = parentId; node.order = doc.nodes.filter(item => item.parent_id === parentId).length; doc.nodes.find(item => item.id === parentId)!.collapsed = false; }); draggedId.value = ''; }
function onKey(event: KeyboardEvent) { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); event.stopPropagation(); void save(); return; }
  if (event.key === 'Tab' || event.key === 'Enter') { event.preventDefault(); void add(event.key === 'Tab'); } else if (event.key === 'F2') { event.preventDefault(); void rename(); }
  else if (event.key === 'Delete' && selected.value?.parent_id) pendingDelete.value = true; else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.stopPropagation(); history(event.shiftKey); } }
function onPanelKey(event: KeyboardEvent) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); } }
function reveal(id: string) { if (!document.value) return; const parents: string[] = []; let node = document.value.nodes.find(item => item.id === id); while (node?.parent_id) { parents.push(node.parent_id); node = document.value.nodes.find(item => item.id === node!.parent_id); } if (document.value.nodes.some(node => parents.includes(node.id) && node.collapsed)) edit(doc => { for (const node of doc.nodes) if (parents.includes(node.id)) node.collapsed = false; }); }
watch(() => props.contexts, contexts => { if (!contexts.some(context => context.id === targetContext.value)) targetContext.value = props.activeContext; });
function fit() { if (!viewport.value?.clientWidth) return; zoom.value = Math.max(.2, Math.min(1, (viewport.value.clientWidth - 40) / sceneWidth.value, (viewport.value.clientHeight - 60) / sceneHeight.value)); pan.value = { x: 20, y: 35 }; }
function findNode() { const match = document.value?.nodes.find(item => item.label.includes(search.value)); if (match && search.value) reveal(match.id); const node = layout.value.find(item => item.node.id === match?.id); if (node && search.value && viewport.value) { selectedId.value = node.node.id; pan.value = { x: viewport.value.clientWidth / 2 - (node.x + 90) * zoom.value, y: viewport.value.clientHeight / 2 - (node.y + 28) * zoom.value }; } }
function onWheel(event: WheelEvent) { if (!viewport.value) return; const box = viewport.value.getBoundingClientRect(), x = event.clientX - box.x, y = event.clientY - box.y;
  const next = Math.max(.2, Math.min(2.5, zoom.value * Math.exp(-event.deltaY * .0015))), ratio = next / zoom.value; pan.value = { x: x - (x - pan.value.x) * ratio, y: y - (y - pan.value.y) * ratio }; zoom.value = next; }
function startPan(event: PointerEvent) { if ((event.target as HTMLElement).closest('button, input, .mindmap-node') || event.button !== 0) return;
  const element = event.currentTarget as HTMLElement, start = { x: event.clientX, y: event.clientY, ...{ panX: pan.value.x, panY: pan.value.y } }; element.setPointerCapture(event.pointerId);
  const move = (e: PointerEvent) => { pan.value = { x: start.panX + e.clientX - start.x, y: start.panY + e.clientY - start.y }; };
  const finish = () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', finish); element.removeEventListener('pointercancel', finish); };
  element.addEventListener('pointermove', move); element.addEventListener('pointerup', finish); element.addEventListener('pointercancel', finish); }
function addRelation() { const count = relationCapability.value === 'CAP-ISO-PROC-008' ? 3 : 2; const endpoints = relationEndpoints.value.slice(0, count);
  if (endpoints.length !== count || endpoints.some(id => !id) || !relationLabel.value.trim() || !document.value) return;
  if (document.value.relations.length >= 100) { error.value = '关系说明最多支持 100 条。'; return; }
  edit(doc => { doc.relations.push({ id: `relation.${crypto.randomUUID()}`, label: relationLabel.value.trim(), capability_id: relationCapability.value || null, endpoints }); }); addingRelation.value = false; relationLabel.value = ''; relationEndpoints.value = []; }
function exportJson() { if (!document.value) return; const blob = new Blob([JSON.stringify({ format: 'opm-mindmap', version: 1, document: document.value }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = window.document.createElement('a'); a.href = url; a.download = '模型分析.opm-mindmap.json'; a.click(); URL.revokeObjectURL(url); }
async function importJson(event: Event) { const input = event.target as HTMLInputElement, file = input.files?.[0]; if (!file || !document.value) return;
  try { if (file.size > 262144) throw new Error('脑图文件超过 256 KiB。'); const imported = importMindmap(JSON.parse(await file.text()), document.value); edit(doc => { Object.assign(doc, imported); }); selectedId.value = imported.root_id; excludedIds.value = []; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '导入失败。'; } finally { input.value = ''; } }
async function convert() { if (props.readonly || props.generating) return; if (conversionIssues.value.length) { locateIssue(conversionIssues.value[0]!.id); await nextTick(); conversionIssuePanel.value?.scrollIntoView?.({ block: 'nearest' }); return; } if (await save() && !dirty.value) emit('convert', { contextId: targetContext.value, excludedIds: [...excludedIds.value] }); }
defineExpose({ fit, reload: load, save, result, generatePreview: convert, selectSource: locateIssue });
</script>

<style scoped>
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.mindmap-panel { display:flex; flex-direction:column; min-height:0; height:100%; color:#344250; font-size:12px; }
.mindmap-conversion-issues { padding:8px; border:1px solid #e4bf88; border-radius:4px; background:#fffaf1; }
.mindmap-conversion-issues p { margin:6px 0; line-height:1.5; }
.mindmap-conversion-issues > div { margin-top:10px; }
.mindmap-toolbar,.mindmap-actions { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
.mindmap-toolbar { justify-content:space-between; padding:8px 12px; border-bottom:1px solid #dbe3ea; }
button { display:inline-flex; align-items:center; justify-content:center; gap:4px; min-height:28px; padding:4px 8px; border:1px solid #cdd7df; border-radius:4px; background:white; color:#465563; font-size:12px; }
.mindmap-main { display:flex; flex:1; min-height:0; }
.mindmap-viewport { position:relative; flex:1; min-width:0; min-height:360px; overflow:hidden; background:radial-gradient(#dbe4ec 1px,transparent 1px) 0 0/18px 18px #f8fafc; touch-action:none; }
.mindmap-scene { position:absolute; transform-origin:0 0; }
.mindmap-connectors { position:absolute; overflow:visible; pointer-events:none; }
.mindmap-connectors path { fill:none; stroke:#a5bbcc; stroke-width:2; }
.mindmap-node { position:absolute; width:180px; height:56px; display:flex; border:1px solid #bfd0df; border-radius:7px; background:#fff; box-shadow:0 2px 4px #23384d08; }
.mindmap-node.is-selected { border:2px solid #0b6bcb; background:#edf5fe; }
.mindmap-node.is-match { box-shadow:0 0 0 3px #f2cf6e80; }
.mindmap-node.is-topic { background:#edf2f7; }
.mindmap-node__body { display:flex; flex:1; min-width:0; flex-direction:column; align-items:flex-start; border:0; padding:6px 10px; background:transparent; }
.mindmap-node__body strong { max-width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:14px; font-weight:500; }
.mindmap-node__kind { font-size:10px; color:#748698; }
.mindmap-node__collapse { position:absolute; right:-12px; top:16px; min-height:22px; width:22px; padding:0; border-radius:50%; }
.mindmap-details { width:230px; flex:0 0 230px; overflow:auto; padding:12px; border-left:1px solid #dbe3ea; display:flex; flex-direction:column; gap:10px; }
.mindmap-details__heading { display:flex; justify-content:space-between; }
.mindmap-details label { display:flex; flex-direction:column; gap:5px; }
input,select,textarea { min-width:0; max-width:100%; width:100%; font-size:12px; padding:6px; border:1px solid #cdd7df; border-radius:4px; color:#344250; background:white; }
.mindmap-relation-form { display:flex; flex-direction:column; gap:8px; padding:8px; background:#f5f8fb; }
.mindmap-relation-item { display:flex; justify-content:space-between; gap:5px; }
.mindmap-details .mindmap-exclusion { flex-direction:row; align-items:center; margin-top:6px; }.mindmap-exclusion input { width:auto; }
.mindmap-primary { color:white; background:#0b6bcb; border-color:#0b6bcb; }
.mindmap-hint { margin:0; line-height:1.6; color:#748698; }
.mindmap-error,.mindmap-notice { margin:0; padding:8px 12px; line-height:1.7; background:#fff8e5; }.mindmap-error { color:#a12828; }
.mindmap-search,.mindmap-zoom { position:absolute; z-index:2; display:flex; align-items:center; gap:6px; background:white; border:1px solid #dbe3ea; border-radius:5px; padding:4px; }
.mindmap-search { top:10px; left:10px; }.mindmap-search input { width:145px; border:0; }.mindmap-zoom { bottom:12px; right:12px; }
.mindmap-empty { padding:60px 20px; color:#748698; }
@media(max-width:980px) { .mindmap-main { flex-direction:column; overflow:auto; }.mindmap-viewport { flex-shrink:0; min-height:400px; }.mindmap-details { width:100%; flex-basis:auto; border-left:0; border-top:1px solid #dbe3ea; overflow:visible; } }
@media(max-width:680px) { .mindmap-toolbar { padding:8px; }.mindmap-actions { width:100%; } }
</style>
