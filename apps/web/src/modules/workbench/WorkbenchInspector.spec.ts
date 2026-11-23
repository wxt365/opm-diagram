import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import { describe, expect, it, vi } from "vitest";
import WorkbenchInspector from "./WorkbenchInspector.vue";

function setup() {
  const store = reactive({
    contexts: [], rightPanel: { open: true }, closeRightPanel: vi.fn(),
    selectedNode: { id: 'state.1', kind: 'state', label: 'old', occurrenceRole: 'owned', stateRoles: [] as string[] },
    stateEditor: { name: 'old', roles: [] as string[] },
    workbench: { commandState: 'idle' }, isReadonly: false,
    saveSelectedState: vi.fn(async () => {
      store.selectedNode.label = store.stateEditor.name.trim();
      store.selectedNode.stateRoles = [...store.stateEditor.roles];
    }),
  });
  const wrapper = mount(WorkbenchInspector, {
    props: { store: store as unknown as InstanceType<typeof WorkbenchInspector>['$props']['store'], canvasLocationKey: 0 },
    attrs: { onStateEditor: (patch: Partial<typeof store.stateEditor>) => Object.assign(store.stateEditor, patch) },
    global: { stubs: { ElementNameProperty: { template: '<div />', methods: { finishNameEdit: () => true } }, ElementAppearanceProperty: true } },
  });
  return { store, wrapper, finish: () => wrapper.vm.finishNameEdit() };
}

describe('State inspector pending edits', () => {
  it('组合输入期间阻止表单保存和关闭，最终文字确认后正常提交', async () => {
    const { store, wrapper, finish } = setup();
    const input = wrapper.get('[data-testid="p03-state-inspector-name"]');
    await input.trigger('compositionstart');
    expect(wrapper.vm.hasPendingStateEdit).toBe(true);
    await input.setValue('zhong');
    await wrapper.get('form.state-editor').trigger('submit');
    expect(await finish()).toBe(false);
    await wrapper.get('[data-testid="p03-right-panel-close"]').trigger('click'); await flushPromises();
    expect(store.saveSelectedState).not.toHaveBeenCalled();
    expect(store.closeRightPanel).not.toHaveBeenCalled();
    (input.element as HTMLInputElement).value = '中文状态';
    await input.trigger('compositionend');
    expect(store.stateEditor.name).toBe('中文状态');
    expect(await finish()).toBe(true);
    expect(store.selectedNode.label).toBe('中文状态');
    expect(store.saveSelectedState).toHaveBeenCalledTimes(1);
    expect(wrapper.vm.hasPendingStateEdit).toBe(false);
    wrapper.unmount();
  });
  it('统一保存/切换入口提交名称和角色，无变化不发命令', async () => {
    const { store, wrapper, finish } = setup();
    expect(await finish()).toBe(true);
    expect(store.saveSelectedState).not.toHaveBeenCalled();
    store.stateEditor.name = 'new'; store.stateEditor.roles = ['FINAL'];
    expect(await finish()).toBe(true);
    expect(store.selectedNode.label).toBe('new');
    expect(store.selectedNode.stateRoles).toEqual(['FINAL']);
    expect(await finish()).toBe(true);
    expect(store.saveSelectedState).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('失败、空名称或不可编辑时阻止关闭且保留输入', async () => {
    const { store, wrapper, finish } = setup();
    store.stateEditor.name = 'new';
    store.saveSelectedState.mockImplementation(async () => {});
    await wrapper.get('[data-testid="p03-right-panel-close"]').trigger('click');
    await flushPromises();
    expect(store.closeRightPanel).not.toHaveBeenCalled();
    expect(store.stateEditor.name).toBe('new');
    store.stateEditor.name = ' ';
    expect(await finish()).toBe(false);
    store.stateEditor.name = 'new'; store.isReadonly = true;
    expect(await finish()).toBe(false);
    expect(store.saveSelectedState).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('显式保存与切换重叠时复用提交，等待确认后继续', async () => {
    const { store, wrapper, finish } = setup();
    let complete!: () => void;
    store.saveSelectedState.mockImplementation(() => new Promise<void>(resolve => {
      complete = () => { store.selectedNode.label = 'new'; resolve(); };
    }));
    store.stateEditor.name = 'new';
    await wrapper.get('form.state-editor').trigger('submit');
    const pending = finish();
    expect(store.saveSelectedState).toHaveBeenCalledTimes(1);
    complete();
    expect(await pending).toBe(true);
    wrapper.unmount();
  });

  it('网络异常阻止继续，重试成功后可以关闭', async () => {
    const { store, wrapper, finish } = setup();
    store.stateEditor.name = 'new';
    store.saveSelectedState.mockRejectedValueOnce(new Error('offline'));
    expect(await finish()).toBe(false);
    expect(store.stateEditor.name).toBe('new');
    await wrapper.get('[data-testid="p03-right-panel-close"]').trigger('click');
    await flushPromises();
    expect(store.selectedNode.label).toBe('new');
    expect(store.closeRightPanel).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
