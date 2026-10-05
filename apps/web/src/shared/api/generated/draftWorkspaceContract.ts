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

export type CreateElementPayload = { kind: "OBJECT" | "PROCESS"; element_id?: StableId; name: string; layout: NodeLayoutInput; context_id?: StableId; };

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

export type UpdatePropertyPayload = { target_ref: { target_kind: "ELEMENT" | "FEATURE"; target_id: StableId; }; property_name: "name"; value: string; };

export type UpdateLayoutPayload = { occurrence_id: StableId; layout: { x: number; y: number; }; };

export type DeleteConstructPayload = { selection_id: StableId; construct_kind: "OCCURRENCE" | "ELEMENT" | "STATE" | "FACT" | "FEATURE"; construct_id: StableId; delete_mode: "REMOVE_OCCURRENCE" | "DELETE_TARGET" | "CASCADE"; impact_token: string; };

export type StatePresentationPayload = { context_id: StableId; state_id: StableId; layout?: NodeLayoutInput; };

export type LayoutGeometry = { x: number; y: number; width: number; height: number; };

export type UpdateLayoutBatchPayload = { layouts: Array<{ occurrence_id: StableId; layout: LayoutGeometry; }>; };

export type CreateContextPayload = { context_id: StableId; refinee_element_id: StableId; name: string; };

export type DeleteContextPayload = { context_id: StableId; impact_token: string; };

export type ArchitectureLinkKind = "INPUT" | "GENERATES" | "TRACE";

export type CreateArchitectureLinkPayload = { context_id: StableId; target_context_id: StableId; kind: ArchitectureLinkKind; };

export type DeleteArchitectureLinkPayload = { context_id: StableId; link_id: StableId; };

export type ArchitectureLink = { link_id: StableId; source_context_id: StableId; target_context_id: StableId; kind: ArchitectureLinkKind; };

export type ArchitectureLevel = "MISSION" | "FUNCTION" | "PRODUCT";

export type ArchitectureClassificationPayload = { context_id: StableId; architecture_level: ArchitectureLevel | null; };

export type ModelPlanStep = { local_id: StableId; command_type: "CREATE_ELEMENT"; kind: "OBJECT" | "PROCESS"; name: string; layout: NodeLayoutInput; } | { local_id: StableId; command_type: "CREATE_STATE"; target: StableId; name: string; state_roles?: StateRoles; layout?: NodeLayoutInput; } | { local_id: StableId; command_type: "CREATE_FACT"; endpoints: Array<StableId>; capability_id: StableId; } | { local_id: StableId; command_type: "UPDATE_PROPERTY"; target: StableId; name: string; } | { local_id: StableId; command_type: "UPDATE_STATE"; target: StableId; name: string; state_roles?: StateRoles; } | { local_id: StableId; command_type: "UPDATE_LAYOUT"; target: StableId; layout: NodeLayoutInput; };

export type ModelPlanPayload = { context_id: StableId; steps: Array<ModelPlanStep>; };

export type MindmapNode = { id: StableId; parent_id: StableId | null; order: number; label: string; note: string; kind: "TOPIC" | "OBJECT" | "PROCESS" | "STATE" | "ATTRIBUTE" | "CONSTRAINT" | "UNCLASSIFIED"; owner_id: StableId | null; entity_ref: StableId | null; target_id: StableId | null; collapsed: boolean; };

export type MindmapRelation = { id: StableId; label: string; capability_id: StableId | null; endpoints: Array<StableId>; };

export type MindmapDocument = { format_version: number; id: StableId; revision: number; root_id: StableId; nodes: Array<MindmapNode>; relations: Array<MindmapRelation>; };

export type AnalysisSource = { mindmap_id: StableId; revision: number; digest: string; bindings: Array<{ source_id: StableId; target_ref: StableId; }>; excluded_ids: Array<StableId>; };

export type MindmapMapping = { source_id: StableId; target_id: StableId; source_json: string; target_name: string; target_kind: string; };

export type MindmapConversion = { command_id: StableId; context_id: StableId; revision: number; mappings: Array<MindmapMapping>; excluded_ids: Array<StableId>; };

export type MindmapRequest = { request_id: StableId; action: "OPEN" | "SAVE"; draft_token: DraftToken; document?: MindmapDocument; expected_revision?: number; };

