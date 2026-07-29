import { createRouter, createWebHistory } from "vue-router";

import ProjectDetailView from "@/modules/projects/ProjectDetailView.vue";
import ProjectLibraryView from "@/modules/projects/ProjectLibraryView.vue";
import WorkbenchView from "@/modules/workbench/WorkbenchView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/projects",
    },
    {
      path: "/projects",
      component: ProjectLibraryView,
      meta: { title: "项目库" },
    },
    {
      path: "/projects/:projectId",
      component: ProjectDetailView,
      meta: { title: "项目详情" },
    },
    {
      path: "/projects/:projectId/models/:modelId/workbench",
      name: "workbench",
      component: WorkbenchView,
      meta: { title: "建模工作台" },
    },
  ],
});
