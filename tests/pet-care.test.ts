import { expect, it } from "vitest";
import {
  advancePetCare,
  applyCommand,
  defaultPreferences,
  emptyWorkspace,
  initialPetCare,
  normalizeWorkspace,
  petSleeping,
} from "../packages/core/src/index";
const p = { ...defaultPreferences, timezone: "America/Sao_Paulo" };
it("care degrades only while awake and clamps indicators", () => {
  const care = initialPetCare(new Date("2026-10-23T12:00:00Z"));
  expect(
    advancePetCare(care, p, new Date("2026-10-23T14:00:00Z")),
  ).toMatchObject({ satiety: 74, mood: 78, energy: 72 });
  expect(care.energy).toBe(80);
  const later = advancePetCare(care, p, new Date("2026-11-23T12:00:00Z"));
  expect(later.satiety).toBe(0);
  expect(later.energy).toBeGreaterThanOrEqual(0);
});
it("sleep recovers energy and leaves satiety and mood stable", () => {
  const care = {
    ...initialPetCare(new Date("2026-10-24T02:00:00Z")),
    energy: 30,
  };
  expect(
    advancePetCare(care, p, new Date("2026-10-24T06:00:00Z")),
  ).toMatchObject({ satiety: 80, mood: 80, energy: 70 });
});
it("splits at sleep boundaries and nap expiry", () => {
  const start = new Date("2026-10-24T01:00:00Z");
  expect(
    advancePetCare(initialPetCare(start), p, new Date("2026-10-24T03:00:00Z")),
  ).toMatchObject({ satiety: 77, mood: 79, energy: 86 });
  const care = {
    ...initialPetCare(new Date("2026-10-23T12:00:00Z")),
    energy: 50,
    napUntil: "2026-10-23T12:30:00Z",
  };
  expect(
    advancePetCare(care, p, new Date("2026-10-23T13:00:00Z")),
  ).toMatchObject({ energy: 53, satiety: 78.5, mood: 79.5 });
});
it("sleep follows civil time through a daylight-saving change", () => {
  const preferences = { ...p, timezone: "America/New_York" };
  const care = {
    ...initialPetCare(new Date("2026-11-01T03:00:00Z")),
    energy: 0,
  };
  const next = advancePetCare(
    care,
    preferences,
    new Date("2026-11-01T13:00:00Z"),
  );
  expect(next.energy).toBe(100);
  expect(next.satiety).toBe(80);
});
it("feeding, playing, naps and wake use ordinary operations without Google work", () => {
  let w = emptyWorkspace();
  w.petCare = initialPetCare(new Date("2026-10-23T12:00:00Z"));
  w = applyCommand(
    w,
    { type: "pet.care", action: "feed" },
    crypto.randomUUID(),
    "2026-10-23T12:00:00Z",
  );
  expect(w.petCare!.satiety).toBe(100);
  w = applyCommand(
    w,
    { type: "pet.care", action: "play" },
    crypto.randomUUID(),
    "2026-10-23T12:00:00Z",
  );
  expect(w.petCare).toMatchObject({ mood: 80, energy: 80 });
  expect(w.companion!.food).toBe(1);
  w = applyCommand(
    w,
    { type: "pet.care", action: "nap" },
    crypto.randomUUID(),
    "2026-10-23T12:00:00Z",
  );
  expect(petSleeping(w.petCare!, p, new Date("2026-10-23T12:15:00Z"))).toBe(
    true,
  );
  w = applyCommand(
    w,
    { type: "pet.care", action: "wake" },
    crypto.randomUUID(),
    "2026-10-23T12:15:00Z",
  );
  expect(petSleeping(w.petCare!, p, new Date("2026-10-23T12:16:00Z"))).toBe(
    false,
  );
  expect(w.outbox).toEqual([]);
});
it("old clients updating preferences preserve pet state", () => {
  const w = emptyWorkspace();
  normalizeWorkspace(w);
  w.petCare = { ...initialPetCare(), energy: 23 };
  const next = applyCommand(
    w,
    {
      type: "preferences.update",
      preferences: { ...defaultPreferences, name: "Pinguinho" },
    },
    crypto.randomUUID(),
  );
  expect(next.petCare!.energy).toBe(23);
  expect(normalizeWorkspace(next).preferences.name).toBe("Pinguinho");
});
