<template>
  <div class="tool-group" aria-label="画布工具">
    <button v-if="showSave !== false" class="tool-button tool-button--icon" type="button" title="保存 / Save (Ctrl/Cmd+S)" aria-label="保存 / Save (Ctrl/Cmd+S)" data-testid="hs-save" :disabled="saveDisabled" @mousedown.prevent @click="emit('save')"><Save :size="18" aria-hidden="true" /></button>
    <button v-if="showSave !== false" class="tool-button tool-button--icon" type="button" :title="`${undoLabel ?? '撤销'} (Ctrl/Cmd+Z)`" aria-label="撤销" data-testid="opd-undo-layout" :disabled="!canUndo" @mousedown.prevent @click="emit('undo')"><Undo2 :size="18" aria-hidden="true" /></button>
    <button v-if="showSave !== false" class="tool-button tool-button--icon" type="button" :title="`${redoLabel ?? '重做'} (Ctrl/Cmd+Shift+Z)`" aria-label="重做" data-testid="opd-redo-layout" :disabled="!canRedo" @mousedown.prevent @click="emit('redo')"><Redo2 :size="18" aria-hidden="true" /></button>
    <button class="tool-button tool-button--icon" :class="{ 'is-active': tool === 'select' }" type="button" title="选择（空白拖动平移；Shift/Ctrl/Cmd 点击多选） / Select" aria-label="选择 / Select" :aria-pressed="tool === 'select'" data-testid="p03-tool-select" @click="emit('tool', 'select')"><MousePointer2 :size="18" aria-hidden="true" /></button>
    <button class="tool-button tool-button--icon" :class="{ 'is-active': tool === 'pan' }" type="button" title="平移画布 / Pan canvas" aria-label="平移画布 / Pan canvas" :aria-pressed="tool === 'pan'" data-testid="p03-tool-pan" @click="emit('tool', 'pan')"><Hand :size="18" aria-hidden="true" /></button>
    <slot />
  </div>
</template>
<script setup lang="ts">
import { Save, Undo2, Redo2, MousePointer2, Hand } from '@lucide/vue';
withDefaults(defineProps<{ showSave?: boolean; saveDisabled?: boolean; canUndo: boolean; canRedo: boolean; tool: 'select' | 'pan'; undoLabel?: string; redoLabel?: string }>(), { showSave: true, saveDisabled: false, undoLabel: '撤销', redoLabel: '重做' });
const emit = defineEmits<{ save: []; undo: []; redo: []; tool: [tool: 'select' | 'pan'] }>();
</script>
