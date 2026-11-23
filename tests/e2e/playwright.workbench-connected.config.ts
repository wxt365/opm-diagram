import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";

const lan = Object.values(networkInterfaces()).flat().find(item => item?.family === "IPv4" && !item.internal)?.address ?? "127.0.0.1";
process.env.OPM_CONNECTED_E2E_HOST = process.env.OPM_CONNECTED_E2E_HOST ?? lan;
const channel = process.env.OPM_WORKBENCH_BROWSER_CHANNEL ??
  (process.platform === "win32" && existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe") ? "chrome" : undefined);

export default defineConfig({
  testDir: ".", testMatch: "workbench-connected.spec.ts", workers: 1, timeout: 90000,
  use: { channel, baseURL: "http://127.0.0.1:5179", viewport: { width: 1600, height: 1000 } },
  webServer: [
    { command: "node tests/e2e/drivers/workbench-connected-services.mjs", cwd: process.cwd(),
      url: "http://127.0.0.1:17862/actuator/health", timeout: 90000, reuseExistingServer: false },
    { command: "node apps/web/scripts/serve-workbench-example.mjs", cwd: process.cwd(),
      url: "http://127.0.0.1:5179", reuseExistingServer: false },
  ],
});
