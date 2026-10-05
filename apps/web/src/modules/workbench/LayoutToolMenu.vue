<template>
  <div class="layout-tool-menu">
    <button ref="trigger" class="tool-button tool-button--icon" type="button" title="对齐、分布与自动布局 / Layout tools" aria-label="布局工具" aria-haspopup="menu" :aria-expanded="open" aria-controls="opd-layout-menu" :disabled="disabled" data-testid="opd-layout-menu-toggle" @mousedown.prevent @click="toggle">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 3v18" /><rect x="4" y="6" width="9" height="4" rx="1" /><rect x="4" y="14" width="15" height="4" rx="1" /></svg>
    </button>
    <Teleport to="body">
      <section v-if="open" id="opd-layout-menu" ref="menu" class="layout-menu" role="menu" aria-label="布局工具" :style="style" data-testid="opd-layout-menu" @keydown="menuKey">
        <LayoutActionItems :state="state" @arrange="choose" />
        <div class="layout-menu__distribute">
          <button class="layout-menu__item" role="menuitem" type="button" :disabled="autoLayoutDisabled" title="整理当前 OPD，先预览再应用。" data-testid="opd-layout-auto" @mousedown.prevent @click="chooseAutoLayout">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="9" width="5" height="6" rx="1" /><rect x="17" y="2" width="5" height="6" rx="1" /><rect x="17" y="16" width="5" height="6" rx="1" /><path d="M7 12h5V5h5m-5 7v7h5" /></svg>
            <span>自动布局…</span>
          </button>
        </div>
      </section>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import LayoutActionItems from "./LayoutActionItems.vue";
import type { LayoutAction } from "@/stores/workbench/layoutArrangement";
const props = defineProps<{ disabled: boolean; autoLayoutDisabled?: boolean; state: { canAlign: boolean; canDistribute: boolean; reason: string; referenceLabel: string; count: number } }>();
const emit = defineEmits<{ arrange: [action: LayoutAction]; autoLayout: [] }>();
const open = ref(false), trigger = ref<HTMLButtonElement>(), menu = ref<HTMLElement>();
const style = ref({ left: "8px", top: "8px", width: "272px" });
function positionMenu() {
  if (!open.value || !trigger.value) return;
  const bounds = trigger.value.getBoundingClientRect(), width = Math.min(272, window.innerWidth - 16);
  const height = menu.value?.getBoundingClientRect().height ?? 280;
  style.value = { width: `${width}px`, left: `${Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8))}px`,
    top: `${Math.max(8, Math.min(bounds.bottom + 8, window.innerHeight - height - 8))}px` };
}
async function toggle(event: MouseEvent) {
  open.value = !open.value;
  if (!open.value) return;
  positionMenu(); await nextTick(); positionMenu();
  if (event.detail === 0) menu.value?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
}
function chooseAutoLayout() { open.value = false; emit("autoLayout"); }
function choose(action: LayoutAction) { open.value = false; emit("arrange", action); }
function outside(event: Event) {
  if (event.target instanceof Node && !trigger.value?.contains(event.target) && !menu.value?.contains(event.target)) open.value = false;
}
function menuKey(event: KeyboardEvent) {
  if (event.key === "Escape") { event.preventDefault(); open.value = false; trigger.value?.focus(); return; }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const buttons = [...(menu.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
  if (!buttons.length) return;
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
    : (current + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
  buttons[index]?.focus();
}
function escape(event: KeyboardEvent) { if (open.value && event.key === "Escape") menuKey(event); }
onMounted(() => { document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside); window.addEventListener("resize", positionMenu); window.addEventListener("scroll", positionMenu, true); window.addEventListener("keydown", escape); });
onBeforeUnmount(() => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); window.removeEventListener("resize", positionMenu); window.removeEventListener("scroll", positionMenu, true); window.removeEventListener("keydown", escape); });
watch(() => props.disabled, disabled => { if (disabled) open.value = false; });
</script>

<style scoped>
.layout-tool-menu { flex: 0 0 auto; }
.layout-menu { position: fixed; z-index: 100; padding: 8px; border: 1px solid #d4dce5; border-radius: 8px; background: #fff; box-shadow: 0 6px 24px #162b431f; max-height: calc(100vh - 16px); overflow-y: auto; }
.layout-menu__distribute { display: grid; gap: 4px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e3e8ee; }
.layout-menu__item { display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 7px 8px; border: 0; border-radius: 4px; background: transparent; color: #26394c; text-align: left; font-size: 13px; cursor: pointer; }
.layout-menu__item svg { flex: 0 0 auto; }
.layout-menu__item:hover:enabled, .layout-menu__item:focus-visible { background: #eaf3fc; outline: 2px solid #a8c9e9; outline-offset: -2px; }
.layout-menu__item:disabled { color: #98a5b2; cursor: default; }
</style>
