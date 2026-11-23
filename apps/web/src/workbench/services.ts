import { inject, type InjectionKey } from "vue";
import { LocalRuntimeApiError } from "@/shared/api/localRuntimeApi";
import type { WorkbenchServices } from "./contracts";

export const workbenchServicesKey: InjectionKey<WorkbenchServices> = Symbol("opm-workbench-services");
export function useWorkbenchServices() { return inject(workbenchServicesKey, null); }
export const workbenchDomScopeKey: InjectionKey<string> = Symbol("opm-workbench-dom-scope");
export function useWorkbenchDomId() {
  const prefix = inject(workbenchDomScopeKey, "");
  return (id: string) => prefix ? `${prefix}-${id}` : id;
}

/** 未注入服务时明确拒绝操作，绝不回退至当前站点的 /api。 */
export const unavailableWorkbenchServices: WorkbenchServices = {
  api: new Proxy({} as WorkbenchServices["api"], {
    get: () => () => Promise.reject(new LocalRuntimeApiError("SERVICE_UNAVAILABLE", "宿主未提供此工作台服务。")),
  }),
  createSession: () => { throw new LocalRuntimeApiError("SERVICE_UNAVAILABLE", "宿主未提供工作台会话服务。"); },
};
