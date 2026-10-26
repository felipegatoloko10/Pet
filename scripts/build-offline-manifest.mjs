import { readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = new URL("../apps/web/", import.meta.url);
const assets = [];
async function walk(directory, relative = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await walk(join(directory, entry.name), path);
    else if (/\.(js|css|woff2?|ttf)$/.test(path))
      assets.push(`/_next/static/${path}`);
  }
}
await walk(fileURLToPath(new URL(".next/static/", root)));
await writeFile(
  new URL("public/offline-assets.json", root),
  JSON.stringify(assets.sort()),
);
console.log(`${assets.length} recursos preparados para navegação offline.`);
