"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  getLastOnlineAt,
  setLastOnlineAt,
  isOfflineGraceExpired,
  getOfflineDaysRemaining,
  OFFLINE_GRACE_DAYS,
} from "@/lib/offlineGraceClient";

type OfflineGraceContextValue = {
  /** True if offline and 7-day grace has ended; app should show block overlay. */
  isExpired: boolean;
  /** Days left in offline grace (0 when expired or when online). */
  daysRemaining: number;
  /** Call when we've confirmed device is online (e.g. after successful ping); resets the 7-day window. */
  markOnline: () => void;
};

const OfflineGraceContext = createContext<OfflineGraceContextValue | null>(null);

function useOfflineGraceState() {
  const [isExpired, setIsExpired] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState(OFFLINE_GRACE_DAYS);

  const refresh = useCallback(() => {
    const online = typeof navigator !== "undefined" && navigator.onLine;
    if (online) {
      setIsExpired(false);
      setDaysRemaining(OFFLINE_GRACE_DAYS);
      return;
    }
    const expired = isOfflineGraceExpired();
    setIsExpired(expired);
    setDaysRemaining(getOfflineDaysRemaining());
  }, []);

  return { isExpired, daysRemaining, refresh };
}

export function OfflineGraceProvider({ children }: { children: React.ReactNode }) {
  const { isExpired, daysRemaining, refresh } = useOfflineGraceState();

  const markOnline = useCallback(() => {
    setLastOnlineAt();
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // On mount: if online, set last online now (so next offline period starts from here)
    if (navigator.onLine) {
      setLastOnlineAt();
    } else {
      // If no previous value, set now so user gets 7 days from first run
      if (getLastOnlineAt() == null) setLastOnlineAt();
    }
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => {
      setLastOnlineAt();
      refresh();
    };
    const handleOffline = () => refresh();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refresh]);

  // When offline, re-check expiry every minute
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine) return;
    const interval = setInterval(refresh, 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  const value: OfflineGraceContextValue = {
    isExpired,
    daysRemaining,
    markOnline,
  };

  return (
    <OfflineGraceContext.Provider value={value}>
      {children}
      {isExpired && <OfflineGraceExpiredOverlay />}
    </OfflineGraceContext.Provider>
  );
}

export function useOfflineGrace(): OfflineGraceContextValue {
  const ctx = useContext(OfflineGraceContext);
  if (!ctx) {
    return {
      isExpired: false,
      daysRemaining: OFFLINE_GRACE_DAYS,
      markOnline: () => {},
    };
  }
  return ctx;
}

function OfflineGraceExpiredOverlay() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 p-4"
      aria-modal
      role="alertdialog"
      aria-labelledby="offline-grace-title"
    >
      <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-lg">
        <h2 id="offline-grace-title" className="text-lg font-semibold text-foreground">
          Offline period ended
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You can use the app offline for up to {OFFLINE_GRACE_DAYS} days. Please connect to the
          internet to continue. When you’re back online, your {OFFLINE_GRACE_DAYS}-day period will
          reset.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Connect this device to the internet and refresh or reopen the app.
        </p>
      </div>
    </div>
  );
}
