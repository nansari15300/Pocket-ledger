
"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

export function usePresence() {
  const { user, customUser } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isOnlineRef = useRef<boolean>(false);

  useEffect(() => {
    if (!user) return;
    // Only run when we know the actual user doc path (profile may live at users/slug_uid). Otherwise
    // we'd update users/uid and get permission error when that doc doesn't exist or is at a slug path.
    if (!customUser?.userDocId) return;
    const userRef = doc(firestore, "users", customUser.userDocId);

    // Set online immediately and start heartbeat
    updateDoc(userRef, {
        online: true,
        lastSeen: serverTimestamp(),
    }).catch(() => {
        // Silently fail if update fails (e.g., user doesn't have permission)
    });
    isOnlineRef.current = true;

    // Heartbeat every 30 seconds (slightly longer to reduce frequency)
    intervalRef.current = setInterval(() => {
        // Only update if still online (avoid unnecessary writes)
        if (isOnlineRef.current) {
            updateDoc(userRef, {
                online: true,
                lastSeen: serverTimestamp(),
            }).catch(() => {
                // Silently fail if update fails
            });
        }
    }, 30000); // Increased to 30 seconds

    const handleOffline = () => {
        if (isOnlineRef.current) {
            isOnlineRef.current = false;
            updateDoc(userRef, {
                online: false,
                lastSeen: serverTimestamp(),
            }).catch(() => {
                // Silently fail if update fails
            });
        }
    };
    
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            handleOffline();
        } else if (!isOnlineRef.current) {
            isOnlineRef.current = true;
            updateDoc(userRef, {
                online: true,
                lastSeen: serverTimestamp(),
            }).catch(() => {
                // Silently fail if update fails
            });
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
      // Attempt to set offline on cleanup, although beforeunload is more reliable
      handleOffline(); 
    };
  }, [user, customUser?.userDocId]);

  // This hook has no return value; it's purely for side effects.
  return null;
}
