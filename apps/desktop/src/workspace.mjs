import { mkdir, rename, rm, copyFile, lstat, realpath } from 'node:fs/promises';
import { join, basename, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicJson, hashFile, json, tree } from './files.mjs';

export async function lockWorkspace(userData) {
  const directory = join(userData, 'workspace.lock');
  await mkdir(userData, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await mkdir(directory, { mode: 0o700 });
      const nonce = randomUUID(); await atomicJson(join(directory, 'owner.json'), { pid: process.pid, nonce });
      return async () => { if ((await json(join(directory, 'owner.json'), {})).nonce === nonce) await rm(directory, { recursive: true }); };
    } catch (error) {
      if (error.code !== 'EEXIST' || (await lstat(directory)).isSymbolicLink()) throw error;
      const owner = await json(join(directory, 'owner.json'), null);
      if (!owner || !Number.isInteger(owner.pid) || owner.pid < 1) throw new Error('数据目录锁尚未就绪，请检查是否有其他实例启动。');
      try { process.kill(owner.pid, 0); } catch (check) {
        if (check.code === 'ESRCH' && attempt === 0) { await rm(directory, { recursive: true }); continue; }
        throw new Error('无法确认数据目录是否正在使用。');
      }
      throw new Error('此数据目录正在被另一个客户端使用。');
    }
  }
  throw new Error('无法取得数据目录锁。');
}

const validPath = path => typeof path === 'string' && path.length < 1024 && !path.includes('\\') && !path.includes('\0')
  && !path.startsWith('/') && path.split('/').every(part => part && !/[<>:"|?*]/.test(part) && !/[. ]$/.test(part) && !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part))
  && /^(runtime-data|assistant|settings)\//.test(path) && !/(^|\/)(?:\.env[^/]*|credentials\.json)$/.test(path);

export async function backupWorkspace(workspace, destination, version) {
  const sourceRoot = await realpath(workspace), destinationRoot = await realpath(destination);
  if (destinationRoot === sourceRoot || destinationRoot.startsWith(sourceRoot + sep)) throw new Error('备份目录不能位于当前工作区内部。');
  const target = join(destination, `OPM-backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
  await mkdir(target, { recursive: false, mode: 0o700 });
  try {
    const files = [];
    for (const file of await tree(workspace)) {
      if (!validPath(file.path)) throw new Error(`工作区包含无法备份的文件：${file.path}`);
      const output = join(target, 'data', file.path); await mkdir(join(output, '..'), { recursive: true });
      await copyFile(join(workspace, file.path), output);
      files.push({ ...file, sha256: await hashFile(output) });
    }
    await atomicJson(join(target, 'manifest.json'), { format: 'OPM-DESKTOP-BACKUP', formatVersion: 1, appVersion: version, createdAt: new Date().toISOString(), files });
    return target;
  } catch (error) { await rm(target, { recursive: true, force: true }); throw error; }
}

export async function stageRestore(backup, userData, verify, appVersion) {
  const manifest = await json(join(backup, 'manifest.json'), null);
  if (manifest?.format !== 'OPM-DESKTOP-BACKUP' || manifest.formatVersion !== 1 || !Array.isArray(manifest.files)
    || manifest.files.length > 50000 || typeof manifest.appVersion !== 'string') throw new Error('备份格式不受支持。');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.appVersion) || compareVersion(manifest.appVersion, appVersion) > 0) throw new Error('备份版本无效或来自更新版本，请先升级客户端。');
  const seen = new Set(); let size = 0;
  for (const file of manifest.files) {
    const key = String(file.path).toLocaleLowerCase('en-US');
    if (!validPath(file.path) || seen.has(key) || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('备份文件清单无效。');
    seen.add(key); size += file.size;
  }
  if (size > 20 * 1024 ** 3) throw new Error('备份超过 20 GiB 恢复上限。');
  const data = join(backup, 'data');
  if (!(await lstat(data)).isDirectory()) throw new Error('备份数据目录无效，不能使用链接。');
  const actual = await tree(data);
  if (actual.length !== manifest.files.length) throw new Error('备份文件与清单不一致。');
  const staging = join(userData, `restore-staging-${randomUUID()}`); await mkdir(staging, { mode: 0o700 });
  try {
    for (const file of manifest.files) {
      const source = join(data, file.path), info = await lstat(source);
      if (!info.isFile() || info.size !== file.size || await hashFile(source) !== file.sha256) throw new Error('备份内容损坏或不完整。');
      const target = join(staging, file.path); await mkdir(join(target, '..'), { recursive: true }); await copyFile(source, target);
      if (await hashFile(target) !== file.sha256) throw new Error('备份在恢复复制期间发生变化。');
    }
    await verify(staging);
    return staging;
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
}

export function compareVersion(a, b) {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((left[i] ?? 0) !== (right[i] ?? 0)) return Math.sign((left[i] ?? 0) - (right[i] ?? 0));
  return 0;
}

export async function recoverRestore(userData) {
  const journalPath = join(userData, 'restore.json'), record = await json(journalPath, null);
  if (!record) return;
  if (!/^restore-staging-[a-f0-9-]{36}$/.test(record.staging) || !/^workspace-before-[a-f0-9-]{36}$/.test(record.previous)) throw new Error('恢复记录异常，请保留数据并联系维护者。');
  const workspace = join(userData, 'workspace'), previous = join(userData, record.previous);
  if (!await lstat(workspace).catch(() => null)) {
    if (!await lstat(previous).catch(() => null)) throw new Error('恢复中断且找不到原工作区，未初始化新库。');
    await rename(previous, workspace);
  }
  await rm(join(userData, record.staging), { recursive: true, force: true });
  await rm(journalPath);
}

/** 原目录保留为回退点；恢复中断时由 journal 找回，不做跨文件系统替换。 */
export async function commitRestore(userData, staging) {
  if (resolve(staging, '..') !== resolve(userData) || !/^restore-staging-[a-f0-9-]{36}$/.test(basename(staging))) throw new Error('恢复 staging 不属于本客户端。');
  const previous = `workspace-before-${randomUUID()}`, workspace = join(userData, 'workspace');
  await atomicJson(join(userData, 'restore.json'), { staging: basename(staging), previous });
  try { await rename(workspace, join(userData, previous)); await rename(staging, workspace); }
  catch (error) { await recoverRestore(userData); throw error; }
  await rm(join(userData, 'restore.json'));
  return join(userData, previous);
}
