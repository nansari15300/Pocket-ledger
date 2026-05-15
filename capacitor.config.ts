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

/**
 * Bundled APK WebView origin stable rakho (`https://localhost`) taaki Firebase Storage bucket CORS me
 * `https://localhost` allow karke `fetch`/SDK requests block na hon (EXE = Electron localhost:port, alag origin).
 */
const serverConfig = useRemoteWeb
  ? {
      url: readRemoteServerUrl()!,
      cleartext: false,
      androidScheme: "https" as const,
      hostname: "localhost",
    }
  : {
      androidScheme: "https" as const,
      hostname: "localhost",
    };

const config: CapacitorConfig = {
  appId: "com.pocketledger.app",
  appName: "Pocket Ledger",
  webDir: "out",
  server: serverConfig,
};

export default config;
