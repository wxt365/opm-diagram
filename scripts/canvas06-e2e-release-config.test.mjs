import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const config = resolve(root, 'tests/e2e/release/dev-canvas-06/playwright.release.config.ts');

test('release Playwright config fixes the browser context and never bootstraps a server', async () => {
  const source = await readFile(config, 'utf8');
  for (const value of [
    "fullyParallel: false", 'forbidOnly: true', 'workers: 1', 'retries: 0', 'timeout: 0',
    "browserName: 'chromium'", "locale: 'zh-CN'", "timezoneId: 'Asia/Shanghai'",
    "colorScheme: 'light'", "reducedMotion: 'reduce'", 'deviceScaleFactor: 1', "trace: 'retain-on-failure'"
  ]) assert.match(source, new RegExp(escapeRegExp(value)));
  for (const argument of [
    '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-extensions',
    '--disable-sync', '--no-first-run', '--no-default-browser-check'
  ]) assert.match(source, new RegExp(escapeRegExp(argument)));
  assert.doesNotMatch(source, /\bwebServer\b|reuseExistingServer|npm run dev|vite/i);

  const loaded = spawnSync(process.execPath, [resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', config, '--list'], {
    cwd: root,
    encoding: 'utf8'
  });
  const output = loaded.stdout + loaded.stderr;
  assert.equal(loaded.status, 0, output);
  const discovered = output.split('\n').filter(line => /^  \S+\.release\.spec\.ts:\d+:\d+ › /.test(line));
  assert.equal(discovered.length, 2, output);
  assert.match(discovered[0], /^  family\.controlled\.release\.spec\.ts:\d+:\d+ › 受控 Family E2E 只经 Runner session 执行$/);
  assert.match(discovered[1], /^  fault-launcher\.controlled\.release\.spec\.ts:\d+:\d+ › 受控 Fault Launcher 只经 Runner 生命周期接口执行$/);
  assert.match(output, /Total: 2 tests in 2 files/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
