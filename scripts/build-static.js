/**
 * Static build for Capacitor APK.
 * Temporarily removes app/api so Next.js static export succeeds
 * (API routes are not supported with output: 'export').
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const sqlWasmSrc = path.join(root, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
const sqlWasmDest = path.join(root, "public", "sql-wasm.wasm");
const apiPath = path.join(root, "src", "app", "api");
const apiBakPath = path.join(root, ".build-static-bak", "api");
const adminPath = path.join(root, "src", "app", "(admin)");
const adminBakPath = path.join(root, ".build-static-bak", "admin");
const adminComponentsPath = path.join(root, "src", "components", "admin");
const adminComponentsBakPath = path.join(root, ".build-static-bak", "admin-components");
const deleteCompanyPath = path.join(root, "src", "lib", "actions", "deleteCompanyAction.ts");
const deleteCompanyBakPath = path.join(root, ".build-static-bak", "deleteCompanyAction.ts");
const nextStaticPath = path.join(root, ".next", "static");
/** Static APK client bundle — dev `.env.local` localhost billing origin override (billingApiOrigin.ts ke saath). */
const POCKET_LEDGER_HOSTED_API_ORIGIN = "https://pocket-ledger.com";

/** Pehli crashed/interrupted static build — backup bacha ho to dev se pehle source restore karo. */
function restoreStaticBuildBackupsIfOrphaned() {
  if (!fs.existsSync(adminPath) && fs.existsSync(adminBakPath)) {
    fs.mkdirSync(path.dirname(adminPath), { recursive: true });
    copyDir(adminBakPath, adminPath);
    rmDir(adminBakPath);
    console.log("[build-static] Recovered (admin) from .build-static-bak (previous run interrupted)");
  }
  if (!fs.existsSync(adminComponentsPath) && fs.existsSync(adminComponentsBakPath)) {
    fs.mkdirSync(path.dirname(adminComponentsPath), { recursive: true });
    copyDir(adminComponentsBakPath, adminComponentsPath);
    rmDir(adminComponentsBakPath);
    console.log("[build-static] Recovered components/admin from .build-static-bak");
  }
  if (!fs.existsSync(apiPath) && fs.existsSync(apiBakPath)) {
    fs.mkdirSync(path.dirname(apiPath), { recursive: true });
    copyDir(apiBakPath, apiPath);
    rmDir(apiBakPath);
    console.log("[build-static] Recovered api from .build-static-bak");
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) rmDir(p);
    else fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
}

function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Windows file-lock race: short busy-wait is enough here and avoids extra async wiring in this build script.
  }
}

function rmPathRobust(targetPath, options = {}) {
  if (!fs.existsSync(targetPath)) return;
  const attempts = options.attempts ?? 6;
  for (let i = 0; i < attempts; i++) {
    try {
      // Build cache cleanup: recursive+force handles nested files; retry covers transient ENOTEMPTY/EPERM on Windows.
      fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 80 });
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      sleepMs(120 * (i + 1));
    }
  }
}

