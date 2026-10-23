import { beforeEach, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
const memory = vi.hoisted(() => ({
  row: undefined as undefined | { id: string; value: string; expiresAt: Date },
  created: [] as string[],
}));
vi.mock("../apps/web/src/server/db", () => ({ db: () => database }));
vi.mock("../apps/web/src/server/auth", () => ({
  auth: () => ({
    $context: Promise.resolve({
      internalAdapter: {
        createSession: async (userId: string) => {
          memory.created.push(userId);
          return { token: "fake-native-session" };
        },
      },
    }),
  }),
}));
const database = {
  transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(database),
  select: () => ({
    from: () => ({
      where: () => ({ for: async () => (memory.row ? [memory.row] : []) }),
    }),
  }),
  update: () => ({
    set: (input: { value: string; expiresAt: Date }) => ({
      where: async () => {
        Object.assign(memory.row!, input);
      },
    }),
  }),
  delete: () => ({
    where: async () => {
      memory.row = undefined;
    },
  }),
};
import {
  authorizeDesktop,
  exchangeDesktop,
} from "../apps/web/src/server/desktop-auth";
const verifier = randomBytes(32).toString("base64url"),
  state = randomBytes(32).toString("base64url"),
  challenge = createHash("sha256").update(verifier).digest("base64url"),
  id = crypto.randomUUID();
beforeEach(() => {
  memory.row = {
    id,
    value: JSON.stringify({ challenge, state }),
    expiresAt: new Date(Date.now() + 600000),
  };
  memory.created = [];
});
async function grant() {
  const result = await authorizeDesktop("alice", id, state);
  return {
    id,
    state,
    verifier,
    code: new URL(result.url).searchParams.get("code")!,
  };
}
it("retorno contém só código temporário e guarda somente seu hash", async () => {
  const response = await grant();
  expect(memory.row!.value).not.toContain(response.code);
  expect(memory.row!.value).toContain("codeHash");
  expect(memory.created).toEqual([]);
});
it("desafio incorreto não consome a tentativa e o correto cria uma sessão", async () => {
  const input = await grant();
  await expect(
    exchangeDesktop({
      ...input,
      verifier: randomBytes(32).toString("base64url"),
    }),
  ).rejects.toThrow("inválido");
  expect(memory.row).toBeDefined();
  expect(await exchangeDesktop(input)).toEqual({
    access_token: "fake-native-session",
  });
  expect(memory.created).toEqual(["alice"]);
});
it("não permite repetir a troca de um código consumido", async () => {
  const input = await grant();
  await exchangeDesktop(input);
  await expect(exchangeDesktop(input)).rejects.toThrow("já utilizado");
  expect(memory.created).toHaveLength(1);
});
it("código expirado não cria sessão", async () => {
  const input = await grant();
  memory.row!.expiresAt = new Date(Date.now() - 1);
  await expect(exchangeDesktop(input)).rejects.toThrow("expirado");
  expect(memory.created).toEqual([]);
});
it("state inválido e segunda autorização não vinculam outra conta", async () => {
  await expect(authorizeDesktop("bob", id, "wrong")).rejects.toThrow(
    "inválida",
  );
  await grant();
  await expect(authorizeDesktop("bob", id, state)).rejects.toThrow(
    "já autorizada",
  );
  expect(JSON.parse(memory.row!.value).userId).toBe("alice");
});
