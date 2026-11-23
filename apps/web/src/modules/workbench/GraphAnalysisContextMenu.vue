<template>
  <Teleport to="body">
    <section ref="menu" class="graph-context-menu" role="menu" aria-label="图谱画布操作" :style="position" @pointerdown.stop @contextmenu.prevent>
      <button type="button" role="menuitemcheckbox" :aria-checked="labels" @click="choose">{{ labels ? '隐藏标签' : '显示标签' }}</button>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{ anchor: { clientX: number; clientY: number }; labels: boolean }>();
const emit = defineEmits<{ close: []; toggleLabels: [] }>();
const menu = ref<HTMLElement>(), position = ref({ left: "8px", top: "8px" });
function place() {
  const bounds = menu.value?.getBoundingClientRect();
  position.value = { left: `${Math.max(8, Math.min(props.anchor.clientX, window.innerWidth - (bounds?.width ?? 224) - 8))}px`,
    top: `${Math.max(8, Math.min(props.anchor.clientY, window.innerHeight - (bounds?.height ?? 48) - 8))}px` };
  menu.value?.querySelector("button")?.focus();
}
function choose() { emit("toggleLabels"); emit("close"); }
function outside(event: Event) { if (event.target instanceof Node && !menu.value?.contains(event.target)) emit("close"); }
function keydown(event: KeyboardEvent) {
  if (!["Escape", "ArrowDown", "ArrowUp", "Home", "End", "Delete", "Backspace"].includes(event.key)) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (event.key === "Escape") emit("close"); else menu.value?.querySelector("button")?.focus();
}
function scrolled(event: Event) { if (!(event.target instanceof Node) || !menu.value?.contains(event.target)) emit("close"); }
function close() { emit("close"); }
watch(() => props.anchor, () => { void nextTick(place); });
onMounted(() => {
  place(); document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside);
  window.addEventListener("keydown", keydown, true); window.addEventListener("resize", close);
  window.addEventListener("scroll", scrolled, true); window.addEventListener("blur", close);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside);
  window.removeEventListener("keydown", keydown, true); window.removeEventListener("resize", close);
  window.removeEventListener("scroll", scrolled, true); window.removeEventListener("blur", close);
});
</script>

<style scoped>
.graph-context-menu { position:fixed; z-index:100; width:224px; max-width:calc(100vw - 16px); padding:6px; border:1px solid #d4dce5; border-radius:8px; background:#fff; box-shadow:0 6px 24px #162b431f; }
.graph-context-menu button { display:flex; align-items:center; width:100%; min-height:36px; padding:7px 8px; border:0; border-radius:4px; background:transparent; color:#26394c; text-align:left; font:inherit; font-size:13px; cursor:pointer; }
.graph-context-menu button:hover,.graph-context-menu button:focus-visible { background:#eaf3fc; outline:2px solid #a8c9e9; outline-offset:-2px; }
</style>
