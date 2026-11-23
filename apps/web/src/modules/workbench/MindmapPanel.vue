<template>
  <MindmapEditor ref="editor" v-model:selected-id="selectedId" label="脑图分析" :document-id="document?.id" :root-id="document?.root_id" :nodes="document?.nodes ?? []" :locked="locked" :save-blocked="readonly || generating" :loading="loading" :saving="saving" :can-undo="!!past.length" :can-redo="!!future.length" :save-label="saveLabel" :save-confirmed="!!document && !loading && !saving && !dirty" :badges="badges" :associations="document?.relations" generation-title="生成 OPD" :active="active" @assistant-target="emit('assistant-target', $event)" @add="add" @remove="remove" @history="history" @save="save" @export="exportJson" @import="importFile" @import-branch="importBranch" @update-node="updateNode" @expand="expand" @reparent="reparent">
    <template #notice><p v-if="error" class="mindmap-error" role="alert">{{ error }} <button type="button" @click="save">重试保存</button><button type="button" :disabled="saving" @click="load(true)">丢弃本地修改并重新读取</button></p></template>
    <template #node-fields>
      <template v-if="selected">
        <label>类型<select :value="selected.kind" :disabled="readonly || generating || !selected.parent_id" data-testid="mindmap-node-kind" @change="changeKind"><option v-for="(label, kind) in mindmapKinds" :key="kind" :value="kind">{{ label }}</option></select></label>
        <p v-if="kindError" class="mindmap-error" role="alert">{{ kindError }}</p>
        <label v-if="['STATE', 'ATTRIBUTE'].includes(selected.kind)">所属{{ selected.kind === 'STATE' ? '对象' : '元素' }}<select :value="selected.owner_id || ''" :disabled="readonly || generating" data-testid="mindmap-node-owner" @change="update('owner_id', ($event.target as HTMLSelectElement).value || null)"><option value="">待明确</option><option v-for="node in document!.nodes.filter(node => node.id !== selectedId && (selected!.kind === 'STATE' ? node.kind === 'OBJECT' : ['OBJECT', 'PROCESS'].includes(node.kind)))" :key="node.id" :value="node.id">{{ node.label }}</option></select></label>
        <label v-if="['OBJECT', 'PROCESS', 'STATE'].includes(selected.kind)">复用分析实体<select :value="selected.entity_ref || ''" :disabled="readonly || generating" @change="update('entity_ref', ($event.target as HTMLSelectElement).value || null)"><option value="">独立实体</option><option v-for="node in document!.nodes.filter(node => node.id !== selectedId && node.kind === selected!.kind && !node.entity_ref)" :key="node.id" :value="node.id">{{ node.label }} · {{ node.id.slice(-5) }}</option></select></label>
        <label v-if="!selected.entity_ref && ['OBJECT', 'PROCESS', 'STATE'].includes(selected.kind)">绑定现有模型<select :value="selected.target_id || ''" :disabled="readonly || generating" @change="update('target_id', ($event.target as HTMLSelectElement).value || null)"><option value="">按转换来源复用 / 新建</option><option v-for="node in targets.filter(item => item.kind === selected!.kind)" :key="node.id" :value="node.id">{{ node.label }} · {{ node.id.slice(-5) }}</option></select></label>
      </template>
    </template>
    <template #node-extra>
      <template v-if="selected">
        <button type="button" :disabled="readonly || generating" @click="addingRelation = !addingRelation">{{ addingRelation ? '收起关系说明' : '添加关系说明' }}</button>
        <form v-if="addingRelation" class="mindmap-relation-form" @submit.prevent="addRelation">
          <label>关系说明<input v-model="relationLabel" maxlength="256" required data-testid="mindmap-relation-label"></label>
          <label>关系类型<select v-model="relationCapability" data-testid="mindmap-relation-kind"><option value="">语义待明确</option><option v-for="item in relationKinds" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
          <label v-for="index in (relationCapability === 'CAP-ISO-PROC-008' ? 3 : 2)" :key="index">{{ relationCapability === 'CAP-ISO-PROC-008' ? ['输入状态', '过程', '输出状态'][index - 1] : `端点 ${index}` }}<select v-model="relationEndpoints[index - 1]" :data-testid="`mindmap-relation-endpoint-${index}`" required><option value="">选择分析节点</option><option v-for="node in document!.nodes.filter(node => ['OBJECT', 'PROCESS', 'STATE'].includes(node.kind))" :key="node.id" :value="node.id">{{ node.label }} · {{ mindmapKinds[node.kind] }}</option></select></label>
          <button type="submit" :disabled="readonly || generating">保存关系说明</button>
        </form>
        <div v-for="relation in document!.relations" :key="relation.id" class="mindmap-relation-item"><span>{{ relation.label }}</span><button type="button" :disabled="readonly || generating" aria-label="删除关系说明" @click="edit(doc => { doc.relations = doc.relations.filter(item => item.id !== relation.id); })"><X :size="13" /></button></div>
      </template>
    </template>
    <template #generation>
      <p class="mindmap-hint">生成范围：整份脑图中已明确且未排除的内容</p>
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
      <button class="mindmap-primary" type="button" :disabled="readonly || generating || saving || !document || !!conversionIssues.length" data-testid="mindmap-convert" @click="convert">生成 OPD</button>
      <p class="mindmap-hint">分析树线表示分组。关系说明决定 OPM 语义；校验与审查通过后自动保存。</p>
    </template>
  </MindmapEditor>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { X } from '@lucide/vue';
