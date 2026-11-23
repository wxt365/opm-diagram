<template>
  <p v-if="connecting" class="opm-connection-status" role="status">正在连接 OPM 工作台…</p>
  <p v-else-if="connectionError" class="opm-connection-error" role="alert">{{ connectionError }} <button type="button" @click="reload">重新连接</button></p>
  <WorkbenchInstance
    v-else
    ref="instance" :key="serviceVersion" v-bind="instanceOptions"
    @navigate-project="emit('navigateProject', $event)" @context-change="emit('contextChange', $event)"
    @revision-change="emit('revisionChange', $event)" @selection-change="emit('selectionChange', $event)"
    @primary-selection-change="emit('primarySelectionChange', $event)"
    @ready="emit('ready')" @error="emit('error', $event)"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import WorkbenchInstance from "./WorkbenchInstance.vue";
import { createOpmClient } from "./client";
import type { WorkbenchBinding, WorkbenchConnectionOptions, WorkbenchSource, WorkbenchContext, WorkbenchHandle, WorkbenchServices, WorkbenchSnapshot } from "./contracts";
const props = defineProps<{
  backendUrl?: string; assistantUrl?: string; accessToken?: WorkbenchConnectionOptions["accessToken"];
  source?: WorkbenchSource; binding?: WorkbenchBinding;
  context?: WorkbenchContext; data?: WorkbenchSnapshot; services?: WorkbenchServices;
  showHeader?: boolean; projectNavigation?: boolean;
  showProfile?: boolean; showVersionControls?: boolean;
}>();
const emit = defineEmits<{
  navigateProject: [projectId: string]; contextChange: [contextId: string];
  revisionChange: [revision: string | undefined]; selectionChange: [ids: string[]];
  primarySelectionChange: [id: string];
  ready: []; error: [message: string]; bound: [binding: WorkbenchBinding];
}>();
const instance = ref<WorkbenchHandle>(), serviceVersion = ref(0);
const connecting = ref(false), connectionError = ref("");
const connection = shallowRef<{ client: ReturnType<typeof createOpmClient>; binding: WorkbenchBinding }>();
const addressMode = computed(() => props.backendUrl !== undefined && !props.data);
const instanceOptions = computed(() => ({
  context: addressMode.value && connection.value ? {
    ...props.context,
    project: { id: connection.value.binding.projectId, name: props.source?.projectName ?? props.context?.project?.name },
    model: { id: connection.value.binding.modelId, name: props.source?.modelName ?? props.context?.model?.name },
  } : props.context,
  data: props.data,
  services: addressMode.value ? connection.value?.client.services : props.services,
  showHeader: props.showHeader, projectNavigation: props.projectNavigation,
  showProfile: props.showProfile, showVersionControls: props.showVersionControls,
}));
watch(() => instanceOptions.value.services, () => { serviceVersion.value++; });
let sequence = 0, previousSettings = "", previousSource = "";
let previousToken: WorkbenchConnectionOptions["accessToken"];
const retry = ref(0);
watch([() => props.backendUrl, () => props.assistantUrl, () => props.accessToken,
  () => JSON.stringify([props.source?.systemId ?? "default", props.source?.projectId, props.source?.modelId]),
  () => JSON.stringify(props.binding), () => !!props.data, retry], async () => {
  const current = ++sequence;
  connectionError.value = "";
  if (!addressMode.value) {
    connecting.value = false; connection.value = undefined;
    if ((props.source || props.binding) && !props.data && !props.services) {
      connectionError.value = "地址模式需要传入 backendUrl。"; emit("error", connectionError.value);
    }
    return;
  }
  const settings = JSON.stringify([props.backendUrl, props.assistantUrl]);
  const identity = JSON.stringify([props.source?.systemId ?? "default", props.source?.projectId, props.source?.modelId]);
  if (connection.value && settings === previousSettings && props.accessToken === previousToken && identity === previousSource
    && props.binding?.projectId === connection.value.binding.projectId && props.binding.modelId === connection.value.binding.modelId) return;
  connecting.value = true;
  const retained = connection.value;
  connection.value = undefined;
  try {
    const client = retained && settings === previousSettings && props.accessToken === previousToken
      ? retained.client : createOpmClient({ backendUrl: props.backendUrl!, assistantUrl: props.assistantUrl, accessToken: props.accessToken });
    const binding = await client.ensureWorkspace(props.source, props.binding);
    if (current !== sequence) return;
    previousSettings = settings; previousToken = props.accessToken; previousSource = identity;
    connection.value = { client, binding }; connecting.value = false;
    emit("bound", { ...binding });
  } catch (error) {
    if (current !== sequence) return;
    connectionError.value = error instanceof Error ? error.message : "OPM 连接失败。";
    connecting.value = false; emit("error", connectionError.value);
  }
}, { immediate: true });
function reload() { connection.value = undefined; retry.value++; }
onBeforeUnmount(() => { sequence++; });
defineExpose({
  prepareLeave: (keepAnalysis = false) => instance.value?.prepareLeave(keepAnalysis) ?? Promise.resolve(true),
  save: () => instance.value?.save() ?? Promise.resolve(),
  saveWithResult: () => instance.value?.saveWithResult() ?? Promise.resolve(null),
  validate: () => instance.value?.validate() ?? Promise.resolve(),
  resize: () => instance.value?.resize(),
  locateConstruct: (semanticId: string, contextId?: string) => instance.value?.locateConstruct(semanticId, contextId) ?? Promise.resolve(false),
  reload,
});
</script>
