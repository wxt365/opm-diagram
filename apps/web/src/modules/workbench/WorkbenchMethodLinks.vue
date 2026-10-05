<template>
  <section class="method-links" aria-label="架构关联" data-testid="p03-method-links">
    <strong>架构关联</strong>
    <p class="note">以当前 OPD 为源图，显式记录输入、生成或追溯关系。</p>
    <form class="link-form" @submit.prevent="create">
      <label>关系<select v-model="kind" data-testid="p03-method-link-kind" :disabled="!editable || busy"><option value="INPUT">提供输入给</option><option value="GENERATES">生成</option><option value="TRACE">追溯到</option></select></label>
      <label>目标 OPD<select v-model="target" data-testid="p03-method-link-target" :disabled="!editable || busy"><option value="">选择目标 OPD</option><option v-for="context in targets" :key="context.context_id" :value="context.context_id">{{ name(context.context_id) }}</option></select></label>
      <button class="action" data-testid="p03-method-link-add" :disabled="!editable || busy || !target || duplicate">添加关联</button>
    </form>
    <p v-if="duplicate" class="note">该关联已存在。</p>
    <p v-if="!related.length" class="note">当前 OPD 尚无架构关联。</p>
    <ul v-else>
      <li v-for="link in related" :key="link.link_id" :data-testid="`p03-method-link-${link.link_id}`">
        <span class="direction">{{ link.source_context_id === current ? '出站' : '入站' }}</span>
        <button type="button" class="nav" :disabled="busy" @click="emit('navigate', link.source_context_id)">{{ name(link.source_context_id) }}</button>
        <span>{{ labels[link.kind] }} →</span>
        <button type="button" class="nav" :disabled="busy" @click="emit('navigate', link.target_context_id)">{{ name(link.target_context_id) }}</button>
        <template v-if="confirmId === link.link_id">
          <span>删除这条关联？</span><button type="button" class="action" data-testid="p03-method-link-delete-confirm" :disabled="!editable || busy" @click="emit('delete', link.link_id)">确认删除</button>
          <button type="button" class="action" :disabled="busy" @click="confirmId = ''">取消</button>
        </template>
        <button v-else type="button" class="action" data-testid="p03-method-link-delete" :disabled="!editable || busy" @click="confirmId = link.link_id">删除</button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ArchitectureLinkKind, MethodSummaryResult } from "@/shared/api/generated/draftWorkspaceContract";
const props = defineProps<{ data: MethodSummaryResult["data"]; current: string; contextNames: { id: string; label: string }[]; editable: boolean; busy: boolean }>();
const emit = defineEmits<{ create: [target: string, kind: ArchitectureLinkKind]; delete: [id: string]; navigate: [context: string] }>();
const target = ref(""), kind = ref<ArchitectureLinkKind>("INPUT"), confirmId = ref("");
const labels = { INPUT: "提供输入给", GENERATES: "生成", TRACE: "追溯到" };
const targets = computed(() => props.data.contexts.filter(context => context.context_id !== props.current));
const related = computed(() => props.data.architecture_links.filter(link => [link.source_context_id, link.target_context_id].includes(props.current)));
const duplicate = computed(() => related.value.some(link => link.source_context_id === props.current && link.target_context_id === target.value && link.kind === kind.value));
function name(id: string) { return props.contextNames.find(context => context.id === id)?.label ?? props.data.contexts.find(context => context.context_id === id)?.name ?? "未知 OPD"; }
function create() { if (props.editable && !props.busy && targets.value.some(context => context.context_id === target.value) && !duplicate.value) emit("create", target.value, kind.value); }
watch(() => props.current, () => { target.value = ""; confirmId.value = ""; });
watch(related, links => { if (!links.some(link => link.link_id === confirmId.value)) confirmId.value = ""; });
watch(targets, contexts => { if (!contexts.some(context => context.context_id === target.value)) target.value = ""; });
</script>

<style scoped>
.method-links { margin-top: 12px; min-width: 0; }
.note { margin: 8px 0; color: #6a7683; overflow-wrap: anywhere; }
.link-form, li { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; }
label { display: flex; align-items: center; gap: 8px; min-width: 0; }
select { min-width: 0; max-width: 260px; padding: 4px 8px; border: 1px solid #dce5ee; border-radius: 6px; color: #1d242a; background: #fff; }
ul { list-style: none; margin: 8px 0; padding: 0; }
li { padding: 8px 0; border-top: 1px solid #e3eaf2; overflow-wrap: anywhere; }
.direction { color: #6a7683; }
.nav { border: 0; padding: 0; color: #0b6bcb; background: none; text-align: left; overflow-wrap: anywhere; }
.nav:hover:not(:disabled) { text-decoration: underline; }
.action { min-height: 28px; padding: 4px 8px; border: 1px solid #d9e3ee; border-radius: 5px; font-size: 12px; color: #0b6bcb; background: #fff; }
.action:hover:not(:disabled) { background: #eaf3fc; }
button:disabled, select:disabled { color: #8a96a3; cursor: not-allowed; }
button:focus-visible, select:focus-visible { outline: 2px solid #0b6bcb; outline-offset: 2px; }
@media (max-width: 600px) { label { width: 100%; } select { flex: 1; max-width: 100%; } }
</style>
