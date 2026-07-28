import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import ProjectLibraryView from "./ProjectLibraryView.vue";

describe("ProjectLibraryView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
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

    const wrapper = mount(ProjectLibraryView, {
      global: { plugins: [router] },
    });

    await wrapper.get('[data-testid="p01-create-project"]').trigger("click");
    await wrapper.get('[data-testid="ov01-project-name"]').setValue("设计确认项目");
    await wrapper.get("form").trigger("submit.prevent");
    await flushPromises();

    expect(router.currentRoute.value.path).toMatch(/^\/projects\/project-/);
  });
});
