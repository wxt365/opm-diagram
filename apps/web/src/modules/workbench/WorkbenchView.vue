<template>
  <OpmWorkbench
    ref="workbench" :context="context" :services="services" show-header project-navigation
    show-version-controls
    @navigate-project="router.push(`/projects/${projectId}`)"
  />
</template>

<script setup lang="ts">
import { computed, provide, ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from "vue-router";
import OpmWorkbench from "@/workbench/OpmWorkbench.vue";
import { workbenchHostKey } from "@/workbench/host";
import { createLocalRuntimeServices } from "@/workbench/localRuntimeServices";
import { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";
import type { WorkbenchHandle } from "@/workbench/contracts";
import { registerDesktopGuard } from "@/shared/desktop";

const route = useRoute(), router = useRouter();
const projectId = computed(() => typeof route.params.projectId === "string" ? route.params.projectId : "");
const modelId = computed(() => typeof route.params.modelId === "string" ? route.params.modelId : "");
const context = computed(() => ({ project: { id: projectId.value }, model: { id: modelId.value } }));
const services = createLocalRuntimeServices();
provide(workbenchHostKey, { runtime: useWorkbenchRuntimeStore(), navigation: {
  location: route,
  push: target => router.push(target), replace: target => router.replace(target),
  resolve: target => router.resolve(target),
} });
const workbench = ref<WorkbenchHandle>();
let unregisterDesktopGuard: (() => void) | undefined;
onMounted(() => {
  unregisterDesktopGuard = registerDesktopGuard(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await nextTick();
    const runtime = useWorkbenchRuntimeStore();
    if (runtime.saving || runtime.pendingDelivery || runtime.workbench.commandState === 'submitting') return false;
    if (!await workbench.value?.prepareLeave()) return false;
    return runtime.isReadonly || !!await workbench.value?.saveWithResult();
  });
});
onBeforeUnmount(() => unregisterDesktopGuard?.());
onBeforeRouteLeave(() => workbench.value?.prepareLeave() ?? true);
onBeforeRouteUpdate((to, from) => to.fullPath === from.fullPath || (workbench.value?.prepareLeave(to.path === from.path && to.query.revision === from.query.revision) ?? true));
</script>
