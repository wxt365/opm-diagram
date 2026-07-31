import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const reportPath = process.argv[2];
if (!reportPath) throw new Error('Usage: node scripts/validate-dev-canvas-05-gate-evidence-report.mjs <report.json>');
const schema = JSON.parse(await readFile(resolve('docs/contracts/schemas/opm-dev-canvas-05-gate-evidence-report.schema.json'), 'utf8'));
const report = JSON.parse(await readFile(resolve(reportPath), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } }).compile(schema);
if (!validate(report)) throw new Error(`DEV-CANVAS-05 gate evidence report schema validation failed: ${JSON.stringify(validate.errors)}`);
const summary = report.summary;
if (summary.passed_cases + summary.failed_cases + summary.errors + summary.skipped !== summary.observed_cases) {
  throw new Error('Gate evidence report summary is inconsistent.');
}
if (report.status === 'MATCHED' && (summary.observed_cases !== summary.expected_cases || summary.failed_cases !== 0 || summary.errors !== 0 || summary.skipped !== 0)) {
  throw new Error('MATCHED gate evidence report does not satisfy its summary guards.');
}
console.log(`DEV-CANVAS-05 ${report.gate_id} evidence report is valid: ${report.status}.`);
