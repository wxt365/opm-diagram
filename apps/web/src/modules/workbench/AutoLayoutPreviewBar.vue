<template>
  <section ref="bar" class="auto-layout-preview" role="region" aria-label="自动布局预览" data-testid="opd-auto-preview" :aria-busy="busy">
    <div class="auto-layout-preview__intro"><strong>自动布局预览</strong><span>当前 OPD · 尚未应用</span></div>
    <label>排列方向<select aria-label="自动布局方向" data-testid="opd-auto-direction" :value="direction" :disabled="busy" @change="emit('direction', ($event.target as HTMLSelectElement).value as AutoLayoutDirection)"><option value="right">从左到右</option><option value="down">从上到下</option></select></label>
    <div class="auto-layout-preview__actions">
      <button class="button button--secondary" type="button" :disabled="busy" data-testid="opd-auto-cancel" @click="emit('cancel')">取消</button>
      <button class="button button--primary" type="button" :disabled="busy" data-testid="opd-auto-apply" @click="emit('apply')">{{ busy ? '正在应用…' : '应用布局' }}</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { AutoLayoutDirection } from "@/stores/workbench/autoLayout";
const props = defineProps<{ direction: AutoLayoutDirection; busy: boolean }>();
const emit = defineEmits<{ direction: [direction: AutoLayoutDirection]; cancel: []; apply: [] }>();
const bar = ref<HTMLElement>();
function escape(event: KeyboardEvent) {
  if (event.key === "Escape" && !props.busy) { event.preventDefault(); emit("cancel"); }
}
onMounted(() => { window.addEventListener("keydown", escape); void nextTick(() => bar.value?.querySelector("select")?.focus()); });
onBeforeUnmount(() => window.removeEventListener("keydown", escape));
</script>

<style scoped>
.auto-layout-preview { position: absolute; z-index: 25; top: 12px; left: 12px; max-width: calc(100% - 24px); display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 12px; border: 1px solid #a8c9e9; border-radius: 8px; background: #fff; box-shadow: 0 4px 16px #162b431f; color: #26394c; }
.auto-layout-preview__intro { display: grid; gap: 3px; font-size: 13px; }
.auto-layout-preview__intro span { color: #586b7e; font-size: 12px; }
.auto-layout-preview label { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 12px; }
.auto-layout-preview select { min-height: 32px; max-width: 100%; padding: 4px 8px; border: 1px solid #d4dce5; border-radius: 4px; background: #fff; color: inherit; }
.auto-layout-preview__actions { display: flex; gap: 8px; }
.auto-layout-preview__actions button { min-height: 32px; padding: 6px 12px; font-size: 13px; }
@media (max-width: 820px) {
  .auto-layout-preview { position: fixed; top: auto; bottom: 12px; max-width: calc(100vw - 24px); }
}
</style>
