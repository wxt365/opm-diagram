import { cp, mkdir, readFile, rm, realpath, access } from 'node:fs/promises';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { atomicJson, tree, hashFile, mapFiles } from '../src/files.mjs';
import { verifyResources } from '../src/resources.mjs';

const exec = promisify(execFile), here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, '../../..'), destination = resolve(here, '../.runtime/opm');
export const forbidden = path => /(?:^|\/)(?:\.env[^/]*|credentials\.json|runtime-data|\.git|\.npmrc)(?:\/|$)/i.test(path.replaceAll('\\', '/'));
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function copy(source, target, excludeModules = false) {
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, dereference: true, filter: path => !forbidden(relative(source, path))
    && !(excludeModules && /(?:^|[\\/])node_modules(?:[\\/]|$)/.test(relative(source, path))) });
}
async function copyProfiles() {
  const root = join(repository, 'packages/profiles');
  // 只装配正式包/版本入口，排除 handoff 和 Golden 夹带的测试快照。
  for (const file of (await tree(root)).filter(file => /^[^/]+\/[^/]+\/profile\.json$/.test(file.path))) {
    const folder = dirname(file.path), source = join(root, file.path);
    const profile = JSON.parse(await readFile(source, 'utf8'));
    await copy(source, join(destination, 'profiles', file.path));
    for (const item of profile.manifest.entries) {
      if (typeof item.logical_path !== 'string' || item.logical_path.includes('\\') || item.logical_path.startsWith('/') || item.logical_path.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('Profile 清单路径无效。');
      const input = join(root, folder, item.logical_path);
      if (await hashFile(input) !== item.digest.digest) throw new Error('Profile 资产与声明摘要不一致。');
      await copy(input, join(destination, 'profiles', folder, item.logical_path));
    }
  }
}

/** 按 Node 实际解析结果收集生产依赖，保留嵌套版本，不复制工作区和开发依赖。 */
async function productionDependencies(importer, collected = new Set()) {
  const pkg = JSON.parse(await readFile(join(importer, 'package.json'), 'utf8'));
  const require = createRequire(join(importer, 'package.json'));
  const optional = new Set(Object.keys(pkg.optionalDependencies ?? {}));
  for (const [name, info] of Object.entries(pkg.peerDependenciesMeta ?? {})) if (info.optional) optional.add(name);
  for (const name of new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})])) {
    let source;
    for (const lookup of require.resolve.paths(name + '/package.json') ?? []) if (await exists(join(lookup, name, 'package.json'))) { source = await realpath(join(lookup, name)); break; }
    if (!source) { if (optional.has(name)) continue; throw new Error(`缺少生产依赖 ${name}；请先 npm install。`); }
    if (collected.has(source)) continue;
    const path = relative(repository, source);
    if (path.startsWith('..') || !path.includes('node_modules/')) throw new Error(`生产依赖不在本仓库 node_modules：${name}`);
    collected.add(source);
    await copy(source, join(destination, path), true);
    await productionDependencies(source, collected);
  }
  return collected;
}