try {
  restoreStaticBuildBackupsIfOrphaned();

  // Static/offline runtime ke liye sql.js wasm local public asset me copy karo.
  if (fs.existsSync(sqlWasmSrc)) {
    fs.mkdirSync(path.dirname(sqlWasmDest), { recursive: true });
    fs.copyFileSync(sqlWasmSrc, sqlWasmDest);
    console.log("[build-static] Copied public/sql-wasm.wasm for offline local DB");
  } else {
    console.warn("[build-static] sql-wasm.wasm not found in node_modules/sql.js/dist");
  }

  if (fs.existsSync(apiPath)) {
    fs.mkdirSync(path.dirname(apiBakPath), { recursive: true });
    copyDir(apiPath, apiBakPath);
    rmDir(apiPath);
    console.log("[build-static] Removed api (backup in .build-static-bak)");
  }
  if (fs.existsSync(adminPath)) {
    fs.mkdirSync(path.dirname(adminBakPath), { recursive: true });
    copyDir(adminPath, adminBakPath);
    rmDir(adminPath);
    console.log("[build-static] Removed (admin) (backup in .build-static-bak)");
  }
  if (fs.existsSync(adminComponentsPath)) {
    fs.mkdirSync(path.dirname(adminComponentsBakPath), { recursive: true });
    copyDir(adminComponentsPath, adminComponentsBakPath);
    rmDir(adminComponentsPath);
    console.log("[build-static] Removed components/admin (backup in .build-static-bak)");
  }
  if (fs.existsSync(deleteCompanyPath)) {
    fs.mkdirSync(path.dirname(deleteCompanyBakPath), { recursive: true });
    fs.copyFileSync(deleteCompanyPath, deleteCompanyBakPath);
    fs.writeFileSync(deleteCompanyPath, `export * from "./deleteCompanyActionStub";\n`);
    console.log("[build-static] Replaced deleteCompanyAction with stub");
  }

  // Next.js 16+ uses .next/lock; stale file after a crash, or dev+build overlap, blocks build.
  const nextLock = path.join(root, ".next", "lock");
  if (fs.existsSync(nextLock)) {
    try {
      fs.unlinkSync(nextLock);
      console.log("[build-static] Removed .next/lock (was blocking acquire)");
    } catch (e) {
      console.error(
        "[build-static] Cannot remove .next/lock — stop `npm run dev` and any other Next process, then run build again."
      );
      throw e;
    }
  }

  // Next static chunk dir kabhi stale file-handle se ENOTEMPTY deta hai; pre-clean karne se `next build` stable hota hai.
  if (fs.existsSync(nextStaticPath)) {
    try {
      rmPathRobust(nextStaticPath);
      console.log("[build-static] Cleaned .next/static to avoid ENOTEMPTY on Windows");
    } catch (e) {
      console.error("[build-static] Cannot clean .next/static — close Android Studio preview/dev server and retry.");
      throw e;
    }
  }

  try {
    // Production entitlements mirror: pocket-ledger.com (ya env) se plans JSON — static APK/Electron offline billing
    execSync("node scripts/fetch-plans-seed-static.cjs", {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env },
    });
  } catch (e) {
    console.warn("[build-static] plans-seed step non-fatal:", e && e.message ? e.message : e);
  }

  // Turbopack (Next 16 default); pdf alias `next.config` `turbopack.resolveAlias` me — purana `--webpack` hata
  execSync("node --max-old-space-size=4096 ./node_modules/next/dist/bin/next build", {
    cwd: root,
    stdio: "inherit",
    // NEXT_PUBLIC_* inlined into client bundle so static APK/Electron use query-based master-detail + Report header
    // Dev `.env.local` localhost billing origin APK me mat jaye — hosted API hamesha production.
    env: {
      ...process.env,
      STATIC_BUILD: "1",
      NEXT_PUBLIC_STATIC_BUILD: "1",
      NEXT_PUBLIC_BILLING_API_ORIGIN: POCKET_LEDGER_HOSTED_API_ORIGIN,
    },
  });

  // Capacitor / some static hosts: unknown path → 404.html; SPA bootstrap se app wapas load
  const outDir = path.join(root, "out");
  const indexHtml = path.join(outDir, "index.html");
  const notFoundHtml = path.join(outDir, "404.html");
  if (fs.existsSync(indexHtml)) {
    fs.copyFileSync(indexHtml, notFoundHtml);
    console.log("[build-static] out/404.html copied from index.html (fallback refresh)");
  }
} finally {
  if (fs.existsSync(apiBakPath)) {
    fs.mkdirSync(path.dirname(apiPath), { recursive: true });
    copyDir(apiBakPath, apiPath);
    rmDir(apiBakPath);
    console.log("[build-static] Restored api");
  }
  if (fs.existsSync(adminBakPath)) {
    fs.mkdirSync(path.dirname(adminPath), { recursive: true });
    copyDir(adminBakPath, adminPath);
    rmDir(adminBakPath);
    console.log("[build-static] Restored (admin)");
  }
  if (fs.existsSync(adminComponentsBakPath)) {
    fs.mkdirSync(path.dirname(adminComponentsPath), { recursive: true });
    copyDir(adminComponentsBakPath, adminComponentsPath);
    rmDir(adminComponentsBakPath);
    console.log("[build-static] Restored components/admin");
  }
  if (fs.existsSync(deleteCompanyBakPath)) {
    fs.copyFileSync(deleteCompanyBakPath, deleteCompanyPath);
    fs.unlinkSync(deleteCompanyBakPath);
    console.log("[build-static] Restored deleteCompanyAction");
  }
  const bakDir = path.join(root, ".build-static-bak");
  if (fs.existsSync(bakDir) && fs.readdirSync(bakDir).length === 0) {
    fs.rmdirSync(bakDir);
  }
}
