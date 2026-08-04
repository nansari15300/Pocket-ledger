"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getCompanyBackupRunState,
  subscribeCompanyBackupRun,
  type CompanyBackupRunState,
} from "@/lib/companyBackupRunner";
import {
  getAutoBackupDriveUploadRunState,
  subscribeAutoBackupDriveUploadRun,
  type AutoBackupDriveUploadRunState,
} from "@/lib/autoBackupDriveUploadRunner";
import { isDesktopPcBackupStripView } from "@/lib/isDesktopPcBackupStripView";

function backupProgressPercent(run: CompanyBackupRunState): number | null {
  const p = run.progress;
  if (!p || typeof p.total !== "number" || p.total <= 0 || typeof p.done !== "number") return null;
  return Math.min(100, Math.round((p.done / p.total) * 100));
}

function driveUploadProgressPercent(run: AutoBackupDriveUploadRunState): number | null {
  const p = run.progress;
  if (!p) return null;
  if (p.phase === "done") return 100;
  if (p.phase === "listing") return null;
  if (p.total > 0) return Math.min(100, Math.round((p.done / p.total) * 100));
  return null;
}

/** App header ke neeche — backup / Drive auto-upload progress (PC: Web, Mac, EXE). */
export function HeaderBackupActivityStrip() {
  const [backupRun, setBackupRun] = useState<CompanyBackupRunState>(() =>
    typeof window !== "undefined" ? getCompanyBackupRunState() : ({ status: "idle" } as CompanyBackupRunState)
  );
  const [driveRun, setDriveRun] = useState<AutoBackupDriveUploadRunState>(() =>
    typeof window !== "undefined"
      ? getAutoBackupDriveUploadRunState()
      : ({ status: "idle" } as AutoBackupDriveUploadRunState)
  );

  useEffect(() => subscribeCompanyBackupRun(setBackupRun), []);
  useEffect(() => subscribeAutoBackupDriveUploadRun(setDriveRun), []);

  const visible = isDesktopPcBackupStripView();
  const backupActive = backupRun.status === "running";
  const driveActive = driveRun.status === "running";

  const view = useMemo(() => {
    if (backupActive) {
      const name = backupRun.companyName?.trim();
      const pct = backupProgressPercent(backupRun);
      return {
        kind: "backup" as const,
        label: name ? `Backup in progress — ${name}` : "Backup in progress",
        pct,
        detail: backupRun.progress?.phase ?? null,
      };
    }
    if (driveActive) {
      const name = driveRun.companyName?.trim();
      const pct = driveUploadProgressPercent(driveRun);
      const phase = driveRun.progress?.phase;
      const label =
        phase === "listing"
          ? name
            ? `Drive upload starting — ${name}`
            : "Drive upload starting"
          : name
            ? `Drive upload in progress — ${name}`
            : "Drive upload in progress";
      return {
        kind: "drive" as const,
        label,
        pct,
        detail:
          driveRun.progress?.phase === "uploading" && driveRun.progress.total > 0
            ? `${driveRun.progress.done + 1}/${driveRun.progress.total}`
            : null,
      };
    }
    return null;
  }, [backupActive, backupRun, driveActive, driveRun]);

  if (!visible || !view) return null;

  const barPct = view.pct ?? (view.kind === "backup" ? 35 : 25);
  const barClass =
    view.kind === "backup"
      ? "bg-sky-500"
      : "bg-emerald-500";

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-[5px] z-40 border-t border-border/40 bg-background/95"
      role="status"
      aria-live="polite"
      aria-label={view.label}
      title={view.detail ? `${view.label} (${view.detail})` : view.label}
    >
      <div className="flex h-4 items-center gap-2 px-2 text-[10px] leading-none text-foreground/90">
        <span className="min-w-0 flex-1 truncate font-medium">{view.label}</span>
        {view.detail ? <span className="shrink-0 tabular-nums text-muted-foreground">{view.detail}</span> : null}
        {view.pct != null ? <span className="shrink-0 tabular-nums text-muted-foreground">{view.pct}%</span> : null}
      </div>
      <div className="h-[8px] w-full overflow-hidden bg-muted/60">
        <div
          className={`h-full transition-[width] duration-300 ease-out ${barClass} ${view.pct == null ? "animate-pulse" : ""}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
    </div>
  );
}
