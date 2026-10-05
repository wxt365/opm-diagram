<template>
  <div class="bottom-content method-panel" data-testid="p03-method-panel">
    <section class="method-architecture" aria-label="OPD 架构分类与细化追溯">
      <div class="method-toolbar">
        <strong>当前 OPD 架构层</strong>
        <label>分类<select data-testid="p03-method-level" :value="currentLevel" :disabled="busy || store.isReadonly || !store.draftToken || store.methodSummary.loading || !currentContext" @change="classify"><option value="">未分类</option><option value="MISSION">任务架构</option><option value="FUNCTION">功能架构</option><option value="PRODUCT">产品架构</option></select></label>
        <span class="method-note">{{ currentContext ? contextName(currentContext.context_id) : '等待读取当前图' }}</span>
      </div>
      <p class="method-note">分类用于组织架构建模，可独立设置；子图不会自动继承父图分类。</p>
      <details v-if="store.methodSummary.data" data-testid="p03-method-context-list">
        <summary>模型 OPD 分类（{{ store.methodSummary.data.contexts.length }}）</summary>
        <ul class="method-contexts"><li v-for="context in store.methodSummary.data.contexts" :key="context.context_id"><button type="button" class="method-link" :disabled="busy" :aria-current="context.context_id === store.workbench.activeContextId ? 'page' : undefined" @click="emit('navigate', context.context_id)">{{ contextName(context.context_id) }}</button><span>{{ levelLabel(context.architecture_level) }}</span></li></ul>
      </details>
      <div v-if="currentContext" class="method-refinements" data-testid="p03-method-refinements">
        <strong>细化追溯</strong>
        <p v-if="!relatedRefinements.length" class="method-note">当前 OPD 尚无父子细化关系。</p>
        <ul v-else class="method-contexts">
          <li v-for="edge in relatedRefinements" :key="edge.refinement_id">
            <button class="method-link" type="button" :disabled="busy" :data-testid="`p03-method-parent-${edge.refinement_id}`" @click="emit('navigate', edge.parent_context_id, edge.refinee_element_id)">{{ contextLabel(edge.parent_context_id) }}</button>
            <span>／{{ edge.refinee_name }} →</span>
            <button class="method-link" type="button" :disabled="busy" :data-testid="`p03-method-child-${edge.refinement_id}`" @click="emit('navigate', edge.child_context_id)">{{ contextLabel(edge.child_context_id) }}</button>
          </li>
        </ul>
        <p class="method-note">显示已有的元素展开关系。</p>
      </div>
      <WorkbenchMethodLinks v-if="store.methodSummary.data && currentContext" :data="store.methodSummary.data" :current="store.workbench.activeContextId" :context-names="store.contexts" :busy="busy" :editable="!store.isReadonly && !!store.draftToken && !store.methodSummary.loading && !store.methodSummary.error" @create="(target, kind) => emit('createLink', target, kind)" @delete="emit('deleteLink', $event)" @navigate="emit('navigate', $event)" />
    </section>
    <div class="method-toolbar">
      <strong>6×1 关系检查</strong>
      <label>过程范围<select v-model="scope" data-testid="p03-method-scope"><option value="context">当前 OPD</option><option value="model">整个模型</option></select></label>
      <label>关注过程<select v-model="processId" data-testid="p03-method-process" :disabled="!processes.length"><option v-if="!processes.length" value="">暂无过程</option><option v-for="process in processes" :key="process.process_id" :value="process.process_id">{{ process.name }} · {{ contextNames(process.context_ids) }}</option></select></label>
      <button class="opl-export" type="button" data-testid="p03-method-refresh" :disabled="busy || store.methodSummary.loading" @click="store.refreshMethodSummary"><RefreshCw :size="14" aria-hidden="true" />{{ store.methodSummary.error ? '重试' : '刷新检查' }}</button>
    </div>
    <p class="method-note">围绕一个过程查看主体、客体、手段、资源、环境和信息。现有关系只提供候选证据，缺少关系不代表建模错误；本检查不形成语言符合性结论。</p>
    <p v-if="store.methodSummary.loading" class="method-note" role="status">正在读取关系证据…</p>
    <p v-else-if="store.methodSummary.error" class="method-error" role="alert">{{ store.methodSummary.error }}</p>
    <p v-else-if="!processes.length" class="method-note" data-testid="p03-method-empty">{{ scope === 'context' ? '当前 OPD' : '整个模型' }}尚无过程。添加过程后可查看 6×1 关系。</p>
    <template v-else-if="selected">
      <p class="method-note">关注过程：{{ selected.name }} · 证据范围：整个模型（{{ store.draftToken ? '当前草稿' : '当前历史版本' }}）</p>
      <div class="method-roles">
        <article v-for="role in selected.roles" :key="role.role" class="method-card" :data-testid="`p03-method-role-${role.role}`">
          <div class="method-card__heading"><strong>{{ labels[role.role] }}</strong><span :class="{ 'has-evidence': role.status === 'EVIDENCE' }">{{ statuses[role.status] }}</span></div>
          <p>{{ role.guidance }}</p>
          <ul v-if="role.evidence.length">
            <li v-for="evidence in role.evidence" :key="evidence.fact_id">
              <span>{{ evidence.description }}</span><small>OPD：{{ contextNames(evidence.context_ids) }}</small>
              <button class="opl-export" type="button" :disabled="busy || !evidence.context_ids.length" :aria-label="`定位${evidence.description}`" data-testid="p03-method-locate" @click="emit('locate', evidence)"><LocateFixed :size="14" aria-hidden="true" />定位</button>
            </li>
          </ul>
        </article>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { LocateFixed, RefreshCw } from "@lucide/vue";
