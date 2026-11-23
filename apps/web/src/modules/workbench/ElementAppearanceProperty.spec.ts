import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { OpdNode } from "@/shared/types/modeling";
import ElementAppearanceProperty from "./ElementAppearanceProperty.vue";

describe("元素颜色", () => {
  const node = { kind: "object" } as OpdNode;
  it("显示类型默认色，按字段编辑并可恢复默认", async () => {
    const wrapper = mount(ElementAppearanceProperty, { props: { node, readonly: false } });
    expect((wrapper.get('input[aria-label="边框颜色"]').element as HTMLInputElement).value).toBe("#f28c28");
    expect(wrapper.get("button").attributes("disabled")).toBeDefined();
    await wrapper.get('input[aria-label="填充颜色"]').setValue("#123456");
    expect(wrapper.emitted("change")?.at(-1)).toEqual([{ fill: "#123456" }]);
    await wrapper.setProps({ node: { ...node, appearance: { stroke: "#111111", fill: "#123456" } } });
    await wrapper.get('input[aria-label="边框颜色"]').setValue("#f28c28");
    expect(wrapper.emitted("change")?.at(-1)).toEqual([{ fill: "#123456" }]);
    await wrapper.get('[aria-label="恢复边框颜色"]').trigger("click");
    expect(wrapper.emitted("change")?.at(-1)).toEqual([{ fill: '#123456' }]);
    await wrapper.get('[aria-label="恢复填充颜色"]').trigger("click");
    expect(wrapper.emitted("change")?.at(-1)).toEqual([{ stroke: '#111111' }]);
    expect(wrapper.text()).toContain("颜色设置");
    expect(wrapper.text()).not.toContain("仅适用于");
    expect(wrapper.text()).not.toContain("请点击工具栏保存");
  });
  it("节点颜色优先于统一类型颜色，保存异常可见", () => {
    const wrapper = mount(ElementAppearanceProperty, { props: {
      node: { ...node, appearance: { stroke: "#ff0000" } }, appearance: { stroke: "#0000ff" }, readonly: false, error: "保存失败",
    } });
    expect((wrapper.get('input[aria-label="边框颜色"]').element as HTMLInputElement).value).toBe("#ff0000");
    expect(wrapper.get('[role="alert"]').text()).toBe("保存失败");
  });
  it("历史只读，切换到状态后显示状态的默认色", async () => {
    const wrapper = mount(ElementAppearanceProperty, { props: { node: { ...node, appearance: { fill: "#222222" } }, readonly: true } });
    expect(wrapper.findAll("input").every(input => input.attributes("disabled") !== undefined)).toBe(true);
    expect(wrapper.get("button").attributes("disabled")).toBeDefined();
    await wrapper.setProps({ node: { ...node, kind: "state" } });
    expect((wrapper.get('input[aria-label="填充颜色"]').element as HTMLInputElement).value).toBe("#fff7df");
  });
  it("以统一色为继承基线，改回统一色只清除当前字段", async () => {
    const wrapper = mount(ElementAppearanceProperty, { props: { node: { ...node, appearance: { stroke: '#111111' } }, appearance: { stroke: '#0000ff', fill: '#123456' }, readonly: false } });
    expect((wrapper.get('input[aria-label="填充颜色"]').element as HTMLInputElement).value).toBe('#123456');
    await wrapper.get('input[aria-label="边框颜色"]').setValue('#0000ff');
    expect(wrapper.emitted('change')?.at(-1)).toEqual([{}]);
  });
});
