import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "app.pingo.mobile",
  appName: "Pingo",
  webDir: "dist",
  server: { androidScheme: "https", hostname: "localhost", cleartext: false },
  android: { allowMixedContent: false, backgroundColor: "#edf7f4" },
  plugins: { Keyboard: { resize: "body", resizeOnFullScreen: true } },
};
export default config;
