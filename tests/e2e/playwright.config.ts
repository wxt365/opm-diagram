import { defineConfig } from "@playwright/test";

const repositoryRoot = process.cwd();
const useExternalServers = process.env.OPM_E2E_EXTERNAL_SERVERS === "true";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:5176",
  },
  webServer: useExternalServers ? undefined : [
    {
      command: "bash scripts/run-e2e-local-runtime.sh",
      cwd: repositoryRoot,
      url: "http://127.0.0.1:17851/actuator/health",
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev --workspace=@opm/web -- --host 127.0.0.1 --port 5176",
      cwd: repositoryRoot,
      env: {
        VITE_LOCAL_RUNTIME_ORIGIN: "http://127.0.0.1:17851",
      },
      url: "http://127.0.0.1:5176",
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
});
