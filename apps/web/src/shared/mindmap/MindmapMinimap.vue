<template>
  <div class="mindmap-minimap" @pointerdown.stop @wheel.stop @keydown.stop>
    <div
      v-if="open" ref="map" class="mindmap-minimap__map" role="group" tabindex="0"
      aria-label="脑图小地图，点击跳转，拖动视口框或用方向键平移" data-testid="mindmap-minimap"
      @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="drag = undefined"
      @lostpointercapture="drag = undefined" @keydown="navigate"
    >
      <span
        v-for="item in layout" :key="item.node.id" class="mindmap-minimap__node"
        :class="{ 'is-selected': item.node.id === selectedId }" :style="boxStyle(item.x, item.y, item.width, item.height)"
        aria-hidden="true"
      />
      <span class="mindmap-minimap__frame" :style="frameStyle" aria-hidden="true" />
    </div>
    <button type="button" :aria-expanded="open" aria-label="小地图" :title="open ? '收起小地图' : '打开小地图'" @click="toggle">
      <Map :size="16" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { Map } from '@lucide/vue';
import type { layoutMindmap } from './mindmapTree';

type Point = { x: number; y: number };
const props = defineProps<{
  layout: ReturnType<typeof layoutMindmap>;
  viewport: HTMLElement;
  pan: Point;
  zoom: number;
  selectedId: string;
}>();
const emit = defineEmits<{ pan: [position: Point] }>();
const open = ref(false), map = ref<HTMLElement>();
const viewportSize = ref({ width: 0, height: 0 });
const mapWidth = 168, mapHeight = 100, padding = 5;

watchEffect(onCleanup => {
  if (!open.value) return;
  const viewport = props.viewport;
  function measure() {
    viewportSize.value = { width: viewport.clientWidth, height: viewport.clientHeight };
  }
  measure();
  if (typeof ResizeObserver === 'undefined') return;
  const observer = new ResizeObserver(measure);
  observer.observe(viewport);
  onCleanup(() => observer.disconnect());
});

const projection = computed(() => {
  const left = Math.min(...props.layout.map(item => item.x));
  const top = Math.min(...props.layout.map(item => item.y));
  const width = Math.max(...props.layout.map(item => item.x + item.width)) - left;
  const height = Math.max(...props.layout.map(item => item.y + item.height)) - top;
  const scale = Math.min((mapWidth - 2 * padding) / width, (mapHeight - 2 * padding) / height);
  return { scale, x: (mapWidth - width * scale) / 2 - left * scale, y: (mapHeight - height * scale) / 2 - top * scale };
});
function boxStyle(x: number, y: number, width: number, height: number) {
  const { scale, x: offsetX, y: offsetY } = projection.value;
  return {
    left: `${(offsetX + x * scale) / mapWidth * 100}%`,
    top: `${(offsetY + y * scale) / mapHeight * 100}%`,
    width: `${width * scale / mapWidth * 100}%`,
    height: `${height * scale / mapHeight * 100}%`,
  };
}
const frameStyle = computed(() => {
  const { width, height } = viewportSize.value;
  const { scale, x, y } = projection.value;
  const frameX = x - props.pan.x / props.zoom * scale, frameY = y - props.pan.y / props.zoom * scale;
  function clippedAxis(start: number, length: number, limit: number) {
    const left = Math.max(0, Math.min(limit - 3, start));
    const right = Math.max(left + 3, Math.min(limit, start + length));
    return { position: `${left / limit * 100}%`, size: `${(right - left) / limit * 100}%` };
  }
  const horizontal = clippedAxis(frameX, width / props.zoom * scale, mapWidth);
  const vertical = clippedAxis(frameY, height / props.zoom * scale, mapHeight);
  return { left: horizontal.position, top: vertical.position, width: horizontal.size, height: vertical.size };
});

let drag: { pointerId: number; origin: Point; pan: Point; moved: boolean } | undefined;
function toggle() {
  drag = undefined;
  open.value = !open.value;
}
function pointInMap(event: PointerEvent): Point {
  const bounds = map.value!.getBoundingClientRect();
  const fraction = (position: number) => Math.max(0, Math.min(1, position));
  return {
    x: fraction((event.clientX - bounds.left) / bounds.width) * mapWidth,
    y: fraction((event.clientY - bounds.top) / bounds.height) * mapHeight,
  };
}
function centerOn(point: Point) {
  const { x, y, scale } = projection.value;
  emit('pan', {
    x: viewportSize.value.width / 2 - (point.x - x) / scale * props.zoom,
    y: viewportSize.value.height / 2 - (point.y - y) / scale * props.zoom,
  });
}
function startDrag(event: PointerEvent) {
  if (event.button !== 0 || drag) return;
  event.preventDefault();
  const handle = event.currentTarget as HTMLElement;
  handle.focus({ preventScroll: true });
  const point = pointInMap(event);
  const onFrame = event.target instanceof Element && event.target.classList.contains('mindmap-minimap__frame');
  if (!onFrame) {
    centerOn(point);
    return;
  }
  drag = { pointerId: event.pointerId, origin: point, pan: { ...props.pan }, moved: false };
  handle.setPointerCapture?.(event.pointerId);
}
function moveDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const point = pointInMap(event);
  const dx = point.x - drag.origin.x, dy = point.y - drag.origin.y;
  if (!drag.moved && Math.hypot(dx, dy) < 2) return;
  drag.moved = true;
  const ratio = props.zoom / projection.value.scale;
  emit('pan', { x: drag.pan.x - dx * ratio, y: drag.pan.y - dy * ratio });
}
function endDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.moved) centerOn(pointInMap(event));
  drag = undefined;
}
function navigate(event: KeyboardEvent) {
  const directions: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  };
  const direction = directions[event.key];
  if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  const step = event.shiftKey ? 160 : 48;
  emit('pan', { x: props.pan.x - direction[0] * step, y: props.pan.y - direction[1] * step });
}
</script>

<style scoped>
.mindmap-minimap { position:absolute; z-index:3; left:12px; bottom:58px; display:grid; justify-items:start; gap:6px; width:min(168px, calc(100% - 24px)); pointer-events:none; }
.mindmap-minimap button,.mindmap-minimap__map { pointer-events:auto; border:1px solid #cbd9e7; border-radius:7px; background:#fff; box-shadow:0 2px 8px #23354714; }
.mindmap-minimap button { display:grid; place-items:center; width:34px; height:34px; padding:0; color:#49627e; cursor:pointer; }
.mindmap-minimap button[aria-expanded="true"] { color:#0b64b8; background:#eaf4ff; }
.mindmap-minimap__map { position:relative; width:100%; aspect-ratio:168 / 100; overflow:hidden; cursor:crosshair; touch-action:none; }
.mindmap-minimap__node { position:absolute; min-width:1px; min-height:1px; border-radius:1px; background:#819bb2; pointer-events:none; }
.mindmap-minimap__node.is-selected { background:#075eb5; }
.mindmap-minimap__frame { position:absolute; border:1px solid #0869c8; background:#2684dd20; box-sizing:border-box; cursor:grab; }
.mindmap-minimap__frame:active { cursor:grabbing; }
.mindmap-minimap :focus-visible { outline:2px solid #0b6bcb; outline-offset:2px; }
</style>
