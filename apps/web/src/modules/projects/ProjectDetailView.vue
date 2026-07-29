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
      <div class="page-heading">
        <div>
          <p class="page-kicker">P02 · 项目详情</p>
          <h1>{{ project.name }}</h1>
          <p class="page-summary">{{ project.description }}</p>
        </div>
        <button
          class="button button--primary"
          type="button"
          data-testid="p02-create-model"
          @click="openDialog"
        >
          新建模型
        </button>
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
          <h2>模型</h2>
          <p>选择模型后，进入根 Context 与当前 Draft 的工作台。</p>
        </div>
      </div>
      <div v-if="store.modelListResource === 'empty'" class="empty-state">当前项目还没有模型。</div>
      <div v-else-if="store.modelListResource === 'error'" class="empty-state" role="alert">{{ store.modelError }}</div>
      <div v-else class="model-list">
        <article
          v-for="model in store.models"
          :key="model.id"
          class="model-card"
        >
          <div>
            <span class="model-card__marker">M</span>
            <div>
              <h3>{{ model.name }}</h3>
              <p>{{ model.accessMode === 'EDITABLE_DRAFT' ? '可编辑 Draft' : '只读修订' }}</p>
            </div>
          </div>
          <dl>
            <div><dt>修订</dt><dd>{{ model.headRevision }}</dd></div>
            <div><dt>访问</dt><dd>{{ model.accessMode === 'EDITABLE_DRAFT' ? '可编辑' : '只读' }}</dd></div>
            <div><dt>文本</dt><dd>OPL</dd></div>
          </dl>
          <div class="model-card__footer">
            <span class="profile-tag">{{ model.profile }}</span>
            <button
              class="button button--secondary"
              type="button"
              :data-testid="`p02-open-${model.id}`"
              @click="openModel(model.id)"
            >
              打开工作台
            </button>
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
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useDialogFocus } from "@/shared/composables/useDialogFocus";
import { useProjectModelStore } from "@/stores/projectModel";

const route = useRoute();
const router = useRouter();
const store = useProjectModelStore();
const modelName = ref("原料加工模型");
const isDialogOpen = ref(false);
const project = computed(() => store.project);
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
