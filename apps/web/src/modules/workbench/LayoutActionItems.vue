<template>
  <p class="layout-menu__hint">{{ state.reason || (state.count < 2 ? '先多选至少两个元素；分布需要三个。' : `对齐基准：${state.referenceLabel}（最后选中）`) }}</p>
  <div class="layout-menu__align">
    <button v-for="item in items.slice(0, 6)" :key="item.action" class="layout-menu__item" role="menuitem" type="button" :disabled="!state.canAlign" :title="alignHint" :data-testid="`${testPrefix}-${item.action}`" @mousedown.prevent @click="emit('arrange', item.action)">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <g :transform="item.vertical ? 'rotate(90 12 12)' : undefined"><path :d="`M${item.guide} 2v20`" /><rect :x="item.guide === 4 ? 4 : item.guide === 12 ? 8 : 12" y="6" width="8" height="4" rx="1" /><rect :x="item.guide === 4 ? 4 : item.guide === 12 ? 5 : 6" y="14" width="14" height="4" rx="1" /></g>
      </svg>
      <span>{{ item.label }}</span>
    </button>
  </div>
  <div class="layout-menu__distribute">
    <button v-for="item in items.slice(6)" :key="item.action" class="layout-menu__item" role="menuitem" type="button" :disabled="!state.canDistribute" :title="state.reason || '至少三个独立元素；保持两端不动，使相邻元素间距相等。'" :data-testid="`${testPrefix}-${item.action}`" @mousedown.prevent @click="emit('arrange', item.action)">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><g :transform="item.vertical ? 'rotate(90 12 12)' : undefined"><rect x="2" y="7" width="4" height="10" rx="1" /><rect x="10" y="5" width="4" height="14" rx="1" /><rect x="18" y="7" width="4" height="10" rx="1" /><path d="M6 21h4m4 0h4" /></g></svg>
      <span>{{ item.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { LayoutAction } from "@/stores/workbench/layoutArrangement";
const props = withDefaults(defineProps<{ state: { canAlign: boolean; canDistribute: boolean; reason: string; referenceLabel: string; count: number }; testPrefix?: string }>(), { testPrefix: "opd-layout" });
const emit = defineEmits<{ arrange: [action: LayoutAction] }>();
const items: Array<{ action: LayoutAction; label: string; guide?: number; vertical?: boolean }> = [
  { action: "left", label: "左对齐", guide: 4 }, { action: "top", label: "顶部对齐", guide: 4, vertical: true },
  { action: "center-x", label: "水平居中", guide: 12 }, { action: "center-y", label: "垂直居中", guide: 12, vertical: true },
  { action: "right", label: "右对齐", guide: 20 }, { action: "bottom", label: "底部对齐", guide: 20, vertical: true },
  { action: "distribute-x", label: "水平等距分布" }, { action: "distribute-y", label: "垂直等距分布", vertical: true },
];
const alignHint = computed(() => props.state.reason || (props.state.count < 2 ? "至少选择两个独立元素。" : `以最后选中的 ${props.state.referenceLabel} 为基准对齐。`));
</script>

<style scoped>
.layout-menu__hint { margin: 0 0 8px; padding: 4px; color: #586b7e; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.layout-menu__align { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
.layout-menu__distribute { display: grid; gap: 4px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e3e8ee; }
.layout-menu__item { display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 7px 8px; border: 0; border-radius: 4px; background: transparent; color: #26394c; text-align: left; font-size: 13px; cursor: pointer; }
.layout-menu__item svg { flex: 0 0 auto; }
.layout-menu__item:hover:enabled, .layout-menu__item:focus-visible { background: #eaf3fc; outline: 2px solid #a8c9e9; outline-offset: -2px; }
.layout-menu__item:disabled { color: #98a5b2; cursor: default; }
</style>
