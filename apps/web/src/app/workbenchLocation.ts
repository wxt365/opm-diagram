import type { LocationQuery, LocationQueryRaw } from "vue-router";

// 只解析入口语法；Revision 归属和目标 Context 由 Runtime 判定。
export function parseWorkbenchLocation(query: LocationQuery) {
  return {
    revision: query.revision === undefined ? undefined : typeof query.revision === "string" ? query.revision : "",
    context: query.context === undefined ? undefined : typeof query.context === "string" ? query.context : "",
  };
}

export function workbenchLocationQuery(mode: "HEAD" | "EXACT", revision: string, context: string): LocationQueryRaw {
  return mode === "HEAD" ? { context } : { revision, context };
}
