<template>
  <div class="workbench-grid" :class="{ 'workbench-grid--inspector-open': inspectorOpen, 'workbench-grid--graph': canvasOnly }">
    <slot name="navigator" />
    <slot name="editor" />
    <slot v-if="inspectorOpen" name="inspector" />
  </div>
</template>
<script setup lang="ts">
// 只组装区域，不持有模型、语言或保存状态。
defineProps<{ inspectorOpen: boolean; canvasOnly?: boolean }>();
</script>
