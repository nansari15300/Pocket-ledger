import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Remote-URL APK: build/run se pehle env lagao —
 * PowerShell: `$env:CAP_USE_REMOTE_WEB='1'; npx cap sync android`
 * bash:       `CAP_USE_REMOTE_WEB=1 npx cap sync android`
 * Optional override: `CAP_REMOTE_WEB_URL=https://www.pocket-ledger.com`
 * Bundled `out` APK (offline shell) ke liye env MAT lagao ya `CAP_USE_REMOTE_WEB` hata do.
 */
const useRemoteWeb =
  typeof process !== "undefined" && String(process.env.CAP_USE_REMOTE_WEB || "").trim() === "1";
const remoteWebUrl =
  String(process.env.CAP_REMOTE_WEB_URL || "").trim() || "https://pocket-ledger.com";

const config: CapacitorConfig = {
  appId: "com.pocketledger.app",
  appName: "Pocket Ledger",
  webDir: "out",
  ...(useRemoteWeb
    ? {
        server: {
          url: remoteWebUrl,
          androidScheme: "https",
        },
      }
    : {}),
};

export default config;
