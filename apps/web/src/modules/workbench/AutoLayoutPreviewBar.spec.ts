import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AutoLayoutPreviewBar from "./AutoLayoutPreviewBar.vue";
describe("自动布局预览条", () => {
  it("明确未应用，支持方向切换、应用、取消及 Escape，提交期间禁用", async () => {
    const cancel = vi.fn();
    const wrapper = mount(AutoLayoutPreviewBar, { attachTo: document.body, props: { direction: "right", busy: false, onCancel: cancel } });
    await flushPromises(); expect(wrapper.text()).toContain("尚未应用");
    expect(document.activeElement).toBe(wrapper.get("select").element);
    await wrapper.get("select").setValue("down"); expect(wrapper.emitted("direction")).toEqual([["down"]]);
    await wrapper.get('[data-testid="opd-auto-apply"]').trigger("click"); expect(wrapper.emitted("apply")).toHaveLength(1);
    await wrapper.get('[data-testid="opd-auto-cancel"]').trigger("click");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); expect(wrapper.emitted("cancel")).toHaveLength(2);
    await wrapper.setProps({ busy: true });
    expect(wrapper.get("select").attributes("disabled")).toBeDefined();
    expect(wrapper.findAll("button").every(button => button.attributes("disabled") !== undefined)).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); expect(wrapper.emitted("cancel")).toHaveLength(2);
    wrapper.unmount(); window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); expect(cancel).toHaveBeenCalledTimes(2);
  });
});
