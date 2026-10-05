<template>
  <div v-if="!stacked" ref="handle" class="navigator-resizer" :class="{ 'is-dragging': !!drag }" role="separator" aria-label="调整左侧工作区宽度" aria-orientation="vertical" aria-controls="workbench-left-dock" :aria-valuemin="minimumWidth" :aria-valuemax="maximumWidth" :aria-valuenow="currentWidth" :aria-valuetext="`${currentWidth} 像素`" tabindex="0" title="拖动调整宽度；双击恢复；左右键调整" data-testid="opd-navigator-resizer" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag" @lostpointercapture="endDrag" @keydown="resizeWithKeyboard" @dblclick="resize(defaultWidth)" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{ width?: number; defaultWidth?: number; inspectorOpen: boolean }>();
const emit = defineEmits<{ resize: [width: number] }>();
const minimumWidth = 180;
const maximumWidth = ref(420);
const screenWidth = ref(window.innerWidth);
const stacked = computed(() => screenWidth.value <= 680);
const defaultWidth = computed(() => props.defaultWidth ?? (screenWidth.value <= 980 ? 210 : 230));
const currentWidth = computed(() => props.width ?? defaultWidth.value);
const handle = ref<HTMLElement>();
const drag = ref<{ pointerId: number; startX: number; startWidth: number } | null>(null);

function resize(width: number) {
  if (stacked.value) return;
  const next = Math.max(minimumWidth, Math.min(maximumWidth.value, Math.round(width)));
  if (next !== currentWidth.value) emit("resize", next);
}

function stopDrag() {
  const pointerId = drag.value?.pointerId;
  drag.value = null;
  if (pointerId !== undefined && handle.value?.hasPointerCapture?.(pointerId)) handle.value.releasePointerCapture(pointerId);
}

function updateBounds() {
  stopDrag();
  screenWidth.value = window.innerWidth;
  if (stacked.value) return;
  const desktop = screenWidth.value > 980;
  const available = handle.value?.closest(".workbench-grid")?.clientWidth || screenWidth.value;
  // 属性区在桌面占一列，中等屏幕在下方；始终为画布留出操作空间。
  maximumWidth.value = Math.max(minimumWidth, Math.min(420, available - (desktop && props.inspectorOpen ? 320 : 0) - (desktop ? 400 : 320)));
  resize(currentWidth.value);
}

function startDrag(event: PointerEvent) {
  if (event.button !== 0 || event.isPrimary === false || drag.value || stacked.value) return;
  event.preventDefault();
  updateBounds();
  handle.value?.focus({ preventScroll: true });
  drag.value = { pointerId: event.pointerId, startX: event.clientX, startWidth: currentWidth.value };
  handle.value?.setPointerCapture?.(event.pointerId);
}

function moveDrag(event: PointerEvent) {
  if (!drag.value || drag.value.pointerId !== event.pointerId) return;
  resize(drag.value.startWidth + event.clientX - drag.value.startX);
}

function endDrag(event: PointerEvent) {
  if (drag.value?.pointerId === event.pointerId) stopDrag();
}

function resizeWithKeyboard(event: KeyboardEvent) {
  const widths: Record<string, number> = { ArrowLeft: currentWidth.value - 20, ArrowRight: currentWidth.value + 20, Home: minimumWidth, End: maximumWidth.value };
  const next = widths[event.key];
  if (next === undefined) return;
  event.preventDefault();
  resize(next);
}

watch(() => props.inspectorOpen, updateBounds, { flush: "post" });
watch(() => props.width, () => resize(currentWidth.value), { flush: "post" });
onMounted(() => {
  updateBounds();
  window.addEventListener("resize", updateBounds);
  window.addEventListener("blur", stopDrag);
});
onBeforeUnmount(() => {
  stopDrag();
  window.removeEventListener("resize", updateBounds);
  window.removeEventListener("blur", stopDrag);
});
</script>

<style scoped>
.navigator-resizer { position: absolute; top: 0; right: -4px; bottom: 0; z-index: 5; width: 8px; cursor: col-resize; touch-action: none; user-select: none; }
.navigator-resizer::after { position: absolute; top: calc(50% - 18px); left: 3px; width: 3px; height: 36px; content: ""; background: #cdd7df; border-radius: 2px; }
.navigator-resizer:hover::after, .navigator-resizer:focus-visible::after, .navigator-resizer.is-dragging::after { background: #0b6bcb; }
.navigator-resizer:focus-visible { background: #eaf3fc; outline: 2px solid #0b6bcb; outline-offset: -2px; }
</style>
