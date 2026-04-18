"use client";

import { isStaticAppBuild } from "@/lib/isStaticAppBuild";

/**
 * Jab naya company sirf SQLite pe banana ho (Firestore choice hi na dikhe).
 * `isLocalOnlyMode()` se alag: default `dataSourceMode`/local-first browse se yeh false rehta hai,
 * taaki web user "online company" create kar sake jab plan me slot ho.
 */
export function isForceLocalCompanyCreationBuild(): boolean {
  if (process.env.NEXT_PUBLIC_LOCAL_ONLY_MODE === "1") return true;
  return isStaticAppBuild();
}

/** Local-only mode: static build ya env-flag web (login still required). */
export function isLocalOnlyMode(): boolean {
  if (typeof window !== "undefined") {
    const mode = window.localStorage.getItem("dataSourceMode");
    // Local-first default: missing key bhi local treat karo to startup me accidental Firestore listeners na lage.
    if (!mode || mode === "local") return true;
  }
  if (isStaticAppBuild()) return true;
  if (process.env.NEXT_PUBLIC_LOCAL_ONLY_MODE === "1") return true;
  return false;
}
