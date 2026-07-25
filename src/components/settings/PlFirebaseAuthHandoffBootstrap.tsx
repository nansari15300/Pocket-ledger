"use client";

import { useEffect, useRef } from "react";
import {
  applyPlFirebaseHandoffCustomToken,
  readAndStripPlFirebaseHandoffFromLanding,
} from "@/lib/plFirebaseAuthHandoff";
import { hasRealFirebaseAuthSession, waitForFirebaseAuthReady } from "@/lib/firebaseAuthForApi";

/** PL server URL landing: preserve Google login from app UI origin (3000 → 3001). */
export function PlFirebaseAuthHandoffBootstrap() {
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current) return;
    appliedRef.current = true;
    void (async () => {
      await waitForFirebaseAuthReady();
      if (hasRealFirebaseAuthSession()) return;
      const customToken = readAndStripPlFirebaseHandoffFromLanding();
      if (!customToken) return;
      await applyPlFirebaseHandoffCustomToken(customToken);
    })();
  }, []);

  return null;
}