export async function prepareResources(development = false) {
  if (!['darwin-arm64', 'darwin-x64', 'win32-x64'].includes(`${process.platform}-${process.arch}`)) throw new Error('当前平台不在桌面构建矩阵中。');
  if (!development && (!process.env.OPM_DESKTOP_JRE || !process.env.OPM_DESKTOP_NODE || !process.env.OPM_DESKTOP_RUNTIME_NOTICES)) throw new Error('发行资源须提供 OPM_DESKTOP_JRE、OPM_DESKTOP_NODE 和 OPM_DESKTOP_RUNTIME_NOTICES（运行时许可说明）。');
  let javaHome = process.env.OPM_DESKTOP_JRE ?? process.env.JAVA_HOME;
  if (!javaHome && development && process.platform === 'darwin') javaHome = (await exec('/usr/libexec/java_home', ['-v', '17'])).stdout.trim();
  if (!javaHome) throw new Error('请通过 OPM_DESKTOP_JRE 提供 Java 17 运行时目录。');
  const java = join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  const javaInfo = await exec(java, ['-XshowSettings:properties', '-version']);
  const javaText = javaInfo.stderr + javaInfo.stdout;
  const javaArch = javaText.match(/os.arch\s*=\s*(\S+)/)?.[1];
  if (!/java.specification.version\s*=\s*17\s/.test(javaText) || !({ arm64: ['aarch64', 'arm64'], x64: ['amd64', 'x86_64'] })[process.arch].includes(javaArch)) throw new Error('JRE 必须是当前架构的 Java 17。');
  const node = process.env.OPM_DESKTOP_NODE ?? process.execPath;
  const nodeInfo = JSON.parse((await exec(node, ['-p', 'JSON.stringify({version:process.versions.node,platform:process.platform,arch:process.arch})'])).stdout);
  const [nodeMajor, nodeMinor] = nodeInfo.version.split('.').map(Number);
  if (nodeInfo.platform !== process.platform || nodeInfo.arch !== process.arch || nodeMajor !== 24 || nodeMinor < 9) throw new Error('独立 Node 必须是当前平台架构的 Node 24.9 或更新的 Node 24 LTS。');
  await access(join(repository, 'apps/web/dist/index.html'));
  const jar = join(repository, 'services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar'); await access(jar);
  await rm(destination, { recursive: true, force: true }); await mkdir(destination, { recursive: true });
  await copy(javaHome, join(destination, 'jre'));
  await copy(node, join(destination, process.platform === 'win32' ? 'node/node.exe' : 'node/node'));
  await copy(jar, join(destination, 'runtime/local-runtime.jar'));
  for (const path of ['apps/web/dist', 'apps/assistant/src', 'apps/assistant/skills']) await copy(join(repository, path), join(destination, path));
  await copy(join(repository, 'apps/assistant/package.json'), join(destination, 'apps/assistant/package.json'));
  // 只携带版本化 Profile 清单及其声明资产，不打包 Golden 测试恢复数据。
  await copyProfiles();
  await copy(join(repository, 'docs/contracts/schemas/opm-draft-workspace-v02.schema.json'), join(destination, 'docs/contracts/schemas/opm-draft-workspace-v02.schema.json'));
  const dependencies = await productionDependencies(join(repository, 'apps/assistant'));
  if (process.env.OPM_DESKTOP_RUNTIME_NOTICES) await copy(process.env.OPM_DESKTOP_RUNTIME_NOTICES, join(destination, 'RUNTIME-NOTICES.txt'));
  else await atomicJson(join(destination, 'DEVELOPMENT-RUNTIME.json'), { note: '宿主运行时仅用于开发验证，禁止用于发行包。' });
  const files = await mapFiles(await tree(destination), async file => {
    if (forbidden(file.path)) throw new Error('资源包含禁止打包的配置或数据。');
    return { ...file, sha256: await hashFile(join(destination, file.path)) };
  });
  const migrations = await tree(join(repository, 'services/local-runtime/src/main/resources/db/migration'));
  const digest = createHash('sha256');
  for (const file of migrations.filter(file => file.path.startsWith('sqlite'))) { digest.update(file.path); digest.update(await readFile(join(repository, 'services/local-runtime/src/main/resources/db/migration', file.path))); }
  const version = JSON.parse(await readFile(join(repository, 'apps/desktop/package.json'), 'utf8')).version;
  await atomicJson(join(destination, 'manifest.json'), { format: 'OPM-DESKTOP-RESOURCES', formatVersion: 1, platform: process.platform, arch: process.arch,
    appVersion: version, developmentRuntime: development, sourceRevision: (await exec('git', ['rev-parse', 'HEAD'], { cwd: repository })).stdout.trim(),
    sourceDirty: Boolean((await exec('git', ['status', '--porcelain'], { cwd: repository })).stdout.trim()), lockDigest: await hashFile(join(repository, 'package-lock.json')),
    schemaDigest: digest.digest('hex'), versions: { java: javaText.match(/java.runtime.version\s*=\s*(\S+)/)?.[1], node: nodeInfo.version }, files });
  await verifyResources(destination);
  console.log(`桌面资源已校验：${process.platform}-${process.arch}，${dependencies.size} 个生产依赖，${files.length} 个文件。`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareResources(process.argv.includes('--dev-runtime'));
