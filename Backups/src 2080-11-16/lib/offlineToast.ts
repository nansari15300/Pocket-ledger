"use client";

import { toast as sonnerToast } from "sonner";

/** Shown globally when a save succeeds offline (no loading spinner). */
export const OFFLINE_SAVED_MESSAGE = "Saved. Will sync when online.";

/** Call when offline save is triggered – shows static message instead of loading spinner. */
export function showOfflineSavedToast(title: string = "Saved") {
  sonnerToast.success(title, { description: OFFLINE_SAVED_MESSAGE });
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}
