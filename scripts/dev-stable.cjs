#!/usr/bin/env node
/**
 * Stable dev launcher:
 * - Clears stale `.next/dev` cache (Windows slow compaction).
 * - Next.js 16 default = Turbopack; purana `--webpack` hata — pdf.js + HMR zyada consistent.
 * - Disables source maps in dev to reduce CPU spikes on heavy pages.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

/** Next bind 0.0.0.0 pe karta hai; CLI me "Network: 0.0.0.0" useless — LAN pe phone se open karne ke liye yeh IPv4 nikalte hain. */
function listLanIPv4Addresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const fam = net.family;
      const isV4 = fam === "IPv4" || fam === 4;
      if (isV4 && !net.internal) out.push(net.address);
    }
  }
  return out;
}

const projectRoot = process.cwd();
const devCacheDir = path.join(projectRoot, ".next", "dev");

try {
  // Default: Turbopack incremental cache rakho — har `npm run dev` par full recompile avoid.
  // Stuck HMR / corrupt cache ho to: `$env:DEV_CLEAR_NEXT_CACHE=1; npm run dev` (PowerShell)
  if (process.env.DEV_CLEAR_NEXT_CACHE === "1") {
    fs.rmSync(devCacheDir, { recursive: true, force: true });
    // eslint-disable-next-line no-console
    console.log("[dev-stable] Cleared .next/dev cache (DEV_CLEAR_NEXT_CACHE=1)");
  }
} catch (error) {
  // eslint-disable-next-line no-console
  console.warn("[dev-stable] Cache cleanup skipped:", error?.message || error);
}

// Force 3000 in dev so preview/cache behavior matches production debugging baseline.
const devPort = "3000";
const lanIps = listLanIPv4Addresses();
// eslint-disable-next-line no-console
console.log(`[dev-stable] Local dev → http://localhost:${devPort}`);
if (lanIps.length) {
  // eslint-disable-next-line no-console
  console.log("[dev-stable] LAN — same Wi‑Fi / cable devices par yeh URL use karo (Next ka 0.0.0.0 yahan replace):");
  for (const ip of lanIps) {
    // eslint-disable-next-line no-console
    console.log(`           http://${ip}:${devPort}`);
  }
} else {
  // eslint-disable-next-line no-console
  console.log("[dev-stable] Koi non-internal IPv4 nahi mila — VPN off karke dobara try karo ya localhost use karo.");
}

const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
// Explicit `--turbopack` (Next 16 default bhi yahi); `--webpack` mat — user/Turbopack-first
const args = [
  nextBin,
  "dev",
  "--turbopack",
  "--disable-source-maps",
  "--hostname",
  "0.0.0.0",
  "--port",
  devPort,
];

const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: devPort,
    /** Browser Settings → Server: dev API (`/api/dev-pl-local-server`) — client bundle me inline */
    NEXT_PUBLIC_PL_DEV_LOCAL_SERVER: "1",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

