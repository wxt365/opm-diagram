// 由 scripts/generate-draft-workspace-contract.mjs 生成，请勿手改。

export type DraftToken = { draft_id: Id; edit_seq: number; binding_digest: Digest; };

export type Id = string;

export type Digest = string;

export type SaveState = { durable_token: DraftToken; checkpoint_token: DraftToken | null; last_manual_revision: Id | null; dirty_since: UtcTime | null; deadline: UtcTime | null; in_flight: "NONE" | "AUTO" | "MANUAL" | "PIN"; pending_manual_target: DraftToken | null; last_error: SaveError | null; };

export type UtcTime = string;

export type SaveError = { code: "INPUT_INVALID" | "DRAFT_CONFLICT" | "READ_ONLY_REVISION" | "RULE_VERSION_CONFLICT" | "IDEMPOTENCY_MISMATCH" | "PERSISTENCE_FAILED" | "DRAFT_RECOVERY_REQUIRED" | "NOT_FOUND" | "LOCAL_SESSION_INVALID" | "DRAFT_MODE_REQUIRED" | "SAVE_VALIDATION_BLOCKED"; message: string; retryable: boolean; };

export type SaveResult = { save_id: Id; status: "SAVED" | "UNCHANGED"; captured_token: DraftToken; checkpoint_id: Id; revision_id: Id; head_token: DraftToken; };

export type PinResult = { pin_id: Id; revision_id: Id; captured_token: DraftToken; };

export type StableId = string;

export type CreateElementPayload = { kind: "OBJECT" | "PROCESS"; element_id?: StableId; name: string; layout: NodeLayoutInput; };

export type NodeLayoutInput = { x: number; y: number; width?: number; height?: number; };

export type CreateFeaturePayload = { context_id: StableId; owner_element_id: StableId; feature_kind: "ATTRIBUTE" | "OPERATION"; capability_ref: CapabilityReference; name: string; occurrence: OccurrenceInput; layout: NodeLayoutInput; };

export type CapabilityReference = { capability_id: StableId; version?: Version; };

export type Version = string;

export type OccurrenceInput = { ownership: "OWNED" | "REFERENCED"; construct_role: string; };

export type CreateFactPayload = { context_id: StableId; fact_id?: StableId; capability_ref: CapabilityReference; fact_family: "PROCEDURAL" | "STRUCTURAL" | "TRANSFORMATION" | "ENABLING" | "PROFILE_FACT"; normalized_endpoints: Array<NormalizedEndpoint>; direction: "DIRECTED" | "BIDIRECTIONAL" | "UNDIRECTED"; labels: Array<LabelInput>; modifiers: Array<ModifierInput>; condition?: ConditionInput; logical_groups: Array<LogicalGroupInput>; collection_completeness?: "COMPLETE" | "INCOMPLETE" | "NOT_APPLICABLE"; occurrence: OccurrenceInput; layout: FactLayoutInput; };

export type NormalizedEndpoint = { role: string; target_ref: TargetLocator; ordinal: number; state_qualification?: StableId; };

export type TargetLocator = { target_kind: "ELEMENT" | "STATE" | "FACT" | "FEATURE" | "CONTEXT"; target_id: StableId; occurrence_id?: StableId; };

export type LabelInput = { slot_id: string; text: string; };

export type ModifierInput = { modifier_id: StableId; value?: string | number | boolean | null; };

export type ConditionInput = { condition_id: StableId; value?: string; };

export type LogicalGroupInput = { group_id: StableId; endpoint_ordinals: Array<number>; };

export type FactLayoutInput = { x?: number; y?: number; route_points?: Array<Point>; label_positions?: Array<Point>; junction_position?: Point; };

export type Point = { x: number; y: number; };

export type CreateStatePayload = { context_id: StableId; state_id?: StableId; owner_ref: TargetLocator; capability_ref: CapabilityReference; name_or_value: string; state_roles: StateRoles; occurrence: OccurrenceInput; layout: NodeLayoutInput; };

