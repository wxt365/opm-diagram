import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import LayoutToolMenu from "./LayoutToolMenu.vue";
const state = { canAlign: true, canDistribute: true, reason: "", referenceLabel: "基准对象", count: 3 };
afterEach(() => { document.body.innerHTML = ""; });
describe("布局工具菜单", () => {
  it("六种对齐和两种分布都有名称，点击只发送相应意图并关闭", async () => {
    const wrapper = mount(LayoutToolMenu, { attachTo: document.body, props: { disabled: false, state, autoLayoutDisabled: true } });
    for (const action of ["left", "top", "center-x", "center-y", "right", "bottom", "distribute-x", "distribute-y"]) {
      await wrapper.get("button").trigger("click"); await flushPromises();
      const menu = document.querySelector('[data-testid="opd-layout-menu"]')!;
      expect(menu.textContent).toContain("基准对象（最后选中）");
      expect(menu.querySelectorAll("button")).toHaveLength(9);
      (menu.querySelector(`[data-testid="opd-layout-${action}"]`) as HTMLButtonElement).click();
      await flushPromises(); expect(wrapper.emitted("arrange")?.at(-1)).toEqual([action]);
      expect(document.querySelector('[data-testid="opd-layout-menu"]')).toBeNull();
    }
    wrapper.unmount();
  });
  it("选择不足和只读禁用操作，外部点击及 Escape 关闭", async () => {
    const wrapper = mount(LayoutToolMenu, { attachTo: document.body, props: { disabled: false, autoLayoutDisabled: true, state: { ...state, count: 1, canAlign: false, canDistribute: false } } });
    await wrapper.get("button").trigger("click"); await flushPromises();
    expect([...document.querySelectorAll('.layout-menu button')].every(button => (button as HTMLButtonElement).disabled)).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); await flushPromises();
    expect(wrapper.get("button").attributes("aria-expanded")).toBe("false");
    await wrapper.setProps({ disabled: true }); expect(wrapper.get("button").attributes("disabled")).toBeDefined();
    await wrapper.setProps({ disabled: false, state, autoLayoutDisabled: true });
    await wrapper.get("button").trigger("click"); document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })); await flushPromises();
    expect(wrapper.get("button").attributes("aria-expanded")).toBe("false");
    wrapper.unmount();
  });
  it("自动布局发送预览意图并关闭菜单", async () => {
    const wrapper = mount(LayoutToolMenu, { attachTo: document.body, props: { disabled: false, state } });
    await wrapper.get("button").trigger("click"); await flushPromises();
    (document.querySelector('[data-testid="opd-layout-auto"]') as HTMLButtonElement).click(); await flushPromises();
    expect(wrapper.emitted("autoLayout")).toEqual([[]]);
    expect(document.querySelector('[data-testid="opd-layout-menu"]')).toBeNull();
    wrapper.unmount();
  });
  it("键盘打开聚焦首项，方向键和首尾导航跳过禁用项，Escape 返回触发按钮", async () => {
    const wrapper = mount(LayoutToolMenu, { attachTo: document.body, props: { disabled: false, autoLayoutDisabled: true, state: { ...state, count: 2, canDistribute: false } } });
    wrapper.get("button").element.dispatchEvent(new MouseEvent("click", { detail: 0, bubbles: true })); await flushPromises();
    expect(document.activeElement?.getAttribute("data-testid")).toBe("opd-layout-left");
    for (const [key, action] of [["ArrowDown", "top"], ["End", "bottom"], ["ArrowDown", "left"], ["ArrowUp", "bottom"], ["Home", "left"]]) {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); await flushPromises();
      expect(document.activeElement?.getAttribute("data-testid")).toBe(`opd-layout-${action}`);
    }
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await flushPromises();
    expect(document.activeElement).toBe(wrapper.get("button").element);
    expect(document.querySelector('[data-testid="opd-layout-menu"]')).toBeNull();
    wrapper.unmount();
  });
});
