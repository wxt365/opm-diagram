import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: 'workbench-performance.spec.ts', workers: 1,
  outputDir: '../../test-results/canvas-performance',
  use: { baseURL: 'http://127.0.0.1:5181' },
  webServer: { command: 'npm run dev --workspace=@opm/web -- --host 127.0.0.1 --port 5181', cwd: process.cwd(),
    url: 'http://127.0.0.1:5181', reuseExistingServer: true, timeout: 60_000 },
});
