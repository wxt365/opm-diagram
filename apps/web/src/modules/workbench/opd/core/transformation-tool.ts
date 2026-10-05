import type { ApiEdtCommandCapabilityOption } from "@/shared/api/generated/apiEdtContract";
import type { RelationCatalogItemWire } from "@/shared/api/localRuntimeApi";

import { isSupportedRelationToolSymbol } from "./relation-tool-symbol";

export type RelationToolIntent = "SINGLE" | "TRANSFORMATION";
export const TRANSFORMATION_TOOL_LABEL = "生成/消耗关系 / Result / Consumption";
export const TRANSFORMATION_TOOL_HINT = "生成 / Result：过程 → 对象\n消耗 / Consumption：对象 → 过程";
export const TRANSFORMATION_CAPABILITIES = ["CAP-ISO-PROC-001", "CAP-ISO-PROC-002"] as const;

export function isTransformationCapability(id: string) {
  return TRANSFORMATION_CAPABILITIES.some((member) => member === id);
}

export function isTransformationMemberAvailable(item: RelationCatalogItemWire) {
  return isTransformationCapability(item.capability_id) && item.family === "PROCEDURAL"
    && item.interaction_mode === "CREATE_FACT" && item.enabled
    && isSupportedRelationToolSymbol(item.symbol_descriptor.id);
}

export function matchesTransformationGesture(
  option: Pick<ApiEdtCommandCapabilityOption, "command_type" | "enabled" | "capability_ref" | "normalized_endpoints">,
  catalog: readonly RelationCatalogItemWire[],
  endpointIds: readonly string[],
) {
  if (option.command_type !== "CREATE_FACT" || !option.enabled || endpointIds.length !== 2) return false;
  if (!catalog.some((item) => item.capability_id === option.capability_ref.capability_id && isTransformationMemberAvailable(item))) return false;
  const endpoints = [...option.normalized_endpoints].sort((a, b) => a.ordinal - b.ordinal);
  // 仅匹配 Runtime 已规范化的方向，不推导节点合法性或改写端点角色。
  return endpoints.length === 2 && endpoints.every((endpoint, index) =>
    endpoint.ordinal === index && endpoint.target_ref.target_id === endpointIds[index]);
}
