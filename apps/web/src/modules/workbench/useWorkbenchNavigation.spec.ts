import { defineComponent, ref, reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { useWorkbenchNavigation } from "./useWorkbenchNavigation";
vi.mock("./useDraftStatePolling",()=>({useDraftStatePolling:vi.fn()}));

function setupNavigation(dependencies: Parameters<typeof useWorkbenchNavigation>[0]) {
  let navigation!: ReturnType<typeof useWorkbenchNavigation>;
  const wrapper = mount(defineComponent({ setup() {
    navigation = useWorkbenchNavigation(dependencies);
    return () => null;
  } }));
  return { wrapper, navigation };
}

describe("confirmed embedded save",()=>{
  it("only OPD mode handles model history shortcuts and preserves native input undo", async () => {
    const state = reactive({ mode: 'GRAPH' });
    const store = { undo: vi.fn(), redo: vi.fn(), leaveWorkbench: vi.fn(), isReadonly: false };
    const { wrapper } = setupNavigation({ store, route: {}, router: {}, root: ref(), globalShortcuts: true,
      finishInputs: vi.fn().mockResolvedValue(true), canUseModelHistory: () => state.mode === 'OPD' } as unknown as Parameters<typeof useWorkbenchNavigation>[0]);
    for (const mode of ['GRAPH', 'ANALYSIS']) {
      state.mode = mode;
      for (const [key, shiftKey] of [['z', false], ['z', true], ['y', false]] as const) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, ctrlKey: true, cancelable: true }));
      }
    }
    expect(store.undo).not.toHaveBeenCalled(); expect(store.redo).not.toHaveBeenCalled();
    state.mode = 'OPD';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true }));
    await flushPromises();
    expect(store.undo).toHaveBeenCalledOnce(); expect(store.redo).toHaveBeenCalledOnce();
    const input = document.createElement('input'); document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect(store.undo).toHaveBeenCalledOnce(); input.remove(); wrapper.unmount();
  });
  it('history shortcuts use the shared callback and default path blocks failed inputs or changed locations', async () => {
    const store = { undo: vi.fn(), redo: vi.fn(), leaveWorkbench: vi.fn(), isReadonly: false };
    const route = { fullPath: '/one' }, finishInputs = vi.fn().mockResolvedValue(false);
    const dependencies = { store, route, router: {}, root: ref(), globalShortcuts: true, finishInputs };
    let mounted = setupNavigation(dependencies as unknown as Parameters<typeof useWorkbenchNavigation>[0]);
    const key = (value: string, shiftKey = false) => window.dispatchEvent(new KeyboardEvent('keydown', { key: value, ctrlKey: true, shiftKey }));
    key('z'); key('y'); await flushPromises();
    expect(store.undo).not.toHaveBeenCalled(); expect(store.redo).not.toHaveBeenCalled();
    finishInputs.mockImplementationOnce(async () => { route.fullPath = '/two'; return true; });
    key('z'); await flushPromises(); expect(store.undo).not.toHaveBeenCalled();
    mounted.wrapper.unmount();
    const requestHistory = vi.fn().mockResolvedValue(undefined);
    mounted = setupNavigation({ ...dependencies, requestHistory } as unknown as Parameters<typeof useWorkbenchNavigation>[0]);
    key('z'); key('y'); key('z', true); await flushPromises();
    expect(requestHistory.mock.calls).toEqual([[false], [true], [true]]);
    expect(store.undo).not.toHaveBeenCalled(); expect(store.redo).not.toHaveBeenCalled();
    mounted.wrapper.unmount();
  });

  it("protects unsaved analysis including pending or failed saves and retains layout protection", () => {
    const state = reactive({ analysisDirty: true });
    const store = reactive({ layoutDirty: false, leaveWorkbench: vi.fn() });
    const { wrapper } = setupNavigation({ store, route: {}, router: {}, root: ref(), finishInputs: vi.fn(),
      hasUnsavedAnalysis: () => state.analysisDirty } as unknown as Parameters<typeof useWorkbenchNavigation>[0]);
    const blocked = () => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; };
    expect(blocked()).toBe(true);
    state.analysisDirty = false; expect(blocked()).toBe(false);
    store.layoutDirty = true; expect(blocked()).toBe(true);
    store.layoutDirty = false; state.analysisDirty = true; expect(blocked()).toBe(true);
    wrapper.unmount(); expect(blocked()).toBe(false);
  });

  it("returns only a confirmed revision and retains failure or changed-location results",async()=>{
    const store={draftToken:{edit_seq:1},saving:false,saveDraft:vi.fn().mockResolvedValue("revision.saved"),leaveWorkbench:vi.fn()};
    const route={fullPath:"/model/1"};
    const finishInputs=vi.fn().mockResolvedValue(true);
    const { wrapper, navigation } = setupNavigation({store,route,root:ref(),finishInputs,router:{}} as unknown as Parameters<typeof useWorkbenchNavigation>[0]);
    expect(await navigation.requestSave()).toBe("revision.saved");
    store.saveDraft.mockResolvedValueOnce(null);
    expect(await navigation.requestSave()).toBeNull();
    finishInputs.mockImplementationOnce(async()=>{route.fullPath="/model/2";return true;});
    expect(await navigation.requestSave()).toBeNull();
    expect(store.saveDraft).toHaveBeenCalledTimes(2);
    store.saving=true;
    expect(await navigation.requestSave()).toBeNull();
    wrapper.unmount();
  });
});
