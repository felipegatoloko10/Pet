import { describe, expect, it } from "vitest";
import { cachedPetUser, petSessionHash } from "../apps/desktop/src/pet-cache";

describe("avatar offline account identity", () => {
  it("restores a user's cache only for the same protected session", async () => {
    const hash = await petSessionHash("test-session-one");
    const record = JSON.stringify({ userId: "alice", sessionHash: hash });
    expect(record).not.toContain("test-session-one");
    expect(cachedPetUser(record, await petSessionHash("test-session-one"))).toBe("alice");
    expect(cachedPetUser(record, await petSessionHash("test-session-two"))).toBeUndefined();
  });
  it("ignores missing, corrupt or legacy unbound account records", () => {
    for (const raw of [null, "broken", '"alice"', '{"userId":"alice"}'])
      expect(cachedPetUser(raw, "current-session-hash")).toBeUndefined();
  });
});
