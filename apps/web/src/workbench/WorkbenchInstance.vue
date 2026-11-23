<template>
  <div class="opm-workbench" :class="{ 'opm-workbench--host': !!host }">
    <WorkbenchSurface
      ref="surface" :runtime="runtime" :navigation="navigation"
      :show-header="showHeader" :project-navigation="projectNavigation"
      :show-profile="showProfile" :show-version-controls="showVersionControls"
      :assistant-enabled="!!props.services?.assistant && !props.data" :analysis-enabled="!!props.services && !props.data"
      :default-fold-features="!!props.services && !props.data"
      :global-shortcuts="!!host" :permalink-enabled="!!host" @navigate-project="emit('navigateProject', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, provide, reactive, ref, watch } from "vue";
import { randomUuid } from "@/shared/platform/browserCrypto";
import { createPinia } from "pinia";
import WorkbenchSurface from "@/modules/workbench/WorkbenchSurface.vue";
import { defineWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";
import type { WorkbenchContext, WorkbenchHandle, WorkbenchServices, WorkbenchSnapshot } from "./contracts";
import type { WorkbenchDestination, WorkbenchNavigation } from "./internal";
import { workbenchHostKey } from "./host";
import { unavailableWorkbenchServices, workbenchDomScopeKey, workbenchServicesKey } from "./services";

const props = withDefaults(defineProps<{
  context?: WorkbenchContext;
  data?: WorkbenchSnapshot;
  services?: WorkbenchServices;
  showHeader?: boolean;
  projectNavigation?: boolean;
  showProfile?: boolean;
  showVersionControls?: boolean;
}>(), { context: () => ({}), data: undefined, services: undefined, showHeader: false, projectNavigation: false, showProfile: false, showVersionControls: false });
const emit = defineEmits<{
  navigateProject: [projectId: string];
  contextChange: [contextId: string];
  revisionChange: [revision: string | undefined];
  selectionChange: [ids: string[]];
  primarySelectionChange: [id: string];
  ready: [];
  error: [message: string];
}>();
const host = inject(workbenchHostKey, null);
const instanceId = `opm-${randomUuid()}`;
provide(workbenchDomScopeKey, host ? "" : instanceId);
const services = props.services ?? unavailableWorkbenchServices;
provide(workbenchServicesKey, services);
const pinia = createPinia();
const runtime = host?.runtime ?? defineWorkbenchRuntimeStore(services.api, services.createSession)(pinia);
const surface = ref<WorkbenchHandle>();
const location = reactive({ path: "embedded", fullPath: "embedded", query: {} as Record<string, unknown> });
function resolve(target: WorkbenchDestination) {
  const query = new URLSearchParams(Object.entries(target.query).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const fullPath = `${target.path ?? location.path}?${query}`;
  return { fullPath, href: fullPath };
}
async function navigate(target: WorkbenchDestination) {
  if (!await surface.value?.prepareLeave(true)) return;
  if (target.query.revision && target.query.revision !== "head" && !props.services) return;
  location.query = { ...target.query }; location.fullPath = resolve(target).fullPath;
}
const navigation: WorkbenchNavigation = host?.navigation ?? { location, push: navigate, replace: navigate, resolve };
const inputIdentity = computed(() => JSON.stringify([props.context?.project?.id, props.context?.model?.id,
  props.context?.activeContextId, props.context?.revision]));
let sequence = 0, canonicalLocation = "", previousIdentity = inputIdentity.value;
watch([() => navigation.location.fullPath, inputIdentity, () => props.data], async ([fullPath]) => {
  const current = ++sequence;
  if (host && canonicalLocation === fullPath) { canonicalLocation = ""; return; }
  const context = props.context ?? {};
  if (!host && previousIdentity !== inputIdentity.value) {
    previousIdentity = inputIdentity.value;
    location.query = {};
  }
  if (props.data || !props.services) {
    runtime.setSnapshot({ ...context, activeContextId: typeof location.query.context === "string" ? location.query.context : context.activeContextId }, props.data ?? { diagrams: [] });
  } else {
    if (!context.project?.id || !context.model?.id) {
      runtime.setSnapshot(context, { diagrams: [] });
      emit("error", "服务模式需要项目和模型 ID。"); return;
    }
    runtime.clearSnapshot();
    const query = navigation.location.query;
    const loaded = await runtime.load(context.project.id, context.model.id,
      typeof query.context === "string" ? query.context : context.activeContextId,
      typeof query.revision === "string" ? query.revision : context.revision);
    if (current !== sequence) return;
    if (!loaded) { emit("error", runtime.workbench.commandFeedback); return; }
    if (context.project.name !== undefined) runtime.projectName = context.project.name;
    if (context.model.name !== undefined) runtime.modelName = context.model.name;
    if (host) {
      const target = { path: navigation.location.path, query: runtime.workbench.locationMode === "HEAD"
        ? { context: runtime.workbench.activeContextId }
        : { context: runtime.workbench.activeContextId, revision: runtime.workbench.revision }, hash: "" };
      const canonical = navigation.resolve(target).fullPath;
      if (canonical !== fullPath) { canonicalLocation = canonical; await navigation.replace(target); }
    }
  }
  if (current === sequence) emit("ready");
}, { immediate: true });
watch(() => [props.context?.project?.name, props.context?.model?.name, props.context?.profileLabel,
  runtime.projectName, runtime.modelName, runtime.profileLabel], () => {
  if (props.context?.project?.name !== undefined) runtime.projectName = props.context.project.name;
  if (props.context?.model?.name !== undefined) runtime.modelName = props.context.model.name;
  if (props.context?.profileLabel !== undefined) runtime.profileLabel = props.context.profileLabel;
}, { immediate: true, flush: "sync" });
watch(() => runtime.workbench.activeContextId, id => emit("contextChange", id));
watch(() => runtime.workbench.revision, revision => emit("revisionChange", revision || undefined));
watch(() => [...runtime.selectedIds], ids => emit("selectionChange", ids));
watch(() => runtime.workbench.selectedId, id => emit("primarySelectionChange", id));
onBeforeUnmount(() => { sequence++; if (!host) runtime.$dispose(); });
defineExpose({
  prepareLeave: (keepAnalysis = false) => surface.value?.prepareLeave(keepAnalysis) ?? Promise.resolve(true),
  save: () => surface.value?.save() ?? Promise.resolve(),
  saveWithResult: () => surface.value?.saveWithResult() ?? Promise.resolve(null),
  validate: () => surface.value?.validate() ?? Promise.resolve(),
  resize: () => surface.value?.resize(),
  locateConstruct: (semanticId: string, contextId?: string) => surface.value?.locateConstruct(semanticId, contextId) ?? Promise.resolve(false),
});
</script>

<style scoped>
.opm-workbench { height: 100%; min-height: 360px; min-width: 0; }
.opm-workbench :deep(.workbench) { height: 100%; min-height: 360px; }
.opm-workbench--host { height: calc(100vh - 56px); min-height: 620px; }
.opm-workbench--host :deep(.workbench) { min-height: 620px; }
.opm-workbench :deep(.workbench--header-hidden) { grid-template-rows: minmax(0, 1fr) var(--workbench-bottom-track-height); }
</style>
