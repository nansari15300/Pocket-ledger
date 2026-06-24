"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCompany } from "@/hooks/useCompany";
import { canSyncCompanyToServer } from "@/lib/localVoucherOutbox";
import { forceUploadLocalCompanyToServer } from "@/lib/forceUploadLocalCompanyToServer";
import {
  completeVoucherBackgroundProgress,
  showVoucherBackgroundProgress,
} from "@/lib/voucherSaveUi";
import { yieldToMain } from "@/lib/yieldToMain";

export function ForceUploadLocalDataButton() {
  const { companyId, triggerSync } = useCompany();
  const [canSync, setCanSync] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!companyId) {
        if (!cancelled) setCanSync(false);
        return;
      }
      const allowed = await canSyncCompanyToServer(companyId);
      if (!cancelled) setCanSync(allowed);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const runForceUpload = useCallback(async () => {
    if (!companyId || isRunning) return;
    setIsRunning(true);
    setOpen(false);
    const progressId = showVoucherBackgroundProgress("Scanning local data…");
    await yieldToMain();
    try {
      const result = await forceUploadLocalCompanyToServer(companyId);
      if (!result.ok && result.message) {
        completeVoucherBackgroundProgress(progressId, {
          ok: false,
          title: "Force upload failed",
          description: result.message,
        });
        return;
      }

      const parts: string[] = [];
      if (result.docsPushed > 0) parts.push(`${result.docsPushed} record(s) pushed`);
      if (result.filesSynced > 0) parts.push(`${result.filesSynced} file(s) uploaded`);
      if (result.outboxFlushed > 0) parts.push(`${result.outboxFlushed} queue item(s) synced`);
      if (result.localRefsRequeued > 0) {
        parts.push(`${result.localRefsRequeued} local file ref(s) re-queued`);
      }
      if (result.pendingVouchersSynced > 0) {
        parts.push(`${result.pendingVouchersSynced} pending voucher(s) synced`);
      }
      if (result.pendingMastersSynced > 0) {
        parts.push(`${result.pendingMastersSynced} pending master(s) synced`);
      }

      const warnParts: string[] = [];
      if (result.filesFailed > 0) warnParts.push(`${result.filesFailed} file(s) failed`);
      if (result.localRefsMissingBytes > 0) {
        warnParts.push(`${result.localRefsMissingBytes} local file(s) missing on this device`);
      }
      if (result.errors.length) warnParts.push(result.errors.slice(0, 2).join(" · "));

      const description =
        parts.length > 0
          ? `${parts.join(" · ")}.${warnParts.length ? ` ${warnParts.join(" · ")}.` : ""}`
          : warnParts.join(" · ") || "Scan finished — everything already looked synced.";

      completeVoucherBackgroundProgress(progressId, {
        ok: warnParts.length === 0,
        title: warnParts.length ? "Force upload completed with issues" : "Force upload complete",
        description,
      });

      triggerSync();
    } catch (e) {
      completeVoucherBackgroundProgress(progressId, {
        ok: false,
        title: "Force upload failed",
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setIsRunning(false);
    }
  }, [companyId, isRunning, triggerSync]);

  if (!companyId || !canSync) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-md border border-black whitespace-normal h-auto min-h-9 py-1.5 text-left leading-tight sm:max-w-xs"
          disabled={isRunning || (typeof navigator !== "undefined" && !navigator.onLine)}
          title="Scan local SQLite + files and upload anything missing on server"
        >
          {isRunning ? (
            <Loader2 className="mr-1.5 h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <CloudUpload className="mr-1.5 h-4 w-4 shrink-0" />
          )}
          Force upload local data / files to server
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Force upload to server?</AlertDialogTitle>
          <AlertDialogDescription>
            This will scan all local SQLite records and pending attachments for this company, then upload
            anything that is not on the server yet. Use this if files or vouchers show on this device but not
            on another PC.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRunning}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isRunning}
            onClick={(e) => {
              e.preventDefault();
              void runForceUpload();
            }}
          >
            {isRunning ? "Uploading…" : "Start force upload"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
