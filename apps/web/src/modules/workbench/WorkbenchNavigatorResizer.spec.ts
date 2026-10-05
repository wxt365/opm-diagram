import { mount } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WorkbenchNavigatorResizer from "./WorkbenchNavigatorResizer.vue";

async function pointer(element: Element, type: string, options: MouseEventInit & { pointerId: number; isPrimary?: boolean }) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...options });
  Object.defineProperties(event, { pointerId: { value: options.pointerId }, isPrimary: { value: options.isPrimary ?? true } });
  element.dispatchEvent(event); await nextTick();
}

function setup() {
  const width = ref<number>(), inspectorOpen = ref(false);
  const wrapper = mount(defineComponent({
    components: { WorkbenchNavigatorResizer },
    setup: () => ({ width, inspectorOpen }),
    template: '<WorkbenchNavigatorResizer :width="width" :inspector-open="inspectorOpen" @resize="width = $event" />',
  }));
  const handle = wrapper.get('[data-testid="opd-navigator-resizer"]');
  const captured = new Set<number>(), release = vi.fn((id: number) => { captured.delete(id); });
  Object.assign(handle.element, {
    setPointerCapture: vi.fn((id: number) => { captured.add(id); }),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: release,
  });
  return { wrapper, handle, width, inspectorOpen, release };
}

describe("OPD 导航分隔条", () => {
  beforeEach(() => { vi.stubGlobal("innerWidth", 1440); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("键盘、双击恢复和无障碍范围", async () => {
    const { wrapper, handle, width } = setup();
    expect(handle.attributes()).toMatchObject({ role: "separator", "aria-orientation": "vertical", "aria-valuenow": "230", "aria-valuemin": "180", "aria-valuemax": "420" });
    await handle.trigger("keydown", { key: "ArrowRight" }); expect(width.value).toBe(250);
    await handle.trigger("keydown", { key: "ArrowLeft" }); expect(width.value).toBe(230);
    await handle.trigger("keydown", { key: "Home" }); expect(width.value).toBe(180);
    await handle.trigger("keydown", { key: "End" }); expect(width.value).toBe(420);
    await handle.trigger("dblclick"); expect(width.value).toBe(230);
    await handle.trigger("keydown", { key: "Tab" }); expect(width.value).toBe(230);
    wrapper.unmount();
  });

  it("捕获主指针向右扩展、向左缩小并限制宽度", async () => {
    const { wrapper, handle, width, release } = setup();
    await pointer(handle.element, "pointerdown", { button: 2, pointerId: 1, clientX: 230 });
    await pointer(handle.element, "pointerdown", { button: 0, isPrimary: false, pointerId: 1, clientX: 230 });
    expect(handle.classes()).not.toContain("is-dragging");
    await pointer(handle.element, "pointerdown", { button: 0, pointerId: 1, clientX: 230 });
    await pointer(handle.element, "pointermove", { pointerId: 2, clientX: 330 }); expect(width.value).toBeUndefined();
    await pointer(handle.element, "pointermove", { pointerId: 1, clientX: 330 }); expect(width.value).toBe(330);
    await pointer(handle.element, "pointermove", { pointerId: 1, clientX: 2000 }); expect(width.value).toBe(420);
    await pointer(handle.element, "pointermove", { pointerId: 1, clientX: -100 }); expect(width.value).toBe(180);
    await pointer(handle.element, "pointerup", { pointerId: 1 });
    expect(release).toHaveBeenCalledWith(1);
    await pointer(handle.element, "pointermove", { pointerId: 1, clientX: 330 }); expect(width.value).toBe(180);
    wrapper.unmount();
  });

  it.each(["pointercancel", "lostpointercapture", "blur"])("%s 停止拖动", async event => {
    const { wrapper, handle, width } = setup();
    await pointer(handle.element, "pointerdown", { button: 0, pointerId: 1, clientX: 230 });
    if (event === "blur") window.dispatchEvent(new Event("blur"));
    else await pointer(handle.element, event, { pointerId: 1 });
    await pointer(handle.element, "pointermove", { pointerId: 1, clientX: 330 });
    expect(width.value).toBeUndefined(); expect(handle.classes()).not.toContain("is-dragging");
    wrapper.unmount();
  });

  it("窗口和属性面板限制宽度，中等屏幕恢复其默认值", async () => {
    const { wrapper, handle, width, inspectorOpen } = setup();
    await handle.trigger("keydown", { key: "End" });
    vi.stubGlobal("innerWidth", 1100); window.dispatchEvent(new Event("resize")); await nextTick();
    inspectorOpen.value = true; await nextTick(); expect(width.value).toBe(380);
    expect(handle.attributes("aria-valuemax")).toBe("380");
    vi.stubGlobal("innerWidth", 981); window.dispatchEvent(new Event("resize")); await nextTick(); expect(width.value).toBe(261);
    vi.stubGlobal("innerWidth", 820); window.dispatchEvent(new Event("resize")); await nextTick();
    expect(handle.attributes("aria-valuemax")).toBe("420");
    await handle.trigger("dblclick"); expect(width.value).toBe(210);
    wrapper.unmount();
  });

  it("上下布局隐藏分隔条并保留宽度，恢复窗口后可继续调整", async () => {
    const { wrapper, handle, width } = setup();
    await handle.trigger("keydown", { key: "End" });
    vi.stubGlobal("innerWidth", 390); window.dispatchEvent(new Event("resize")); await nextTick();
    expect(wrapper.find('[data-testid="opd-navigator-resizer"]').exists()).toBe(false); expect(width.value).toBe(420);
    vi.stubGlobal("innerWidth", 1440); window.dispatchEvent(new Event("resize")); await nextTick();
    expect(wrapper.get('[data-testid="opd-navigator-resizer"]').attributes("aria-valuenow")).toBe("420");
    wrapper.unmount();
  });

  it("卸载清理指针捕获与事件监听", async () => {
    const { wrapper, handle, release } = setup();
    await pointer(handle.element, "pointerdown", { button: 0, pointerId: 1, clientX: 230 });
    const remove = vi.spyOn(window, "removeEventListener"); wrapper.unmount();
    expect(release).toHaveBeenCalledWith(1);
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("blur", expect.any(Function));
  });
});
