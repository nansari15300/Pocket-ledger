"use client";

import { useEffect } from "react";

/** Dev only: Test 5 consistency helpers on window. */
export function PlDeltaExportDevBridge() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return;
    void import("@/lib/plDeltaExportDebug").then((mod) => {
      (
        window as unknown as {
          __plDebugCompareDeltaExportConsistency?: typeof mod.debugCompareDeltaExportConsistency;
          __plFingerprintDeltaDocs?: typeof mod.fingerprintDeltaDocs;
        }
      ).__plDebugCompareDeltaExportConsistency = mod.debugCompareDeltaExportConsistency;
      (
        window as unknown as { __plFingerprintDeltaDocs?: typeof mod.fingerprintDeltaDocs }
      ).__plFingerprintDeltaDocs = mod.fingerprintDeltaDocs;
    });
    return () => {
      delete (window as unknown as { __plDebugCompareDeltaExportConsistency?: unknown })
        .__plDebugCompareDeltaExportConsistency;
      delete (window as unknown as { __plFingerprintDeltaDocs?: unknown }).__plFingerprintDeltaDocs;
    };
  }, []);
  return null;
}
