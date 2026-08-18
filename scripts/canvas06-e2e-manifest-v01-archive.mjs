import { execFile as execFileCallback } from 'node:child_process';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { E2eManifestInputError } from './canvas06-e2e-manifest-v01-input.mjs';

const execFile = promisify(execFileCallback);
const MAX_ENTRIES = 4096;
const MAX_PATH_BYTES = 512;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;

export async function listSafeArchiveEntries({ jarPath, archivePath }) {
  let stdout;
  try {
    ({ stdout } = await execFile(jarPath, ['--list', '--file', archivePath], { encoding: 'utf8', maxBuffer: 1024 * 1024 }));
  } catch (error) {
    fail('E2E_MANIFEST_ARCHIVE_INVALID', `Cannot list Evidence Bundle: ${error.message}`);
  }
  const entries = stdout.split(/\r?\n/).filter(Boolean);
  validateArchiveEntries(entries, { allowDirectories: true });
  return entries;
}

export async function materializeArchiveEntries({ jarPath, archivePath, entries, destination, allowExisting = false }) {
  validateArchiveEntries(entries);
  const root = resolve(destination);
  if (!allowExisting) await mkdir(root, { recursive: false });
  else {
    const details = await lstatOrFail(root, 'archive extraction root');
    if (details.isSymbolicLink() || !details.isDirectory()) fail('E2E_MANIFEST_ARCHIVE_INVALID', 'Archive extraction root is unsafe.');
  }
  try {
    await execFile(jarPath, ['--extract', '--file', archivePath, ...entries], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  } catch (error) {
    fail('E2E_MANIFEST_ARCHIVE_INVALID', `Cannot extract Evidence Bundle entries: ${error.message}`);
  }

  let total = 0;
  const result = new Map();
  for (const entry of entries) {
    const path = resolve(root, entry);
    if (!isInside(root, path)) fail('E2E_MANIFEST_ARCHIVE_INVALID', 'Extracted entry escaped the temporary root.');
    const info = await lstatOrFail(path, entry);
    if (info.isSymbolicLink() || !info.isFile()) fail('E2E_MANIFEST_ARCHIVE_INVALID', `Archive entry is not a regular file: ${entry}`);
    if (info.size > MAX_ENTRY_BYTES) fail('E2E_MANIFEST_ARCHIVE_INVALID', `Archive entry exceeds 64 MiB: ${entry}`);
    total += info.size;
    if (total > MAX_TOTAL_BYTES) fail('E2E_MANIFEST_ARCHIVE_INVALID', 'Archive materialization exceeds 512 MiB.');
    result.set(entry, await readFile(path));
  }
  return result;
}

export function validateArchiveEntries(entries, { allowDirectories = false } = {}) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_ENTRIES) fail('E2E_MANIFEST_ARCHIVE_INVALID', 'Archive entry count is invalid.');
  const seen = new Set();
  for (const entry of entries) {
    if (typeof entry !== 'string' || Buffer.byteLength(entry, 'utf8') > MAX_PATH_BYTES || !isSafeEntry(entry, allowDirectories) || seen.has(entry)) {
      fail('E2E_MANIFEST_ARCHIVE_INVALID', 'Archive entries must be unique safe UTF-8 relative paths.');
    }
    seen.add(entry);
  }
}

function isSafeEntry(value, allowDirectories) {
  const normalized = allowDirectories && value.endsWith('/') ? value.slice(0, -1) : value;
  return normalized.length > 0 && !isAbsolute(normalized) && !normalized.includes('\\') && normalized.split('/').every(part => part && part !== '.' && part !== '..');
}

function isInside(root, path) {
  const relation = relative(root, path);
  return relation !== '' && relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
}

async function lstatOrFail(path, entry) {
  try {
    return await lstat(path);
  } catch {
    fail('E2E_MANIFEST_ARCHIVE_INVALID', `Archive entry was not extracted: ${entry}`);
  }
}

function fail(code, message) {
  throw new E2eManifestInputError(code, message);
}
