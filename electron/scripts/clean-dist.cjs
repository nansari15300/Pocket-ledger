#!/usr/bin/env node
/**
 * electron-builder Windows: pehle `dist/` hatao — warna `app.asar` lock pe "cannot access".
 * Pocket Ledger band / Explorer close; phir bhi fail ho to kuch second retry (Defender/indexer).
 */
const fs = require("fs");
const path = require("path");

const dist = path.join(__dirname, "..", "dist");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clearReadOnlyRecursive(target) {
  if (!fs.existsSync(target)) return;
  try {
    const st = fs.lstatSync(target);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(target)) {
        clearReadOnlyRecursive(path.join(target, name));
      }
    }
    fs.chmodSync(target, 0o666);
  } catch {
    /* best effort */
  }
}

function tryRemoveDist() {
  if (!fs.existsSync(dist)) return true;
  clearReadOnlyRecursive(dist);
  fs.rmSync(dist, { recursive: true, force: true, maxRetries: 3, retryDelay: 400 });
  return !fs.existsSync(dist);
}

async function main() {
  if (!fs.existsSync(dist)) {
    process.exit(0);
  }

  const attempts = 5;
  for (let i = 1; i <= attempts; i++) {
    try {
      if (tryRemoveDist()) {
        console.log("[clean-dist] Removed electron/dist");
        process.exit(0);
      }
    } catch (e) {
      if (i === attempts) {
        const msg = e && typeof e.message === "string" ? e.message : String(e);
        console.error(
          "[clean-dist] Failed to remove electron/dist — koi process file use kar rahi hai.\n" +
            "  → Pocket Ledger / Electron ke saare window band karo (Task Manager → Details → Pocket Ledger.exe)\n" +
            "  → File Explorer me `electron\\dist` ya `win-unpacked` folder band karo\n" +
            "  → Cursor/VS Code me agar purana EXE run/debug ho to band karo\n" +
            "  → Cursor khula ho to `electron\\dist\\...\\app.asar` lock ho sakta hai — `.cursorignore` add hai; phir bhi fail ho to Cursor band karke external PowerShell se `npm run electron:force-clean`\n" +
            "  → PC restart karke turant `npm run electron:build:win` chalao (EXE kholo mat pehle)\n" +
            "  → Lock file: electron\\dist\\win-unpacked\\resources\\app.asar\n" +
            `  → Error: ${msg}`
        );
        process.exit(1);
      }
      await sleep(1500 * i);
    }
  }

  console.error("[clean-dist] dist folder still present after retries.");
  process.exit(1);
}

void main();
