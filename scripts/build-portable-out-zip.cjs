/**
 * Build portable zip: out/ + zero-dep server + Start script.
 * Output: dist-portable/Pocket-Ledger-Portable.zip
 *
 * Usage: npm run build:portable
 *   (pehle npm run build:static agar out/ purana/missing ho)
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "out");
const distRoot = path.join(root, "dist-portable");
const bundleName = "Pocket-Ledger-Portable";
const bundleDir = path.join(distRoot, bundleName);
const zipPath = path.join(distRoot, `${bundleName}.zip`);
const serverSrc = path.join(__dirname, "portable-out-server.cjs");

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function writeStartBat() {
  const bat = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Pocket Ledger (Portable)
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js install karo: https://nodejs.org  ^(LTS^)
  echo  Phir dubara "Start Pocket Ledger.bat" chalao.
  echo.
  pause
  exit /b 1
)
echo Pocket Ledger start ho raha hai...
start "" "http://127.0.0.1:3000/"
node "%~dp0pl-portable-server.cjs"
echo.
echo Server band ho gaya.
pause
`;
  fs.writeFileSync(path.join(bundleDir, "Start Pocket Ledger.bat"), bat, "utf8");
}

function writeReadme() {
  const readme = `Pocket Ledger — Portable (Lite)
================================

Kya chahiye:
  - Windows PC
  - Node.js LTS (https://nodejs.org) — sirf ek baar install

Chalana:
  1. Is folder ko kahin bhi copy/unzip karo (USB, Desktop, etc.)
  2. "Start Pocket Ledger.bat" par double-click
  3. Browser khul jayega: http://127.0.0.1:3000/

Band karna:
  - Kaali command window band karo, ya Ctrl+C

Kya kaam karta hai:
  - Login, ledger, SQLite (browser), backup/restore, remote server se connect
  - Firebase attachments (blob proxy built-in)
  - PDF preview (.mjs MIME sahi)

Kya NAHI karta:
  - Is PC par PL Server host (Electron EXE chahiye)
  - npm run dev jaisa hot reload
  - Next.js server API routes (static build)

Update:
  - Naya zip banao: project me "npm run build:static" phir "npm run build:portable"
`;
  fs.writeFileSync(path.join(bundleDir, "README.txt"), readme, "utf8");
}

function createZip() {
  rmDir(zipPath);
  fs.mkdirSync(distRoot, { recursive: true });
  // tar -a (Windows 10+) — Compress-Archive file-lock issues avoid
  execSync(`tar -a -cf "${zipPath}" -C "${bundleDir}" .`, {
    stdio: "inherit",
    cwd: root,
    shell: true,
  });
}

function formatBytes(n) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function main() {
  if (!fs.existsSync(path.join(outDir, "index.html"))) {
    console.error("[build:portable] out/index.html missing — pehle: npm run build:static");
    process.exit(1);
  }

  console.log("[build:portable] Cleaning old bundle...");
  rmDir(bundleDir);
  fs.mkdirSync(bundleDir, { recursive: true });

  console.log("[build:portable] Copying out/ ...");
  copyDir(outDir, bundleDir);

  console.log("[build:portable] Adding server + start scripts...");
  fs.copyFileSync(serverSrc, path.join(bundleDir, "pl-portable-server.cjs"));
  writeStartBat();
  writeReadme();

  console.log("[build:portable] Creating zip...");
  createZip();

  const zipSize = fs.statSync(zipPath).size;
  console.log("");
  console.log(`[build:portable] Done: ${zipPath}`);
  console.log(`[build:portable] Size: ${formatBytes(zipSize)}`);
  console.log("[build:portable] USB par copy karo → unzip → Start Pocket Ledger.bat");
}

main();
