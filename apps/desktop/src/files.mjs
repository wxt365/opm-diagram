import { mkdir, writeFile, rename, readFile, lstat, readdir, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
}
export async function json(path, fallback) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.size > 16 * 1024 * 1024) throw new Error('配置或清单不是受支持的普通文件。');
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

/** 限制并发文件校验，避免串行扫描拖慢启动，也不同时打开全部文件。 */
export async function mapFiles(values, action, concurrency = 8) {
  let next = 0; const results = new Array(values.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    for (;;) { const index = next++; if (index >= values.length) return; results[index] = await action(values[index]); }
  }));
  return results;
}

/** 备份与资源装配不跟随链接，避免读取受控目录外的数据。 */
export async function tree(root) {
  const base = await realpath(root), files = [];
  async function walk(directory, prefix = '') {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name), relative = prefix + name, info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`目录包含不受支持的符号链接：${relative}`);
      if (info.isDirectory()) await walk(path, relative + '/');
      else if (info.isFile()) files.push({ path: relative, size: info.size });
      else throw new Error('目录包含不受支持的文件类型。');
    }
  }
  await walk(base); return files;
}
