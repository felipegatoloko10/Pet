import { randomBytes } from "node:crypto";
import { readFile, writeFile, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve, join } from "node:path";
const folder = resolve(".verification/android-private");
const configFile = join(folder, "signing.json"),
  keystore = join(folder, "pingo-release.jks");
const mode = process.argv[2];
async function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  input?: string,
) {
  const child = spawn(command, args, {
    env,
    stdio: ["pipe", "ignore", "pipe"],
    windowsHide: true,
  });
  let error = "";
  child.stderr.on("data", (chunk) => {
    error += chunk;
  });
  child.stdin.end(input ?? "");
  const exit = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (exit !== 0)
    throw new Error(
      `A operação ${args[0]} falhou. Consulte a configuração local; nenhum segredo foi exibido.`,
    );
}
if (mode === "init") {
  try {
    await access(configFile);
    console.log("Assinatura existente preservada.");
  } catch {
    const password = randomBytes(32).toString("base64url");
    const env = {
      ...process.env,
      PINGO_ANDROID_STORE_PASSWORD: password,
      PINGO_ANDROID_KEY_PASSWORD: password,
    };
    await run(
      join(
        process.env.JAVA_HOME!,
        "bin",
        process.platform === "win32" ? "keytool.exe" : "keytool",
      ),
      [
        "-genkeypair",
        "-keystore",
        keystore,
        "-storetype",
        "PKCS12",
        "-alias",
        "pingo",
        "-storepass:env",
        "PINGO_ANDROID_STORE_PASSWORD",
        "-keypass:env",
        "PINGO_ANDROID_KEY_PASSWORD",
        "-keyalg",
        "RSA",
        "-keysize",
        "3072",
        "-validity",
        "10000",
        "-dname",
        "CN=Pingo Beta,OU=Pingo,O=Pingo,L=Brasil,C=BR",
      ],
      env,
    );
    await writeFile(configFile, JSON.stringify({ password }));
    console.log(
      "Chave criada na pasta privada. Guarde uma cópia protegida para futuras atualizações.",
    );
  }
} else if (mode === "github") {
  const { password } = JSON.parse(await readFile(configFile, "utf8"));
  const values: Record<string, string> = {
    PINGO_ANDROID_KEYSTORE_BASE64: (await readFile(keystore)).toString(
      "base64",
    ),
    PINGO_ANDROID_STORE_PASSWORD: password,
    PINGO_ANDROID_KEY_PASSWORD: password,
  };
  for (const [name, value] of Object.entries(values))
    await run(
      "gh",
      ["secret", "set", name, "--repo", "felipegatoloko10/Pet"],
      process.env,
      value,
    );
  console.log(
    "Três segredos Android configurados no repositório Pet. Nenhum valor exibido.",
  );
} else if (mode === "build") {
  const { password } = JSON.parse(await readFile(configFile, "utf8"));
  const child = spawn(
    process.platform === "win32" ? "cmd.exe" : "sh",
    process.platform === "win32"
      ? [
          "/d",
          "/c",
          "gradlew.bat :app:assembleRelease :app:testDebugUnitTest --max-workers=1 -Dorg.gradle.jvmargs=-Xmx768m --console=plain",
        ]
      : [
          "./gradlew",
          ":app:assembleRelease",
          ":app:testDebugUnitTest",
          "--max-workers=1",
          "-Dorg.gradle.jvmargs=-Xmx768m",
          "--console=plain",
        ],
    {
      cwd: "apps/mobile/android",
      env: {
        ...process.env,
        PINGO_ANDROID_KEYSTORE: keystore,
        PINGO_ANDROID_STORE_PASSWORD: password,
        PINGO_ANDROID_KEY_PASSWORD: password,
      },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  process.exitCode =
    (await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    })) ?? 1;
} else
  throw new Error(
    "Use init, github ou build. A pasta privada deve ter permissões restritas antes de inicializar.",
  );
