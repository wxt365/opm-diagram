import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProjectDetailView from "./ProjectDetailView.vue";
import { DraftDelivery } from "@/shared/api/draftDelivery";

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
    await wrapper.get("form").trigger("submit.prevent");
    await flushPromises();

    expect(router.currentRoute.value.path).toBe("/projects/project.test/models/model.created/workbench");
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
