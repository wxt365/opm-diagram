<template>
  <div class="element-colors" data-testid="element-colors">
    <div class="inspector-section__heading"><span>颜色设置</span></div>
    <div v-for="field in fields" :key="field.key" class="element-colors__row">
      <span>{{ field.label }}</span>
      <div class="element-colors__control">
        <input
          type="color" :value="colors[field.key]" :disabled="readonly" :aria-label="field.label"
          :data-testid="`element-color-${field.key}`" @change="change(field.key, $event)"
        >
        <code>{{ colors[field.key] }}</code>
        <button type="button" class="element-colors__reset" :disabled="readonly || !overrides?.[field.key]" :aria-label="`恢复${field.label}`" :data-testid="`element-color-reset-${field.key}`" @click="reset(field.key)">恢复</button>
      </div>
    </div>
    <p v-if="error" class="element-colors__error" role="alert">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { NodeAppearance, OpdNode } from "@/shared/types/modeling";
import { defaultNodeAppearance, nodeAppearance, normalizeNodeAppearance } from "@/shared/nodeAppearance";

const props = defineProps<{ node: OpdNode; readonly: boolean; appearance?: NodeAppearance; saving?: boolean; error?: string }>();
const emit = defineEmits<{ change: [value: NodeAppearance] }>();
const fields = [{ key: "stroke", label: "边框颜色" }, { key: "fill", label: "填充颜色" }] as const;
const colors = computed(() => nodeAppearance(props.node, { [props.node.kind]: props.appearance }));
const overrides = computed(() => normalizeNodeAppearance(props.node.appearance));
function reset(key: keyof NodeAppearance) {
  if (props.readonly) return;
  const appearance = { ...overrides.value };
  delete appearance[key];
  emit('change', appearance);
}
function change(key: keyof NodeAppearance, event: Event) {
  if (props.readonly) return;
  const appearance = { ...normalizeNodeAppearance(props.node.appearance) };
  const value = (event.target as HTMLInputElement).value.toLowerCase();
  if (value === (normalizeNodeAppearance(props.appearance)?.[key] ?? defaultNodeAppearance(props.node.kind)[key])) delete appearance[key];
  else appearance[key] = value;
  emit("change", appearance);
}
</script>

<style scoped>
.element-colors { display: grid; gap: 7px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e7edf3; }
.element-colors .inspector-section__heading { margin-bottom: 2px; }
.element-colors__error { margin: 0; color: #c0362c; font-size: 12px; }
.element-colors__row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 36px; padding: 4px 8px; border: 1px solid #edf1f6; border-radius: 6px; background: #f8fafc; color: #526479; font-size: 12px; }
.element-colors__control { display: flex; align-items: center; gap: 7px; }
.element-colors__control input { width: 32px; height: 28px; padding: 3px; border: 1px solid #dce5ee; border-radius: 6px; background: #fff; cursor: pointer; }
.element-colors__control input:disabled { cursor: default; opacity: .6; }
.element-colors__control code { min-width: 54px; color: #64748b; font-size: 11px; }
.element-colors__reset { padding: 4px 5px; border: 0; border-radius: 4px; background: transparent; color: #1769c2; font-size: 11px; white-space: nowrap; cursor: pointer; }
.element-colors__reset:hover:not(:disabled) { background: #e6effc; }
.element-colors__reset:disabled { color: #aebaca; cursor: default; }
</style>
