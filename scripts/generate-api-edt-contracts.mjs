import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import SwaggerParser from "@apidevtools/swagger-parser";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "docs/contracts/openapi/opm-local-api-v1.yaml");
const check = process.argv.includes("--check");
const contract = await SwaggerParser.dereference(source);
const schemas = contract.components?.schemas;

if (!schemas) throw new Error("OpenAPI 缺少 components.schemas");

const commandTypes = enumValues("EditCommandType");
const requiredCommands = ["CREATE_ELEMENT", "CREATE_FEATURE", "CREATE_FACT", "CREATE_STATE", "UPDATE_STATE", "UPDATE_FACT", "UPDATE_PROPERTY", "UPDATE_LAYOUT", "DELETE_CONSTRUCT", "STATE_EXPLICIT", "STATE_SUPPRESS", "UNFOLD", "FOLD"];
for (const command of requiredCommands) {
  if (!commandTypes.includes(command)) throw new Error(`EditCommandType 缺少 ${command}`);
}
for (const name of ["CommandCapabilityOption", "RelationCatalogItem", "RelationEndpointSummary", "RelationEndpointRoleSummary", "CreateFeaturePayload", "CreateStatePayload", "UpdateStatePayload", "CreateFactPayload", "UpdateFactPayload", "UpdatePropertyPayload", "UpdateLayoutPayload", "DeleteConstructPayload", "StatePresentationPayload"]) {
  if (!schemas[name]) throw new Error(`OpenAPI 缺少 ${name}`);
}
assertUpdatePropertyContract();
assertUpdateLayoutContract();
assertRelationCatalogContract();
assertDeleteConstructContract();

const sourceDigest = createHash("sha256")
  .update(JSON.stringify(requiredCommands.map((name) => [name, schemas[name] ?? null])))
  .update(JSON.stringify(schemas.CommandCapabilityOption))
  .update(JSON.stringify(schemas.RelationCatalogItem))
  .update(JSON.stringify(schemas.RelationEndpointSummary))
  .update(JSON.stringify(schemas.RelationEndpointRoleSummary))
  .update(JSON.stringify(schemas.StatePresentationPayload))
  .update(JSON.stringify(schemas.UpdatePropertyPayload))
  .update(JSON.stringify(schemas.UpdateLayoutPayload))
  .update(JSON.stringify(schemas.DeleteConstructPayload))
  .update(JSON.stringify(schemas.ImpactSummary))
  .digest("hex");
const targets = new Map([
  [resolve(root, "apps/web/src/shared/api/generated/apiEdtContract.ts"), enrichDeleteConstructContract(
    enrichRelationCatalogContract(enrichPropertyContract(enrichLayoutContract(enrichControlOptionContract(typescript(sourceDigest, commandTypes), "typescript"), "typescript"), "typescript"), "typescript"),
    "typescript",
  )],
  [resolve(root, "services/local-runtime/src/main/java/org/opm/localruntime/api/generated/ApiEdtContract.java"), enrichDeleteConstructContract(
    enrichRelationCatalogContract(enrichPropertyContract(enrichLayoutContract(enrichControlOptionContract(java(sourceDigest, commandTypes), "java"), "java"), "java"), "java"),
    "java",
  )],
]);

for (const [path, content] of targets) {
  if (check) {
    let existing = "";
    try {
      existing = await readFile(path, "utf8");
    } catch {
      throw new Error(`缺少生成产物：${relative(path)}`);
    }
    if (existing !== content) throw new Error(`生成产物与 OpenAPI 不一致：${relative(path)}；请执行 npm run contract:generate`);
  } else {
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, content, "utf8");
  }
}

console.log(check ? "API-EDT generated DTOs are current." : "API-EDT generated DTOs written.");

function enumValues(name) {
  const values = schemas[name]?.enum;
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) throw new Error(`${name} 必须是字符串 enum`);
  return values;
}

function relative(path) {
  return path.slice(root.length + 1);
}

function assertDeleteConstructContract() {
  const payload = schemas.DeleteConstructPayload;
  const option = schemas.CommandCapabilityOption;
  const required = ["selection_id", "construct_kind", "construct_id", "delete_mode", "impact_token"];
  if (payload?.additionalProperties !== false || required.some((field) => !payload.required?.includes(field))
      || payload.properties?.construct_kind?.enum?.join(",") !== "OCCURRENCE,ELEMENT,STATE,FACT,FEATURE"
      || payload.properties?.delete_mode?.enum?.join(",") !== "REMOVE_OCCURRENCE,DELETE_TARGET,CASCADE"
      || !schemas.DeleteTarget || !schemas.DeleteImpactItem || !schemas.DeleteImpactCounts
      || !option?.properties?.delete_mode || !option?.properties?.delete_target) {
    throw new Error("DeleteConstructPayload 与删除影响契约必须完整且封闭");
  }
}

