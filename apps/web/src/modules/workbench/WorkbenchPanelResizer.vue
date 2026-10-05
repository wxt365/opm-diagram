<template>
  <div ref="handle" class="bottom-panel__resizer" :class="{ 'is-dragging': !!drag }" role="separator" aria-label="调整底部面板高度" aria-orientation="horizontal" aria-controls="p03-bottom-content" :aria-valuemin="minimumHeight" :aria-valuemax="maximumHeight" :aria-valuenow="height" :aria-valuetext="`${height} 像素`" tabindex="0" title="拖动调整高度；双击恢复；方向键调整" data-testid="p03-bottom-resizer" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag" @lostpointercapture="endDrag" @keydown="resizeWithKeyboard" @dblclick="resize(240)" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{ height: number }>();
const emit = defineEmits<{ resize: [height: number] }>();
const minimumHeight = 210;
const maximumHeight = ref(640);
const handle = ref<HTMLElement>();
const drag = ref<{ pointerId: number; startY: number; startHeight: number } | null>(null);
let headerObserver: ResizeObserver | undefined;

function resize(height: number) {
  const next = Math.max(minimumHeight, Math.min(maximumHeight.value, Math.round(height)));
  if (next !== props.height) emit("resize", next);
}

function stopDrag() {
  const pointerId = drag.value?.pointerId;
  drag.value = null;
  if (pointerId !== undefined && handle.value?.hasPointerCapture?.(pointerId)) handle.value.releasePointerCapture(pointerId);
}

function updateBounds() {
  stopDrag();
  const header = handle.value?.closest(".workbench")?.querySelector(".workbench-header");
  // 预留全局头部和至少 240px 画布区域；窄屏继续使用原有页面滚动布局。
  maximumHeight.value = Math.max(240, Math.min(640, Math.floor(window.innerHeight - 56 - (header?.getBoundingClientRect().height || 64) - 240)));
  resize(props.height);
}

function startDrag(event: PointerEvent) {
  if (event.button !== 0 || event.isPrimary === false || drag.value) return;
  event.preventDefault();
  updateBounds();
  handle.value?.focus({ preventScroll: true });
  drag.value = { pointerId: event.pointerId, startY: event.clientY, startHeight: props.height };
  handle.value?.setPointerCapture?.(event.pointerId);
}

function moveDrag(event: PointerEvent) {
  if (!drag.value || drag.value.pointerId !== event.pointerId) return;
  resize(drag.value.startHeight + drag.value.startY - event.clientY);
}

function endDrag(event: PointerEvent) {
  if (drag.value?.pointerId === event.pointerId) stopDrag();
}

function resizeWithKeyboard(event: KeyboardEvent) {
  const heights: Record<string, number> = { ArrowUp: props.height + 20, ArrowDown: props.height - 20, Home: minimumHeight, End: maximumHeight.value };
  const next = heights[event.key];
  if (next === undefined) return;
  event.preventDefault();
  resize(next);
}

onMounted(() => {
  updateBounds();
  window.addEventListener("resize", updateBounds);
  window.addEventListener("blur", stopDrag);
  const header = handle.value?.closest(".workbench")?.querySelector(".workbench-header");
  if (header && typeof ResizeObserver !== "undefined") {
    headerObserver = new ResizeObserver(updateBounds);
    headerObserver.observe(header);
  }
});

onBeforeUnmount(() => {
  stopDrag();
  headerObserver?.disconnect();
  window.removeEventListener("resize", updateBounds);
  window.removeEventListener("blur", stopDrag);
});
</script>

<style scoped>
.bottom-panel__resizer { position: absolute; top: 0; left: 0; z-index: 5; width: 100%; height: 8px; cursor: row-resize; touch-action: none; user-select: none; }
.bottom-panel__resizer::after { position: absolute; top: 1px; left: calc(50% - 18px); width: 36px; height: 3px; content: ""; background: #cdd7df; border-radius: 2px; }
.bottom-panel__resizer:hover::after, .bottom-panel__resizer:focus-visible::after, .bottom-panel__resizer.is-dragging::after { background: #0b6bcb; }
.bottom-panel__resizer:focus-visible { background: #eaf3fc; outline: 2px solid #0b6bcb; outline-offset: -2px; }
</style>
