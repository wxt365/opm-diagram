<template>
  <div ref="controls" class="canvas-zoom-controls" role="group" aria-label="画布缩放" data-testid="p03-zoom-controls" @pointerdown.stop @contextmenu.stop.prevent>
    <button class="tool-button tool-button--icon" type="button" title="缩小视图 / Zoom out" aria-label="缩小视图 / Zoom out" data-testid="p03-zoom-out" @mousedown.prevent @click="choose(zoom - 10)"><ZoomOut :size="18" aria-hidden="true" /></button>
    <div class="canvas-zoom-controls__value">
      <input ref="input" v-model="text" aria-label="缩放百分比" title="输入缩放百分比，Enter 应用，Esc 取消" inputmode="decimal" autocomplete="off" spellcheck="false" data-testid="p03-zoom-output" :aria-invalid="!!error" @input="dirty = true; error = ''" @focus="input?.select()" @blur="commit" @keydown.enter.prevent.stop="applyInput" @keydown.esc.prevent.stop="cancelInput" @keydown.down.prevent.stop="openMenu">
      <button ref="trigger" class="canvas-zoom-controls__toggle" type="button" title="选择缩放比例" aria-label="选择缩放比例" aria-haspopup="menu" :aria-expanded="open" aria-controls="canvas-zoom-menu" data-testid="p03-zoom-menu-toggle" @click="toggleMenu"><ChevronDown :size="14" aria-hidden="true" /></button>
    </div>
    <button class="tool-button tool-button--icon" type="button" title="放大视图 / Zoom in" aria-label="放大视图 / Zoom in" data-testid="p03-zoom-in" @mousedown.prevent @click="choose(zoom + 10)"><ZoomIn :size="18" aria-hidden="true" /></button>
    <p v-if="error" class="canvas-zoom-controls__error" role="status">{{ error }}</p>
    <section v-if="open" id="canvas-zoom-menu" ref="menu" class="canvas-zoom-menu" role="menu" aria-label="缩放比例" :style="{ maxHeight: `${menuHeight}px` }" data-testid="p03-zoom-menu" @keydown="menuKey">
      <button role="menuitem" type="button" title="适应画布 / Fit to view" data-testid="p03-zoom-fit" @click="action('fit')">适应画布</button>
      <button role="menuitem" type="button" title="恢复 100% / Reset zoom to 100%" data-testid="p03-zoom-reset" @click="action('reset')">恢复 100%</button>
      <div class="canvas-zoom-menu__separator" role="separator" />
      <button v-for="value in presets" :key="value" role="menuitemradio" :aria-checked="zoom === value" type="button" :data-testid="`p03-zoom-preset-${value}`" @click="choose(value, true)"><span>{{ value }}%</span><Check v-if="zoom === value" :size="14" aria-hidden="true" /></button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Check, ChevronDown, ZoomIn, ZoomOut } from "@lucide/vue";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
