import "./styles.css";
export { default as OpmWorkbench } from "./OpmWorkbench.vue";
export { init } from "./mount";
export { createOpmClient } from "./client";
export type { WorkbenchContext, WorkbenchDiagram, WorkbenchSnapshot, WorkbenchServices, WorkbenchRuntimeApi, WorkbenchHandle } from "./contracts";
export type { OpdNode, ConsumptionRelation } from "@/shared/types/modeling";
export type { WorkbenchSource, WorkbenchBinding, WorkbenchConnectionOptions } from "./contracts";
