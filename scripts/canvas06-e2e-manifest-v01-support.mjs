import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, open, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { E2eManifestInputError } from './canvas06-e2e-manifest-v01-input.mjs';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function jcs(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('E2E_MANIFEST_INTERNAL_ERROR', 'JCS does not permit non-finite numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`;
  }
  fail('E2E_MANIFEST_INTERNAL_ERROR', 'JCS does not permit undefined values.');
}

export function safeRelativePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !isAbsolute(value)
    && !value.includes('\\')
    && value.split('/').every(part => part && part !== '.' && part !== '..');
}

export function resolveInside(root, value, code = 'E2E_MANIFEST_INPUT_REF_MISMATCH') {
  if (!safeRelativePath(value)) fail(code, 'Path must be a safe relative path.');
  const output = resolve(root, value);
  const relation = relative(resolve(root), output);
  if (!relation || relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) fail(code, 'Path escapes its root.');
  return output;
}

export async function assertRegularFile(path, code = 'E2E_MANIFEST_INPUT_REF_MISMATCH') {
  let details;
  try { details = await lstat(path); } catch { fail(code, 'Expected a non-symlink regular file.'); }
  if (details.isSymbolicLink() || !details.isFile() || details.nlink !== 1) fail(code, 'Expected a non-linked regular file.');
  return details;
}

export async function assertDirectory(path, code = 'E2E_MANIFEST_INPUT_REF_MISMATCH') {
  let details;
  try { details = await lstat(path); } catch { fail(code, 'Expected a non-symlink directory.'); }
  if (details.isSymbolicLink() || !details.isDirectory()) fail(code, 'Expected a non-symlink directory.');
  return details;
}

export async function readJson(path, code = 'E2E_MANIFEST_INPUT_REF_MISMATCH') {
  await assertRegularFile(path, code);
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { fail(code, 'Expected valid JSON.'); }
}

export async function fileRef(path, root, kind, code = 'E2E_MANIFEST_INPUT_REF_MISMATCH') {
  await assertRegularFile(path, code);
  const bytes = await readFile(path);
  const relativePath = relative(resolve(root), resolve(path)).split(sep).join('/');
  if (!safeRelativePath(relativePath)) fail(code, 'File reference escapes its root.');
  return { kind, path: relativePath, byte_length: bytes.length, sha256: sha256(bytes) };
}

export async function copyRegularFile({ source, destinationRoot, destination, kind, code = 'E2E_MANIFEST_IO_ERROR' }) {
  await assertRegularFile(source, code);
  const output = resolveInside(destinationRoot, destination, code);
  await mkdir(resolve(output, '..'), { recursive: true });
  const bytes = await readFile(source);
  await writeFile(output, bytes, { flag: 'wx' });
  return { kind, path: destination, byte_length: bytes.length, sha256: sha256(bytes) };
}

export async function writeBytes({ bytes, destinationRoot, destination, kind, code = 'E2E_MANIFEST_IO_ERROR' }) {
  const output = resolveInside(destinationRoot, destination, code);
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, bytes, { flag: 'wx' });
  return { kind, path: destination, byte_length: bytes.length, sha256: sha256(bytes) };
}

export async function verifyFileRef({ root, reference, code = 'E2E_MANIFEST_INPUT_REF_MISMATCH' }) {
  if (!reference || !safeRelativePath(reference.path)) fail(code, 'File reference is invalid.');
  const path = resolveInside(root, reference.path, code);
  await assertRegularFile(path, code);
  const bytes = await readFile(path);
  if (bytes.length !== reference.byte_length || sha256(bytes) !== reference.sha256) fail(code, 'File reference does not match raw bytes.');
  return { path, bytes };
}

export async function copyTree({ sourceRoot, destinationRoot, destination = 'inputs/build/web-dist', code = 'E2E_MANIFEST_SOURCE_BUILD_INVALID' }) {
  await assertDirectory(sourceRoot, code);
  const entries = await listTree(sourceRoot, code);
  const destinationPath = resolveInside(destinationRoot, destination, code);
  await mkdir(destinationPath, { recursive: true });
  for (const entry of entries) {
    const source = resolveInside(sourceRoot, entry.path, code);
    const output = resolveInside(destinationPath, entry.path, code);
    await mkdir(resolve(output, '..'), { recursive: true });
    await cp(source, output, { errorOnExist: true, force: false, dereference: false });
  }
  return treeRef(destinationRoot, destination, code);
}

export async function treeRef(root, directory, code = 'E2E_MANIFEST_INPUT_REF_MISMATCH') {
  const target = resolveInside(root, directory, code);
  const entries = await listTree(target, code);
  const payload = entries.map(item => ({ path: item.path, byte_length: item.byte_length, sha256: item.sha256 }));
  return {
    kind: 'WEB_DIST_TREE',
    path: directory,
    byte_length: payload.reduce((total, item) => total + item.byte_length, 0),
    sha256: sha256(Buffer.from(jcs(payload), 'utf8'))
  };
}

export async function listTree(root, code = 'E2E_MANIFEST_INPUT_REF_MISMATCH') {
  await assertDirectory(root, code);
  const result = [];
  await visit(root, '');
  return result.sort((left, right) => left.path.localeCompare(right.path, 'en'));

  async function visit(directory, prefix) {
    const children = await readdir(directory, { withFileTypes: true });
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const itemPath = prefix ? `${prefix}/${child.name}` : child.name;
      const absolutePath = resolve(directory, child.name);
      const details = await lstat(absolutePath);
      if (details.isSymbolicLink() || !details.isFile() && !details.isDirectory()) fail(code, 'Tree contains an unsafe entry.');
      if (details.isDirectory()) await visit(absolutePath, itemPath);
      else {
        if (details.nlink !== 1) fail(code, 'Tree contains a hard-linked file.');
        const bytes = await readFile(absolutePath);
        result.push({ path: itemPath, byte_length: bytes.length, sha256: sha256(bytes) });
      }
    }
  }
}

export function archiveEntryPath(entry) {
  const encoded = Buffer.from(entry, 'utf8').toString('hex').toUpperCase();
  let result = '';
  for (let index = 0; index < encoded.length; index += 2) {
    const byte = Number.parseInt(encoded.slice(index, index + 2), 16);
    const character = String.fromCharCode(byte);
    result += /^[A-Za-z0-9._-]$/.test(character) ? character : `%${encoded.slice(index, index + 2)}`;
  }
  return `inputs/upstream/fixtures/${result}.json`;
}

export function archiveRef({ destination, bytes, bundleSha256, archiveEntry }) {
  return {
    path: destination,
    byte_length: bytes.length,
    sha256: sha256(bytes),
    bundle_sha256: bundleSha256,
    archive_entry_path: archiveEntry
  };
}

export async function fsyncTree(root) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) await fsyncTree(path);
    else if (entry.isFile()) await fsyncPath(path);
  }
  await fsyncPath(root);
}

export async function fsyncPath(path) {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function sameRawRef({ externalRoot, externalRef, finalRoot, finalRef, code = 'E2E_MANIFEST_INPUT_REF_MISMATCH' }) {
  const external = await verifyFileRef({ root: externalRoot, reference: externalRef, code });
  const final = await verifyFileRef({ root: finalRoot, reference: finalRef, code });
  if (!external.bytes.equals(final.bytes)) fail(code, 'Final raw copy differs from the exact external input.');
}

export function fail(code, message) {
  throw new E2eManifestInputError(code, message);
}
