import { test, expect } from "@playwright/test";
import { inflateSync } from "node:zlib";

async function preview(page: import("@playwright/test").Page) {
  await page.goto("http://127.0.0.1:1420/?pet=1");
  await expect(page.locator(".pet")).toBeVisible();
}
test("avatar has real alpha transparency, and balloons appear only for a message", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== "http://127.0.0.1:1420")
      external.push(request.url());
  });
  await page.setViewportSize({ width: 360, height: 500 });
  await preview(page);
  await expect(page.locator(".companion-balloon")).toHaveCount(0);
  expect(external).toEqual([]);
  const png = await page.screenshot({
    omitBackground: true,
    path: ".verification/avatar-transparent.png",
  });
  expect(png[25]).toBe(6); // RGBA, not a flattened image.
  const chunks: Buffer[] = [];
  for (let i = 8; i < png.length;) {
    const size = png.readUInt32BE(i);
    if (png.toString("ascii", i + 4, i + 8) === "IDAT")
      chunks.push(png.subarray(i + 8, i + 8 + size));
    i += size + 12;
  }
  // The first pixel's predictor is zero for all PNG row filters.
  expect(inflateSync(Buffer.concat(chunks))[4]).toBe(0);
  await page
    .getByLabel("Mensagem para Pingo", { exact: true })
    .fill("Oi Pingo");
  await page.getByLabel("Mensagem para Pingo", { exact: true }).press("Enter");
  await expect(page.locator(".companion-balloon-text")).toContainText(
    "prévia local",
  );
  await expect(
    page.getByLabel("Mensagem para Pingo", { exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "Fechar balão", exact: true }).click();
  await expect(page.locator(".companion-balloon")).toHaveCount(0);
});
test("play gestures are distinct, can be resized, and respect reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 860 });
  await preview(page);
  for (const state of ["wave", "dance", "stretch", "hop", "groom", "roll"]) {
    await page
      .getByRole("button", { name: "Brincar com Pingo", exact: true })
      .click();
    await expect(page.locator(`.pet-${state}`)).toBeVisible();
  }
  const before = await page.locator(".companion-character").boundingBox();
  await page
    .getByRole("button", { name: "Aumentar Pingo", exact: true })
    .click();
  const after = await page.locator(".companion-character").boundingBox();
  expect(after!.width).toBeGreaterThan(before!.width);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      page
        .locator(".pet-body")
        .evaluate((el) => getComputedStyle(el).animationName),
    )
    .toBe("none");
});
test("small and large avatars keep the composer and balloon inside their window", async ({
  page,
}) => {
  for (const size of [
    { width: 280, height: 360 },
    { width: 360, height: 500 },
    { width: 650, height: 860 },
  ]) {
    await page.setViewportSize(size);
    await preview(page);
    await page
      .getByLabel("Mensagem para Pingo", { exact: true })
      .fill("Converse comigo");
    await page
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await expect(page.locator(".companion-balloon-text")).toContainText(
      "prévia local",
    );
    for (const selector of [
      ".companion-balloon",
      ".pet-chat-bar",
      ".companion-character",
      ".companion-character svg",
    ]) {
      const box = await page.locator(selector).boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(size.width);
  }
});
