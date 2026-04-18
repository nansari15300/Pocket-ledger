/**
 * True when bundle was built with `npm run build:static` (Capacitor APK / static Electron).
 * Inlined at build time via NEXT_PUBLIC_STATIC_BUILD in scripts/build-static.js.
 */
export function isStaticAppBuild(): boolean {
  return process.env.NEXT_PUBLIC_STATIC_BUILD === "1";
}
