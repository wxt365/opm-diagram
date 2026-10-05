import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CanvasZoomControls from "./CanvasZoomControls.vue";

describe("画布缩放控制", () => {
  it("输入百分比、Enter与失焦应用、Esc取消并同步外部滚轮比例", async () => {
    const wrapper = mount(CanvasZoomControls, { props: { zoom: 100 } });
    const input = wrapper.get("input");
    await input.setValue("85%"); await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("zoom")).toEqual([[85]]);
    await wrapper.setProps({ zoom: 85 }); await input.setValue("125.5"); await input.trigger("blur");
    expect(wrapper.emitted("zoom")?.at(-1)).toEqual([125.5]);
    await wrapper.setProps({ zoom: 125.5 }); await input.setValue("30"); await input.trigger("keydown", { key: "Escape" });
    expect((input.element as HTMLInputElement).value).toBe("125.5%");
    expect(wrapper.emitted("zoom")).toHaveLength(2);
    await wrapper.setProps({ zoom: 130 }); expect((input.element as HTMLInputElement).value).toBe("130%");
    wrapper.unmount();
  });
  it("非法输入恢复并提示，有效超界值限制到0.01%–400%", async () => {
    const wrapper = mount(CanvasZoomControls, { props: { zoom: 85 } });
    const input = wrapper.get("input");
    for (const value of ["", "abc", "-10", "0", "80px", "100%%", "Infinity"]) {
      await input.setValue(value); await input.trigger("blur");
      expect((input.element as HTMLInputElement).value).toBe("85%");
      expect(wrapper.get('[role="status"]').text()).toContain("大于 0");
    }
    expect(wrapper.emitted("zoom")).toBeUndefined();
    for (const [value, result] of [["900", 400], ["0.001%", 0.01]] as const) {
      await input.setValue(value); await input.trigger("blur"); expect(wrapper.emitted("zoom")?.at(-1)).toEqual([result]);
    }
    wrapper.unmount();
  });
  it("菜单预设与适应/恢复意图、外部关闭、键盘导航和焦点返回", async () => {
    const wrapper = mount(CanvasZoomControls, { attachTo: document.body, props: { zoom: 100 } });
    const toggle = wrapper.get('[data-testid="p03-zoom-menu-toggle"]');
    await toggle.trigger("click");
    expect(wrapper.findAll('[role="menuitemradio"]')).toHaveLength(9);
    expect(wrapper.get('[data-testid="p03-zoom-preset-100"]').attributes("aria-checked")).toBe("true");
    await wrapper.get('[data-testid="p03-zoom-preset-150"]').trigger("click"); expect(wrapper.emitted("zoom")).toEqual([[150]]);
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    for (const action of ["fit", "reset"]) {
      await toggle.trigger("click"); await wrapper.get(`[data-testid="p03-zoom-${action}"]`).trigger("click");
      expect(wrapper.emitted(action)).toEqual([[]]);
    }
    await wrapper.get("input").trigger("keydown", { key: "ArrowDown" }); await flushPromises();
    expect(document.activeElement?.getAttribute("data-testid")).toBe("p03-zoom-fit");
    await wrapper.get('[role="menu"]').trigger("keydown", { key: "End" });
    expect(document.activeElement?.getAttribute("data-testid")).toBe("p03-zoom-preset-400");
    await wrapper.get('[role="menu"]').trigger("keydown", { key: "Escape" }); expect(document.activeElement).toBe(toggle.element);
    await toggle.trigger("click"); document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })); await flushPromises();
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