import type { DraftToken, MindmapNode, MindmapResult } from '@/shared/api/generated/draftWorkspaceContract';
import { descendants, importMindmap, mindmapConversionIssues, mindmapKinds, newMindmapId } from './mindmapModel';
import { randomUuid } from '@/shared/platform/browserCrypto';
import { useMindmap } from './useMindmap';
import MindmapEditor from '@/shared/mindmap/MindmapEditor.vue';
import { appendMindmapBranch, importMarkdownFile } from '@/shared/mindmap/mindmapFiles';
import { applyMindmapMove, mindmapMove, type MindmapDrop, type MindmapTreeNode } from '@/shared/mindmap/mindmapTree';
const editor = ref<InstanceType<typeof MindmapEditor>>();
const props = defineProps<{ projectId: string; modelId: string; token: DraftToken | null; readonly: boolean; generating: boolean; active?: boolean; contexts: Array<{ id: string; label: string }>; activeContext: string; targets: Array<{ id: string; label: string; kind: string }> }>();
const emit = defineEmits<{ changed: [result: MindmapResult]; invalidated: []; 'assistant-target': [target: HTMLElement | null]; convert: [value: { contextId: string; excludedIds: string[] }] }>();
const selectedId = ref('');
const kindError = ref('');
const { document, result, error, loading, saving, dirty, past, future, saveLabel, load, edit, history, save: saveAnalysis } = useMindmap(props, value => { emit('changed', value); if (!selectedId.value || !value.document.nodes.some(node => node.id === selectedId.value)) selectedId.value = value.document.root_id; }, () => emit('invalidated'));
const selected = computed(() => document.value?.nodes.find(node => node.id === selectedId.value));
const locked = computed(() => props.readonly || props.generating || loading.value);
const badges = computed(() => Object.fromEntries(document.value?.nodes.map(node => [node.id, mindmapKinds[node.kind]]) ?? []));
const addingRelation = ref(false), relationLabel = ref(''), relationCapability = ref(''), relationEndpoints = ref<string[]>([]), excludedIds = ref<string[]>([]), targetContext = ref(props.contexts[0]?.id ?? props.activeContext);
const relationKinds = [ { id: 'CAP-ISO-PROC-001', label: '消耗 · 对象 → 过程' }, { id: 'CAP-ISO-PROC-002', label: '结果 · 过程 → 对象' }, { id: 'CAP-ISO-PROC-003', label: '作用 · 对象 → 过程' }, { id: 'CAP-ISO-PROC-004', label: '执行者 · 对象 → 过程' }, { id: 'CAP-ISO-PROC-005', label: '工具 · 对象 → 过程' }, { id: 'CAP-ISO-PROC-008', label: '状态变化 · 输入状态 → 过程 → 输出状态' } ];
const excludable = computed(() => document.value ? [...document.value.nodes.filter(node => node.kind !== 'TOPIC'), ...document.value.relations] : []);
const conversionIssues = computed(() => document.value ? mindmapConversionIssues(document.value, excludedIds.value) : []);
const conversionIssuePanel = ref<HTMLElement>();
function locateIssue(id: string) { const relation = document.value?.relations.find(item => item.id === id); void editor.value?.focusNode(relation?.endpoints[0] ?? id); }
watch(() => JSON.stringify([document.value?.id, targetContext.value, result.value?.conversions.filter(item => item.context_id === targetContext.value).at(-1)?.command_id]), () => {
  const conversion = result.value?.conversions.filter(item => item.context_id === targetContext.value).at(-1);
  excludedIds.value = conversion?.excluded_ids.filter(id => excludable.value.some(item => item.id === id)) ?? [];
});
function update(field: keyof MindmapNode, value: unknown) { edit(doc => { const node = doc.nodes.find(node => node.id === selectedId.value)!; Object.assign(node, { [field]: value }); if (field === 'kind') { node.owner_id = null; node.entity_ref = null; node.target_id = null; } }); }
function changeKind(event: Event) {
  const input = event.target as HTMLSelectElement, node = selected.value, kind = input.value;
  if (!node || !document.value) return;
  kindError.value = '';
  const references = document.value.nodes.filter(item => item.entity_ref === node.id && item.kind !== kind
    || item.owner_id === node.id && (item.kind === 'STATE' && kind !== 'OBJECT' || item.kind === 'ATTRIBUTE' && !['OBJECT', 'PROCESS'].includes(kind)));
  if (references.length) kindError.value = `“${node.label}”被“${references.map(item => item.label).join('、')}”引用，请先调整所属或实体复用引用，再修改类型。`;
  else update('kind', kind);
  input.value = selected.value!.kind;
}
watch(selectedId, () => { kindError.value = ''; });
async function add(child: boolean) { if (props.readonly || props.generating || !selected.value || !document.value) return; const parentId = child ? selectedId.value : selected.value.parent_id; if (!parentId) return;
  if (document.value.nodes.length >= 300) { error.value = '脑图最多支持 300 个节点。'; return; }
  const id = newMindmapId(); edit(doc => { doc.nodes.find(node => node.id === parentId)!.collapsed = false; doc.nodes.push({ id, parent_id: parentId, order: doc.nodes.filter(node => node.parent_id === parentId).length, label: '新节点', kind: 'UNCLASSIFIED', note: '', owner_id: null, entity_ref: null, target_id: null, collapsed: false }); }); selectedId.value = id; await nextTick(); await editor.value?.beginRename(id); }
