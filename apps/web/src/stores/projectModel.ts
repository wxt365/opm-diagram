import { computed, ref } from "vue";
import { defineStore } from "pinia";

import { LocalRuntimeApiError, localRuntimeApi, type ModelWire, type ProjectWire, type ModelArchiveState, type ModelLifecycleAction } from "@/shared/api/localRuntimeApi";
import { DraftDelivery } from "@/shared/api/draftDelivery";
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
  const workspaceError = ref('');
  const projectListError = ref("");
  const projectError = ref("");
  const modelError = ref("");
  const modelArchiveState = ref<ModelArchiveState>("ACTIVE");
  const lifecycleError = ref("");
  const lifecycleBusy = ref(false);
  let projectListSequence = 0;
  let projectDetailSequence = 0;
  let currentProjectId = '', projectIdentity = 0, workspaceSequence = 0;
  let modelMutationVersion = 0, summaryVersion = 0;

  function selectProject(projectId: string) {
    if (currentProjectId === projectId) return;
    currentProjectId = projectId; projectIdentity++; workspaceSequence++;
    project.value = null; models.value = [];
    isCreatingModel.value = false; lifecycleBusy.value = false;
    openWorkspaceState.value = 'idle'; workspaceError.value = '';
  }
  function isCurrentProject(projectId: string, identity: number) {
    return currentProjectId === projectId && projectIdentity === identity;
  }

  async function readProjectModels(projectId: string, archiveState: ModelArchiveState, sequence: number, fullProject = false) {
    const ownsProjectLoad = fullProject || projectResource.value === 'loading';
    while (sequence === projectDetailSequence) {
      const mutation = modelMutationVersion;
      try {
        const [summary, items] = await Promise.all([localRuntimeApi.getProject(projectId), localRuntimeApi.listModels(projectId, archiveState)]);
        if (sequence !== projectDetailSequence) return;
        // 读取期间确认了创建，旧快照及旧失败均不能覆盖已确认结果。
        if (mutation !== modelMutationVersion) continue;
        const nextProject = toProjectItem(summary), nextModels = items.map(toModelItem);
        // 校验和应用之间不再 await，避免确认写入插入两个异步续体之间。
        project.value = nextProject; models.value = nextModels;
        summaryVersion++; projectError.value = '';
        projectResource.value = 'ready';
        modelListResource.value = nextModels.length ? 'ready' : 'empty';
        return;
      } catch (error) {
        if (sequence !== projectDetailSequence) return;
        if (mutation !== modelMutationVersion) continue;
        if (ownsProjectLoad) {
          project.value = null; models.value = []; projectResource.value = 'error'; projectError.value = message(error);
        }
        modelListResource.value = 'error'; modelError.value = message(error);
        return;
      }
    }
  }

  async function refreshModelCount(projectId: string, identity: number, mutation: number) {
    const sequence = projectDetailSequence, previousSummary = summaryVersion;
    const current = () => isCurrentProject(projectId, identity) && sequence === projectDetailSequence
      && mutation === modelMutationVersion && previousSummary === summaryVersion;
    try {
      const summary = await localRuntimeApi.getProject(projectId);
      if (current() && project.value) {
        project.value.modelCount = summary.model_count; projectError.value = ''; summaryVersion++;
      }
    } catch {
      if (current()) projectError.value = '模型已创建，但项目数量读取失败，请重试读取。';
    }
  }

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
    selectProject(projectId);
    workspaceSequence++;
    openWorkspaceState.value = 'idle'; workspaceError.value = '';
    const sequence = ++projectDetailSequence;
    projectResource.value = "loading";
    modelListResource.value = "loading";
    projectError.value = "";
    modelError.value = "";
    modelArchiveState.value = "ACTIVE";
    lifecycleError.value = "";
    await readProjectModels(projectId, 'ACTIVE', sequence, true);
  }

  async function createModel(projectId: string, name: string, description = "") {
    const identity = projectIdentity;
    isCreatingModel.value = true;
    modelError.value = "";
    try {
      const created = toModelItem(await localRuntimeApi.createModel(projectId, name.trim(), description.trim()));
      if (isCurrentProject(projectId, identity)) {
        const mutation = ++modelMutationVersion;
        if (modelArchiveState.value === 'ACTIVE') {
          models.value = [created, ...models.value.filter((item) => item.id !== created.id)];
          modelListResource.value = "ready";
        }
        // 创建已确认即可打开工作台；辅助摘要查询不能阻塞主流程。
        void refreshModelCount(projectId, identity, mutation);
      }
      return created;
    } catch (error) {
      if (isCurrentProject(projectId, identity)) modelError.value = message(error);
      throw error;
    } finally {
      if (isCurrentProject(projectId, identity)) isCreatingModel.value = false;
    }
  }

  async function loadModels(projectId: string, archiveState: ModelArchiveState) {
    selectProject(projectId);
    const sequence = ++projectDetailSequence;
    modelListResource.value = "loading";
    modelError.value = "";
    projectError.value = '';
    lifecycleError.value = "";
    modelArchiveState.value = archiveState;
    await readProjectModels(projectId, archiveState, sequence);
  }

  async function changeModelLifecycle(projectId: string, modelId: string, action: ModelLifecycleAction, commandId: string, confirmationName?: string) {
    if (lifecycleBusy.value) return;
    const identity = projectIdentity;
    lifecycleBusy.value = true;
    lifecycleError.value = "";
    try {
      if (action !== "RESTORE" && (await new DraftDelivery().pending(projectId, modelId)).length) {
        throw new LocalRuntimeApiError("DRAFT_PENDING_EXISTS", "该模型有尚未确认的编辑或保存，请先打开工作台完成恢复后再删除。");
      }
      if (!isCurrentProject(projectId, identity)) return;
      const result = await localRuntimeApi.changeModelLifecycle(projectId, modelId, action, commandId, confirmationName);
      if (result.model_id !== modelId || result.project_id !== projectId
        || result.lifecycle_state !== (action === "TRASH" ? "ARCHIVED" : action === "RESTORE" ? "ACTIVE" : "PURGED")) {
        throw new LocalRuntimeApiError("INPUT_INVALID", "模型操作响应不一致，请刷新列表确认状态。");
      }
      if (isCurrentProject(projectId, identity)) await loadModels(projectId, modelArchiveState.value);
    } catch (error) {
      if (isCurrentProject(projectId, identity)) lifecycleError.value = message(error);
      throw error;
    } finally { if (isCurrentProject(projectId, identity)) lifecycleBusy.value = false; }
  }

  async function openWorkspace(projectId: string, modelId: string) {
    const identity = projectIdentity, sequence = ++workspaceSequence;
    openWorkspaceState.value = "opening";
    modelError.value = ""; workspaceError.value = '';
    try {
      await localRuntimeApi.openWorkspace(projectId, modelId);
      if (isCurrentProject(projectId, identity) && sequence === workspaceSequence) openWorkspaceState.value = "opened";
    } catch (error) {
      if (isCurrentProject(projectId, identity) && sequence === workspaceSequence) {
        openWorkspaceState.value = "failed";
        modelError.value = message(error); workspaceError.value = message(error);
      }
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
    workspaceError,
    projectListError,
    projectError,
    modelError,
    modelArchiveState,
    lifecycleError,
    lifecycleBusy,
    hasProjects,
    loadProjects,
    createProject,
    loadProject,
    createModel,
    loadModels,
    changeModelLifecycle,
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
