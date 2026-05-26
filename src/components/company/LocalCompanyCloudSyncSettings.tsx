"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { getLocalCompanyById, upsertLocalCompany, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import {
  disconnectGoogleDrive,
  getGoogleDriveAuthUrl,
  openGoogleDriveOAuthUrl,
  resolveDriveOAuthReturnPath,
} from "@/lib/driveAuthClient";
import { getLocalCloudSyncStatus, runLocalCloudSyncCycle } from "@/lib/localCloudSync/engine";
import { backfillLocalDocsToCloudSyncOutbox } from "@/lib/localCloudSync/backfillOutbox";
import { setCloudSyncCursor } from "@/lib/localCloudSync/queue";
import { ensureCloudSyncDriveEncryptionSalt } from "@/lib/localCloudSync/driveEncryption";
import { patchLocalCompanyCloudSyncFields, readCloudSyncConfigFromCompany } from "@/lib/localCloudSync/companyConfig";
import type { CloudSyncIntervalSec, CloudSyncProviderId } from "@/lib/localCloudSync/types";
import { CLOUD_SYNC_INTERVAL_SEC_OPTIONS } from "@/lib/localCloudSync/types";
import type { DriveAttachmentDateFolderMode } from "@/lib/localCloudSync/driveAttachmentPath";
import { forceReencryptDriveIfNeeded } from "@/lib/localCloudSync/forceReencryptDrive";
import {
  cloudSyncEncryptCard,
  cloudSyncNepalFolderCard,
  cloudSyncProviderCard,
  cloudSyncStatusCard,
  cloudSyncLastSyncSummaryCard,
  companyProfileChromeRoot,
  settingsDetailCardShell,
} from "@/lib/companyProfileChrome";
import { DriveShareUsersPanel } from "@/components/company/DriveShareUsersPanel";
import { JoinSharedLocalCompanyDialog } from "@/components/company/JoinSharedLocalCompanyDialog";
import { formatDistanceToNow } from "date-fns";
import { Cloud, Info, Loader2, RefreshCw, Save, Share2 } from "lucide-react";
import { settingsViewHref } from "@/lib/appNavHref";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ToastAction } from "@/components/ui/toast";
import {
  CLOUD_SYNC_ENCRYPTION_KEY_REQUIRED_MSG,
  isCloudSyncEncryptionKeyRequiredError,
} from "@/lib/localCloudSync/driveEncryption";
import {
  FIREBASE_SIGN_IN_REQUIRED_FOR_DRIVE_MSG,
  LOCAL_UNLOCK_ONLY_DRIVE_MSG,
  getFirebaseAuthUserForApi,
  hasRealFirebaseAuthSession,
  isLocalSyntheticAuthUid,
  isStoredDriveAuthError,
  waitForFirebaseAuthReady,
} from "@/lib/firebaseAuthForApi";

type Props = {
  companyId: string;
  company: LocalCompanyDoc | Record<string, unknown>;
};

function dateFolderModeLabel(mode: DriveAttachmentDateFolderMode): string {
  if (mode === "bs") return "BS only";
  if (mode === "both") return "Both";
  return "AD only";
}

/** Sync card error — encryption / auth / generic alag message. */
function renderCloudSyncStatusError(
  lastError: string | null,
  localSyntheticAuth: boolean
): ReactNode {
  if (!lastError && localSyntheticAuth) {
    return (
      <p className="text-xs text-destructive">
        {LOCAL_UNLOCK_ONLY_DRIVE_MSG}{" "}
        <Link href="/" className="underline font-medium hover:no-underline">
          Sign in with Google
        </Link>
      </p>
    );
  }
  if (!lastError) return null;
  if (isCloudSyncEncryptionKeyRequiredError(lastError)) {
    return (
      <p className="text-xs text-destructive">
        {CLOUD_SYNC_ENCRYPTION_KEY_REQUIRED_MSG}{" "}
        <Link href="/settings?view=company" className="underline font-medium hover:no-underline">
          Open Company Profile
        </Link>
      </p>
    );
  }
  if (isStoredDriveAuthError(lastError)) {
    return (
      <p className="text-xs text-destructive">
        {localSyntheticAuth ? LOCAL_UNLOCK_ONLY_DRIVE_MSG : lastError}{" "}
        {localSyntheticAuth ? (
          <Link href="/" className="underline font-medium hover:no-underline">
            Sign in with Google
          </Link>
        ) : (
          <>Then click Connect account below.</>
        )}
      </p>
    );
  }
  return <p className="text-xs text-destructive">Error: {lastError}</p>;
}

