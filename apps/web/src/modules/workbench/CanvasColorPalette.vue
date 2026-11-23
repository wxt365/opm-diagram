<template>
  <div ref="root" class="canvas-colors" :class="{ 'canvas-colors--inline': inline }" @keydown.esc.stop.prevent="close">
    <button v-if="!inline" ref="trigger" type="button" class="tool-button tool-button--icon" :class="{ 'is-active': open }" title="调色盘" aria-label="调色盘" :aria-expanded="open" aria-haspopup="dialog" data-testid="canvas-colors-toggle" @click="toggle"><Palette :size="18" aria-hidden="true" /></button>
    <Teleport :to="teleportTarget" :disabled="inline">
      <section v-if="inline || open" ref="panel" class="canvas-colors__popover" :style="inline ? undefined : position" :role="inline ? 'region' : 'dialog'" aria-label="元素调色盘" data-testid="canvas-colors-panel" @keydown.esc.stop.prevent="close">
        <header><strong>元素调色盘</strong><button v-if="!inline" type="button" aria-label="关闭调色盘" @click="close"><X :size="16" aria-hidden="true" /></button></header>
        <div v-if="inline" class="canvas-colors__cards">
          <div class="canvas-colors__list-heading"><span>类型</span><span>边框</span><span>填充</span><span /></div>
          <div v-for="kind in kinds" :key="kind.key" class="canvas-colors__card">
            <strong>{{ kind.label }}</strong>
            <input v-for="field in fields" :key="field.key" type="color" :value="color(kind.key, field.key)" :disabled="disabled" :title="`${kind.label}${field.label} ${color(kind.key, field.key)}`" :aria-label="`${kind.label}${field.label}`" :data-testid="`palette-${kind.key}-${field.key}`" @change="change(kind.key, field.key, $event)">
            <button type="button" :disabled="disabled || !normalizeNodeAppearance(palette[kind.key])" :aria-label="`恢复${kind.label}默认颜色`" @click="emit('save', kind.key, {})">恢复</button>
          </div>
        </div>
        <div v-else class="canvas-colors__grid">
          <span>元素类型</span><span>边框颜色</span><span>填充颜色</span><span />
          <template v-for="kind in kinds" :key="kind.key">
            <strong>{{ kind.label }}</strong>
            <label v-for="field in fields" :key="field.key">
              <input type="color" :value="color(kind.key, field.key)" :disabled="disabled" :aria-label="`${kind.label}${field.label}`" :data-testid="`palette-${kind.key}-${field.key}`" @change="change(kind.key, field.key, $event)">
              <code>{{ color(kind.key, field.key) }}</code>
            </label>
            <button type="button" :disabled="disabled || !normalizeNodeAppearance(palette[kind.key])" :aria-label="`恢复${kind.label}默认颜色`" @click="emit('save', kind.key, {})">恢复</button>
          </template>
        </div>
        <p v-if="error" class="canvas-colors__error" role="alert">{{ error }}</p>
        <p v-else-if="saving || !loaded" role="status">{{ saving ? '正在保存统一颜色…' : '正在加载颜色…' }}</p>
      </section>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue';
import { Palette, X } from '@lucide/vue';
import { defaultNodeAppearance, normalizeNodeAppearance, type NodeColorPalette } from '@/shared/nodeAppearance';
import type { NodeAppearance, OpdNode } from '@/shared/types/modeling';

