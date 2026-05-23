"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { CompanyBackupProgress } from "@/lib/companyBackupCore";

type Props = {
  progress: CompanyBackupProgress;
  spinning?: boolean;
  compact?: boolean;
  /** Card wrapper — Backup page par full-width progress block. */
  inCard?: boolean;
  /** Running backup refresh warning (card ke andar neeche). */
  showRefreshWarning?: boolean;
  /** Cancel backup — AbortController (Pause abhi supported nahi). */
  showCancel?: boolean;
  onCancel?: () => void;
  /** Refresh warning — restore vs backup alag text ho sakta hai. */
  refreshWarningText?: string;
};

/** Backup location ke right / global banner — phase + count ek row, pill progress bar, Mbps + ETA. */
export function BackupProgressStrip({
  progress,
  spinning = false,
  compact = false,
  inCard = false,
  showRefreshWarning = false,
  showCancel = false,
  onCancel,
  refreshWarningText,
}: Props) {
  const hasBar =
    typeof progress.total === "number" &&
    progress.total > 0 &&
    typeof progress.done === "number";
  const pct = hasBar
    ? Math.min(100, Math.round((progress.done! / progress.total!) * 100))
    : 0;
  const phaseLower = String(progress.phase).toLowerCase();
  const showFileCount =
    hasBar &&
    (phaseLower.includes("attachment") ||
      phaseLower.includes("writing record") ||
      phaseLower.includes("collecting"));
  const countSuffix = phaseLower.includes("writing record") ? "records" : "files";
  const speedLine =
    progress.speedLabel ||
    (typeof progress.speedMbps === "number" &&
    Number.isFinite(progress.speedMbps) &&
    progress.speedMbps >= 0.1
      ? `${progress.speedMbps.toFixed(1)} Mbps`
      : null);

  const content = (
    <div className={cn(compact ? "min-w-0 flex-1 space-y-1.5" : "w-full min-w-0 space-y-1.5")}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          {spinning ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" /> : null}
          <span className="text-sm font-medium leading-tight text-foreground">{progress.phase}</span>
          {showFileCount ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {progress.done} / {progress.total} {countSuffix}
          </span>
          ) : progress.detail && !showFileCount ? (
            <span className="text-xs text-muted-foreground break-words">{progress.detail}</span>
          ) : null}
        </div>
        {showCancel && onCancel ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10"
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
      </div>
      {hasBar ? (
        <>
          {/* Poori pill length — blue border track, green fill (empty track bhi dikhe). */}
          <div
            className="h-3 w-full min-w-0 overflow-hidden rounded-full border border-blue-300 bg-blue-50/50 dark:bg-blue-950/25"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={progress.phase}
          >
            <div
              className="h-full rounded-full bg-green-500 transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] tabular-nums text-muted-foreground">
            <span>{pct}%</span>
            {speedLine ? <span>{speedLine}</span> : null}
            {progress.remainingLabel ? <span>{progress.remainingLabel}</span> : null}
          </div>
        </>
      ) : progress.detail && showFileCount ? (
        <p className="text-xs text-muted-foreground">{progress.detail}</p>
      ) : null}
      {showRefreshWarning ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          {refreshWarningText ||
            "Do not refresh or close this tab. You can open other pages in the app — backup continues in the background."}
        </p>
      ) : null}
    </div>
  );

  if (!inCard) return content;

  return (
    <div
      className="w-full rounded-lg border border-border bg-card px-3 py-3 shadow-sm"
      role="status"
      aria-live="polite"
    >
      {content}
    </div>
  );
}
