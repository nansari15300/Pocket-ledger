import type { CapacitorConfig } from "@capacitor/cli";

/** Hamesha bundled `webDir` (out) — remote `server.url` band: full native APK, offline-capable shell. */
const config: CapacitorConfig = {
  appId: "com.pocketledger.app",
  appName: "Pocket Ledger",
  webDir: "out",
};

export default config;
