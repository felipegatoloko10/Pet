/** Bind offline cache discovery to the protected session without storing its token. */
export async function petSessionHash(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function cachedPetUser(raw: string | null, sessionHash: string): string | undefined {
  try {
    const identity = JSON.parse(raw ?? "null");
    return identity?.sessionHash === sessionHash && typeof identity.userId === "string"
      ? identity.userId : undefined;
  } catch { return undefined; }
}
