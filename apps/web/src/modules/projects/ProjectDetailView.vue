<template>
  <section
    class="content-page project-detail"
    data-testid="p02-project-detail"
  >
    <div v-if="store.projectResource === 'loading'" class="empty-state" role="status">
      正在读取项目和模型…
    </div>
    <div v-else-if="store.projectResource === 'error'" class="empty-state" role="alert">
      <p>{{ store.projectError }}</p>
      <button class="button" type="button" @click="loadProject">重试</button>
    </div>
    <template v-else-if="project">
      <OpdJsonImportDialog v-if="isOpdImportOpen" :project-id="project.id" @close="isOpdImportOpen = false" @imported="openImportedOpd" />
      <div class="page-heading">
        <div>
          <p class="page-kicker">P02 · 项目详情</p>
          <h1>{{ project.name }}</h1>
          <p class="page-summary">{{ project.description }}</p>
        </div>
        <div class="project-import-actions">
          <button class="button button--secondary" type="button" data-testid="p02-import-opd-json" @click="isOpdImportOpen = true">导入 OPD JSON</button>
          <button
            class="button button--primary"
            type="button"
            data-testid="p02-create-model"
            @click="openDialog"
          >
            新建模型
          </button>
        </div>
      </div>

      <div class="summary-grid">
        <div>
          <span>默认 Profile</span>
          <strong>{{ project.profile }}</strong>
        </div>
        <div>
          <span>项目状态</span>
          <strong :class="project.status === 'active' ? 'status-text status-text--success' : 'status-text'">{{ project.status === 'active' ? '活动' : '归档' }}</strong>
        </div>
        <div>
          <span>模型数量</span>
          <strong>{{ project.modelCount }}</strong>
        </div>
      </div>

      <div class="section-heading">
        <div>
          <h2>{{ store.modelArchiveState === 'ACTIVE' ? '模型' : '模型回收站' }}</h2>
          <p>{{ store.modelArchiveState === 'ACTIVE' ? '选择模型后，进入根 Context 与当前 Draft 的工作台。' : '模型内容与历史仍保留，恢复后可继续编辑。永久删除后无法在应用内恢复。' }}</p>
        </div>
        <div class="model-list__tabs" role="group" aria-label="模型列表范围">
          <button class="button" type="button" :aria-pressed="store.modelArchiveState === 'ACTIVE'" :disabled="store.lifecycleBusy" @click="switchModels('ACTIVE')">模型</button>
          <button class="button" type="button" data-testid="p02-trash-tab" :aria-pressed="store.modelArchiveState === 'ARCHIVED'" :disabled="store.lifecycleBusy" @click="switchModels('ARCHIVED')">回收站</button>
        </div>
      </div>
      <div v-if="store.modelListResource === 'loading'" class="empty-state" role="status">正在读取模型…</div>
      <div v-else-if="store.modelListResource === 'empty'" class="empty-state">{{ store.modelArchiveState === 'ACTIVE' ? '当前项目还没有模型。' : '回收站为空。' }}</div>
      <div v-else-if="store.modelListResource === 'error'" class="empty-state" role="alert">{{ store.modelError }}</div>
      <div v-else class="model-list">
        <article
          v-for="model in store.models"
          :key="model.id"
          class="model-card"
        >
          <div class="model-card__header">
            <span class="model-card__marker">M</span>
            <div>
              <h3>{{ model.name }}</h3>
              <p>{{ store.modelArchiveState === 'ARCHIVED' ? '回收站 · 内容保留' : model.accessMode === 'EDITABLE_DRAFT' ? '可编辑 Draft' : '只读修订' }}</p>
            </div>
            <button
              v-if="store.modelArchiveState === 'ACTIVE'"
              class="icon-control model-card__trash"
              type="button"
              :aria-label="`将 ${model.name} 移入回收站`"
              title="移入回收站"
              :data-testid="`p02-trash-${model.id}`"
              :disabled="store.lifecycleBusy"
              @click="openLifecycle(model, 'TRASH')"
            >
              <Trash2 :size="16" aria-hidden="true" />
            </button>
          </div>
          <dl>
            <div><dt>修订</dt><dd>{{ model.headRevision }}</dd></div>
            <div><dt>访问</dt><dd>{{ store.modelArchiveState === 'ARCHIVED' ? '已回收' : model.accessMode === 'EDITABLE_DRAFT' ? '可编辑' : '只读' }}</dd></div>
            <div><dt>文本</dt><dd>OPL</dd></div>
          </dl>
          <div class="model-card__footer">
            <span class="profile-tag" :title="model.profile">{{ model.profile }}</span>
            <button
              v-if="store.modelArchiveState === 'ACTIVE'"
              class="button button--secondary"
              type="button"
              :data-testid="`p02-open-${model.id}`"
              @click="openModel(model.id)"
            >
              打开工作台
            </button>
            <div v-else class="model-card__actions">
              <button class="button button--secondary" type="button" :disabled="store.lifecycleBusy" :data-testid="`p02-restore-${model.id}`" @click="openLifecycle(model, 'RESTORE')">恢复</button>
              <button class="button model-lifecycle__danger" type="button" :disabled="store.lifecycleBusy" :data-testid="`p02-purge-${model.id}`" @click="openLifecycle(model, 'PURGE')">永久删除</button>
            </div>
          </div>
        </article>
      </div>
    </template>

    <div
      v-else
      class="empty-state"
    >
      项目不存在或已不可访问。
    </div>

    <div
      v-if="isDialogOpen"
      class="overlay-backdrop"
      @click.self="closeDialog"
    >
      <form
        :ref="setDialogElement"
        class="dialog-panel"
        data-testid="ov02-create-model"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ov02-create-model-title"
        @keydown="onDialogKeydown"
        @submit.prevent="submitModel"
      >
        <div class="dialog-panel__header">
          <div>
            <p class="page-kicker">OV02</p>
            <h2 id="ov02-create-model-title">创建模型</h2>
          </div>
          <button
            class="icon-control"
            type="button"
            aria-label="关闭创建模型"
            @click="closeDialog"
          >
            x
          </button>
        </div>
        <label class="form-field">
          <span>模型名称</span>
          <input
            v-model="modelName"
            data-testid="ov02-model-name"
            required
            maxlength="256"
            autofocus
          >
        </label>
        <div class="form-readonly"><span>Profile</span><strong>{{ project?.profile }}</strong></div>
        <div class="dialog-summary-grid">
          <div><span>根 Context</span><strong>SD</strong></div>
          <div><span>文本模态</span><strong>OPL</strong></div>
          <div><span>初始修订</span><strong>Draft r1</strong></div>
        </div>
        <p v-if="store.modelError" class="dialog-note" role="alert">{{ store.modelError }}</p>
        <p v-else class="dialog-note">提交后将创建根 Context 与初始 Draft，并打开工作台。</p>
        <div class="dialog-panel__footer">
          <button
            class="button"
            type="button"
            @click="closeDialog"
          >
            取消
          </button>
          <button
            class="button button--primary"
            type="submit"
            :disabled="store.isCreatingModel || store.openWorkspaceState === 'opening'"
          >
            {{ store.isCreatingModel || store.openWorkspaceState === 'opening' ? '正在打开…' : '创建并打开工作台' }}
          </button>
        </div>
      </form>
    </div>

    <div v-if="lifecycleModel" class="overlay-backdrop" @click.self="lifecycleFocus.closeDialog">
      <form
        :ref="lifecycleFocus.setDialogElement"
        class="dialog-panel"
        data-testid="p02-lifecycle-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="p02-lifecycle-title"
        aria-describedby="p02-lifecycle-description"
        @keydown="lifecycleFocus.onDialogKeydown"
        @submit.prevent="submitLifecycle"
      >
        <div class="dialog-panel__header"><h2 id="p02-lifecycle-title">{{ lifecycleLabel }}模型</h2></div>
        <p class="model-lifecycle__name">{{ lifecycleModel.name }}</p>
        <p id="p02-lifecycle-description" class="dialog-note">
          {{ lifecycleAction === 'TRASH' ? '模型将从活动列表移入回收站。全部 OPD、草稿及历史版本保留，可随时恢复。' : lifecycleAction === 'RESTORE' ? '恢复后，模型将重新出现在活动列表中，内容及历史版本保持完整。' : '将永久清除该模型的全部 OPD、草稿、历史版本和基线。此操作无法在应用内撤销；外部备份和已导出文件不会被删除。' }}
        </p>
        <label v-if="lifecycleAction === 'PURGE'" class="form-field">
          <span>输入完整模型名称以确认</span>
          <input v-model="confirmationName" data-testid="p02-purge-name" autocomplete="off" :disabled="store.lifecycleBusy">
        </label>
        <p v-if="store.lifecycleError" class="dialog-note model-lifecycle__danger" role="alert">{{ store.lifecycleError }}</p>
        <div class="dialog-panel__footer">
          <button class="button" type="button" :disabled="store.lifecycleBusy" @click="lifecycleFocus.closeDialog">取消</button>
          <button class="button" :class="lifecycleAction === 'PURGE' ? 'model-lifecycle__danger' : 'button--primary'" type="submit" data-testid="p02-lifecycle-confirm" :disabled="store.lifecycleBusy || (lifecycleAction === 'PURGE' && confirmationName !== lifecycleModel.name)">
            {{ store.lifecycleBusy ? '正在处理…' : lifecycleLabel }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Trash2 } from "@lucide/vue";

