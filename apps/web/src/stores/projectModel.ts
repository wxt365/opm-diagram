import { computed, ref } from "vue";
import { defineStore } from "pinia";

import { LocalRuntimeApiError, localRuntimeApi, type ModelWire, type ProjectWire } from "@/shared/api/localRuntimeApi";
import type { ResourceState } from "@/shared/types/modeling";

export interface ProjectListItem {
  id: string;
  name: string;
  description: string;
  profile: string;
  modelCount: number;
  updatedAt: string;
  status: "active" | "archived";
}

export interface ModelListItem {
  id: string;
  projectId: string;
  name: string;
  profile: string;
  headRevision: string;
  accessMode: ModelWire["access_mode"];
}

export type OpenWorkspaceState = "idle" | "opening" | "opened" | "failed";

export const useProjectModelStore = defineStore("project-model", () => {
  const projects = ref<ProjectListItem[]>([]);
  const project = ref<ProjectListItem | null>(null);
  const models = ref<ModelListItem[]>([]);
  const projectListResource = ref<ResourceState>("loading");
  const projectResource = ref<ResourceState>("loading");
  const modelListResource = ref<ResourceState>("loading");
  const isCreatingProject = ref(false);
  const isCreatingModel = ref(false);
  const openWorkspaceState = ref<OpenWorkspaceState>("idle");
  const projectListError = ref("");
  const projectError = ref("");
  const modelError = ref("");
  let projectListSequence = 0;
  let projectDetailSequence = 0;

  const hasProjects = computed(() => projects.value.length > 0);

  async function loadProjects(query = "") {
    const sequence = ++projectListSequence;
    projectListResource.value = "loading";
    projectListError.value = "";
    try {
      const result = (await localRuntimeApi.listProjects(query)).map(toProjectItem);
      if (sequence !== projectListSequence) return;
      projects.value = result;
      projectListResource.value = result.length ? "ready" : "empty";
    } catch (error) {
      if (sequence !== projectListSequence) return;
      projects.value = [];
      projectListResource.value = "error";
      projectListError.value = message(error);
    }
  }

  async function createProject(name: string, description: string) {
    isCreatingProject.value = true;
    projectListError.value = "";
    try {
      const created = toProjectItem(await localRuntimeApi.createProject(name.trim(), description.trim()));
      projects.value = [created, ...projects.value.filter((item) => item.id !== created.id)];
      projectListResource.value = "ready";
      return created;
    } catch (error) {
      projectListError.value = message(error);
      throw error;
    } finally {
      isCreatingProject.value = false;
    }
  }

  async function loadProject(projectId: string) {
    const sequence = ++projectDetailSequence;
    projectResource.value = "loading";
    modelListResource.value = "loading";
    projectError.value = "";
    modelError.value = "";
    try {
      const [projectResult, modelResult] = await Promise.all([localRuntimeApi.getProject(projectId), localRuntimeApi.listModels(projectId)]);
      if (sequence !== projectDetailSequence) return;
      project.value = toProjectItem(projectResult);
      models.value = modelResult.map(toModelItem);
      projectResource.value = "ready";
      modelListResource.value = models.value.length ? "ready" : "empty";
    } catch (error) {
      if (sequence !== projectDetailSequence) return;
      project.value = null;
      models.value = [];
      projectResource.value = "error";
      modelListResource.value = "error";
      projectError.value = message(error);
      modelError.value = message(error);
    }
  }

  async function createModel(projectId: string, name: string) {
    isCreatingModel.value = true;
    modelError.value = "";
    try {
      const created = toModelItem(await localRuntimeApi.createModel(projectId, name.trim()));
      models.value = [created, ...models.value.filter((item) => item.id !== created.id)];
      modelListResource.value = "ready";
      if (project.value) project.value.modelCount += 1;
      return created;
    } catch (error) {
      modelError.value = message(error);
      throw error;
    } finally {
      isCreatingModel.value = false;
    }
  }

  async function openWorkspace(projectId: string, modelId: string) {
    openWorkspaceState.value = "opening";
    modelError.value = "";
    try {
      await localRuntimeApi.openWorkspace(projectId, modelId);
      openWorkspaceState.value = "opened";
    } catch (error) {
      openWorkspaceState.value = "failed";
      modelError.value = message(error);
      throw error;
    }
  }

  return {
    projects,
    project,
    models,
    projectListResource,
    projectResource,
    modelListResource,
    isCreatingProject,
    isCreatingModel,
    openWorkspaceState,
    projectListError,
    projectError,
    modelError,
    hasProjects,
    loadProjects,
    createProject,
    loadProject,
    createModel,
    openWorkspace,
  };
});

function toProjectItem(value: ProjectWire): ProjectListItem {
  return {
    id: value.project_id,
    name: value.name,
    description: value.description ?? "",
    profile: "本地默认 Profile",
    modelCount: value.model_count,
    updatedAt: value.updated_at,
    status: value.archive_state === "ARCHIVED" ? "archived" : "active",
  };
}

function toModelItem(value: ModelWire): ModelListItem {
  return {
    id: value.model_id,
    projectId: value.project_id,
    name: value.name,
    profile: `${value.profile_id} ${value.profile_version}`,
    headRevision: value.head_revision ?? "无活动草稿",
    accessMode: value.access_mode,
  };
}

function message(error: unknown) {
  return error instanceof LocalRuntimeApiError ? error.message : "本地请求失败，请重试。";
}
