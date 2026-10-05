<template>
  <section
    class="content-page project-library"
    data-testid="p01-project-library"
  >
    <div class="page-heading">
      <div>
        <p class="page-kicker">P01 · 本地项目</p>
        <h1>项目库</h1>
        <p class="page-summary">打开、新建和筛选本地建模项目。</p>
      </div>
      <button
        class="button button--primary"
        type="button"
        data-testid="p01-create-project"
        @click="openDialog"
      >
        新建项目
      </button>
    </div>

    <div class="list-toolbar">
      <label class="search-control">
        <span class="sr-only">搜索项目</span>
        <input
          v-model="projectSearch"
          data-testid="p01-search"
          type="search"
          placeholder="搜索项目或模型"
        >
      </label>
      <span class="toolbar-count">{{ store.projects.length }} 个项目</span>
    </div>

    <div v-if="store.projectListResource === 'loading'" class="empty-state" role="status">
      正在读取本地项目…
    </div>
    <div v-else-if="store.projectListResource === 'error'" class="empty-state" role="alert">
      <p>{{ store.projectListError }}</p>
      <button class="button" type="button" @click="loadProjects">重试</button>
    </div>
    <div v-else class="resource-table" role="table">
      <div class="resource-table__head" role="row">
        <span>项目</span>
        <span>默认 Profile</span>
        <span>模型</span>
        <span>最近打开</span>
        <span>操作</span>
      </div>
      <article
        v-for="project in store.projects"
        :key="project.id"
        class="resource-row"
        role="row"
      >
        <button
          class="resource-row__title"
          type="button"
          @click="openProject(project.id)"
        >
          <span class="resource-symbol">OPM</span>
          <span>
            <strong>{{ project.name }}</strong>
            <small>{{ project.description }}</small>
          </span>
        </button>
        <span class="profile-tag">{{ project.profile }}</span>
        <span>{{ project.modelCount }}</span>
        <span>{{ project.updatedAt }}</span>
        <button
          class="text-action"
          type="button"
          @click="openProject(project.id)"
        >
          打开
        </button>
      </article>
      <div
        v-if="store.projectListResource === 'empty'"
        class="empty-state"
      >
        没有匹配项目
      </div>
    </div>

    <div
      v-if="isDialogOpen"
      class="overlay-backdrop"
      @click.self="closeDialog"
    >
      <form
        :ref="setDialogElement"
        class="dialog-panel"
        data-testid="ov01-create-project"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ov01-create-project-title"
        @keydown="onDialogKeydown"
        @submit.prevent="submitProject"
      >
        <div class="dialog-panel__header">
          <div>
            <p class="page-kicker">OV01</p>
            <h2 id="ov01-create-project-title">创建项目</h2>
          </div>
          <button
            class="icon-control"
            type="button"
            aria-label="关闭创建项目"
            @click="closeDialog"
          >
            x
          </button>
        </div>
        <label class="form-field">
          <span>项目名称</span>
          <input
            v-model="projectName"
            data-testid="ov01-project-name"
            required
            maxlength="256"
            autofocus
          >
        </label>
        <label class="form-field">
          <span>说明</span>
          <textarea v-model="projectDescription" rows="3" />
        </label>
        <div class="form-readonly">
          <span>默认 Profile</span>
          <strong>{{ defaultProfileLabel }}</strong>
        </div>
        <div class="form-readonly">
          <span>本地位置</span>
          <strong>由本地运行时管理</strong>
        </div>
        <p v-if="store.projectListError" class="dialog-note" role="alert">{{ store.projectListError }}</p>
        <p v-else class="dialog-note">提交后将创建本地项目并进入项目详情。</p>
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
            :disabled="store.isCreatingProject"
          >
            {{ store.isCreatingProject ? '正在创建…' : '创建并继续' }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";

import { useDialogFocus } from "@/shared/composables/useDialogFocus";
import { useProjectModelStore } from "@/stores/projectModel";

const router = useRouter();
const store = useProjectModelStore();
const projectName = ref("智能仓储系统");
const projectDescription = ref("仓储作业与设备协同建模");
const projectSearch = ref("");
const isDialogOpen = ref(false);
const defaultProfileLabel = computed(() => {
  const binding = window.__OPM_ACTIVE_PROFILE_BINDING__;
  if (!binding?.profile_id || !binding.profile_version) return "本地默认 Profile（版本未提供）";
  const name = binding.profile_id === "profile.iso19450.2024.draft" ? "ISO 19450:2024 草案" : binding.profile_id;
  return `${name} ${binding.profile_version}`;
});
const { captureTrigger, closeDialog, onDialogKeydown, setDialogElement } = useDialogFocus(
  computed(() => isDialogOpen.value),
  () => { isDialogOpen.value = false; },
);
onMounted(loadProjects);

watch(projectSearch, loadProjects);

function loadProjects() {
  return store.loadProjects(projectSearch.value);
}

function openProject(projectId: string) {
  router.push(`/projects/${projectId}`);
}

function openDialog() {
  captureTrigger();
  isDialogOpen.value = true;
}

async function submitProject() {
  try {
    const project = await store.createProject(projectName.value, projectDescription.value);
    closeDialog();
    await router.push(`/projects/${project.id}`);
  } catch {
    // 错误已映射到页面可恢复提示。
  }
}
</script>
