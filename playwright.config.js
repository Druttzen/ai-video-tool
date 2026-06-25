import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: process.env.E2E_ELECTRON ? [] : ["**/electron-*.spec.js", "**/electron-*.spec.cjs"],
  timeout: 60000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
