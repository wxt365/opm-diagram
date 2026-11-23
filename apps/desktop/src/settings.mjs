import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { atomicJson, json } from './files.mjs';

export function modelSettings(value) {
  if (!value || typeof value.model !== 'string' || !value.model.trim() || value.model.length > 100 || !['deepseek', 'openai'].includes(value.provider)) throw new Error('模型配置无效。');
  const url = new URL(value.baseURL);
  const octets = url.hostname.split('.').map(Number);
  const privateIPv4 = /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) && (octets[0] === 10
    || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31 || octets[0] === 192 && octets[1] === 168);
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:'
    || url.protocol === 'http:' && (privateIPv4 || ['127.0.0.1', 'localhost'].includes(url.hostname)))) throw new Error('请使用 HTTPS，或本机、局域网 IP 的 HTTP 地址；地址不能包含认证信息、查询或片段。');
  return { provider: value.provider, baseURL: url.href.replace(/\/$/, ''), model: value.model.trim() };
}

export class Settings {
  constructor(userData, safeStorage) {
    this.publicPath = join(userData, 'workspace/settings/model.json');
    this.secretPath = join(userData, 'credentials.json'); this.safe = safeStorage; this.sessionKey = '';
  }
  async encryptionAvailable() { return typeof this.safe.isAsyncEncryptionAvailable === 'function' && await this.safe.isAsyncEncryptionAvailable(); }
  async key() {
    if (this.sessionKey) return this.sessionKey;
    const value = await json(this.secretPath, null);
    if (!value) return '';
    if (!await this.encryptionAvailable()) throw new Error('系统凭证保护不可用，请重新输入 Key 或暂不启用助手。');
    return await this.safe.decryptStringAsync(Buffer.from(value.encrypted, 'base64'));
  }
  async read() {
    const config = modelSettings(await json(this.publicPath, { provider: 'deepseek', baseURL: 'https://api.deepseek.com', model: 'deepseek-flash' }));
    const persisted = Boolean(await json(this.secretPath, null));
    return { ...config, hasKey: Boolean(this.sessionKey) || persisted, persisted, canPersist: await this.encryptionAvailable() };
  }
  async save(value) {
    const config = modelSettings(value);
    if (typeof value.key !== 'string' || value.key.length > 4096) throw new Error('Key 格式无效。');
    const key = value.key.trim();
    if (key) {
      if (value.persist && await this.encryptionAvailable()) {
        const encrypted = await this.safe.encryptStringAsync(key);
        await atomicJson(this.secretPath, { encrypted: encrypted.toString('base64') }); this.sessionKey = '';
      } else { await rm(this.secretPath, { force: true }); this.sessionKey = key; }
    }
    await atomicJson(this.publicPath, config); return this.read();
  }
  async clear() { this.sessionKey = ''; await rm(this.secretPath, { force: true }); return this.read(); }
}
