import { test as base } from "@playwright/test";
export { expect, type Page } from "@playwright/test";
export const test = base.extend({
  page: async ({ page }, use, info) => {
    if (!info.title.startsWith("permissão pede"))
      await page.addInitScript(() =>
        localStorage.setItem(
          "pingo:notification-consent:v1",
          JSON.stringify({ at: Date.now(), never: true }),
        ),
      );
    await use(page);
  },
});