export type StateRoles = Array<"INITIAL" | "DEFAULT" | "FINAL">;

export type UpdateStatePayload = { state_id: StableId; expected_owner_ref: TargetLocator; changes: { name_or_value?: string; state_roles?: StateRoles; }; };

export type UpdateFactPayload = { fact_id: StableId; expected_capability_ref: CapabilityReference; replacement: { normalized_endpoints?: Array<NormalizedEndpoint>; direction?: "DIRECTED" | "BIDIRECTIONAL" | "UNDIRECTED"; labels?: Array<LabelInput>; modifiers?: Array<ModifierInput>; condition?: ConditionInput; logical_groups?: Array<LogicalGroupInput>; collection_completeness?: "COMPLETE" | "INCOMPLETE" | "NOT_APPLICABLE"; }; };

export type UpdatePropertyPayload = { target_ref: { target_kind: "ELEMENT"; target_id: StableId; }; property_name: "name"; value: string; };

export type UpdateLayoutPayload = { occurrence_id: StableId; layout: { x: number; y: number; }; };

export type DeleteConstructPayload = { selection_id: StableId; construct_kind: "OCCURRENCE" | "ELEMENT" | "STATE" | "FACT" | "FEATURE"; construct_id: StableId; delete_mode: "REMOVE_OCCURRENCE" | "DELETE_TARGET" | "CASCADE"; impact_token: string; };

export type StatePresentationPayload = { context_id: StableId; state_id: StableId; layout?: NodeLayoutInput; };

export type DraftCommandType = "CREATE_ELEMENT" | "CREATE_FEATURE" | "CREATE_FACT" | "CREATE_STATE" | "UPDATE_STATE" | "UPDATE_FACT" | "UPDATE_PROPERTY" | "UPDATE_LAYOUT" | "DELETE_CONSTRUCT" | "STATE_EXPLICIT" | "STATE_SUPPRESS" | "UNFOLD" | "FOLD";

export type DraftCommand = { command_type: "CREATE_ELEMENT"; payload: CreateElementPayload; } | { command_type: "CREATE_FEATURE"; payload: CreateFeaturePayload; } | { command_type: "CREATE_FACT"; payload: CreateFactPayload; } | { command_type: "CREATE_STATE"; payload: CreateStatePayload; } | { command_type: "UPDATE_STATE"; payload: UpdateStatePayload; } | { command_type: "UPDATE_FACT"; payload: UpdateFactPayload; } | { command_type: "UPDATE_PROPERTY"; payload: UpdatePropertyPayload; } | { command_type: "UPDATE_LAYOUT"; payload: UpdateLayoutPayload; } | { command_type: "DELETE_CONSTRUCT"; payload: DeleteConstructPayload; } | { command_type: "STATE_EXPLICIT"; payload: StatePresentationPayload; } | { command_type: "STATE_SUPPRESS"; payload: StatePresentationPayload; } | { command_type: "UNFOLD"; payload: StatePresentationPayload; } | { command_type: "FOLD"; payload: StatePresentationPayload; };

export type DraftScope = { context_id: StableId; selection_id: StableId | null; intent: DraftCommandType; endpoints: Array<StableId>; };

export type DraftAuthorization = { capability_query_id: StableId; selected_option_id: StableId; };

export type DraftEditRequest = { request_id: StableId; command_id: StableId; expected_draft_token: DraftToken; scope: DraftScope; authorization: DraftAuthorization; command: DraftCommand; };

export type DraftQueryRequest = { request_id: StableId; draft_token: DraftToken; context_id: StableId; };

export type DraftRelationCatalogRequest = { request_id: StableId; draft_token: DraftToken; context_id: StableId; selection_id: StableId | null; };

export type DraftCapabilitiesRequest = { request_id: StableId; draft_token: DraftToken; scope: DraftScope; };

