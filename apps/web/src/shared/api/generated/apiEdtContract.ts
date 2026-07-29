// Generated from docs/contracts/openapi/opm-local-api-v1.yaml. DO NOT EDIT.
// Contract digest: 8418a08e4d557870b685d7a669e68b6452a9af3a0b63299c335c051e5d69c2ef

export type ApiEdtCommandType =
  | "CREATE_ELEMENT"
  | "CREATE_FEATURE"
  | "CREATE_FACT"
  | "CREATE_STATE"
  | "UPDATE_STATE"
  | "UPDATE_FACT"
  | "UPDATE_PROPERTY"
  | "DELETE_CONSTRUCT"
  | "CREATE_CONTEXT"
  | "UPDATE_LAYOUT"
  | "UPDATE_SEMANTIC_LAYOUT"
  | "STATE_EXPLICIT"
  | "STATE_SUPPRESS"
  | "UNFOLD"
  | "FOLD"
  | "SEMANTIC_IN_ZOOM"
  | "SEMANTIC_OUT_ZOOM";

export type ApiEdtTargetKind = "ELEMENT" | "STATE" | "FACT" | "FEATURE" | "CONTEXT";
export type ApiEdtStateRole = "INITIAL" | "DEFAULT" | "FINAL";
export type ApiEdtCapabilityReasonCode =
  | "PROFILE_CAPABILITY_DISABLED"
  | "SYMBOL_ASSET_MISSING"
  | "TEXT_TEMPLATE_MISSING"
  | "ENDPOINT_KIND_MISMATCH"
  | "STATE_OWNER_MISMATCH"
  | "CONTEXT_NOT_ALLOWED"
  | "FACT_ALREADY_EXISTS"
  | "MODIFIER_COMBINATION_INVALID"
  | "READ_ONLY_REVISION"
  | "REVISION_STALE";

export interface ApiEdtAssetReference {
  id: string;
  version: string;
  digest: string;
}

export interface ApiEdtTargetLocator {
  target_kind: ApiEdtTargetKind;
  target_id: string;
  occurrence_id?: string;
}

export interface ApiEdtNormalizedEndpoint {
  role: string;
  target_ref: ApiEdtTargetLocator;
  ordinal: number;
  state_qualification?: string;
}

export interface ApiEdtImpactSummary {
  affected_construct_count: number;
  affected_context_count: number;
  affected_sentence_count: number;
  affected_finding_count: number;
}

export interface ApiEdtCommandCapabilityOption {
  capability_query_id: string;
  option_id: string;
  command_type: ApiEdtCommandType;
  capability_ref: { capability_id: string; version?: string };
  base_fact_capability_ref?: { capability_id: string; version?: string };
  display_name: string;
  group_path: string[];
  normalized_endpoints: ApiEdtNormalizedEndpoint[];
  required_fields: Array<{ field_id: string; field_kind: "TEXT" | "ENUM" | "LIST" | "ENDPOINT" | "LAYOUT" | "TOKEN"; required: boolean; allowed_values?: string[] }> ;
  allowed_modifiers: Array<{ modifier_id: string; value_options: string[]; min_occurs: number; max_occurs: number; atomic_group_id?: string }> ;
  symbol_descriptor: ApiEdtAssetReference;
  template_family: ApiEdtAssetReference;
  rule_refs: ApiEdtAssetReference[];
  enabled: boolean;
  reason_codes: ApiEdtCapabilityReasonCode[];
  expires_with_revision: string;
  impact_summary?: ApiEdtImpactSummary;
  impact_token?: string;
}

export interface ApiEdtCommandCapabilitiesData {
  allowed: ApiEdtCommandType[];
  forbidden: Array<{ command_type: ApiEdtCommandType; reason_code: ApiEdtCapabilityReasonCode }> ;
  capability_query_id: string;
  options: ApiEdtCommandCapabilityOption[];
}

export interface ApiEdtOccurrenceInput {
  ownership: "OWNED" | "REFERENCED";
  construct_role: string;
}

export interface ApiEdtCreateStatePayload {
  context_id: string;
  owner_ref: ApiEdtTargetLocator;
  capability_ref: { capability_id: string; version?: string };
  name_or_value: string;
  state_roles: ApiEdtStateRole[];
  occurrence: ApiEdtOccurrenceInput;
  layout: { x: number; y: number; width?: number; height?: number };
  capability_query_id: string;
  selected_option_id: string;
}

export interface ApiEdtUpdateStatePayload {
  state_id: string;
  expected_owner_ref: ApiEdtTargetLocator;
  changes: { name_or_value?: string; state_roles?: ApiEdtStateRole[]; ordinal?: number };
  capability_query_id: string;
  selected_option_id: string;
}

export interface ApiEdtStatePresentationPayload {
  context_id: string;
  state_id: string;
  layout?: { x: number; y: number; width?: number; height?: number };
}

export interface ApiEdtCreateFactPayload {
  context_id: string;
  capability_ref: { capability_id: string; version?: string };
  fact_family: "PROCEDURAL" | "CONTROL" | "STRUCTURAL" | "TRANSFORMATION" | "ENABLING" | "PROFILE_FACT";
  normalized_endpoints: ApiEdtNormalizedEndpoint[];
  direction: "DIRECTED" | "BIDIRECTIONAL" | "UNDIRECTED";
  labels: Array<{ slot_id: string; text: string }> ;
  modifiers: Array<{ modifier_id: string; value?: string | number | boolean | null }> ;
  condition?: { condition_id: string; value?: string };
  logical_groups: Array<{ group_id: string; endpoint_ordinals: number[] }> ;
  collection_completeness?: "COMPLETE" | "INCOMPLETE" | "NOT_APPLICABLE";
  occurrence: ApiEdtOccurrenceInput;
  layout: { x?: number; y?: number; route_points?: Array<{ x: number; y: number }>; label_positions?: Array<{ x: number; y: number }>; junction_position?: { x: number; y: number } };
  capability_query_id: string;
  selected_option_id: string;
}

export interface ApiEdtUpdateFactPayload {
  fact_id: string;
  expected_capability_ref: { capability_id: string; version?: string };
  replacement: Partial<Pick<ApiEdtCreateFactPayload, "normalized_endpoints" | "direction" | "labels" | "modifiers" | "condition" | "logical_groups" | "collection_completeness">>;
  capability_query_id: string;
  selected_option_id: string;
}

export interface ApiEdtDeleteConstructPayload {
  construct_kind: ApiEdtTargetKind;
  construct_id: string;
  impact_token: string;
}

export type ApiEdtCommandPayload =
  | { command_type: "CREATE_ELEMENT"; payload: { kind: "OBJECT" | "PROCESS"; name: string; layout: { x: number; y: number; width?: number; height?: number }; element_id?: string } }
  | { command_type: "CREATE_FACT"; payload: ApiEdtCreateFactPayload | { kind: "CONSUMPTION"; object_id: string; state_id?: string; process_id: string; fact_id?: string; layout?: { x: number; y: number; width?: number; height?: number } } }
  | { command_type: "CREATE_STATE"; payload: ApiEdtCreateStatePayload }
  | { command_type: "UPDATE_STATE"; payload: ApiEdtUpdateStatePayload }
  | { command_type: "UPDATE_FACT"; payload: ApiEdtUpdateFactPayload }
  | { command_type: "DELETE_CONSTRUCT"; payload: ApiEdtDeleteConstructPayload }
  | { command_type: "STATE_EXPLICIT" | "STATE_SUPPRESS" | "UNFOLD" | "FOLD"; payload: ApiEdtStatePresentationPayload };
