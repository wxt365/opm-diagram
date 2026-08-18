import { randomBytes } from 'node:crypto';
import { lstat, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { fsyncPath, fsyncTree } from './canvas06-e2e-manifest-v01-support.mjs';
import { E2eRunInputError } from './canvas06-e2e-run-input.mjs';

export async function commitReportRoot({ outputRoot, reportRoot, write, checkpoint, syncTree = fsyncTree }) {
  const root = await assertOutputRoot(outputRoot);
  const finalRoot = resolve(reportRoot);
  const parent = await ensureFinalParent(root, finalRoot);
  if (await exists(finalRoot)) fail('E2E_RUN_OUTPUT_NOT_FRESH', 'Final report root already exists.');
  await rejectAbandonedStaging(parent, basename(finalRoot));
  const staging = resolve(parent, `.${basename(finalRoot)}.tmp-${randomBytes(16).toString('hex')}`);
  try {
    await mkdir(staging, { recursive: false });
    await checkpoint?.('STAGING_CREATED');
    await write(staging);
    await checkpoint?.('STAGING_WRITTEN');
    await syncTree(staging);
    if (await exists(finalRoot)) fail('E2E_RUN_OUTPUT_NOT_FRESH', 'Final report root appeared during staging.');
    await checkpoint?.('BEFORE_RENAME');
    await rename(staging, finalRoot);
    try {
      await fsyncPath(parent);
    } catch (error) {
      throw new E2eRunInputError('E2E_RUN_ATOMIC_COMMIT_FAILED', error.message, 4);
    }
    return finalRoot;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (error instanceof E2eRunInputError) throw error;
    throw new E2eRunInputError('E2E_RUN_ATOMIC_COMMIT_FAILED', error.message, 4);
  }
}

async function assertOutputRoot(outputRoot) {
  const root = resolve(outputRoot);
  let details;
  try { details = await lstat(root); } catch { fail('E2E_RUN_OUTPUT_INVALID', 'output-root must already exist.'); }
  if (details.isSymbolicLink() || !details.isDirectory()) fail('E2E_RUN_OUTPUT_INVALID', 'output-root must be a non-symlink directory.');
  return root;
}

async function ensureFinalParent(outputRoot, finalRoot) {
  const parent = dirname(finalRoot);
  if (!isInside(outputRoot, parent) && parent !== outputRoot) fail('E2E_RUN_ARGUMENT_INVALID', 'Report root parent escapes output-root.');
  const segments = relative(outputRoot, parent).split(sep).filter(Boolean);
  let current = outputRoot;
  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink() || !details.isDirectory()) fail('E2E_RUN_OUTPUT_INVALID', 'Report root parent contains an unsafe path entry.');
    } catch (error) {
      if (error instanceof E2eRunInputError) throw error;
      await mkdir(current, { recursive: false });
      const details = await lstat(current);
      if (details.isSymbolicLink() || !details.isDirectory()) fail('E2E_RUN_OUTPUT_INVALID', 'Report root parent contains an unsafe path entry.');
    }
  }
  return parent;
}

async function rejectAbandonedStaging(parent, finalName) {
  const entries = await readdir(parent, { withFileTypes: true });
  if (entries.some(entry => entry.name.startsWith(`.${finalName}.tmp-`))) {
    fail('E2E_RUN_OUTPUT_NOT_FRESH', 'A crash residual exists for this report_id.');
  }
}

function isInside(root, child) {
  const relation = relative(resolve(root), resolve(child));
  return relation !== '' && relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

function fail(code, message) {
  throw new E2eRunInputError(code, message);
}
