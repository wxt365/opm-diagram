<template>
  <button class="tool-button tool-button--icon" type="button" :title="active ? '退出全屏 / Exit fullscreen' : '全屏画布 / Fullscreen canvas'" :aria-label="active ? '退出全屏 / Exit fullscreen' : '全屏画布 / Fullscreen canvas'" :aria-pressed="active" :disabled="!supported || busy" data-testid="p03-canvas-fullscreen" @click="toggle"><Minimize v-if="active" :size="18" aria-hidden="true" /><Maximize v-else :size="18" aria-hidden="true" /></button>
  <span v-if="error" class="canvas-fullscreen-error" role="status">{{ error }}</span>
</template>
<script setup lang="ts">
import { Maximize, Minimize } from "@lucide/vue";
import { onBeforeUnmount, onMounted, ref } from "vue";
const props = defineProps<{ target?: HTMLElement }>();
const active = ref(false), supported = ref(false), busy = ref(false), error = ref("");
function sync() { active.value = !!props.target && document.fullscreenElement === props.target; }
async function toggle() {
  if (!props.target || busy.value) return;
  busy.value = true; error.value = "";
  try { if (active.value) await document.exitFullscreen(); else await props.target.requestFullscreen(); sync(); }
  catch { error.value = "无法进入全屏，请检查浏览器权限"; }
  finally { busy.value = false; }
}
onMounted(() => { supported.value = !!document.fullscreenEnabled; document.addEventListener("fullscreenchange", sync); });
onBeforeUnmount(() => { document.removeEventListener("fullscreenchange", sync); });
</script>
<style scoped>
.canvas-fullscreen-error { color: #744f00; font-size: 12px; }
</style>
