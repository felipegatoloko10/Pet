import { it, expect, vi } from "vitest";
import { seal, unseal } from "../apps/web/src/server/crypto";
import { GoogleClient, GoogleError } from "../apps/web/src/server/google";
it("criptografia não aceita outra conta ou outro provedor", () => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 42).toString(
    "base64",
  );
  const sealed = seal({ key: "segredo" }, "alice", "ai:openai");
  expect(sealed).not.toContain("segredo");
  expect(unseal(sealed, "alice", "ai:openai")).toEqual({ key: "segredo" });
  expect(() => unseal(sealed, "bob", "ai:openai")).toThrow();
  expect(() => unseal(sealed, "alice", "ai:google")).toThrow();
});
it("pagina todas as respostas Google", async () => {
  const transport = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ items: [{ id: "1" }], nextPageToken: "next" }),
    )
    .mockResolvedValueOnce(Response.json({ items: [{ id: "2" }] }));
  const client = new GoogleClient("fake", transport);
  expect(
    await client.pages("https://tasks.googleapis.com/lists", "items"),
  ).toEqual([{ id: "1" }, { id: "2" }]);
  expect(transport.mock.calls[1][0]).toContain("pageToken=next");
});
it.each([401, 403, 429, 500])(
  "trata falha Google %i sem vazar resposta",
  async (status) => {
    const client = new GoogleClient(
      "fake",
      vi
        .fn()
        .mockResolvedValue(new Response("sensitive provider data", { status })),
    );
    await expect(
      client.request("https://tasks.googleapis.com/"),
    ).rejects.toBeInstanceOf(GoogleError);
  },
);
