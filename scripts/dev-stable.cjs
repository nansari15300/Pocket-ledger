#!/usr/bin/env node
/**
 * Stable dev launcher:
 * - Clears stale `.next/dev` cache that can trigger slow compaction loops on Windows.
 * - Forces webpack dev server to avoid Turbopack panic/reload churn in this project.
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
  // Clear only dev cache folder so production build artifacts remain untouched.
  fs.rmSync(devCacheDir, { recursive: true, force: true });
  // eslint-disable-next-line no-console
  console.log("[dev-stable] Cleared .next/dev cache");
} catch (error) {
  // eslint-disable-next-line no-console
  console.warn("[dev-stable] Cache cleanup skipped:", error?.message || error);
}

const devPort = String(process.env.PORT || "3000");
const lanIps = listLanIPv4Addresses();
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
const args = [nextBin, "dev", "--webpack", "--disable-source-maps", "--hostname", "0.0.0.0"];

const child = spawn(process.execPath, args, {
  stdio: "inherit",
  // Keep parent env as-is; only CLI `--webpack` selects bundler to avoid flag conflicts.
  env: { ...process.env },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

