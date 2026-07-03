import type { NextConfig } from "next";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import withSerwistInit from "@serwist/next";

const isStaticBuild = process.env.STATIC_BUILD === "1";

/** `/~offline` precache busting — git nahi ho to UUID (Firebase CI safe). */
function serwistOfflineRevision(): string {
  try {
    const out = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
    if (out.status === 0 && out.stdout?.trim()) return out.stdout.trim();
  } catch {
    /* noop */
  }
  return randomUUID();
}

/** Turbopack: `path.join(__dirname, …)` → `D:\...` absolute — Windows pe "imports are not implemented"; sirf `./` relative */
const CANVAS_BROWSER_STUB = "./src/stubs/empty-canvas.ts";
const DELETE_COMPANY_STATIC_STUB = "./src/lib/actions/deleteCompanyActionStub.ts";

const baseConfig: NextConfig = {
  // Next.js 16: dev + prod default Turbopack; purana `webpack()` hata kar `turbopack.resolveAlias` — mix par "misconfiguration" fail
  // Dev me React 18 Strict Mode effect 2× run karta hai — kuch navigation side-effects zyada dikhte hain.
  reactStrictMode: false,
  // Pdf.js Turbopack me seedha bundle; SWC transpile se nested bundle clash kam
  transpilePackages: ["pdfjs-dist"],
  // EXE/APK static export: build-time tsc/eslint skip — alag `npm run typecheck` chalao
  ...(isStaticBuild && {
    typescript: { ignoreBuildErrors: true },
    eslint: { ignoreDuringBuilds: true },
  }),
  // Static export only when building for APK (npm run build:static)
  ...(isStaticBuild && { output: "export" }),
  // Electron now serves static export over localhost HTTP, so keep default root asset paths (/_next/*).
  // Relative assetPrefix ("./") breaks nested routes like /dashboard by turning assets into /dashboard/_next/*.
  // APK / http-server: /party/index.html so refresh & deep links 404 kam (trailing slash URLs)
  ...(isStaticBuild && { trailingSlash: true }),
  /** Webpack-only escape: `npm run build:webpack` — Turbopack = default `npm run build` */
  turbopack: {
    resolveAlias: {
      // Browser: pdf.js optional Node canvas — `alias.canvas = false` ka Turbopack equivalent
      canvas: {
        browser: CANVAS_BROWSER_STUB,
      },
      ...(isStaticBuild && {
        "@/lib/actions/deleteCompanyAction": DELETE_COMPANY_STATIC_STUB,
      }),
    },
  },
};

// Hosted/static PWA: Serwist web deploy ke liye. EXE/APK static export par band — har route precache = 10+ min build.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: isStaticBuild,
  additionalPrecacheEntries: [
    { url: "/~offline", revision: serwistOfflineRevision() },
    ...(isStaticBuild ? [{ url: "/~offline/", revision: serwistOfflineRevision() }] : []),
  ],
});

export default withSerwist(baseConfig);
