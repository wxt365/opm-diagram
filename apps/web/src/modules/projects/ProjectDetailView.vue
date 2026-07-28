<template>
  <section
    class="content-page project-detail"
    data-testid="p02-project-detail"
  >
    <template v-if="project">
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
          @click="store.openOverlay('model')"
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
          <strong class="status-text status-text--success">活动</strong>
        </div>
        <div>
          <span>模型数量</span>
          <strong>{{ store.projectModels.length }}</strong>
        </div>
      </div>

      <div class="section-heading">
        <div>
          <h2>模型</h2>
          <p>选择模型后，进入根 Context 与当前 Draft 的工作台。</p>
        </div>
      </div>
      <div class="model-list">
        <article
          v-for="model in store.projectModels"
          :key="model.id"
          class="model-card"
        >
          <div>
            <span class="model-card__marker">M</span>
            <div>
              <h3>{{ model.name }}</h3>
              <p>{{ model.description }}</p>
            </div>
          </div>
          <dl>
            <div><dt>修订</dt><dd>Draft r{{ model.revision }}</dd></div>
            <div><dt>校验</dt><dd>{{ model.validation === 'current' ? '结果当前' : '结果过期' }}</dd></div>
            <div><dt>Context</dt><dd>{{ model.contextCount }}</dd></div>
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
      v-if="store.overlay?.kind === 'model'"
      class="overlay-backdrop"
      @click.self="store.closeOverlay()"
    >
      <form
        class="dialog-panel"
        data-testid="ov02-create-model"
        @submit.prevent="submitModel"
      >
        <div class="dialog-panel__header">
          <div>
            <p class="page-kicker">OV02</p>
            <h2>创建模型</h2>
          </div>
          <button
            class="icon-control"
            type="button"
            aria-label="关闭创建模型"
            @click="store.closeOverlay()"
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
        <p class="dialog-note">模型和根 Context 仅为设计确认态，不代表后端已创建。</p>
        <div class="dialog-panel__footer">
          <button
            class="button"
            type="button"
            @click="store.closeOverlay()"
          >
            取消
          </button>
          <button
            class="button button--primary"
            type="submit"
          >
            创建并打开工作台
          </button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useDesignConfirmationStore } from "@/stores/designConfirmation";

const route = useRoute();
const router = useRouter();
const store = useDesignConfirmationStore();
const modelName = ref("原料加工模型");
const project = computed(() => store.activeProject);

watch(
  () => route.params.projectId,
  (projectId) => {
    if (typeof projectId === "string") store.selectProject(projectId);
  },
  { immediate: true },
);

function openModel(modelId: string) {
  store.selectModel(modelId);
  router.push(`/projects/${store.activeProjectId}/models/${modelId}/workbench`);
}

function submitModel() {
  const model = store.createModel(modelName.value);
  if (model) openModel(model.id);
}
</script>
