"use client";

import { useEffect, useRef } from "react";

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth <= 768
  );
}

function isFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as Document & { webkitFullscreenElement?: Element | null; fullscreenElement?: Element | null };
  return !!(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

function requestFullscreen(): void {
  const doc = document.documentElement;
  const req =
    doc.requestFullscreen ??
    (doc as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
  if (req) {
    req.call(doc).catch(() => {
      // Fullscreen requires user gesture on many mobile browsers; handled by one-time listener
    });
  }
}

/**
 * On mobile: enter fullscreen on load/first gesture, and re-enter whenever fullscreen
 * is exited automatically (e.g. on route/menu change). Only the browser's exit-fullscreen
 * icon will keep the app in normal screen until the user taps again.
 */
export function MobileFullscreen() {
  const triedOnGesture = useRef(false);
  const reenterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isMobileDevice()) return;

    const tryFullscreen = () => {
      requestFullscreen();
    };

    tryFullscreen();

    const onUserGesture = () => {
      if (triedOnGesture.current) return;
      triedOnGesture.current = true;
      requestFullscreen();
      document.removeEventListener("click", onUserGesture);
      document.removeEventListener("touchstart", onUserGesture, { capture: true });
    };

    document.addEventListener("click", onUserGesture, { once: true });
    document.addEventListener("touchstart", onUserGesture, { once: true, capture: true });

    const onFullscreenChange = () => {
      if (!isMobileDevice()) return;
      if (isFullscreen()) return;
      if (reenterTimeoutRef.current) {
        clearTimeout(reenterTimeoutRef.current);
        reenterTimeoutRef.current = null;
      }
      reenterTimeoutRef.current = setTimeout(() => {
        reenterTimeoutRef.current = null;
        tryFullscreen();
      }, 100);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("click", onUserGesture);
      document.removeEventListener("touchstart", onUserGesture, { capture: true });
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
      if (reenterTimeoutRef.current) {
        clearTimeout(reenterTimeoutRef.current);
      }
    };
  }, []);

  return null;
}
