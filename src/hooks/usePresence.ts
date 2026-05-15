"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { voidUpdateUserPresence } from "@/lib/writeGateway/systemUserFirestore";
import { PRESENCE_HEARTBEAT_INTERVAL_MS } from "@/lib/presenceConstants";

export function usePresence() {
  const { user, customUser } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isOnlineRef = useRef<boolean>(false);

  useEffect(() => {
    if (!user) return;
    // Only run when we know the actual user doc path (profile may live at users/slug_uid). Otherwise
    // we'd update users/uid and get permission error when that doc doesn't exist or is at a slug path.
    if (!customUser?.userDocId) return;
    const userDocId = customUser.userDocId;

    // Set online immediately and start heartbeat — writes sirf gateway (`systemUserFirestore`).
    voidUpdateUserPresence(userDocId, { online: true });
    isOnlineRef.current = true;

    // Heartbeat every 30 seconds (slightly longer to reduce frequency)
    intervalRef.current = setInterval(() => {
      if (isOnlineRef.current) {
        voidUpdateUserPresence(userDocId, { online: true });
      }
    }, PRESENCE_HEARTBEAT_INTERVAL_MS);

    const handleOffline = () => {
      if (isOnlineRef.current) {
        isOnlineRef.current = false;
        voidUpdateUserPresence(userDocId, { online: false });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handleOffline();
      } else if (!isOnlineRef.current) {
        isOnlineRef.current = true;
        voidUpdateUserPresence(userDocId, { online: true });
      }
    };

    window.addEventListener("beforeunload", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      window.removeEventListener("beforeunload", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      handleOffline();
    };
  }, [user, customUser?.userDocId]);

  return null;
}
