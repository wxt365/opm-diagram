<template>
  <section class="bottom-panel" :class="{ 'bottom-panel--collapsed': !expanded }">
    <WorkbenchPanelResizer v-if="expanded" :height="height" :content-id="contentId" @resize="emit('resize', $event)" />
    <div class="bottom-panel__bar">
      <div class="bottom-tabs" role="tablist" aria-label="底部工作区"><slot name="tabs" /></div>
      <slot name="status" />
      <button class="bottom-panel__toggle" type="button" :title="expanded ? '收起底部面板 / Collapse bottom panel' : '展开底部面板 / Expand bottom panel'" :aria-label="expanded ? '收起底部面板 / Collapse bottom panel' : '展开底部面板 / Expand bottom panel'" :aria-expanded="expanded" :aria-controls="contentId" data-testid="p03-bottom-toggle" @click="emit('toggle')"><ChevronDown v-if="expanded" :size="16" aria-hidden="true" /><ChevronUp v-else :size="16" aria-hidden="true" /></button>
    </div>
    <div v-show="expanded" :id="contentId" class="bottom-panel__body" role="tabpanel" :aria-labelledby="labelledby"><slot /></div>
  </section>
</template>
<script setup lang="ts">
import { ChevronDown, ChevronUp } from '@lucide/vue';
import WorkbenchPanelResizer from './WorkbenchPanelResizer.vue';
defineProps<{ expanded: boolean; height: number; contentId: string; labelledby: string }>();
const emit = defineEmits<{ resize: [height: number]; toggle: [] }>();
</script>
