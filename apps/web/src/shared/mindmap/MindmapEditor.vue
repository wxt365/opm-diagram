<template>
  <section ref="panelRoot" class="mindmap-panel" data-testid="mindmap-panel" :aria-label="label" @keydown.stop="panelKey">
    <div class="mindmap-toolbar" role="toolbar" aria-label="脑图工具">
      <div class="mindmap-actions" role="group" aria-label="编辑节点">
        <button type="button" class="mindmap-tool" aria-label="添加子节点" title="添加子节点" :disabled="locked || !selected" data-testid="mindmap-add-child" @click="emit('add', true)"><ListIndentIncrease aria-hidden="true" /></button>
        <button type="button" class="mindmap-tool" aria-label="添加同级" title="添加同级" :disabled="locked || !selected?.parent_id" @click="emit('add', false)"><ListPlus aria-hidden="true" /></button>
        <button type="button" class="mindmap-tool" aria-label="撤销脑图编辑" title="撤销脑图编辑 (Ctrl/Cmd+Z)" :disabled="locked || !canUndo" @click="emit('history', false)"><Undo2 aria-hidden="true" /></button>
        <button type="button" class="mindmap-tool" aria-label="重做脑图编辑" title="重做脑图编辑 (Ctrl/Cmd+Shift+Z)" :disabled="locked || !canRedo" @click="emit('history', true)"><Redo2 aria-hidden="true" /></button>
        <button type="button" class="mindmap-tool" aria-label="删除" title="删除节点" :disabled="locked || !selected?.parent_id" @click="pendingDelete = true"><Trash2 aria-hidden="true" /></button>
      </div>
      <div class="mindmap-actions" role="group" aria-label="脑图文件操作">
        <button type="button" class="mindmap-tool" aria-label="保存分析" :title="saveConfirmed ? `${saveLabel} · 保存分析 (Ctrl/Cmd+S)` : '保存分析 (Ctrl/Cmd+S)'" :disabled="saveBlocked || loading || saving || !rootId" data-testid="mindmap-save" @click="emit('save')"><Save aria-hidden="true" /></button>
        <button type="button" class="mindmap-tool" aria-label="导入脑图" :title="xmindReading ? '读取 XMind…' : '导入脑图（JSON、Markdown 或 XMind）'" :disabled="locked || !rootId || xmindReading" @click="fileInput?.click()"><Upload aria-hidden="true" /></button>
        <input ref="fileInput" hidden type="file" accept=".json,application/json,.md,text/markdown,.xmind" aria-label="导入脑图文件" data-testid="mindmap-import" @change="chooseImport">
        <details class="mindmap-file-menu">
          <summary class="mindmap-tool" aria-label="导出" title="导出脑图"><Download aria-hidden="true" /><ChevronDown class="mindmap-menu-arrow" aria-hidden="true" /></summary>
          <div>
            <button type="button" :disabled="!rootId" @click="emit('export')">脑图 JSON</button>
            <button type="button" :disabled="!rootId || exporting" title="导出完整主题树和纯文本备注" @click="exportXmindFile">XMind 脑图</button>
            <button type="button" :disabled="!rootId || exporting" @click="exportImage(false)">SVG 图片</button>
            <button type="button" :disabled="!rootId || exporting" @click="exportImage(true)">PNG 图片</button>
          </div>
        </details>
      </div>
      <div class="mindmap-actions mindmap-actions--view" role="group" aria-label="脑图视图">
        <label class="mindmap-tool mindmap-layout-picker" :title="`脑图布局（当前：${layoutLabels[layoutMode]}）`">
          <Workflow aria-hidden="true" />
          <ChevronDown class="mindmap-menu-arrow" aria-hidden="true" />
          <select :value="layoutMode" aria-label="脑图布局" :disabled="!rootId" @change="changeLayout">
            <option v-for="(name, mode) in layoutLabels" :key="mode" :value="mode">{{ name }}</option>
          </select>
        </label>
        <details v-if="rootId" class="mindmap-file-menu mindmap-size-picker">
          <summary class="mindmap-tool" aria-label="节点尺寸" title="节点尺寸"><Scaling aria-hidden="true" /><ChevronDown class="mindmap-menu-arrow" aria-hidden="true" /></summary>
          <div class="mindmap-size-fields" role="group" aria-label="按层级设置节点尺寸">
            <span /><span>宽度 (px)</span><span>高度 (px)</span>
            <template v-for="(level, index) in sizeLevels" :key="level">
              <span>{{ level }}</span>
              <input
                v-for="dimension in sizeDimensions" :key="dimension" type="number" :value="levelSizes[index]![dimension]"
                :aria-label="`${level}${dimension === 'width' ? '宽度' : '高度'}`"
                :min="sizeLimits[dimension].min" :max="sizeLimits[dimension].max" @change="changeNodeSize($event, index, dimension)"
              >
            </template>
            <button type="button" @click="setLevelSizes(defaultLevelSizes)">恢复默认尺寸</button>
            <button v-if="selected && sizeOverrides.has(selected.id)" type="button" :disabled="locked" @click="restoreNodeSize(selected.id)">恢复选中节点的层级尺寸</button>
          </div>
        </details>
        <button type="button" class="mindmap-tool" aria-label="大纲" :title="outlineOpen ? '收起大纲' : '打开大纲'" :aria-pressed="outlineOpen" @click="outlineOpen = !outlineOpen"><ListTree aria-hidden="true" /></button>
      </div>
      <div class="mindmap-toolbar-end">
        <span class="mindmap-save-state" :class="{ 'sr-only': saveConfirmed }" role="status" data-testid="mindmap-save-state">{{ saveLabel }}</span>
        <button v-if="fullscreen" type="button" class="mindmap-tool mindmap-assistant-toggle" aria-label="智能助手" :title="assistantOpen ? '收起智能助手' : '打开智能助手'" :aria-expanded="assistantOpen" @click="assistantOpen = !assistantOpen">
          <Bot aria-hidden="true" />
        </button>
        <div class="mindmap-actions" role="group" aria-label="画布操作">
          <CanvasFullscreenButton :target="panelRoot" />
          <button type="button" class="mindmap-tool" :aria-pressed="detailsOpen" aria-label="切换脑图右侧栏" :title="detailsOpen ? '关闭属性' : '打开属性'" @click="detailsOpen = !detailsOpen">
            <PanelRightClose v-if="detailsOpen" aria-hidden="true" /><PanelRightOpen v-else aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
    <slot name="notice" />
    <XmindImportDialog v-if="xmindPreview" :filename="xmindPreview.filename" :sheets="xmindPreview.sheets" :target-label="xmindTargetLabel" :remaining="300 - nodes.length" :locked="locked" @cancel="xmindPreview = undefined" @confirm="confirmXmind" />
    <p v-if="xmindError" class="mindmap-error" role="alert">{{ xmindError }}</p>
    <p v-if="exportError" class="mindmap-error" role="alert">{{ exportError }}</p>
    <p v-if="pendingDelete && selected" class="mindmap-notice">删除“{{ selected.label }}”及其子节点和分析关系？已生成的正式模型保留。<button type="button" :disabled="locked" @click="confirmDelete">确认删除分析</button><button type="button" @click="pendingDelete = false">取消</button></p>
    <div ref="workspace" class="mindmap-workspace">
      <div class="mindmap-main">
        <aside v-if="outlineOpen" class="mindmap-outline" aria-label="脑图大纲">
          <div
            v-for="{ node, depth } in outline" :key="node.id" class="mindmap-outline-row" :class="dropClass(node.id, 'outline')" :style="{ paddingInlineStart: Math.min(depth, 8) * 14 + 'px' }"
            :draggable="!locked && !!node.parent_id" @dragstart="startNodeDrag($event, node.id)" @dragend="clearNodeDrag" @dragover="previewDrop($event, node.id, 'outline')" @dragleave="leaveDrop($event, node.id, 'outline')"
            @drop.prevent.stop="dropNode(node.id, 'outline')"
          >
            <input v-if="isEditing(node.id, 'outline')" v-model="renameDraft" maxlength="256" aria-label="编辑大纲节点名称" data-inline-name @keydown="renameKey" @blur="commitRename">
            <button v-else type="button" :aria-current="selectedId === node.id ? 'true' : undefined" :title="node.label" @click="focusNode(node.id)" @dblclick="beginRename(node.id, 'outline')" @keydown.f2.prevent="beginRename(node.id, 'outline')" @keydown.alt.up.prevent="reorderNode(node, -1)" @keydown.alt.down.prevent="reorderNode(node, 1)">{{ node.label }}</button>
          </div>
        </aside>
        <div ref="viewport" class="mindmap-viewport" tabindex="0" aria-label="脑图画布，Tab 新增子节点，Enter 新增同级，F2 改名" data-testid="mindmap-canvas" @keydown="treeKey" @pointerdown="startPan" @wheel.prevent="wheel">
          <div class="mindmap-search">
            <Search :size="14" aria-hidden="true" />
            <input v-model="search" type="search" aria-label="搜索分析节点" placeholder="搜索想法" @input="findNode(0)" @keydown.enter.prevent="findNode($event.shiftKey ? -1 : 1)">
            <template v-if="search.trim()">
              <span aria-live="polite">{{ matches.length ? matchIndex + 1 : 0 }}/{{ matches.length }}</span>
              <button type="button" aria-label="上一个结果" :disabled="matches.length < 2" @click="findNode(-1)">‹</button>
              <button type="button" aria-label="下一个结果" :disabled="matches.length < 2" @click="findNode(1)">›</button>
            </template>
            <button v-if="selected?.parent_id && branchId !== selectedId" type="button" @click="focusBranch">聚焦分支</button>
            <button v-if="rootId" type="button" @click="returnToRoot">回到根节点</button>
          </div>
          <div v-if="rootId" class="mindmap-scene" :class="{ 'mindmap-scene--vertical': verticalLayout }" :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }">
            <svg class="mindmap-connectors" :width="sceneWidth" :height="sceneHeight" aria-hidden="true"><path v-for="edge in edges" :key="edge.id" :d="edge.path" /></svg>
            <div v-for="item in layout" :key="item.node.id" class="mindmap-node" :class="[{ 'is-selected': item.node.id === selectedId, 'is-match': matchIds.has(item.node.id), 'is-topic': item.node.id === rootId }, dropClass(item.node.id, 'canvas')]" :style="[{ left: `${item.x}px`, top: `${item.y}px`, width: `${item.width}px`, height: `${item.height}px` }, nodeStyles.get(item.node.id)]" :draggable="!locked && !!item.node.parent_id" :data-testid="`mindmap-node-${item.node.id}`" @dragstart="startNodeDrag($event, item.node.id)" @dragend="clearNodeDrag" @dragover="previewDrop($event, item.node.id, 'canvas')" @dragleave="leaveDrop($event, item.node.id, 'canvas')" @drop.prevent.stop="dropNode(item.node.id, 'canvas')">
              <input v-if="isEditing(item.node.id, 'canvas')" v-model="renameDraft" maxlength="256" aria-label="编辑画布节点名称" data-inline-name @keydown="renameKey" @blur="commitRename">
              <button v-else type="button" class="mindmap-node__body" :title="item.node.label" @click="select(item.node.id)" @dblclick="renameNode(item.node.id)"><span v-if="badges[item.node.id]" class="mindmap-node__kind">{{ badges[item.node.id] }}</span><strong>{{ item.node.label }}</strong></button>
              <button v-if="parents.has(item.node.id)" type="button" class="mindmap-node__collapse" :class="{ 'mindmap-node__collapse--left': item.x < rootX }" :aria-label="`${item.node.collapsed ? '展开' : '折叠'} ${item.node.label}`" :disabled="locked" @click="emit('updateNode', item.node.id, { collapsed: !item.node.collapsed })">{{ item.node.collapsed ? '+' : '−' }}</button>
              <template v-if="item.node.id === selectedId && !locked && !isEditing(item.node.id, 'canvas')">
                <span
                  v-for="edge in nodeResizeEdges" :key="edge.id" class="mindmap-node__resize" :class="`mindmap-node__resize--${edge.id}`"
                  :title="edge.label" aria-hidden="true" @dragstart.stop.prevent
                  @pointerdown.stop.prevent="startNodeResize($event, item.node.id, edge)"
                  @pointermove.stop="moveNodeResize" @pointerup.stop="stopNodeResize" @pointercancel.stop="stopNodeResize" @lostpointercapture="stopNodeResize"
                />
              </template>
            </div>
            <svg v-if="relationEdges.length" class="mindmap-associations" :width="sceneWidth" :height="sceneHeight" aria-label="跨分支关联">
              <g v-for="edge in relationEdges" :key="edge.id">
                <path :d="edge.path" />
                <text :x="edge.x" :y="edge.y" tabindex="0" role="button" :aria-label="`定位关联 ${edge.label} 的端点`" @click="locateAssociation(edge.id)" @keydown.enter.stop.prevent="locateAssociation(edge.id)" @keydown.space.stop.prevent="locateAssociation(edge.id)">{{ edge.label }}</text>
              </g>
            </svg>
          </div>
          <p v-if="loading" class="mindmap-empty">正在读取脑图…</p>
          <MindmapMinimap v-if="viewport && layout.length" :viewport="viewport" :layout="layout" :pan="pan" :zoom="zoom" :selected-id="selectedId" @pan="pan = $event" />
          <CanvasZoomControls :zoom="Math.round(zoom * 10000) / 100" @zoom="zoom = $event / 100" @fit="fit" @reset="zoom = 1" />
        </div>
        <aside v-if="detailsOpen" class="mindmap-details" aria-label="脑图详情与生成">
          <section class="mindmap-section mindmap-node-details" aria-label="节点详情">
            <header><h3>节点详情</h3><span>{{ selected ? badges[selected.id] || '当前节点' : '未选择' }}</span></header>
            <template v-if="selected">
              <label>想法<input ref="nameInput" :value="selected.label" aria-label="脑图节点文字" data-testid="mindmap-node-label" maxlength="256" :disabled="locked" @input="emit('updateNode', selected.id, { label: ($event.target as HTMLInputElement).value })"></label>
              <slot name="node-fields" />
              <label>说明与疑问<textarea :value="selected.note" aria-label="脑图节点说明" maxlength="4000" rows="4" :disabled="locked" @input="emit('updateNode', selected.id, { note: ($event.target as HTMLTextAreaElement).value })" /></label>
              <slot name="node-extra" />
              <button type="button" @click="select('')">取消选择</button>
            </template>
            <p v-else class="mindmap-hint">未选择节点。点击脑图中的想法，可编辑文字和说明。</p>
          </section>
          <section class="mindmap-section mindmap-generation" :aria-label="generationTitle">
            <header><h3>{{ generationTitle }}</h3><span>脑图转换</span></header>
            <slot name="generation" />
          </section>
        </aside>
      </div>
      <aside v-show="fullscreen && assistantOpen" ref="assistantWindow" class="mindmap-floating-assistant" :style="assistantStyle" aria-label="脑图全屏智能助手" @keydown.stop>
        <button
          type="button" class="assistant-window-move" aria-label="移动助手窗口" title="拖动或用方向键移动窗口"
          @pointerdown="startAssistantDrag($event, 'move')" @pointermove="moveAssistantDrag" @pointerup="stopAssistantDrag" @pointercancel="stopAssistantDrag" @lostpointercapture="stopAssistantDrag" @keydown="adjustAssistantWithKeys($event, 'move')"
        >
          <GripHorizontal :size="16" aria-hidden="true" />
        </button>
        <div ref="assistantHost" class="assistant-window-content" />
        <button
          v-for="side in resizeSides" :key="side" type="button" class="assistant-window-resize" :class="`assistant-window-resize--${side}`"
          :aria-label="`从${side === 'left' ? '左' : '右'}下角调整助手窗口大小`" title="拖动或用方向键调整窗口大小"
          @pointerdown="startAssistantDrag($event, side)" @pointermove="moveAssistantDrag" @pointerup="stopAssistantDrag" @pointercancel="stopAssistantDrag" @lostpointercapture="stopAssistantDrag" @keydown="adjustAssistantWithKeys($event, side)"
        />
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Bot, ChevronDown, Download, GripHorizontal, ListIndentIncrease, ListPlus, ListTree, PanelRightClose, PanelRightOpen, Redo2, Save, Scaling, Search, Trash2, Undo2, Upload, Workflow } from '@lucide/vue';
import CanvasZoomControls from '@/shared/workbench/CanvasZoomControls.vue';
import CanvasFullscreenButton from '@/shared/workbench/CanvasFullscreenButton.vue';
import { defaultMindmapNodeSize, layoutMindmap, mindmapMove, orderedChildren, type MindmapAssociation, type MindmapDrop, type MindmapLayout, type MindmapNodeSize, type MindmapTreeNode } from './mindmapTree';

