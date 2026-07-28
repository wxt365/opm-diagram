import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it } from "vitest";

import WorkbenchView from "./WorkbenchView.vue";

function mountWorkbench() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: WorkbenchView },
      { path: "/projects/:projectId/models/:modelId/workbench", component: WorkbenchView },
    ],
  });
  return { router, wrapper: mount(WorkbenchView, { global: { plugins: [createPinia(), router], stubs: { OpdCanvas: true } } }) };
}

describe("WorkbenchView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("通过页面动作切换底部问题面板", async () => {
    const { wrapper } = mountWorkbench();

    await wrapper.get('[data-testid="p03-tab-findings"]').trigger("click");

    expect(wrapper.get('[data-testid="p03-findings-panel"]').text()).toContain("VAL-TRACE-001");
  });

  it("切换 Context 后渲染对应画布投影和文本", async () => {
    const { wrapper } = mountWorkbench();

    await wrapper.get('[data-testid="p03-context-processing-refinement"]').trigger("click");

    expect(wrapper.get('[data-testid="p03-inspector-name"]').element.value).toBe("Processing Input");
    expect(wrapper.get('[data-testid="p03-opl-sentence"]').text()).toBe("Quality Check consumes available Processing Input.");
  });
});
