import type { WorkbenchCapabilityOption } from "@/shared/types/workbenchCapability";

export function sameRelationOption(left: WorkbenchCapabilityOption, right: WorkbenchCapabilityOption): boolean {
  const identity = (option: WorkbenchCapabilityOption) => ({
    capability_query_id: option.capability_query_id,
    option_id: option.option_id,
    capability_ref: option.capability_ref,
    base_fact_capability_ref: option.base_fact_capability_ref,
    normalized_endpoints: option.normalized_endpoints,
    symbol_descriptor: option.symbol_descriptor,
    template_family: option.template_family,
    rule_refs: option.rule_refs,
    expires_with_revision: option.expires_with_revision,
    expires_with_token: option.expires_with_token,
  });
  return JSON.stringify(identity(left)) === JSON.stringify(identity(right));
}


export function relationCandidateNeedsInput(option: WorkbenchCapabilityOption): boolean {
  return option.required_fields.some((field) => field.required && (
    field.field_id === "duration"
    || field.field_id === "labels"
    || (field.field_id === "direction" && (field.allowed_values?.length ?? 0) > 1)
  ));
}


export function isJavaBlank(value: string): boolean {
  return [...value].every((character) => {
    const codePoint = character.codePointAt(0) ?? -1;
    return (codePoint >= 0x0009 && codePoint <= 0x000d)
      || (codePoint >= 0x001c && codePoint <= 0x0020)
      || codePoint === 0x1680
      || (codePoint >= 0x2000 && codePoint <= 0x2006)
      || (codePoint >= 0x2008 && codePoint <= 0x200a)
      || codePoint === 0x2028
      || codePoint === 0x2029
      || codePoint === 0x205f
      || codePoint === 0x3000;
  });
}


export function proceduralFactFamily(capabilityId: string): "TRANSFORMATION" | "ENABLING" | "PROFILE_FACT" | undefined {
  if (["CAP-ISO-PROC-001", "CAP-ISO-PROC-002", "CAP-ISO-PROC-003", "CAP-ISO-PROC-006", "CAP-ISO-PROC-007", "CAP-ISO-PROC-008", "CAP-ISO-PROC-009", "CAP-ISO-PROC-010"].includes(capabilityId)) return "TRANSFORMATION";
  if (["CAP-ISO-PROC-004", "CAP-ISO-PROC-005", "CAP-ISO-PROC-011", "CAP-ISO-PROC-012"].includes(capabilityId)) return "ENABLING";
  if (["CAP-ISO-PROC-013", "CAP-ISO-PROC-014", "CAP-ISO-PROC-015", "CAP-ISO-PROC-016"].includes(capabilityId)) return "PROFILE_FACT";
  return undefined;
}


export function relationFactFamily(capabilityId: string): "TRANSFORMATION" | "ENABLING" | "PROFILE_FACT" | "STRUCTURAL" | undefined {
  return capabilityId.startsWith("CAP-ISO-STRUCT-") ? "STRUCTURAL" : proceduralFactFamily(capabilityId);
}


export function relationDirection(option: WorkbenchCapabilityOption, selected: "DIRECTED" | "BIDIRECTIONAL"): "DIRECTED" | "BIDIRECTIONAL" | undefined {
  const direction = option.required_fields.find((field) => field.field_id === "direction");
  if (!direction) return "DIRECTED";
  const allowedDirections = direction.allowed_values ?? [];
  return allowedDirections.includes(selected) ? selected : allowedDirections[0] as "DIRECTED" | "BIDIRECTIONAL" | undefined;
}


export function requiredStructuralLabelSlots(option: WorkbenchCapabilityOption, direction: "DIRECTED" | "BIDIRECTIONAL" | undefined): string[] {
  const slots = option.required_fields.find((field) => field.field_id === "labels")?.allowed_values ?? [];
  return direction === "DIRECTED" ? slots.filter((slot) => slot !== "reverse_tag") : slots;
}
