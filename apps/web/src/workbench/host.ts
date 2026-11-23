import type { InjectionKey } from "vue";
import type { WorkbenchNavigation, WorkbenchRuntime } from "./internal";

/** 仅原宿主复用已有 store，公共组件默认创建私有实例。 */
export const workbenchHostKey: InjectionKey<{ runtime: WorkbenchRuntime; navigation: WorkbenchNavigation }> = Symbol("opm-workbench-host");