export type OpenDraftRequest = { request_id: StableId; context_id: StableId | null; };

export type DraftQueryMeta = { request_id: StableId; draft_token: DraftToken; context_id: StableId; };

export type OpenDraftResult = { request_id: StableId; project_id: StableId; model_id: StableId; root_context_id: StableId; context_id: StableId; mode: "JOURNALED_DRAFT_V2"; draft_token: DraftToken; save_state: SaveState; };

export type ValidationSummary = { blocking: number; warning: number; suggestion: number; coverage_state: "COMPLETE" | "INCOMPLETE" | "EVIDENCE_MISSING"; };

export type DraftEditResult = { request_id: StableId; command_id: StableId; status: "DURABLE" | "UNCHANGED"; base_token: DraftToken; result_token: DraftToken; content_digest: Digest; affected_ids: Array<StableId>; text_trace_ids: Array<StableId>; validation_summary: ValidationSummary; };

export type CommandCapabilityOption = { capability_query_id: StableId; option_id: StableId; command_type: "CREATE_ELEMENT" | "CREATE_FEATURE" | "CREATE_FACT" | "CREATE_STATE" | "UPDATE_STATE" | "UPDATE_FACT" | "UPDATE_PROPERTY" | "UPDATE_LAYOUT" | "STATE_EXPLICIT" | "STATE_SUPPRESS" | "UNFOLD" | "FOLD"; capability_ref: CapabilityReference; base_fact_capability_ref?: CapabilityReference; display_name: string; group_path: Array<string>; normalized_endpoints: Array<NormalizedEndpoint>; required_fields: Array<RequiredField>; allowed_modifiers: Array<AllowedModifier>; symbol_descriptor: AssetReference; template_family: AssetReference; rule_refs: Array<AssetReference>; enabled: boolean; reason_codes: Array<CapabilityReasonCode>; expires_with_token: DraftToken; } | { capability_query_id: StableId; option_id: StableId; command_type: "DELETE_CONSTRUCT"; capability_ref: CapabilityReference; base_fact_capability_ref?: CapabilityReference; display_name: string; group_path: Array<string>; normalized_endpoints: Array<NormalizedEndpoint>; required_fields: Array<RequiredField>; allowed_modifiers: Array<AllowedModifier>; symbol_descriptor: AssetReference; template_family: AssetReference; rule_refs: Array<AssetReference>; enabled: boolean; reason_codes: Array<CapabilityReasonCode>; impact_summary: ImpactSummary; impact_token: string; delete_mode: "REMOVE_OCCURRENCE" | "DELETE_TARGET" | "CASCADE"; delete_target: DeleteTarget; expires_with_token: DraftToken; };

export type EditCommandType = "CREATE_ELEMENT" | "CREATE_FEATURE" | "CREATE_FACT" | "CREATE_STATE" | "UPDATE_STATE" | "UPDATE_FACT" | "UPDATE_PROPERTY" | "DELETE_CONSTRUCT" | "CREATE_CONTEXT" | "UPDATE_LAYOUT" | "UPDATE_SEMANTIC_LAYOUT" | "STATE_EXPLICIT" | "STATE_SUPPRESS" | "UNFOLD" | "FOLD" | "SEMANTIC_IN_ZOOM" | "SEMANTIC_OUT_ZOOM";

export type RequiredField = { field_id: string; field_kind: "TEXT" | "ENUM" | "LIST" | "ENDPOINT" | "LAYOUT" | "TOKEN"; required: boolean; allowed_values?: Array<string>; };

export type AllowedModifier = { modifier_id: StableId; value_options: Array<string>; min_occurs: number; max_occurs: number; atomic_group_id?: string; };

export type AssetReference = { id: StableId; version: Version; digest: string; };

