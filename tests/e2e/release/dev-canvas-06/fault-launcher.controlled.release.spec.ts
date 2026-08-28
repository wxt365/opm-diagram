import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { chromium, test } from '@playwright/test';

import { releaseLaunchArgs } from './playwright.release.config';

const CONTEXT_KEY = 'OPM_CANVAS06_FAULT_CONTROL_CONTEXT_REF';
let canonicalizeJcs: (value: unknown) => string;

test('受控 Fault Launcher 只经 Runner 生命周期接口执行', async () => {
  const [{ runControlledLifecycleSession }, jcs, { executeCase }] = await Promise.all([
    import('../../../../scripts/release-canvas06-e2e-run.mjs'),
    import('../../../../scripts/canvas06-rfc8785.mjs'),
    import('./drivers/common-driver.mjs')
  ]);
  canonicalizeJcs = jcs.canonicalizeJcs;
  const context = await readInvocationContext();
  const manifest = await readCanonicalReference(context.manifest_root_realpath, context.manifest_ref);
  const descriptor = await readCanonicalReference(context.controlled_bundle_root_realpath, context.preflight_descriptor_ref);
  const handlers = buildCycleHandlers({ context, manifest, executeCase });
  const result = await runControlledLifecycleSession({ invocation_context: context, manifest, preflight_descriptor: descriptor, cycle_handlers: handlers });
  if (result.status !== 'PASS_MATCHED') throw new Error('Controlled Fault Launcher 返回 FAILED Artifact。');
});

async function readInvocationContext() {
  const raw = process.env[CONTEXT_KEY];
  if (typeof raw !== 'string' || raw.length === 0 || raw.includes('\n') || raw.includes('\r')) throw new Error('受控 Context 环境变量缺失。');
  const reference = parseCanonical(raw);
  if (!plainObject(reference) || !sameKeys(reference, ['kind', 'path', 'byte_length', 'sha256']) || reference.kind !== 'CONTROLLED_PLAYWRIGHT_CONTEXT'
      || !absolutePath(reference.path) || !Number.isSafeInteger(reference.byte_length) || reference.byte_length < 1 || !digest(reference.sha256)) throw new Error('受控 Context 引用无效。');
  const bytes = await readFile(reference.path);
  if (bytes.length !== reference.byte_length || sha(bytes) !== reference.sha256 || bytes.at(-1) !== 0x0a) throw new Error('受控 Context 原始字节漂移。');
  const context = parseCanonical(bytes.toString('utf8'));
  if (!plainObject(context) || !sameKeys(context, [
    'schema_id', 'schema_version', 'controlled_run_id', 'source_root_realpath', 'controlled_bundle_root_realpath', 'manifest_root_realpath', 'manifest_ref', 'profile_asset_root_realpath',
    'java_executable_ref', 'browser_executable_ref', 'fixed_handoff_ref', 'activation_input_root_realpath', 'attempt_parent_realpath', 'process_control_parent_realpath',
    'evidence_staging_root_realpath', 'preflight_descriptor_ref', 'preflight_report_ref', 'execution_schedule', 'context_payload_sha256'
  ])) throw new Error('受控 Context 字段不闭合。');
  if (context.schema_id !== 'OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-PLAYWRIGHT-CONTEXT-001' || context.schema_version !== '0.1'
      || !Array.isArray(context.execution_schedule) || context.execution_schedule.length !== 12 || context.context_payload_sha256 !== sha(Buffer.from(canonicalizeJcs(without(context, 'context_payload_sha256')), 'utf8'))) {
    throw new Error('受控 Context 身份不闭合。');
  }
  return Object.freeze(context);
}

function buildCycleHandlers({ context, manifest, executeCase }: { context: any; manifest: any; executeCase: any }) {
  const handlers: Record<string, { INITIAL: ({ origin, observation_sink }: any) => Promise<undefined>; REOPEN: ({ origin, observation_sink }: any) => Promise<undefined> }> = {};
  for (const schedule of context.execution_schedule) {
    if (!handlers[schedule.schedule_id]) handlers[schedule.schedule_id] = {} as any;
    const caseEntry = manifest.cases?.find((entry: any) => entry?.case_id === schedule.case_id);
    if (!caseEntry) throw new Error('Context schedule 未绑定 Manifest case。');
    handlers[schedule.schedule_id][schedule.process_cycle] = async ({ origin, observation_sink }) => {
      const browser = await chromium.launch({ executablePath: context.browser_executable_ref.path, args: [...releaseLaunchArgs] });
      const browserContext = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
      const page = await browserContext.newPage();
      let closed = false;
      try {
        observation_sink.attachBrowserPage(page);
        await page.goto(origin, { waitUntil: 'domcontentloaded' });
        await executeCase({ page, case_entry: caseEntry, attempt_identity: Object.freeze({ case_id: schedule.case_id, attempt_ordinal: schedule.attempt_ordinal, process_cycle: schedule.process_cycle }), observation_sink, precondition_client: observation_sink.precondition_client });
      } finally {
        await page.close();
        await browserContext.close();
        await browser.close();
        await observation_sink.confirmBrowserClosed({ browser, context: browserContext, page });
        closed = true;
      }
      if (!closed) throw new Error('Browser 关闭证明未完成。');
      return undefined;
    };
  }
  if (Object.keys(handlers).length !== 6 || Object.values(handlers).some(value => typeof value.INITIAL !== 'function' || typeof value.REOPEN !== 'function')) throw new Error('受控 handler map 不完整。');
  return Object.freeze(Object.fromEntries(Object.entries(handlers).map(([id, value]) => [id, Object.freeze(value)])));
}

async function readCanonicalReference(root: string, reference: any) {
  if (!plainObject(reference) || !safeRelative(reference.path)) throw new Error('Context raw reference 无效。');
  const path = resolve(root, reference.path);
  const bytes = await readFile(path);
  if (bytes.length !== reference.byte_length || sha(bytes) !== reference.sha256 || bytes.at(-1) !== 0x0a) throw new Error('Context raw reference 漂移。');
  return parseCanonical(bytes.toString('utf8'));
}

function parseCanonical(raw: string) { const value = JSON.parse(raw); if (`${canonicalizeJcs(value)}\n` !== (raw.endsWith('\n') ? raw : `${raw}\n`)) throw new Error('JSON 不是 canonical JCS。'); return value; }
function sameKeys(value: object, keys: string[]) { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function plainObject(value: unknown): value is Record<string, any> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function absolutePath(value: unknown): value is string { return typeof value === 'string' && isAbsolute(value) && resolve(value) !== resolve('/'); }
function safeRelative(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') && value.split('/').every(part => part && part !== '.' && part !== '..'); }
function digest(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function sha(value: Buffer) { return createHash('sha256').update(value).digest('hex'); }
function without(value: Record<string, any>, key: string) { const copy = { ...value }; delete copy[key]; return copy; }
