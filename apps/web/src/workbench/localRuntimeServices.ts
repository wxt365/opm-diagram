import { localRuntimeApi } from "@/shared/api/localRuntimeApi";
import { DraftWorkbenchSession } from "@/shared/api/draftWorkbenchSession";
import { DraftDelivery } from "@/shared/api/draftDelivery";
import type { DraftPendingStore } from "@/shared/api/draftPendingStore";
import { assistantRequest, watchAssistant } from "@/shared/api/assistantApi";
import type { WorkbenchRuntimeApi, WorkbenchServices } from "./contracts";

/** 显式选择现有 Runtime 协议；只有宿主调用此工厂才使用现有站点服务。 */
export function createRuntimeServices(api: WorkbenchRuntimeApi,
  assistant?: WorkbenchServices["assistant"], pendingStore?: DraftPendingStore): WorkbenchServices {
  return { api, assistant, createSession: (project, model) => new DraftWorkbenchSession(project, model, new DraftDelivery(pendingStore, api), api) };
}
export function createLocalRuntimeServices(): WorkbenchServices {
  return createRuntimeServices(localRuntimeApi, { request: assistantRequest, watch: watchAssistant });
}
