import { writeFile, rename } from 'node:fs/promises';
import { configuration, startServer } from './server.mjs';

// 桌面入口不读取开发环境 .env；父进程断开时关闭会话与 Harness。
const ready = process.env.OPM_DESKTOP_READY_FILE, nonce = process.env.OPM_DESKTOP_NONCE;
if (!ready || !/^[a-f0-9-]{36}$/.test(nonce ?? '')) throw new Error('缺少有效桌面启动参数。');
const config = configuration(), app = await startServer(config);
let closing = false, activity = Date.now();
async function close() {
  if (closing) return; closing = true; clearInterval(watchdog);
  try {
    const tasks = [...app.service.tasks.values()];
    await Promise.all(tasks.map(task => app.service.stop(task.key, task.scope)));
    await Promise.all(tasks.map(task => task.completion));
    await Promise.all([...app.service.applies.values()]);
    await app.close(); process.exit(0);
  } catch { process.exit(1); }
}
const watchdog = setInterval(() => { if (Date.now() - activity > 15000) void close(); }, 1000);
process.stdin.on('data', value => { activity = Date.now(); if (value.includes(113)) void close(); });
process.stdin.on('end', () => void close()); process.stdin.on('error', () => void close());
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => void close());
const temporary = ready + '.tmp';
await writeFile(temporary, JSON.stringify({ protocol: 1, component: 'assistant', nonce, pid: process.pid, port: app.server.address().port }), { mode: 0o600, flag: 'wx' });
await rename(temporary, ready);