/** (i) icon — English help popover (Manage Sharing jaisa). */
function CloudSyncHelpPopover({
  label,
  description,
  hasError,
}: {
  label: string;
  description: ReactNode;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-blue-700 hover:bg-blue-100",
            open && "bg-blue-100",
            hasError && "text-destructive ring-1 ring-destructive/40"
          )}
          aria-label={label}
          aria-expanded={open}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        collisionPadding={12}
        className="z-[10050] max-w-[min(22rem,calc(100vw-2rem))] p-3 text-xs leading-relaxed text-foreground"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="font-semibold text-sm mb-1.5">{label}</p>
        <div className="text-muted-foreground space-y-2">{description}</div>
      </PopoverContent>
    </Popover>
  );
}

/** Sirf device-local companies — Firestore companies par ye card hide. */
export function LocalCompanyCloudSyncSettings({ companyId, company }: Props) {
  const { user } = useAuth();
  const { reloadLocalCompanyRegistry, triggerSync } = useCompany();
  const { toast } = useToast();
  const router = useRouter();
  const [joinOpen, setJoinOpen] = useState(false);

  const openCompanyProfile = () => {
    router.push("/settings?view=company");
  };
  const showEncryptionKeyRequiredToast = () => {
    toast({
      variant: "destructive",
      title: "Sync failed",
      description: CLOUD_SYNC_ENCRYPTION_KEY_REQUIRED_MSG,
      duration: 8000,
      action: (
        <ToastAction altText="Open Company Profile" onClick={openCompanyProfile}>
          Open Company Profile
        </ToastAction>
      ),
    });
  };

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({
    pending: 0,
    lastSyncAt: null as number | null,
    status: "idle",
    lastError: null as string | null,
    lastSyncSummary: {
      addedFiles: 0,
      addedVouchers: 0,
      uploadedFiles: 0,
      uploadedVouchers: 0,
      downloadedFiles: 0,
      downloadedVouchers: 0,
    },
  });

  const cfg = readCloudSyncConfigFromCompany(company);
  const [enabled, setEnabled] = useState(cfg.cloudSyncEnabled);
  const [provider, setProvider] = useState<CloudSyncProviderId>(cfg.cloudSyncProvider ?? "google_drive");
  const [dateFolderMode, setDateFolderMode] = useState<DriveAttachmentDateFolderMode>(
    cfg.cloudSyncDriveDateFolderMode ?? "ad"
  );
  const [encryptDriveData, setEncryptDriveData] = useState(cfg.cloudSyncEncryptDriveData);
  const [encryptDriveFiles, setEncryptDriveFiles] = useState(cfg.cloudSyncEncryptDriveFiles);
  // Background sync interval — registry se load, dropdown change par save.
  const [syncIntervalSec, setSyncIntervalSec] = useState<CloudSyncIntervalSec>(cfg.cloudSyncIntervalSec);
  // Next auto-sync countdown — lastSyncAt + interval se target; har 1 sec UI update.
  const nextSyncAtMsRef = useRef(Date.now() + cfg.cloudSyncIntervalSec * 1000);
  const [nextSyncInSec, setNextSyncInSec] = useState<number>(cfg.cloudSyncIntervalSec);
  const isNepalCompany = ["NP", "NEPAL"].includes(
    String((company as { country?: string }).country ?? "").trim().toUpperCase()
  );
  // Local unlock synthetic uid — UI signed-in dikhe par Firebase token nahi hota.
  const localSyntheticAuth = isLocalSyntheticAuthUid(user?.uid);

  const savedDateFolderMode = cfg.cloudSyncDriveDateFolderMode ?? "ad";
  const folderModeDirty = isNepalCompany && dateFolderMode !== savedDateFolderMode;

  useEffect(() => {
    const next = readCloudSyncConfigFromCompany(company);
    setEnabled(next.cloudSyncEnabled);
    if (next.cloudSyncProvider) setProvider(next.cloudSyncProvider);
    if (next.cloudSyncDriveDateFolderMode) setDateFolderMode(next.cloudSyncDriveDateFolderMode);
    setEncryptDriveData(next.cloudSyncEncryptDriveData);
    setEncryptDriveFiles(next.cloudSyncEncryptDriveFiles);
    setSyncIntervalSec(next.cloudSyncIntervalSec);
  }, [company]);

  const refreshStatus = useCallback(async () => {
    const s = await getLocalCloudSyncStatus(companyId);
    setStatus({
      pending: s.pending,
      lastSyncAt: s.lastSyncAt,
      status: s.status,
      lastError: s.lastError,
      lastSyncSummary: s.lastSyncSummary,
    });
  }, [companyId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus, enabled]);

  // Firebase sign-in ke baad purana auth error hatao + ek retry (local unlock ≠ Google sign-in).
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      await waitForFirebaseAuthReady();
      if (cancelled) return;
      if (!hasRealFirebaseAuthSession()) return;
      if (!isStoredDriveAuthError(status.lastError)) return;
      await patchLocalCompanyCloudSyncFields(companyId, {
        cloudSyncStatus: "idle",
        cloudSyncLastError: null,
      });
      await refreshStatus();
      void runLocalCloudSyncCycle(companyId, { force: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, enabled, user?.uid, status.lastError, refreshStatus]);

  // Card me last sync / pending live update — har 5 sec poll jab sync ON ho.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => void refreshStatus(), 5000);
    return () => window.clearInterval(id);
  }, [enabled, refreshStatus]);

  // Next sync target — last successful sync + interval; interval badle to ab se dubara count.
  useEffect(() => {
    const anchor = status.lastSyncAt ?? Date.now();
    nextSyncAtMsRef.current = anchor + syncIntervalSec * 1000;
  }, [status.lastSyncAt, syncIntervalSec]);

  // Live sec countdown — syncing/busy par 0, warna remaining seconds.
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (status.status === "syncing" || busy) {
        setNextSyncInSec(0);
        return;
      }
      setNextSyncInSec(Math.max(0, Math.ceil((nextSyncAtMsRef.current - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [enabled, status.status, status.lastSyncAt, syncIntervalSec, busy]);

  if (!isOfflineCompanyStorage(company as { storageOption?: string })) return null;

  const saveConfig = async (patch: Partial<LocalCompanyDoc>) => {
    const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
    if (!reg) return;
    await upsertLocalCompany({ ...reg, ...patch } as LocalCompanyDoc);
    reloadLocalCompanyRegistry();
  };

  const onToggleEnabled = async (checked: boolean) => {
    setEnabled(checked);
    await saveConfig({
      cloudSyncEnabled: checked,
      cloudSyncProvider: provider,
    });
    if (checked) {
      const n = await backfillLocalDocsToCloudSyncOutbox(companyId);
      if (n > 0) void runLocalCloudSyncCycle(companyId, { force: true });
    }
  };

  const onProviderChange = async (p: CloudSyncProviderId) => {
    setProvider(p);
    await saveConfig({ cloudSyncProvider: p, cloudSyncEnabled: enabled });
  };

  const onSyncIntervalChange = async (sec: CloudSyncIntervalSec) => {
    setSyncIntervalSec(sec);
    await saveConfig({ cloudSyncIntervalSec: sec });
  };

  const saveEncryptionFlags = async (data: boolean, files: boolean, forceReencrypt: boolean) => {
    const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
    const salt =
      data || files
        ? ensureCloudSyncDriveEncryptionSalt(String(reg?.cloudSyncDriveEncryptionSalt ?? ""))
        : String(reg?.cloudSyncDriveEncryptionSalt ?? "").trim() || null;
    await saveConfig({
      cloudSyncEncryptDriveData: data,
      cloudSyncEncryptDriveFiles: files,
      cloudSyncEncryptDrive: data || files,
      ...(salt ? { cloudSyncDriveEncryptionSalt: salt } : {}),
    });
    if (forceReencrypt && (data || files)) {
      setBusy(true);
      try {
        const { dataOps, files: fileCount } = await forceReencryptDriveIfNeeded(companyId);
        toast({
          title: "Encryption applied on Drive",
          description: `Re-encrypted ${dataOps} data ops and ${fileCount} files on Google Drive.`,
        });
        void runLocalCloudSyncCycle(companyId, { force: true });
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Force encrypt failed",
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setBusy(false);
      }
    } else if (data || files) {
      toast({
        title: "Drive encryption updated",
        description:
          "If a company password is set in Company Profile, all staff use it as the key. Otherwise use login username and password.",
      });
    }
  };

  const onToggleEncryptDriveData = async (checked: boolean) => {
    setEncryptDriveData(checked);
    await saveEncryptionFlags(checked, encryptDriveFiles, checked);
  };

  const onToggleEncryptDriveFiles = async (checked: boolean) => {
    setEncryptDriveFiles(checked);
    await saveEncryptionFlags(encryptDriveData, checked, checked);
  };

  const saveFolderMode = async () => {
    if (!folderModeDirty) return;
    const folderModeToSave: DriveAttachmentDateFolderMode = isNepalCompany ? dateFolderMode : "ad";
    setBusy(true);
    try {
      await saveConfig({ cloudSyncDriveDateFolderMode: folderModeToSave });
      toast({
        title: "Folder option saved",
        description: `Attachment folder: ${dateFolderModeLabel(folderModeToSave)} — new uploads use this mode.`,
      });
    } finally {
      setBusy(false);
    }
  };

  /** Footer Save — provider, encrypt, interval, Nepal folder mode ek saath registry me. */
  const saveAllCloudSyncSettings = async () => {
    setBusy(true);
    try {
      const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
      const folderModeToSave: DriveAttachmentDateFolderMode = isNepalCompany ? dateFolderMode : "ad";
      const salt =
        encryptDriveData || encryptDriveFiles
          ? ensureCloudSyncDriveEncryptionSalt(String(reg?.cloudSyncDriveEncryptionSalt ?? ""))
          : String(reg?.cloudSyncDriveEncryptionSalt ?? "").trim() || null;
      await saveConfig({
        cloudSyncEnabled: enabled,
        cloudSyncProvider: provider,
        cloudSyncEncryptDriveData: encryptDriveData,
        cloudSyncEncryptDriveFiles: encryptDriveFiles,
        cloudSyncEncryptDrive: encryptDriveData || encryptDriveFiles,
        cloudSyncIntervalSec: syncIntervalSec,
        cloudSyncDriveDateFolderMode: folderModeToSave,
        ...(salt ? { cloudSyncDriveEncryptionSalt: salt } : {}),
      });
      toast({
        title: "Settings saved",
        description: folderModeDirty
          ? `Cloud sync saved · attachment folder: ${dateFolderModeLabel(folderModeToSave)}.`
          : "Cloud sync settings saved for this company.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const connectDrive = async () => {
    setBusy(true);
    try {
      const firebaseUser = await getFirebaseAuthUserForApi();
      const { url } = await getGoogleDriveAuthUrl({
        returnPath: resolveDriveOAuthReturnPath(settingsViewHref("local_cloud_sync")),
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? undefined,
        formData: { companyId },
      });
      await openGoogleDriveOAuthUrl(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        variant: "destructive",
        title: isLocalSyntheticAuthUid(user?.uid) ? "Google sign-in required" : "Drive connect failed",
        description:
          msg === FIREBASE_SIGN_IN_REQUIRED_FOR_DRIVE_MSG || isLocalSyntheticAuthUid(user?.uid)
            ? LOCAL_UNLOCK_ONLY_DRIVE_MSG
            : msg,
      });
    } finally {
      setBusy(false);
    }
  };

  const disconnectDrive = async () => {
    setBusy(true);
    try {
      await disconnectGoogleDrive();
      toast({ title: "Disconnected", description: "Google Drive unlinked." });
      await refreshStatus();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Disconnect failed",
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const forceSync = async () => {
    setBusy(true);
    try {
      const backfilled = await backfillLocalDocsToCloudSyncOutbox(companyId);
      const res = await runLocalCloudSyncCycle(companyId, { force: true });
      await refreshStatus();
      if (!res.ok) {
        const err = res.error ?? "Unknown error";
        if (isCloudSyncEncryptionKeyRequiredError(err)) {
          showEncryptionKeyRequiredToast();
        } else {
          toast({ variant: "destructive", title: "Sync failed", description: err });
        }
      } else {
        toast({
          title: "Sync complete",
          description:
            backfilled > 0
              ? `Backfilled ${backfilled} local rows · uploaded ${res.uploaded}, downloaded ${res.downloaded}.`
              : `Uploaded ${res.uploaded}, downloaded ${res.downloaded} operations.`,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  /** Admin / doosre device par data na dikhe — cursor 0 karke saari Drive ops dubara download. */
  const redownloadFromDrive = async () => {
    setBusy(true);
    try {
      await setCloudSyncCursor(companyId, { lastSyncedOp: 0, lastError: null, syncStatus: "idle" });
      const res = await runLocalCloudSyncCycle(companyId, { force: true });
      await refreshStatus();
      if (!res.ok) {
        const err = res.error ?? "Unknown error";
        if (isCloudSyncEncryptionKeyRequiredError(err)) {
          showEncryptionKeyRequiredToast();
        } else {
          toast({ variant: "destructive", title: "Re-download failed", description: err });
        }
      } else {
        toast({
          title: "Re-download complete",
          description: `Downloaded ${res.downloaded} operations from Drive.`,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      className={cn(settingsDetailCardShell, "flex h-full min-h-full flex-col")}
      {...{ [companyProfileChromeRoot]: "" }}
    >
      <CardHeader className="shrink-0">
        <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
          <Cloud className="h-4 w-4 shrink-0" />
          <span>Cloud sync (local company)</span>
          <CloudSyncHelpPopover
            label="About cloud sync"
            description={
              <>
                <p>
                  Each company gets a Google Drive folder with <span className="font-mono">opening/</span>,{" "}
                  <span className="font-mono">data/</span>, <span className="font-mono">attachments/</span>, and{" "}
                  <span className="font-mono">backup/</span>.
                </p>
                <p>
                  Attachments go under <span className="font-mono">attachments/vouchers/</span>,{" "}
                  <span className="font-mono">attachments/parties/</span>, etc., then a date folder (AD / BS per
                  settings).
                </p>
                <p>
                  Every save creates a delta JSON file under <span className="font-mono">data/ops/</span> (not a
                  separate folder per voucher type for operations).
                </p>
              </>
            }
          />
          {/* Enable sync — (i) icon ke right, same header row */}
          <div className="flex items-center gap-2 ml-0.5">
            <Checkbox
              id="local-company-cloud-sync-enabled"
              checked={enabled}
              onCheckedChange={(v) => void onToggleEnabled(v === true)}
            />
            <Label htmlFor="local-company-cloud-sync-enabled" className="text-sm font-normal cursor-pointer">
              Enable cloud sync
            </Label>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 min-h-0 flex-col gap-4">
        {enabled ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,13fr)] gap-4 items-stretch">
            {/* Left 35% — sync, encrypt, folder options */}
            <div className="flex w-full min-w-0 flex-col space-y-4 order-2 lg:order-1 h-full min-h-0">
              <div className={cn("space-y-2", cloudSyncProviderCard)}>
                <Label>Provider</Label>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cloudSyncProvider"
                      checked={provider === "google_drive"}
                      onChange={() => void onProviderChange("google_drive")}
                    />
                    Google Drive
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cloudSyncProvider"
                      checked={provider === "dropbox"}
                      onChange={() => void onProviderChange("dropbox")}
                    />
                    Dropbox
                  </label>
                </div>
              </div>

              <div className={cloudSyncEncryptCard}>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-foreground">Encrypt on Google Drive / Dropbox (AES)</p>
                  <CloudSyncHelpPopover
                    label="Encryption"
                    description={
                      <>
                        <p>
                          Encryption key: <strong>Company Profile password</strong> (all staff) or this device&apos;s{" "}
                          <strong>company login username + password</strong>.
                        </p>
                        <p>
                          <strong>Encrypt data (JSON):</strong> <span className="font-mono">data/ops/</span> and{" "}
                          <span className="font-mono">opening/</span> — turning on re-encrypts any plain files on Drive.
                        </p>
                        <p>
                          <strong>Encrypt files (attachments):</strong> voucher and item files stored as{" "}
                          <span className="font-mono">.plenc.json</span>.
                        </p>
                      </>
                    }
                  />
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="local-company-cloud-sync-encrypt-data"
                    checked={encryptDriveData}
                    onCheckedChange={(v) => void onToggleEncryptDriveData(v === true)}
                    disabled={busy}
                  />
                  <Label htmlFor="local-company-cloud-sync-encrypt-data" className="text-sm font-normal cursor-pointer">
                    Encrypt data (JSON)
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="local-company-cloud-sync-encrypt-files"
                    checked={encryptDriveFiles}
                    onCheckedChange={(v) => void onToggleEncryptDriveFiles(v === true)}
                    disabled={busy}
                  />
                  <Label htmlFor="local-company-cloud-sync-encrypt-files" className="text-sm font-normal cursor-pointer">
                    Encrypt files (attachments)
                  </Label>
                </div>
              </div>

              {provider === "google_drive" && isNepalCompany ? (
                <div className={cloudSyncNepalFolderCard}>
                  <div className="flex items-center gap-1.5">
                    <Label>Attachment date folder (Nepal)</Label>
                    <CloudSyncHelpPopover
                      label="Attachment date folders"
                      description={
                        <>
                          <p>Choose AD, BS, or Both for new attachment uploads on Drive.</p>
                          <p>Click Save folder option to apply. Existing folders stay as they are; only new uploads use the saved mode.</p>
                          <p>
                            Saved: <strong>{dateFolderModeLabel(savedDateFolderMode)}</strong>
                            {folderModeDirty ? " (unsaved change)" : null}
                          </p>
                        </>
                      }
                    />
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {(["ad", "bs", "both"] as const).map((mode) => (
                      <label key={mode} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="cloudSyncDriveDateFolderMode"
                          checked={dateFolderMode === mode}
                          onChange={() => setDateFolderMode(mode)}
                        />
                        {dateFolderModeLabel(mode)}
                      </label>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant={folderModeDirty ? "default" : "secondary"}
                    size="sm"
                    disabled={busy || !folderModeDirty}
                    onClick={() => void saveFolderMode()}
                  >
                    Save folder option
                  </Button>
                </div>
              ) : null}

              {/* Last sync summary — added / uploaded / downloaded counts */}
              <div className={cloudSyncLastSyncSummaryCard}>
                <p className="font-medium text-sm text-foreground">Last sync summary</p>
                <p className="text-sm">
                  Added: <strong>{status.lastSyncSummary.addedFiles}</strong> files ·{" "}
                  <strong>{status.lastSyncSummary.addedVouchers}</strong> vouchers
                </p>
                <p className="text-sm">
                  Uploaded: <strong>{status.lastSyncSummary.uploadedFiles}</strong> files ·{" "}
                  <strong>{status.lastSyncSummary.uploadedVouchers}</strong> vouchers
                </p>
                <p className="text-sm">
                  Downloaded from Drive: <strong>{status.lastSyncSummary.downloadedFiles}</strong> files ·{" "}
                  <strong>{status.lastSyncSummary.downloadedVouchers}</strong> vouchers
                </p>
              </div>

              {/* Left column — sync status (same width as Provider / Encrypt / Nepal cards) */}
              <div className={cloudSyncStatusCard}>
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-foreground">Sync status</p>
                  <p>
                    Last sync:{" "}
                    <strong>
                      {status.lastSyncAt ? formatDistanceToNow(status.lastSyncAt, { addSuffix: true }) : "never"}
                    </strong>
                  </p>
                  <p>
                    Pending sync: <strong>{status.pending}</strong>
                  </p>
                  <p>
                    Status: <strong>{status.status}</strong>
                  </p>
                  <p>
                    Next sync:{" "}
                    <strong>
                      {status.status === "syncing" || busy ? "now" : `${nextSyncInSec} sec`}
                    </strong>
                  </p>
                </div>
                {renderCloudSyncStatusError(status.lastError, localSyntheticAuth)}
                <div className="space-y-2">
                  <Label htmlFor="cloud-sync-interval-select" className="text-xs">
                    Sync interval
                  </Label>
                  <Select
                    value={String(syncIntervalSec)}
                    disabled={busy}
                    onValueChange={(v) => void onSyncIntervalChange(Number(v) as CloudSyncIntervalSec)}
                  >
                    <SelectTrigger id="cloud-sync-interval-select" className="h-9 w-full max-w-[10rem] text-sm">
                      <SelectValue placeholder="Interval" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLOUD_SYNC_INTERVAL_SEC_OPTIONS.map((sec) => (
                        <SelectItem key={sec} value={String(sec)}>
                          {sec} sec
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Right 65% — Share company on Drive (poori card height) */}
            {provider === "google_drive" ? (
              <div className="flex w-full min-w-0 order-1 lg:order-2 h-full min-h-0 flex-col">
                <DriveShareUsersPanel
                  companyId={companyId}
                  companyName={typeof company.name === "string" ? company.name : undefined}
                  company={company}
                  disabled={busy}
                  onUsersChanged={reloadLocalCompanyRegistry}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="min-h-0 flex-1" aria-hidden />
        )}

        {/* Footer — sync actions left, Join shared right */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-black/10 pt-3 mt-auto">
          <div className="flex flex-wrap items-center gap-2">
          {enabled && provider === "google_drive" ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full px-4"
                disabled={busy}
                onClick={() => void connectDrive()}
              >
                Connect account
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full px-4"
                disabled={busy}
                onClick={() => void disconnectDrive()}
              >
                Disconnect
              </Button>
            </>
          ) : null}
          {enabled ? (
            <>
              <Button
                type="button"
                size="sm"
                className="rounded-full px-4"
                disabled={busy}
                onClick={() => void forceSync()}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                Force sync now
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full px-4"
                disabled={busy}
                onClick={() => void redownloadFromDrive()}
              >
                Re-download from Drive
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full px-4"
                disabled={busy || !enabled}
                onClick={() => void saveAllCloudSyncSettings()}
              >
                <Save className="h-4 w-4 mr-1.5" />
                Save
              </Button>
              <CloudSyncHelpPopover
                label="Sync status & actions"
                hasError={!!status.lastError || localSyntheticAuth}
                description={
                  <>
                    <p>
                      <strong>Connect account:</strong> link Google Drive on this device for upload/download.
                    </p>
                    <p>
                      <strong>Disconnect:</strong> remove the Drive link from this device (data on Drive stays).
                    </p>
                    <p>
                      <strong>Force sync now:</strong> upload pending changes and download updates from Drive.
                    </p>
                    <p>
                      <strong>Re-download from Drive:</strong> reset sync cursor and pull all operations again (use when
                      another device has data but this one does not).
                    </p>
                    <hr className="border-border my-2" />
                    <p>
                      Status: <strong>{status.status}</strong>
                    </p>
                    <p>
                      Pending operations: <strong>{status.pending}</strong>
                    </p>
                    <p>
                      Last sync:{" "}
                      <strong>
                        {status.lastSyncAt ? formatDistanceToNow(status.lastSyncAt, { addSuffix: true }) : "never"}
                      </strong>
                    </p>
                    {renderCloudSyncStatusError(status.lastError, localSyntheticAuth)}
                  </>
                }
              />
            </>
          ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full px-4 ml-auto shrink-0"
            disabled={busy}
            onClick={() => setJoinOpen(true)}
          >
            <Share2 className="mr-2 h-4 w-4" />
            Join shared local company
          </Button>
        </div>
      </CardContent>

      <JoinSharedLocalCompanyDialog
        open={joinOpen}
        onOpenChange={setJoinOpen}
        onJoined={() => {
          reloadLocalCompanyRegistry();
          triggerSync();
        }}
      />
    </Card>
  );
}
