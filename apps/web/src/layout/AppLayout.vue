<template>
  <div
    class="app-layout"
    :class="{ 'app-layout--focus': isWorkbench }"
    data-testid="app-shell"
  >
    <header class="app-header">
      <button
        class="brand-button"
        type="button"
        aria-label="返回项目库"
        @click="router.push('/projects')"
      >
        <span class="brand-mark">OPM</span>
        <span>OPM Studio</span>
      </button>
      <div class="header-context">
        <span class="header-context__label">本地设计确认</span>
        <span class="header-context__state">Local Runtime · P03 设计确认</span>
      </div>
      <button
        class="header-toggle"
        type="button"
        :aria-label="store.isSidebarCollapsed ? '展开导航' : '收起导航'"
        @click="store.isSidebarCollapsed = !store.isSidebarCollapsed"
      >
        {{ store.isSidebarCollapsed ? '>' : '<' }}
      </button>
    </header>

    <div class="app-layout__body">
      <aside
        v-if="!isWorkbench"
        class="app-sidebar"
        :class="{ 'app-sidebar--collapsed': store.isSidebarCollapsed }"
      >
        <button
          class="sidebar-item"
          :class="{ 'sidebar-item--active': route.path === '/projects' }"
          type="button"
          @click="router.push('/projects')"
        >
          <span aria-hidden="true">P</span>
          <span v-if="!store.isSidebarCollapsed">项目库</span>
        </button>
        <button
          class="sidebar-item"
          :class="{ 'sidebar-item--active': route.meta.title === '项目详情' }"
          type="button"
          :disabled="!store.activeProject"
          @click="router.push(`/projects/${store.activeProjectId}`)"
        >
          <span aria-hidden="true">M</span>
          <span v-if="!store.isSidebarCollapsed">模型</span>
        </button>
      </aside>

      <main class="app-main">
        <nav
          v-if="!isWorkbench"
          class="app-breadcrumb"
          aria-label="当前位置"
        >
          <button
            type="button"
            @click="router.push('/projects')"
          >
            项目库
          </button>
          <span>/</span>
          <strong>{{ route.meta.title }}</strong>
        </nav>
        <slot />
      </main>
    </div>

    <Transition name="toast">
      <div
        v-if="store.toast"
        class="app-toast"
        role="status"
      >
        {{ store.toast }}
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useDesignConfirmationStore } from "@/stores/designConfirmation";

const route = useRoute();
const router = useRouter();
const store = useDesignConfirmationStore();
const isWorkbench = computed(() => route.meta.title === "建模工作台");
</script>
