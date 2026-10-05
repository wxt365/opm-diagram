import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProjectLibraryView from "./ProjectLibraryView.vue";

describe("ProjectLibraryView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.__OPM_LOCAL_SESSION__ = "test-session";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.__OPM_LOCAL_SESSION__;
    delete window.__OPM_ACTIVE_PROFILE_BINDING__;
  });

  it.each([
    ["profile.iso19450.2024.draft", "0.2.0", "ISO 19450:2024 草案 0.2.0"],
    ["profile.iso19450.2024.draft", "0.7.0", "ISO 19450:2024 草案 0.7.0"],
    ["profile.custom", "1.2.3", "profile.custom 1.2.3"],
    ["", "", "本地默认 Profile（版本未提供）"],
  ])("创建弹窗按启动信息显示 Profile：%s %s", async (profileId, version, label) => {
    if (profileId) window.__OPM_ACTIVE_PROFILE_BINDING__ = {
      profile_id: profileId, profile_version: version, rule_set_id: "rule.test", rule_version: "1.0.0",
    };
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/projects", component: ProjectLibraryView }] });
    await router.push("/projects");
    vi.stubGlobal("fetch", vi.fn(async () => response(200, query([]))));
    const wrapper = mount(ProjectLibraryView, { global: { plugins: [router] } });
    await flushPromises();
    await wrapper.get('[data-testid="p01-create-project"]').trigger("click");

    const fields = wrapper.findAll(".form-readonly");
    expect(fields[0]?.text()).toBe(`默认 Profile${label}`);
    expect(fields[1]?.text()).toBe("本地位置由本地运行时管理");
    expect(wrapper.text()).not.toContain("~/OPM Studio/");
    wrapper.unmount();
  });

  it("创建项目后进入项目详情", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/projects", component: ProjectLibraryView },
        { path: "/projects/:projectId", component: { template: "<div />" } },
      ],
    });
    await router.push("/projects");
    await router.isReady();

    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.method === "POST") return response(201, command(project("project.created")));
      return response(200, query([]));
    }));
    const wrapper = mount(ProjectLibraryView, {
      global: { plugins: [router] },
    });
    await flushPromises();

    await wrapper.get('[data-testid="p01-create-project"]').trigger("click");
    await wrapper.get('[data-testid="ov01-project-name"]').setValue("设计确认项目");
    await wrapper.get("form").trigger("submit.prevent");
    await flushPromises();

    expect(router.currentRoute.value.path).toBe("/projects/project.created");
  });

  it("OV01 使用对话框语义并在取消后回到触发控件", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/projects", component: ProjectLibraryView }],
    });
    await router.push("/projects");
    await router.isReady();
    vi.stubGlobal("fetch", vi.fn(async () => response(200, query([]))));
    const wrapper = mount(ProjectLibraryView, { attachTo: document.body, global: { plugins: [router] } });
    await flushPromises();
    const trigger = wrapper.get('[data-testid="p01-create-project"]');
    (trigger.element as HTMLButtonElement).focus();

    await trigger.trigger("click");
    await wrapper.vm.$nextTick();
    const dialog = wrapper.get('[data-testid="ov01-create-project"]');
    expect(dialog.attributes()).toMatchObject({ role: "dialog", "aria-modal": "true", "aria-labelledby": "ov01-create-project-title" });
    expect(document.activeElement).toBe(wrapper.get('[data-testid="ov01-project-name"]').element);

    await dialog.trigger("keydown", { key: "Escape" });
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(trigger.element);
  });

  it("读取失败时显示可恢复提示", async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/projects", component: ProjectLibraryView }] });
    await router.push("/projects");
    await router.isReady();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));

    const wrapper = mount(ProjectLibraryView, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain("本地运行时不可用");
    expect(wrapper.get('[role="alert"] button').text()).toBe("重试");
  });
});

function project(projectId: string) {
  return { project_id: projectId, name: "设计确认项目", description: "说明", archive_state: "ACTIVE", model_count: 0, updated_at: "2026-07-28T00:00:00Z" };
}

function query(data: unknown) {
  return { data };
}

function command(data: unknown) {
  return { data };
}

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
