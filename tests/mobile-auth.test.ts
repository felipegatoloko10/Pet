import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const state = vi.hoisted(() => ({
  store: new Map<string, string>(),
  launch: undefined as string | undefined,
  opens: [] as string[],
  exchanges: 0,
  requested: undefined as undefined | { challenge: string; state: string },
}));
vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: async ({ url }: { url: string }) => {
      state.opens.push(url);
    },
  },
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: async () => ({ remove: async () => {} }),
    getLaunchUrl: async () =>
      state.launch ? { url: state.launch } : undefined,
  },
}));
vi.mock("../apps/mobile/src/native", () => ({
  Native: {
    readSecure: async ({ key }: { key: string }) => ({
      value: state.store.get(key) ?? null,
    }),
    writeSecure: async ({
      key,
      value,
    }: {
      key: string;
      value: string | null;
    }) => {
      if (value === null) state.store.delete(key);
      else state.store.set(key, value);
    },
  },
}));
import { MobileAuth, isAuthCallback } from "../apps/mobile/src/auth";
import { Api } from "../packages/ui/src/client";
function fakeApi() {
  const api = new Api("https://pingo.example.invalid");
  api.post = vi.fn(async (path: string, raw: unknown) => {
    if (path === "mobile-auth/start") {
      state.requested = raw as typeof state.requested;
      return { url: api.base + "/mobile/login" };
    }
    const input = raw as { verifier: string; state: string };
    expect(
      createHash("sha256").update(input.verifier).digest("base64url"),
    ).toBe(state.requested!.challenge);
    expect(input.state).toBe(state.requested!.state);
    state.exchanges++;
    return { access_token: "fake-session-for-test-only" };
  }) as Api["post"];
  return api;
}
function callback() {
  return `app.pingo.mobile://auth/callback?id=${crypto.randomUUID()}&state=${state.requested!.state}&code=test-temporary-code`;
}
beforeEach(() => {
  state.store.clear();
  state.launch = undefined;
  state.opens = [];
  state.exchanges = 0;
  state.requested = undefined;
});
afterEach(() => {
  vi.useRealTimers();
});
it("persists PKCE before opening the browser and consumes a return only once", async () => {
  const api = fakeApi(),
    auth = new MobileAuth(api, vi.fn());
  const login = auth.login();
  await vi.waitFor(() => expect(state.opens).toHaveLength(1));
  expect(state.store.has("login")).toBe(true);
  const url = callback();
  await auth.receive(url);
  await login;
  await auth.receive(url);
  expect(state.exchanges).toBe(1);
  expect(state.store.get("session")).toBe("fake-session-for-test-only");
  expect(state.store.has("login")).toBe(false);
});
it("cold launch restores the attempt and exchanges without a live login promise", async () => {
  const api = fakeApi(),
    first = new MobileAuth(api, vi.fn());
  const login = first.login();
  await vi.waitFor(() => expect(state.opens).toHaveLength(1));
  state.launch = callback();
  const restored = new MobileAuth(api, vi.fn());
  await restored.restore();
  expect(api.token).toBe("fake-session-for-test-only");
  // Finish the original in-memory instance to release its timer in this simulated process.
  await first.receive(state.launch);
  first.resumed();
  const canceled = expect(login).rejects.toThrow("interrompido");
  await canceled;
});
it("rejects unrelated or expired callbacks without consuming the verifier", async () => {
  const api = fakeApi(),
    auth = new MobileAuth(api, vi.fn());
  const login = auth.login();
  await vi.waitFor(() => expect(state.opens).toHaveLength(1));
  await expect(
    auth.receive(callback().replace(state.requested!.state, "wrong")),
  ).rejects.toThrow("não corresponde");
  await expect(login).rejects.toThrow("não corresponde");
  expect(state.exchanges).toBe(0);
  const attempt = JSON.parse(state.store.get("login")!);
  attempt.expiresAt = 1;
  state.store.set("login", JSON.stringify(attempt));
  await expect(auth.receive(callback())).rejects.toThrow("expirou");
  expect(
    isAuthCallback("https://untrusted.example.invalid/auth/callback"),
  ).toBe(false);
});
