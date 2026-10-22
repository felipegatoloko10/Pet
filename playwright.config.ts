import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  use: {
    baseURL: process.env.PINGO_TEST_URL ?? "http://127.0.0.1:3210",
    ...devices["Desktop Chrome"],
  },
  webServer: process.env.PINGO_TEST_URL
    ? undefined
    : {
        command: "npm run start -w @pingo/web -- --port 3210",
        url: "http://127.0.0.1:3210/api/v1/health",
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
      },
  reporter: "list",
});