function enrichDeleteConstructContract(content, language) {
  if (language === "typescript") {
    return content
      .replace(
        "export interface ApiEdtImpactSummary {\n  affected_construct_count: number;\n  affected_context_count: number;\n  affected_sentence_count: number;\n  affected_finding_count: number;\n}",
        "export type ApiEdtDeleteMode = \"REMOVE_OCCURRENCE\" | \"DELETE_TARGET\" | \"CASCADE\";\nexport type ApiEdtDeleteTargetKind = \"OCCURRENCE\" | \"ELEMENT\" | \"FEATURE\" | \"STATE\" | \"FACT\";\nexport interface ApiEdtDeleteTarget { kind: ApiEdtDeleteTargetKind; id: string; }\nexport interface ApiEdtDeleteImpactItem { kind: string; id: string; context_id?: string; effect: \"DIRECT\" | \"CASCADE\" | \"BLOCKER\"; }\nexport interface ApiEdtDeleteImpactCounts { contexts: number; occurrences: number; elements: number; features: number; states: number; facts: number; opl_sentences: number; traces: number; findings: number; }\nexport interface ApiEdtImpactSummary { input_revision: string; selected_occurrence_id: string; delete_mode: ApiEdtDeleteMode; target: ApiEdtDeleteTarget; items: ApiEdtDeleteImpactItem[]; counts: ApiEdtDeleteImpactCounts; }",
      )
      .replace(
        "  impact_token?: string;\n}",
        "  impact_token?: string;\n  delete_mode?: ApiEdtDeleteMode;\n  delete_target?: ApiEdtDeleteTarget;\n}",
      )
      .replace(
        "export interface ApiEdtDeleteConstructPayload {\n  construct_kind: ApiEdtTargetKind;\n  construct_id: string;\n  impact_token: string;\n}",
        "export interface ApiEdtDeleteConstructPayload {\n  selection_id: string;\n  construct_kind: ApiEdtDeleteTargetKind;\n  construct_id: string;\n  delete_mode: ApiEdtDeleteMode;\n  impact_token: string;\n}",
      );
  }
  return content
    .replace(
      "    public record ImpactSummary(int affectedConstructCount, int affectedContextCount, int affectedSentenceCount, int affectedFindingCount) {\n        public ImpactSummary { if (affectedConstructCount < 0 || affectedContextCount < 0 || affectedSentenceCount < 0 || affectedFindingCount < 0) throw new IllegalArgumentException(\"impact counts must not be negative\"); }\n    }",
      "    public record DeleteTarget(String kind, String id) { public DeleteTarget { Objects.requireNonNull(kind); Objects.requireNonNull(id); } }\n\n    public record DeleteImpactItem(String kind, String id, String contextId, String effect) { public DeleteImpactItem { Objects.requireNonNull(kind); Objects.requireNonNull(id); Objects.requireNonNull(effect); } }\n\n    public record DeleteImpactCounts(int contexts, int occurrences, int elements, int features, int states, int facts, int oplSentences, int traces, int findings) { public DeleteImpactCounts { if (contexts < 0 || occurrences < 0 || elements < 0 || features < 0 || states < 0 || facts < 0 || oplSentences < 0 || traces < 0 || findings < 0) throw new IllegalArgumentException(\"impact counts must not be negative\"); } }\n\n    public record ImpactSummary(String inputRevision, String selectedOccurrenceId, String deleteMode, DeleteTarget target, List<DeleteImpactItem> items, DeleteImpactCounts counts) { public ImpactSummary { Objects.requireNonNull(inputRevision); Objects.requireNonNull(selectedOccurrenceId); Objects.requireNonNull(deleteMode); Objects.requireNonNull(target); items = List.copyOf(items); Objects.requireNonNull(counts); } }",
    )
    .replace(
      "public record DeleteConstructPayload(String constructKind, String constructId, String impactToken) {\n        public DeleteConstructPayload { Objects.requireNonNull(constructKind); Objects.requireNonNull(constructId); Objects.requireNonNull(impactToken); if (impactToken.length() < 16) throw new IllegalArgumentException(\"impact token is too short\"); }\n    }",
      "public record DeleteConstructPayload(String selectionId, String constructKind, String constructId, String deleteMode, String impactToken) {\n        public DeleteConstructPayload { Objects.requireNonNull(selectionId); Objects.requireNonNull(constructKind); Objects.requireNonNull(constructId); Objects.requireNonNull(deleteMode); Objects.requireNonNull(impactToken); if (impactToken.length() < 16) throw new IllegalArgumentException(\"impact token is too short\"); }\n    }",
    )
    .replace(
      "ImpactSummary impactSummary, String impactToken, String expiresWithRevision)",
      "ImpactSummary impactSummary, String impactToken, String deleteMode, DeleteTarget deleteTarget, String expiresWithRevision)",
    )
    .replace(
      "if (commandType == CommandType.DELETE_CONSTRUCT && (impactSummary == null || impactToken == null)) throw new IllegalArgumentException(\"delete option requires impact summary and token\");\n            if (commandType != CommandType.DELETE_CONSTRUCT && (impactSummary != null || impactToken != null)) throw new IllegalArgumentException(\"impact data is only valid for delete options\");",
      "if (commandType == CommandType.DELETE_CONSTRUCT && (impactSummary == null || impactToken == null || deleteMode == null || deleteTarget == null)) throw new IllegalArgumentException(\"delete option requires impact summary and token\");\n            if (commandType != CommandType.DELETE_CONSTRUCT && (impactSummary != null || impactToken != null || deleteMode != null || deleteTarget != null)) throw new IllegalArgumentException(\"impact data is only valid for delete options\");",
    )
    .replace(
      "\n        }\n\n        public Map<String, Object> toWire() {",
      "\n        }\n\n        public CommandCapabilityOption(String capabilityQueryId, String optionId, CommandType commandType, String capabilityId, String baseFactCapabilityId, String displayName, List<String> groupPath, List<NormalizedEndpoint> normalizedEndpoints, List<RequiredField> requiredFields, List<AllowedModifier> allowedModifiers, AssetReference symbolDescriptor, AssetReference templateFamily, List<AssetReference> ruleRefs, boolean enabled, List<String> reasonCodes, ImpactSummary impactSummary, String impactToken, String expiresWithRevision) { this(capabilityQueryId, optionId, commandType, capabilityId, baseFactCapabilityId, displayName, groupPath, normalizedEndpoints, requiredFields, allowedModifiers, symbolDescriptor, templateFamily, ruleRefs, enabled, reasonCodes, impactSummary, impactToken, null, null, expiresWithRevision); }\n\n        public Map<String, Object> toWire() {",
    )
    .replace(
      "if (impactSummary != null) { result.put(\"impact_summary\", impact(impactSummary)); result.put(\"impact_token\", impactToken); }",
      "if (impactSummary != null) { result.put(\"impact_summary\", impact(impactSummary)); result.put(\"impact_token\", impactToken); result.put(\"delete_mode\", deleteMode); result.put(\"delete_target\", Map.of(\"kind\", deleteTarget.kind(), \"id\", deleteTarget.id())); }",
    )
    .replace(
      "private static Map<String, Object> impact(ImpactSummary value) { return Map.of(\"affected_construct_count\", value.affectedConstructCount(), \"affected_context_count\", value.affectedContextCount(), \"affected_sentence_count\", value.affectedSentenceCount(), \"affected_finding_count\", value.affectedFindingCount()); }",
      "private static Map<String, Object> impact(ImpactSummary value) { Map<String, Object> result = new LinkedHashMap<>(); result.put(\"input_revision\", value.inputRevision()); result.put(\"selected_occurrence_id\", value.selectedOccurrenceId()); result.put(\"delete_mode\", value.deleteMode()); result.put(\"target\", Map.of(\"kind\", value.target().kind(), \"id\", value.target().id())); result.put(\"items\", value.items().stream().map(item -> { Map<String, Object> wire = new LinkedHashMap<>(); wire.put(\"kind\", item.kind()); wire.put(\"id\", item.id()); if (item.contextId() != null) wire.put(\"context_id\", item.contextId()); wire.put(\"effect\", item.effect()); return Map.copyOf(wire); }).toList()); result.put(\"counts\", Map.of(\"contexts\", value.counts().contexts(), \"occurrences\", value.counts().occurrences(), \"elements\", value.counts().elements(), \"features\", value.counts().features(), \"states\", value.counts().states(), \"facts\", value.counts().facts(), \"opl_sentences\", value.counts().oplSentences(), \"traces\", value.counts().traces(), \"findings\", value.counts().findings())); return Map.copyOf(result); }",
    );
}

