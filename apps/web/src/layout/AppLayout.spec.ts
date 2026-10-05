import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import AppLayout from "./AppLayout.vue";

async function mountLayout(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/projects", component: { template: "<div />" }, meta: { title: "项目库" } },
      { path: "/workbench", component: { template: "<div />" }, meta: { title: "建模工作台" } },
    ],
  });
  await router.push(path);
  await router.isReady();
  return { router, wrapper: mount(AppLayout, { global: { plugins: [createPinia(), router] } }) };
}

describe("AppLayout", () => {
  it("工作台不显示没有对应全局侧栏的导航按钮", async () => {
    const { wrapper } = await mountLayout("/workbench");
    expect(wrapper.classes()).toContain("app-layout--focus");
    expect(wrapper.find(".app-sidebar").exists()).toBe(false);
    expect(wrapper.find(".header-toggle").exists()).toBe(false);
    wrapper.unmount();
  });

  it("项目导航可收起和展开，工作台往返保留正确的导航状态", async () => {
    const { router, wrapper } = await mountLayout("/projects");
    expect(wrapper.get(".header-toggle").attributes("aria-label")).toBe("收起导航");
    await wrapper.get(".header-toggle").trigger("click");
    expect(wrapper.get(".app-sidebar").classes()).toContain("app-sidebar--collapsed");
    expect(wrapper.get(".header-toggle").attributes("aria-label")).toBe("展开导航");

    await router.push("/workbench");
    expect(wrapper.find(".header-toggle").exists()).toBe(false);
    await router.push("/projects");
    expect(wrapper.get(".app-sidebar").classes()).toContain("app-sidebar--collapsed");
    await wrapper.get(".header-toggle").trigger("click");
    expect(wrapper.get(".app-sidebar").classes()).not.toContain("app-sidebar--collapsed");
    expect(wrapper.get(".header-toggle").attributes("aria-label")).toBe("收起导航");
    wrapper.unmount();
  });
});
