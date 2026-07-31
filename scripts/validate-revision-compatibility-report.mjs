import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const reportPath = process.argv[2];
if (!reportPath) throw new Error('Usage: node scripts/validate-revision-compatibility-report.mjs <report.json>');
const schema = JSON.parse(await readFile(resolve('docs/contracts/schemas/opm-revision-compatibility-report.schema.json'), 'utf8'));
const report = JSON.parse(await readFile(resolve(reportPath), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
if (!validate(report)) throw new Error(`Revision compatibility report schema validation failed: ${JSON.stringify(validate.errors)}`);
if (report.case_count !== report.cases.length) throw new Error('Revision compatibility report case_count does not match cases.');
if (report.pass_count + report.blocked_count + report.failed_count !== report.case_count) throw new Error('Revision compatibility report summary is inconsistent.');
if (report.cases.some(item => item.attempts.length !== 2)) throw new Error('Revision compatibility report must contain two attempts per case.');
console.log(`Revision compatibility report is structurally valid: ${report.pass_count} PASS, ${report.blocked_count} BLOCKED, ${report.failed_count} FAILED.`);
