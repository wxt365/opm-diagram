<template>
  <div class="element-name-property">
    <label class="element-name-property__row">
      <span>名称</span>
      <input
        ref="input"
        v-model="value"
        data-testid="p03-inspector-name"
        aria-label="名称 / Name"
        :readonly="readonly || submitting"
        :aria-busy="submitting"
        :aria-invalid="!!error"
        :title="readonly ? '当前版本只读 / Read-only revision' : 'Enter 或移开焦点完成 / Finish · Escape 取消 / Cancel'"
        @keydown="keydown"
        @blur="blur"
        @compositionstart="composing = true"
        @compositionend="compositionEnd"
      >
    </label>
    <p v-if="error" class="element-name-property__error" role="alert">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps<{
  elementId: string;
  name: string;
  readonly: boolean;
  failureMessage?: string;
  submitNameEdit: (id: string, value: string) => Promise<boolean>;
}>();
const input = ref<HTMLInputElement>();
const value = ref(props.name);
const original = ref(props.name);
const error = ref("");
const composing = ref(false);
const submitting = ref(false);
let submitAfterComposition = false;
let disposed = false;
let pending: Promise<boolean> | undefined;

watch(() => props.name, (name) => {
  if (value.value === original.value || value.value === name) value.value = name;
  original.value = name;
});
onBeforeUnmount(() => { disposed = true; });

function finishNameEdit(): Promise<boolean> {
  if (pending) return pending;
  if (disposed || composing.value) return Promise.resolve(false);
  if (props.readonly || value.value === original.value) return Promise.resolve(true);
  // 捕获原目标及输入；节点切换后的异步结果不得回写新面板。
  const id = props.elementId, name = value.value;
  submitting.value = true; error.value = "";
  const work = (async () => {
    let succeeded = false;
    try { succeeded = await props.submitNameEdit(id, name); }
    catch { if (!disposed) error.value = "名称未保存，请重试。"; }
    if (disposed) return false;
    submitting.value = false;
    if (succeeded) {
      value.value = props.name; original.value = props.name;
    } else {
      error.value ||= props.failureMessage || "名称未保存，请检查输入后重试。";
      await nextTick();
      if (!disposed) input.value?.focus();
    }
    return succeeded;
  })().finally(() => { if (pending === work) pending = undefined; });
  pending = work;
  return work;
}

function keydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229 || composing.value || submitting.value) return;
  if (event.key === "Enter") { event.preventDefault(); void finishNameEdit(); }
  else if (event.key === "Escape") {
    event.preventDefault(); event.stopPropagation();
    value.value = props.name; original.value = props.name; error.value = "";
  }
}
function blur() {
  if (composing.value) submitAfterComposition = true;
  else void finishNameEdit();
}
async function compositionEnd() {
  composing.value = false;
  if (!submitAfterComposition) return;
  submitAfterComposition = false;
  await nextTick(); await finishNameEdit();
}
defineExpose({ finishNameEdit });
</script>

<style scoped>
.element-name-property { padding: 8px 0; border-bottom: 1px solid #edf0f3; }
.element-name-property__row { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #53616d; }
.element-name-property__row span { flex: 0 0 30px; }
.element-name-property__row input {
  width: 100%; min-width: 0; height: 28px; padding: 3px 6px;
  color: #25323d; font: inherit; font-size: 13px; line-height: 20px; background: #fff;
  border: 1px solid #dbe3e9; border-radius: 3px;
}
.element-name-property__row input:focus-visible { border-color: #2f7abf; outline: none; box-shadow: none; }
.element-name-property__row input:read-only { background: #f7f9fb; color: #53616d; }
.element-name-property__error { margin: 5px 0 0; color: #b42318; font-size: 12px; }
</style>
