import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import CanvasFullscreenButton from "./CanvasFullscreenButton.vue";
afterEach(() => vi.restoreAllMocks());
describe("画布全屏", () => {
  it("进入、退出和浏览器全屏事件同步按钮状态", async () => {
    let fullscreen: Element | null = null;
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreen });
    const target = document.createElement("section");
    target.requestFullscreen = vi.fn(async () => { fullscreen = target; document.dispatchEvent(new Event("fullscreenchange")); });
    document.exitFullscreen = vi.fn(async () => { fullscreen = null; document.dispatchEvent(new Event("fullscreenchange")); });
    const wrapper = mount(CanvasFullscreenButton, { props: { target } }); await flushPromises();
    await wrapper.get("button").trigger("click"); await flushPromises();
    expect(target.requestFullscreen).toHaveBeenCalledOnce(); expect(wrapper.get("button").attributes("aria-pressed")).toBe("true");
    await wrapper.get("button").trigger("click"); await flushPromises();
    expect(document.exitFullscreen).toHaveBeenCalledOnce(); expect(wrapper.get("button").attributes("aria-pressed")).toBe("false");
    fullscreen = target; document.dispatchEvent(new Event("fullscreenchange")); await flushPromises();
    expect(wrapper.get("button").attributes("aria-pressed")).toBe("true");
    fullscreen = null; document.dispatchEvent(new Event("fullscreenchange")); await flushPromises();
    expect(wrapper.get("button").attributes("aria-pressed")).toBe("false"); wrapper.unmount();
  });
  it("浏览器拒绝时给出提示并恢复按钮可操作", async () => {
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
    const target = document.createElement("section"); target.requestFullscreen = vi.fn().mockRejectedValue(new Error("拒绝"));
    const wrapper = mount(CanvasFullscreenButton, { props: { target } }); await flushPromises();
    await wrapper.get("button").trigger("click"); await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toContain("浏览器权限"); expect(wrapper.get("button").attributes("disabled")).toBeUndefined(); wrapper.unmount();
  });
});
