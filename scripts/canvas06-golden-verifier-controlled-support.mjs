import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, readlink } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

export async function rootTreeDigest(root) {
  const entries = [];
  await walk(resolve(root), resolve(root), entries);
  entries.sort((left, right) => left.relative_path.localeCompare(right.relative_path));
  return sha(Buffer.from(jcs(entries), 'utf8'));
}

async function walk(root, directory, entries) {
  const children = await readdir(directory, { withFileTypes: true });
  for (const child of children) {
    const path = resolve(directory, child.name);
    const details = await lstat(path);
    const relativePath = relative(root, path).split('\\').join('/');
    if (details.isSymbolicLink()) {
      entries.push({ relative_path: relativePath, type: 'SYMLINK', link_text: await readlink(path) });
      continue;
    }
    if (details.isDirectory()) {
      entries.push({ relative_path: relativePath, type: 'DIRECTORY' });
      await walk(root, path, entries);
      continue;
    }
    if (!details.isFile()) throw new Error('GFMV controlled tree contains a non-file entity.');
    entries.push({ relative_path: relativePath, type: 'FILE', byte_length: details.size, raw_sha256: sha(await readFile(path)) });
  }
}

function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function jcs(value) { if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value); if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('JCS number is invalid.'); return JSON.stringify(value); } if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`; if (typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`; throw new Error('JCS value is invalid.'); }
