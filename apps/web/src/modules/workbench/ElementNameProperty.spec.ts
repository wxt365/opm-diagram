import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ElementNameProperty from "./ElementNameProperty.vue";

describe("ElementNameProperty", () => {
  it("Enter与失焦共用命令，正式名称回读同步字段且同名不提交", async () => {
    const submitNameEdit = vi.fn<(id: string, name: string) => Promise<boolean>>();
    const wrapper = mount(ElementNameProperty, { props: { elementId: "element.object", name: "水", readonly: false, submitNameEdit } });
    submitNameEdit.mockImplementation(async (_id, name) => { await wrapper.setProps({ name }); return true; });
    const input = wrapper.get<HTMLInputElement>("input");
    await input.trigger("blur"); expect(submitNameEdit).not.toHaveBeenCalled();
    await input.setValue("热水"); await input.trigger("keydown", { key: "Enter" }); await flushPromises();
    expect(submitNameEdit).toHaveBeenCalledExactlyOnceWith("element.object", "热水"); expect(input.element.value).toBe("热水");
    await input.setValue("纯净水"); await input.trigger("blur"); await flushPromises();
    expect(submitNameEdit).toHaveBeenCalledTimes(2); expect(input.element.value).toBe("纯净水");
    await wrapper.setProps({ name: "其他入口改名" }); expect(input.element.value).toBe("其他入口改名"); wrapper.unmount();
  });

  it("失败保留输入与焦点，Escape恢复正式名称，只读零提交", async () => {
    const submitNameEdit = vi.fn().mockResolvedValue(false);
    const wrapper = mount(ElementNameProperty, { attachTo: document.body, props: { elementId: "element.object", name: "水", readonly: false, submitNameEdit, failureMessage: "名称不能为空" } });
    const input = wrapper.get<HTMLInputElement>("input");
    await input.setValue("   "); await input.trigger("blur"); await flushPromises();
    expect(input.element.value).toBe("   "); expect(document.activeElement).toBe(input.element);
    expect(wrapper.get('[role="alert"]').text()).toBe("名称不能为空");
    await input.trigger("keydown", { key: "Escape" }); await input.trigger("blur");
    expect(input.element.value).toBe("水"); expect(submitNameEdit).toHaveBeenCalledTimes(1);
    await wrapper.setProps({ readonly: true }); expect(input.attributes("readonly")).toBeDefined();
    await input.setValue("不得提交"); await input.trigger("keydown", { key: "Enter" }); await flushPromises();
    expect(submitNameEdit).toHaveBeenCalledTimes(1); wrapper.unmount();
  });

  it("IME结束取得最终值，模型保存等待原请求且不重复提交", async () => {
    let resolve!: (value: boolean) => void;
    const submitNameEdit = vi.fn(() => new Promise<boolean>(done => { resolve = done; }));
    const wrapper = mount(ElementNameProperty, { props: { elementId: "element.process", name: "制作", readonly: false, submitNameEdit } });
    const input = wrapper.get<HTMLInputElement>("input");
    await input.trigger("compositionstart"); input.element.value = "yanmo"; await input.trigger("input");
    await input.trigger("keydown", { key: "Enter", isComposing: true }); await input.trigger("blur");
    expect(await wrapper.vm.finishNameEdit()).toBe(false); expect(submitNameEdit).not.toHaveBeenCalled();
    input.element.value = "研磨"; await input.trigger("compositionend"); await flushPromises();
    expect(submitNameEdit).toHaveBeenCalledExactlyOnceWith("element.process", "研磨");
    await input.trigger("blur"); const finish = wrapper.vm.finishNameEdit();
    await wrapper.setProps({ name: "研磨" }); resolve(true); expect(await finish).toBe(true);
    expect(submitNameEdit).toHaveBeenCalledTimes(1); wrapper.unmount();
  });

  it("外部回读不覆盖未提交输入，卸载后旧请求不抢焦点", async () => {
    let resolve!: (value: boolean) => void;
    const submitNameEdit = vi.fn(() => new Promise<boolean>(done => { resolve = done; }));
    const wrapper = mount(ElementNameProperty, { attachTo: document.body, props: { elementId: "element.object", name: "水", readonly: false, submitNameEdit } });
    const input = wrapper.get<HTMLInputElement>("input");
    await input.setValue("冷水"); await wrapper.setProps({ name: "温水" }); expect(input.element.value).toBe("冷水");
    await input.trigger("blur"); wrapper.unmount(); resolve(false); await flushPromises();
    expect(submitNameEdit).toHaveBeenCalledExactlyOnceWith("element.object", "冷水"); expect(document.activeElement).not.toBe(input.element);
  });
});
