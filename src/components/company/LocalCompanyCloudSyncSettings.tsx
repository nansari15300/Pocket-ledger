"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { CloudSyncHelpPopover } from "@/components/company/CloudSyncHelpPopover";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import usePermissions from "@/hooks/usePermissions";
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
import { ensureCloudSyncDriveEncryptionSalt } from "@/lib/localCloudSync/driveEncryption";
import { patchLocalCompanyCloudSyncFields, readCloudSyncConfigFromCompany } from "@/lib/localCloudSync/companyConfig";
import type { CloudSyncIntervalSec, CloudSyncProviderId } from "@/lib/localCloudSync/types";
import { CLOUD_SYNC_INTERVAL_SEC_OPTIONS } from "@/lib/localCloudSync/types";
import type { DriveAttachmentDateFolderMode } from "@/lib/localCloudSync/driveAttachmentPath";
import { forceReencryptDriveIfNeeded } from "@/lib/localCloudSync/forceReencryptDrive";
import { useDate } from "@/hooks/useDate";
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
import { endOfDay, format, formatDistanceToNow, startOfDay, subDays } from "date-fns";
import { Cloud, Loader2, RefreshCw, Save, Share2, ChevronLeft, PanelRight } from "lucide-react";
import { settingsViewHref } from "@/lib/appNavHref";
import { usePathname, useRouter } from "next/navigation";
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
import {
  listDeviceSyncSummaryHistory,
  summarizeDeviceSyncHistory,
} from "@/lib/localCloudSync/deviceSyncSummaryHistory";

type Props = {
  companyId: string;
  company: LocalCompanyDoc | Record<string, unknown>;
  /** Parent flex column — mobile scroll + fixed footer ke liye */
  className?: string;
  /** Footer Back — settings list (mobile/APK) */
  onBack?: () => void;
  /** Mobile settings list sheet — Force sync ke upar sidebar toggle */
  onOpenSettingsList?: () => void;
};

function dateFolderModeLabel(mode: DriveAttachmentDateFolderMode): string {
  if (mode === "bs") return "BS only";
  if (mode === "both") return "Both";
  return "AD only";
}

function formatDateInputValue(ms: number): string {
  return format(new Date(ms), "yyyy-MM-dd");
}

function parseDateInputStartMs(raw: string): number {
  const s = String(raw || "").trim();
  if (!s) return startOfDay(new Date()).getTime();
  return startOfDay(new Date(`${s}T00:00:00`)).getTime();
}

function parseDateInputEndMs(raw: string): number {
  const s = String(raw || "").trim();
  if (!s) return endOfDay(new Date()).getTime();
  return endOfDay(new Date(`${s}T00:00:00`)).getTime();
}

