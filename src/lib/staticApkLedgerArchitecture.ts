"use client";

import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isEmbeddedOfflinePreloadClient } from "@/lib/isEmbeddedOfflinePreloadClient";

/**
 * Static/APK/EXE embedded shell: ledger reads SQLite-first,
 * writes `writeEntity` -> SQLite + outbox; Firestore snapshots company_docs ko sirf mirror/update karte hain.
 * Normal web (`npm run dev` / cloud) par false — hybrid/live Firestore wahi rehta hai.
 */
export function isStaticApkLedgerTransportMode(): boolean {
  return isStaticAppBuild() || isEmbeddedOfflinePreloadClient();
}
