<template>
  <Teleport to="body">
    <section ref="menu" class="canvas-context-menu" :class="{ 'canvas-context-menu--arrange': arranging }" role="menu" aria-label="画布操作" :style="style" data-testid="opd-blank-menu">
      <template v-if="arranging">
        <button type="button" role="menuitem" data-testid="opd-blank-layout-back" @mousedown.prevent @click="back"><ChevronLeft :size="18" aria-hidden="true" /><span>返回画布操作</span></button>
        <LayoutActionItems :state="arrangementState" test-prefix="opd-blank-layout" @arrange="chooseArrangement" />
      </template>
      <template v-else>
        <button type="button" role="menuitem" :disabled="actionsDisabled || !canUndo" data-testid="opd-blank-undo" @mousedown.prevent @click="chooseHistory(false)"><Undo2 :size="18" aria-hidden="true" /><span>撤销布局</span><kbd>⌘/Ctrl Z</kbd></button>
        <button type="button" role="menuitem" :disabled="actionsDisabled || !canRedo" data-testid="opd-blank-redo" @mousedown.prevent @click="chooseHistory(true)"><Redo2 :size="18" aria-hidden="true" /><span>重做布局</span><kbd>⇧ ⌘/Ctrl Z</kbd></button>
        <hr>
        <button type="button" role="menuitem" aria-haspopup="menu" :disabled="actionsDisabled || !arrangementState.canAlign" :title="arrangementState.reason || '至少多选两个元素；等距分布需要三个'" data-testid="opd-blank-arrange" @mousedown.prevent @click="openArrangement"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 3v18" /><rect x="4" y="6" width="9" height="4" rx="1" /><rect x="4" y="14" width="15" height="4" rx="1" /></svg><span>对齐与分布</span><ChevronRight :size="16" class="canvas-context-menu__end" aria-hidden="true" /></button>
        <button type="button" role="menuitem" :disabled="disabled" :title="disabled ? '当前状态不可自动布局' : '整理当前 OPD 的全部元素，先预览再应用'" data-testid="opd-blank-auto-layout" @mousedown.prevent @click="choose">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="9" width="5" height="6" rx="1" /><rect x="17" y="2" width="5" height="6" rx="1" /><rect x="17" y="16" width="5" height="6" rx="1" /><path d="M7 12h5V5h5m-5 7v7h5" /></svg>
          <span>自动布局…</span>
        </button>
        <p>{{ disabled ? '当前状态不可自动布局' : '整理当前 OPD，无需全选' }}</p>
      </template>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ChevronLeft, ChevronRight, Undo2, Redo2 } from "@lucide/vue";
import LayoutActionItems from "./LayoutActionItems.vue";
import type { LayoutAction } from "@/stores/workbench/layoutArrangement";

const props = defineProps<{ anchor: { clientX: number; clientY: number }; disabled: boolean; actionsDisabled?: boolean; canUndo?: boolean; canRedo?: boolean; state?: { canAlign: boolean; canDistribute: boolean; reason: string; referenceLabel: string; count: number } }>();
const emit = defineEmits<{ close: []; autoLayout: []; history: [redo: boolean]; arrange: [action: LayoutAction] }>();
const arranging = ref(false);
const arrangementState = computed(() => ({ ...(props.state ?? { canAlign: false, canDistribute: false, reason: "", referenceLabel: "", count: 0 }),
  canAlign: !!props.state?.canAlign && !props.actionsDisabled, canDistribute: !!props.state?.canDistribute && !props.actionsDisabled }));
