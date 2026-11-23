import { mkdir, appendFile, readdir } from 'node:fs/promises';
import { join, dirname, delimiter } from 'node:path';
import { spawn } from 'node:child_process';
import { createGateway } from './gateway.mjs';
import { launchManaged } from './managed-process.mjs';
import { atomicJson, json } from './files.mjs';
import { backupWorkspace, compareVersion } from './workspace.mjs';

export function systemEnvironment(node) {
  const result = {};
  for (const key of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR', 'SystemRoot', 'WINDIR', 'LANG', 'LC_ALL', 'TZ']) if (process.env[key]) result[key] = process.env[key];
  result.PATH = dirname(node) + delimiter + (process.env.PATH ?? '');
  return result;
}

export class DesktopRuntime {
  constructor({ resources, userData, uiRoot, version, settings, onFailure = () => {} }) {
    Object.assign(this, { resources, userData, uiRoot, version, settings, onFailure });
    this.workspace = join(userData, 'workspace'); this.services = new Map(); this.stopping = false; this.expectedStops = new Set();
  }
  async start() {
    await mkdir(this.workspace, { recursive: true, mode: 0o700 });
    await mkdir(join(this.userData, 'ready'), { recursive: true, mode: 0o700 });
    await mkdir(join(this.userData, 'logs'), { recursive: true, mode: 0o700 });
    await mkdir(join(this.userData, 'backups'), { recursive: true, mode: 0o700 });
    const stamp = await json(join(this.workspace, 'settings/runtime-version.json'), null);
    if (stamp && compareVersion(stamp.version, this.version) > 0) throw new Error('工作区来自更新客户端，请升级应用或恢复旧版备份。');
    if (stamp && (stamp.version !== this.version || stamp.schemaDigest !== this.resources.manifest.schemaDigest)
      || !stamp && (await readdir(this.workspace)).length) {
      await this.verifyWorkspace(this.workspace);
      await backupWorkspace(this.workspace, join(this.userData, 'backups'), stamp?.version ?? this.version);
    }
    const saved = await json(join(this.userData, 'local-origin.json'), null);
    if (saved && (!Number.isInteger(saved.port) || saved.port < 1 || saved.port > 65535)) throw new Error('本地入口配置损坏，请保留数据并检查客户端设置。');
    // 保持 origin 稳定，防止重启后 IndexedDB 待确认请求与恢复输入不可达。
    this.gateway = await createGateway({ webRoot: join(this.resources.root, 'apps/web/dist'), desktopRoot: this.uiRoot, port: saved?.port ?? 0 });
    await atomicJson(join(this.userData, 'local-origin.json'), { port: Number(new URL(this.gateway.origin).port) });
    try {
      await this.startCore();
      await atomicJson(join(this.workspace, 'settings/runtime-version.json'), { version: this.version, schemaDigest: this.resources.manifest.schemaDigest });
      await this.startAssistant().catch(() => { this.assistantState = 'FAILED'; });
      return this.gateway.origin;
    } catch (error) { await this.stop({ allowAbnormal: true }).catch(() => {}); await this.gateway.close(); throw error; }
  }
  async launch(component, command, args, extra = {}, secrets = []) {
    const pendingLogs = new Set();
    const managed = await launchManaged({ command, args, cwd: this.resources.root, component,
      env: { ...systemEnvironment(this.resources.node), ...extra }, readyRoot: join(this.userData, 'ready'), secrets,
      log: line => { const write = appendFile(join(this.userData, `logs/${component}.log`), line, { mode: 0o600 }); pendingLogs.add(write); write.finally(() => pendingLogs.delete(write)).catch(() => {}); } });
    this.services.set(component, managed);
    managed.child.once('exit', () => {
      if (!this.stopping && !this.expectedStops.has(managed) && this.services.get(component) === managed) {
        if (component === 'assistant') { this.assistantState = 'FAILED'; this.gateway.setAssistant(null); }
        this.onFailure(component);
      }
    });
    return managed;
  }
  async startCore() {
    const root = this.resources.root;
    const managed = await this.launch('runtime', this.resources.java, ['-jar', join(root, 'runtime/local-runtime.jar'),
      '--server.address=127.0.0.1', '--server.port=0', '--server.shutdown=graceful', '--spring.lifecycle.timeout-per-shutdown-phase=20s',
      '--opm.desktop.enabled=true', '--opm.storage.type=sqlite', `--opm.storage.root=${join(this.workspace, 'runtime-data')}`,
      `--opm.assets.root=${join(root, 'profiles')}`, `--opm.security.trusted-web-origins=${this.gateway.origin}`]);
    this.gateway.setRuntime(managed.origin);
  }
  async startAssistant() {
    const key = await this.settings.key();
    if (!key) { this.assistantState = 'UNCONFIGURED'; this.gateway.setAssistant(null); return; }
    const config = await this.settings.read();
    const managed = await this.launch('assistant', this.resources.node, [join(this.resources.root, 'apps/assistant/src/desktop-entry.mjs')], {
      DEEPSEEK_API_KEY: key, DEEPSEEK_BASE_URL: config.baseURL, DEEPSEEK_MODEL: config.model, OPM_MODEL_PROVIDER: config.provider,
      // 仅授权用户已保存网关的精确来源，保留助手对其他 HTTP 来源的限制。
      OPM_MODEL_HTTP_ORIGIN: new URL(config.baseURL).protocol === 'http:' ? new URL(config.baseURL).origin : '',
      OPM_RUNTIME_ORIGIN: this.services.get('runtime').origin, OPM_ASSISTANT_PORT: '0', OPM_ASSISTANT_HOST: '127.0.0.1',
      OPM_ASSISTANT_DATA: join(this.workspace, 'assistant'), OPM_TRUSTED_WEB_ORIGINS: this.gateway.origin,
    }, [key]);
    this.gateway.setAssistant(managed.origin); this.assistantState = 'READY';
  }
  async stopAssistant(options) {
    const managed = this.services.get('assistant');
    this.gateway?.setAssistant(null);
    if (managed) {
      this.expectedStops.add(managed);
      try { await managed.stop(options); this.services.delete('assistant'); }
      finally { this.expectedStops.delete(managed); }
    }
    this.assistantState = 'UNCONFIGURED';
  }
  async stop(options) {
    this.stopping = true;
    try {
      await this.gateway?.pause();
      await this.stopAssistant(options);
      const core = this.services.get('runtime');
      if (core) { await core.stop(options); this.services.delete('runtime'); }
      this.gateway?.setRuntime(null);
    } catch (error) { this.gateway?.resume(); throw error; }
    finally { this.stopping = false; }
  }
  async restart() { await this.startCore(); await this.startAssistant().catch(() => { this.assistantState = 'FAILED'; }); this.gateway.resume(); }
  async verifyWorkspace(workspace) {
    await new Promise((done, reject) => {
      const child = spawn(this.resources.java, ['-Dloader.main=org.opm.localruntime.desktop.DesktopBackupVerifier', '-cp', join(this.resources.root, 'runtime/local-runtime.jar'), 'org.springframework.boot.loader.launch.PropertiesLauncher', workspace],
        { env: systemEnvironment(this.resources.node), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let output = ''; child.stdout.on('data', value => { output += value; }); child.stderr.resume();
      const timer = setTimeout(() => { child.kill(); reject(new Error('备份数据库校验超时，未恢复。')); }, 30000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); code === 0 && output.includes('"VALID"') ? done() : reject(new Error('备份数据库未通过完整性或外键校验。')); });
    });
  }
}
