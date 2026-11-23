import { join, resolve, sep } from 'node:path';
import { lstat, realpath } from 'node:fs/promises';
import { json, hashFile, mapFiles } from './files.mjs';

export async function verifyResources(directory, platform = process.platform, arch = process.arch, { startup = false } = {}) {
  const root = await realpath(directory);
  const manifest = await json(join(root, 'manifest.json'), null);
  if (manifest?.format !== 'OPM-DESKTOP-RESOURCES' || manifest.formatVersion !== 1 || manifest.platform !== platform || manifest.arch !== arch
    || !/^[a-f0-9]{64}$/.test(manifest.schemaDigest) || !/^\d+\.\d+\.\d+$/.test(manifest.appVersion)
    || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 100000) throw new Error('客户端资源不完整或平台架构不匹配，请重新安装。');
  const names = new Set();
  for (const item of manifest.files) {
    if (typeof item.path !== 'string' || item.path.startsWith('/') || item.path.includes('\\') || item.path.split('/').some(part => !part || part === '.' || part === '..')
      || !/^[a-f0-9]{64}$/.test(item.sha256) || names.has(item.path)) throw new Error('资源清单无效。');
    names.add(item.path);
  }
  const java = platform === 'win32' ? 'jre/bin/java.exe' : 'jre/bin/java';
  const node = platform === 'win32' ? 'node/node.exe' : 'node/node';
  // 构建及打包逐文件全量校验。启动只复核入口、业务资产和核心二进制，避免每次扫描数万个第三方文件。
  const critical = path => [java, node, 'runtime/local-runtime.jar', 'jre/lib/modules', 'jre/release'].includes(path)
    || /^(?:apps\/web\/dist|apps\/assistant\/(?:src|skills)|docs\/contracts)\//.test(path)
    || path.startsWith('profiles/') && !path.includes('/golden/');
  await mapFiles(startup ? manifest.files.filter(item => critical(item.path)) : manifest.files, async item => {
    const path = resolve(root, item.path), physical = await realpath(path), info = await lstat(path);
    if (!physical.startsWith(root + sep) || !info.isFile() || info.size !== item.size || await hashFile(path) !== item.sha256) throw new Error(`客户端资源校验失败：${item.path}`);
  });
  for (const name of [java, node, 'runtime/local-runtime.jar', 'apps/web/dist/index.html', 'apps/assistant/src/desktop-entry.mjs'])
    if (!names.has(name)) throw new Error(`缺少客户端资源：${name}`);
  return { root, manifest, java: join(root, java), node: join(root, node) };
}
