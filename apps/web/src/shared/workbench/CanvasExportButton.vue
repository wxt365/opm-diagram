<template>
  <div class="canvas-export">
    <button
      class="tool-button tool-button--icon"
      type="button"
      title="导出当前视图"
      aria-label="导出当前视图"
      :popovertarget="menuId"
      :disabled="disabled || busy"
      @click="positionMenu"
    >
      <Download :size="18" aria-hidden="true" />
    </button>
    <div :id="menuId" ref="menu" class="canvas-export__menu" popover aria-label="导出格式">
      <p v-if="error" role="alert">{{ error }}</p>
      <button v-for="format in formats" :key="format.id" :disabled="busy" type="button" @click="download(format.id)">
        {{ format.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue';
import { Download } from '@lucide/vue';
import type { DiagramFormat } from '@/shared/canvas/diagramExport';

const props = defineProps<{ filename: string; exportDiagram?: (format: DiagramFormat) => Promise<Blob>; disabled?: boolean }>();
const menuId = useId();
const menu = ref<HTMLElement>();
const busy = ref(false);
const error = ref('');
const formats: { id: DiagramFormat; label: string }[] = [
  { id: 'png', label: 'PNG 图片' },
  { id: 'svg', label: 'SVG 矢量图' },
  { id: 'pdf', label: 'PDF 文档' },
];

function positionMenu(event: MouseEvent) {
  const bounds = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
  if (menu.value) {
    menu.value.style.right = `${Math.max(8, window.innerWidth - bounds.right)}px`;
    menu.value.style.top = `${bounds.bottom + 6}px`;
  }
  error.value = '';
}

async function download(format: DiagramFormat) {
  if (busy.value || !props.exportDiagram) return;
  const filename = props.filename.replace(/[<>:"/\\|?*\p{Cc}]/gu, '-').trim().replace(/[. ]+$/u, '').slice(0, 100) || '业务视图';
  busy.value = true;
  error.value = '';
  try {
    const blob = await props.exportDiagram(format);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${filename}.${format}`;
    try { anchor.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    menu.value?.hidePopover();
  } catch (cause) {
    error.value = cause instanceof Error ? `导出失败。 ${cause.message}` : '导出失败，请重试。';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.canvas-export { flex: 0 0 auto; }
.canvas-export__menu {
  position: fixed;
  inset: auto;
  margin: 0;
  min-width: 130px;
  max-width: min(250px, calc(100vw - 16px));
  padding: 4px;
  background: #fff;
  border: 1px solid #d4dce5;
  border-radius: 7px;
  box-shadow: 0 6px 24px #162b431f;
}
.canvas-export__menu button {
  display: block;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #26394c;
  text-align: left;
  font-size: 13px;
  cursor: pointer;
}
.canvas-export__menu button:hover:enabled, .canvas-export__menu button:focus-visible { background: #eaf3fc; }
.canvas-export__menu p { margin: 4px 6px; color: #9b342e; font-size: 12px; }
</style>