export type MindmapResult = { request_id: StableId; document: MindmapDocument; digest: string; conversions: Array<MindmapConversion>; };

export type DraftCommandType = "APPLY_MODEL_PLAN" | "CREATE_ARCHITECTURE_LINK" | "DELETE_ARCHITECTURE_LINK" | "UPDATE_ARCHITECTURE_CLASSIFICATION" | "CREATE_ELEMENT" | "CREATE_CONTEXT" | "DELETE_CONTEXT" | "CREATE_FEATURE" | "CREATE_FACT" | "CREATE_STATE" | "UPDATE_STATE" | "UPDATE_FACT" | "UPDATE_PROPERTY" | "UPDATE_LAYOUT" | "UPDATE_LAYOUT_BATCH" | "DELETE_CONSTRUCT" | "STATE_EXPLICIT" | "STATE_SUPPRESS" | "UNFOLD" | "FOLD";

export type DraftCommand = { command_type: "APPLY_MODEL_PLAN"; payload: ModelPlanPayload; } | { command_type: "CREATE_ARCHITECTURE_LINK"; payload: CreateArchitectureLinkPayload; } | { command_type: "DELETE_ARCHITECTURE_LINK"; payload: DeleteArchitectureLinkPayload; } | { command_type: "UPDATE_ARCHITECTURE_CLASSIFICATION"; payload: ArchitectureClassificationPayload; } | { command_type: "CREATE_ELEMENT"; payload: CreateElementPayload; } | { command_type: "CREATE_CONTEXT"; payload: CreateContextPayload; } | { command_type: "DELETE_CONTEXT"; payload: DeleteContextPayload; } | { command_type: "CREATE_FEATURE"; payload: CreateFeaturePayload; } | { command_type: "CREATE_FACT"; payload: CreateFactPayload; } | { command_type: "CREATE_STATE"; payload: CreateStatePayload; } | { command_type: "UPDATE_STATE"; payload: UpdateStatePayload; } | { command_type: "UPDATE_FACT"; payload: UpdateFactPayload; } | { command_type: "UPDATE_PROPERTY"; payload: UpdatePropertyPayload; } | { command_type: "UPDATE_LAYOUT"; payload: UpdateLayoutPayload; } | { command_type: "UPDATE_LAYOUT_BATCH"; payload: UpdateLayoutBatchPayload; } | { command_type: "DELETE_CONSTRUCT"; payload: DeleteConstructPayload; } | { command_type: "STATE_EXPLICIT"; payload: StatePresentationPayload; } | { command_type: "STATE_SUPPRESS"; payload: StatePresentationPayload; } | { command_type: "UNFOLD"; payload: StatePresentationPayload; } | { command_type: "FOLD"; payload: StatePresentationPayload; };

export type DraftScope = { context_id: StableId; selection_id: StableId | null; intent: DraftCommandType; endpoints: Array<StableId>; };

export type DraftAuthorization = { capability_query_id: StableId; selected_option_id: StableId; };

export type DraftEditRequest = { request_id: StableId; command_id: StableId; expected_draft_token: DraftToken; scope: DraftScope; authorization: DraftAuthorization; command: DraftCommand; analysis_source?: AnalysisSource; };

export type DraftQueryRequest = { request_id: StableId; draft_token: DraftToken; context_id: StableId; };

export type MethodSource = { draft_token: DraftToken; } | { revision_id: StableId; };

export type MethodSummaryRequest = { request_id: StableId; context_id: StableId; source: MethodSource; };

export type MethodEvidence = { fact_id: StableId; capability_id: string; description: string; context_ids: Array<StableId>; target_ids: Array<StableId>; };

export type MethodRole = { role: "SUBJECT" | "OBJECT" | "INSTRUMENT" | "RESOURCE" | "ENVIRONMENT" | "INFORMATION"; status: "EVIDENCE" | "NO_EVIDENCE" | "MANUAL"; guidance: string; evidence: Array<MethodEvidence>; };

export type MethodProcess = { process_id: StableId; name: string; context_ids: Array<StableId>; roles: Array<MethodRole>; };

