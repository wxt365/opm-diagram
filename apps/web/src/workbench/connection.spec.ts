import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import OpmWorkbench from "./OpmWorkbench.vue";
import type { WorkbenchBinding } from "./contracts";

const clients = vi.hoisted(() => ({ ensure: vi.fn(), create: vi.fn() }));
vi.mock("./client", () => ({ createOpmClient: clients.create }));
const instance = defineComponent({ props: { context: { type: Object, default: () => ({}) }, services: { type: Object, default: () => ({}) } }, template: '<div data-testid="connected">{{ context }}</div>' });
afterEach(() => { clients.ensure.mockReset(); clients.create.mockReset(); });
const source = { systemId: "host", projectId: "123", projectName: "外部项目", modelId: "456", modelName: "外部模型" };

it("source 接入缺少后端地址时明确报错", async () => {
  const wrapper = mount(OpmWorkbench, { props: { source }, global: { stubs: { WorkbenchInstance: instance } } });
  expect(wrapper.text()).toContain("需要传入 backendUrl");
  expect(wrapper.findComponent(instance).exists()).toBe(false);
  expect(clients.create).not.toHaveBeenCalled();
  wrapper.unmount();
});

it("自动关联输出 bound，宿主回传 binding 或改名不重复连接", async () => {
  const binding = { projectId: "project.test", modelId: "model.test" };
  clients.ensure.mockResolvedValue(binding);
  clients.create.mockReturnValue({ services: {}, ensureWorkspace: clients.ensure });
  const wrapper = mount(OpmWorkbench, { props: { backendUrl: "http://runtime:17850", assistantUrl: "http://assistant:17860", source },
    global: { stubs: { WorkbenchInstance: instance } } });
  await flushPromises();
  expect(clients.ensure).toHaveBeenCalledWith(source, undefined);
  expect(wrapper.emitted("bound")).toEqual([[binding]]);
  expect(wrapper.getComponent(instance).props("context")).toMatchObject({ project: { id: binding.projectId, name: source.projectName }, model: { id: binding.modelId, name: source.modelName } });
  await wrapper.setProps({ binding }); await flushPromises();
  await wrapper.setProps({ source: { ...source, modelName: "更新模型名" } });
  expect(clients.ensure).toHaveBeenCalledTimes(1);
  expect(wrapper.getComponent(instance).props("context").model.name).toBe("更新模型名");
  wrapper.unmount();
});

it("身份切换时旧关联响应不能覆盖新模型，失败显示重连入口", async () => {
  let finishOld: (binding: WorkbenchBinding) => void = () => {};
  clients.ensure.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
    .mockResolvedValueOnce({ projectId: "project.test", modelId: "model.new" })
    .mockRejectedValueOnce(new Error("连接失败"));
  clients.create.mockReturnValue({ services: {}, ensureWorkspace: clients.ensure });
  const wrapper = mount(OpmWorkbench, { props: { backendUrl: "http://runtime:17850", source }, global: { stubs: { WorkbenchInstance: instance } } });
  await wrapper.setProps({ source: { ...source, modelId: "new" } }); await flushPromises();
  finishOld({ projectId: "project.test", modelId: "model.old" }); await flushPromises();
  expect(wrapper.getComponent(instance).props("context").model.id).toBe("model.new");
  expect(wrapper.emitted("bound")).toHaveLength(1);
  await wrapper.setProps({ backendUrl: "http://different:17850" }); await flushPromises();
  expect(wrapper.text()).toContain("连接失败"); expect(wrapper.findComponent(instance).exists()).toBe(false);
  wrapper.unmount();
});
