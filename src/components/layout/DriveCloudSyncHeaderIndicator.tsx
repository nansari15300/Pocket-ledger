"use client";

import { RefreshCw } from "lucide-react";
import { useDriveCloudSyncHeaderIndicator } from "@/hooks/useDriveCloudSyncHeaderIndicator";
import { cn } from "@/lib/utils";

/** Drive local company: sync chal raha ho to avatar ke baayein spinning icon. */
export function DriveCloudSyncHeaderIndicator({ className }: { className?: string }) {
  const { showSpinner } = useDriveCloudSyncHeaderIndicator();
  if (!showSpinner) return null;

  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground",
        className
      )}
      title="Syncing with Google Drive…"
      aria-label="Syncing with Google Drive"
      role="status"
    >
      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
    </span>
  );
}
