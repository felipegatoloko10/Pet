import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: [
    "browser/**/*.spec.ts",
    "desktop/**/*.spec.ts",
    "mobile/**/*.spec.ts",
  ],
  fullyParallel: false,
  use: {
    baseURL: process.env.PINGO_TEST_URL ?? "http://127.0.0.1:3210",
    ...devices["Desktop Chrome"],
    channel: process.env.CI ? "chrome" : undefined,
  },
  webServer: [
    {
      command: "npm run dev -w @pingo/mobile",
      url: "http://127.0.0.1:1430",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    ...(process.env.PINGO_TEST_URL
      ? []
      : [
          {
            command: "npm run start -w @pingo/web -- --port 3210",
            url: "http://127.0.0.1:3210/api/v1/health",
            reuseExistingServer: !process.env.CI,
            timeout: 30000,
          },
        ]),
    {
      command: "npm run dev -w @pingo/desktop",
      url: "http://127.0.0.1:1420",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
  reporter: "list",
});