import WorkbenchMethodLinks from "./WorkbenchMethodLinks.vue";
import type { ArchitectureLinkKind, ArchitectureLevel, MethodEvidence } from "@/shared/api/generated/draftWorkspaceContract";
import type { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";

const props = defineProps<{ store: Pick<ReturnType<typeof useWorkbenchRuntimeStore>, "methodSummary" | "refreshMethodSummary" | "workbench" | "contexts" | "draftToken" | "isReadonly"> }>();
const emit = defineEmits<{ createLink: [target: string, kind: ArchitectureLinkKind]; deleteLink: [id: string]; locate: [evidence: MethodEvidence]; classify: [level: ArchitectureLevel | null]; navigate: [context: string, target?: string] }>();
const currentContext = computed(() => props.store.methodSummary.data?.contexts.find(context => context.context_id === props.store.workbench.activeContextId));
const currentLevel = computed(() => currentContext.value?.architecture_level ?? "");
const relatedRefinements = computed(() => props.store.methodSummary.data?.refinements.filter(edge => edge.parent_context_id === props.store.workbench.activeContextId || edge.child_context_id === props.store.workbench.activeContextId) ?? []);
function levelLabel(level: ArchitectureLevel | null) { return level ? { MISSION: "任务架构", FUNCTION: "功能架构", PRODUCT: "产品架构" }[level] : "未分类"; }
function contextName(id: string) { return props.store.contexts.find(context => context.id === id)?.label ?? props.store.methodSummary.data?.contexts.find(context => context.context_id === id)?.name ?? "未知 OPD"; }
function contextLabel(id: string) { const context = props.store.methodSummary.data?.contexts.find(item => item.context_id === id); return `${contextName(id)} · ${levelLabel(context?.architecture_level ?? null)}`; }
function classify(event: Event) {
  const select = event.target as HTMLSelectElement;
  const level = select.value;
  select.value = currentLevel.value;
  if (["", "MISSION", "FUNCTION", "PRODUCT"].includes(level)) emit("classify", level ? level as ArchitectureLevel : null);
}
const scope = ref("context"), processId = ref("");
const labels = { SUBJECT: "主体", OBJECT: "客体", INSTRUMENT: "手段", RESOURCE: "资源", ENVIRONMENT: "环境", INFORMATION: "信息" };
const statuses = { EVIDENCE: "有关系 · 待确认", NO_EVIDENCE: "未发现关系", MANUAL: "需人工确认" };
const busy = computed(() => props.store.workbench.resourceState !== "ready" || props.store.workbench.commandState === "submitting");
const processes = computed(() => (props.store.methodSummary.data?.processes ?? []).filter(process => scope.value === "model" || process.context_ids.includes(props.store.workbench.activeContextId)));
const selected = computed(() => processes.value.find(process => process.process_id === processId.value));
watch(processes, values => {
  if (!props.store.methodSummary.data) return;
  if (!values.some(value => value.process_id === processId.value)) processId.value = values[0]?.process_id ?? "";
}, { immediate: true });
function contextNames(ids: string[]) { return ids.map(id => props.store.contexts.find(context => context.id === id)?.label ?? "未知 OPD").join("、") || "未在 OPD 中呈现"; }
</script>

<style scoped>
.method-architecture { border-bottom: 1px solid #dce5ee; padding-bottom: 10px; margin-bottom: 12px; font-size: 12px; }
.method-architecture summary { cursor: pointer; color: #6a7683; }
.method-contexts { list-style: none; padding: 0; margin: 8px 0; }
.method-contexts li { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; margin: 5px 0; overflow-wrap: anywhere; }
.method-link { padding: 0; color: #0b6bcb; border: 0; background: none; text-align: left; overflow-wrap: anywhere; }
.method-link:hover:not(:disabled) { text-decoration: underline; }
.method-link[aria-current="page"] { font-weight: 600; }
.method-refinements { margin-top: 10px; }
.method-panel { padding: 12px 16px; min-width: 0; }
.method-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 16px; }
.method-toolbar label { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; }
.method-toolbar select { max-width: 260px; min-width: 0; padding: 4px 8px; border: 1px solid #dce5ee; border-radius: 6px; color: #1d242a; background: #fff; }
.method-note { margin: 8px 0; font-size: 12px; color: #6a7683; overflow-wrap: anywhere; }
.method-error { color: #b42318; font-size: 12px; }
.opl-export { display: inline-flex; align-items: center; gap: 5px; min-height: 28px; padding: 4px 8px; border: 1px solid #d9e3ee; border-radius: 5px; font-size: 12px; font-weight: 500; line-height: 1.4; color: #0b6bcb; background: #fff; white-space: nowrap; }
.opl-export:hover:not(:disabled) { border-color: #b4cee8; background: #eaf3fc; }
.opl-export:focus-visible { outline: 2px solid #0b6bcb; outline-offset: 2px; }
.method-roles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.method-card { border: 1px solid #dce5ee; border-radius: 8px; padding: 10px; min-width: 0; font-size: 12px; }
.method-card__heading { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
.method-card__heading span, .method-card small { color: #6a7683; }
.method-card__heading .has-evidence { color: #0b6bcb; }
.method-card p { margin: 8px 0; overflow-wrap: anywhere; }
.method-card ul { list-style: none; padding: 0; margin: 0; }
.method-card li { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; border-top: 1px solid #dce5ee; padding-top: 8px; margin-top: 8px; overflow-wrap: anywhere; }
@media (max-width: 1000px) { .method-roles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .method-roles { grid-template-columns: minmax(0, 1fr); } .method-toolbar label { width: 100%; } .method-toolbar select { flex: 1; max-width: 100%; } }
</style>
