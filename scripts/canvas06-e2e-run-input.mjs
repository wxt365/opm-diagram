import { isAbsolute, relative, resolve, sep } from 'node:path';

const RUN_VALUE_OPTIONS = [
  'input-mode', 'manifest-root', 'manifest', 'source-root', 'java-home', 'browser-executable',
  'runtime-port', 'web-port', 'output-root', 'out'
];
const VERIFY_VALUE_OPTIONS = ['input-mode', 'evidence-root', 'report'];
const PRODUCTION_VALUE_OPTIONS = ['handoff-root', 'intake-report'];
const CONTROLLED_VALUE_OPTIONS = ['controlled-bundle-root'];
const PRODUCTION_FLAGS = new Set(['require-production', 'require-ready']);

export class E2eRunInputError extends Error {
  constructor(code, message, exitCode = 2) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function parseRunOptions(argv) {
  const options = parseOptions({ argv, valueOptions: RUN_VALUE_OPTIONS, allowReady: false });
  validateMode(options, { requireProduction: true, allowReady: false });
  assertPortPair(options);
  return Object.freeze(options);
}

export function parseVerifyOptions(argv) {
  const options = parseOptions({ argv, valueOptions: VERIFY_VALUE_OPTIONS, allowReady: true });
  validateMode(options, { requireProduction: true, allowReady: true });
  return Object.freeze(options);
}

export function fixedReportPath(reportId) {
  if (!/^dev-canvas-06\.e2e-report\.[a-f0-9]{12}\.[a-f0-9]{12}$/.test(reportId)) {
    fail('E2E_RUN_ARGUMENT_INVALID', 'report_id is invalid.');
  }
  return `dev-canvas-06/e2e/reports/${reportId}/dev-canvas-06-e2e-report.json`;
}

export function resolveReportRoot({ outputRoot, out, reportId }) {
  if (!safeRelativePath(out) || out !== fixedReportPath(reportId)) {
    fail('E2E_RUN_ARGUMENT_INVALID', 'out must be the fixed relative path derived from report_id.');
  }
  const root = resolve(outputRoot);
  const reportPath = resolve(root, out);
  if (!isInside(root, reportPath)) fail('E2E_RUN_ARGUMENT_INVALID', 'out escapes output-root.');
  return Object.freeze({ outputRoot: root, reportPath, reportRoot: resolve(reportPath, '..') });
}

export function resolveVerifierReport({ evidenceRoot, report }) {
  const root = resolve(evidenceRoot);
  if (!safeRelativePath(report)) fail('E2E_RUN_ARGUMENT_INVALID', 'report must be a safe evidence-root relative path.');
  const path = resolve(root, report);
  if (!isInside(root, path)) fail('E2E_RUN_ARGUMENT_INVALID', 'report escapes evidence-root.');
  return Object.freeze({ evidenceRoot: root, reportPath: path, reportRoot: resolve(path, '..') });
}

export function safeRelativePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !isAbsolute(value)
    && !value.includes('\\')
    && value.split('/').every(part => part && part !== '.' && part !== '..');
}

function parseOptions({ argv, valueOptions, allowReady }) {
  const values = new Map();
  const allowedValues = new Set([...valueOptions, ...PRODUCTION_VALUE_OPTIONS, ...CONTROLLED_VALUE_OPTIONS]);
  for (let index = 0; index < argv.length;) {
    const flag = argv[index];
    if (!flag?.startsWith('--') || flag.includes('=')) fail('E2E_RUN_ARGUMENT_INVALID', 'Arguments must use supported flags without equals syntax.');
    const key = flag.slice(2);
    if (PRODUCTION_FLAGS.has(key)) {
      if (key === 'require-ready' && !allowReady || values.has(key)) fail('E2E_RUN_ARGUMENT_INVALID', `--${key} is invalid or repeated.`);
      values.set(key, true);
      index += 1;
      continue;
    }
    const value = argv[index + 1];
    if (!allowedValues.has(key) || !value || value.startsWith('--') || values.has(key)) {
      fail('E2E_RUN_ARGUMENT_INVALID', 'Each supported --flag <value> is required exactly once.');
    }
    values.set(key, value);
    index += 2;
  }
  const result = Object.fromEntries(values);
  for (const required of valueOptions) if (!Object.hasOwn(result, required)) fail('E2E_RUN_ARGUMENT_INVALID', `Missing --${required}.`);
  return result;
}

function validateMode(options, { requireProduction, allowReady }) {
  const mode = options['input-mode'];
  if (!['CONTROLLED_TEST', 'PRODUCTION_HANDOFF'].includes(mode)) {
    fail('E2E_RUN_INPUT_CLASS_INVALID', 'input-mode must be CONTROLLED_TEST or PRODUCTION_HANDOFF.');
  }
  const active = mode === 'PRODUCTION_HANDOFF' ? PRODUCTION_VALUE_OPTIONS : CONTROLLED_VALUE_OPTIONS;
  const inactive = mode === 'PRODUCTION_HANDOFF' ? CONTROLLED_VALUE_OPTIONS : PRODUCTION_VALUE_OPTIONS;
  for (const key of active) if (!Object.hasOwn(options, key)) fail('E2E_RUN_ARGUMENT_INVALID', `Missing --${key}.`);
  for (const key of inactive) if (Object.hasOwn(options, key)) fail('E2E_RUN_INPUT_CLASS_INVALID', `--${key} is invalid for ${mode}.`);
  if (mode === 'PRODUCTION_HANDOFF' && requireProduction && options['require-production'] !== true) {
    fail('E2E_RUN_ARGUMENT_INVALID', '--require-production is required for PRODUCTION_HANDOFF.');
  }
  if (mode === 'CONTROLLED_TEST' && (options['require-production'] || options['require-ready'])) {
    fail('E2E_RUN_INPUT_CLASS_INVALID', 'Controlled mode cannot use production or ready flags.');
  }
  if (options['require-ready'] && (!allowReady || mode !== 'PRODUCTION_HANDOFF')) {
    fail('E2E_RUN_INPUT_CLASS_INVALID', '--require-ready is valid only for production verification.');
  }
}

function assertPortPair(options) {
  for (const key of ['runtime-port', 'web-port']) {
    const value = options[key];
    if (!/^(?:[1-9][0-9]{3,4})$/.test(value) || Number(value) > 65535) {
      fail('E2E_RUN_ARGUMENT_INVALID', `--${key} must be in 1024..65535.`);
    }
  }
  if (options['runtime-port'] === options['web-port']) {
    fail('E2E_RUN_ARGUMENT_INVALID', 'runtime-port and web-port must differ.');
  }
}

function isInside(root, child) {
  const relation = relative(resolve(root), resolve(child));
  return relation !== '' && relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
}

function fail(code, message, exitCode) {
  throw new E2eRunInputError(code, message, exitCode);
}
