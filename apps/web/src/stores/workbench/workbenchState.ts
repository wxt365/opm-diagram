import { reactive } from "vue";
import type { BottomTab, ConsumptionRelation, OpdNode, ResourceState } from "@/shared/types/modeling";

export function createWorkbenchState() {
  return reactive({
    resourceState: "loading" as ResourceState,
    revision: "",
    locationMode: "HEAD" as "HEAD" | "EXACT",
    activeContextId: "",
    selectedId: "",
    nodes: [] as OpdNode[],
    relations: [] as ConsumptionRelation[],
    zoom: 100,
    bottomTab: "text" as BottomTab,
    bottomPanelExpanded: true,
    validationState: "unvalidated" as "unvalidated" | "current" | "running" | "stale" | "failed",
    validationProgress: 0,
    blockingFindings: 0,
    commandState: "idle" as "idle" | "submitting" | "blocked" | "failed",
    commandFeedback: "",
    feedbackCode: null as string | null,
    autosaveState: "saved" as "saved" | "save-failed",
    lastAction: "正在打开工作台",
    accessMode: "editable" as "editable" | "readonly",
  });

}

export type WorkbenchState = ReturnType<typeof createWorkbenchState>;
