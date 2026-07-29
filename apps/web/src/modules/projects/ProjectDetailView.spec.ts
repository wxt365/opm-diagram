import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProjectDetailView from "./ProjectDetailView.vue";

describe("ProjectDetailView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.__OPM_LOCAL_SESSION__ = "test-session";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.__OPM_LOCAL_SESSION__;
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
