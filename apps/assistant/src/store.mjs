import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class AssistantError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export function check(ok, code, message, status = 400) {
  if (!ok) throw new AssistantError(code, message, status);
}
export const id = () => randomUUID();
export const sameToken = (a, b) => !!a && !!b && a.draft_id === b.draft_id && a.edit_seq === b.edit_seq && a.binding_digest === b.binding_digest;
export const sameScope = (a, b) => a.projectId === b.projectId && a.modelId === b.modelId && (a.kind ?? 'OPD') === (b.kind ?? 'OPD')
  && (a.kind === 'ANALYSIS' ? a.mindmapId === b.mindmapId : a.contextId === b.contextId);

/** 对话及提交意图独立于模型持久化，临时文件替换保证读取不会看到半份记录。 */
export class ConversationStore {
  constructor(root) { this.root = root; this.lanes = new Map(); this.scopeLanes = new Map(); }
  async init() { await mkdir(this.root, { recursive: true, mode: 0o700 }); }
  path(key) { check(/^[a-f0-9-]{36}$/.test(key), 'INPUT_INVALID', '无效的对话身份。'); return join(this.root, `${key}.json`); }
  async read(key) {
    try { return JSON.parse(await readFile(this.path(key), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') throw new AssistantError('NOT_FOUND', '对话不存在。', 404); throw e; }
  }
  async list(scope) {
    const values = await Promise.all((await readdir(this.root)).filter(x => /^[a-f0-9-]{36}\.json$/.test(x)).map(x => this.read(x.slice(0, -5))));
    return values.filter(x => sameScope(x, scope))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async create(scope) {
    const value = { id: id(), ...scope, title: '新对话', updatedAt: new Date().toISOString(), messages: [], proposals: [], run: null };
    await this.write(value); return value;
  }
  /** 同一 OPD 只绑定一个会话；旧记录保留，绑定后不因排序或重启改换身份。 */
  getOrCreate(scope) {
    const key = JSON.stringify([scope.projectId, scope.modelId, scope.kind ?? 'OPD', scope.kind === 'ANALYSIS' ? scope.mindmapId : scope.contextId]);
    const task = (this.scopeLanes.get(key) ?? Promise.resolve()).then(async () => {
      const values = await this.list(scope);
      const bound = values.find(x => x.primary);
      if (bound) return bound;
      const pending = values.find(x => ['running', 'interrupted'].includes(x.run?.status) || x.proposals.some(p => p.status === 'pending'));
      const existing = pending ?? values.find(x => x.messages.length || x.proposals.length) ?? values[0];
      if (existing) return this.update(existing.id, value => { value.primary = true; });
      const value = { id: id(), ...scope, primary: true, title: 'OPD 会话', updatedAt: new Date().toISOString(), messages: [], proposals: [], run: null };
      await this.write(value); return value;
    });
    const settled = task.catch(() => {}); this.scopeLanes.set(key, settled);
    void settled.then(() => { if (this.scopeLanes.get(key) === settled) this.scopeLanes.delete(key); });
    return task;
  }
  async write(value) {
    const path = this.path(value.id), temp = `${path}.${id()}.tmp`;
    await writeFile(temp, JSON.stringify(value), { mode: 0o600 }); await rename(temp, path);
  }
  update(key, mutate) {
    const task = (this.lanes.get(key) ?? Promise.resolve()).then(async () => {
      const value = await this.read(key); await mutate(value); value.updatedAt = new Date().toISOString(); await this.write(value); return value;
    });
    this.lanes.set(key, task.catch(() => {})); return task;
  }
}