function assertUpdatePropertyContract() {
  const payload = schemas.UpdatePropertyPayload;
  const target = payload?.properties?.target_ref;
  if (payload?.additionalProperties !== false
      || target?.additionalProperties !== false
      || target?.properties?.target_kind?.const !== "ELEMENT"
      || payload?.properties?.property_name?.const !== "name"
      || payload?.properties?.value?.maxLength !== 256) {
    throw new Error("UpdatePropertyPayload 必须保持封闭的 Object/Process name 契约");
  }
  const variants = schemas.ExecuteEditCommandRequest?.allOf?.flatMap((item) => item.oneOf ?? []) ?? [];
  if (variants.filter((item) => item.properties?.command_type?.const === "UPDATE_PROPERTY").length !== 1) {
    throw new Error("ExecuteEditCommandRequest 必须仅包含一个 UPDATE_PROPERTY 分支");
  }
  const legacyTypes = schemas.LegacyEditCommand?.properties?.command_type?.enum ?? [];
  if (legacyTypes.includes("UPDATE_PROPERTY")) {
    throw new Error("UPDATE_PROPERTY 不得回退到 LegacyEditCommand 任意 payload");
  }
}

function assertUpdateLayoutContract() {
  const payload = schemas.UpdateLayoutPayload;
  const roles = payload?.["x-opm-owned-construct-roles"];
  if (payload?.additionalProperties !== false
      || JSON.stringify(payload?.required) !== JSON.stringify(["occurrence_id", "layout"])
      || JSON.stringify(roles) !== JSON.stringify(["OBJECT_NODE", "PROCESS_NODE", "ATTRIBUTE_NODE", "OPERATION_NODE", "STATE_NODE", "FEATURE_STATE_NODE"])) {
    throw new Error("UpdateLayoutPayload 必须保持 owned Object/Process/Attribute/Operation/State occurrence 契约");
  }
  const layout = payload?.properties?.layout;
  if (layout?.additionalProperties !== false
      || JSON.stringify(layout?.required) !== JSON.stringify(["x", "y"])
      || layout?.properties?.x?.type !== "number"
      || layout?.properties?.y?.type !== "number") {
    throw new Error("UpdateLayoutPayload.layout 必须保持封闭 x/y 数值契约");
  }
}

function assertRelationCatalogContract() {
  const item = schemas.RelationCatalogItem;
  const endpoint = schemas.RelationEndpointSummary;
  const role = schemas.RelationEndpointRoleSummary;
  if (item?.additionalProperties !== false
      || JSON.stringify(item?.properties?.interaction_mode?.enum) !== JSON.stringify(["CREATE_FACT", "UPDATE_SELECTED_FACT"])
      || endpoint?.additionalProperties !== false
      || role?.additionalProperties !== false
      || role?.properties?.state_qualification_allowed?.type !== "boolean") {
    throw new Error("Relation Catalog 必须保持 selection-aware 的封闭交互与端点摘要契约");
  }
  const required = new Set(item.required ?? []);
  for (const field of ["interaction_mode", "symbol_descriptor", "endpoint_summary"]) {
    if (!required.has(field)) throw new Error(`RelationCatalogItem 缺少必填字段 ${field}`);
  }
  if ((endpoint.required ?? []).includes("max_endpoints") || (role.required ?? []).includes("max_occurs")) {
    throw new Error("Relation Catalog 无上限字段必须可缺失且不可用 null 表示");
  }
}

