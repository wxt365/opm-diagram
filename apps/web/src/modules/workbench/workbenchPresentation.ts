import { relationToolDisplayName } from "./opd/core/relation-tool-presentation";

export function relationName(capabilityId?: string, fallback?: string) {
  return capabilityId ? relationToolDisplayName(capabilityId) ?? fallback ?? "关系" : fallback ?? "关系";
}