const props = defineProps<{ palette: NodeColorPalette; loaded: boolean; saving: boolean; readonly: boolean; error?: string; inline?: boolean }>();
const emit = defineEmits<{ save: [kind: OpdNode['kind'], colors: NodeAppearance] }>();
const kinds = [{ key: 'object', label: '对象' }, { key: 'process', label: '过程' }, { key: 'attribute', label: '属性' }, { key: 'operation', label: '操作' }, { key: 'state', label: '状态' }] as const;
const fields = [{ key: 'stroke', label: '边框颜色' }, { key: 'fill', label: '填充颜色' }] as const;
const open = ref(false), root = ref<HTMLElement>(), trigger = ref<HTMLButtonElement>();
const panel = ref<HTMLElement>();
const position = ref({ left: '0px', top: '0px' });
const teleportTarget = ref<Element | string>('body');
function positionPanel() {
  const bounds = trigger.value?.getBoundingClientRect();
  if (!bounds) return;
  position.value = { left: `${Math.max(8, Math.min(bounds.left, window.innerWidth - 468))}px`, top: `${Math.min(bounds.bottom + 8, Math.max(8, window.innerHeight - (panel.value?.offsetHeight ?? 310) - 8))}px` };
}
async function toggle() {
  open.value = !open.value;
  if (!open.value) return;
  teleportTarget.value = document.fullscreenElement ?? 'body';
  await nextTick();
  positionPanel();
  panel.value?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
}
const disabled = computed(() => props.readonly || !props.loaded || props.saving);
function color(kind: OpdNode['kind'], field: keyof NodeAppearance) { return normalizeNodeAppearance(props.palette[kind])?.[field] ?? defaultNodeAppearance(kind)[field]; }
function change(kind: OpdNode['kind'], field: keyof NodeAppearance, event: Event) {
  if (disabled.value) return;
  const colors = { ...normalizeNodeAppearance(props.palette[kind]) };
  const value = (event.target as HTMLInputElement).value.toLowerCase();
  if (value === defaultNodeAppearance(kind)[field]) delete colors[field];
  else colors[field] = value;
  emit('save', kind, colors);
}
function close() { open.value = false; trigger.value?.focus(); }
function outside(event: PointerEvent) { if (event.target instanceof Node && !root.value?.contains(event.target) && !panel.value?.contains(event.target)) open.value = false; }
onMounted(() => { document.addEventListener('pointerdown', outside); window.addEventListener('resize', positionPanel); });
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', positionPanel); });
</script>

<style scoped>
.canvas-colors { position: relative; flex: 0 0 auto; }
.canvas-colors__popover { position: fixed; z-index: 100; width: 420px; max-width: calc(100vw - 40px); max-height: 65vh; overflow: auto; padding: 14px; border: 1px solid #cbd9e7; border-radius: 6px; background: #fff; box-shadow: 0 6px 20px #172b4d26; color: #344250; font-size: 12px; }
header { display: flex; align-items: center; justify-content: space-between; }
p { margin: 10px 0 0; color: #64748b; line-height: 1.5; }
.canvas-colors__grid { display: grid; grid-template-columns: auto 1fr 1fr auto; align-items: center; gap: 14px 12px; margin-top: 16px; }
label { display: flex; align-items: center; gap: 5px; }
input { width: 30px; height: 27px; padding: 2px; border: 1px solid #cbd9e7; border-radius: 4px; background: #fff; cursor: pointer; }
code { font-size: 10px; }
button { border: 0; background: transparent; color: #0b6bcb; cursor: pointer; padding: 2px; }
button:disabled, input:disabled { opacity: .5; cursor: default; }
.canvas-colors__error { color: #b42318; }
.canvas-colors--inline .canvas-colors__popover { position: static; width: 100%; max-width: none; max-height: none; overflow: visible; padding: 0; border: 0; border-radius: 0; box-shadow: none; }
.canvas-colors--inline header { color: #24394f; }
.canvas-colors--inline header { font-size: 12px; margin-bottom: 12px; }
.canvas-colors__cards { display: grid; gap: 0; }
.canvas-colors__list-heading, .canvas-colors__card { display: grid; grid-template-columns: 56px minmax(0, 1fr) minmax(0, 1fr) 36px; align-items: center; gap: 8px; }
.canvas-colors__list-heading > span:nth-child(2), .canvas-colors__list-heading > span:nth-child(3) { text-align: center; }
.canvas-colors__list-heading { padding: 4px 0 8px; color: #8793a1; font-size: 11px; }
.canvas-colors__card { min-height: 42px; border-bottom: 1px solid #f0f2f5; }
.canvas-colors__card:last-child { border-bottom: 0; }
.canvas-colors__card strong { color: #46566a; font-size: 12px; font-weight: 400; }
.canvas-colors__card input { justify-self: center; width: 34px; height: 25px; padding: 2px; border-radius: 4px; }
.canvas-colors__card button { justify-self: end; font-size: 11px; padding: 3px 0; }
</style>