function enrichRelationCatalogContract(content, language) {
  if (language === "typescript") {
    return content.replace(
      "export interface ApiEdtImpactSummary {",
      "export type ApiEdtRelationInteractionMode = \"CREATE_FACT\" | \"UPDATE_SELECTED_FACT\";\n\nexport interface ApiEdtRelationEndpointRoleSummary {\n  role: string;\n  target_kinds: Array<\"ELEMENT\" | \"STATE\" | \"FEATURE\" | \"FACT\">;\n  min_occurs: number;\n  max_occurs?: number;\n  state_qualification_allowed: boolean;\n}\n\nexport interface ApiEdtRelationEndpointSummary {\n  min_endpoints: number;\n  max_endpoints?: number;\n  roles: ApiEdtRelationEndpointRoleSummary[];\n}\n\nexport interface ApiEdtRelationCatalogItem {\n  family: \"PROCEDURAL\" | \"CONTROL\" | \"STRUCTURAL\";\n  capability_id: string;\n  display_name: string;\n  symbol_id: string;\n  interaction_mode: ApiEdtRelationInteractionMode;\n  symbol_descriptor: ApiEdtAssetReference;\n  endpoint_summary: ApiEdtRelationEndpointSummary;\n  enabled: boolean;\n  reason_codes: string[];\n}\n\nexport interface ApiEdtImpactSummary {",
    );
  }
  return content.replace(
    "    public record ImpactSummary(",
    "    public record RelationEndpointRoleSummary(String role, List<String> targetKinds, int minOccurs, Integer maxOccurs, boolean stateQualificationAllowed) {\n        public RelationEndpointRoleSummary { Objects.requireNonNull(role); targetKinds = List.copyOf(targetKinds); if (targetKinds.isEmpty() || minOccurs < 0 || (maxOccurs != null && maxOccurs < minOccurs)) throw new IllegalArgumentException(\"relation endpoint role is invalid\"); }\n        public Map<String, Object> toWire() { Map<String, Object> result = new LinkedHashMap<>(); result.put(\"role\", role); result.put(\"target_kinds\", targetKinds); result.put(\"min_occurs\", minOccurs); if (maxOccurs != null) result.put(\"max_occurs\", maxOccurs); result.put(\"state_qualification_allowed\", stateQualificationAllowed); return Map.copyOf(result); }\n    }\n\n    public record RelationEndpointSummary(int minEndpoints, Integer maxEndpoints, List<RelationEndpointRoleSummary> roles) {\n        public RelationEndpointSummary { roles = List.copyOf(roles); if (minEndpoints < 0 || (maxEndpoints != null && maxEndpoints < minEndpoints)) throw new IllegalArgumentException(\"relation endpoint summary is invalid\"); }\n        public Map<String, Object> toWire() { Map<String, Object> result = new LinkedHashMap<>(); result.put(\"min_endpoints\", minEndpoints); if (maxEndpoints != null) result.put(\"max_endpoints\", maxEndpoints); result.put(\"roles\", roles.stream().map(RelationEndpointRoleSummary::toWire).toList()); return Map.copyOf(result); }\n    }\n\n    public record RelationCatalogItem(String family, String capabilityId, String displayName, String symbolId, String interactionMode, AssetReference symbolDescriptor, RelationEndpointSummary endpointSummary, boolean enabled, List<String> reasonCodes) {\n        public RelationCatalogItem { Objects.requireNonNull(family); Objects.requireNonNull(capabilityId); Objects.requireNonNull(displayName); Objects.requireNonNull(symbolId); Objects.requireNonNull(interactionMode); Objects.requireNonNull(symbolDescriptor); Objects.requireNonNull(endpointSummary); reasonCodes = List.copyOf(reasonCodes); }\n        public Map<String, Object> toWire() { return Map.of(\"family\", family, \"capability_id\", capabilityId, \"display_name\", displayName, \"symbol_id\", symbolId, \"interaction_mode\", interactionMode, \"symbol_descriptor\", asset(symbolDescriptor), \"endpoint_summary\", endpointSummary.toWire(), \"enabled\", enabled, \"reason_codes\", reasonCodes); }\n    }\n\n    public record ImpactSummary(",
  );
}

