import { _electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, readdir, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// 可指定本机已有 Electron，只用于隔离开发验证；发行资源仍由 Forge 校验。
const electron = process.env.OPM_DESKTOP_ELECTRON_EXECUTABLE ?? (await import('electron')).default;
const root = await mkdtemp(join(tmpdir(), 'opm-desktop-smoke-'));
await mkdir(join(root, 'backups'));
const packagedExecutable = process.env.OPM_PACKAGED_EXECUTABLE;
const isolatedHome = join(root, '隔离主目录 space');
await mkdir(isolatedHome);
const dataRoot = packagedExecutable ? join(isolatedHome, 'Library/Application Support/OPM Studio') : join(root, '中文工作区 space');
let application, page;
const errors = [];
const launches = [];
async function launch() {
  const started = Date.now();
  const env = { ...process.env, OPM_DESKTOP_USER_DATA: dataRoot,
    ...(packagedExecutable ? { HOME: isolatedHome, CFFIXED_USER_HOME: isolatedHome } : {}) };
  if (packagedExecutable) delete env.OPM_DESKTOP_USER_DATA;
  delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
  application = await _electron.launch({ executablePath: packagedExecutable ?? electron, args: packagedExecutable ? [] : [desktop], env, timeout: 30000 });
  const native = await application.evaluate(({ app }) => {
    // 只在测试进程收集异常，让断言报告失败，避免原生错误框阻塞回归。
    globalThis.opmSmokeErrors = [];
    process.on('uncaughtException', error => globalThis.opmSmokeErrors.push(error.message));
    return { packaged: app.isPackaged, data: app.getPath('userData') };
  });
  expect(native.packaged).toBe(!!packagedExecutable);
  expect(native.data).toBe(await realpath(dataRoot));
  page = await application.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  application.process().stderr.on('data', data => { if (/客户端启动失败/.test(String(data))) process.stderr.write(data); });
  // 测试期间避免启动错误对话框阻塞自动化；正常产品仍保留原生提示。
  await application.evaluate(({ dialog }) => {
    dialog.showErrorBox = (title, content) => console.error(title, content);
    const original = dialog.showMessageBox.bind(dialog);
    dialog.showMessageBox = async (...args) => {
      const options = args.at(-1);
      if (options.title === '客户端启动失败') { console.error(options.title, options.message); return { response: 2 }; }
      return original(...args);
    };
  });
  await page.waitForURL(/http:\/\/127\.0\.0\.1:\d+\/projects/, { timeout: 120000 });
  await expect(page.getByTestId('p01-create-project')).toBeVisible();
  launches.push(Date.now() - started);
  console.log(`客户端启动完成（独立 SQLite，无 Key，${launches.at(-1)}ms）。`);
}
async function quit() {
  expect(await application.evaluate(() => globalThis.opmSmokeErrors)).toEqual([]);
  const child = application.process(), closed = once(child, 'exit');
  await application.evaluate(({ app }) => { app.quit(); });
  const timer = setTimeout(() => child.kill(), 45000);
  const [code] = await closed; clearTimeout(timer); expect(code).toBe(0);
}
async function edit(action) {
  const before = await page.getByTestId('hs-draft-identity').innerText();
  await action(); await expect(page.getByTestId('hs-draft-identity')).not.toHaveText(before);
  await expect(page.getByTestId('hs-save')).toBeEnabled();
}
try {
  await launch();
  // 覆盖独立关闭设置窗口：关闭后主窗口和 IPC 仍须可用，且允许重新打开。
  for (let attempt = 0; attempt < 2; attempt++) {
    const opened = application.waitForEvent('window');
    await page.evaluate(() => window.opmDesktop.openSettings());
    const settings = await opened; await settings.waitForURL('**/desktop/settings.html');
    const closed = settings.waitForEvent('close');
    await settings.close(); await closed;
    expect((await page.evaluate(() => window.opmDesktop.getState())).version).toBeTruthy();
    expect(await application.evaluate(() => globalThis.opmSmokeErrors)).toEqual([]);
  }
  await page.getByTestId('p01-create-project').click(); await page.getByTestId('ov01-project-name').fill('客户端隔离验证');
  await page.getByRole('button', { name: '创建并继续', exact: true }).click();
  await page.getByTestId('p02-create-model').click(); await page.getByTestId('ov02-model-name').fill('桌面持久化模型');
  await page.getByRole('button', { name: '创建并打开工作台', exact: true }).click();
  await expect(page.getByTestId('p03-tool-object')).toBeEnabled();
  await edit(() => page.getByTestId('p03-tool-object').click());
  await edit(() => page.getByTestId('p03-tool-process').click());
  await expect(page.locator('.x6-node')).toHaveCount(2);
  await page.getByTestId('p03-tool-select').click();
  await page.locator('.x6-node').first().dblclick({ position: { x: 12, y: 12 } });
  await page.getByTestId('p03-name-editor').fill('桌面测试对象');
  await edit(() => page.keyboard.press('Enter'));
  await page.getByTestId('hs-save').click(); await expect(page.getByTestId('hs-save-state')).toHaveText('已手动保存');
  const workbench = page.url(), origin = new URL(workbench).origin;
  await page.screenshot({ path: join(root, 'canvas.png') });
  const opened = application.waitForEvent('window');
  await page.evaluate(() => window.opmDesktop.openSettings());
  const settings = await opened; await settings.waitForURL('**/desktop/settings.html');
  await expect(settings.locator('#assistant')).toHaveText('未配置');
  await expect(settings.locator('[name=baseURL]')).toHaveValue('https://api.deepseek.com');
  await settings.screenshot({ path: join(root, 'settings.png') });
  // 假 Key 仅验证本地助手进程装配与握手，不发起外部模型请求。
  const state = await settings.evaluate(async () => { await window.opmDesktop.saveSettings({ provider: 'deepseek', baseURL: 'https://api.deepseek.com', model: 'deepseek-flash', key: 'fake-desktop-smoke-key', persist: false }); return window.opmDesktop.getState(); });
  expect(state.assistant).toBe('READY');
  await settings.evaluate(() => window.opmDesktop.clearKey());
  await application.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, join(root, 'backups'));
  const backup = await settings.evaluate(() => window.opmDesktop.backup()); expect(backup.path).toBeTruthy();
  await page.waitForURL('**/projects');
  const runtimeReady = await readdir(join(dataRoot, 'ready'));
  const children = await Promise.all(runtimeReady.map(async file => JSON.parse(await readFile(join(dataRoot, 'ready', file), 'utf8'))));
  await quit();
  for (const child of children) expect(() => process.kill(child.pid, 0)).toThrow();
  await launch(); expect(new URL(page.url()).origin).toBe(origin);
  await page.goto(workbench); await expect(page.locator('.x6-node')).toHaveCount(2);
  await expect(page.locator('.x6-node').filter({ hasText: '桌面测试对象' })).toHaveCount(1);
  // 恢复前再添加内容，确认实际恢复到备份的两节点版本。
  await edit(() => page.getByTestId('p03-tool-object').click()); await expect(page.locator('.x6-node')).toHaveCount(3);
  await page.getByTestId('hs-save').click(); await expect(page.getByTestId('hs-save-state')).toHaveText('已手动保存');
  await application.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); }, backup.path);
  const nextWindow = application.waitForEvent('window'); await page.evaluate(() => window.opmDesktop.openSettings());
  const restoreSettings = await nextWindow; await restoreSettings.waitForURL('**/desktop/settings.html');
  const restored = await restoreSettings.evaluate(() => window.opmDesktop.restore()); expect(restored.path).toBeTruthy();
  await page.waitForURL('**/projects'); await page.goto(workbench); await expect(page.locator('.x6-node')).toHaveCount(2);
  await page.getByTestId('p03-tool-select').click();
  await page.locator('.x6-node').filter({ hasText: '桌面测试对象' }).dblclick({ position: { x: 12, y: 12 } });
  await page.getByTestId('p03-name-editor').fill('退出自动保存对象');
  await quit();
  await launch(); await page.goto(workbench);
  await expect(page.locator('.x6-node').filter({ hasText: '退出自动保存对象' })).toHaveCount(1);
  await quit();
  expect(errors).toEqual([]);
  await writeFile(join(root, 'result.json'), JSON.stringify({ status: 'PASSED', packaged: !!packagedExecutable, launchTimesMs: launches, tests: ['设置窗口重复关闭与重开无异常', '真实画布创建对象与过程', '改名及保存', '无 Key 核心可用', '独立 Node 助手握手', '设置界面', '停服备份', '重开持久化与稳定 origin', '真实 SQLite 恢复', '退出提交未完成改名', '中文及空格数据路径', '退出回收子进程'], platform: process.platform, arch: process.arch }, null, 2));
  console.log(`客户端 smoke 通过，证据目录：${root}`);
} catch (error) {
  console.error(`客户端 smoke 失败；隔离数据与日志：${root}`);
  if (page && !page.isClosed()) await page.screenshot({ path: join(root, 'failure.png') }).catch(() => {});
  await application?.close().catch(() => {});
  throw error;
}
