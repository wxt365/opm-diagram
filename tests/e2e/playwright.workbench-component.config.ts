import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const channel = process.env.OPM_WORKBENCH_BROWSER_CHANNEL ??
  (process.platform === "win32" && existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe") ? "chrome" : undefined);

export default defineConfig({
  testDir: ".", testMatch: "workbench-component.spec.ts", workers: 1,
  use: { channel, baseURL: "http://127.0.0.1:5179", viewport: { width: 1920, height: 1000 } },
  webServer: { command: "node apps/web/scripts/serve-workbench-example.mjs", cwd: process.cwd(),
    url: "http://127.0.0.1:5179", reuseExistingServer: false },
});
