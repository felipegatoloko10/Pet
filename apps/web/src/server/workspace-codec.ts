import { gzipSync, gunzipSync } from "node:zlib";
import { DomainError, type Workspace } from "@pingo/core";

type Packed = { format: "pingo-gzip-v1"; payload: string };
/** Compression reduces database egress; it is not encryption or an access control. */
export function packWorkspace(w: Workspace): Packed {
  const raw = Buffer.from(JSON.stringify(w));
  if (raw.byteLength > 10_000_000)
    throw new DomainError(
      "size",
      "Seu espaço atingiu o limite de 10 MB do beta. Exporte e arquive dados antigos antes de sincronizar.",
      413,
    );
  return {
    format: "pingo-gzip-v1",
    payload: gzipSync(raw, { level: 6 }).toString("base64"),
  };
}
export function unpackWorkspace(data: Workspace | Packed): Workspace {
  if ("format" in data && data.format === "pingo-gzip-v1") {
    if (data.payload.length > 16_000_000)
      throw new Error("Cópia do espaço acima do limite.");
    return JSON.parse(
      gunzipSync(Buffer.from(data.payload, "base64"), {
        maxOutputLength: 16_000_000,
      }).toString("utf8"),
    );
  }
  return data as Workspace;
}
