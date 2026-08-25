import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { assertCaseDriverClosure, assertDriverCatalog, fail, formatSourceDateEpoch } from './canvas06-e2e-manifest-v02-input.mjs';

const schema = JSON.parse(await readFile(new URL('../docs/contracts/schemas/opm-dev-canvas-06-e2e-manifest-v02.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

export function buildE2eManifestV02(input) {
  assertDriverCatalog(input.driver_catalog);
  assertCaseDriverClosure(input.cases);
  const generatedAt = formatSourceDateEpoch(input.source_date_epoch);
  return {
    schema_id: 'OPM-DEV-CANVAS-06-E2E-MANIFEST-001',
    schema_version: '0.2',
    manifest_id: `dev-canvas-06.e2e.${input.source_build.source_commit.slice(0, 12)}.${input.intake_report_ref.sha256.slice(0, 12)}`,
    manifest_version: '0.2.0',
    generated_at: generatedAt,
    generator_identity: {
      runner_version: '0.2.0', source_commit: input.source_build.source_commit, node_version: input.node_version,
      playwright_version: input.playwright_version, chromium_version: input.chromium_version, os: input.os,
      command: input.command, runner_source_sha256: input.runner_source_sha256
    },
    intake_report_ref: input.intake_report_ref,
    handoff_ref: input.handoff_ref,
    upstream_source_build: input.upstream_source_build,
    source_build: input.source_build,
    upstream_input_refs: input.upstream_input_refs,
    input_materialization: input.input_materialization,
    common_fixture_catalog_ref: input.common_fixture_catalog_ref,
    environment_policy: { locale: 'zh-CN', timezone: 'Asia/Shanghai', color_scheme: 'light', reduced_motion: 'reduce', device_scale_factor: 1 },
    fixture_refs: input.fixture_refs,
    driver_catalog: input.driver_catalog,
    suite_catalog: Array.from({ length: 7 }, (_, index) => ({ suite_id: `E2E-CANVAS-00${index + 1}` })),
    coverage_summary: { family_case_count: 178, pass_expectation_count: 130, blocked_expectation_count: 48, common_case_count: 16 },
    transaction_policy: { policy_id: 'DEV-CANVAS-06-E2E-TRANSACTION-POLICY-001', policy_version: '0.1' },
    cases: input.cases,
    summary: { case_count: 194, family_case_count: 178, family_pass_expectation_count: 130, family_blocked_expectation_count: 48, common_case_count: 16, attempt_count: 388, pass_matched_count: 0, blocked_matched_count: 0, failed_count: 0, skipped_count: 0, retry_count: 0 },
    profile_asset_tree_ref: input.profile_asset_tree_ref,
    profile_asset_refs: input.profile_asset_refs
  };
}

export function composeE2eManifestV02(input) {
  const manifest = buildE2eManifestV02(input);
  if (!validate(manifest)) fail('E2E_MANIFEST_SCHEMA_INVALID', 'SCHEMA_VERIFY', JSON.stringify(validate.errors));
  return Object.freeze(manifest);
}

export function manifestBytes(manifest) {
  return `${JSON.stringify(manifest)}\n`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