export type MethodSummaryResult = { meta: { request_id: StableId; context_id: StableId; source: MethodSource; }; data: { coverage: "RELATION_EVIDENCE_ONLY"; processes: Array<MethodProcess>; contexts: Array<{ context_id: StableId; name: string; architecture_level: ArchitectureLevel | null; }>; architecture_links: Array<ArchitectureLink>; refinements: Array<{ refinement_id: StableId; parent_context_id: StableId; child_context_id: StableId; refinee_element_id: StableId; refinee_name: string; refinement_kind: "PROCESS" | "OBJECT"; }>; }; };

export type OperationHistoryRequest = { request_id: StableId; revision: StableId; before: string | null; };

export type OperationHistoryItem = { record_id: StableId; occurred_at: string; operation: string; title: string; context_id: StableId | null; context_name: string | null; status: string; revision_id: StableId | null; detail_available: boolean; };

export type OperationHistoryResult = { meta: { request_id: StableId; project_id: StableId; model_id: StableId; revision: StableId; }; data: { items: Array<OperationHistoryItem>; next_before: string | null; }; };

export type DraftRelationCatalogRequest = { request_id: StableId; draft_token: DraftToken; context_id: StableId; selection_id: StableId | null; };

export type DraftCapabilitiesRequest = { request_id: StableId; draft_token: DraftToken; scope: DraftScope; };

export type OpenDraftRequest = { request_id: StableId; context_id: StableId | null; };

export type DraftQueryMeta = { request_id: StableId; draft_token: DraftToken; context_id: StableId; };

export type OpenDraftResult = { request_id: StableId; project_id: StableId; model_id: StableId; root_context_id: StableId; context_id: StableId; mode: "JOURNALED_DRAFT_V2"; draft_token: DraftToken; save_state: SaveState; };

export type ValidationSummary = { blocking: number; warning: number; suggestion: number; coverage_state: "COMPLETE" | "INCOMPLETE" | "EVIDENCE_MISSING"; };

export type DraftEditResult = { request_id: StableId; command_id: StableId; status: "DURABLE" | "UNCHANGED"; base_token: DraftToken; result_token: DraftToken; content_digest: Digest; affected_ids: Array<StableId>; text_trace_ids: Array<StableId>; validation_summary: ValidationSummary; };

export type CommandCapabilityOption = { capability_query_id: StableId; option_id: StableId; command_type: "APPLY_MODEL_PLAN" | "CREATE_ELEMENT" | "CREATE_CONTEXT" | "CREATE_FEATURE" | "CREATE_FACT" | "CREATE_STATE" | "UPDATE_STATE" | "UPDATE_FACT" | "UPDATE_PROPERTY" | "UPDATE_LAYOUT" | "UPDATE_LAYOUT_BATCH" | "STATE_EXPLICIT" | "STATE_SUPPRESS" | "UNFOLD" | "FOLD"; capability_ref: CapabilityReference; base_fact_capability_ref?: CapabilityReference; display_name: string; group_path: Array<string>; normalized_endpoints: Array<NormalizedEndpoint>; required_fields: Array<RequiredField>; allowed_modifiers: Array<AllowedModifier>; symbol_descriptor: AssetReference; template_family: AssetReference; rule_refs: Array<AssetReference>; enabled: boolean; reason_codes: Array<CapabilityReasonCode>; expires_with_token: DraftToken; } | { capability_query_id: StableId; option_id: StableId; command_type: "DELETE_CONSTRUCT"; capability_ref: CapabilityReference; base_fact_capability_ref?: CapabilityReference; display_name: string; group_path: Array<string>; normalized_endpoints: Array<NormalizedEndpoint>; required_fields: Array<RequiredField>; allowed_modifiers: Array<AllowedModifier>; symbol_descriptor: AssetReference; template_family: AssetReference; rule_refs: Array<AssetReference>; enabled: boolean; reason_codes: Array<CapabilityReasonCode>; impact_summary: ImpactSummary; impact_token: string; delete_mode: "REMOVE_OCCURRENCE" | "DELETE_TARGET" | "CASCADE"; delete_target: DeleteTarget; expires_with_token: DraftToken; } | { capability_query_id: StableId; option_id: StableId; command_type: "DELETE_CONTEXT"; capability_ref: CapabilityReference; base_fact_capability_ref?: CapabilityReference; display_name: string; group_path: Array<string>; normalized_endpoints: Array<NormalizedEndpoint>; required_fields: Array<RequiredField>; allowed_modifiers: Array<AllowedModifier>; symbol_descriptor: AssetReference; template_family: AssetReference; rule_refs: Array<AssetReference>; enabled: boolean; reason_codes: Array<CapabilityReasonCode>; expires_with_token: DraftToken; context_impact: ContextDeleteImpact; impact_token: string; } | { capability_query_id: StableId; option_id: StableId; command_type: "UPDATE_ARCHITECTURE_CLASSIFICATION" | "CREATE_ARCHITECTURE_LINK" | "DELETE_ARCHITECTURE_LINK"; option_kind: "METHOD_METADATA"; target_context_id: StableId; display_name: string; required_fields: Array<RequiredField>; enabled: boolean; reason_codes: Array<CapabilityReasonCode>; expires_with_token: DraftToken; };