function enrichControlOptionContract(content, language) {
  if (language === "typescript") {
    return content
      .replace(
        '  capability_ref: { capability_id: string; version?: string };\n  display_name:',
        '  capability_ref: { capability_id: string; version?: string };\n  base_fact_capability_ref?: { capability_id: string; version?: string };\n  display_name:',
      )
      .replace(
        '  allowed_modifiers: Array<{ modifier_id: string; allowed_values?: string[] }> ;',
        '  allowed_modifiers: Array<{ modifier_id: string; value_options: string[]; min_occurs: number; max_occurs: number; atomic_group_id?: string }> ;',
      )
      .replace(
        '"normalized_endpoints" | "labels" | "modifiers" | "condition" | "logical_groups" | "collection_completeness"',
        '"normalized_endpoints" | "direction" | "labels" | "modifiers" | "condition" | "logical_groups" | "collection_completeness"',
      );
  }
  return content
    .replace(
      'public record AllowedModifier(String modifierId, List<String> allowedValues) {\n        public AllowedModifier { Objects.requireNonNull(modifierId); allowedValues = List.copyOf(allowedValues == null ? List.of() : allowedValues); }\n    }',
      'public record AllowedModifier(String modifierId, List<String> valueOptions, int minOccurs, int maxOccurs, String atomicGroupId) {\n        public AllowedModifier { Objects.requireNonNull(modifierId); valueOptions = List.copyOf(valueOptions == null ? List.of() : valueOptions); if (minOccurs < 0 || maxOccurs < minOccurs) throw new IllegalArgumentException("modifier occurrences are invalid"); }\n    }',
    )
    .replace(
      'CommandType commandType, String capabilityId, String displayName,',
      'CommandType commandType, String capabilityId, String baseFactCapabilityId, String displayName,',
    )
    .replace(
      'result.put("capability_ref", Map.of("capability_id", capabilityId));\n            result.put("display_name", displayName);',
      'result.put("capability_ref", Map.of("capability_id", capabilityId));\n            if (baseFactCapabilityId != null) result.put("base_fact_capability_ref", Map.of("capability_id", baseFactCapabilityId));\n            result.put("display_name", displayName);',
    )
    .replace(
      'allowedModifiers.stream().map(modifier -> Map.of("modifier_id", modifier.modifierId(), "allowed_values", modifier.allowedValues())).toList()',
      'allowedModifiers.stream().map(modifier -> { Map<String, Object> value = new LinkedHashMap<>(); value.put("modifier_id", modifier.modifierId()); value.put("value_options", modifier.valueOptions()); value.put("min_occurs", modifier.minOccurs()); value.put("max_occurs", modifier.maxOccurs()); if (modifier.atomicGroupId() != null) value.put("atomic_group_id", modifier.atomicGroupId()); return Map.copyOf(value); }).toList()',
    );
}

function enrichLayoutContract(content, language) {
  if (language === "typescript") {
    return content
      .replace(
        "export interface ApiEdtCreateFactPayload {",
        "export interface ApiEdtUpdateLayoutPayload {\n  occurrence_id: string;\n  layout: { x: number; y: number };\n}\n\nexport interface ApiEdtCreateFactPayload {",
      )
      .replace(
        '  | { command_type: "DELETE_CONSTRUCT"; payload: ApiEdtDeleteConstructPayload }',
        '  | { command_type: "UPDATE_LAYOUT"; payload: ApiEdtUpdateLayoutPayload }\n  | { command_type: "DELETE_CONSTRUCT"; payload: ApiEdtDeleteConstructPayload }',
      );
  }
  return content.replace(
    "    public record CreateFactPayload(",
    "    public record UpdateLayoutPayload(String occurrenceId, Map<String, Object> layout) {\n        public UpdateLayoutPayload { Objects.requireNonNull(occurrenceId); layout = Map.copyOf(layout); }\n    }\n\n    public record CreateFactPayload(",
  );
}

function enrichPropertyContract(content, language) {
  if (language === "typescript") {
    return content
      .replace(
        "export interface ApiEdtUpdateLayoutPayload {",
        "export interface ApiEdtUpdatePropertyPayload {\n  target_ref: { target_kind: \"ELEMENT\"; target_id: string };\n  property_name: \"name\";\n  value: string;\n  capability_query_id: string;\n  selected_option_id: string;\n}\n\nexport interface ApiEdtUpdateLayoutPayload {",
      )
      .replace(
        '  | { command_type: "UPDATE_LAYOUT"; payload: ApiEdtUpdateLayoutPayload }',
        '  | { command_type: "UPDATE_PROPERTY"; payload: ApiEdtUpdatePropertyPayload }\n  | { command_type: "UPDATE_LAYOUT"; payload: ApiEdtUpdateLayoutPayload }',
      );
  }
  return content.replace(
    "    public record UpdateLayoutPayload(",
    "    public record UpdatePropertyPayload(TargetLocator targetRef, String propertyName, String value, String capabilityQueryId, String selectedOptionId) {\n        public UpdatePropertyPayload { Objects.requireNonNull(targetRef); Objects.requireNonNull(propertyName); Objects.requireNonNull(value); Objects.requireNonNull(capabilityQueryId); Objects.requireNonNull(selectedOptionId); }\n    }\n\n    public record UpdateLayoutPayload(",
  );
}

