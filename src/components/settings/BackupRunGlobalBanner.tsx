"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import {
  clearCompanyBackupRunNotice,
  cancelCompanyBackupRun,
  getCompanyBackupRunState,
  subscribeCompanyBackupRun,
  type CompanyBackupRunState,
} from "@/lib/companyBackupRunner";
import { Button } from "@/components/ui/button";
import { BackupProgressStrip } from "@/components/settings/BackupProgressStrip";
import { useToast } from "@/hooks/use-toast";

/** Dashboard layout — backup chale to har page par live progress; /backup par card hi kaafi. */
export function BackupRunGlobalBanner() {
  const pathname = usePathname();
  const { toast } = useToast();
  const [run, setRun] = useState<CompanyBackupRunState>(() =>
    typeof window !== "undefined" ? getCompanyBackupRunState() : ({ status: "idle" } as CompanyBackupRunState)
  );

  useEffect(() => subscribeCompanyBackupRun(setRun), []);

  // Backup page par progress card me dikhta hai — uper duplicate banner mat dikhao.
  const onBackupPage = pathname === "/backup" || pathname?.startsWith("/backup/");
  if (onBackupPage) return null;

  if (run.status === "idle") return null;

  const running = run.status === "running";
  const interrupted = run.status === "interrupted";
  const failed = run.status === "failed";
  const completed = run.status === "completed";
  const progress = run.progress;

  return (
    <div
      className={`border-b px-3 py-2 text-sm ${
        interrupted || failed
          ? "border-destructive/40 bg-destructive/10"
          : completed
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-primary/30 bg-primary/5"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-3">
        {!running && (interrupted || failed) ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1">
          {!running || !progress ? (
            <p className="font-medium text-foreground">
              {running
                ? `Backup in progress${run.companyName ? `: ${run.companyName}` : ""}`
                : interrupted
                  ? "Backup interrupted"
                  : failed
                    ? "Backup failed"
                    : "Backup complete"}
            </p>
          ) : null}
          {running && progress ? (
            <BackupProgressStrip
              progress={progress}
              spinning
              compact
              showCancel
              onCancel={() => {
                if (cancelCompanyBackupRun()) {
                  toast({ title: "Backup cancelled", description: "You can start a new backup when ready." });
                }
              }}
            />
          ) : progress && !running ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{progress.phase}</span>
              {progress.detail ? ` — ${progress.detail}` : ""}
            </p>
          ) : null}
          {running ? (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Do not refresh or close this tab. You can open other pages in the app — backup continues in the background.
            </p>
          ) : interrupted ? (
            <p className="text-xs text-muted-foreground">
              Start a new backup from{" "}
              <Link href="/backup" className="font-medium text-primary underline">
                Backup &amp; Restore
              </Link>
              . Keep that screen open until finished.
            </p>
          ) : null}
        </div>
        {!running ? (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => clearCompanyBackupRunNotice()}>
            <X className="h-4 w-4" />
            <span className="sr-only">Dismiss</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
