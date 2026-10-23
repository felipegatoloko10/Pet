import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@vercel/oidc", () => ({
  getVercelOidcToken: async () => "fake-vercel-assertion",
}));
const send = vi.fn();
beforeEach(() => {
  vi.resetModules();
  send.mockReset();
  vi.stubGlobal("fetch", send);
  vi.stubEnv(
    "FIREBASE_FEDERATION_CONFIG",
    JSON.stringify({
      project_id: "pingo-test-only",
      client_email: "sender@pingo-test-only.iam.gserviceaccount.com",
      audience:
        "//iam.googleapis.com/projects/123456/locations/global/workloadIdentityPools/pingo-vercel/providers/production",
    }),
  );
  send.mockImplementation(async (url: string) =>
    String(url).includes("sts.googleapis")
      ? Response.json({ access_token: "fake-federation-token" })
      : String(url).includes("iamcredentials")
        ? Response.json({
            accessToken: "fake-test-access",
            expireTime: new Date(Date.now() + 3600000).toISOString(),
          })
        : Response.json({ name: "test-message" }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const notice = {
  id: "reminder:alice:event:2026-10-23",
  title: "Dentista",
  body: "Começa em 30 minutos.",
  createdAt: new Date().toISOString(),
  read: false,
  silent: true,
};
const sub = {
  transport: "fcm" as const,
  installationId: crypto.randomUUID(),
  token: "fake-registration-token",
};
it("sends data-only payloads through FCM without including event descriptions or sessions", async () => {
  const { sendAndroidPush } = await import("../apps/web/src/server/fcm");
  await sendAndroidPush(sub, "alice", notice, "event");
  const body = JSON.parse(send.mock.calls[2][1].body);
  expect(body.message.notification).toBeUndefined();
  expect(body.message.data).toMatchObject({
    userId: "alice",
    noticeId: notice.id,
    eventId: "event",
    silent: "true",
  });
  expect(JSON.stringify(body)).not.toContain("fake-test-access");
  await sendAndroidPush(sub, "alice", notice);
  expect(
    send.mock.calls.filter(([url]) => String(url).includes("sts.googleapis")),
  ).toHaveLength(1);
});
it("removes invalid tokens only on the explicit UNREGISTERED response", async () => {
  const { sendAndroidPush } = await import("../apps/web/src/server/fcm");
  send.mockImplementation(async (url: string) =>
    String(url).includes("sts.googleapis")
      ? Response.json({ access_token: "fake-federation-token" })
      : String(url).includes("iamcredentials")
        ? Response.json({
            accessToken: "fake-test-access",
            expireTime: new Date(Date.now() + 3600000).toISOString(),
          })
        : Response.json(
            { error: { details: [{ errorCode: "UNREGISTERED" }] } },
            { status: 404 },
          ),
  );
  await expect(sendAndroidPush(sub, "alice", notice)).rejects.toMatchObject({
    statusCode: 410,
  });
});
it("treats a project error as retryable, preserving device registration", async () => {
  const { sendAndroidPush } = await import("../apps/web/src/server/fcm");
  send.mockImplementation(async (url: string) =>
    String(url).includes("sts.googleapis")
      ? Response.json({ access_token: "fake-federation-token" })
      : String(url).includes("iamcredentials")
        ? Response.json({
            accessToken: "fake-test-access",
            expireTime: new Date(Date.now() + 3600000).toISOString(),
          })
        : Response.json({ error: { status: "NOT_FOUND" } }, { status: 404 }),
  );
  await expect(sendAndroidPush(sub, "alice", notice)).rejects.toMatchObject({
    statusCode: 503,
  });
});