function remove() { if (locked.value || !document.value || !selected.value?.parent_id) return; const removed = descendants(document.value, selectedId.value), parent = selected.value.parent_id;
  edit(doc => { doc.nodes = doc.nodes.filter(node => !removed.has(node.id)); doc.relations = doc.relations.filter(relation => relation.endpoints.every(id => !removed.has(id))); for (const node of doc.nodes) { if (node.owner_id && removed.has(node.owner_id)) node.owner_id = null; if (node.entity_ref && removed.has(node.entity_ref)) node.entity_ref = null; } }); selectedId.value = parent; }
function reparent(id: string, targetId: string, placement?: MindmapDrop) {
  if (locked.value || !document.value || !mindmapMove(document.value, id, targetId, placement)) return;
  edit(doc => applyMindmapMove(doc, id, targetId, placement));
}
function fit() { editor.value?.fit(); }
function updateNode(id: string, change: Partial<MindmapTreeNode>) {
  if (locked.value) return;
  edit(doc => { const node = doc.nodes.find(node => node.id === id); if (node) Object.assign(node, change, change.label !== undefined ? { label: change.label.trim() || node.label } : {}); });
}
function expand(ids: string[]) { if (!locked.value) edit(doc => { for (const node of doc.nodes) if (ids.includes(node.id)) node.collapsed = false; }); }
function addRelation() { const count = relationCapability.value === 'CAP-ISO-PROC-008' ? 3 : 2; const endpoints = relationEndpoints.value.slice(0, count);
  if (endpoints.length !== count || endpoints.some(id => !id) || !relationLabel.value.trim() || !document.value) return;
  if (document.value.relations.length >= 100) { error.value = '关系说明最多支持 100 条。'; return; }
  edit(doc => { doc.relations.push({ id: `relation.${randomUuid()}`, label: relationLabel.value.trim(), capability_id: relationCapability.value || null, endpoints }); }); addingRelation.value = false; relationLabel.value = ''; relationEndpoints.value = []; }
