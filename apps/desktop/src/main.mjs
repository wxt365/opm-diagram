import { app, BrowserWindow, Menu, ipcMain, dialog, shell, safeStorage } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, realpath, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Settings } from './settings.mjs';
import { json, atomicJson } from './files.mjs';
import { verifyResources } from './resources.mjs';
import { lockWorkspace, recoverRestore, backupWorkspace, stageRestore, commitRestore } from './workspace.mjs';
import { DesktopRuntime } from './runtime.mjs';
import { handleSquirrel } from './squirrel.mjs';

if (await handleSquirrel(process.platform, process.argv, process.execPath)) process.exit(0);

const source = dirname(fileURLToPath(import.meta.url)), uiRoot = join(source, '../ui');
app.setName('OPM Studio'); app.setAppUserModelId('org.opm.studio');
const selectedData = !app.isPackaged && process.env.OPM_DESKTOP_USER_DATA || join(app.getPath('appData'), 'OPM Studio');
await mkdir(selectedData, { recursive: true, mode: 0o700 });
const userData = await realpath(selectedData);
app.setPath('userData', userData);
await mkdir(join(userData, 'sessions'), { recursive: true }); app.setPath('sessionData', join(userData, 'sessions'));

let window, settingsWindow, runtime, resources, unlock, prepare, exiting = false, busy = false, lastError = '';
const settings = new Settings(userData, safeStorage);
const allowedWindows = new Set();
const errorMessage = error => error instanceof Error ? error.message : '操作未完成。';

