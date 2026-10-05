import { mount } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WorkbenchPanelResizer from "./WorkbenchPanelResizer.vue";

async function pointer(element: Element, type: string, options: MouseEventInit & { pointerId: number; isPrimary?: boolean }) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...options });
  Object.defineProperties(event, { pointerId: { value: options.pointerId }, isPrimary: { value: options.isPrimary ?? true } });
  element.dispatchEvent(event);
  await nextTick();
}

function setup(attachTo?: HTMLElement) {
  const height = ref(240);
  const wrapper = mount(defineComponent({
    components: { WorkbenchPanelResizer },
    setup: () => ({ height }),
    template: '<WorkbenchPanelResizer :height="height" @resize="height = $event" />',
  }), { attachTo });
  const handle = wrapper.get('[data-testid="p03-bottom-resizer"]');
  const captured = new Set<number>();
  const release = vi.fn((id: number) => { captured.delete(id); });
  Object.assign(handle.element, {
    setPointerCapture: vi.fn((id: number) => { captured.add(id); }),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: release,
  });
  return { wrapper, handle, height, release };
}

describe("工作台面板分隔条", () => {
  beforeEach(() => { vi.stubGlobal("innerHeight", 1000); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("键盘调整、边界跳转和双击恢复具有正确的无障碍范围", async () => {
    const { wrapper, handle, height } = setup();
    expect(handle.attributes()).toMatchObject({ role: "separator", "aria-orientation": "horizontal", "aria-valuemin": "210", "aria-valuemax": "640", "aria-valuenow": "240" });
    await handle.trigger("keydown", { key: "ArrowUp" }); expect(height.value).toBe(260);
    await handle.trigger("keydown", { key: "ArrowDown" }); expect(height.value).toBe(240);
    await handle.trigger("keydown", { key: "Home" }); expect(height.value).toBe(210);
    await handle.trigger("keydown", { key: "End" }); expect(height.value).toBe(640);
    expect(handle.attributes("aria-valuenow")).toBe("640");
    await handle.trigger("dblclick"); expect(height.value).toBe(240);
    await handle.trigger("keydown", { key: "Tab" }); expect(height.value).toBe(240);
    wrapper.unmount();
  });

  it("向上拖动放大、向下缩小，捕获主指针并限制高度", async () => {
    const { wrapper, handle, height, release } = setup();
    await pointer(handle.element, "pointerdown", { button: 2, pointerId: 1, clientY: 700 });
    await pointer(handle.element, "pointerdown", { button: 0, isPrimary: false, pointerId: 1, clientY: 700 });
    expect(handle.classes()).not.toContain("is-dragging");
    await pointer(handle.element, "pointerdown", { button: 0, pointerId: 1, clientY: 700 });
    await pointer(handle.element, "pointerdown", { button: 0, pointerId: 2, clientY: 600 });
    await pointer(handle.element, "pointermove", { pointerId: 2, clientY: 500 }); expect(height.value).toBe(240);
    await pointer(handle.element, "pointermove", { pointerId: 1, clientY: 500 }); expect(height.value).toBe(440);
    await pointer(handle.element, "pointermove", { pointerId: 1, clientY: -1000 }); expect(height.value).toBe(640);
    await pointer(handle.element, "pointermove", { pointerId: 1, clientY: 5000 }); expect(height.value).toBe(210);
    await pointer(handle.element, "pointerup", { pointerId: 1 });
    expect(release).toHaveBeenCalledWith(1);
    expect(handle.classes()).not.toContain("is-dragging");
    await pointer(handle.element, "pointermove", { pointerId: 1, clientY: 300 }); expect(height.value).toBe(210);
    wrapper.unmount();
  });

  it.each(["pointercancel", "lostpointercapture", "blur"])("%s 后停止拖动", async event => {
    const { wrapper, handle, height } = setup();
    await pointer(handle.element, "pointerdown", { button: 0, pointerId: 1, clientY: 700 });
    if (event === "blur") window.dispatchEvent(new Event("blur"));
    else await pointer(handle.element, event, { pointerId: 1 });
    await pointer(handle.element, "pointermove", { pointerId: 1, clientY: 500 });
    expect(height.value).toBe(240);
    expect(handle.classes()).not.toContain("is-dragging");
    wrapper.unmount();
  });

  it("缩小窗口钳制高度，极矮窗口仍可恢复默认值，卸载后清理捕获和监听", async () => {
    const { wrapper, handle, height, release } = setup();
    await handle.trigger("keydown", { key: "End" });
    vi.stubGlobal("innerHeight", 650); window.dispatchEvent(new Event("resize"));
    await wrapper.vm.$nextTick(); expect(height.value).toBe(290);
    vi.stubGlobal("innerHeight", 300); window.dispatchEvent(new Event("resize"));
    await wrapper.vm.$nextTick(); expect(height.value).toBe(240);
    expect(handle.attributes("aria-valuemax")).toBe("240");
    await pointer(handle.element, "pointerdown", { button: 0, pointerId: 1, clientY: 200 });
    const remove = vi.spyOn(window, "removeEventListener");
    wrapper.unmount();
    expect(release).toHaveBeenCalledWith(1);
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("blur", expect.any(Function));
    window.dispatchEvent(new Event("resize")); expect(height.value).toBe(240);
  });

  it("头部换行改变可用高度，卸载时断开尺寸监听", async () => {
    const container = document.createElement("section");
    container.className = "workbench";
    const header = document.createElement("header"); header.className = "workbench-header";
    container.append(header); document.body.append(container);
    const bounds = vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ height: 120 } as DOMRect);
    let callback: ResizeObserverCallback | undefined;
    const observe = vi.fn(), disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(onResize: ResizeObserverCallback) { callback = onResize; }
      observe = observe;
      disconnect = disconnect;
    });
    const { wrapper, handle, height } = setup(container);
    expect(observe).toHaveBeenCalledWith(header);
    await handle.trigger("keydown", { key: "End" }); expect(height.value).toBe(584);
    bounds.mockReturnValue({ height: 300 } as DOMRect);
    callback?.([], {} as ResizeObserver); await nextTick();
    expect(height.value).toBe(404);
    wrapper.unmount(); expect(disconnect).toHaveBeenCalledOnce();
    container.remove();
  });
});