const menu = ref<HTMLElement>();
const style = ref({ left: "8px", top: "8px" });
function position() {
  const bounds = menu.value?.getBoundingClientRect();
  style.value = {
    left: `${Math.max(8, Math.min(props.anchor.clientX, window.innerWidth - (bounds?.width ?? 224) - 8))}px`,
    top: `${Math.max(8, Math.min(props.anchor.clientY, window.innerHeight - (bounds?.height ?? 84) - 8))}px`,
  };
}
function close() { emit("close"); }
function choose() { if (!props.disabled) { close(); emit("autoLayout"); } }
function chooseHistory(redo: boolean) { if (!props.actionsDisabled && (redo ? props.canRedo : props.canUndo)) { close(); emit("history", redo); } }
function chooseArrangement(action: LayoutAction) {
  if (action.startsWith("distribute-") ? !arrangementState.value.canDistribute : !arrangementState.value.canAlign) return;
  close(); emit("arrange", action);
}
async function openArrangement() {
  if (!arrangementState.value.canAlign) return;
  arranging.value = true; await nextTick(); position();
  menu.value?.querySelector<HTMLButtonElement>('[data-testid^="opd-blank-layout-"]:not(:disabled):not([data-testid="opd-blank-layout-back"])')?.focus();
}
async function back() {
  arranging.value = false; await nextTick(); position();
  menu.value?.querySelector<HTMLButtonElement>('[data-testid="opd-blank-arrange"]')?.focus();
}
function outside(event: Event) {
  if (event.target instanceof Node && !menu.value?.contains(event.target)) close();
}
function keydown(event: KeyboardEvent) {
  // 菜单优先处理按键，避免关闭菜单时同时取消连线/预览或删除选中元素。
  if (!["Escape", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", "Delete", "Backspace"].includes(event.key)) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (event.key === "Escape") { if (arranging.value) void back(); else close(); }
  else if (event.key === "ArrowLeft" && arranging.value) void back();
  else if (event.key === "ArrowRight" && document.activeElement?.getAttribute("data-testid") === "opd-blank-arrange") void openArrangement();
  else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    const buttons = [...(menu.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : current < 0 ? (event.key === "ArrowUp" ? buttons.length - 1 : 0) : (current + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
    buttons[index]?.focus();
  }
}
watch(() => props.anchor, () => { arranging.value = false; void nextTick(position); });
function scrolled(event: Event) { if (!(event.target instanceof Node) || !menu.value?.contains(event.target)) close(); }
onMounted(() => {
  position();
  document.addEventListener("pointerdown", outside);
  document.addEventListener("focusin", outside);
  window.addEventListener("keydown", keydown, true);
  window.addEventListener("resize", close);
  window.addEventListener("scroll", scrolled, true);
  window.addEventListener("blur", close);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside);
  document.removeEventListener("focusin", outside);
  window.removeEventListener("keydown", keydown, true);
  window.removeEventListener("resize", close);
  window.removeEventListener("scroll", scrolled, true);
  window.removeEventListener("blur", close);
});
</script>

<style scoped>
.canvas-context-menu { position: fixed; z-index: 100; width: 248px; max-width: calc(100vw - 16px); max-height: calc(100vh - 16px); overflow-y: auto; box-sizing: border-box; padding: 6px; border: 1px solid #d4dce5; border-radius: 8px; background: #fff; box-shadow: 0 6px 24px #162b431f; }
.canvas-context-menu--arrange { width: 272px; }
.canvas-context-menu button { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 36px; padding: 7px 8px; border: 0; border-radius: 4px; background: transparent; color: #26394c; text-align: left; font-size: 13px; cursor: pointer; }
.canvas-context-menu button:hover:enabled, .canvas-context-menu button:focus-visible { background: #eaf3fc; outline: 2px solid #a8c9e9; outline-offset: -2px; }
.canvas-context-menu button:disabled { color: #98a5b2; cursor: default; }
.canvas-context-menu p { margin: 4px 8px; color: #586b7e; font-size: 12px; line-height: 1.5; }
.canvas-context-menu hr { margin: 4px 0; border: 0; border-top: 1px solid #e3e8ee; }
.canvas-context-menu kbd, .canvas-context-menu__end { margin-left: auto; }
.canvas-context-menu kbd { font-family: inherit; font-size: 11px; color: #586b7e; }
</style>
