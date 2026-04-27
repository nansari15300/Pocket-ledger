"use client";

import { isStaticAppBuild } from "@/lib/isStaticAppBuild";

/**
 * Jab naya company sirf SQLite pe banana ho (Firestore "Online / Local" chooser hi na dikhe).
 * Sirf explicit `NEXT_PUBLIC_LOCAL_ONLY_MODE` — static/Capacitor build me bhi Pro+ user ko online slot ho to
 * Create Company me cloud vs device pick dikhe (`CreateCompanyForm` hasFreeOnlineSlot branch).
 */
export function isForceLocalCompanyCreationBuild(): boolean {
  return process.env.NEXT_PUBLIC_LOCAL_ONLY_MODE === "1";
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