export type EditCommandType = "CREATE_ELEMENT" | "CREATE_FEATURE" | "CREATE_FACT" | "CREATE_STATE" | "UPDATE_STATE" | "UPDATE_FACT" | "UPDATE_PROPERTY" | "DELETE_CONSTRUCT" | "CREATE_CONTEXT" | "UPDATE_LAYOUT" | "UPDATE_SEMANTIC_LAYOUT" | "STATE_EXPLICIT" | "STATE_SUPPRESS" | "UNFOLD" | "FOLD" | "SEMANTIC_IN_ZOOM" | "SEMANTIC_OUT_ZOOM";

export type RequiredField = { field_id: string; field_kind: "TEXT" | "ENUM" | "LIST" | "ENDPOINT" | "LAYOUT" | "TOKEN"; required: boolean; allowed_values?: Array<string>; };

export type AllowedModifier = { modifier_id: StableId; value_options: Array<string>; min_occurs: number; max_occurs: number; atomic_group_id?: string; };

export type AssetReference = { id: StableId; version: Version; digest: string; };

export type CapabilityReasonCode = "PROFILE_CAPABILITY_DISABLED" | "SYMBOL_ASSET_MISSING" | "TEXT_TEMPLATE_MISSING" | "ENDPOINT_KIND_MISMATCH" | "STATE_OWNER_MISMATCH" | "CONTEXT_NOT_ALLOWED" | "FACT_ALREADY_EXISTS" | "MODIFIER_COMBINATION_INVALID" | "READ_ONLY_REVISION" | "DRAFT_CONFLICT" | "DELETE_DEPENDENCY_EXISTS" | "COMMAND_NOT_IMPLEMENTED" | "IMPACT_TOKEN_STALE";

export type ImpactSummary = { selected_occurrence_id: StableId; delete_mode: "REMOVE_OCCURRENCE" | "DELETE_TARGET" | "CASCADE"; target: DeleteTarget; items: Array<DeleteImpactItem>; counts: DeleteImpactCounts; input_token: DraftToken; };

export type DeleteTarget = { kind: "OCCURRENCE" | "ELEMENT" | "FEATURE" | "STATE" | "FACT"; id: StableId; };

export type DeleteImpactItem = { kind: "OCCURRENCE" | "ELEMENT" | "FEATURE" | "STATE" | "FACT" | "CONTEXT" | "OPL_SENTENCE" | "TRACE" | "FINDING"; id: StableId; context_id?: StableId; effect: "DIRECT" | "CASCADE" | "BLOCKER"; };

export type DeleteImpactCounts = { contexts: number; occurrences: number; elements: number; features: number; states: number; facts: number; opl_sentences: number; traces: number; findings: number; };

export type ContextDeleteImpact = { input_token: DraftToken; context_id: StableId; parent_context_id: StableId; context_ids: Array<StableId>; counts: DeleteImpactCounts; blockers: Array<{ kind: "ELEMENT" | "FEATURE" | "STATE" | "FACT" | "OCCURRENCE" | "CONTEXT"; id: StableId; context_id?: StableId; }>; };

export type DraftCapabilitiesData = { scope: DraftScope; allowed: Array<DraftCommandType>; forbidden: Array<{ command_type: DraftCommandType; reason_code: CapabilityReasonCode; }>; capability_query_id: StableId; options: Array<CommandCapabilityOption>; };

