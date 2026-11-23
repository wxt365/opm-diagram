import { createApp, h, shallowReactive } from "vue";
import OpmWorkbench from "./OpmWorkbench.vue";
import type { WorkbenchBinding, WorkbenchConnectionOptions, WorkbenchSource, WorkbenchContext, WorkbenchHandle, WorkbenchServices, WorkbenchSnapshot } from "./contracts";

export interface WorkbenchOptions {
  backendUrl?: string;
  assistantUrl?: string;
  accessToken?: WorkbenchConnectionOptions["accessToken"];
  source?: WorkbenchSource;
  binding?: WorkbenchBinding;
  context?: WorkbenchContext;
  data?: WorkbenchSnapshot;
  services?: WorkbenchServices;
  showHeader?: boolean;
  projectNavigation?: boolean;
  showProfile?: boolean;
  showVersionControls?: boolean;
}
export interface WorkbenchEventMap {
  bound: WorkbenchBinding;
  navigateProject: string;
  contextChange: string;
  revisionChange: string | undefined;
  selectionChange: string[];
  ready: undefined;
  error: string;
}
/** ECharts 风格的挂载接口；调用方为容器提供明确高度。 */
export function init(container: HTMLElement, options: WorkbenchOptions = {}) {
  if (container.querySelector(".opm-workbench")) throw new Error("容器已有 OPM 工作台，请先 dispose。");
  const state = shallowReactive({ ...options });
  let handle: WorkbenchHandle | null = null, disposed = false;
  const listeners = new Map<keyof WorkbenchEventMap, Set<(value: never) => void>>();
  function dispatch<K extends keyof WorkbenchEventMap>(name: K, value: WorkbenchEventMap[K]) {
    listeners.get(name)?.forEach(listener => listener(value as never));
  }
  const app = createApp({ render: () => h(OpmWorkbench, { ...state,
    ref: instance => { handle = instance as unknown as WorkbenchHandle | null; },
    onNavigateProject: value => dispatch("navigateProject", value),
    onContextChange: value => dispatch("contextChange", value),
    onRevisionChange: value => dispatch("revisionChange", value),
    onSelectionChange: value => dispatch("selectionChange", value),
    onReady: () => queueMicrotask(() => { if (!disposed) dispatch("ready", undefined); }),
    onBound: value => dispatch("bound", value),
    onError: value => queueMicrotask(() => { if (!disposed) dispatch("error", value); }),
  }) });
  app.mount(container);
  return {
    setOption(next: WorkbenchOptions) {
      if (disposed) throw new Error("工作台已销毁。");
      Object.assign(state, next);
    },
    setData(data: WorkbenchSnapshot) { if (disposed) throw new Error("工作台已销毁。"); state.data = data; },
    on<K extends keyof WorkbenchEventMap>(name: K, listener: (value: WorkbenchEventMap[K]) => void) {
      const handlers = listeners.get(name) ?? new Set(); handlers.add(listener as (value: never) => void); listeners.set(name, handlers);
    },
    off<K extends keyof WorkbenchEventMap>(name: K, listener: (value: WorkbenchEventMap[K]) => void) { listeners.get(name)?.delete(listener as (value: never) => void); },
    resize: () => handle?.resize(),
    reload: () => handle?.reload?.(),
    save: () => handle?.save() ?? Promise.resolve(),
    saveWithResult: () => handle?.saveWithResult() ?? Promise.resolve(null),
    validate: () => handle?.validate() ?? Promise.resolve(),
    prepareLeave: () => handle?.prepareLeave() ?? Promise.resolve(true),
    dispose() { if (!disposed) { disposed = true; app.unmount(); listeners.clear(); handle = null; } },
  };
}
