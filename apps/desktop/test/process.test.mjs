import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchManaged, parseReady } from '../src/managed-process.mjs';
import { forbidden } from '../scripts/prepare-resources.mjs';
import { handleSquirrel } from '../src/squirrel.mjs';

test('回执必须匹配 PID、nonce、组件与有效端口', () => {
  const expected = { pid: 123, nonce: 'fixture', component: 'assistant' };
  const value = { ...expected, protocol: 1, port: 12345 };
  assert.equal(parseReady(JSON.stringify(value), expected), 'http://127.0.0.1:12345');
  for (const patch of [{ pid: 124 }, { nonce: 'wrong' }, { component: 'runtime' }, { port: 0 }, { protocol: 2 }]) assert.throws(() => parseReady(JSON.stringify({ ...value, ...patch }), expected));
  for (const path of ['apps/assistant/.env.local', 'runtime-data/catalog.db', 'x/credentials.json', '.git/config']) assert.ok(forbidden(path));
  assert.ok(!forbidden('apps/assistant/skills/guide/SKILL.md'));
});
test('Windows 安装事件只调用固定快捷方式命令，普通启动和其他平台不处理', async () => {
  const calls = [], execute = async (...args) => calls.push(args);
  assert.equal(await handleSquirrel('darwin', ['app', '--squirrel-install'], '/app/opm.exe', execute), false);
  assert.equal(await handleSquirrel('win32', ['app'], '/app/opm.exe', execute), false);
  assert.equal(await handleSquirrel('win32', ['app', '--squirrel-install'], '/app/opm.exe', execute), true);
  assert.deepEqual(calls[0].slice(0, 2), ['/Update.exe', ['--createShortcut', 'opm.exe']]);
  await handleSquirrel('win32', ['app', '--squirrel-uninstall'], '/app/opm.exe', execute);
  assert.deepEqual(calls[1][1], ['--removeShortcut', 'opm.exe']);
  await handleSquirrel('win32', ['app', '--squirrel-obsolete'], '/app/opm.exe', execute); assert.equal(calls.length, 2);
});
test('受管随机端口子进程实际健康检查、日志脱敏及 stdin 安全退出', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opm-process-')); t.after(() => rm(root, { recursive: true, force: true }));
  const script = join(root, 'child.mjs');
  await writeFile(script, `import{createServer}from'node:http';import{writeFileSync}from'node:fs';const server=createServer((q,s)=>s.end('{"status":"UP"}'));server.listen(0,'127.0.0.1',()=>{writeFileSync(process.env.OPM_DESKTOP_READY_FILE,JSON.stringify({protocol:1,component:'assistant',nonce:process.env.OPM_DESKTOP_NONCE,pid:process.pid,port:server.address().port}));console.log('fake-key-visible');});process.stdin.on('data',v=>{if(v.includes(113))server.close(()=>process.exit(0));});process.stdin.on('end',()=>server.close(()=>process.exit(0)));`);
  const logs = [];
  const managed = await launchManaged({ command: process.execPath, args: [script], env: {}, cwd: root, readyRoot: root, component: 'assistant', log: line => logs.push(line), secrets: ['fake-key-visible'], timeout: 5000 });
  await managed.stop(); assert.equal(managed.exited, true); assert.ok(logs.join('').includes('[已隐藏]')); assert.ok(!logs.join('').includes('fake-key-visible'));
  await assert.rejects(launchManaged({ command: process.execPath, args: ['-e', 'process.exit(1)'], env: {}, cwd: root, readyRoot: root, component: 'assistant', timeout: 1000 }), /启动失败/);
});
