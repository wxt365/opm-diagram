import { defineConfig } from '@playwright/test';
import { isAbsolute } from 'node:path';

export const releaseLaunchArgs = Object.freeze([
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--no-first-run',
  '--no-default-browser-check'
]);

// 受控 attempt 由 Runner 显式指定测试文件，避免默认扫描误用开发服务器。
export const controlledAttemptEnvironmentKey = 'CANVAS06_ATTEMPT_WEB_ORIGIN';
const controlledOutputDir = process.env.PLAYWRIGHT_OUTPUT_DIR;
const controlledAttemptTestMatch = '**/*.controlled.spec.ts';
const releaseTestMatch = '**/*.release.spec.ts';

export default defineConfig({
  testDir: '.',
  testMatch: process.env[controlledAttemptEnvironmentKey] ? [releaseTestMatch, controlledAttemptTestMatch] : releaseTestMatch,
  fullyParallel: false,
  forbidOnly: true,
  workers: 1,
  retries: 0,
  timeout: 0,
  ...(controlledOutputDir && isAbsolute(controlledOutputDir) ? { outputDir: controlledOutputDir } : {}),
  use: {
    browserName: 'chromium',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
    launchOptions: {
      args: [...releaseLaunchArgs]
    }
  }
});