export type ProjectionLayout = { x: number; y: number; width: number; height: number; z_order: number; route_points?: Array<Point>; label_positions?: Array<Point>; junction_position?: Point; };

export type ProjectionEndpoint = { role: string; target_kind: "ELEMENT" | "FEATURE" | "STATE" | "FACT" | "CONTEXT"; target_id: StableId; ordinal: number; state_qualification?: StableId; };

export type ProjectionConstruct = { occurrence_id: StableId; target_id: StableId; target_kind: "ELEMENT" | "FEATURE" | "STATE" | "FACT"; construct_role: string; label?: string; owner_id?: StableId; state_roles?: Array<"INITIAL" | "DEFAULT" | "FINAL">; explicitness?: "EXPLICIT" | "SUPPRESSED"; fold_state?: "UNFOLDED" | "FOLDED"; direction?: "DIRECTED" | "BIDIRECTIONAL" | "UNDIRECTED"; capability_id: string; endpoints?: Array<ProjectionEndpoint>; modifiers?: Array<ModifierInput>; labels?: Array<LabelInput>; collection_completeness?: "COMPLETE" | "INCOMPLETE" | "NOT_APPLICABLE"; layout: ProjectionLayout; owner_target_kind?: "ELEMENT" | "FEATURE"; source_id?: StableId; process_id?: StableId; source_occurrence_id?: StableId; target_occurrence_id?: StableId; symbol_ref?: StableId; layout_ref?: StableId; };

export type SuppressedState = { state_id: StableId; owner_ref: TargetLocator; name_or_value: string; state_roles: StateRoles; explicitness: "SUPPRESSED"; };

export type DraftProjectionData = { context_id: StableId; constructs: Array<ProjectionConstruct>; suppressed_states: Array<SuppressedState>; };

export type DraftModelPlanPreviewRequest = { request_id: StableId; draft_token: DraftToken; context_id: StableId; plan_id: StableId; steps: Array<ModelPlanStep>; next_scope: DraftScope | null; finalize?: boolean; analysis_source?: AnalysisSource; };

export type DraftModelPlanPreviewResult = { meta: DraftQueryMeta; data: DraftProjectionData; capabilities: DraftCapabilitiesData | null; findings: DraftFindingsData | null; };

export type DraftTextData = { artifact_id: StableId; modality: "OPL" | "OPT"; sentences: Array<{ sentence_id: StableId; text: string; ordinal: number; }>; traces: Array<{ sentence_id: StableId; fact_ids: Array<StableId>; occurrence_ids: Array<StableId>; }>; };

export type NavigationNode = { context_id: StableId; label: string; context_kind: string; has_children: boolean; parent_context_id?: StableId; refinee_element_id?: StableId; };

export type DraftNavigationData = { current_path: Array<StableId>; process_tree: Array<NavigationNode>; object_forest: Array<NavigationNode>; views: Array<NavigationNode>; };

export type RelationCatalogItem = { family: "PROCEDURAL" | "CONTROL" | "STRUCTURAL"; capability_id: StableId; display_name: string; symbol_id: StableId; interaction_mode: "CREATE_FACT" | "UPDATE_SELECTED_FACT"; symbol_descriptor: AssetReference; endpoint_summary: RelationEndpointSummary; enabled: boolean; reason_codes: Array<string>; };

export type RelationEndpointSummary = { min_endpoints: number; max_endpoints?: number; roles: Array<RelationEndpointRoleSummary>; };

export type RelationEndpointRoleSummary = { role: string; target_kinds: Array<"ELEMENT" | "STATE" | "FEATURE" | "FACT">; min_occurs: number; max_occurs?: number; state_qualification_allowed: boolean; };

export type DraftRelationCatalogData = { items: Array<RelationCatalogItem>; };

export type DraftFinding = { finding_id: StableId; rule_id: StableId; severity: "BLOCKING"; category: "DUPLICATE_ID" | "MISSING_REFERENCE" | "CAPABILITY_BINDING_MISMATCH" | "INVALID_ENDPOINT" | "STATE_OWNER_MISMATCH" | "INVALID_STATE_PRESENTATION" | "CONTEXT_CLOSURE_VIOLATION" | "INVALID_LAYOUT" | "INVALID_OWNERSHIP" | "INVALID_REFINEMENT"; context_id: null; entity_id: StableId; message: string; };

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
