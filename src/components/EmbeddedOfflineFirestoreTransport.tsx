"use client";

/**
 * APK/static/EXE: `navigator` offline hone par Firestore network disable — Write/Listen ERR spam + save hang kam.
 * Online par enable taaki outbox flush / plan sync chal sake (company ledger ab bhi SQLite-first).
 */

import { useEffect } from "react";
import { isEmbeddedOfflinePreloadClient } from "@/lib/isEmbeddedOfflinePreloadClient";
import { syncEmbeddedFirestoreTransportFromNavigator } from "@/lib/firebase";

export function EmbeddedOfflineFirestoreTransport() {
  useEffect(() => {
    if (!isEmbeddedOfflinePreloadClient()) return;
    const apply = () => {
      void syncEmbeddedFirestoreTransportFromNavigator();
    };
    apply();
    window.addEventListener("online", apply);
    window.addEventListener("offline", apply);
    return () => {
      window.removeEventListener("online", apply);
      window.removeEventListener("offline", apply);
    };
  }, []);
  return null;
}
