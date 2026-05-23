/**
 * True when bundle was built with `npm run build:static` (Capacitor APK / static Electron).
 * Inlined at build time via NEXT_PUBLIC_STATIC_BUILD in scripts/build-static.js.
 *
 * Plan sync policy: static builds par local-only mode me bhi online server plan sync chalna chahiye — `planSyncClientPolicy.ts`.
 */
export function isStaticAppBuild(): boolean {
  return process.env.NEXT_PUBLIC_STATIC_BUILD === "1";
}
