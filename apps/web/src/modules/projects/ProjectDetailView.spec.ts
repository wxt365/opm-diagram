import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProjectDetailView from "./ProjectDetailView.vue";
import { DraftDelivery } from "@/shared/api/draftDelivery";
import { useProjectModelStore } from '@/stores/projectModel';

describe("ProjectDetailView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.__OPM_LOCAL_SESSION__ = "test-session";
    window.__OPM_ACTIVE_PROFILE_BINDING__ = {
      profile_id: "profile.iso19450.2024.draft",
      profile_version: "0.2.0",
      rule_set_id: "rules.iso19450.2024.draft",
      rule_version: "0.1.0",
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete window.__OPM_LOCAL_SESSION__;
    delete window.__OPM_ACTIVE_PROFILE_BINDING__;
  });

  it('创建已确认但数量查询挂起时仍立即进入工作台', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/projects/:projectId', component: ProjectDetailView },
      { path: '/projects/:projectId/models/:modelId/workbench', component: { template: '<div />' } },
    ] }); await router.push('/projects/project.test');
    let created = false, complete!: (value: Response) => void, writes = 0;
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') { created = true; writes++; return response(201, { data: model() }); }
      if (path.includes('workspace-session')) return response(200, { data: { model: model() } });
      if (path.includes('/models?')) return response(200, { data: [] });
      if (created) return await new Promise<Response>(resolve => { complete = resolve; });
      return response(200, { data: project() });
    }));
    const w = mount(ProjectDetailView, { global: { plugins: [router] } }); await flushPromises();
    try {
      await w.get('[data-testid="p02-create-model"]').trigger('click'); await w.get('form').trigger('submit'); await flushPromises();
      expect(router.currentRoute.value.path).toBe('/projects/project.test/models/model.created/workbench');
      expect(useProjectModelStore().isCreatingModel).toBe(false); expect(writes).toBe(1);
    } finally { complete(response(200, { data: { ...project(), model_count: 1 } })); await flushPromises(); w.unmount(); }
  });

  it('离开后重新挂载同一项目，旧打开错误消失且可重新打开', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/projects/:projectId', component: ProjectDetailView },
      { path: '/projects/:projectId/models/:modelId/workbench', component: { template: '<div />' } },
    ] }); await router.push('/projects/project.test');
    let fail = true;
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path.includes('workspace-session')) return fail ? response(503, { error: { code: 'FAILED', message: '旧打开失败', retryable: true } })
        : response(200, { data: { model: model() } });
      return response(200, { data: path.includes('/models?') ? [model()] : project() });
    }));
    const first = mount(ProjectDetailView, { global: { plugins: [router] } }); await flushPromises();
    await first.get('[data-testid="p02-open-model.created"]').trigger('click'); await flushPromises();
    expect(first.get('[data-testid="p02-workspace-error"]').text()).toContain('旧打开失败'); first.unmount();
    const second = mount(ProjectDetailView, { global: { plugins: [router] } }); await flushPromises();
    expect(second.find('[data-testid="p02-workspace-error"]').exists()).toBe(false);
    fail = false; await second.get('[data-testid="p02-open-model.created"]').trigger('click'); await flushPromises();
    expect(router.currentRoute.value.path).toContain('/model.created/workbench'); second.unmount();
  });

  it('数量读取失败独立提示，重试保留回收站且不再创建', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/projects/:projectId', component: ProjectDetailView }] });
    await router.push('/projects/project.test');
    let created = false, failSummary = true, writes = 0;
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') { created = true; writes++; return response(201, { data: model() }); }
      if (path.includes('/models?')) return response(200, { data: [] });
      if (created && failSummary) return response(503, { error: { code: 'FAILED', message: '数量读取失败', retryable: true } });
      return response(200, { data: { ...project(), model_count: created ? 1 : 0 } });
    }));
    const w = mount(ProjectDetailView, { global: { plugins: [router] } }); await flushPromises();
    await w.get('[data-testid="p02-trash-tab"]').trigger('click'); await flushPromises();
    await useProjectModelStore().createModel('project.test', '新模型'); await flushPromises();
    expect(w.get('[data-testid="p02-project-summary-error"]').text()).toContain('模型已创建');
    failSummary = false; await w.get('[data-testid="p02-project-summary-error"] button').trigger('click'); await flushPromises();
    expect(w.find('[data-testid="p02-project-summary-error"]').exists()).toBe(false);
    expect(useProjectModelStore().modelArchiveState).toBe('ARCHIVED'); expect(useProjectModelStore().project?.modelCount).toBe(1);
    expect(w.text()).toContain('回收站为空'); expect(writes).toBe(1); w.unmount();
  });

  it.each([false, true])('模型打开失败在列表显示并可重试，无需重新创建，刚创建=%s', async created => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/projects/:projectId', component: ProjectDetailView },
      { path: '/projects/:projectId/models/:modelId/workbench', component: { template: '<div />' } },
    ] }); await router.push('/projects/project.test');
    let attempts = 0;
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') return response(201, { data: model() });
      if (path.includes('workspace-session')) return ++attempts === 1
        ? response(503, { error: { code: 'UNAVAILABLE', message: '打开失败，请重试', retryable: true } })
        : response(200, { data: { model: model() } });
      return response(200, { data: path.includes('/models?') ? (created ? [] : [model()]) : project() });
    }); vi.stubGlobal('fetch', fetchMock);
    const w = mount(ProjectDetailView, { global: { plugins: [router] } }); await flushPromises();
    if (created) { await w.get('[data-testid="p02-create-model"]').trigger('click'); await w.get('form').trigger('submit'); }
    else await w.get('[data-testid="p02-open-model.created"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="p02-workspace-error"]').text()).toContain('打开失败');
    expect(w.find('[data-testid="p02-open-model.created"]').exists()).toBe(true);
    await w.get('[data-testid="p02-workspace-error"] button').trigger('click'); await flushPromises();
    expect(router.currentRoute.value.path).toBe('/projects/project.test/models/model.created/workbench');
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(created ? 1 : 0); w.unmount();
  });

  it('同页连续打开以最新选择为准，旧成功不覆盖新失败或跳转', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/projects/:projectId', component: ProjectDetailView },
      { path: '/projects/:projectId/models/:modelId/workbench', component: { template: '<div />' } },
    ] }); await router.push('/projects/project.test');
    let complete!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path.includes('/model.created/workspace-session')) return await new Promise<Response>(resolve => { complete = resolve; });
      if (path.includes('/model.next/workspace-session')) return response(503, { error: { code: 'FAILED', message: '新模型打开失败', retryable: true } });
      return response(200, { data: path.includes('/models?') ? [model(), { ...model(), model_id: 'model.next' }] : project() });
    }));
    const w = mount(ProjectDetailView, { global: { plugins: [router] } }); await flushPromises();
    await w.get('[data-testid="p02-open-model.created"]').trigger('click');
    await w.get('[data-testid="p02-open-model.next"]').trigger('click'); await flushPromises();
    complete(response(200, { data: { model: model() } })); await flushPromises();
    expect(router.currentRoute.value.path).toBe('/projects/project.test');
    expect(w.get('[data-testid="p02-workspace-error"]').text()).toContain('新模型打开失败'); w.unmount();
  });

  it.each(['create', 'open'] as const)('切换项目后旧 %s 响应不触发错误跳转', async operation => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/projects/:projectId', component: ProjectDetailView },
      { path: '/projects/:projectId/models/:modelId/workbench', component: { template: '<div />' } },
    ] }); await router.push('/projects/project.test');
    let complete!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST' || path.includes('workspace-session')) return await new Promise<Response>(resolve => { complete = resolve; });
      return response(200, { data: path.includes('/models?') ? (operation === 'open' && !path.includes('project.b') ? [model()] : [])
        : { ...project(), project_id: path.includes('project.b') ? 'project.b' : 'project.test' } });
    }));
    const w = mount(ProjectDetailView, { global: { plugins: [router] } }); await flushPromises();
    if (operation === 'create') {
      await w.get('[data-testid="p02-create-model"]').trigger('click'); await w.get('form').trigger('submit');
    } else await w.get('[data-testid="p02-open-model.created"]').trigger('click');
    await router.push('/projects/project.b'); await flushPromises();
    complete(response(200, { data: operation === 'create' ? model() : { model: model() } })); await flushPromises();
    expect(router.currentRoute.value.path).toBe('/projects/project.b');
    expect(useProjectModelStore().models).toEqual([]); expect(useProjectModelStore().project?.modelCount).toBe(0); w.unmount();
  });

  it('回收站不提供新建模型入口', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/projects/:projectId', component: ProjectDetailView }] });
    await router.push('/projects/project.test');
    vi.stubGlobal('fetch', vi.fn(async (path: string) => response(200, { data: path.includes('/models?') ? [] : project() })));
    const w = mount(ProjectDetailView, { global: { plugins: [router] } }); await flushPromises();
    await w.get('[data-testid="p02-trash-tab"]').trigger('click'); await flushPromises();
    expect(w.find('[data-testid="p02-create-model"]').exists()).toBe(false); w.unmount();
  });

  it("OV02 使用对话框语义并在取消后回到触发控件", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/projects/:projectId", component: ProjectDetailView }],
    });
    await router.push("/projects/project-raw-material");
    await router.isReady();
    vi.stubGlobal("fetch", vi.fn(async (input: string) => input.includes("/models?")
      ? response(200, { data: [] })
      : response(200, { data: project() })));
    const wrapper = mount(ProjectDetailView, { attachTo: document.body, global: { plugins: [router] } });
    await flushPromises();
    const trigger = wrapper.get('[data-testid="p02-create-model"]');
    (trigger.element as HTMLButtonElement).focus();

    await trigger.trigger("click");
    await wrapper.vm.$nextTick();
    const dialog = wrapper.get('[data-testid="ov02-create-model"]');
    expect(dialog.attributes()).toMatchObject({ role: "dialog", "aria-modal": "true", "aria-labelledby": "ov02-create-model-title" });
    expect(document.activeElement).toBe(wrapper.get('[data-testid="ov02-model-name"]').element);

    await dialog.trigger("keydown", { key: "Escape" });
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(trigger.element);
  });

  it("创建模型并在 workspace 校验后进入稳定工作台路由", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/projects/:projectId", component: ProjectDetailView },
        { path: "/projects/:projectId/models/:modelId/workbench", component: { template: "<div />" } },
      ],
    });
    await router.push("/projects/project.test");
    await router.isReady();
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.method === "POST") return response(201, { data: model() });
      if (input.includes("workspace-session")) return response(200, { data: { model: model(), root_context_id: "context.root", current_context_id: "context.root" } });
      if (input.includes("/models?")) return response(200, { data: [] });
      return response(200, { data: project() });
    }));
    const wrapper = mount(ProjectDetailView, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.get('[data-testid="p02-create-model"]').trigger("click");
    await wrapper.get('[data-testid="ov02-model-name"]').setValue("真实模型");
    await wrapper.get('[data-testid="ov02-model-goal"]').setValue("仅梳理原料加工的对象、过程和状态");
    await wrapper.get("form").trigger("submit.prevent");
    await flushPromises();

    expect(router.currentRoute.value.path).toBe("/projects/project.test/models/model.created/workbench");
    const create = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(create?.[1]?.body))).toMatchObject({ description: "仅梳理原料加工的对象、过程和状态" });
    expect(wrapper.find('input[name="model-method"]').exists()).toBe(false);
  });

  it("取消不提交，移入回收站、恢复及名称确认后永久删除", async () => {
    vi.spyOn(DraftDelivery.prototype, "pending").mockResolvedValue([]);
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/projects/:projectId", component: ProjectDetailView }] });
    await router.push("/projects/project.test");
    let state = "ACTIVE";
    const actions: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/lifecycle")) {
        const body = JSON.parse(init!.body as string);
        actions.push(body.action);
        state = body.action === "RESTORE" ? "ACTIVE" : body.action === "TRASH" ? "ARCHIVED" : "PURGED";
        return response(200, { data: { project_id: "project.test", model_id: "model.created", lifecycle_state: state } });
      }
      if (input.includes("/models?")) return response(200, { data: input.includes(`archive_state=${state}`) ? [model()] : [] });
      return response(200, { data: { ...project(), model_count: state === "ACTIVE" ? 1 : 0 } });
    }));
    const wrapper = mount(ProjectDetailView, { global: { plugins: [router] } });
    await flushPromises();
    await wrapper.get('[data-testid="p02-trash-model.created"]').trigger("click");
    await wrapper.get('[data-testid="p02-lifecycle-dialog"]').trigger("keydown", { key: "Escape" });
    expect(actions).toEqual([]);
    await wrapper.get('[data-testid="p02-trash-model.created"]').trigger("click");
    await wrapper.get('[data-testid="p02-lifecycle-dialog"]').trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("当前项目还没有模型");
    await wrapper.get('[data-testid="p02-trash-tab"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="p02-restore-model.created"]').trigger("click");
    await wrapper.get('[data-testid="p02-lifecycle-dialog"]').trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("回收站为空");
    await wrapper.get('[aria-pressed="false"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="p02-trash-model.created"]').trigger("click");
    await wrapper.get('[data-testid="p02-lifecycle-dialog"]').trigger("submit");
    await flushPromises();
    await wrapper.get('[data-testid="p02-trash-tab"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="p02-purge-model.created"]').trigger("click");
    expect(wrapper.get('[data-testid="p02-lifecycle-confirm"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[data-testid="p02-purge-name"]').setValue("错误名称");
    await wrapper.get('[data-testid="p02-lifecycle-dialog"]').trigger("submit");
    expect(actions).toEqual(["TRASH", "RESTORE", "TRASH"]);
    await wrapper.get('[data-testid="p02-purge-name"]').setValue("真实模型");
    await wrapper.get('[data-testid="p02-lifecycle-dialog"]').trigger("submit");
    await flushPromises();
    expect(actions).toEqual(["TRASH", "RESTORE", "TRASH", "PURGE"]);
    expect(wrapper.find('[data-testid="p02-lifecycle-dialog"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("回收站为空");
    wrapper.unmount();
  });

  it("待确认输入阻断删除并保留对话框，失败重试沿用命令标识", async () => {
    const pending = vi.spyOn(DraftDelivery.prototype, "pending").mockResolvedValue([{} as never]);
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/projects/:projectId", component: ProjectDetailView }] });
    await router.push("/projects/project.test");
    const commands: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/lifecycle")) {
        commands.push(JSON.parse(init!.body as string).command_id);
        return response(503, { error: { code: "PERSISTENCE_FAILED", message: "写入失败", retryable: true } });
      }
      return response(200, { data: input.includes("/models?") ? [model()] : project() });
    }));
    const wrapper = mount(ProjectDetailView, { global: { plugins: [router] } });
    await flushPromises();
    await wrapper.get('[data-testid="p02-trash-model.created"]').trigger("click");
    await wrapper.get('[data-testid="p02-lifecycle-dialog"]').trigger("submit");
    await flushPromises();
    expect(commands).toHaveLength(0);
    expect(wrapper.get('[role="alert"]').text()).toContain("尚未确认");
    pending.mockResolvedValue([]);
    for (let i = 0; i < 2; i++) { await wrapper.get('[data-testid="p02-lifecycle-dialog"]').trigger("submit"); await flushPromises(); }
    expect(commands).toHaveLength(2);
    expect(commands[0]).toBe(commands[1]);
    expect(wrapper.get('[role="alert"]').text()).toContain("写入失败");
    wrapper.unmount();
  });
});

function project() {
  return { project_id: "project.test", name: "测试项目", description: "说明", archive_state: "ACTIVE", model_count: 0, updated_at: "2026-07-28T00:00:00Z" };
}

function model() {
  return { model_id: "model.created", project_id: "project.test", name: "真实模型", head_revision: "revision.initial", profile_id: "profile.iso19450.2024.draft", profile_version: "0.1.0", rule_version: "0.1.0", access_mode: "EDITABLE_DRAFT" };
}

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
