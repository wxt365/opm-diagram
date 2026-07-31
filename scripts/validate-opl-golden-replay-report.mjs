import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { verifyCommittedRevisions } from './validate-opl-golden-committed-revisions.mjs';

const reportPath = process.argv[2];
if (!reportPath) throw new Error('Usage: node scripts/validate-opl-golden-replay-report.mjs <report.json>');

const schema = JSON.parse(await readFile(resolve('docs/contracts/schemas/opm-opl-golden-replay-report.schema.json'), 'utf8'));
const absoluteReportPath = resolve(reportPath);
const report = JSON.parse(await readFile(absoluteReportPath, 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
if (!validate(report)) throw new Error(`OPL Golden replay report schema validation failed: ${JSON.stringify(validate.errors)}`);

if (report.atomic_case_count !== report.atomic_cases.length) throw new Error('OPL Atomic replay count does not match atomic_cases.');
if (report.atomic_cases.some(item => item.observed_status !== 'BLOCKED_MATCHED')) throw new Error('OPL Atomic replay contains unmatched cases.');
console.log(`OPL Golden replay report is structurally valid: ${report.case_count} semantic cases, ${report.atomic_case_count} Atomic cases.`);
const committedAttempts = await verifyCommittedRevisions(
  'packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/opm-opl-golden-manifest.json',
  resolve(dirname(absoluteReportPath), 'work')
);
console.log(`OPL committed revision schema validation passed: ${committedAttempts} PASS attempts.`);