function typescript(digest, commands) {
  const commandUnion = commands.map((value) => `  | "${value}"`).join("\n");
  return `// Generated from docs/contracts/openapi/opm-local-api-v1.yaml. DO NOT EDIT.\n// Contract digest: ${digest}\n\nexport type ApiEdtCommandType =\n${commandUnion};\n\nexport type ApiEdtTargetKind = "ELEMENT" | "STATE" | "FACT" | "FEATURE" | "CONTEXT";\nexport type ApiEdtStateRole = "INITIAL" | "DEFAULT" | "FINAL";\nexport type ApiEdtCapabilityReasonCode =\n  | "PROFILE_CAPABILITY_DISABLED"\n  | "SYMBOL_ASSET_MISSING"\n  | "TEXT_TEMPLATE_MISSING"\n  | "ENDPOINT_KIND_MISMATCH"\n  | "STATE_OWNER_MISMATCH"\n  | "CONTEXT_NOT_ALLOWED"\n  | "FACT_ALREADY_EXISTS"\n  | "MODIFIER_COMBINATION_INVALID"\n  | "READ_ONLY_REVISION"\n  | "REVISION_STALE";\n\nexport interface ApiEdtAssetReference {\n  id: string;\n  version: string;\n  digest: string;\n}\n\nexport interface ApiEdtTargetLocator {\n  target_kind: ApiEdtTargetKind;\n  target_id: string;\n  occurrence_id?: string;\n}\n\nexport interface ApiEdtNormalizedEndpoint {\n  role: string;\n  target_ref: ApiEdtTargetLocator;\n  ordinal: number;\n  state_qualification?: string;\n}\n\nexport interface ApiEdtImpactSummary {\n  affected_construct_count: number;\n  affected_context_count: number;\n  affected_sentence_count: number;\n  affected_finding_count: number;\n}\n\nexport interface ApiEdtCommandCapabilityOption {\n  capability_query_id: string;\n  option_id: string;\n  command_type: ApiEdtCommandType;\n  capability_ref: { capability_id: string; version?: string };\n  display_name: string;\n  group_path: string[];\n  normalized_endpoints: ApiEdtNormalizedEndpoint[];\n  required_fields: Array<{ field_id: string; field_kind: "TEXT" | "ENUM" | "LIST" | "ENDPOINT" | "LAYOUT" | "TOKEN"; required: boolean; allowed_values?: string[] }> ;\n  allowed_modifiers: Array<{ modifier_id: string; allowed_values?: string[] }> ;\n  symbol_descriptor: ApiEdtAssetReference;\n  template_family: ApiEdtAssetReference;\n  rule_refs: ApiEdtAssetReference[];\n  enabled: boolean;\n  reason_codes: ApiEdtCapabilityReasonCode[];\n  expires_with_revision: string;\n  impact_summary?: ApiEdtImpactSummary;\n  impact_token?: string;\n}\n\nexport interface ApiEdtCommandCapabilitiesData {\n  allowed: ApiEdtCommandType[];\n  forbidden: Array<{ command_type: ApiEdtCommandType; reason_code: ApiEdtCapabilityReasonCode }> ;\n  capability_query_id: string;\n  options: ApiEdtCommandCapabilityOption[];\n}\n\nexport interface ApiEdtOccurrenceInput {\n  ownership: "OWNED" | "REFERENCED";\n  construct_role: string;\n}\n\nexport interface ApiEdtCreateStatePayload {\n  context_id: string;\n  owner_ref: ApiEdtTargetLocator;\n  capability_ref: { capability_id: string; version?: string };\n  name_or_value: string;\n  state_roles: ApiEdtStateRole[];\n  occurrence: ApiEdtOccurrenceInput;\n  layout: { x: number; y: number; width?: number; height?: number };\n  capability_query_id: string;\n  selected_option_id: string;\n}\n\nexport interface ApiEdtUpdateStatePayload {\n  state_id: string;\n  expected_owner_ref: ApiEdtTargetLocator;\n  changes: { name_or_value?: string; state_roles?: ApiEdtStateRole[]; ordinal?: number };\n  capability_query_id: string;\n  selected_option_id: string;\n}\n\nexport interface ApiEdtStatePresentationPayload {\n  context_id: string;\n  state_id: string;\n  layout?: { x: number; y: number; width?: number; height?: number };\n}\n\nexport interface ApiEdtCreateFactPayload {\n  context_id: string;\n  capability_ref: { capability_id: string; version?: string };\n  fact_family: "PROCEDURAL" | "CONTROL" | "STRUCTURAL" | "TRANSFORMATION" | "ENABLING" | "PROFILE_FACT";\n  normalized_endpoints: ApiEdtNormalizedEndpoint[];\n  direction: "DIRECTED" | "BIDIRECTIONAL" | "UNDIRECTED";\n  labels: Array<{ slot_id: string; text: string }> ;\n  modifiers: Array<{ modifier_id: string; value?: string | number | boolean | null }> ;\n  condition?: { condition_id: string; value?: string };\n  logical_groups: Array<{ group_id: string; endpoint_ordinals: number[] }> ;\n  collection_completeness?: "COMPLETE" | "INCOMPLETE" | "NOT_APPLICABLE";\n  occurrence: ApiEdtOccurrenceInput;\n  layout: { x?: number; y?: number; route_points?: Array<{ x: number; y: number }>; label_positions?: Array<{ x: number; y: number }>; junction_position?: { x: number; y: number } };\n  capability_query_id: string;\n  selected_option_id: string;\n}\n\nexport interface ApiEdtUpdateFactPayload {\n  fact_id: string;\n  expected_capability_ref: { capability_id: string; version?: string };\n  replacement: Partial<Pick<ApiEdtCreateFactPayload, "normalized_endpoints" | "labels" | "modifiers" | "condition" | "logical_groups" | "collection_completeness">>;\n  capability_query_id: string;\n  selected_option_id: string;\n}\n\nexport interface ApiEdtDeleteConstructPayload {\n  construct_kind: ApiEdtTargetKind;\n  construct_id: string;\n  impact_token: string;\n}\n\nexport type ApiEdtCommandPayload =\n  | { command_type: "CREATE_ELEMENT"; payload: { kind: "OBJECT" | "PROCESS"; name: string; layout: { x: number; y: number; width?: number; height?: number }; element_id?: string } }\n  | { command_type: "CREATE_FACT"; payload: ApiEdtCreateFactPayload | { kind: "CONSUMPTION"; object_id: string; state_id?: string; process_id: string; fact_id?: string; layout?: { x: number; y: number; width?: number; height?: number } } }\n  | { command_type: "CREATE_STATE"; payload: ApiEdtCreateStatePayload }\n  | { command_type: "UPDATE_STATE"; payload: ApiEdtUpdateStatePayload }\n  | { command_type: "UPDATE_FACT"; payload: ApiEdtUpdateFactPayload }\n  | { command_type: "DELETE_CONSTRUCT"; payload: ApiEdtDeleteConstructPayload }\n  | { command_type: "STATE_EXPLICIT" | "STATE_SUPPRESS" | "UNFOLD" | "FOLD"; payload: ApiEdtStatePresentationPayload };\n`;
}

