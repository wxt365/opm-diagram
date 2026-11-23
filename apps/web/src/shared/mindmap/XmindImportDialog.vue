<template>
  <dialog ref="modal" class="xmind-import" aria-label="导入 XMind 工作表" @cancel.prevent="emit('cancel')">
    <header><h3>导入 XMind 工作表</h3><span>{{ filename }}</span></header>
    <label v-if="sheets.length > 1">工作表
      <select v-model="selectedIndex">
        <option v-for="(sheet, index) in sheets" :key="index" :value="index">{{ sheet.title }}</option>
      </select>
    </label>
    <p>追加到「{{ targetLabel || '目标已失效' }}」</p>
    <section aria-label="主题预览" class="xmind-import__preview">
      <div v-for="(row, index) in selected.rows.slice(0, 30)" :key="index" :style="{ paddingInlineStart: `${Math.min(row.depth, 8) * 13}px` }">
        <span :title="row.label">{{ row.label }}</span>
      </div>
      <p v-if="selected.rows.length > 30">还有 {{ selected.rows.length > 300 ? '超过 270' : selected.rows.length - 30 }} 个主题</p>
    </section>
    <p>保留主题名称、纯文本备注和层级。图片、样式、独立主题及关系线留在原文件中。</p>
    <p v-if="error" class="xmind-import__error" role="alert">{{ error }}</p>
    <footer>
      <button type="button" class="button button--secondary" autofocus @click="emit('cancel')">取消</button>
      <button type="button" class="button button--primary" :disabled="!!error" @click="emit('confirm', selected)">追加 {{ selected.rows.length }} 个主题</button>
    </footer>
  </dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { XmindSheet } from './xmindImport';

const props = defineProps<{ filename: string; sheets: XmindSheet[]; targetLabel?: string; remaining: number; locked: boolean }>();
const emit = defineEmits<{ cancel: []; confirm: [sheet: XmindSheet] }>();
const modal = ref<HTMLDialogElement>(), selectedIndex = ref(0);
const selected = computed(() => props.sheets[selectedIndex.value]!);
const error = computed(() => selected.value.error
  || (!props.targetLabel ? '导入目标已不存在，请重新选择节点。' : '')
  || (props.locked ? '脑图暂时不可编辑。' : '')
  || (selected.value.rows.length > props.remaining ? `当前位置最多还能导入 ${props.remaining} 个主题。` : ''));
onMounted(() => modal.value?.showModal());
</script>

<style scoped>
.xmind-import { width:min(480px, calc(100vw - 32px)); max-height:calc(100vh - 32px); padding:20px; border:1px solid #cbd9e7; border-radius:10px; color:#304b62; }
.xmind-import::backdrop { background:#18344c50; }
.xmind-import h3 { margin:0 0 6px; font-size:16px; }
.xmind-import header span { overflow-wrap:anywhere; color:#61778b; }
.xmind-import p { margin:10px 0; line-height:1.5; }
.xmind-import label { display:grid; gap:5px; margin-top:14px; }
.xmind-import select { max-width:100%; padding:6px; }
.xmind-import__preview { max-height:30vh; overflow:auto; padding:8px 10px; border:1px solid #dee7ee; border-radius:6px; background:#f8fafc; }
.xmind-import__preview div { min-height:22px; display:flex; align-items:center; }
.xmind-import__preview span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.xmind-import__error { color:#a12828; }
.xmind-import footer { display:flex; justify-content:flex-end; gap:8px; margin-top:16px; }
</style>
