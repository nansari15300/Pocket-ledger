"use client";

import { useEffect } from "react";

/** Dev only: Test 5 consistency helpers on window. */
export function PlMirrorExportDevBridge() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return;
    void import("@/lib/plMirrorExportDebug").then((mod) => {
      (
        window as unknown as {
          __plDebugCompareMirrorExportConsistency?: typeof mod.debugCompareMirrorExportConsistency;
          __plFingerprintMirrorDocs?: typeof mod.fingerprintMirrorDocs;
        }
      ).__plDebugCompareMirrorExportConsistency = mod.debugCompareMirrorExportConsistency;
      (
        window as unknown as { __plFingerprintMirrorDocs?: typeof mod.fingerprintMirrorDocs }
      ).__plFingerprintMirrorDocs = mod.fingerprintMirrorDocs;
    });
    return () => {
      delete (window as unknown as { __plDebugCompareMirrorExportConsistency?: unknown })
        .__plDebugCompareMirrorExportConsistency;
      delete (window as unknown as { __plFingerprintMirrorDocs?: unknown }).__plFingerprintMirrorDocs;
    };
  }, []);
  return null;
}
