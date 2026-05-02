/**
 * `dataSourceMode` (localStorage) + build-time flags — ek jagah taaki
 * DataSourceContext, `isLocalOnlyMode`, aur Firestore network toggle sync rahein.
 */

export type DataSourceMode = "firebase" | "local";

/** localStorage key — `DataSourceContext` ke saath match rakho. */
export const DATA_SOURCE_MODE_STORAGE_KEY = "dataSourceMode";

/** Static APK / explicit local-only web: default local; normal web: Firebase (server) pehle. */
export function buildDefaultDataSourceMode(): DataSourceMode {
  if (process.env.NEXT_PUBLIC_STATIC_BUILD === "1") return "local";
  if (process.env.NEXT_PUBLIC_LOCAL_ONLY_MODE === "1") return "local";
  return "firebase";
}

/** Browser: saved mode ya build default; SSR/build: sirf default (window nahi). */
export function getEffectiveDataSourceModeFromWindow(): DataSourceMode {
  if (typeof window === "undefined") return buildDefaultDataSourceMode();
  const raw = window.localStorage.getItem(DATA_SOURCE_MODE_STORAGE_KEY);
  if (raw === "firebase" || raw === "local") return raw;
  return buildDefaultDataSourceMode();
}

/**
 * Local-only paths: SQLite-first company load, fast local auth, mirrored getDocs loop, etc.
 * Static/APK + `NEXT_PUBLIC_LOCAL_ONLY_MODE` hamesha local; web par missing key ab Firebase treat.
 */
export function computeIsLocalOnlyMode(): boolean {
  if (process.env.NEXT_PUBLIC_STATIC_BUILD === "1") return true;
  if (process.env.NEXT_PUBLIC_LOCAL_ONLY_MODE === "1") return true;
  if (typeof window !== "undefined") {
    return getEffectiveDataSourceModeFromWindow() === "local";
  }
  return buildDefaultDataSourceMode() === "local";
}