export type CapabilityReasonCode = "PROFILE_CAPABILITY_DISABLED" | "SYMBOL_ASSET_MISSING" | "TEXT_TEMPLATE_MISSING" | "ENDPOINT_KIND_MISMATCH" | "STATE_OWNER_MISMATCH" | "CONTEXT_NOT_ALLOWED" | "FACT_ALREADY_EXISTS" | "MODIFIER_COMBINATION_INVALID" | "READ_ONLY_REVISION" | "DRAFT_CONFLICT" | "DELETE_DEPENDENCY_EXISTS" | "COMMAND_NOT_IMPLEMENTED" | "IMPACT_TOKEN_STALE";

export type ImpactSummary = { selected_occurrence_id: StableId; delete_mode: "REMOVE_OCCURRENCE" | "DELETE_TARGET" | "CASCADE"; target: DeleteTarget; items: Array<DeleteImpactItem>; counts: DeleteImpactCounts; input_token: DraftToken; };

export type DeleteTarget = { kind: "OCCURRENCE" | "ELEMENT" | "FEATURE" | "STATE" | "FACT"; id: StableId; };

export type DeleteImpactItem = { kind: "OCCURRENCE" | "ELEMENT" | "FEATURE" | "STATE" | "FACT" | "CONTEXT" | "OPL_SENTENCE" | "TRACE" | "FINDING"; id: StableId; context_id?: StableId; effect: "DIRECT" | "CASCADE" | "BLOCKER"; };

export type DeleteImpactCounts = { contexts: number; occurrences: number; elements: number; features: number; states: number; facts: number; opl_sentences: number; traces: number; findings: number; };

export type DraftCapabilitiesData = { scope: DraftScope; allowed: Array<DraftCommandType>; forbidden: Array<{ command_type: DraftCommandType; reason_code: CapabilityReasonCode; }>; capability_query_id: StableId; options: Array<CommandCapabilityOption>; };

export type ProjectionLayout = { x: number; y: number; width: number; height: number; z_order: number; route_points?: Array<Point>; label_positions?: Array<Point>; junction_position?: Point; };

export type ProjectionEndpoint = { role: string; target_kind: "ELEMENT" | "FEATURE" | "STATE" | "FACT" | "CONTEXT"; target_id: StableId; ordinal: number; state_qualification?: StableId; };

export type ProjectionConstruct = { occurrence_id: StableId; target_id: StableId; target_kind: "ELEMENT" | "FEATURE" | "STATE" | "FACT"; construct_role: string; label?: string; owner_id?: StableId; state_roles?: Array<"INITIAL" | "DEFAULT" | "FINAL">; explicitness?: "EXPLICIT" | "SUPPRESSED"; fold_state?: "UNFOLDED" | "FOLDED"; direction?: "DIRECTED" | "BIDIRECTIONAL" | "UNDIRECTED"; capability_id: string; endpoints?: Array<ProjectionEndpoint>; modifiers?: Array<ModifierInput>; labels?: Array<LabelInput>; collection_completeness?: "COMPLETE" | "INCOMPLETE" | "NOT_APPLICABLE"; layout: ProjectionLayout; owner_target_kind?: "ELEMENT" | "FEATURE"; source_id?: StableId; process_id?: StableId; source_occurrence_id?: StableId; target_occurrence_id?: StableId; symbol_ref?: StableId; layout_ref?: StableId; };

export type SuppressedState = { state_id: StableId; owner_ref: TargetLocator; name_or_value: string; state_roles: StateRoles; explicitness: "SUPPRESSED"; };

export type DraftProjectionData = { context_id: StableId; constructs: Array<ProjectionConstruct>; suppressed_states: Array<SuppressedState>; };

export type DraftTextData = { artifact_id: StableId; modality: "OPL" | "OPT"; sentences: Array<{ sentence_id: StableId; text: string; ordinal: number; }>; traces: Array<{ sentence_id: StableId; fact_ids: Array<StableId>; occurrence_ids: Array<StableId>; }>; };

