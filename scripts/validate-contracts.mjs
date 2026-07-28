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

await SwaggerParser.validate(resolve(contractsDirectory, "openapi/opm-local-api-v1.yaml"));

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

console.log("OpenAPI and representative JSON Schema examples are valid.");
