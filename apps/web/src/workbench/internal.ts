import type { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";

/** 导航由宿主实现，不要求安装 Vue Router。 */
export interface WorkbenchLocation {
  path: string;
  fullPath: string;
  query: Record<string, unknown>;
}
export interface WorkbenchDestination {
  path?: string;
  query: { context?: string; revision?: string };
  hash?: string;
}
export interface WorkbenchNavigation {
  location: WorkbenchLocation;
  push: (target: WorkbenchDestination) => Promise<unknown>;
  replace: (target: WorkbenchDestination) => Promise<unknown>;
  resolve: (target: WorkbenchDestination) => { fullPath: string; href: string };
}
export type WorkbenchRuntime = ReturnType<typeof useWorkbenchRuntimeStore>;
