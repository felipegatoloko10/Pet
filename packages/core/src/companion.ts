import { z } from "zod";
import type { Workspace } from "./index";

export const petItems = [
  {
    id: "bow",
    name: "Laço de carinho",
    at: 1,
    kind: "accessory",
    color: "#FFC8DD",
  },
  {
    id: "cushion",
    name: "Almofada fofinha",
    at: 5,
    kind: "decoration",
    color: "#C9B6FF",
  },
  {
    id: "scarf",
    name: "Lenço do passeio",
    at: 10,
    kind: "accessory",
    color: "#B8E0FF",
  },
  {
    id: "plant",
    name: "Vasinho de amizade",
    at: 20,
    kind: "decoration",
    color: "#A8F0E0",
  },
  {
    id: "cloud",
    name: "Chapéu de nuvem",
    at: 35,
    kind: "accessory",
    color: "#B8E0FF",
  },
  {
    id: "lamp",
    name: "Luz de estrelinha",
    at: 50,
    kind: "decoration",
    color: "#FFF3A8",
  },
  {
    id: "crown",
    name: "Coroa de estrela",
    at: 75,
    kind: "accessory",
    color: "#FFF3A8",
  },
  {
    id: "rug",
    name: "Tapete de nuvem",
    at: 100,
    kind: "decoration",
    color: "#FFC8DD",
  },
] as const;
export const companionSchema = z.object({
  version: z.literal(1),
  startedAt: z.iso.datetime(),
  food: z.number().int().nonnegative().max(1000000),
  rewarded: z.array(z.string().max(250)).max(100000),
  baseline: z.array(z.string().max(250)).max(100000),
  careOperations: z.array(z.string().max(250)).max(100000),
  accessory: z.enum(["bow", "scarf", "cloud", "crown"]).nullable(),
  decorations: z.array(z.enum(["cushion", "plant", "lamp", "rug"])).max(4),
});
export type Companion = z.infer<typeof companionSchema>;
export function activateCompanion(w: Workspace, now: string) {
  if (w.companion) return;
  w.companion = {
    version: 1,
    startedAt: now,
    food: 2,
    rewarded: [],
    baseline: w.tasks.filter((t) => t.completed).map((t) => t.id),
    careOperations: [],
    accessory: null,
    decorations: [],
  };
  if (w.petCare)
    w.petCare = {
      ...w.petCare,
      satiety: Math.max(80, w.petCare.satiety),
      mood: Math.max(80, w.petCare.mood),
      energy: Math.max(80, w.petCare.energy),
      updatedAt: now,
    };
}
export function unlockedItems(w: Workspace) {
  return petItems.filter(
    (item) => item.at <= (w.companion?.rewarded.length ?? 0),
  );
}
