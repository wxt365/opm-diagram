<template>
  <section class="model-layout-preview" aria-label="全模型布局预览" data-testid="model-layout-preview">
    <strong>全模型布局预览</strong>
    <span>{{ state.progress }} · 尚未应用</span>
    <select :value="state.direction" aria-label="全模型排列方向" :disabled="state.loading || state.applying" @change="emit('direction', ($event.target as HTMLSelectElement).value as AutoLayoutDirection)"><option value="right">从左到右</option><option value="down">从上到下</option></select>
    <select :value="state.context" aria-label="预览子图" :disabled="state.loading || state.applying" @change="emit('context', ($event.target as HTMLSelectElement).value)"><option v-for="plan in state.plans" :key="plan.id" :value="plan.id">{{ plan.label }}{{ plan.after.length ? ' · 将调整' : ' · 无需调整' }}</option></select>
    <span v-if="state.error" role="alert">{{ state.error }}</span>
    <button class="button button--secondary" :disabled="state.applying" @click="emit('cancel')">取消</button>
    <button class="button button--primary" data-testid="model-layout-apply" :disabled="state.loading || state.applying || !!state.error || !state.plans.some(plan => plan.after.length)" @click="emit('apply')">应用到全部图</button>
  </section>
</template>
<script setup lang="ts">
import type { AutoLayoutDirection } from "@/stores/workbench/autoLayout";
import type { createModelLayout } from "@/stores/workbench/modelLayout";
defineProps<{ state: ReturnType<typeof createModelLayout>["state"] }>();
const emit = defineEmits<{ direction: [direction: AutoLayoutDirection]; context: [id: string]; cancel: []; apply: [] }>();
</script>
<style scoped>
.model-layout-preview { position: absolute; z-index: 25; top: 12px; left: 12px; max-width: calc(100% - 24px); display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 12px; border: 1px solid #a8c9e9; border-radius: 8px; background: #fff; box-shadow: 0 4px 16px #162b431f; font-size: 13px; }
.model-layout-preview select { max-width: 330px; min-height: 32px; border: 1px solid #d4dce5; border-radius: 4px; }
</style>
