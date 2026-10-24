import { defineConfig, devices } from "@playwright/test";
const mobilePort = process.env.PINGO_MOBILE_TEST_PORT ?? "1430";
const desktopPort = process.env.PINGO_DESKTOP_TEST_PORT ?? "1420";
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
      command: `npm run dev -w @pingo/mobile -- --port ${mobilePort}`,
      url: `http://127.0.0.1:${mobilePort}`,
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
      command: `npm run dev -w @pingo/desktop -- --port ${desktopPort}`,
      url: `http://127.0.0.1:${desktopPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
  reporter: "list",
});
