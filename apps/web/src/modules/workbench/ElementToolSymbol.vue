<template>
  <svg class="element-tool-symbol" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" :data-element-kind="kind">
    <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
      <rect v-if="kind === 'object'" x="3" y="5" width="18" height="14" />
      <ellipse v-else-if="kind === 'process'" cx="12" cy="12" rx="9" ry="7" />
      <template v-else-if="kind === 'attribute' || kind === 'operation'">
        <!-- 左侧短分支仅提示特征归属，主体保持对象或过程的标准轮廓。 -->
        <path d="M2 4V12H6" />
        <rect v-if="kind === 'attribute'" x="6" y="7" width="16" height="12" />
        <ellipse v-else cx="14" cy="13" rx="8" ry="6" />
      </template>
      <template v-else-if="kind === 'state'">
        <rect x="2" y="3" width="20" height="18" />
        <rect x="6" y="10" width="12" height="7" rx="3" />
      </template>
    </g>
  </svg>
</template>

<script setup lang="ts">
defineProps<{ kind: "object" | "process" | "attribute" | "operation" | "state" }>();
</script>