import OpdJsonImportDialog from "./OpdJsonImportDialog.vue";
import { useDialogFocus } from "@/shared/composables/useDialogFocus";
import { useProjectModelStore, type ModelListItem } from "@/stores/projectModel";
import type { ModelArchiveState, ModelLifecycleAction } from "@/shared/api/localRuntimeApi";

const route = useRoute();
const router = useRouter();
const store = useProjectModelStore();
const modelName = ref("原料加工模型");
const isDialogOpen = ref(false);
const isOpdImportOpen = ref(false);
async function openImportedOpd(model: string, context: string) {
  isOpdImportOpen.value = false;
  await router.push(`/projects/${encodeURIComponent(String(route.params.projectId))}/models/${encodeURIComponent(model)}/workbench?context=${encodeURIComponent(context)}`);
}
const project = computed(() => store.project);
const lifecycleModel = ref<ModelListItem | null>(null);
const lifecycleAction = ref<ModelLifecycleAction>("TRASH");
const confirmationName = ref("");
let lifecycleCommandId = "";
const lifecycleLabel = computed(() => ({ TRASH: "移入回收站", RESTORE: "恢复", PURGE: "永久删除" })[lifecycleAction.value]);
const lifecycleFocus = useDialogFocus(computed(() => lifecycleModel.value !== null), () => {
  if (!store.lifecycleBusy) lifecycleModel.value = null;
});
const { captureTrigger, closeDialog, onDialogKeydown, setDialogElement } = useDialogFocus(
  computed(() => isDialogOpen.value),
  () => { isDialogOpen.value = false; },
);

