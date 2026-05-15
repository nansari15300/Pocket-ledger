"use client";

import { isStaticAppBuild } from "@/lib/isStaticAppBuild";

/**
 * `NEXT_PUBLIC_STATIC_BUILD=1` (Capacitor / static shell): ledger reads SQLite-first,
 * writes `writeEntity` → SQLite + outbox; Firestore snapshots company_docs ko sirf mirror/update karte hain.
 * Normal web (`npm run dev` / cloud) par false — hybrid/live Firestore wahi rehta hai.
 */
export function isStaticApkLedgerTransportMode(): boolean {
  return isStaticAppBuild();
}
