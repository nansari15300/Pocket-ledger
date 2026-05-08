#!/usr/bin/env node
/**
 * electron-builder Windows: pehle `dist/` hatao — warna `app.asar` lock pe "cannot access".
 * Pocket Ledger ya purana unpack band karke phir npm run clean-dist / build chalao.
 */
const fs = require("fs");
const path = require("path");

const dist = path.join(__dirname, "..", "dist");

if (!fs.existsSync(dist)) {
  process.exit(0);
}

try {
  fs.rmSync(dist, { recursive: true, force: true });
  console.log("[clean-dist] Removed electron/dist");
} catch (e) {
  const msg = e && typeof e.message === "string" ? e.message : String(e);
  console.error(
    "[clean-dist] Failed to remove electron/dist — koi process file use kar rahi hai.\n" +
      "  → Pocket Ledger / Electron ke saare window band karo\n" +
      "  → File Explorer me agar `electron\\dist` khula ho to band karo\n" +
      "  → Task Manager se bachi `Pocket Ledger` / `Electron` process end karo\n" +
      `  → Error: ${msg}`
  );
  process.exit(1);
}