watch(
  () => route.params.projectId,
  (projectId) => {
    if (typeof projectId === "string") void store.loadProject(projectId);
  },
  { immediate: true },
);

function loadProject() {
  const projectId = route.params.projectId;
  if (typeof projectId === "string") return store.loadProject(projectId);
  return Promise.resolve();
}

async function openModel(modelId: string) {
  const projectId = route.params.projectId;
  if (typeof projectId !== "string") return;
  try {
    await store.openWorkspace(projectId, modelId);
    await router.push(`/projects/${projectId}/models/${modelId}/workbench`);
  } catch {
    // 错误已映射到模型区域。
  }
}

function openDialog() {
  captureTrigger();
  isDialogOpen.value = true;
}

function switchModels(state: ModelArchiveState) {
  const projectId = route.params.projectId;
  if (typeof projectId === "string") void store.loadModels(projectId, state);
}

function openLifecycle(model: ModelListItem, action: ModelLifecycleAction) {
  lifecycleFocus.captureTrigger();
  lifecycleModel.value = model;
  lifecycleAction.value = action;
  confirmationName.value = "";
  lifecycleCommandId = `command.model-lifecycle.${crypto.randomUUID()}`;
  store.lifecycleError = "";
}

async function submitLifecycle() {
  const projectId = route.params.projectId;
  const model = lifecycleModel.value;
  if (typeof projectId !== "string" || !model || store.lifecycleBusy) return;
  if (lifecycleAction.value === "PURGE" && confirmationName.value !== model.name) return;
  try {
    await store.changeModelLifecycle(projectId, model.id, lifecycleAction.value, lifecycleCommandId,
      lifecycleAction.value === "PURGE" ? confirmationName.value : undefined);
    lifecycleFocus.closeDialog();
  } catch {
    // 保留对话框和操作标识，失败重试沿用同一命令。
  }
}

async function submitModel() {
  const projectId = route.params.projectId;
  if (typeof projectId !== "string") return;
  try {
    const model = await store.createModel(projectId, modelName.value);
    closeDialog();
    await openModel(model.id);
  } catch {
    // 错误已映射到模型区域。
  }
}
</script>

<style scoped>
.project-import-actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
