import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Default: bundled `webDir` (out) — full offline-ish native shell (APK / store).
 *
 * QA / iterate bina APK-repack: sync se pehle env rakho —
 * `CAP_USE_REMOTE_WEB=1` + `CAP_REMOTE_WEB_URL=https://pocket-ledger.com`
 * (ya `npm run cap:sync:remote` jo script me default URL set karti hai).
 * Phir Gradle se jo APK/WebView khulegi woh **seedha HTTPS** se page load karti hai; server par deploy karke turant refresh.
 */
function readRemoteServerUrl(): string | undefined {
  const raw =
    typeof process.env.CAP_REMOTE_WEB_URL === "string" ? process.env.CAP_REMOTE_WEB_URL.trim() : "";
  return raw.replace(/\/+$/, "") || undefined;
}

const useRemoteWeb = process.env.CAP_USE_REMOTE_WEB === "1" && Boolean(readRemoteServerUrl());

const config: CapacitorConfig = {
  appId: "com.pocketledger.app",
  appName: "Pocket Ledger",
  webDir: "out",
  ...(useRemoteWeb
    ? {
        server: {
          url: readRemoteServerUrl()!,
          /** HTTPS host — LAN par plain HTTP ho to `cleartext: true` + CAP_REMOTE_HTTP flow alag rakho */
          cleartext: false,
          androidScheme: "https",
        },
      }
    : {}),
};

export default config;