import { mindmapImage, mindmapPng } from './mindmapFiles';
import { mindmapNodeAppearance } from './mindmapAppearance';
import XmindImportDialog from './XmindImportDialog.vue';
import MindmapMinimap from './MindmapMinimap.vue';
import { readXmindSheets, xmindBranch, type XmindSheet } from './xmindImport';
import { exportXmind } from './xmindExport';
import { randomUuid } from '@/shared/platform/browserCrypto';

const props = withDefaults(defineProps<{ label: string; documentId?: string; rootId?: string; nodes: MindmapTreeNode[]; selectedId: string; locked: boolean; saveBlocked: boolean; loading: boolean; saving: boolean; canUndo: boolean; canRedo: boolean; saveLabel: string; saveConfirmed: boolean; generationTitle: string; badges?: Record<string, string>; associations?: MindmapAssociation[]; active?: boolean }>(), { documentId: undefined, rootId: undefined, badges: () => ({}), associations: () => [], active: true });
const emit = defineEmits<{ 'update:selectedId': [id: string]; add: [child: boolean]; remove: []; history: [redo: boolean]; save: []; export: []; import: [event: Event]; 'import-branch': [parentId: string, nodes: MindmapTreeNode[]]; updateNode: [id: string, change: Partial<MindmapTreeNode>]; expand: [ids: string[]]; reparent: [id: string, targetId: string, placement?: MindmapDrop]; 'assistant-target': [target: HTMLElement | null] }>();
const panelRoot = ref<HTMLElement>(), viewport = ref<HTMLElement>(), nameInput = ref<HTMLInputElement>(), fileInput = ref<HTMLInputElement>();
const fullscreen = ref(false), assistantOpen = ref(false), assistantHost = ref<HTMLElement>();
const workspace = ref<HTMLElement>(), assistantWindow = ref<HTMLElement>();
type AssistantFrame = { x: number; y: number; width: number; height: number };
const resizeSides = ['left', 'right'] as const;
type AssistantGesture = 'move' | typeof resizeSides[number];
const assistantFrame = ref<AssistantFrame>();
const assistantStyle = computed(() => {
  const frame = assistantFrame.value;
  return frame && { left: `${frame.x}px`, top: `${frame.y}px`, width: `${frame.width}px`, height: `${frame.height}px`, right: 'auto', bottom: 'auto' };
});
let assistantDrag: { mode: AssistantGesture; frame: AssistantFrame; pointerId: number; handle: HTMLElement; x: number; y: number } | undefined;
let workspaceObserver: ResizeObserver | undefined;

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function fitAssistantFrame(frame: AssistantFrame) {
  const bounds = workspace.value;
  if (!bounds?.clientWidth || !bounds.clientHeight) return;
  const width = Math.min(frame.width, bounds.clientWidth);
  const height = Math.min(frame.height, bounds.clientHeight);
  assistantFrame.value = {
    width, height,
    x: clamp(frame.x, 0, bounds.clientWidth - width),
    y: clamp(frame.y, 0, bounds.clientHeight - height),
  };
}
function readAssistantFrame(): AssistantFrame | undefined {
  const panel = assistantWindow.value, bounds = workspace.value;
  if (!panel || !bounds) return;
  const rect = panel.getBoundingClientRect(), area = bounds.getBoundingClientRect();
  return { x: rect.left - area.left, y: rect.top - area.top, width: rect.width, height: rect.height };
}
function adjustAssistant(frame: AssistantFrame, mode: AssistantGesture, dx: number, dy: number) {
  const bounds = workspace.value;
  if (!bounds) return;
  if (mode === 'move') {
    fitAssistantFrame({ ...frame, x: frame.x + dx, y: frame.y + dy });
    return;
  }
  const fromLeft = mode === 'left';
  const rightEdge = frame.x + frame.width;
  const maxWidth = fromLeft ? rightEdge : bounds.clientWidth - frame.x;
  const maxHeight = bounds.clientHeight - frame.y;
  const width = clamp(frame.width + (fromLeft ? -dx : dx), Math.min(300, maxWidth), maxWidth);
  const height = clamp(frame.height + dy, Math.min(300, maxHeight), maxHeight);
  fitAssistantFrame({ x: fromLeft ? rightEdge - width : frame.x, y: frame.y, width, height });
}
function startAssistantDrag(event: PointerEvent, mode: AssistantGesture) {
  if (event.button !== 0 || event.isPrimary === false || assistantDrag) return;
  const frame = readAssistantFrame();
  if (!frame) return;
  event.preventDefault();
  const handle = event.currentTarget as HTMLElement;
  handle.focus({ preventScroll: true });
  assistantDrag = { mode, frame, handle, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  handle.setPointerCapture?.(event.pointerId);
}
function moveAssistantDrag(event: PointerEvent) {
  const drag = assistantDrag;
  if (drag && drag.pointerId === event.pointerId) adjustAssistant(drag.frame, drag.mode, event.clientX - drag.x, event.clientY - drag.y);
}
function stopAssistantDrag(event?: PointerEvent) {
  const drag = assistantDrag;
  if (!drag || (event && event.pointerId !== drag.pointerId)) return;
  assistantDrag = undefined;
  if (drag.handle.hasPointerCapture?.(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
}
function adjustAssistantWithKeys(event: KeyboardEvent, mode: AssistantGesture) {
  const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const direction = directions[event.key];
  if (!direction || event.metaKey || event.ctrlKey || event.altKey) return;
  const frame = readAssistantFrame();
  if (!frame) return;
  event.preventDefault();
  const step = event.shiftKey ? 48 : 16;
  adjustAssistant(frame, mode, direction[0] * step, direction[1] * step);
}
function syncFullscreen() {
  fullscreen.value = !!panelRoot.value && document.fullscreenElement === panelRoot.value;
  if (!fullscreen.value) assistantOpen.value = false;
}
watch([fullscreen, assistantOpen], ([active, open]) => {
  if (!active || !open) stopAssistantDrag();
  emit('assistant-target', active && open ? assistantHost.value ?? null : null);
});
watch(() => props.active, async active => {
  if (!active) commitRename();
  if (active || document.fullscreenElement !== panelRoot.value) return;
  try { await document.exitFullscreen(); }
  catch { /* 浏览器可能已在退出全屏，按实时状态同步。 */ }
  syncFullscreen();
});
onMounted(() => {
  document.addEventListener('fullscreenchange', syncFullscreen);
  if (workspace.value && typeof ResizeObserver !== 'undefined') {
    workspaceObserver = new ResizeObserver(() => {
      stopAssistantDrag();
      if (fullscreen.value && assistantFrame.value) fitAssistantFrame(assistantFrame.value);
    });
    workspaceObserver.observe(workspace.value);
  }
});
const detailsOpen = ref(true), pendingDelete = ref(false), search = ref(''), draggedId = ref('');
type EditSurface = 'canvas' | 'outline';
const outlineOpen = ref(false), branchId = ref(''), matchIndex = ref(0), revealed = ref(new Set<string>());
const renaming = ref<{ id: string; surface: EditSurface; original: string }>(), renameDraft = ref('');
const dropTarget = ref<{ id: string; surface: EditSurface; placement: MindmapDrop }>();
const pan = ref({ x: 10, y: 10 }), zoom = ref(1);
const selected = computed(() => props.nodes.find(node => node.id === props.selectedId));
const tree = computed(() => ({ root_id: props.rootId ?? '', nodes: props.nodes }));
const xmindReading = ref(false), xmindError = ref('');
const xmindPreview = ref<{ filename: string; parentId: string; sheets: XmindSheet[] }>();
const xmindTargetLabel = computed(() => props.nodes.find(node => node.id === xmindPreview.value?.parentId)?.label);
let xmindRequest = 0;
async function chooseImport(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  xmindError.value = '';
  if (!file || props.locked || !props.rootId) return;
  if (!/\.xmind$/i.test(file.name)) { emit('import', event); return; }
  input.value = '';
  const parentId = selected.value?.id ?? props.rootId;
  const request = ++xmindRequest;
  xmindReading.value = true;
  try {
    const sheets = await readXmindSheets(file);
    if (request === xmindRequest && props.active) xmindPreview.value = { filename: file.name, parentId, sheets };
  } catch (cause) {
    if (request === xmindRequest) xmindError.value = cause instanceof Error ? cause.message : 'XMind 读取失败。';
  } finally {
    if (request === xmindRequest) xmindReading.value = false;
  }
}
function confirmXmind(sheet: XmindSheet) {
  const preview = xmindPreview.value;
  if (props.locked || !preview) return;
  try {
    const nodes = xmindBranch(sheet, tree.value, preview.parentId, () => `node.${randomUuid()}`);
    emit('import-branch', preview.parentId, nodes);
    xmindPreview.value = undefined;
  } catch (cause) {
    xmindPreview.value = undefined;
    xmindError.value = cause instanceof Error ? cause.message : 'XMind 导入失败。';
  }
}
watch([() => props.documentId, () => props.active], () => {
  xmindRequest++;
  xmindPreview.value = undefined;
  xmindReading.value = false;
  xmindError.value = '';
});
const visibleRoot = computed(() => props.nodes.some(node => node.id === branchId.value) ? branchId.value : tree.value.root_id);
const layoutMode = ref<MindmapLayout>('right');
const layoutLabels: Record<MindmapLayout, string> = { right: '从左到右', bilateral: '左右展开', down: '从上到下' };
const verticalLayout = computed(() => layoutMode.value === 'down');
const sizeLevels = ['根主题', '一级分支', '后续节点'];
const sizeDimensions = ['width', 'height'] as const;
const sizeLimits = { width: { min: 120, max: 480 }, height: { min: 48, max: 240 } };
const defaultLevelSizes = sizeLevels.map(() => ({ ...defaultMindmapNodeSize }));
const levelSizes = ref(defaultLevelSizes);
const sizeOverrides = ref(new Map<string, Partial<MindmapNodeSize>>());
const nodeResizeEdges = [
  { id: 'left', label: '拖动左边调整宽度', horizontal: -1, vertical: 0 },
  { id: 'right', label: '拖动右边调整宽度', horizontal: 1, vertical: 0 },
  { id: 'bottom', label: '拖动底边调整高度', horizontal: 0, vertical: 1 },
  { id: 'corner', label: '拖动右下角调整宽度和高度', horizontal: 1, vertical: 1 },
] as const;
type NodeResizeEdge = typeof nodeResizeEdges[number];
let nodeResize: {
  id: string; edge: NodeResizeEdge; handle: HTMLElement; pointerId: number;
  x: number; y: number; zoom: number; size: MindmapNodeSize; override?: Partial<MindmapNodeSize>;
} | undefined;
const layout = computed(() => layoutMindmap({ ...tree.value, root_id: visibleRoot.value }, revealed.value, layoutMode.value, nodeSizes.value));
const outline = computed(() => {
  const rows: { node: MindmapTreeNode; depth: number }[] = [];
  const root = props.nodes.find(node => node.id === props.rootId);
  function visit(node: MindmapTreeNode, depth: number) {
    rows.push({ node, depth });
    orderedChildren(props.nodes, node.id).forEach(child => visit(child, depth + 1));
  }
  if (root) visit(root, 0);
  return rows;
});
const matches = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return query ? outline.value.filter(({ node }) => `${node.label} ${node.note}`.toLocaleLowerCase().includes(query)).map(({ node }) => node.id) : [];
});
const nodeDepths = computed(() => new Map(outline.value.map(({ node, depth }) => [node.id, depth])));
const nodeSizes = computed(() => new Map([...nodeDepths.value].map(([id, depth]) => [
  id, { ...levelSizes.value[Math.min(depth, 2)]!, ...sizeOverrides.value.get(id) },
])));
const nodeStyles = computed(() => new Map([...nodeDepths.value].map(([id, depth]) => {
  const { fill, border, text, badge, size, weight } = mindmapNodeAppearance(depth);
  return [id, {
    '--mindmap-node-fill': fill,
    '--mindmap-node-border': border,
    '--mindmap-node-text': text,
    '--mindmap-node-badge': badge,
    '--mindmap-node-size': `${size}px`,
    '--mindmap-node-weight': weight,
  }];
})));
const matchIds = computed(() => new Set(matches.value));
const positions = computed(() => new Map(layout.value.map(item => [item.node.id, item])));
const rootX = computed(() => positions.value.get(visibleRoot.value)?.x ?? 0);
const parents = computed(() => new Set(props.nodes.map(node => node.parent_id)));
const sceneWidth = computed(() => Math.max(400, ...layout.value.map(item => item.x + item.width + 24)));
const sceneHeight = computed(() => Math.max(240, ...layout.value.map(item => item.y + item.height + 24)));
const edges = computed(() => layout.value.flatMap(item => {
  const parent = positions.value.get(item.parent ?? '');
  if (!parent) return [];
  if (verticalLayout.value) {
    const startX = parent.x + parent.width / 2, endX = item.x + item.width / 2;
    const startY = parent.y + parent.height, endY = item.y;
    const midY = (startY + endY) / 2;
    return [{ id: item.node.id, path: `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}` }];
  }
  const leftward = item.x < parent.x;
  const startX = parent.x + (leftward ? 0 : parent.width), endX = item.x + (leftward ? item.width : 0);
  const offset = leftward ? -22 : 22;
  const startY = parent.y + parent.height / 2, endY = item.y + item.height / 2;
  return [{ id: item.node.id, path: `M ${startX} ${startY} C ${startX + offset} ${startY}, ${endX - offset} ${endY}, ${endX} ${endY}` }];
}));
const relationEdges = computed(() => props.associations.flatMap(relation => {
  const points = relation.endpoints.map(id => positions.value.get(id));
  if (points.some(point => !point) || points.length < 2) return [];
  const first = points[0]!, last = points.at(-1)!;
  const via = points.length === 3 ? points[1] : undefined;
  if (verticalLayout.value) {
    const upward = last.y < first.y;
    const x1 = first.x + first.width / 2, x2 = last.x + last.width / 2;
    const y1 = first.y + (upward ? 0 : first.height), y2 = last.y + (upward || first.y === last.y ? last.height : 0);
    const midY = first.y === last.y ? y1 + 24 : (y1 + y2) / 2;
    const path = via
      ? `M ${x1} ${y1} L ${via.x + via.width / 2} ${via.y + via.height / 2} L ${x2} ${y2}`
      : `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
    return [{ id: relation.id, path, x: (x1 + x2) / 2, y: midY - 5, label: relation.label }];
  }
  const leftward = last.x < first.x;
  const x1 = first.x + (leftward ? 0 : first.width), y1 = first.y + first.height / 2;
  const x2 = last.x + (leftward || first.x === last.x ? last.width : 0), y2 = last.y + last.height / 2;
  const midX = first.x === last.x ? Math.max(x1, x2) + 24 : (x1 + x2) / 2;
  const y = (y1 + y2) / 2;
  const path = via
    ? `M ${x1} ${y1} L ${via.x + via.width / 2} ${via.y + via.height / 2} L ${x2} ${y2}`
    : `M ${x1} ${y1} C ${midX} ${y1} ${midX} ${y2} ${x2} ${y2}`;
  return [{ id: relation.id, path, x: midX, y: y - 5, label: relation.label }];
}));
function locateAssociation(id: string) {
  const relation = props.associations.find(item => item.id === id);
  if (!relation) return;
  const current = relation.endpoints.indexOf(props.selectedId);
  void focusNode(relation.endpoints[(current + 1) % relation.endpoints.length]!);
}
const exporting = ref(false), exportError = ref('');
function downloadExport(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function exportXmindFile() {
  exportError.value = '';
  commitRename();
  await nextTick();
  try {
    downloadExport(exportXmind(tree.value, layoutMode.value), '脑图.xmind');
  } catch (cause) { exportError.value = cause instanceof Error ? cause.message : '导出 XMind 失败。'; }
}
async function exportImage(png: boolean) {
  exporting.value = true;
  exportError.value = '';
  try {
    commitRename();
    await nextTick();
    const width = sceneWidth.value, height = sceneHeight.value;
    const svg = mindmapImage(layout.value, edges.value, relationEdges.value, width, height, nodeDepths.value);
    const blob = png ? await mindmapPng(svg, width, height) : svg;
    downloadExport(blob, `脑图.${png ? 'png' : 'svg'}`);
  } catch (cause) { exportError.value = cause instanceof Error ? cause.message : '导出图片失败。'; }
  finally { exporting.value = false; }
}
function select(id: string) { emit('update:selectedId', id); pendingDelete.value = false; }
async function focusName() { detailsOpen.value = true; await nextTick(); if (!props.locked) { nameInput.value?.focus(); nameInput.value?.select(); } }
function isEditing(id: string, surface: EditSurface) {
  return renaming.value?.id === id && renaming.value.surface === surface;
}
async function beginRename(id: string, surface: EditSurface = 'canvas') {
  const node = props.nodes.find(item => item.id === id);
  if (props.locked || !node || isEditing(id, surface)) return;
  commitRename();
  select(id);
  renameDraft.value = node.label;
  renaming.value = { id, surface, original: node.label };
  await nextTick();
  const input = panelRoot.value?.querySelector<HTMLInputElement>('[data-inline-name]');
  input?.focus({ preventScroll: true });
  input?.select();
}
function renameNode(id: string) { void beginRename(id); }
function commitRename() {
  const edit = renaming.value, label = renameDraft.value.trim();
  renaming.value = undefined;
  if (!props.locked && edit && label && edit.original.trim() !== label) emit('updateNode', edit.id, { label });
}
function renameKey(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Escape') renaming.value = undefined;
  else if (event.key === 'Enter') commitRename();
  else return;
  event.preventDefault();
  event.stopPropagation();
  void nextTick(() => viewport.value?.focus({ preventScroll: true }));
}
function confirmDelete() { if (props.locked || !selected.value?.parent_id) return; emit('remove'); pendingDelete.value = false; }
function treeKey(event: KeyboardEvent) {
  if ((event.target as HTMLElement).closest('input,textarea,select,button') || event.isComposing || event.keyCode === 229 || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'F2') { event.preventDefault(); void focusName(); }
  else if (!props.locked && selected.value) {
    if (event.key === 'Tab' || event.key === 'Enter') { event.preventDefault(); emit('add', event.key === 'Tab'); }
    else if (event.key === 'Delete' && selected.value.parent_id) { event.preventDefault(); pendingDelete.value = true; }
  }
}
function panelKey(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229 || event.repeat || !(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key === 's') commitRename();
  if (key === 's') { event.preventDefault(); if (!props.saveBlocked && !props.loading && !props.saving && props.rootId) emit('save'); }
  else if (key === 'z' && !(event.target as HTMLElement).closest('input,textarea,select')) { event.preventDefault(); if (!props.locked) emit('history', event.shiftKey); }
}
function fit() {
  if (!viewport.value?.clientWidth) return;
  zoom.value = Math.max(.0001, Math.min(1, (viewport.value.clientWidth - 40) / sceneWidth.value, (viewport.value.clientHeight - 60) / sceneHeight.value));
  pan.value = { x: 20, y: 35 };
}
async function changeLayout(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  if (value !== 'right' && value !== 'bilateral' && value !== 'down') return;
  layoutMode.value = value;
  await nextTick();
  fit();
}
function preserveNodeAnchor(anchorId: string, update: () => void, horizontal = .5, vertical = .5) {
  const before = positions.value.get(anchorId);
  update();
  const after = positions.value.get(anchorId);
  if (!before || !after) return;
  pan.value = {
    x: pan.value.x + (before.x - after.x + (before.width - after.width) * horizontal) * zoom.value,
    y: pan.value.y + (before.y - after.y + (before.height - after.height) * vertical) * zoom.value,
  };
}
function setLevelSizes(sizes: MindmapNodeSize[]) {
  const anchorId = positions.value.has(props.selectedId) ? props.selectedId : visibleRoot.value;
  preserveNodeAnchor(anchorId, () => { levelSizes.value = sizes; });
}
function changeNodeSize(event: Event, index: number, dimension: keyof MindmapNodeSize) {
  const input = event.target as HTMLInputElement;
  const { min, max } = sizeLimits[dimension];
  const value = Number.isFinite(input.valueAsNumber)
    ? Math.min(max, Math.max(min, Math.round(input.valueAsNumber)))
    : levelSizes.value[index]![dimension];
  input.value = String(value);
  if (value === levelSizes.value[index]![dimension]) return;
  setLevelSizes(levelSizes.value.map((size, level) => level === index ? { ...size, [dimension]: value } : size));
}
function startNodeResize(event: PointerEvent, id: string, edge: NodeResizeEdge) {
  const size = nodeSizes.value.get(id);
  if (props.locked || event.button !== 0 || event.isPrimary === false || nodeResize || !size) return;
  const handle = event.currentTarget as HTMLElement;
  nodeResize = {
    id, edge, handle, size, zoom: zoom.value, pointerId: event.pointerId,
    x: event.clientX, y: event.clientY, override: sizeOverrides.value.get(id),
  };
  handle.setPointerCapture?.(event.pointerId);
}
function moveNodeResize(event: PointerEvent) {
  const drag = nodeResize;
  if (!drag || drag.pointerId !== event.pointerId || props.locked) return;
  const dx = (event.clientX - drag.x) / drag.zoom, dy = (event.clientY - drag.y) / drag.zoom;
  const { horizontal, vertical } = drag.edge;
  const width = clamp(Math.round(drag.size.width + dx * horizontal), sizeLimits.width.min, sizeLimits.width.max);
  const height = clamp(Math.round(drag.size.height + dy * vertical), sizeLimits.height.min, sizeLimits.height.max);
  const current = nodeSizes.value.get(drag.id);
  if (!current || (width === current.width && height === current.height)) return;
  const override = { ...drag.override };
  if (width !== drag.size.width) override.width = width;
  if (height !== drag.size.height) override.height = height;
  preserveNodeAnchor(drag.id, () => {
    if (override.width !== undefined || override.height !== undefined) sizeOverrides.value.set(drag.id, override);
    else sizeOverrides.value.delete(drag.id);
  }, horizontal < 0 ? 1 : horizontal > 0 ? 0 : .5, vertical ? 0 : .5);
}
function stopNodeResize(event?: PointerEvent) {
  const drag = nodeResize;
  if (!drag || (event && event.pointerId !== drag.pointerId)) return;
  nodeResize = undefined;
  if (drag.handle.hasPointerCapture?.(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
}
function restoreNodeSize(id: string) {
  preserveNodeAnchor(id, () => { sizeOverrides.value.delete(id); });
}
async function focusNode(id: string) {
  const ancestors: string[] = [];
  let node = props.nodes.find(item => item.id === id);
  if (!node) return;
  while (node.parent_id && !ancestors.includes(node.parent_id)) {
    ancestors.push(node.parent_id);
    node = props.nodes.find(item => item.id === node!.parent_id);
    if (!node) break;
  }
  if (branchId.value && id !== branchId.value && !ancestors.includes(branchId.value)) branchId.value = '';
  if (props.nodes.some(item => ancestors.includes(item.id) && item.collapsed)) {
    if (props.locked) revealed.value = new Set([...revealed.value, ...ancestors]);
    else emit('expand', ancestors);
  }
  select(id);
  await nextTick();
  const item = positions.value.get(id);
  if (item && viewport.value) pan.value = {
    x: viewport.value.clientWidth / 2 - (item.x + item.width / 2) * zoom.value,
    y: viewport.value.clientHeight / 2 - (item.y + item.height / 2) * zoom.value,
  };
}
async function focusBranch() {
  branchId.value = props.selectedId;
  if (selected.value?.collapsed) {
    if (props.locked) revealed.value = new Set([...revealed.value, selected.value.id]);
    else emit('expand', [selected.value.id]);
  }
  await nextTick();
  fit();
}
async function returnToRoot() {
  branchId.value = '';
  revealed.value = new Set();
  if (props.rootId) await focusNode(props.rootId);
}
function findNode(step: number) {
  const count = matches.value.length;
  if (!count) { matchIndex.value = 0; return; }
  matchIndex.value = step ? (matchIndex.value + step + count) % count : 0;
  void focusNode(matches.value[matchIndex.value]!);
}
function startNodeDrag(event: DragEvent, id: string) {
  if (nodeResize || props.locked || !props.nodes.some(node => node.id === id && node.parent_id) || (event.target as HTMLElement).closest('input')) { event.preventDefault(); return; }
  draggedId.value = id;
  event.dataTransfer?.setData('text/plain', id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}
function clearNodeDrag() { draggedId.value = ''; dropTarget.value = undefined; }
function previewDrop(event: DragEvent, id: string, surface: EditSurface) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const fraction = surface === 'canvas' && verticalLayout.value
    ? (event.clientX - box.left) / box.width
    : (event.clientY - box.top) / box.height;
  const placement = id === props.rootId ? 'child' : fraction < .25 ? 'before' : fraction > .75 ? 'after' : 'child';
  if (props.locked || !mindmapMove(tree.value, draggedId.value, id, placement)) { dropTarget.value = undefined; return; }
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  dropTarget.value = { id, surface, placement };
}
function leaveDrop(event: DragEvent, id: string, surface: EditSurface) {
  if (event.relatedTarget instanceof Node && (event.currentTarget as HTMLElement).contains(event.relatedTarget)) return;
  if (dropTarget.value?.id === id && dropTarget.value.surface === surface) dropTarget.value = undefined;
}
function dropClass(id: string, surface: EditSurface) {
  const target = dropTarget.value;
  return target?.id === id && target.surface === surface ? `mindmap-drop--${target.placement}` : '';
}
function dropNode(id: string, surface: EditSurface) {
  const target = dropTarget.value;
  const placement = target?.id === id && target.surface === surface ? target.placement : 'child';
  if (!props.locked && mindmapMove(tree.value, draggedId.value, id, placement)) {
    if (placement === 'child') emit('reparent', draggedId.value, id);
    else emit('reparent', draggedId.value, id, placement);
  }
  clearNodeDrag();
}
function reorderNode(node: MindmapTreeNode, offset: number) {
  if (props.locked || !node.parent_id) return;
  const siblings = orderedChildren(props.nodes, node.parent_id);
  const target = siblings[siblings.indexOf(node) + offset];
  if (target) emit('reparent', node.id, target.id, offset < 0 ? 'before' : 'after');
}
function wheel(event: WheelEvent) {
  if (!viewport.value || nodeResize) return;
  const box = viewport.value.getBoundingClientRect(), x = event.clientX - box.left, y = event.clientY - box.top;
  const next = Math.max(.0001, Math.min(4, zoom.value * Math.exp(-event.deltaY * .0015))), ratio = next / zoom.value;
  pan.value = { x: x - (x - pan.value.x) * ratio, y: y - (y - pan.value.y) * ratio }; zoom.value = next;
}
let releasePan: (() => void) | undefined;
function startPan(event: PointerEvent) {
  if (event.button !== 0 || (event.target as HTMLElement).closest('button,input,[role=button],.mindmap-node')) return;
  releasePan?.();
  const element = event.currentTarget as HTMLElement, start = { x: event.clientX, y: event.clientY, pan: { ...pan.value } };
  element.setPointerCapture(event.pointerId);
  const move = (e: PointerEvent) => { pan.value = { x: start.pan.x + e.clientX - start.x, y: start.pan.y + e.clientY - start.y }; };
  const finish = () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', finish); element.removeEventListener('pointercancel', finish); releasePan = undefined; };
  releasePan = finish; element.addEventListener('pointermove', move); element.addEventListener('pointerup', finish); element.addEventListener('pointercancel', finish);
}
watch(() => props.documentId, () => { releasePan?.(); stopNodeResize(); sizeOverrides.value.clear(); search.value = ''; branchId.value = ''; revealed.value = new Set(); renaming.value = undefined; clearNodeDrag(); pendingDelete.value = false; zoom.value = 1; pan.value = { x: 10, y: 10 }; }, { immediate: true });
watch([() => props.active, () => props.locked], () => stopNodeResize());
watch(() => props.selectedId, id => {
  stopNodeResize();
  pendingDelete.value = false;
  if (renaming.value && renaming.value.id !== id) commitRename();
});
watch(matches, values => { if (matchIndex.value >= values.length) matchIndex.value = 0; });
onBeforeUnmount(() => {
  xmindRequest++;
  releasePan?.();
  stopNodeResize();
  stopAssistantDrag();
  workspaceObserver?.disconnect();
  document.removeEventListener('fullscreenchange', syncFullscreen);
  if (assistantOpen.value) emit('assistant-target', null);
});
const pendingRename = computed(() => !!renaming.value && !!renameDraft.value.trim() && renaming.value.original.trim() !== renameDraft.value.trim());
const focusedBranchId = computed(() => visibleRoot.value !== props.rootId ? visibleRoot.value || undefined : undefined);
defineExpose({ fit, focusNode, beginRename, commitRename, pendingRename, focusedBranchId });
</script>

<style scoped>
.mindmap-panel { display:flex; flex-direction:column; min-width:0; min-height:0; height:100%; color:#40566b; font-size:12px; background:#f8fafc; }
.mindmap-panel:fullscreen { width:100%; height:100%; background:#fff; }
.mindmap-floating-assistant { position:absolute; z-index:4; top:12px; right:12px; bottom:52px; width:min(390px, calc(100% - 24px)); box-sizing:border-box; display:flex; flex-direction:column; overflow:hidden; border:1px solid #cbd9e7; border-radius:8px; background:#fff; box-shadow:0 6px 24px #203c5826; }
.mindmap-floating-assistant .assistant-window-move { width:100%; min-height:22px; flex-shrink:0; padding:0; border:0; border-bottom:1px solid #e4ebf2; border-radius:0; background:#f6f9fc; color:#60758a; cursor:grab; touch-action:none; }
.mindmap-floating-assistant .assistant-window-move:active { cursor:grabbing; }
.assistant-window-content { flex:1; min-height:0; margin-bottom:12px; overflow:auto; }
.mindmap-floating-assistant .assistant-window-resize { position:absolute; bottom:0; width:18px; min-height:18px; padding:0; border:0; border-radius:0; background:transparent; touch-action:none; }
.assistant-window-resize::after { content:""; position:absolute; bottom:4px; width:6px; height:6px; border-bottom:2px solid #8198af; }
.assistant-window-resize--left { left:0; cursor:nesw-resize; }
.assistant-window-resize--left::after { left:4px; border-left:2px solid #8198af; }
.assistant-window-resize--right { right:0; cursor:nwse-resize; }
.assistant-window-resize--right::after { right:4px; border-right:2px solid #8198af; }
.mindmap-floating-assistant button:focus-visible { outline:2px solid #0b6bcb; outline-offset:-2px; }
.mindmap-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; padding:5px 10px; border-bottom:1px solid #dce4eb; background:white; }
.mindmap-actions { display:flex; flex-wrap:wrap; align-items:center; max-width:100%; padding:0 2px; gap:2px; border:1px solid #e2eaf1; border-radius:7px; }
.mindmap-actions--view { position:relative; }
.mindmap-toolbar-end { display:flex; align-items:center; justify-content:flex-end; gap:10px; max-width:100%; margin-inline-start:auto; }
.mindmap-toolbar-end .mindmap-actions { flex:none; }
.mindmap-save-state { color:#657a90; }
.mindmap-layout-picker select { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; }
.mindmap-layout-picker:has(select:disabled) { opacity:.5; }
.mindmap-layout-picker select:disabled { cursor:default; }
.mindmap-file-menu { position:relative; }
.mindmap-file-menu > div { position:absolute; z-index:8; top:calc(100% + 4px); right:0; display:grid; gap:4px; min-width:110px; padding:5px; background:#fff; border:1px solid #d8e2eb; border-radius:6px; }
.mindmap-size-picker { position:static; }
.mindmap-size-picker .mindmap-size-fields { left:0; right:auto; }
.mindmap-size-picker .mindmap-size-fields { grid-template-columns:auto 64px 64px; align-items:center; gap:8px; width:max-content; padding:10px; white-space:nowrap; }
.mindmap-size-fields input { width:64px; padding:4px 6px; border:1px solid #d8e2eb; border-radius:5px; color:#395c7b; background:#fff; font:inherit; }
.mindmap-size-fields button { grid-column:1 / -1; justify-self:end; }
.mindmap-panel button,.mindmap-panel :deep(.mindmap-section button),.mindmap-panel :deep(.mindmap-error button) { display:inline-flex; align-items:center; justify-content:center; gap:4px; min-height:28px; padding:5px 8px; border:1px solid #d8e2eb; border-radius:5px; background:white; color:#395c7b; font:inherit; }
.mindmap-panel button:disabled { opacity:.5; cursor:default; }
.mindmap-toolbar .mindmap-tool,.mindmap-toolbar :deep(.tool-button) {
  position:relative; display:inline-flex; justify-content:center; align-items:center;
  width:32px; height:32px; min-width:32px; min-height:32px; box-sizing:border-box; border:0; border-radius:5px;
  padding:4px; background:transparent; color:#395c7b;
}
.mindmap-tool > svg { width:18px; height:18px; }
.mindmap-tool > .mindmap-menu-arrow { position:absolute; right:1px; bottom:3px; width:8px; height:8px; }
summary.mindmap-tool { list-style:none; cursor:pointer; }
summary.mindmap-tool::-webkit-details-marker { display:none; }
.mindmap-toolbar .mindmap-tool:hover:not(:disabled,.mindmap-assistant-toggle):not(:has(select:disabled)),.mindmap-toolbar :deep(.tool-button:hover:not(:disabled)),.mindmap-file-menu[open] > summary { background:#edf4fb; }
.mindmap-toolbar .mindmap-tool[aria-pressed=true],.mindmap-toolbar :deep(.tool-button[aria-pressed=true]) { background:#e4f0fd; color:#185d99; }
.mindmap-toolbar .mindmap-tool:focus-visible,.mindmap-toolbar :deep(.tool-button:focus-visible),.mindmap-layout-picker:has(select:focus-visible) { outline:2px solid #0b6bcb; outline-offset:-2px; }
.mindmap-toolbar .mindmap-tool.mindmap-assistant-toggle { background:#0b6bcb; color:#fff; }
.mindmap-toolbar .mindmap-tool.mindmap-assistant-toggle:is(:hover,[aria-expanded=true]) { background:#084f99; color:#fff; }
.mindmap-toolbar .mindmap-assistant-toggle:focus-visible { outline-color:#fff; outline-offset:-4px; }
.mindmap-section :deep(input:not([type=checkbox])),.mindmap-section :deep(select),.mindmap-section :deep(textarea),.mindmap-search input { width:100%; min-width:0; box-sizing:border-box; border:1px solid #d8e2eb; border-radius:5px; padding:7px; color:inherit; background:white; font:inherit; }
.mindmap-workspace { position:relative; flex:1; min-height:0; }
.mindmap-main { display:flex; height:100%; min-height:0; overflow:hidden; }
.mindmap-outline { flex:0 0 230px; min-width:0; overflow:auto; border-right:1px solid #dce4eb; background:#fff; padding:8px; }
.mindmap-outline-row { display:flex; position:relative; min-width:0; }
.mindmap-outline-row button { flex:1; justify-content:start; min-width:0; border-color:transparent; overflow:hidden; display:block; text-overflow:ellipsis; white-space:nowrap; text-align:left; }
.mindmap-outline-row button[aria-current] { background:#eaf4ff; color:#0b64b8; }
.mindmap-outline-row input,.mindmap-node input { width:100%; min-width:0; border:1px solid #8db8df; border-radius:5px; padding:5px; font:inherit; }
.mindmap-drop--before::after,.mindmap-drop--after::after { content:""; position:absolute; left:0; right:0; height:3px; background:#0b6bcb; }
.mindmap-drop--before::after { top:-3px; }
.mindmap-drop--after::after { bottom:-3px; }
.mindmap-drop--child { outline:2px solid #0b6bcb; outline-offset:2px; }
.mindmap-viewport { position:relative; flex:1; min-width:0; min-height:0; overflow:hidden; background:radial-gradient(#dbe4ec 1px,transparent 1px) 0 0/18px 18px #f8fafc; touch-action:none; }
.mindmap-scene { position:absolute; transform-origin:0 0; }
.mindmap-connectors { position:absolute; overflow:visible; pointer-events:none; }
.mindmap-associations { position:absolute; inset:0; overflow:visible; pointer-events:none; }
.mindmap-associations path { fill:none; stroke:#7956a5; stroke-width:2; stroke-dasharray:6 4; }
.mindmap-associations text { pointer-events:auto; cursor:pointer; fill:#644281; stroke:#f8fafc; stroke-width:4; paint-order:stroke; text-anchor:middle; font-size:12px; }
.mindmap-connectors path { fill:none; stroke:#a5bbcc; stroke-width:2; }
.mindmap-node { position:absolute; box-sizing:border-box; display:flex; border:1px solid var(--mindmap-node-border, #c7d5e1); border-radius:7px; background:var(--mindmap-node-fill, #fff); color:var(--mindmap-node-text, #354d62); box-shadow:0 2px 4px #23384d08; }
.mindmap-node.is-selected { outline:2px solid #0b6bcb; outline-offset:2px; }
.mindmap-node.is-match { box-shadow:0 0 0 3px #f2cf6e80; }
.mindmap-node .mindmap-node__body { flex:1; min-width:0; flex-direction:column; align-items:flex-start; gap:2px; border:0; padding:4px 10px; background:transparent; text-align:left; color:inherit; }
.mindmap-node__body strong { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; overflow-wrap:anywhere; font-size:var(--mindmap-node-size, 13px); font-weight:var(--mindmap-node-weight, 500); line-height:1.2; }
.mindmap-node__kind { font-size:10px; line-height:1.1; color:var(--mindmap-node-badge, #5f7284); }
.mindmap-node .mindmap-node__collapse { position:absolute; right:-12px; top:calc(50% - 11px); min-height:22px; width:22px; padding:0; border-radius:50%; }
.mindmap-node .mindmap-node__collapse--left { left:-12px; right:auto; }
.mindmap-scene--vertical .mindmap-node .mindmap-node__collapse { top:auto; bottom:-12px; left:calc(50% - 11px); right:auto; }
.mindmap-node__resize { position:absolute; z-index:1; display:grid; place-items:center; width:16px; height:16px; touch-action:none; }
.mindmap-node__resize::after { content:""; width:6px; height:6px; border:1px solid #0b6bcb; border-radius:2px; background:#fff; }
.mindmap-node__resize:hover::after,.mindmap-node__resize:active::after { background:#0b6bcb; }
.mindmap-node__resize--left,.mindmap-node__resize--right { top:21%; cursor:ew-resize; }
.mindmap-node__resize--left { left:-9px; }
.mindmap-node__resize--right { right:-9px; }
.mindmap-node__resize--bottom { bottom:-9px; left:32%; cursor:ns-resize; }
.mindmap-node__resize--corner { right:-9px; bottom:-9px; cursor:nwse-resize; }
.mindmap-scene--vertical .mindmap-drop--before::after,.mindmap-scene--vertical .mindmap-drop--after::after { top:0; bottom:0; width:3px; height:auto; }
.mindmap-scene--vertical .mindmap-drop--before::after { left:-4px; right:auto; }
.mindmap-scene--vertical .mindmap-drop--after::after { right:-4px; left:auto; }
.mindmap-search { position:absolute; z-index:2; display:flex; align-items:center; gap:6px; background:white; border:1px solid #dbe3ea; border-radius:5px; padding:4px; top:10px; left:10px; }
.mindmap-search input { width:145px; border:0; }
.mindmap-details { flex:0 0 260px; min-width:0; min-height:0; overflow:auto; border-left:1px solid #dce4eb; }
.mindmap-section { display:flex; flex-direction:column; gap:12px; min-width:0; padding:16px 14px; overflow-wrap:anywhere; }
.mindmap-node-details { background:white; }
.mindmap-section header { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.mindmap-section h3 { margin:0; font-size:13px; font-weight:600; color:#304b62; }
.mindmap-section header>span { color:#7a8a99; font-size:11px; }
.mindmap-section :deep(label) { display:flex; flex-direction:column; gap:6px; }
.mindmap-generation { border-top:1px solid #dce4eb; }
.mindmap-generation :deep(.mindmap-primary) { background:#2675b6; color:white; }
.mindmap-hint,.mindmap-section :deep(.mindmap-hint) { margin:0; line-height:1.6; color:#748698; }
.mindmap-panel :deep(.mindmap-error),.mindmap-notice { margin:0; padding:8px 12px; line-height:1.7; background:#fff8e5; }
.mindmap-panel :deep(.mindmap-error) { color:#a12828; }
.mindmap-empty { padding:60px 20px; color:#748698; }
@media(max-width:900px) { .mindmap-details { flex-basis:220px; }.mindmap-toolbar { padding-inline:6px; } }
@media(max-width:600px) { .mindmap-outline { flex:0 0 140px; border-right:0; border-bottom:1px solid #dce4eb; }.mindmap-main { overflow:auto; flex-direction:column; }.mindmap-viewport { flex:0 0 280px; }.mindmap-details { flex-basis:auto; overflow:visible; border-left:0; border-top:1px solid #dce4eb; } }
</style>