function createWindow(options = {}) {
  const target = new BrowserWindow({ width: 1440, height: 920, minWidth: 1000, minHeight: 680, title: 'OPM Studio', backgroundColor: '#f5f7fb',
    ...options, webPreferences: { preload: join(source, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  const contentsId = target.webContents.id;
  allowedWindows.add(contentsId);
  target.on('closed', () => allowedWindows.delete(contentsId));
  target.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  target.webContents.on('will-navigate', (event, url) => { try { if (!runtime?.gateway || new URL(url).origin !== runtime.gateway.origin) event.preventDefault(); } catch { event.preventDefault(); } });
  target.webContents.session.setPermissionRequestHandler((_contents, _permission, done) => done(false));
  return target;
}
function showSettings() {
  if (!runtime?.gateway) return;
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.focus(); return; }
  settingsWindow = createWindow({ width: 840, height: 780, minWidth: 700, minHeight: 600, parent: window, title: 'OPM Studio · 设置' });
  void settingsWindow.loadURL(runtime.gateway.origin + '/desktop/settings.html');
  settingsWindow.on('closed', () => { settingsWindow = undefined; });
}
async function state() {
  return { version: app.getVersion(), platform: process.platform, arch: process.arch, userData, dataPath: join(userData, 'workspace/runtime-data'),
    model: await settings.read(), assistant: runtime?.assistantState ?? 'UNCONFIGURED', busy,
    runtimes: resources?.manifest.versions, lastError };
}
function trusted(event) {
  try { return allowedWindows.has(event.sender.id) && event.senderFrame?.parent === null
    && new URL(event.senderFrame.url).origin === runtime?.gateway?.origin; } catch { return false; }
}
function handle(channel, action) {
  ipcMain.handle(channel, async (event, value) => {
    if (!trusted(event)) throw new Error('请求来源不属于当前客户端。');
    try { return await action(value); } catch (error) { lastError = errorMessage(error); throw new Error(lastError); }
  });
}
async function prepareWorkspace() {
  if (!window || window.isDestroyed() || !window.webContents.getURL().startsWith(runtime.gateway.origin)) return true;
  if (prepare) return false;
  return await new Promise(resolve => {
    const nonce = randomUUID();
    const timer = setTimeout(() => { prepare = undefined; resolve(false); }, 180000);
    prepare = { nonce, sender: window.webContents.id, done: value => { clearTimeout(timer); prepare = undefined; resolve(value); } };
    window.show(); window.webContents.send('desktop:prepare', nonce);
  });
}
ipcMain.on('desktop:prepared', (event, value) => {
  if (trusted(event) && prepare?.sender === event.sender.id && prepare.nonce === value?.nonce) prepare.done(value.accepted === true);
});
async function confirmTasks() {
  const directory = join(userData, 'workspace/assistant/conversations');
  const files = await readdir(directory).catch(() => []);
  for (const file of files.filter(name => /^[a-f0-9-]{36}\.json$/.test(name))) {
    if ((await json(join(directory, file), null))?.run?.status === 'running') {
      const answer = await dialog.showMessageBox(window, { type: 'question', buttons: ['取消', '停止任务并继续'], defaultId: 0, cancelId: 0,
        message: '智能助手仍在生成，是否停止任务？', detail: '已保存的模型保持。未确认的预览不会自动应用，稍后可以继续对话。' });
      return answer.response === 1;
    }
  }
  return true;
}
async function exclusive(action) {
  if (busy) throw new Error('已有客户端操作正在进行，请稍候。');
  busy = true;
  try { return await action(); } finally { busy = false; }
}
async function reloadWorkbench() {
  // 服务重启后本地会话令牌变化，必须重新加载 bootstrap。
  if (window && !window.isDestroyed()) await window.loadURL(runtime.gateway.origin + '/projects');
}
async function maintain(action) {
  return exclusive(async () => {
    if (!await prepareWorkspace() || !await confirmTasks()) return { cancelled: true };
    await runtime.stop();
    try { return await action(); }
    finally { await runtime.restart(); await reloadWorkbench(); }
  });
}
async function restartServices() {
  return exclusive(async () => {
    if (!await prepareWorkspace()) {
      const answer = await dialog.showMessageBox(window, { type: 'warning', buttons: ['取消', '仍要重新连接'], defaultId: 0, cancelId: 0,
        message: '当前编辑尚未完成保存。', detail: '重新连接会重新加载工作台；已持久化内容与待确认请求保留，尚未提交的输入可能丢失。' });
      if (answer.response !== 1) return;
    }
    if (!await confirmTasks()) return;
    await runtime.stop({ allowAbnormal: true });
    await runtime.verifyWorkspace(runtime.workspace);
    await runtime.restart(); await reloadWorkbench(); lastError = '';
  });
}
handle('desktop:state', state);
handle('desktop:settings', () => { showSettings(); });
handle('desktop:open-data', () => shell.openPath(userData));
handle('desktop:open-logs', () => shell.openPath(join(userData, 'logs')));
handle('desktop:save-settings', value => exclusive(async () => {
  if (!await confirmTasks()) return { cancelled: true };
  await runtime.stopAssistant({ allowAbnormal: true });
  try { return await settings.save(value); } finally { await runtime.startAssistant(); }
}));
handle('desktop:clear-key', () => exclusive(async () => {
  if (!await confirmTasks()) return { cancelled: true };
  await runtime.stopAssistant({ allowAbnormal: true });
  try { return await settings.clear(); } finally { await runtime.startAssistant(); }
}));
handle('desktop:test-connection', () => exclusive(async () => {
  const config = await settings.read(), key = await settings.key();
  if (!key) throw new Error('请先输入并保存 Key。');
  const response = await fetch(config.baseURL + '/models', { headers: { Authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`模型服务连接未通过（HTTP ${response.status}）。`);
  return { ok: true };
}));
handle('desktop:backup', async () => {
  const selected = await dialog.showOpenDialog(settingsWindow ?? window, { title: '选择备份存放目录', properties: ['openDirectory', 'createDirectory'] });
  if (selected.canceled) return { cancelled: true };
  return maintain(async () => ({ path: await backupWorkspace(runtime.workspace, selected.filePaths[0], app.getVersion()) }));
});
handle('desktop:restore', async () => {
  const selected = await dialog.showOpenDialog(settingsWindow ?? window, { title: '选择 OPM-backup 备份目录', properties: ['openDirectory'] });
  if (selected.canceled) return { cancelled: true };
  const answer = await dialog.showMessageBox(settingsWindow ?? window, { type: 'warning', buttons: ['取消', '备份当前数据并恢复'], defaultId: 0, cancelId: 0,
    message: '恢复将替换当前工作区。', detail: '会先备份当前数据并保留回退目录。模型服务 Key 不在备份中。' });
  if (answer.response !== 1) return { cancelled: true };
  return maintain(async () => {
    const staging = await stageRestore(selected.filePaths[0], userData, path => runtime.verifyWorkspace(path), app.getVersion());
    const backup = await backupWorkspace(runtime.workspace, join(userData, 'backups'), app.getVersion());
    // 恢复的 Base URL 可能属于另一设备；旧 Key 不能自动发送给新目标。
    await settings.clear();
    await commitRestore(userData, staging); return { path: backup };
  });
});
handle('desktop:diagnostics', async () => {
  const selected = await dialog.showSaveDialog(settingsWindow ?? window, { title: '导出诊断（不含模型、聊天及 Key）', defaultPath: 'OPM-diagnostics.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (selected.canceled) return { cancelled: true };
  const current = await state();
  await atomicJson(selected.filePath, { version: current.version, platform: current.platform, arch: current.arch,
    runtimes: current.runtimes, assistant: current.assistant, lastError, resourceRevision: resources.manifest.sourceRevision });
  return { path: selected.filePath };
});

app.on('before-quit', event => {
  if (exiting) return;
  event.preventDefault();
  void exclusive(async () => {
    if (runtime?.gateway && (!await prepareWorkspace() || !await confirmTasks())) return;
    await runtime?.stop({ allowAbnormal: true }); await runtime?.gateway?.close(); await unlock?.(); exiting = true; app.quit();
  }).catch(error => { lastError = errorMessage(error); dialog.showErrorBox('暂未退出', lastError); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (window && !window.isDestroyed()) window.show(); });
app.on('second-instance', () => { if (window && !window.isDestroyed()) { window.show(); window.focus(); } });

if (!app.requestSingleInstanceLock()) { exiting = true; app.quit(); }
else {
  // ESM 入口不能在顶层等待 ready，否则 Electron 等待入口完成会形成循环等待。
  void app.whenReady().then(async () => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'OPM Studio', submenu: [{ label: '客户端设置…', accelerator: 'CmdOrCtrl+,', click: showSettings }, { type: 'separator' }, { role: 'quit', label: '退出 OPM Studio' }] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '窗口', submenu: [{ role: 'minimize' }, { label: '显示建模窗口', click: () => window?.show() }] },
    { label: '帮助', submenu: [{ label: '重启本地服务', click: () => { if (runtime) void restartServices().catch(error => dialog.showMessageBox(window, { type: 'error', message: errorMessage(error) })); } },
      { label: '查看运行日志', click: () => { void shell.openPath(join(userData, 'logs')); } }] },
  ]));
  window = createWindow();
  window.on('close', event => { if (!exiting) { event.preventDefault(); if (process.platform === 'darwin') window.hide(); else app.quit(); } });
  await window.loadFile(join(uiRoot, 'startup.html'));
  try {
    unlock = await lockWorkspace(userData); await recoverRestore(userData);
    await mkdir(join(userData, 'logs'), { recursive: true, mode: 0o700 });
    for (;;) {
    try {
    resources = await verifyResources(app.isPackaged ? join(process.resourcesPath, 'opm') : process.env.OPM_DESKTOP_RESOURCES ?? join(app.getAppPath(), '.runtime/opm'), process.platform, process.arch, { startup: true });
    if (resources.manifest.appVersion !== app.getVersion()) throw new Error('应用与资源版本不一致，请重新装配或安装。');
    runtime = new DesktopRuntime({ resources, userData, uiRoot, version: app.getVersion(), settings,
      onFailure: component => {
        lastError = component === 'runtime' ? '本地模型服务已停止，可从帮助菜单重启本地服务。' : '智能助手连接已停止，可在设置中重新保存配置。';
        void dialog.showMessageBox(window, { type: 'warning', message: lastError, detail: '已持久化数据保留，当前未确认方案不会自动应用。' });
      } });
    const origin = await runtime.start(); await window.loadURL(origin + '/projects');
    break;
    } catch (error) {
      lastError = errorMessage(error);
      await runtime?.stop({ allowAbnormal: true }); await runtime?.gateway?.close(); runtime = undefined;
      const answer = await dialog.showMessageBox(window, { title: '客户端启动失败', type: 'error', message: lastError,
        detail: '数据已保留。可检查日志后重试；不会附着到其他本地服务。', buttons: ['重试', '打开日志目录', '退出'], defaultId: 0, cancelId: 2 });
      if (answer.response === 2) { await unlock?.(); exiting = true; app.quit(); return; }
      if (answer.response === 1) await shell.openPath(join(userData, 'logs'));
    }
    }
  } catch (error) {
    lastError = errorMessage(error);
    dialog.showErrorBox('客户端启动失败', lastError + '\n数据已保留，请检查资源或日志后重新打开。');
    await unlock?.(); exiting = true; app.quit();
  }
  }).catch(error => { dialog.showErrorBox('客户端初始化失败', errorMessage(error)); exiting = true; app.quit(); });
}
