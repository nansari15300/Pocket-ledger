"use client";

import { useEffect, useState } from "react";
import {
  isRestoreCloudUploadLocked,
  subscribeRestoreCloudPushProgress,
  RESTORE_CLOUD_PUSH_PROGRESS_EVENT,
} from "@/lib/restoreCloudBackgroundSync";

const PENDING_KEY = "pl_pending_restore_cloud_push_v1";
const RESTORE_LOCK_FALLBACK_POLL_MS = 5_000;

/** Cloud restore upload chal raha ho to company switch + manual reload band. */
export function useRestoreCloudUploadLock(): boolean {
  const [locked, setLocked] = useState(() =>
    typeof window !== "undefined" ? isRestoreCloudUploadLocked() : false
  );

  useEffect(() => {
    const sync = () => setLocked(isRestoreCloudUploadLocked());
    const unsub = subscribeRestoreCloudPushProgress(sync);
    const onStorage = (e: StorageEvent) => {
      if (e.key === PENDING_KEY || e.key === "pl_restore_cloud_push_progress_v1") sync();
    };
    window.addEventListener("storage", onStorage);
    const id = window.setInterval(sync, RESTORE_LOCK_FALLBACK_POLL_MS);
    return () => {
      unsub();
      window.removeEventListener("storage", onStorage);
      window.clearInterval(id);
    };
  }, []);

  return locked;
}
