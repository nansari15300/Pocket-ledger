"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { flushBrowserDbToIndexedDB } from "@/lib/localSqlite";
import { removeLocalCompanyById } from "@/lib/localCompanyStore";
import {
  LIVE_MIRROR_FOLDER_MISSING_EVENT,
  POCKET_LEDGER_MIRROR_DIR,
  COMPANIES_DIR_SEGMENT,
  recreatePocketLedgerMirrorFolderAndResync,
  readLiveDataFolderPrefs,
  saveLiveDataFolderPrefs,
  STALE_LIVE_DATA_HANDLE_CODE,
  clearMirrorFolderWriteBlock,
  resetMirrorMissingDispatchedGate,
  syncAllLocalCompanyDeltasToFolder,
} from "@/lib/liveDataFolderMirror";
import { storeWebLiveDataDirectoryHandle } from "@/lib/backupSaveLocation";

type MissingDetail = { companyId: string; companyName: string };

export function LiveMirrorFolderMissingDialog() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<MissingDetail | null>(null);
  const [busy, setBusy] = useState<"delete" | "recreate" | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { reloadLocalCompanyRegistry, triggerSync } = useCompany();

  useEffect(() => {
    const fn = (ev: Event) => {
      const e = ev as CustomEvent<MissingDetail>;
      if (e.detail?.companyId) {
        setDetail({ companyId: e.detail.companyId, companyName: e.detail.companyName || e.detail.companyId });
        setOpen(true);
      }
    };
    window.addEventListener(LIVE_MIRROR_FOLDER_MISSING_EVENT, fn as EventListener);
    return () => window.removeEventListener(LIVE_MIRROR_FOLDER_MISSING_EVENT, fn as EventListener);
  }, []);

  const handleRecreate = useCallback(async () => {
    setBusy("recreate");
    try {
      const run = async (webRootOverride?: FileSystemDirectoryHandle) => {
        await recreatePocketLedgerMirrorFolderAndResync(
          webRootOverride ? { webRootOverride } : undefined
        );
      };
      try {
        await run();
      } catch (e) {
        const code =
          typeof e === "object" && e !== null && "code" in e
            ? String((e as { code?: string }).code || "")
            : "";
        // Root folder disk se gayab / handle invalid — turant folder picker (user gesture yahi button se hai).
        if (code !== STALE_LIVE_DATA_HANDLE_CODE) throw e;
        const picker = (
          window as unknown as {
            showDirectoryPicker?: (opts?: { mode: string }) => Promise<FileSystemDirectoryHandle>;
          }
        ).showDirectoryPicker;
        if (!picker) throw e;
        const handle = await picker.call(window, { mode: "readwrite" });
        const ok = await storeWebLiveDataDirectoryHandle(handle);
        if (!ok) throw new Error("Could not store the new folder handle on this device.");
        const label = String((handle as { name?: string }).name || "").trim() || "Selected folder";
        const p = readLiveDataFolderPrefs();
        saveLiveDataFolderPrefs({ ...p, webEnabled: true, webFolderLabel: label });
        await run(handle);
      }
      toast({
        title: "Folder recreated",
        description: `${POCKET_LEDGER_MIRROR_DIR}/${COMPANIES_DIR_SEGMENT}/… was created again and encrypted copies were saved.`,
      });
      setOpen(false);
      setDetail(null);
      reloadLocalCompanyRegistry();
      triggerSync();
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") {
        /* user cancelled directory picker */
      } else {
        toast({
          variant: "destructive",
          title: "Could not recreate folder",
          description: e instanceof Error ? e.message : "Try again or pick a new folder under Backup.",
        });
      }
    } finally {
      setBusy(null);
    }
  }, [toast, reloadLocalCompanyRegistry, triggerSync]);

  const handleDelete = useCallback(async () => {
    if (!detail?.companyId) return;
    setBusy("delete");
    try {
      await removeLocalCompanyById(detail.companyId, { firebaseUid: user?.uid ?? null });
      await flushBrowserDbToIndexedDB();
      clearMirrorFolderWriteBlock();
      setOpen(false);
      setDetail(null);
      reloadLocalCompanyRegistry();
      triggerSync();
      toast({
        title: "Company removed from this device",
        description: "Local SQLite data for this company was deleted.",
      });
      void syncAllLocalCompanyDeltasToFolder();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not remove company",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setBusy(null);
    }
  }, [detail, toast, user?.uid, reloadLocalCompanyRegistry, triggerSync]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          setOpen(false);
          resetMirrorMissingDispatchedGate();
        }
      }}
    >
      {/* 50vw: user-requested width — pehle full-bleed tha; ab half viewport taaki zyada khali na dikhe */}
      <AlertDialogContent className="w-[50vw] max-w-[50vw]">
        <AlertDialogHeader>
          {/* Poora tree ya sirf company mirror `.json` delete — dono yahi flow */}
          <AlertDialogTitle>Local save copy missing</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Either the whole <code className="text-xs font-mono">{POCKET_LEDGER_MIRROR_DIR}/</code> tree (including{" "}
                <code className="text-xs font-mono">{COMPANIES_DIR_SEGMENT}/</code>) is missing — or only this
                company&apos;s encrypted <code className="text-xs font-mono">.json</code> inside its folder was removed.
                Encrypted copies for{" "}
                <span className="font-medium text-foreground">{detail?.companyName ?? "this company"}</span> cannot be
                written until you choose below.
              </p>
              <p>
                <strong className="text-foreground">Recreate folder</strong> — creates{" "}
                <code className="text-xs font-mono">{POCKET_LEDGER_MIRROR_DIR}/</code> again (with per-company folders)
                and saves encrypted mirror files from the app.
              </p>
              <p>
                <strong className="text-foreground">Remove from this device</strong> — deletes this company from local
                SQLite (same as removing the device copy of the company).
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel disabled={busy !== null}>Later</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={busy !== null}
            onClick={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
          >
            {busy === "delete" ? "Removing…" : "Remove from this device"}
          </AlertDialogAction>
          <AlertDialogAction type="button" disabled={busy !== null} onClick={(e) => {
            e.preventDefault();
            void handleRecreate();
          }}>
            {busy === "recreate" ? "Saving…" : "Recreate folder & save"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
