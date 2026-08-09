"use client";

import { useEffect, useState } from "react";
import {
  clearRestoreCloudPushProgress,
  getRestoreCloudPushProgress,
  isRestoreCloudFileUploadLocked,
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
  // Always start null so SSR HTML matches the first client paint (localStorage is client-only).
  const [progress, setProgress] = useState<RestoreCloudPushProgressState | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setProgress(getRestoreCloudPushProgress());
    return subscribeRestoreCloudPushProgress(setProgress);
  }, []);

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
    if (!isRestoreCloudFileUploadLocked()) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Attachment upload in progress. Wait until the header bar reaches 100% before refreshing.";
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

  if (!mounted || !progress) return null;

  const running = progress.status === "running";
  const failed = progress.status === "failed";
  const paused = progress.status === "paused";
  const complete = progress.status === "complete";
  const pct = Math.min(100, Math.max(0, progress.percent));
  const atFileCap = running && progress.done >= progress.total && progress.total > 0;
  const title = phaseTitle(progress);
  const countLabel =
    progress.total > 1 ? ` (${progress.done}/${progress.total})` : progress.done > 0 ? ` (${progress.done})` : "";

  return (
    <div
      className={`border-b px-3 py-1.5 ${
        failed
          ? "border-destructive/40 bg-destructive/5"
          : paused
            ? "border-amber-500/40 bg-amber-500/5"
            : "border-border/60 bg-background"
      }`}
      role="status"
      aria-live="polite"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="mx-auto max-w-6xl space-y-1">
        <div
          className={`relative h-[14px] w-full overflow-hidden rounded-sm border ${
            failed ? "border-destructive/50" : paused ? "border-amber-500/50" : "border-border shadow-sm"
          }`}
        >
          <div className="absolute inset-0 bg-muted/90" />
          {(running || complete || paused) && pct > 0 ? (
            <div
              className={`absolute inset-y-0 left-0 transition-[width] duration-300 ease-out ${
                complete ? "bg-emerald-600" : paused ? "bg-amber-500" : "bg-emerald-500"
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
                failed ? "text-destructive" : paused ? "text-amber-800 dark:text-amber-300" : "text-black"
              }`}
            >
              {failed
                ? progress.message || "Upload failed — retry when online"
                : paused
                  ? `${title} — paused ${pct}%${countLabel}`
                  : complete
                    ? `${title} — 100% ✓`
                    : atFileCap
                      ? `${title} — finishing…${countLabel}`
                      : `${title} — ${pct}%${countLabel}`}
            </span>
          </div>
        </div>
        {(running || complete || paused) && progress.message ? (
          <p
            className={`truncate text-center text-[10px] leading-tight ${
              failed
                ? "text-destructive"
                : paused
                  ? "text-amber-800 dark:text-amber-300"
                  : complete
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-muted-foreground"
            }`}
          >
            {progress.message}
          </p>
        ) : running && progress.phase === "data" ? (
          <p className="truncate text-center text-[10px] leading-tight text-muted-foreground">
            You can browse the dashboard — cloud sync continues in the background.
          </p>
        ) : running && progress.phase === "files" ? (
          <p className="truncate text-center text-[10px] leading-tight text-muted-foreground">
            You can keep working — files upload in batches of 10. Refresh resumes from the same %.
          </p>
        ) : null}
      </div>
    </div>
  );
}