export type NavigationNode = { context_id: StableId; label: string; context_kind: string; has_children: boolean; };

export type DraftNavigationData = { current_path: Array<StableId>; process_tree: Array<NavigationNode>; object_forest: Array<NavigationNode>; views: Array<NavigationNode>; };

export type RelationCatalogItem = { family: "PROCEDURAL" | "CONTROL" | "STRUCTURAL"; capability_id: StableId; display_name: string; symbol_id: StableId; interaction_mode: "CREATE_FACT" | "UPDATE_SELECTED_FACT"; symbol_descriptor: AssetReference; endpoint_summary: RelationEndpointSummary; enabled: boolean; reason_codes: Array<string>; };

export type RelationEndpointSummary = { min_endpoints: number; max_endpoints?: number; roles: Array<RelationEndpointRoleSummary>; };

export type RelationEndpointRoleSummary = { role: string; target_kinds: Array<"ELEMENT" | "STATE" | "FEATURE" | "FACT">; min_occurs: number; max_occurs?: number; state_qualification_allowed: boolean; };

export type DraftRelationCatalogData = { items: Array<RelationCatalogItem>; };

export type DraftFinding = { finding_id: StableId; rule_id: StableId; severity: "BLOCKING"; category: "DUPLICATE_ID" | "MISSING_REFERENCE" | "CAPABILITY_BINDING_MISMATCH" | "INVALID_ENDPOINT" | "STATE_OWNER_MISMATCH" | "INVALID_STATE_PRESENTATION" | "CONTEXT_CLOSURE_VIOLATION" | "INVALID_LAYOUT" | "INVALID_OWNERSHIP"; context_id: null; entity_id: StableId; message: string; };

export type DraftFindingsData = { items: Array<DraftFinding>; validation_scope: "MODEL"; validation_summary: { blocking: number; warning: number; suggestion: number; coverage_state: "INCOMPLETE"; }; };

export type DraftProjectionResult = { meta: DraftQueryMeta; data: DraftProjectionData; };

export type DraftTextResult = { meta: DraftQueryMeta; data: DraftTextData; };

export type DraftNavigationResult = { meta: DraftQueryMeta; data: DraftNavigationData; };

export type DraftFindingsResult = { meta: DraftQueryMeta; data: DraftFindingsData; };

export type DraftRelationCatalogResult = { meta: DraftQueryMeta; data: DraftRelationCatalogData; };

export type DraftCapabilitiesResult = { meta: DraftQueryMeta; data: DraftCapabilitiesData; };

export type DraftReceiptRequest = { request_id: StableId; operation: "EDIT" | "SAVE" | "PIN"; idempotency_id: StableId; };

export type DraftReceiptResult = { request_id: StableId; operation: "EDIT" | "SAVE" | "PIN"; idempotency_id: StableId; status: "NOT_FOUND"; request_digest: null; result: null; } | { request_id: StableId; operation: "EDIT"; idempotency_id: StableId; status: "FOUND"; request_digest: Digest; result: DraftEditResult; } | { request_id: StableId; operation: "SAVE"; idempotency_id: StableId; status: "FOUND"; request_digest: Digest; result: SaveResult; } | { request_id: StableId; operation: "PIN"; idempotency_id: StableId; status: "FOUND"; request_digest: Digest; result: PinResult; };

export type DraftError = { code: "INPUT_INVALID" | "DRAFT_CONFLICT" | "READ_ONLY_REVISION" | "RULE_VERSION_CONFLICT" | "IDEMPOTENCY_MISMATCH" | "PERSISTENCE_FAILED" | "DRAFT_RECOVERY_REQUIRED" | "NOT_FOUND" | "DRAFT_MODE_REQUIRED" | "DRAFT_EDIT_REJECTED" | "LOCAL_SESSION_INVALID"; message: string; retryable: boolean; reason_code: CapabilityReasonCode | null; };
