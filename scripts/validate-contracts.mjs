import { resolve } from "node:path";
import { readFile } from "node:fs/promises";

import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = resolve(import.meta.dirname, "..");
const contractsDirectory = resolve(root, "docs/contracts");
const cases = [
  ["schemas/opm-revision.schema.json", "examples/minimal-iso-revision.json"],
  ["schemas/opm-profile-package.schema.json", "examples/representative-iso-profile.json"],
  ["schemas/opm-rule-set.schema.json", "examples/representative-iso-rule-set.json"],
];

const openApiPath = resolve(contractsDirectory, "openapi/opm-local-api-v1.yaml");
await SwaggerParser.validate(openApiPath);
const openApi = await SwaggerParser.dereference(openApiPath);

for (const [schemaPath, examplePath] of cases) {
  const schema = JSON.parse(await readFile(resolve(contractsDirectory, schemaPath), "utf8"));
  const example = JSON.parse(await readFile(resolve(contractsDirectory, examplePath), "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  if (!validate(example)) {
    throw new Error(`${examplePath} does not match ${schemaPath}: ${ajv.errorsText(validate.errors)}`);
  }
}

const commandAjv = new Ajv2020({ allErrors: true, strict: false });
addFormats(commandAjv);
const validateCommand = commandAjv.compile(openApi.components.schemas.ExecuteEditCommandRequest);
const validateOption = commandAjv.compile(openApi.components.schemas.CommandCapabilityOption);

const writeGuard = {
  request_id: "request.contract.001",
  command_id: "command.contract.001",
  base_revision: "revision.contract.001",
  binding: {
    profile_id: "profile.contract.001",
    profile_version: "0.2.0",
    rule_set_id: "rules.contract.001",
    rule_version: "0.2.0",
  },
};
const endpoint = (targetId, ordinal) => ({
  role: ordinal === 0 ? "SOURCE" : "TARGET",
  target_ref: { target_kind: "ELEMENT", target_id: targetId },
  ordinal,
});
const validState = {
  ...writeGuard,
  command_type: "CREATE_STATE",
  payload: {
    context_id: "context.root.001",
    owner_ref: { target_kind: "ELEMENT", target_id: "element.owner.001" },
    capability_ref: { capability_id: "capability.state.001", version: "0.2.0" },
    name_or_value: "Ready",
    state_roles: ["INITIAL"],
    occurrence: { ownership: "OWNED", construct_role: "STATE_NODE" },
    layout: { x: 80, y: 120 },
    capability_query_id: "query.state.001",
    selected_option_id: "option.state.001",
  },
};
const validFact = {
  ...writeGuard,
  command_id: "command.fact.001",
  command_type: "CREATE_FACT",
  payload: {
    context_id: "context.root.001",
    capability_ref: { capability_id: "capability.fact.001", version: "0.2.0" },
    fact_family: "TRANSFORMATION",
    normalized_endpoints: [endpoint("element.object.001", 0), endpoint("element.process.001", 1)],
    direction: "DIRECTED",
    labels: [{ slot_id: "label.verb", text: "consumes" }],
    modifiers: [],
    logical_groups: [],
    occurrence: { ownership: "OWNED", construct_role: "FACT_LINK" },
    layout: { route_points: [{ x: 80, y: 120 }, { x: 240, y: 120 }] },
    capability_query_id: "query.fact.001",
    selected_option_id: "option.fact.001",
  },
};
const validConsumption = {
  ...writeGuard,
  command_id: "command.consumption.001",
  command_type: "CREATE_FACT",
  payload: { kind: "CONSUMPTION", object_id: "element.object.001", process_id: "element.process.001" },
};
const validDeleteOption = {
  capability_query_id: "query.delete.001",
  option_id: "option.delete.001",
  command_type: "DELETE_CONSTRUCT",
  capability_ref: { capability_id: "capability.delete.001", version: "0.2.0" },
  display_name: "Delete state",
  group_path: ["Delete"],
  normalized_endpoints: [],
  required_fields: [{ field_id: "impact_token", field_kind: "TOKEN", required: true }],
  allowed_modifiers: [],
  symbol_descriptor: asset("symbol.delete.001"),
  template_family: asset("template.delete.001"),
  rule_refs: [asset("rule.delete.001")],
  enabled: true,
  reason_codes: [],
  expires_with_revision: "revision.contract.001",
  impact_summary: {
    affected_construct_count: 1,
    affected_context_count: 0,
    affected_sentence_count: 1,
    affected_finding_count: 0,
  },
  impact_token: "impact-token-0001",
};

assertValid(validateCommand, validConsumption, "P0 Consumption payload");
assertValid(validateCommand, validState, "State command");
assertValid(validateCommand, validFact, "full Fact endpoints");
assertInvalid(validateCommand, {
  ...writeGuard,
  command_type: "CREATE_ELEMENT",
  payload: { kind: "STATE", name: "Invalid State", layout: { x: 0, y: 0 } },
}, "State as Element");
assertValid(validateOption, validDeleteOption, "Delete option with impact token");
assertInvalid(validateOption, {
  ...validDeleteOption,
  command_type: "CREATE_STATE",
  impact_summary: undefined,
}, "non-Delete option with impact token");
assertInvalid(validateOption, {
  ...validDeleteOption,
  impact_summary: undefined,
  impact_token: undefined,
}, "Delete option without impact token");

console.log("OpenAPI, representative JSON Schema examples, and API-EDT contract cases are valid.");

function asset(id) {
  return { id, version: "0.2.0", digest: "a".repeat(64) };
}

function assertValid(validate, value, name) {
  if (!validate(value)) throw new Error(`${name} should be valid: ${commandAjv.errorsText(validate.errors)}`);
}

function assertInvalid(validate, value, name) {
  if (validate(value)) throw new Error(`${name} should be invalid`);
}