const props = defineProps<{ zoom: number }>();
const emit = defineEmits<{ zoom: [value: number]; fit: []; reset: [] }>();
const presets = [25, 50, 75, 100, 125, 150, 200, 300, 400];
const controls = ref<HTMLElement>(), input = ref<HTMLInputElement>(), trigger = ref<HTMLButtonElement>(), menu = ref<HTMLElement>();
const text = ref(`${props.zoom}%`), dirty = ref(false), error = ref(""), open = ref(false), menuHeight = ref(380);
watch(() => props.zoom, zoom => { if (!dirty.value) text.value = `${zoom}%`; });
function commit() {
  if (!dirty.value) return;
  const value = text.value.trim(), number = Number(value.replace(/%$/, ""));
  dirty.value = false;
  if (!/^\d+(?:\.\d+)?%?$/.test(value) || !Number.isFinite(number) || number <= 0) {
    text.value = `${props.zoom}%`; error.value = "请输入大于 0 的缩放百分比"; return;
  }
  choose(number);
}
function choose(value: number, returnFocus = false) {
  const zoom = Math.round(Math.max(0.01, Math.min(400, value)) * 100) / 100;
  dirty.value = false; error.value = ""; text.value = `${zoom}%`; open.value = false; emit("zoom", zoom);
  if (returnFocus) trigger.value?.focus();
}
function applyInput() { commit(); input.value?.blur(); }
function cancelInput() { dirty.value = false; error.value = ""; text.value = `${props.zoom}%`; open.value = false; input.value?.blur(); }
function action(kind: "fit" | "reset") { open.value = false; dirty.value = false; error.value = ""; if (kind === "fit") emit("fit"); else emit("reset"); trigger.value?.focus(); }
function measureMenu() {
  const surface = controls.value?.parentElement, bounds = controls.value?.getBoundingClientRect();
  if (surface && bounds) menuHeight.value = Math.max(40, bounds.top - surface.getBoundingClientRect().top - 16);
}
async function openMenu() { commit(); open.value = true; measureMenu(); await nextTick(); menu.value?.querySelector<HTMLButtonElement>("button")?.focus(); }
function toggleMenu(event: MouseEvent) {
  if (open.value) { open.value = false; return; }
  if (event.detail === 0) { void openMenu(); return; }
  open.value = true; measureMenu();
}
function outside(event: Event) { if (event.target instanceof Node && !controls.value?.contains(event.target)) open.value = false; }
function menuKey(event: KeyboardEvent) {
  if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); open.value = false; trigger.value?.focus(); return; }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const buttons = [...(menu.value?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
  buttons[index]?.focus();
}
function escape(event: KeyboardEvent) { if (open.value && event.key === "Escape") menuKey(event); }
onMounted(() => { document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside); window.addEventListener("resize", measureMenu); window.addEventListener("keydown", escape); });
onBeforeUnmount(() => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); window.removeEventListener("resize", measureMenu); window.removeEventListener("keydown", escape); });
</script>

<style scoped>
.canvas-zoom-controls { position: absolute; right: 12px; bottom: 12px; z-index: 10; display: flex; align-items: center; gap: 3px; padding: 4px; color: #53616d; background: #fff; border: 1px solid #d4dde4; border-radius: 7px; box-shadow: 0 2px 8px #23354714; }
.canvas-zoom-controls__value { display: flex; align-items: center; border: 1px solid transparent; border-radius: 4px; }
.canvas-zoom-controls__value:focus-within { border-color: #9fc8ec; box-shadow: 0 0 0 2px #eaf3fc; }
.canvas-zoom-controls input { width: 66px; min-height: 30px; padding: 3px 2px 3px 6px; text-align: center; color: inherit; font-size: 13px; font-variant-numeric: tabular-nums; background: transparent; border: 0; outline: 0; box-shadow: none; }
.canvas-zoom-controls__toggle { display: grid; place-items: center; width: 24px; height: 30px; padding: 0; color: inherit; background: transparent; border: 0; border-radius: 3px; }
.canvas-zoom-controls__toggle:hover { background: #eaf3fc; }
.canvas-zoom-menu { position: absolute; right: 0; bottom: calc(100% + 8px); display: grid; width: 192px; padding: 5px; overflow-y: auto; background: #fff; border: 1px solid #d4dde4; border-radius: 7px; box-shadow: 0 4px 18px #23354726; }
.canvas-zoom-menu button { display: flex; justify-content: space-between; align-items: center; min-height: 30px; padding: 5px 10px; color: #45535f; text-align: left; background: transparent; border: 0; border-radius: 3px; font-size: 13px; }
.canvas-zoom-menu button:hover, .canvas-zoom-menu button:focus-visible, .canvas-zoom-menu button[aria-checked="true"] { color: #0b5fae; background: #eaf3fc; outline: 0; }
.canvas-zoom-menu__separator { height: 1px; margin: 4px 0; background: #e3e8ee; }
.canvas-zoom-controls__error { position: absolute; right: 0; bottom: calc(100% + 8px); width: 210px; padding: 7px 10px; margin: 0; font-size: 12px; color: #744f00; background: #fff8df; border: 1px solid #e2c96b; border-radius: 4px; }
</style>
