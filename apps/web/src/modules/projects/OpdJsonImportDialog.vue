<template>
  <div class="overlay-backdrop" @click.self="closeDialog">
    <form :ref="setDialogElement" class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="opd-import-title" data-testid="opd-json-import-dialog" @keydown="onDialogKeydown" @submit.prevent="submit">
      <div class="dialog-panel__header"><h2 id="opd-import-title">导入 OPD JSON</h2></div>
      <div class="dialog-panel__body opd-import-fields">
        <p>导入后创建独立模型，保留文件中的 OPD、子图及父级依赖。</p>
        <label>JSON 文件<input ref="fileInput" type="file" accept=".json,application/json" :disabled="busy" data-testid="opd-json-file" @change="readFile"></label>
        <template v-if="packageFile">
          <p data-testid="opd-json-preview">{{ entryName }} · {{ packageFile.semantic_revision.contexts.length }} 张图 · {{ packageFile.semantic_revision.elements.length }} 个元素 · {{ packageFile.semantic_revision.states.length }} 个状态 · {{ packageFile.semantic_revision.facts.length }} 条关系</p>
          <label>新模型名称<input v-model="name" maxlength="256" required :disabled="busy" data-testid="opd-json-model-name"></label>
        </template>
        <p v-if="error" class="command-feedback" role="alert" data-testid="opd-json-import-error">{{ error }}</p>
      </div>
      <div class="dialog-panel__footer"><button class="button button--secondary" type="button" :disabled="busy" @click="closeDialog">取消</button><button class="button button--primary" type="submit" :disabled="busy || reading || !packageFile || !name.trim()" data-testid="opd-json-import-confirm">{{ busy ? '正在导入…' : '导入并打开' }}</button></div>
    </form>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useDialogFocus } from "@/shared/composables/useDialogFocus";
import { localRuntimeApi, type OpdJsonPackageWire } from "@/shared/api/localRuntimeApi";
const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ close: []; imported: [model: string, context: string] }>();
const packageFile = ref<OpdJsonPackageWire>(), name = ref(""), error = ref(""), busy = ref(false), reading = ref(false);
const entryName = computed(() => packageFile.value?.semantic_revision.contexts.find(item => item.context_id === packageFile.value?.entry_context_id)?.name.local_name ?? "");
let generation = 0, commandId = "", requestName = "";
const fileInput = ref<HTMLInputElement>();
const { closeDialog, onDialogKeydown, setDialogElement } = useDialogFocus(computed(() => true), () => { if (!busy.value) emit("close"); });
onMounted(async () => { await nextTick(); fileInput.value?.focus(); });
onBeforeUnmount(() => { generation++; });
async function readFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0], current = ++generation;
  packageFile.value = undefined; error.value = ""; commandId = ""; reading.value = false;
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { error.value = "JSON 文件不能超过 10 MiB"; return; }
  reading.value = true;
  try {
    const value: unknown = JSON.parse(await file.text());
    if (current !== generation) return;
    const data = value as Partial<OpdJsonPackageWire>;
    if (!data || data.format !== "OPM-OPD-JSON" || data.format_version !== "1.0" || !data.semantic_revision
      || !Array.isArray(data.semantic_revision.contexts) || !Array.isArray(data.semantic_revision.elements)
      || !Array.isArray(data.semantic_revision.states) || !Array.isArray(data.semantic_revision.facts)
      || !data.semantic_revision.contexts.every(item => item && typeof item.context_id === "string" && typeof item.name?.local_name === "string")
      || !data.semantic_revision.contexts.some(item => item.context_id === data.entry_context_id)) throw new Error("文件不是支持的 OPD JSON 1.0 格式");
    packageFile.value = data as OpdJsonPackageWire; name.value = `${entryName.value}（导入）`.slice(0, 256);
  } catch (cause) { if (current === generation) error.value = cause instanceof SyntaxError ? "JSON 文件无法解析" : cause instanceof Error ? cause.message : "无法读取文件"; }
  finally { if (current === generation) reading.value = false; }
}
async function submit() {
  if (busy.value || !packageFile.value || !name.value.trim()) return;
  if (!commandId || requestName !== name.value.trim()) { commandId = `command.opd-import.${crypto.randomUUID().replaceAll("-", "")}`; requestName = name.value.trim(); }
  busy.value = true; error.value = "";
  try { const model = await localRuntimeApi.importOpdJson(props.projectId, requestName, packageFile.value, commandId); emit("imported", model.model_id, model.context_id); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : "导入失败，请重试"; }
  finally { busy.value = false; }
}
</script>
<style scoped>
.opd-import-fields { display: grid; gap: 14px; }
.opd-import-fields label { display: grid; gap: 6px; }
.opd-import-fields p { margin: 0; font-size: 13px; line-height: 1.6; }
</style>
