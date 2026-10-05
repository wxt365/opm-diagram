import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import CanvasContextMenu from "./CanvasContextMenu.vue";

describe("画布空白菜单", () => {
  const state = { canAlign: true, canDistribute: true, reason: "", referenceLabel: "基准对象", count: 3 };
  it("历史选项发送撤销或重做意图，禁用时不可触发", async () => {
    const wrapper = mount(CanvasContextMenu, { attachTo: document.body, props: { anchor: { clientX: 100, clientY: 120 }, disabled: false, canUndo: true, canRedo: true, state } });
    const undo = document.querySelector<HTMLButtonElement>('[data-testid="opd-blank-undo"]')!;
    const redo = document.querySelector<HTMLButtonElement>('[data-testid="opd-blank-redo"]')!;
    undo.click(); redo.click(); expect(wrapper.emitted("history")).toEqual([[false], [true]]);
    await wrapper.setProps({ actionsDisabled: true }); undo.click(); redo.click();
    expect(wrapper.emitted("history")).toHaveLength(2);
    expect(document.querySelector<HTMLButtonElement>('[data-testid="opd-blank-arrange"]')!.disabled).toBe(true);
    wrapper.unmount();
  });
  it("排列复用八项，键盘跳过禁用分布项，Escape先返回主菜单", async () => {
    const wrapper = mount(CanvasContextMenu, { attachTo: document.body, props: { anchor: { clientX: 100, clientY: 120 }, disabled: false, state: { ...state, count: 2, canDistribute: false } } });
    const trigger = document.querySelector<HTMLButtonElement>('[data-testid="opd-blank-arrange"]')!;
    trigger.focus(); window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })); await flushPromises();
    expect(document.querySelector('[data-testid="opd-blank-menu"]')!.textContent).toContain("基准对象（最后选中）");
    expect(document.querySelectorAll('[data-testid^="opd-blank-layout-"]')).toHaveLength(9);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }));
    expect(document.activeElement?.getAttribute("data-testid")).toBe("opd-blank-layout-bottom");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); await flushPromises();
    expect(wrapper.emitted("close")).toBeUndefined(); expect(document.activeElement).toBe(document.querySelector('[data-testid="opd-blank-arrange"]'));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })); await flushPromises();
    (document.querySelector('[data-testid="opd-blank-layout-top"]') as HTMLButtonElement).click();
    expect(wrapper.emitted("arrange")).toEqual([["top"]]); expect(wrapper.emitted("close")).toEqual([[]]);
    wrapper.unmount();
  });
  it("禁用时不能启动布局，启用后发出布局意图并关闭", async () => {
    const wrapper = mount(CanvasContextMenu, { attachTo: document.body, props: { anchor: { clientX: 100, clientY: 120 }, disabled: true } });
    const button = document.querySelector<HTMLButtonElement>('[data-testid="opd-blank-auto-layout"]')!;
    button.click(); expect(wrapper.emitted("autoLayout")).toBeUndefined();
    await wrapper.setProps({ disabled: false }); button.click();
    expect(wrapper.emitted("autoLayout")).toEqual([[]]); expect(wrapper.emitted("close")).toEqual([[]]);
    wrapper.unmount();
  });
  it("点击菜单内部保持打开，外部点击、Escape、滚动关闭，销毁移除监听", async () => {
    const close = vi.fn();
    const wrapper = mount(CanvasContextMenu, { attachTo: document.body, props: { anchor: { clientX: 100, clientY: 120 }, disabled: false, onClose: close } });
    const menu = document.querySelector('[data-testid="opd-blank-menu"]')!;
    const underlyingKey = vi.fn(); window.addEventListener("keydown", underlyingKey);
    menu.dispatchEvent(new Event("pointerdown", { bubbles: true })); expect(wrapper.emitted("close")).toBeUndefined();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(document.activeElement?.getAttribute("data-testid")).toBe("opd-blank-auto-layout");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    expect(underlyingKey).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("scroll")); await flushPromises();
    expect(wrapper.emitted("close")).toHaveLength(3);
    wrapper.unmount(); window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(close).toHaveBeenCalledTimes(3);
    expect(underlyingKey).toHaveBeenCalledOnce(); window.removeEventListener("keydown", underlyingKey);
    expect(document.querySelector('[data-testid="opd-blank-menu"]')).toBeNull();
  });
});