function exportJson() { if (!document.value) return; const blob = new Blob([JSON.stringify({ format: 'opm-mindmap', version: 1, document: document.value }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = window.document.createElement('a'); a.href = url; a.download = '模型分析.opm-mindmap.json'; a.click(); URL.revokeObjectURL(url); }
function importBranch(parentId: string, nodes: MindmapTreeNode[]) {
  if (locked.value || !document.value?.nodes.some(node => node.id === parentId)) return;
  edit(doc => appendMindmapBranch(doc, parentId, nodes.map(node => ({ ...node, kind: 'UNCLASSIFIED', owner_id: null, entity_ref: null, target_id: null }))));
}
async function importFile(event: Event) { const input = event.target as HTMLInputElement, file = input.files?.[0]; if (!file || !document.value || locked.value) return;
  try {
    const current = document.value, parentId = selectedId.value || current.root_id;
    if (/\.md$/i.test(file.name)) {
      const nodes = await importMarkdownFile(file, current, parentId, newMindmapId);
      if (document.value !== current || locked.value) throw new Error('脑图已变化，请重新导入。');
      importBranch(parentId, nodes);
    } else {
      if (file.size > 262144) throw new Error('脑图文件超过 256 KiB。');
      const imported = importMindmap(JSON.parse(await file.text()), current);
      if (document.value !== current || locked.value) throw new Error('脑图已变化，请重新导入。');
      edit(doc => Object.assign(doc, imported)); selectedId.value = imported.root_id; excludedIds.value = [];
    }
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '导入失败。'; } finally { input.value = ''; } }
function save() {
  editor.value?.commitRename();
  return saveAnalysis();
}
async function convert() { if (props.readonly || props.generating) return; if (conversionIssues.value.length) { locateIssue(conversionIssues.value[0]!.id); await nextTick(); conversionIssuePanel.value?.scrollIntoView?.({ block: 'nearest' }); return; } if (await save() && !dirty.value) emit('convert', { contextId: targetContext.value, excludedIds: [...excludedIds.value] }); }
defineExpose({ fit, pendingRename: computed(() => editor.value?.pendingRename ?? false), commitRename: () => editor.value?.commitRename(), reload: (preserveHistory = false) => load(false, preserveHistory), save, result, selectedId, focusedBranchId: computed(() => editor.value?.focusedBranchId), generatePreview: convert, selectSource: locateIssue });
</script>

<style scoped>
.mindmap-conversion-issues { padding:8px; border:1px solid #e4bf88; border-radius:4px; background:#fffaf1; }
.mindmap-conversion-issues p { margin:6px 0; line-height:1.5; }
.mindmap-conversion-issues>div { margin-top:10px; }
.mindmap-relation-form { display:flex; flex-direction:column; gap:8px; padding:8px; background:#f5f8fb; }
.mindmap-relation-item { display:flex; justify-content:space-between; gap:5px; }
.mindmap-panel :deep(.mindmap-exclusion) { flex-direction:row; align-items:center; margin-top:6px; }
.mindmap-exclusion input { width:auto; }
</style>
