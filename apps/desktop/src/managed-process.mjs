import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

export function parseReady(text, expected) {
  if (text.length > 4096) throw new Error('启动回执过大。');
  const value = JSON.parse(text);
  if (value.protocol !== 1 || value.component !== expected.component || value.nonce !== expected.nonce || value.pid !== expected.pid
    || !Number.isInteger(value.port) || value.port < 1 || value.port > 65535) throw new Error('启动回执身份不匹配。');
  return `http://127.0.0.1:${value.port}`;
}

/** 每个子进程独立拥有 stdin 心跳；不用猜测端口或复用外部进程。 */
export async function launchManaged({ command, args, env, cwd, readyRoot, component, log, timeout = 60000, secrets = [] }) {
  const nonce = randomUUID(), ready = join(readyRoot, `${component}.${nonce}.json`);
  const child = spawn(command, args, { cwd, env: { ...env, OPM_DESKTOP_NONCE: nonce, OPM_DESKTOP_READY_FILE: ready },
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let failure, exited = false, exitCode;
  child.once('error', error => { failure = error; exited = true; exitCode = -1; });
  child.once('exit', code => { exited = true; exitCode = code; });
  let buffer = '';
  const append = chunk => {
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) { let line = buffer.slice(0, end + 1); buffer = buffer.slice(end + 1); for (const secret of secrets) if (secret) line = line.replaceAll(secret, '[已隐藏]'); log?.(line); }
    if (buffer.length > 65536) buffer = '[过长日志已省略]\n';
  };
  child.stdout.on('data', append); child.stderr.on('data', append);
  child.stdin.on('error', () => {});
  const heartbeat = setInterval(() => { if (!exited && !child.stdin.destroyed) child.stdin.write('h'); }, 2000);
  heartbeat.unref(); child.once('exit', () => clearInterval(heartbeat));
  const stop = async ({ allowAbnormal = false } = {}) => {
    if (exited) { await rm(ready, { force: true }); if (!allowAbnormal && exitCode !== 0) throw new Error(`${component} 异常退出，数据需检查。`); return; }
    child.stdin.end('q');
    const deadline = Date.now() + 30000;
    while (!exited) { if (Date.now() > deadline) throw new Error(`${component} 尚未安全退出；未强制终止或备份。`); await new Promise(done => setTimeout(done, 30)); }
    await rm(ready, { force: true });
    if (!allowAbnormal && exitCode !== 0) throw new Error(`${component} 未正常关闭。`);
  };
  try {
    const deadline = Date.now() + timeout;
    let origin;
    while (!origin) {
      if (failure || exited) throw new Error(`${component} 启动失败，请查看日志。`, { cause: failure });
      const text = await readFile(ready, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
      if (text !== null) origin = parseReady(text, { component, nonce, pid: child.pid });
      if (Date.now() > deadline) throw new Error(`${component} 启动超时。`);
      if (!origin) await new Promise(done => setTimeout(done, 50));
    }
    const response = await fetch(origin + (component === 'runtime' ? '/actuator/health/liveness' : '/health'), { signal: AbortSignal.timeout(5000) });
    if (!response.ok || (await response.json()).status !== 'UP') throw new Error(`${component} 健康检查未通过。`);
    return { child, origin, stop, get exited() { return exited; } };
  } catch (error) { await stop().catch(() => { clearInterval(heartbeat); child.stdin.destroy(); }); throw error; }
}
