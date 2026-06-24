"use client";

import { useEffect, useState } from "react";
import {
  clearRestoreCloudPushProgress,
  getRestoreCloudPushProgress,
  isRestoreCloudUploadLocked,
  subscribeRestoreCloudPushProgress,
  type RestoreCloudPushProgressState,
} from "@/lib/restoreCloudBackgroundSync";

function phaseTitle(progress: RestoreCloudPushProgressState): string {
  const name = progress.companyName ? `: ${progress.companyName}` : "";
  if (progress.phase === "sync") return `Syncing local cache${name}`;
  if (progress.phase === "files") return `Uploading attachments${name}`;
  return `Uploading company data${name}`;
}

/** Header ke niche progress — running detail + complete summary. */
export function RestoreCloudPushGlobalBanner() {
  const [progress, setProgress] = useState<RestoreCloudPushProgressState | null>(() =>
    typeof window !== "undefined" ? getRestoreCloudPushProgress() : null
  );

  useEffect(() => subscribeRestoreCloudPushProgress(setProgress), []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "pl_restore_cloud_push_progress_v1") {
        setProgress(getRestoreCloudPushProgress());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!isRestoreCloudUploadLocked()) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Cloud restore upload in progress. Wait until complete before leaving.";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [progress]);

  useEffect(() => {
    if (progress?.status !== "complete") return;
    const t = window.setTimeout(() => {
      clearRestoreCloudPushProgress();
      setProgress(null);
    }, 10_000);
    return () => window.clearTimeout(t);
  }, [progress?.status, progress?.companyId]);

  if (!progress) return null;

  const running = progress.status === "running";
  const failed = progress.status === "failed";
  const complete = progress.status === "complete";
  const pct = Math.min(100, Math.max(0, progress.percent));
  const title = phaseTitle(progress);
  const countLabel =
    progress.total > 1 ? ` (${progress.done}/${progress.total})` : progress.done > 0 ? ` (${progress.done})` : "";

  return (
    <div
      className={`border-b px-3 py-1.5 ${failed ? "border-destructive/40 bg-destructive/5" : "border-border/60 bg-background"}`}
      role="status"
      aria-live="polite"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="mx-auto max-w-6xl space-y-1">
        <div
          className={`relative h-[14px] w-full overflow-hidden rounded-sm border ${
            failed ? "border-destructive/50" : "border-border shadow-sm"
          }`}
        >
          <div className="absolute inset-0 bg-muted/90" />
          {(running || complete) && pct > 0 ? (
            <div
              className={`absolute inset-y-0 left-0 transition-[width] duration-300 ease-out ${
                complete ? "bg-emerald-600" : "bg-emerald-500"
              } ${running ? "animate-pulse" : ""}`}
              style={{ width: `${pct}%` }}
            />
          ) : null}
          <div className="relative z-10 flex h-full items-center justify-center gap-1.5 px-2">
            {running ? (
              <span
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 animate-pulse"
                aria-hidden
              />
            ) : null}
            <span
              className={`truncate text-[10px] font-semibold leading-none ${
                failed ? "text-destructive" : pct > 45 && !failed ? "text-white drop-shadow-sm" : "text-foreground"
              }`}
            >
              {failed
                ? progress.message || "Upload failed — retry when online"
                : complete
                  ? `${title} — 100% ✓`
                  : `${title} — ${pct}%${countLabel}`}
            </span>
          </div>
        </div>
        {(running || complete) && progress.message ? (
          <p
            className={`truncate text-center text-[10px] leading-tight ${
              failed ? "text-destructive" : complete ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
            }`}
          >
            {progress.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