function java(digest, commands) {
  const enumValues = commands.map((value) => `        ${value}`).join(",\n");
  return `// Generated from docs/contracts/openapi/opm-local-api-v1.yaml. DO NOT EDIT.\n// Contract digest: ${digest}\npackage org.opm.localruntime.api.generated;\n\nimport java.util.LinkedHashMap;\nimport java.util.List;\nimport java.util.Map;\nimport java.util.Objects;\n\npublic final class ApiEdtContract {\n\n    private ApiEdtContract() { }\n\n    public enum CommandType {\n${enumValues}\n    }\n\n    public record AssetReference(String id, String version, String digest) {\n        public AssetReference { Objects.requireNonNull(id); Objects.requireNonNull(version); Objects.requireNonNull(digest); }\n    }\n\n    public record TargetLocator(String targetKind, String targetId, String occurrenceId) {\n        public TargetLocator { Objects.requireNonNull(targetKind); Objects.requireNonNull(targetId); }\n    }\n\n    public record NormalizedEndpoint(String role, TargetLocator targetRef, int ordinal, String stateQualification) {\n        public NormalizedEndpoint { Objects.requireNonNull(role); Objects.requireNonNull(targetRef); if (ordinal < 0) throw new IllegalArgumentException("ordinal must not be negative"); }\n    }\n\n    public record RequiredField(String fieldId, String fieldKind, boolean required, List<String> allowedValues) {\n        public RequiredField { Objects.requireNonNull(fieldId); Objects.requireNonNull(fieldKind); allowedValues = List.copyOf(allowedValues == null ? List.of() : allowedValues); }\n    }\n\n    public record AllowedModifier(String modifierId, List<String> allowedValues) {\n        public AllowedModifier { Objects.requireNonNull(modifierId); allowedValues = List.copyOf(allowedValues == null ? List.of() : allowedValues); }\n    }\n\n    public record ImpactSummary(int affectedConstructCount, int affectedContextCount, int affectedSentenceCount, int affectedFindingCount) {\n        public ImpactSummary { if (affectedConstructCount < 0 || affectedContextCount < 0 || affectedSentenceCount < 0 || affectedFindingCount < 0) throw new IllegalArgumentException("impact counts must not be negative"); }\n    }\n\n    public record CreateStatePayload(String contextId, TargetLocator ownerRef, String capabilityId, String nameOrValue, List<String> stateRoles, Map<String, Object> occurrence, Map<String, Object> layout, String capabilityQueryId, String selectedOptionId) {\n        public CreateStatePayload { Objects.requireNonNull(contextId); Objects.requireNonNull(ownerRef); Objects.requireNonNull(capabilityId); Objects.requireNonNull(nameOrValue); stateRoles = List.copyOf(stateRoles); occurrence = Map.copyOf(occurrence); layout = Map.copyOf(layout); Objects.requireNonNull(capabilityQueryId); Objects.requireNonNull(selectedOptionId); }\n    }\n\n    public record UpdateStatePayload(String stateId, TargetLocator expectedOwnerRef, Map<String, Object> changes, String capabilityQueryId, String selectedOptionId) {\n        public UpdateStatePayload { Objects.requireNonNull(stateId); Objects.requireNonNull(expectedOwnerRef); changes = Map.copyOf(changes); if (changes.isEmpty()) throw new IllegalArgumentException("state changes must not be empty"); Objects.requireNonNull(capabilityQueryId); Objects.requireNonNull(selectedOptionId); }\n    }\n\n    public record StatePresentationPayload(String contextId, String stateId, Map<String, Object> layout) {\n        public StatePresentationPayload { Objects.requireNonNull(contextId); Objects.requireNonNull(stateId); layout = Map.copyOf(layout == null ? Map.of() : layout); }\n    }\n\n    public record CreateFactPayload(String contextId, String capabilityId, String factFamily, List<NormalizedEndpoint> normalizedEndpoints, String direction, List<Map<String, Object>> labels, List<Map<String, Object>> modifiers, Map<String, Object> condition, List<Map<String, Object>> logicalGroups, String collectionCompleteness, Map<String, Object> occurrence, Map<String, Object> layout, String capabilityQueryId, String selectedOptionId) {\n        public CreateFactPayload { Objects.requireNonNull(contextId); Objects.requireNonNull(capabilityId); Objects.requireNonNull(factFamily); normalizedEndpoints = List.copyOf(normalizedEndpoints); if (normalizedEndpoints.size() < 2) throw new IllegalArgumentException("fact requires at least two endpoints"); Objects.requireNonNull(direction); labels = List.copyOf(labels); modifiers = List.copyOf(modifiers); logicalGroups = List.copyOf(logicalGroups); occurrence = Map.copyOf(occurrence); layout = Map.copyOf(layout); Objects.requireNonNull(capabilityQueryId); Objects.requireNonNull(selectedOptionId); }\n    }\n\n    public record UpdateFactPayload(String factId, String expectedCapabilityId, Map<String, Object> replacement, String capabilityQueryId, String selectedOptionId) {\n        public UpdateFactPayload { Objects.requireNonNull(factId); Objects.requireNonNull(expectedCapabilityId); replacement = Map.copyOf(replacement); if (replacement.isEmpty()) throw new IllegalArgumentException("fact replacement must not be empty"); Objects.requireNonNull(capabilityQueryId); Objects.requireNonNull(selectedOptionId); }\n    }\n\n    public record DeleteConstructPayload(String constructKind, String constructId, String impactToken) {\n        public DeleteConstructPayload { Objects.requireNonNull(constructKind); Objects.requireNonNull(constructId); Objects.requireNonNull(impactToken); if (impactToken.length() < 16) throw new IllegalArgumentException("impact token is too short"); }\n    }\n\n    public record CommandCapabilityOption(String capabilityQueryId, String optionId, CommandType commandType, String capabilityId, String displayName, List<String> groupPath, List<NormalizedEndpoint> normalizedEndpoints, List<RequiredField> requiredFields, List<AllowedModifier> allowedModifiers, AssetReference symbolDescriptor, AssetReference templateFamily, List<AssetReference> ruleRefs, boolean enabled, List<String> reasonCodes, ImpactSummary impactSummary, String impactToken, String expiresWithRevision) {\n        public CommandCapabilityOption {\n            Objects.requireNonNull(capabilityQueryId); Objects.requireNonNull(optionId); Objects.requireNonNull(commandType); Objects.requireNonNull(capabilityId); Objects.requireNonNull(displayName);\n            groupPath = List.copyOf(groupPath); normalizedEndpoints = List.copyOf(normalizedEndpoints); requiredFields = List.copyOf(requiredFields); allowedModifiers = List.copyOf(allowedModifiers);\n            Objects.requireNonNull(symbolDescriptor); Objects.requireNonNull(templateFamily); ruleRefs = List.copyOf(ruleRefs); reasonCodes = List.copyOf(reasonCodes); Objects.requireNonNull(expiresWithRevision);\n            if (commandType == CommandType.DELETE_CONSTRUCT && (impactSummary == null || impactToken == null)) throw new IllegalArgumentException("delete option requires impact summary and token");\n            if (commandType != CommandType.DELETE_CONSTRUCT && (impactSummary != null || impactToken != null)) throw new IllegalArgumentException("impact data is only valid for delete options");\n        }\n\n        public Map<String, Object> toWire() {\n            Map<String, Object> result = new LinkedHashMap<>();\n            result.put("capability_query_id", capabilityQueryId);\n            result.put("option_id", optionId);\n            result.put("command_type", commandType.name());\n            result.put("capability_ref", Map.of("capability_id", capabilityId));\n            result.put("display_name", displayName);\n            result.put("group_path", groupPath);\n            result.put("normalized_endpoints", normalizedEndpoints.stream().map(ApiEdtContract::endpoint).toList());\n            result.put("required_fields", requiredFields.stream().map(field -> Map.of("field_id", field.fieldId(), "field_kind", field.fieldKind(), "required", field.required(), "allowed_values", field.allowedValues())).toList());\n            result.put("allowed_modifiers", allowedModifiers.stream().map(modifier -> Map.of("modifier_id", modifier.modifierId(), "allowed_values", modifier.allowedValues())).toList());\n            result.put("symbol_descriptor", asset(symbolDescriptor));\n            result.put("template_family", asset(templateFamily));\n            result.put("rule_refs", ruleRefs.stream().map(ApiEdtContract::asset).toList());\n            result.put("enabled", enabled);\n            result.put("reason_codes", reasonCodes);\n            result.put("expires_with_revision", expiresWithRevision);\n            if (impactSummary != null) { result.put("impact_summary", impact(impactSummary)); result.put("impact_token", impactToken); }\n            return Map.copyOf(result);\n        }\n    }\n\n    public record ForbiddenCommand(CommandType commandType, String reasonCode) {\n        public ForbiddenCommand { Objects.requireNonNull(commandType); Objects.requireNonNull(reasonCode); }\n        public Map<String, Object> toWire() { return Map.of("command_type", commandType.name(), "reason_code", reasonCode); }\n    }\n\n    public record CommandCapabilitiesData(List<CommandType> allowed, List<ForbiddenCommand> forbidden, String capabilityQueryId, List<CommandCapabilityOption> options) {\n        public CommandCapabilitiesData { allowed = List.copyOf(allowed); forbidden = List.copyOf(forbidden); Objects.requireNonNull(capabilityQueryId); options = List.copyOf(options); }\n        public Map<String, Object> toWire() { return Map.of("allowed", allowed.stream().map(Enum::name).toList(), "forbidden", forbidden.stream().map(ForbiddenCommand::toWire).toList(), "capability_query_id", capabilityQueryId, "options", options.stream().map(CommandCapabilityOption::toWire).toList()); }\n    }\n\n    private static Map<String, Object> asset(AssetReference value) { return Map.of("id", value.id(), "version", value.version(), "digest", value.digest()); }\n\n    private static Map<String, Object> endpoint(NormalizedEndpoint value) {\n        Map<String, Object> result = new LinkedHashMap<>();\n        result.put("role", value.role());\n        result.put("target_ref", Map.of("target_kind", value.targetRef().targetKind(), "target_id", value.targetRef().targetId()));\n        result.put("ordinal", value.ordinal());\n        if (value.stateQualification() != null) result.put("state_qualification", value.stateQualification());\n        return Map.copyOf(result);\n    }\n\n    private static Map<String, Object> impact(ImpactSummary value) { return Map.of("affected_construct_count", value.affectedConstructCount(), "affected_context_count", value.affectedContextCount(), "affected_sentence_count", value.affectedSentenceCount(), "affected_finding_count", value.affectedFindingCount()); }\n}\n`;
}
