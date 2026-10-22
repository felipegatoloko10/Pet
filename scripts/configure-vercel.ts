import { readFile } from "node:fs/promises";
import { parse } from "dotenv";
import { spawn } from "node:child_process";
import { join } from "node:path";
const file = process.argv[2];
if (!file) throw new Error("Informe um arquivo privado de ambiente.");
const environment = parse(await readFile(file));
const allowed = new Set([
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "CREDENTIAL_ENCRYPTION_KEY",
  "SCHEDULER_SECRET",
  "SCHEDULER_URL",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
]);
const variables = Object.entries(environment)
  .filter(([key, value]) => allowed.has(key) && !!value)
  .map(([key, value]) => ({
    key,
    value,
    type:
      key === "BETTER_AUTH_URL" || key === "VAPID_PUBLIC_KEY"
        ? "plain"
        : "sensitive",
    target: ["production"],
  }));
const cli =
  process.env.VERCEL_CLI_PATH ??
  join(process.env.APPDATA ?? "", "npm/node_modules/vercel/dist/vc.js");
for (const variable of variables) {
  const child = spawn(
    process.execPath,
    [
      cli,
      "env",
      "add",
      variable.key,
      "production",
      "--type",
      variable.type === "plain" ? "config" : "secret",
      "--yes",
      "--force",
      "--project",
      "prj_0bvhyO6ZNX6kjyjWKz1ukZP1ukPD",
      "--scope",
      "feh-team",
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let error = "";
  child.stderr.on("data", (chunk) => {
    error += chunk;
  });
  child.stdin.end(variable.value);
  const exit = await new Promise<number | null>((resolve) =>
    child.on("close", resolve),
  );
  if (exit !== 0)
    throw new Error(
      "Falha Vercel: " +
        variables
          .reduce((s, v) => s.split(v.value).join("[redigido]"), error)
          .slice(0, 1200),
    );
}
console.log(
  `${variables.length} variáveis configuradas em feh-team/pingo, produção. Nenhum valor foi exibido.`,
);
