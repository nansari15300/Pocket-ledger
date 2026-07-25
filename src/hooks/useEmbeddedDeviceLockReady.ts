"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useEmbeddedDeviceLockSession } from "@/contexts/EmbeddedDeviceLockSessionContext";
import {
  EMBEDDED_DEVICE_LOCK_CHANGED_EVENT,
  isEmbeddedDeviceLockShell,
  isEmbeddedSessionUnlocked,
  shouldDeferEmbeddedHeavyAppBoot,
} from "@/lib/embeddedDeviceLock";

/** EXE/APK: PIN gate + auth settle ke baad hi SQLite / sync / company tree boot karo. */
export function useEmbeddedDeviceLockReady(): boolean {
  const { user, loading } = useAuth();
  const { unlockedNow } = useEmbeddedDeviceLockSession();
  const [bump, setBump] = useState(0);

  useEffect(() => {
    if (!isEmbeddedDeviceLockShell()) return;
    const onChange = () => setBump((n) => n + 1);
    window.addEventListener(EMBEDDED_DEVICE_LOCK_CHANGED_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EMBEDDED_DEVICE_LOCK_CHANGED_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return useMemo(() => {
    void bump;
    if (!isEmbeddedDeviceLockShell()) return true;
    const sessionUnlocked = unlockedNow || isEmbeddedSessionUnlocked();
    return !shouldDeferEmbeddedHeavyAppBoot({
      authLoading: loading,
      firebaseUid: user?.uid ?? "",
      sessionUnlocked,
    });
  }, [loading, user?.uid, bump, unlockedNow]);
}
