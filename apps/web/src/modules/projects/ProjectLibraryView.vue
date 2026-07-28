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
        @click="store.openOverlay('project')"
      >
        新建项目
      </button>
    </div>

    <div class="list-toolbar">
      <label class="search-control">
        <span class="sr-only">搜索项目</span>
        <input
          v-model="store.projectSearch"
          data-testid="p01-search"
          type="search"
          placeholder="搜索项目或模型"
        >
      </label>
      <div class="segmented-control" aria-label="项目范围">
        <button
          v-for="scope in scopes"
          :key="scope.value"
          :class="{ 'is-active': store.projectScope === scope.value }"
          type="button"
          @click="store.projectScope = scope.value"
        >
          {{ scope.label }}
        </button>
      </div>
      <span class="toolbar-count">{{ store.filteredProjects.length }} 个项目</span>
    </div>

    <div class="resource-table" role="table">
      <div class="resource-table__head" role="row">
        <span>项目</span>
        <span>默认 Profile</span>
        <span>模型</span>
        <span>最近打开</span>
        <span>操作</span>
      </div>
      <article
        v-for="project in store.filteredProjects"
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
        <span>{{ project.lastOpenedAt }}</span>
        <button
          class="text-action"
          type="button"
          @click="openProject(project.id)"
        >
          打开
        </button>
      </article>
      <div
        v-if="store.filteredProjects.length === 0"
        class="empty-state"
      >
        没有匹配项目
      </div>
    </div>

    <div
      v-if="store.overlay?.kind === 'project'"
      class="overlay-backdrop"
      @click.self="store.closeOverlay()"
    >
      <form
        class="dialog-panel"
        data-testid="ov01-create-project"
        @submit.prevent="submitProject"
      >
        <div class="dialog-panel__header">
          <div>
            <p class="page-kicker">OV01</p>
            <h2>创建项目</h2>
          </div>
          <button
            class="icon-control"
            type="button"
            aria-label="关闭创建项目"
            @click="store.closeOverlay()"
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
          <strong>ISO 19450:2024 草案 0.1.0</strong>
        </div>
        <div class="form-readonly">
          <span>本地位置</span>
          <code>~/OPM Studio/&lt;项目名称&gt;</code>
        </div>
        <p class="dialog-note">提交只创建浏览器内的设计确认项目，不写入本地运行时。</p>
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
            创建并继续
          </button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

import { useDesignConfirmationStore } from "@/stores/designConfirmation";

const router = useRouter();
const store = useDesignConfirmationStore();
const projectName = ref("智能仓储系统");
const projectDescription = ref("仓储作业与设备协同建模");
const scopes = [
  { value: "active", label: "活动" },
  { value: "archived", label: "归档" },
  { value: "all", label: "全部" },
] as const;

function openProject(projectId: string) {
  store.selectProject(projectId);
  router.push(`/projects/${projectId}`);
}

function submitProject() {
  const project = store.createProject(projectName.value, projectDescription.value);
  router.push(`/projects/${project.id}`);
}
</script>
