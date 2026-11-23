import { mount } from "@vue/test-utils";
import { expect, it } from "vitest";
import GraphAnalysisContextMenu from "./GraphAnalysisContextMenu.vue";

it("标签菜单反映状态，键盘关闭不穿透，内部滚动保留而外部操作关闭", () => {
  const wrapper = mount(GraphAnalysisContextMenu, { props: { labels: false, anchor: { clientX: 9999, clientY: 9999 } } });
  const menu = document.querySelector<HTMLElement>('[aria-label="图谱画布操作"]')!;
  expect(menu.textContent).toBe("显示标签");
  expect(Number.parseInt(menu.style.left)).toBeLessThan(window.innerWidth);
  menu.dispatchEvent(new Event("scroll", { bubbles: true })); expect(wrapper.emitted("close")).toBeUndefined();
  const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  window.dispatchEvent(escape); expect(escape.defaultPrevented).toBe(true); expect(wrapper.emitted("close")).toHaveLength(1);
  document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })); expect(wrapper.emitted("close")).toHaveLength(2);
  window.dispatchEvent(new Event("scroll")); expect(wrapper.emitted("close")).toHaveLength(3);
  const closed = wrapper.emitted("close")!;
  wrapper.unmount(); window.dispatchEvent(new Event("scroll")); expect(closed).toHaveLength(3);
});