function parseIsoDateToAd(raw: string): Date | undefined {
  const s = String(raw || "").trim();
  if (!s) return undefined;
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function formatSyncIntervalLabel(sec: number): string {
  // UI labels ko human-readable rakho: live/sec/min mix ek hi dropdown me clear dikhe.
  if (sec <= 1) return "Live";
  if (sec % 60 === 0) return `${sec / 60} min`;
  return `${sec} sec`;
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

/** Sirf device-local companies — Firestore companies par ye card hide. */
export function LocalCompanyCloudSyncSettings({ companyId, company, className, onBack, onOpenSettingsList }: Props) {
  const { user } = useAuth();
  const { dateSystem } = useDate();
  const { reloadLocalCompanyRegistry, allCompanies, setCompanyId } = useCompany();
  const { role } = usePermissions();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  /** Device-local companies — header dropdown; isi par sync chalega */
  const localCompanies = useMemo(
    () => allCompanies.filter((c) => isOfflineCompanyStorage(c as { storageOption?: string })),
    [allCompanies]
  );
  /** Footer Share — "Share company on Drive" card; default band */
  const [sharePanelOpen, setSharePanelOpen] = useState(false);

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
  // Date filter defaults: system date (today) from/to.
  const [summaryFromDate, setSummaryFromDate] = useState<string>(() => formatDateInputValue(new Date().getTime()));
  const [summaryToDate, setSummaryToDate] = useState<string>(() => formatDateInputValue(new Date().getTime()));
  const [deviceSummary, setDeviceSummary] = useState({
    createdFiles: 0,
    createdVouchers: 0,
    uploadedFiles: 0,
    uploadedVouchers: 0,
    downloadedFiles: 0,
    downloadedVouchers: 0,
    matchedRuns: 0,
  });
  // Summary date inputs ko Date objects me mirror karo taaki BS picker bind kar sake.
  const summaryFromAdDate = useMemo(() => parseIsoDateToAd(summaryFromDate), [summaryFromDate]);
  const summaryToAdDate = useMemo(() => parseIsoDateToAd(summaryToDate), [summaryToDate]);

  const cfg = readCloudSyncConfigFromCompany(company);
  const [enabled, setEnabled] = useState(cfg.cloudSyncEnabled);
  const [provider, setProvider] = useState<CloudSyncProviderId>(cfg.cloudSyncProvider ?? "google_drive");
  const [dateFolderMode, setDateFolderMode] = useState<DriveAttachmentDateFolderMode>(
    cfg.cloudSyncDriveDateFolderMode ?? "ad"
  );
  const [encryptDriveData, setEncryptDriveData] = useState(cfg.cloudSyncEncryptDriveData);
  const [encryptDriveFiles, setEncryptDriveFiles] = useState(cfg.cloudSyncEncryptDriveFiles);
  // Drive encryption policy admin-owned hai; shared/non-admin devices sirf synced state dekhte hain.
  const canManageDriveEncryption = role === "owner" || role === "manager";
  const encryptionControlsDisabled = busy || !canManageDriveEncryption;
  const [encryptionPasswordDialogOpen, setEncryptionPasswordDialogOpen] = useState(false);
  const [encryptionPasswordInput, setEncryptionPasswordInput] = useState("");
  const [encryptionPasswordSaving, setEncryptionPasswordSaving] = useState(false);
  const encryptionPasswordPromptDismissedRef = useRef(false);
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
  // Folder mode card ab always visible hai, isliye dirty-state country/provider se independent rakho.
  const folderModeDirty = dateFolderMode !== savedDateFolderMode;

  useEffect(() => {
    const next = readCloudSyncConfigFromCompany(company);
    setEnabled(next.cloudSyncEnabled);
    if (next.cloudSyncProvider) setProvider(next.cloudSyncProvider);
    if (next.cloudSyncDriveDateFolderMode) setDateFolderMode(next.cloudSyncDriveDateFolderMode);
    setEncryptDriveData(next.cloudSyncEncryptDriveData);
    setEncryptDriveFiles(next.cloudSyncEncryptDriveFiles);
    setSyncIntervalSec(next.cloudSyncIntervalSec);
  }, [company]);

  const refreshDeviceSummary = useCallback(() => {
    // Date range sanitize: from > to ho to auto-fix karke invalid empty card avoid karo.
    let fromMs = parseDateInputStartMs(summaryFromDate);
    let toMs = parseDateInputEndMs(summaryToDate);
    if (fromMs > toMs) {
      const fixed = fromMs;
      fromMs = toMs;
      toMs = fixed;
    }
    const summary = summarizeDeviceSyncHistory(companyId, { fromMs, toMs });
    const runs = listDeviceSyncSummaryHistory(companyId, { fromMs, toMs });
    setDeviceSummary({
      createdFiles: summary.createdFiles,
      createdVouchers: summary.createdVouchers,
      uploadedFiles: summary.uploadedFiles,
      uploadedVouchers: summary.uploadedVouchers,
      downloadedFiles: summary.downloadedFiles,
      downloadedVouchers: summary.downloadedVouchers,
      matchedRuns: runs.length,
    });
  }, [companyId, summaryFromDate, summaryToDate]);

  const refreshStatus = useCallback(async () => {
    const s = await getLocalCloudSyncStatus(companyId);
    setStatus({
      pending: s.pending,
      lastSyncAt: s.lastSyncAt,
      status: s.status,
      lastError: s.lastError,
      lastSyncSummary: s.lastSyncSummary,
    });
    // Poll + force-sync ke baad device-local timeline summary turant refresh karo.
    refreshDeviceSummary();
  }, [companyId, refreshDeviceSummary]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus, enabled]);

  useEffect(() => {
    const needsPassword = isCloudSyncEncryptionKeyRequiredError(status.lastError);
    if (!needsPassword) {
      // Naya non-encryption status aate hi next encryption failure par dialog phir se dikh sake.
      encryptionPasswordPromptDismissedRef.current = false;
      return;
    }
    if (!enabled || encryptionPasswordPromptDismissedRef.current) return;
    // Remote manifest se encryption ON aaya par local password/key missing hai — sync ke liye password yahin maango.
    setEncryptionPasswordDialogOpen(true);
  }, [enabled, status.lastError]);

  useEffect(() => {
    refreshDeviceSummary();
  }, [refreshDeviceSummary]);

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
    if (!canManageDriveEncryption) {
      toast({ variant: "destructive", title: "Admin only", description: "Only an admin can change Drive encryption." });
      return;
    }
    setEncryptDriveData(checked);
    await saveEncryptionFlags(checked, encryptDriveFiles, checked);
  };

  const onToggleEncryptDriveFiles = async (checked: boolean) => {
    if (!canManageDriveEncryption) {
      toast({ variant: "destructive", title: "Admin only", description: "Only an admin can change Drive encryption." });
      return;
    }
    setEncryptDriveFiles(checked);
    await saveEncryptionFlags(encryptDriveData, checked, checked);
  };

  const saveEncryptionPasswordAndRetrySync = async () => {
    const password = encryptionPasswordInput.trim();
    if (!password) {
      toast({ variant: "destructive", title: "Password required", description: "Enter the company encryption password." });
      return;
    }
    setEncryptionPasswordSaving(true);
    try {
      const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
      if (!reg) throw new Error("Company not found.");
      // Password local registry me save hota hai; Drive manifest me sirf salt/flags sync hote hain.
      await upsertLocalCompany({ ...reg, password, updatedAt: Date.now() } as LocalCompanyDoc);
      reloadLocalCompanyRegistry();
      setEncryptionPasswordDialogOpen(false);
      encryptionPasswordPromptDismissedRef.current = false;
      setEncryptionPasswordInput("");
      const res = await runLocalCloudSyncCycle(companyId, { force: true });
      await refreshStatus();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Sync failed", description: res.error || "Check password and try again." });
        return;
      }
      toast({ title: "Encryption unlocked", description: "Password saved on this device and sync completed." });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Password save failed",
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setEncryptionPasswordSaving(false);
    }
  };

  const saveFolderMode = async () => {
    if (!folderModeDirty) return;
    // User-selected mode ko direct save karo taaki static/web dono par same behavior mile.
    const folderModeToSave: DriveAttachmentDateFolderMode = dateFolderMode;
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
      // Bulk save me bhi selected folder mode preserve karo (hide/show toggle par reset na ho).
      const folderModeToSave: DriveAttachmentDateFolderMode = dateFolderMode;
      const savedEncryption = readCloudSyncConfigFromCompany(reg);
      // Non-admin Save button provider/interval ke liye allowed hai, par encryption admin manifest se hi preserve hogi.
      const dataToSave = canManageDriveEncryption ? encryptDriveData : savedEncryption.cloudSyncEncryptDriveData;
      const filesToSave = canManageDriveEncryption ? encryptDriveFiles : savedEncryption.cloudSyncEncryptDriveFiles;
      const salt =
        dataToSave || filesToSave
          ? ensureCloudSyncDriveEncryptionSalt(String(reg?.cloudSyncDriveEncryptionSalt ?? ""))
          : String(reg?.cloudSyncDriveEncryptionSalt ?? "").trim() || null;
      await saveConfig({
        cloudSyncEnabled: enabled,
        cloudSyncProvider: provider,
        cloudSyncEncryptDriveData: dataToSave,
        cloudSyncEncryptDriveFiles: filesToSave,
        cloudSyncEncryptDrive: dataToSave || filesToSave,
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

  /** Footer Back — settings list ya browser back (desktop fallback). */
  const handleFooterBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.replace(pathname, { scroll: false });
  };

  /** Mobile settings list — sirf icon; company-profile gray border rule se alag */
  const renderSettingsListFloatButton = () =>
    onOpenSettingsList ? (
      <button
        type="button"
        data-pl-settings-list-float=""
        data-pl-txn-icon-btn=""
        className="absolute -top-10 right-0 z-20 inline-flex cursor-pointer items-center justify-center border-0 bg-transparent p-1 text-foreground outline-none hover:opacity-80 disabled:pointer-events-none disabled:opacity-50"
        disabled={busy}
        title="Open settings list"
        aria-label="Open settings list"
        onClick={onOpenSettingsList}
      >
        <PanelRight className="h-5 w-5" />
      </button>
    ) : null;

  return (
    <>
    <Card
      className={cn(settingsDetailCardShell, "flex min-h-0 w-full flex-1 flex-col", className)}
      {...{ [companyProfileChromeRoot]: "" }}
    >
      <CardHeader className="shrink-0 px-2 py-3 sm:px-4">
        {/* Cloud sync | company dropdown | Enable cloud sync — ek row */}
        <CardTitle className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 text-base font-semibold sm:gap-x-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <Cloud className="h-4 w-4 shrink-0" />
            <span className="hidden truncate sm:inline">Cloud sync</span>
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
                  <p>Select a local company in the dropdown — sync runs for that company only.</p>
                </>
              }
            />
          </div>
          <Select
            value={companyId}
            disabled={busy || localCompanies.length === 0}
            onValueChange={(id) => setCompanyId(id)}
          >
            <SelectTrigger
              id="cloud-sync-company-select"
              className="h-8 min-w-0 w-full max-w-full truncate text-xs font-normal sm:text-sm"
              aria-label="Sync company"
            >
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              {localCompanies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name ?? c.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex shrink-0 items-center gap-1.5">
            <Checkbox
              id="local-company-cloud-sync-enabled"
              checked={enabled}
              onCheckedChange={(v) => void onToggleEnabled(v === true)}
            />
            <Label
              htmlFor="local-company-cloud-sync-enabled"
              className="cursor-pointer text-xs font-normal whitespace-nowrap sm:text-sm"
            >
              Enable cloud sync
            </Label>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="relative flex min-h-0 flex-1 flex-col gap-0 p-2 sm:p-4">
        {/* Scroll body — niche action bar + floating btn ke liye thoda gap */}
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-10 [scrollbar-gutter:stable]">
        {enabled ? (
          <div className="grid min-h-0 grid-cols-1 items-stretch gap-4 pb-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,13fr)]">
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
                    disabled={encryptionControlsDisabled}
                  />
                  <Label
                    htmlFor="local-company-cloud-sync-encrypt-data"
                    className={cn(
                      "text-sm font-normal",
                      encryptionControlsDisabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                    )}
                  >
                    Encrypt data (JSON)
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="local-company-cloud-sync-encrypt-files"
                    checked={encryptDriveFiles}
                    onCheckedChange={(v) => void onToggleEncryptDriveFiles(v === true)}
                    disabled={encryptionControlsDisabled}
                  />
                  <Label
                    htmlFor="local-company-cloud-sync-encrypt-files"
                    className={cn(
                      "text-sm font-normal",
                      encryptionControlsDisabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                    )}
                  >
                    Encrypt files (attachments)
                  </Label>
                </div>
                {!canManageDriveEncryption ? (
                  <p className="text-[11px] text-muted-foreground">
                    Admin ne jo encryption policy sync ki hai woh yahan read-only hai.
                  </p>
                ) : null}
              </div>

              {/* Attachment folder mode card: static/web par always visible rahe. */}
              {enabled ? (
                <div className={cloudSyncNepalFolderCard}>
                  <div className="flex items-center gap-1.5">
                    <Label>Attachment date folder</Label>
                    <CloudSyncHelpPopover
                      label="Attachment date folders"
                      description={
                        <>
                          <p>Choose AD, BS, or Both for new attachment uploads on cloud sync.</p>
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
                <p className="font-medium text-sm text-foreground">Sync summary (this device)</p>
                <div className="flex flex-wrap items-end gap-2 text-xs">
                  <label className="flex min-w-[8rem] flex-col gap-1">
                    <span>From</span>
                    {dateSystem === "AD" ? (
                      // AD mode: native picker
                      <input
                        type="date"
                        value={summaryFromDate}
                        onChange={(e) => setSummaryFromDate(e.target.value)}
                        className="h-8 rounded border border-black/30 bg-white px-2 text-xs"
                      />
                    ) : (
                      // BS/Both mode: header calendar system ke saath same BS picker.
                      <BsDatePicker
                        isRange={false}
                        valueAD={summaryFromAdDate}
                        onChangeAD={(d) => {
                          if (d instanceof Date) setSummaryFromDate(formatDateInputValue(d.getTime()));
                        }}
                        className="h-8 w-[8.8rem] text-xs"
                        hideTriggerIcon
                      />
                    )}
                  </label>
                  <label className="flex min-w-[8rem] flex-col gap-1">
                    <span>To</span>
                    {dateSystem === "AD" ? (
                      <input
                        type="date"
                        value={summaryToDate}
                        onChange={(e) => setSummaryToDate(e.target.value)}
                        className="h-8 rounded border border-black/30 bg-white px-2 text-xs"
                      />
                    ) : (
                      <BsDatePicker
                        isRange={false}
                        valueAD={summaryToAdDate}
                        onChangeAD={(d) => {
                          if (d instanceof Date) setSummaryToDate(formatDateInputValue(d.getTime()));
                        }}
                        className="h-8 w-[8.8rem] text-xs"
                        hideTriggerIcon
                      />
                    )}
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      const now = new Date();
                      // Preset: aaj ka complete day filter.
                      setSummaryFromDate(formatDateInputValue(now.getTime()));
                      setSummaryToDate(formatDateInputValue(now.getTime()));
                    }}
                  >
                    Today
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      const now = new Date();
                      // Preset: last 7 days including today.
                      setSummaryFromDate(formatDateInputValue(startOfDay(subDays(now, 6)).getTime()));
                      setSummaryToDate(formatDateInputValue(now.getTime()));
                    }}
                  >
                    Last 7 days
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Matched sync runs: {deviceSummary.matchedRuns}</p>
                <p className="text-sm">
                  Added (by this device): <strong>{deviceSummary.createdFiles}</strong> files (attachments) ·{" "}
                  <strong>{deviceSummary.createdVouchers}</strong> vouchers
                </p>
                <p className="text-sm">
                  Uploaded: <strong>{deviceSummary.uploadedFiles}</strong> files (attachments) ·{" "}
                  <strong>{deviceSummary.uploadedVouchers}</strong> vouchers
                </p>
                <p className="text-sm">
                  Downloaded from Drive: <strong>{deviceSummary.downloadedFiles}</strong> files ·{" "}
                  <strong>{deviceSummary.downloadedVouchers}</strong> vouchers
                </p>
              </div>

              {/* Left column — sync status (same width as Provider / Encrypt / Nepal cards) */}
              <div className={cloudSyncStatusCard}>
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 text-sm min-w-0">
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
                      {status.status === "syncing" || busy
                        ? "now"
                        : syncIntervalSec <= 1
                          ? "live"
                          : `${nextSyncInSec} sec`}
                    </strong>
                  </p>
                </div>
                  <CloudSyncHelpPopover
                    label="Sync status & actions"
                    hasError={!!status.lastError || localSyntheticAuth}
                    description={
                      <>
                        <p>
                          <strong>Connect:</strong> link Google Drive on this device.
                        </p>
                        <p>
                          <strong>Force sync:</strong> upload edits + download from Drive (master/voucher changes included).
                        </p>
                        <p>
                          <strong>Re-download:</strong> reset cursor and pull all ops again (help only — use Force sync if unsure).
                        </p>
                        <hr className="border-border my-2" />
                        <p>
                          Status: <strong>{status.status}</strong> · Pending: <strong>{status.pending}</strong>
                        </p>
                        {renderCloudSyncStatusError(status.lastError, localSyntheticAuth)}
                      </>
                    }
                  />
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
                          {formatSyncIntervalLabel(sec)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Right 65% — PC par always visible, mobile par footer Share toggle se open/close. */}
            {provider === "google_drive" ? (
              <div
                className={cn(
                  "w-full min-w-0 order-1 lg:order-2 h-full min-h-0 flex-col space-y-2",
                  sharePanelOpen ? "flex" : "hidden lg:flex"
                )}
              >
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
          <p className="pb-3 text-sm text-muted-foreground">Enable cloud sync above to configure provider and sync.</p>
        )}
        </div>

        {/* Fixed footer — scroll ke saath move na ho (web / EXE / APK same) */}
        {enabled ? (
          <div className="relative -mx-2 shrink-0 border-t border-black/10 bg-inherit px-2 pt-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:-mx-4 sm:px-4">
            {renderSettingsListFloatButton()}
            <div className="grid grid-cols-3 gap-2">
              {provider === "google_drive" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="col-start-1 row-start-1 h-10 w-full min-w-0 rounded-lg px-1.5 text-[11px] leading-tight sm:h-9 sm:px-4 sm:text-sm"
                    disabled={busy}
                    onClick={() => void connectDrive()}
                  >
                    Connect
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="col-start-2 row-start-1 h-10 w-full min-w-0 rounded-lg px-1.5 text-[11px] leading-tight sm:h-9 sm:px-4 sm:text-sm"
                    disabled={busy}
                    onClick={() => void disconnectDrive()}
                  >
                    Disconnect
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="col-start-3 row-start-1 h-10 w-full min-w-0 rounded-lg px-1.5 text-[11px] leading-tight sm:h-9 sm:px-4 sm:text-sm"
                disabled={busy}
                onClick={() => void forceSync()}
              >
                {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Force sync"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="col-start-1 row-start-2 h-10 w-full min-w-0 rounded-lg px-1.5 text-[11px] leading-tight sm:h-9 sm:px-4 sm:text-sm"
                disabled={busy}
                onClick={handleFooterBack}
              >
                <ChevronLeft className="mr-0.5 h-4 w-4 shrink-0" />
                Back
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="col-start-2 row-start-2 h-10 w-full min-w-0 rounded-lg px-1.5 text-[11px] leading-tight sm:h-9 sm:px-4 sm:text-sm"
                disabled={busy}
                onClick={() => void saveAllCloudSyncSettings()}
              >
                <Save className="mr-0.5 h-4 w-4 shrink-0" />
                Save
              </Button>
              <Button
                type="button"
                variant={sharePanelOpen ? "secondary" : "outline"}
                size="sm"
                className="col-start-3 row-start-2 h-10 w-full min-w-0 rounded-lg px-1.5 text-[11px] leading-tight sm:h-9 sm:px-4 sm:text-sm"
                disabled={busy || provider !== "google_drive"}
                aria-expanded={sharePanelOpen}
                title={sharePanelOpen ? "Hide share on Drive" : "Show share on Drive"}
                onClick={() => setSharePanelOpen((open) => !open)}
              >
                <Share2 className="mr-0.5 h-4 w-4 shrink-0" />
                Share
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
      {/* Sync OFF — mobile par Back; settings list floating upar right */}
      {!enabled && (onBack || onOpenSettingsList) ? (
        <div className="relative -mx-2 shrink-0 border-t border-black/10 px-2 py-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:-mx-4 sm:px-4">
          {renderSettingsListFloatButton()}
          {onBack ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={handleFooterBack}>
              <ChevronLeft className="mr-0.5 h-4 w-4 shrink-0" />
              Back
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
    <Dialog
      open={encryptionPasswordDialogOpen}
      onOpenChange={(open) => {
        setEncryptionPasswordDialogOpen(open);
        // User ne prompt close kiya ho to polling same error par turant dobara popup na khole.
        if (!open) encryptionPasswordPromptDismissedRef.current = true;
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Encryption password required</DialogTitle>
          <DialogDescription>
            Admin ne Drive/Dropbox encryption ON kiya hai. Is device par sync unlock karne ke liye company password enter karo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cloud-sync-encryption-password">Company password</Label>
          <Input
            id="cloud-sync-encryption-password"
            type="password"
            value={encryptionPasswordInput}
            onChange={(e) => setEncryptionPasswordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveEncryptionPasswordAndRetrySync();
            }}
            placeholder="Enter company password"
            autoComplete="current-password"
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={encryptionPasswordSaving}
            onClick={() => {
              setEncryptionPasswordDialogOpen(false);
              encryptionPasswordPromptDismissedRef.current = true;
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={encryptionPasswordSaving}
            onClick={() => void saveEncryptionPasswordAndRetrySync()}
          >
            {encryptionPasswordSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save & Sync
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
