import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
function key() {
  const k = Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY ?? "", "base64");
  if (k.length !== 32)
    throw new Error("Criptografia do servidor indisponível.");
  return k;
}
export function seal(value: unknown, userId: string, kind: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`${userId}:${kind}`));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}
export function unseal<T>(value: string, userId: string, kind: string): T {
  const [v, iv, tag, data] = value.split(".");
  if (v !== "v1") throw new Error("Versão de chave desconhecida.");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  cipher.setAAD(Buffer.from(`${userId}:${kind}`));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(data, "base64url")),
      cipher.final(),
    ]).toString(),
  );
}
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export function secretEqual(a: string, b: string) {
  const x = Buffer.from(digest(a)),
    y = Buffer.from(digest(b));
  return timingSafeEqual(x, y);
}
