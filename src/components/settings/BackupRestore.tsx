
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, Loader2, FileWarning, ShieldCheck, ShieldOff, Eye, EyeOff, Folder, Info } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import type { Company } from "@/hooks/useCompany";
import {
  collection,
  getDocs,
  query,
  writeBatch,
  doc,
  Timestamp,
  setDoc,
  serverTimestamp,
  addDoc,
  getDoc,
  where,
  orderBy,
  limit,
  startAfter,
  documentId,
} from "firebase/firestore";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { PermissionButton } from "@/components/permission";
import { assertCan, PermissionDeniedError } from "@/lib/permissions/enforcePermission";
import { decryptBytes, encryptData } from "@/lib/encryption";
import { isPlbpZipPayload, unpackPlbpZipBackup } from "@/lib/plbpBackupZip";
import Link from "next/link";
import { getLocalCompanyById, upsertLocalCompany } from "@/lib/localCompanyStore";
import { flushBrowserDbToIndexedDB, flushPendingBrowserDbSave, getBrowserDb } from "@/lib/localSqlite";
import {
  upsertCompanyDocInBrowserDb,
  notifyBrowserDbCollectionUpdated,
  listCompanyDocsFromBrowserDb,
  deleteAllCompanyDocsForCompany,
} from "@/lib/localCompanyDocMirror";
import {
  hydratePendingLocalFileRefsDeep,
  hydrateVoucherLocalAttachmentsForServer,
} from "@/lib/hydrateVoucherLocalAttachmentsForServer";
import { resolveEffectiveAccountPlanId } from "@/lib/accountPlanForOwner";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import {
  checkAttachmentBackupAllowed,
  checkAttachmentRestoreAllowed,
  formatAttachmentUsageRemaining,
  incrementAttachmentRestoreUsage,
  planAttachmentBackupRestoreEnabled,
} from "@/lib/attachmentBackupUsage";
import {
  applyAttachmentRefMapToBackupData,
  backupDataHasAttachmentBundle,
  backupDataHasOrphanAttachmentRefs,
  countRemoteAttachmentRefsInBackupData,
  getAttachmentRestoreEntryCount,
  prepareBackupDataForLocalCompanyRestore,
  restoreAttachmentsFromBackupData,
} from "@/lib/attachmentBackupBundle";
import { finalizeLocalCompanyRowAfterBackupRestore, markLocalBackupRestoreSelectionGrace } from "@/lib/localBackupRestoreCompany";
import { grantOpenLocalCompanySession } from "@/lib/companyUnlockGate";
import {
  dismissCompanyBackupRunLater,
  isCompanyBackupRunning,
  cancelCompanyBackupRun,
  startCompanyBackupRun,
} from "@/lib/companyBackupRunner";
import { COLLECTIONS_TO_BACKUP } from "@/lib/companyBackupCore";
import {
  beginRestoreCloudFilesUpload,
  persistPendingRestoreCloudPush,
  queuePendingRestoreCloudPushFilesOnly,
  uploadRestoreDataToCloudImmediately,
} from "@/lib/restoreCloudBackgroundSync";
import type { CompanyBackupSourceMode } from "@/lib/companyBackupCore";
import { useCompanyBackupRun } from "@/hooks/useCompanyBackupRun";
import { readBackupLocationDisplayLabel, formatNativeFolderDisplayPath } from "@/lib/backupLocationDisplay";
import {
  readAutoBackupPrefs,
  saveAutoBackupPrefs,
  type AutoBackupFrequency,
  type AutoBackupPrefs,
} from "@/lib/autoBackupPrefs";
import { Switch } from "@/components/ui/switch";
import { BackupProgressStrip } from "@/components/settings/BackupProgressStrip";
import type { CompanyBackupProgress } from "@/lib/companyBackupCore";
import {
  countRestoreWorkUnits,
  createRestoreProgressReporter,
} from "@/lib/companyRestoreProgress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Capacitor } from "@capacitor/core";
import {
  readBackupSaveLocationPrefs,
  readWebBackupDirectoryHandle,
  isNativeRuntime,
  ensureNativeBackupStoragePermission,
  canPickWebBackupFolder,
  clearWebBackupDirectoryHandle,
  saveBackupSaveLocationPrefs,
  storeWebBackupDirectoryHandle,
  storeWebLiveDataDirectoryHandle,
  clearWebLiveDataDirectoryHandle,
  readWebLiveDataDirectoryHandle,
  ensureLiveMirrorAutoPassphrase,
} from "@/lib/backupSaveLocation";
import {
  readLiveDataFolderPrefs,
  saveLiveDataFolderPrefs,
  syncAllLocalCompanyMirrorsToFolder,
  clearLiveDataFolderPrefsAndSession,
  ensureLiveDataMirrorSalt,
  POCKET_LEDGER_MIRROR_DIR,
  COMPANIES_DIR_SEGMENT,
  getOrCreatePocketLedgerDir,
} from "@/lib/liveDataFolderMirror";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { pathnameForModalRouterReplace } from "@/lib/modalUrlSync";
import { parseFirestoreDateFieldToJsDate } from "@/lib/voucherDateNormalize";
import { generateCompanyId } from "@/lib/generateCompanyId";
import { cn } from "@/lib/utils";
import { chromeProPillCn } from "@/lib/chromePillButton";
import { canPickElectronBackupDirectory } from "@/lib/electronBackupFolder";
import { isEmbeddedOfflinePreloadClient } from "@/lib/isEmbeddedOfflinePreloadClient";
import {
  runStaticCompanyBackupPredownload,
  type StaticBackupPredownloadProgress,
} from "@/lib/staticBackupPredownload";

/** Backup cards — header jaisa blue pill tone; chhoti screen par wrap. */
const backupCardPillCn = cn(
  chromeProPillCn,
  "inline-flex h-auto min-h-9 max-w-full flex-wrap items-center rounded-full px-3 py-1.5 text-sm font-medium"
);

/** Card header: title upar, actions neeche wrap (mobile); desktop par ek row. */
const backupCardHeaderLayoutCn = "flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between";
const backupCardHeaderActionsCn = "flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end";
const backupCardActionBtnCn = "w-full sm:w-auto";

type BackupLocationFieldProps = {
  locationLabel: string;
  onChooseLocation: () => void;
  /** Backup Data card me button footer me hai — yahan sirf path dikhao. */
  showButton?: boolean;
  /** Web par visible lekin disabled — sirf static/APK me chalega (getDirectoryHandle). */
  disabled?: boolean;
  disabledHint?: string;
};

/** Backup Data + auto backup — ek hi prefs label; kisi card se choose → dono refresh. */
function BackupLocationField({
  locationLabel,
  onChooseLocation,
  showButton = true,
  disabled = false,
  disabledHint,
}: BackupLocationFieldProps) {
  return (
    <div className={cn("space-y-2 text-sm text-muted-foreground", disabled && "opacity-60")}>
      <p>
        Backup location:{" "}
        <span className="font-medium text-foreground break-all">{locationLabel}</span>
      </p>
      {disabled && disabledHint ? (
        <p className="text-xs text-muted-foreground">{disabledHint}</p>
      ) : null}
      {showButton ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={onChooseLocation}
          className={backupCardActionBtnCn}
        >
          Backup location
        </Button>
      ) : null}
    </div>
  );
}

/** Local/static restore: SQLite `companies` + `company_docs` — create-company-local jaisa; Firebase password zaroori nahi */
function fiscalFieldToLocalIso(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "string" && val.trim()) return val;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (val && typeof val === "object" && "seconds" in val) {
    const s = Number((val as { seconds: number }).seconds);
    const ns = Number((val as { nanoseconds?: number }).nanoseconds ?? 0);
    if (!Number.isFinite(s)) return null;
    return new Date(s * 1000 + ns / 1e6).toISOString();
  }
  try {
    const d = (val as { toDate?: () => Date }).toDate?.();
    if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString();
  } catch {
    /* ignore */
  }
  return null;
}

const collectionsToBackup = [...COLLECTIONS_TO_BACKUP];

/** Firestore ek query me ~1000 doc cap — pages se poora subcollection (warna backup adhura) */
const BACKUP_PAGE_SIZE = 500;

/** Backup blob ko native files API ke liye base64 me badlo. */
async function blobToBase64DataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error ?? new Error("Failed to read blob"));
    r.readAsDataURL(blob);
  });
}

/**
 * Backup file download/save:
 * - Web: File System Access "Save As" (location picker) if supported.
 * - Native APK: optional SAF tree (`content://...`) via BackupSaf plugin; else Documents + share sheet.
 * - Fallback: anchor download.
 */
async function saveBackupBlobWithBestEffort(blob: Blob, fileName: string): Promise<{ where: string }> {
  const savePrefs = readBackupSaveLocationPrefs();
  // Native APK must use native branch first; web picker on Android WebView can throw AbortError and fake "location not selected".
  if (Capacitor.isNativePlatform()) {
    try {
      const dataUrl = await blobToBase64DataUrl(blob);
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
      const treeUri = String(savePrefs.nativeFolderPath || "").trim();

      // Folder picker on Android returns a SAF tree URI — Capacitor Filesystem cannot write there; use native plugin.
      if (treeUri.startsWith("content://")) {
        try {
          const { BackupSaf } = await import("@/lib/capacitorBackupSaf");
          await BackupSaf.writeToTreeUri({ treeUri, fileName, data: base64 });
          return { where: "Selected folder (device)" };
        } catch {
          /* fall through to Documents + Share */
        }
      }

      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      // Static build/native: request storage permission before writing backup file (app Documents / external).
      const granted = await ensureNativeBackupStoragePermission();
      if (!granted) {
        throw new Error(
          "Storage permission denied. Choose a folder under Backup & Restore → Backup location, or save via Share."
        );
      }
      const nativeDirectory =
        savePrefs.nativeDirectory === "EXTERNAL"
          ? ((Directory as unknown as Record<string, unknown>).ExternalStorage ?? Directory.Documents)
          : Directory.Documents;
      const rawSubfolder = String(savePrefs.nativeSubfolder || "").trim();
      const safeSubfolder = rawSubfolder.replace(/^[\\/]+|[\\/]+$/g, "");
      const finalPath = safeSubfolder ? `${safeSubfolder}/${fileName}` : fileName;
      if (safeSubfolder) {
        await Filesystem.mkdir({
          path: safeSubfolder,
          directory: nativeDirectory as any,
          recursive: true,
        }).catch(() => undefined);
      }
      await Filesystem.writeFile({
        path: finalPath,
        data: base64,
        directory: nativeDirectory as any,
      });
      const savedUriResp = await Filesystem.getUri({ path: finalPath, directory: nativeDirectory as any });
      const savedUri = String((savedUriResp as any)?.uri || "");
      try {
        await Share.share({
          title: fileName,
          url: savedUri,
          dialogTitle: "Save backup file",
        });
      } catch {
        /* share cancel shouldn't fail backup write */
      }
      const dirLabel = savePrefs.nativeDirectory === "EXTERNAL" ? "ExternalStorage" : "Documents";
      const where = `${dirLabel}/${finalPath}`;
      return { where };
    } catch {
      // Native write fail -> continue to browser/web fallback
    }
  }
  let webPreferredFolderFailed = false;
  if (typeof window !== "undefined") {
    try {
      // Device settings: fixed web folder — direct save jab user ne folder choose kiya ho.
      if (!isNativeRuntime() && savePrefs.webUseSelectedFolder) {
        const dirHandle = await readWebBackupDirectoryHandle();
        if (!dirHandle) {
          // Missing saved handle: fall back to Save As instead of hard failing.
          webPreferredFolderFailed = true;
        } else {
          if (typeof dirHandle.queryPermission === "function") {
            const p = await dirHandle.queryPermission({ mode: "readwrite" });
            if (p !== "granted" && typeof dirHandle.requestPermission === "function") {
              try {
                const req = await dirHandle.requestPermission({ mode: "readwrite" });
                if (req !== "granted") {
                  webPreferredFolderFailed = true;
                }
              } catch (e) {
                if (e instanceof DOMException && e.name === "NotAllowedError") {
                  webPreferredFolderFailed = true;
                } else {
                  throw e;
                }
              }
            }
          }
          if (!webPreferredFolderFailed) {
            try {
              const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(blob);
              await writable.close();
              const label = savePrefs.webFolderLabel || "Selected folder";
              return { where: `${label}/${fileName}` };
            } catch (e) {
              if (e instanceof DOMException && e.name === "NotAllowedError") {
                webPreferredFolderFailed = true;
              } else {
                throw e;
              }
            }
          }
        }
      }

      const picker = (window as any).showSaveFilePicker;
      if (typeof picker === "function") {
        const handle = await picker({
          suggestedName: fileName,
          types: [{ description: "Pocket Ledger Backup", accept: { "application/octet-stream": [".plbp"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return {
          where: webPreferredFolderFailed
            ? "Selected folder (Save As fallback)"
            : "Selected folder (Save As)",
        };
      }
    } catch (e: any) {
      if (e?.name === "AbortError") throw e;
      // picker unsupported/blocked -> नीचे fallback
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
  return { where: "Browser Downloads folder" };
}

/** Native picker se aayi base64 payload ko browser-compatible File me convert karo. */
function fileFromBase64Payload(base64Data: string, fileName: string, mimeType?: string): File {
  const normalized = String(base64Data || "").includes(",")
    ? String(base64Data).split(",")[1] || ""
    : String(base64Data || "");
  const binary = typeof atob === "function" ? atob(normalized) : "";
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName || "backup.plbp", {
    type: mimeType || "application/octet-stream",
  });
}

/** Firestore subcollections `companies/{id}/…` — cloud doc id kabhi `authoritativeCompanyId` hota hai, registry `companyId` se alag */
async function fetchSubcollectionAllDocsPaginated(
  firestoreCompanyId: string,
  colName: string
): Promise<Array<Record<string, unknown> & { id: string }>> {
  const colRef = collection(firestore, `companies/${firestoreCompanyId}/${colName}`);
  const out: Array<Record<string, unknown> & { id: string }> = [];
  let last: QueryDocumentSnapshot | null = null;
  for (;;) {
    const q = last
      ? query(colRef, orderBy(documentId()), startAfter(last), limit(BACKUP_PAGE_SIZE))
      : query(colRef, orderBy(documentId()), limit(BACKUP_PAGE_SIZE));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      out.push({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string });
    }
    if (snap.docs.length < BACKUP_PAGE_SIZE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return out;
}

function docRowUpdatedMs(row: Record<string, unknown>): number {
  const u = row.updatedAt ?? row.lastEditedAt ?? row.createdAt;
  if (u && typeof u === "object" && "toMillis" in u && typeof (u as { toMillis?: () => number }).toMillis === "function") {
    try {
      const ms = (u as { toMillis: () => number }).toMillis();
      return typeof ms === "number" && Number.isFinite(ms) ? ms : 0;
    } catch {
      return 0;
    }
  }
  if (u && typeof u === "object" && "seconds" in u) {
    const s = Number((u as { seconds: number }).seconds);
    return Number.isFinite(s) ? s * 1000 : 0;
  }
  if (typeof u === "number" && Number.isFinite(u)) return u;
  return 0;
}

/** SQLite mirror me jo abhi Firestore pe flush nahi (journal 2 missing) — merge se backup pura */
function mergeFirestoreRowsWithLocalMirrorForBackup(
  fsRows: Array<Record<string, unknown> & { id: string }>,
  localRows: Array<Record<string, unknown> & { id: string }>
): Array<Record<string, unknown> & { id: string }> {
  const byId = new Map<string, Record<string, unknown> & { id: string }>();
  for (const r of fsRows) {
    byId.set(String(r.id), { ...r });
  }
  for (const r of localRows) {
    const id = String(r.id);
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, { ...r });
      continue;
    }
    const tFs = docRowUpdatedMs(prev);
    const tLoc = docRowUpdatedMs(r);
    if (tLoc > tFs) byId.set(id, { ...prev, ...r });
  }
  return Array.from(byId.values());
}

/**
 * Online backup → local slot restore: backup file me purana `companyId` nested objects me rehta hai;
 * SQLite `company_id` = naya slot — mismatch se listeners / filters galat. Sirf exact string match replace (Timestamps chhod do).
 */
function rewriteBackupCompanyIdsDeep(backupCompanyId: string, targetCompanyId: string, val: unknown): unknown {
  if (!backupCompanyId || backupCompanyId === targetCompanyId) return val;
  if (val === backupCompanyId) return targetCompanyId;
  if (Array.isArray(val)) return val.map((v) => rewriteBackupCompanyIdsDeep(backupCompanyId, targetCompanyId, v));
  if (val !== null && typeof val === "object") {
    const o = val as Record<string, unknown>;
    if (typeof o.seconds === "number" && "nanoseconds" in o) return val;
    if (o.__fsTs === true) return val;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      out[k] = rewriteBackupCompanyIdsDeep(backupCompanyId, targetCompanyId, o[k]);
    }
    return out;
  }
  return val;
}

/** Replace open company vs nayi company id (purana flow). */
export type RestoreTargetMode = "replace_current" | "new_company";

async function clearFirestoreCompanySubcollectionsForRestore(fsCompanyId: string): Promise<void> {
  const cid = String(fsCompanyId || "").trim();
  if (!cid) return;
  for (const colName of collectionsToBackup) {
    const colRef = collection(firestore, `companies/${cid}/${colName}`);
    for (;;) {
      const snap = await getDocs(query(colRef, limit(400)));
      if (snap.empty) break;
      const batch = writeBatch(firestore);
      for (const d of snap.docs) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }
  }
}

/** Restore confirm: user picks final `name` — default slot (target); ya backup file wala naam (agar khali ho to doosra fallback). */
function resolveRestoreFinalCompanyName(
  choice: "target" | "backup",
  targetName: string,
  backupName: string
): string {
  const t = String(targetName ?? "").trim();
  const b = String(backupName ?? "").trim();
  if (choice === "backup") return b || t;
  return t || b;
}

function resolveRestoreIncludeAttachments(
  restoreIncludeAttachments: boolean,
  backupData: Record<string, unknown> | null
): boolean {
  return restoreIncludeAttachments && backupDataHasAttachmentBundle(backupData);
}

function resolveRestoreZipFiles(
  stateZip: Map<string, Uint8Array> | null,
  refZip: Map<string, Uint8Array> | null
): Map<string, Uint8Array> | null {
  if (stateZip?.size) return stateZip;
  if (refZip?.size) return refZip;
  return stateZip ?? refZip;
}

/** Cloud restore: `local:` pending blobs → Firebase Storage HTTPS (app / doosre device resolve kar sakein). */
async function hydrateRestoredFieldsForCloudUpload(
  fsCompanyId: string,
  collectionName: string,
  fields: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (collectionName === "vouchers") {
    const voucherHydrated = await hydrateVoucherLocalAttachmentsForServer(fsCompanyId, fields);
    return hydratePendingLocalFileRefsDeep(fsCompanyId, voucherHydrated);
  }
  return hydratePendingLocalFileRefsDeep(fsCompanyId, fields);
}

export function BackupRestore() {
  const resolveUidFromUserRef = async (userRefId?: string, email?: string) => {
    if (userRefId) {
      const ownerSnap = await getDoc(doc(firestore, "users", userRefId));
      if (ownerSnap.exists()) {
        const data: any = ownerSnap.data();
        return data?.uid || ownerSnap.id || userRefId;
      }
    }
    if (email) {
      const ownerQ = query(collection(firestore, "users"), where("email", "==", email));
      const ownerSnap = await getDocs(ownerQ);
      if (!ownerSnap.empty) {
        const data: any = ownerSnap.docs[0].data();
        return data?.uid || ownerSnap.docs[0].id;
      }
    }
    return userRefId || null;
  };

  const sendSecurityAlertClient = async (params: {
    backupOwnerId?: string;
    backupOwnerEmail?: string;
    backupSharedWith?: any[];
    attemptedByUid: string;
    attemptedByEmail: string;
    attemptedByName?: string;
    companyName: string;
    companyId: string;
  }) => {
    const {
      backupOwnerId,
      backupOwnerEmail,
      backupSharedWith,
      attemptedByUid,
      attemptedByEmail,
      attemptedByName,
      companyName,
      companyId,
    } = params;

    // Only company admin (owner) receives security alerts; not shared users.
    const recipientUserIds = new Set<string>();
    const ownerUid = await resolveUidFromUserRef(backupOwnerId, backupOwnerEmail);
    if (ownerUid) recipientUserIds.add(ownerUid);

    if (recipientUserIds.size === 0 && companyId) {
      const liveCompanySnap = await getDoc(doc(firestore, "companies", companyId));
      if (liveCompanySnap.exists()) {
        const liveCompany = liveCompanySnap.data() as any;
        const fallbackOwnerUid = await resolveUidFromUserRef(liveCompany?.ownerId, liveCompany?.ownerEmail);
        if (fallbackOwnerUid) recipientUserIds.add(fallbackOwnerUid);
      }
    }
    if (recipientUserIds.size === 0) return false;

    const liveAlertMessage = `Security Alert: User "${attemptedByEmail}" tried to restore your company "${companyName}". Attempt was blocked automatically.`;
    await Promise.all(Array.from(recipientUserIds).map((recipientUserId) =>
      addDoc(collection(firestore, "admin_notifications"), {
        recipientUserId,
        message: liveAlertMessage,
        timestamp: serverTimestamp(),
        isRead: false,
        type: "security_alert",
        companyId,
        attemptedBy: {
          uid: attemptedByUid,
          email: attemptedByEmail,
          ...(attemptedByName ? { name: attemptedByName } : {}),
        },
      })
    ));
    return true;
  };

  const { company, companyId, allCompanies, setCompanyId, reloadLocalCompanyRegistry, triggerSync } = useCompany();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user, customUser } = useAuth();
  const { toast } = useToast();
  const { can } = usePermissions();
  const livePlans = useLivePlans();
  const accountPlanId = useMemo(
    () => resolveEffectiveAccountPlanId(allCompanies, user?.uid, company?.planId),
    [allCompanies, user?.uid, company?.planId]
  );
  const accountPlanLive = useMemo(
    () => getPlanFromPlans(livePlans, accountPlanId),
    [livePlans, accountPlanId]
  );
  const attachmentFeatureOn = planAttachmentBackupRestoreEnabled(accountPlanId, accountPlanLive);
  const backupRun = useCompanyBackupRun();
  const isBackingUp = backupRun.status === "running";
  const backupProgress = backupRun.progress;
  const [autoBackupPrefs, setAutoBackupPrefs] = useState<AutoBackupPrefs>(() => readAutoBackupPrefs());
  const [backupLocationLabel, setBackupLocationLabel] = useState("Not set");
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<CompanyBackupProgress | null>(null);
  const restoreAbortRef = useRef<AbortController | null>(null);
  /** v3 zip backup: decrypt ke baad attachment bytes yahan — restore tak memory me. */
  const restoreZipFilesRef = useRef<Map<string, Uint8Array> | null>(null);
  const [restoreZipFilesByPath, setRestoreZipFilesByPath] = useState<Map<string, Uint8Array> | null>(null);
  const [fileToRestore, setFileToRestore] = useState<File | null>(null);
  const [isOverwriteConfirmOpen, setIsOverwriteConfirmOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [isEncryptedBackupConfirmOpen, setIsEncryptedBackupConfirmOpen] = useState(false);
  const [decryptionPassword, setDecryptionPassword] = useState('');
  const [showDecryptionPassword, setShowDecryptionPassword] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptionError, setDecryptionError] = useState<string | null>(null);
  const [backupDataToRestore, setBackupDataToRestore] = useState<any>(null);
  const [backupLocationDialogOpen, setBackupLocationDialogOpen] = useState(false);
  const [webUseSelectedFolder, setWebUseSelectedFolder] = useState(false);
  const [webFolderLabel, setWebFolderLabel] = useState<string | null>(null);
  const [webFolderDisplayPath, setWebFolderDisplayPath] = useState<string | null>(null);
  const [nativeFolderPath, setNativeFolderPath] = useState<string | null>(null);
  const [savingBackupLocation, setSavingBackupLocation] = useState(false);
  const [liveDataLocationDialogOpen, setLiveDataLocationDialogOpen] = useState(false);
  const [liveWebEnabled, setLiveWebEnabled] = useState(false);
  const [liveWebLabel, setLiveWebLabel] = useState<string | null>(null);
  const [liveNativeFolderPath, setLiveNativeFolderPath] = useState<string | null>(null);
  const [savingLiveDataLocation, setSavingLiveDataLocation] = useState(false);
  const supportsWebFolderPicker = canPickWebBackupFolder();
  const nativeRuntime = isNativeRuntime();
  /** APK / static export / Electron — attachment backup + SQLite-first backup. */
  const staticBackupClient = isEmbeddedOfflinePreloadClient();
  /** Cloud-linked company: user choose SQLite vs Firestore — pehle default Firestore tha, local UI blank ho jati thi */
  const [restoreToLocalSqlite, setRestoreToLocalSqlite] = useState(true);
  /** Restore ke baad `companies.name`: default = jis slot mein restore ho raha hai (target); alternate = backup file ka naam */
  const [restoreCompanyNameChoice, setRestoreCompanyNameChoice] = useState<"target" | "backup">("target");
  const [restoreTargetMode, setRestoreTargetMode] = useState<RestoreTargetMode>("replace_current");
  /** Create Backup bina company password — popup (mobile layout safe); user Close kare tab tak. */
  const [backupPasswordHintOpen, setBackupPasswordHintOpen] = useState(false);
  /** Backup confirm: data-only vs attachment embed (Option A). */
  const [backupIncludeAttachments, setBackupIncludeAttachments] = useState(false);
  const [backupSourceMode, setBackupSourceMode] = useState<CompanyBackupSourceMode>("local_only");
  const [backupAttachmentGateHint, setBackupAttachmentGateHint] = useState<string | null>(null);
  /** Restore: bundle ho to attachments restore karna hai ya sirf URLs. */
  const [restoreIncludeAttachments, setRestoreIncludeAttachments] = useState(false);
  const [restoreAttachmentGateHint, setRestoreAttachmentGateHint] = useState<string | null>(null);
  const [predownloadRunning, setPredownloadRunning] = useState(false);
  const [predownloadProgress, setPredownloadProgress] = useState<StaticBackupPredownloadProgress | null>(null);
  const predownloadAbortRef = useRef<AbortController | null>(null);

  /** Device backup folder prefs → UI state; dono cards same label share karte hain. */
  const refreshBackupLocationUi = useCallback(() => {
    const prefs = readBackupSaveLocationPrefs();
    setWebUseSelectedFolder(prefs.webUseSelectedFolder);
    setWebFolderLabel(prefs.webFolderLabel);
    setWebFolderDisplayPath(prefs.webFolderDisplayPath);
    setNativeFolderPath(prefs.nativeFolderPath ?? null);
    setBackupLocationLabel(readBackupLocationDisplayLabel());
  }, []);

  const openBackupLocationDialog = () => setBackupLocationDialogOpen(true);

  /** Restore cancel — backup runner jaisa AbortController. */
  const cancelRestoreRun = () => {
    if (!isRestoring || !restoreAbortRef.current) return false;
    restoreAbortRef.current.abort();
    return true;
  };

  const beginRestoreProgress = (backupData: Record<string, unknown>, restoreAttachments: boolean) => {
    restoreAbortRef.current?.abort();
    restoreAbortRef.current = new AbortController();
    const signal = restoreAbortRef.current.signal;
    const total = countRestoreWorkUnits(backupData, restoreAttachments, collectionsToBackup);
    const report = createRestoreProgressReporter(total, setRestoreProgress, signal);
    report.tick("Starting restore", "Preparing…", 0, 0);
    return { signal, report };
  };

  // Reset restore choices only when the confirm dialog opens — not when attachment hints update while open.
  useEffect(() => {
    if (!isOverwriteConfirmOpen) return;
    setRestoreToLocalSqlite(true);
    setRestoreCompanyNameChoice("target");
    setRestoreTargetMode("replace_current");
    const hasBundle = backupDataHasAttachmentBundle(backupDataToRestore);
    // Local device restore: attachments default ON jab backup me embedded files hon.
    setRestoreIncludeAttachments(Boolean(hasBundle));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: open-only reset
  }, [isOverwriteConfirmOpen]);

  useEffect(() => {
    // Attachment backup dialog: plan limit hint (online merge + attachments only).
    if (!isEncryptedBackupConfirmOpen || !user?.uid || backupSourceMode === "local_only") {
      setBackupAttachmentGateHint(null);
      return;
    }
    void (async () => {
      const gate = await checkAttachmentBackupAllowed(user.uid, accountPlanId);
      if (!attachmentFeatureOn) {
        setBackupAttachmentGateHint("Not included on your plan — use Data only or upgrade.");
        return;
      }
      setBackupAttachmentGateHint(formatAttachmentUsageRemaining(gate.cap, gate.used));
    })();
  }, [isEncryptedBackupConfirmOpen, user?.uid, accountPlanId, attachmentFeatureOn, backupSourceMode]);

  useEffect(() => {
    if (!isOverwriteConfirmOpen || !user?.uid || !backupDataHasAttachmentBundle(backupDataToRestore)) {
      setRestoreAttachmentGateHint(null);
      return;
    }
    if (staticBackupClient || restoreToLocalSqlite) {
      setRestoreAttachmentGateHint(
        "Device restore: files stay on this app/browser storage — not auto-downloaded from server later."
      );
      return;
    }
    setRestoreAttachmentGateHint(
      "Cloud restore: files are written to this device first; after reload they upload to Firestore in the background."
    );
  }, [isOverwriteConfirmOpen, backupDataToRestore, user?.uid, restoreToLocalSqlite, staticBackupClient]);

  useEffect(() => {
    // Hydrate backup location prefs for this device.
    refreshBackupLocationUi();
    const live = readLiveDataFolderPrefs();
    setLiveWebEnabled(live.webEnabled);
    setLiveWebLabel(live.webFolderLabel);
    setLiveNativeFolderPath(live.nativeFolderPath);
    setAutoBackupPrefs(readAutoBackupPrefs());
  }, [refreshBackupLocationUi]);

  useEffect(() => {
    // Deep link — backup location dialog.
    if (searchParams.get("dialog") === "backup-location") {
      setBackupLocationDialogOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    // Password set ho gayi to inline hint auto band — dubara Create Backup try kar sake.
    if (company?.password && String(company.password).trim()) {
      setBackupPasswordHintOpen(false);
    }
  }, [company?.password]);

  const closeBackupLocationDialog = () => {
    setBackupLocationDialogOpen(false);
    refreshBackupLocationUi();
    if (searchParams.get("dialog") !== "backup-location") return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("dialog");
    const q = next.toString();
    const basePath = pathnameForModalRouterReplace(pathname || "");
    router.replace(q ? `${basePath}?${q}` : basePath, { scroll: false });
  };

  const handlePickWebFolder = async () => {
    try {
      // Desktop EXE: native dialog se poora path (D:\Backup PL\…) store karo.
      if (canPickElectronBackupDirectory()) {
        const { pickElectronBackupDirectory } = await import("@/lib/electronBackupFolder");
        const { path: pickedPath, cancelled } = await pickElectronBackupDirectory();
        if (cancelled || !pickedPath) return;
        await clearWebBackupDirectoryHandle();
        const leafName =
          pickedPath.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || "Selected folder";
        const prev = readBackupSaveLocationPrefs();
        saveBackupSaveLocationPrefs({
          ...prev,
          webUseSelectedFolder: true,
          webFolderLabel: leafName,
          webFolderDisplayPath: pickedPath,
        });
        setWebUseSelectedFolder(true);
        setWebFolderLabel(leafName);
        setWebFolderDisplayPath(pickedPath);
        toast({ title: "Backup location saved", description: `Folder set to ${pickedPath}.` });
        refreshBackupLocationUi();
        return;
      }

      if (!supportsWebFolderPicker) return;
      const picker = (window as any).showDirectoryPicker;
      const handle = await picker({ mode: "readwrite" });
      const ok = await storeWebBackupDirectoryHandle(handle);
      if (!ok) {
        toast({ variant: "destructive", title: "Failed", description: "Could not store selected folder on this device." });
        return;
      }
      const nextLabel = String(handle?.name || "Selected folder");
      const prev = readBackupSaveLocationPrefs();
      saveBackupSaveLocationPrefs({
        ...prev,
        webUseSelectedFolder: true,
        webFolderLabel: nextLabel,
        webFolderDisplayPath: null,
      });
      setWebUseSelectedFolder(true);
      setWebFolderLabel(nextLabel);
      setWebFolderDisplayPath(null);
      toast({ title: "Backup location saved", description: `Folder set to ${nextLabel}.` });
      refreshBackupLocationUi();
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      toast({ variant: "destructive", title: "Failed", description: "Could not select backup folder." });
    }
  };

  const handleClearWebFolder = async () => {
    await clearWebBackupDirectoryHandle();
    const prev = readBackupSaveLocationPrefs();
    saveBackupSaveLocationPrefs({
      ...prev,
      webUseSelectedFolder: false,
      webFolderLabel: null,
      webFolderDisplayPath: null,
    });
    setWebUseSelectedFolder(false);
    setWebFolderLabel(null);
    setWebFolderDisplayPath(null);
    toast({ title: "Backup location cleared", description: "Backup will ask location again." });
    refreshBackupLocationUi();
  };

  const handleSaveWebLocation = async () => {
    if (!webFolderLabel) {
      toast({ variant: "destructive", title: "Location not set", description: "Use Browse folder first, then save location." });
      return;
    }
    setSavingBackupLocation(true);
    try {
      const prev = readBackupSaveLocationPrefs();
      saveBackupSaveLocationPrefs({
        ...prev,
        webUseSelectedFolder: true,
        webFolderLabel,
      });
      setWebUseSelectedFolder(true);
      toast({ title: "Backup location saved", description: `Backups will save to ${webFolderLabel}.` });
      refreshBackupLocationUi();
    } finally {
      setSavingBackupLocation(false);
    }
  };

  const handlePickNativeFolder = async () => {
    try {
      const { FilePicker } = await import("@capawesome/capacitor-file-picker");
      const result = await FilePicker.pickDirectory();
      const pickedPath = String((result as { path?: string })?.path || "").trim();
      if (!pickedPath) {
        toast({ variant: "destructive", title: "No folder selected", description: "Please select a folder." });
        return;
      }
      setNativeFolderPath(pickedPath);
      const prev = readBackupSaveLocationPrefs();
      saveBackupSaveLocationPrefs({
        ...prev,
        nativeFolderPath: pickedPath,
        nativeSubfolder: "",
      });
      toast({ title: "Folder selected", description: "Browse-selected folder mode active." });
    } catch (e: any) {
      if (String(e?.message || "").toLowerCase().includes("canceled")) return;
      toast({ variant: "destructive", title: "Browse failed", description: "Could not open native folder browser." });
    }
  };

  const handleSaveNativeLocation = async () => {
    if (!nativeFolderPath?.trim()) {
      toast({ variant: "destructive", title: "Location not set", description: "Use Browse folder first, then save location." });
      return;
    }
    setSavingBackupLocation(true);
    try {
      const prev = readBackupSaveLocationPrefs();
      saveBackupSaveLocationPrefs({
        ...prev,
        nativeFolderPath: nativeFolderPath.trim(),
        nativeSubfolder: "",
      });
      toast({
        title: "Backup location saved",
        description: `Folder set to ${formatNativeFolderDisplayPath(nativeFolderPath)}.`,
      });
      refreshBackupLocationUi();
    } finally {
      setSavingBackupLocation(false);
    }
  };

  const handleClearNativeFolder = async () => {
    const prev = readBackupSaveLocationPrefs();
    saveBackupSaveLocationPrefs({
      ...prev,
      nativeFolderPath: null,
    });
    setNativeFolderPath(null);
    toast({ title: "Selected folder cleared", description: "Backup will use default directory mode." });
  };

  const handlePickLiveDataWebFolder = async () => {
    if (!supportsWebFolderPicker) return;
    try {
      const picker = (window as unknown as { showDirectoryPicker?: (opts?: { mode: string }) => Promise<FileSystemDirectoryHandle> })
        .showDirectoryPicker;
      if (!picker) return;
      const handle = await picker.call(window, { mode: "readwrite" });
      const ok = await storeWebLiveDataDirectoryHandle(handle);
      if (!ok) {
        toast({ variant: "destructive", title: "Failed", description: "Could not store folder handle on this device." });
        return;
      }
      const nextLabel = String((handle as { name?: string })?.name || "Selected folder");
      setLiveWebLabel(nextLabel);
      toast({
        title: "Folder selected",
        description: "Tap “Save data location” to start writing local company copies here.",
      });
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === "AbortError") return;
      toast({ variant: "destructive", title: "Failed", description: "Could not select folder." });
    }
  };

  const handleSaveLiveDataLocation = async () => {
    if (!nativeRuntime) {
      if (!liveWebLabel?.trim()) {
        toast({ variant: "destructive", title: "Pick a folder first", description: "Use Select folder, then save." });
        return;
      }
    } else if (!liveNativeFolderPath?.trim()) {
      toast({ variant: "destructive", title: "Pick a folder first", description: "Browse to a folder on this device." });
      return;
    }
    setSavingLiveDataLocation(true);
    try {
      const salt = ensureLiveDataMirrorSalt();
      await ensureLiveMirrorAutoPassphrase();
      saveLiveDataFolderPrefs({
        webEnabled: !nativeRuntime,
        webFolderLabel: nativeRuntime ? null : liveWebLabel,
        nativeFolderPath: nativeRuntime ? (liveNativeFolderPath?.trim() ?? null) : null,
        mirrorSaltBase64: salt,
      });
      setLiveWebEnabled(!nativeRuntime);
      if (!nativeRuntime) {
        const root = (await readWebLiveDataDirectoryHandle()) as FileSystemDirectoryHandle | null;
        if (root) await getOrCreatePocketLedgerDir(root);
      }
      await syncAllLocalCompanyMirrorsToFolder({ userInitiated: true });
      toast({
        title: "Data location saved",
        description: `Encrypted copies are written under ${POCKET_LEDGER_MIRROR_DIR}/${COMPANIES_DIR_SEGMENT}/… (auto key on this device).`,
      });
      setLiveDataLocationDialogOpen(false);
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Save failed", description: e instanceof Error ? e.message : "Try again." });
    } finally {
      setSavingLiveDataLocation(false);
    }
  };

  const handleClearLiveDataLocation = async () => {
    await clearWebLiveDataDirectoryHandle();
    await clearLiveDataFolderPrefsAndSession();
    saveLiveDataFolderPrefs({
      webEnabled: false,
      webFolderLabel: null,
      nativeFolderPath: null,
      mirrorSaltBase64: null,
    });
    setLiveWebEnabled(false);
    setLiveWebLabel(null);
    setLiveNativeFolderPath(null);
    toast({ title: "Data save location cleared", description: "Mirrors will no longer be written to a custom folder." });
  };

  const handlePickLiveDataNativeFolder = async () => {
    try {
      const { FilePicker } = await import("@capawesome/capacitor-file-picker");
      const result = await FilePicker.pickDirectory();
      const pickedPath = String((result as { path?: string })?.path || "").trim();
      if (!pickedPath) {
        toast({ variant: "destructive", title: "No folder selected" });
        return;
      }
      setLiveNativeFolderPath(pickedPath);
      toast({ title: "Folder selected", description: "Save data location to enable mirror writes." });
    } catch (e: unknown) {
      if (String((e as Error)?.message || "").toLowerCase().includes("canceled")) return;
      toast({ variant: "destructive", title: "Browse failed" });
    }
  };

  const handleSyncLiveDataNow = async () => {
    try {
      await syncAllLocalCompanyMirrorsToFolder({ userInitiated: true });
      toast({ title: "Synced", description: "Encrypted mirrors under pocket-ledger/ refreshed (if configured)." });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Sync failed", description: e instanceof Error ? e.message : "" });
    }
  };

  const handleBackupClick = () => {
    setBackupSourceMode(
      staticBackupClient || (typeof navigator !== "undefined" && !navigator.onLine)
        ? "local_only"
        : "online_merge"
    );
    if (company?.password) {
      setBackupPasswordHintOpen(false);
      setBackupIncludeAttachments(false);
      setIsEncryptedBackupConfirmOpen(true);
    } else {
      // Mobile par inline alert layout bigadta tha — Dialog/AlertDialog se band kare tab tak dikhe.
      setBackupPasswordHintOpen(true);
    }
  };

  const handlePredownloadForBackup = async () => {
    if (!companyId || !company) return;
    if (predownloadRunning) return;
    try {
      assertCan(can, "export_data");
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        toast({ variant: "destructive", title: "Permission Denied", description: error.message });
      }
      return;
    }
    predownloadAbortRef.current?.abort();
    const ac = new AbortController();
    predownloadAbortRef.current = ac;
    setPredownloadRunning(true);
    setPredownloadProgress({ phase: "Starting", detail: "Preparing…" });
    try {
      const result = await runStaticCompanyBackupPredownload({
        company,
        companyId,
        signal: ac.signal,
        onProgress: setPredownloadProgress,
      });
      if (result.ok) {
        toast({
          title: "Pre-download complete",
          description: "Local SQLite and attachments are ready. You can create a backup with attachments.",
        });
        window.setTimeout(() => setPredownloadProgress(null), 4000);
      } else if (result.ok === false && !result.cancelled) {
        toast({ variant: "destructive", title: "Pre-download failed", description: result.error });
        window.setTimeout(() => setPredownloadProgress(null), 8000);
      } else {
        setPredownloadProgress(null);
      }
    } finally {
      setPredownloadRunning(false);
      predownloadAbortRef.current = null;
    }
  };

  const cancelPredownload = () => {
    if (!predownloadAbortRef.current) return;
    predownloadAbortRef.current.abort();
  };

  const handleBackup = async (includeAttachments: boolean) => {
    if (!companyId || !company || !company.password || !user?.uid) return;

    if (isCompanyBackupRunning()) {
      toast({
        variant: "destructive",
        title: "Backup already running",
        description: "Wait for the current backup to finish. Do not refresh the page.",
      });
      return;
    }

    try {
      assertCan(can, "export_data");
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        toast({ variant: "destructive", title: "Permission Denied", description: error.message });
      } else {
        toast({ variant: "destructive", title: "Error", description: "Failed to check permissions." });
      }
      setIsEncryptedBackupConfirmOpen(false);
      return;
    }

    setIsEncryptedBackupConfirmOpen(false);

    // Attachments: static app, local-only recovery, ya online plan par embed (offline `.plbp`).
    const allowsAttachmentEmbed =
      staticBackupClient || backupSourceMode === "local_only" || attachmentFeatureOn;
    const withAttachments = includeAttachments && allowsAttachmentEmbed;

    let backupCompany = company;
    if (backupSourceMode === "local_only") {
      const localRow = await getLocalCompanyById(companyId, { includeDeleted: true });
      if (localRow) {
        backupCompany = { ...company, ...(localRow as Record<string, unknown>), id: companyId } as typeof company;
      }
    }

    const result = await startCompanyBackupRun({
      company: backupCompany,
      companyId,
      ownerUid: user.uid,
      accountPlanId,
      includeAttachments: withAttachments,
      backupSourceMode,
    });

    if (result.ok === true) {
      const embedded = result.attachmentEmbeddedCount ?? 0;
      const refs = result.attachmentRefCount ?? 0;
      if (result.includeAttachments) {
        const missing = Math.max(0, refs - embedded);
        toast({
          title: missing > 0 ? "Backup saved — some files missing" : "Success",
          variant: missing > 0 ? "destructive" : "default",
          description:
            missing > 0
              ? `${embedded} of ${refs} files embedded in backup. ${missing} file(s) had no bytes on this device — open those vouchers here first, then backup again with “With attachments”.`
              : `Backup saved: ${result.where} (${embedded} file${embedded === 1 ? "" : "s"} embedded)`,
        });
      } else if (refs > 0 && backupSourceMode === "local_only") {
        toast({
          variant: "destructive",
          title: "Backup saved — attachments not included",
          description: `${refs} file link${refs === 1 ? "" : "s"} in data but only ${embedded} embedded. Enable “With attachments” on this device while files still open.`,
        });
      } else if (refs > 0) {
        // Checkbox tha lekin koi blob resolve nahi hua — size data-only jaisa hi rahega.
        toast({
          variant: "destructive",
          title: "Backup saved without files",
          description: `${refs} attachment link${refs === 1 ? "" : "s"} found but no files could be read. Check internet and retry “With attachments”.`,
        });
      } else {
        toast({
          title: "Success",
          description: `Backup saved: ${result.where}`,
        });
      }
      dismissCompanyBackupRunLater(8000);
    } else if (!result.cancelled) {
      toast({
        variant: "destructive",
        title: "Backup Failed",
        description: result.error,
      });
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
        setFileToRestore(file);
        setDecryptionPassword('');
      setShowDecryptionPassword(false);
        setDecryptionError(null);
        setBackupDataToRestore(null); // Clear previous data
        setIsOverwriteConfirmOpen(false);
        setConfirmationText('');
        setIsDecrypting(false);
    }
    else toast({ variant: "destructive", title: "Please select a valid file." });
  };

  const handlePickRestoreFileNative = async () => {
    try {
      const { FilePicker } = await import("@capawesome/capacitor-file-picker");
      // Android WebView me HTML file input unreliable ho sakta hai; native picker se file read-data lo.
      const picked = await FilePicker.pickFiles({
        limit: 1,
        readData: true,
        types: [
          "application/json",
          "application/octet-stream",
          ".json",
          ".plbp",
          ".webtally",
        ],
      } as Record<string, unknown>);
      // Plugin result already typed (`PickFilesResult`) — unsafe record cast avoid to keep TS strict mode happy.
      const first = picked.files?.[0];
      if (!first) return;

      const fileName = String(first.name || "backup.plbp");
      const mimeType = String(first.mimeType || "application/octet-stream");
      const data = first.data;
      if (typeof data !== "string" || !data.trim()) {
        toast({
          variant: "destructive",
          title: "Read failed",
          description: "Could not read selected backup file. Please pick again.",
        });
        return;
      }

      const restoredFile = fileFromBase64Payload(data, fileName, mimeType);
      setFileToRestore(restoredFile);
      setDecryptionPassword("");
      setShowDecryptionPassword(false);
      setDecryptionError(null);
      setBackupDataToRestore(null);
      setIsOverwriteConfirmOpen(false);
      setConfirmationText("");
      setIsDecrypting(false);
      toast({ title: "File selected", description: fileName });
    } catch (e: any) {
      if (String(e?.message || "").toLowerCase().includes("canceled")) return;
      toast({
        variant: "destructive",
        title: "File select failed",
        description: "Could not open backup file picker on this device.",
      });
    }
  };

  const processRestoreData = async () => {
    if (!fileToRestore) throw new Error("No file selected for restore.");

    let fileContent = await fileToRestore.text();
    
    // Potentially an encrypted file
    const isPotentiallyEncrypted =
      fileToRestore.name.endsWith('.plbp') ||
      fileToRestore.name.endsWith('.webtally') ||
      !fileContent.trim().startsWith('{');

    if (isPotentiallyEncrypted) {
       setIsDecrypting(true);
       return null; // Prompt for password
    }
    
    try {
        const backupData = JSON.parse(fileContent);
        
        // Security check for surrendered companies from unencrypted backup
        if (backupData?.companyDetails?.[0]?.handoverStatus === 'accepted') {
            const receiver = backupData.companyDetails[0].handoverTo;
            throw new Error(`This company was surrendered to ${receiver}. You can no longer restore it.`);
        }
        
        return backupData;
    } catch (e) {
       setDecryptionError("This file seems to be encrypted or is corrupted. Please provide a password if it's encrypted.");
       setIsDecrypting(true);
       return null;
    }
  };

  const startRestore = async () => {
      if (!company) {
          toast({ variant: 'destructive', title: 'No Company Selected', description: "Please select or create a company to restore data into."});
          return;
      }
      
      try {
        // Permission check: import
        assertCan(can, "import_data");
      } catch (error) {
        if (error instanceof PermissionDeniedError) {
          toast({
            variant: "destructive",
            title: "Permission Denied",
            description: error.message,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to check permissions.",
          });
        }
        return;
      }
      
      try {
        const data = await processRestoreData();
        if (data) { 
           if (!company.isOwned) {
                toast({variant: 'destructive', title: "Permission Denied", description: "Only the company owner can overwrite data."});
                return;
            }
            setBackupDataToRestore(data);
            setIsOverwriteConfirmOpen(true);
        }
      } catch (error: any) {
        if (error instanceof PermissionDeniedError) {
          toast({ variant: "destructive", title: "Permission Denied", description: error.message });
        } else {
          toast({ variant: "destructive", title: "Restore Failed", description: error.message });
        }
      }
  }
  
  const handleDecryptionAndRestore = async () => {
      if (!fileToRestore || !company) return;
      setIsRestoring(true);
      setDecryptionError(null);
      
      try {
          const encryptedContent = await fileToRestore.text();
          const plainBytes = await decryptBytes(encryptedContent, decryptionPassword);
          let backupData: Record<string, unknown>;
          if (isPlbpZipPayload(plainBytes)) {
            const { manifest, filesByPath } = unpackPlbpZipBackup(plainBytes);
            restoreZipFilesRef.current = filesByPath;
            setRestoreZipFilesByPath(filesByPath);
            backupData = manifest;
          } else {
            restoreZipFilesRef.current = null;
            setRestoreZipFilesByPath(null);
            backupData = JSON.parse(new TextDecoder().decode(plainBytes)) as Record<string, unknown>;
          }
          
          if (backupData?.companyDetails?.[0]?.handoverStatus === 'accepted') {
              const receiver = backupData.companyDetails[0].handoverTo;
              toast({ 
                  variant: "destructive", 
                  title: "Restore Blocked", 
                  description: `This company was surrendered to ${receiver}. You can no longer restore it.` 
              });
              setFileToRestore(null);
              setIsDecrypting(false);
              return;
          }
          
          toast({ title: "Decryption Successful" });
          setIsDecrypting(false); 

          if (!company.isOwned) {
            toast({variant: 'destructive', title: "Permission Denied", description: "Only the company owner can overwrite data."});
            return;
          }
          setBackupDataToRestore(backupData);
          setIsOverwriteConfirmOpen(true);
          
          setFileToRestore(null);
          setDecryptionPassword('');

      } catch (error: any) {
           if (error instanceof Error && error.message === "INVALID_PASSWORD") {
            setDecryptionError("Incorrect password. Please try again.");
          } else {
            setDecryptionError("Decryption failed. The file may be corrupted or not a valid backup.");
          }
      } finally {
        setIsRestoring(false);
      }
  }

  /** Static/local-first: backup → SQLite `company_docs` + `companies` row (Firebase account password nahi) */
  const handleLocalOverwriteRestore = async (
    backupData: any,
    resolvedCompanyName: string,
    restoreAttachments: boolean,
    restoreTargetMode: RestoreTargetMode,
    options?: { cloudRestore?: boolean }
  ) => {
    if (!companyId || !user?.uid || !backupData) return;

    const backupCompanyDetails = backupData?.companyDetails?.[0];
    if (!backupCompanyDetails) {
      toast({ variant: "destructive", title: "Invalid Backup", description: "Backup file is missing company details." });
      return;
    }

    const backupCompanyId = backupCompanyDetails.id;
    const backupOwnerId = backupCompanyDetails.ownerId;
    const backupOwnerEmail = backupCompanyDetails.ownerEmail;

    const currentEmail = (user.email || "").toLowerCase().trim();
    const backupEmail = (backupOwnerEmail || "").toLowerCase().trim();
    const isBackupOwner =
      (!!user.uid && !!backupOwnerId && user.uid === backupOwnerId) ||
      (!!currentEmail && !!backupEmail && currentEmail === backupEmail);

    if (!isBackupOwner) {
      toast({
        variant: "destructive",
        title: "Restore Blocked",
        description: backupOwnerEmail
          ? `This backup belongs to ${backupOwnerEmail}. Illegal restore attempt recorded.`
          : "This backup belongs to another owner. Illegal restore attempt recorded.",
        duration: 8000,
      });
      try {
        const notified = await sendSecurityAlertClient({
          backupOwnerId,
          backupOwnerEmail,
          backupSharedWith: backupCompanyDetails?.sharedWith || [],
          attemptedByUid: user.uid,
          attemptedByEmail: user.email ?? "",
          attemptedByName: (customUser?.displayName || user?.displayName) ?? undefined,
          companyName: backupCompanyDetails.name,
          companyId: backupCompanyId,
        });
        if (!notified) {
          toast({
            variant: "destructive",
            title: "Owner Notification Failed",
            description: "Attempt was blocked, but we could not resolve the original company admin to notify.",
            duration: 7000,
          });
        }
      } catch (e) {
        console.error("Failed to send restore security alert:", e);
      }
      setIsOverwriteConfirmOpen(false);
      setFileToRestore(null);
      return;
    }

    try {
      if (user?.uid) {
        const userDocRef = doc(firestore, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const surrenderedCompanies = userData.surrenderedCompanies || {};
          const surrenderedInfo = surrenderedCompanies[backupCompanyId];
          if (surrenderedInfo) {
            const formattedDate = new Date(surrenderedInfo.date.seconds * 1000).toLocaleDateString();
            toast({
              variant: "destructive",
              title: "Restore Blocked",
              description: `You surrendered this company to "${surrenderedInfo.surrenderedTo}" on ${formattedDate}. You cannot restore it.`,
              duration: 10000,
            });
            setIsOverwriteConfirmOpen(false);
            setFileToRestore(null);
            return;
          }
        }
      }
    } catch {
      /* offline / no Firestore — local restore allow */
    }

    const replaceCurrent = restoreTargetMode === "replace_current";
    const cloudRestore = options?.cloudRestore === true;

    setIsRestoring(true);
    setIsOverwriteConfirmOpen(false);

    try {
      const { signal, report } = beginRestoreProgress(backupData, restoreAttachments);

      const targetCompanyId = replaceCurrent
        ? String(companyId || "").trim()
        : generateCompanyId(
            resolvedCompanyName.trim() || String(backupCompanyDetails.name ?? "company")
          );
      if (!targetCompanyId) {
        toast({ variant: "destructive", title: "Restore Failed", description: "No company selected to restore into." });
        return;
      }

      const existingBeforeReplace = replaceCurrent
        ? await getLocalCompanyById(targetCompanyId, { includeDeleted: true })
        : null;

      if (replaceCurrent) {
        report.tick("Preparing", "Clearing current company data on this device…");
        await deleteAllCompanyDocsForCompany(targetCompanyId);
      }

      await getBrowserDb();

      let dataToWrite = backupData;
      let attachmentRefMap: Map<string, string> | undefined;
      const zipFilesForRestore = resolveRestoreZipFiles(restoreZipFilesByPath, restoreZipFilesRef.current);
      if (restoreAttachments && backupDataHasAttachmentBundle(backupData)) {
        if (!staticBackupClient) {
          const gate = await checkAttachmentRestoreAllowed(user.uid, accountPlanId);
          if (!gate.allowed) {
            toast({ variant: "destructive", title: "Attachment restore blocked", description: gate.message });
            setIsRestoring(false);
            setRestoreProgress(null);
            return;
          }
        }
        const zipMan = backupData.attachmentZipManifest as { entries?: unknown[] } | undefined;
        if (Array.isArray(zipMan?.entries) && zipMan.entries.length > 0 && !zipFilesForRestore?.size) {
          toast({
            variant: "destructive",
            title: "Attachment zip missing",
            description:
              "Backup manifest has files but zip bytes were lost. Decrypt the backup again, then restore immediately.",
            duration: 12_000,
          });
        }
        attachmentRefMap = await restoreAttachmentsFromBackupData(
          backupData,
          zipFilesForRestore,
          targetCompanyId,
          (done, total, bytes) =>
            report.tick("Restoring attachments", `${done}/${total} file(s) to device storage…`, 1, bytes),
          signal
        );
        await flushPendingBrowserDbSave();
        const expectedFiles = getAttachmentRestoreEntryCount(backupData);
        const restoredFiles = attachmentRefMap?.size
          ? new Set(attachmentRefMap.values()).size
          : 0;
        if (expectedFiles > 0 && restoredFiles === 0) {
          toast({
            variant: "destructive",
            title: "No attachment files restored",
            description:
              "Ledger data will restore, but files could not be written to this device. Check storage space and try again with “With attachments”.",
            duration: 12_000,
          });
        } else if (expectedFiles > 0 && restoredFiles < expectedFiles) {
          toast({
            title: "Some attachments skipped",
            description: `${restoredFiles} of ${expectedFiles} file(s) restored to this device.`,
            duration: 10_000,
          });
        }
      }

      if (!cloudRestore) {
        const remoteBefore = countRemoteAttachmentRefsInBackupData(backupData);
        dataToWrite = prepareBackupDataForLocalCompanyRestore(backupData, attachmentRefMap);
        const remoteAfter = countRemoteAttachmentRefsInBackupData(dataToWrite);
        if (restoreAttachments && remoteAfter > 0) {
          toast({
            variant: "destructive",
            title: "Some attachment links removed",
            description: `${remoteAfter} file link(s) could not be restored as local files — removed so this company stays offline-only.`,
            duration: 10_000,
          });
        } else if (!restoreAttachments && remoteBefore > 0) {
          toast({
            title: "Data-only local restore",
            description: `${remoteBefore} online file link(s) were removed — local company does not use Firebase URLs. Re-backup with “With attachments” to keep files on device.`,
            duration: 12_000,
          });
        }
      } else if (attachmentRefMap) {
        dataToWrite = applyAttachmentRefMapToBackupData(backupData, attachmentRefMap);
      }

      const safeTimestamp = (val: any): Timestamp | null => {
        // Restore dates can come from Firestore JSON, local SQLite JSON, or old ISO backups; normalize all before writing.
        const date = parseFirestoreDateFieldToJsDate(val);
        return date ? Timestamp.fromDate(date) : null;
      };

      const backupCompanyIdFromFile = String(backupData.companyDetails?.[0]?.id ?? "").trim();

      for (const colName of collectionsToBackup) {
        report.throwIfAborted();
        const docsToRestore = dataToWrite[colName] || [];
        for (const docData of docsToRestore) {
          report.throwIfAborted();
          const { id: originalId, ...data } = docData;
          const rewritten = rewriteBackupCompanyIdsDeep(backupCompanyIdFromFile, targetCompanyId, data) as Record<string, unknown>;
          const rw = rewritten as { isDeleted?: boolean; date?: unknown; dueDate?: unknown; due_date?: unknown; openingBalanceDate?: unknown; createdAt?: unknown; amount?: unknown; total?: number };
          const finalData: Record<string, unknown> = {
            ...rewritten,
            companyId: targetCompanyId,
            isDeleted: rw.isDeleted ?? false,
            date: safeTimestamp(rw.date),
            openingBalanceDate: safeTimestamp(rw.openingBalanceDate),
            createdAt: safeTimestamp(rw.createdAt) || Timestamp.now(),
            amount: rw.amount === "" || rw.amount === null || rw.amount === undefined ? rw.total || 0 : Number(rw.amount),
          };
          // Sale/Purchase overdue depends on dueDate; keep restored voucher backups selectable and visible in overdue list.
          if (colName === "vouchers") finalData.dueDate = safeTimestamp(rw.dueDate ?? rw.due_date);
          await upsertCompanyDocInBrowserDb(targetCompanyId, colName, originalId, finalData as Record<string, unknown>, {
            notify: false,
            force: true,
          });
          report.tick("Writing records", colName.replace(/_/g, " "));
        }
        notifyBrowserDbCollectionUpdated(targetCompanyId, colName);
      }

      const existing = await getLocalCompanyById(targetCompanyId, { includeDeleted: true });
      const restoredCompanyDetails = (dataToWrite.companyDetails || backupData.companyDetails) as Array<Record<string, unknown>>;
      const { id: _bid, ownerId: _boid, ownerEmail: _boe, ...restDetails } = restoredCompanyDetails[0];
      const rest = restDetails as Record<string, unknown>;
      const fyStart = fiscalFieldToLocalIso(rest.fiscalYearStart);
      const fyEnd = fiscalFieldToLocalIso(rest.fiscalYearEnd);
      const { fiscalYearStart: _rfs, fiscalYearEnd: _rfe, ...restNoFiscal } = rest;
      const {
        authoritativeCompanyId: _dropAuthFromBackup,
        storageOption: _dropSoFromBackup,
        syncedFromCloud: _dropSfcFromBackup,
        syncPolicy: _dropSpFromBackup,
        ...restNoFiscalLocalSafe
      } = restNoFiscal as Record<string, unknown>;

      const localCompanyRow = finalizeLocalCompanyRowAfterBackupRestore(
        {
          ...(existing || existingBeforeReplace || {}),
          ...restNoFiscalLocalSafe,
          fiscalYearStart: fyStart ?? fiscalFieldToLocalIso((existing as { fiscalYearStart?: unknown })?.fiscalYearStart),
          fiscalYearEnd: fyEnd ?? fiscalFieldToLocalIso((existing as { fiscalYearEnd?: unknown })?.fiscalYearEnd),
          localCompanyUsers:
            (rest as { localCompanyUsers?: unknown }).localCompanyUsers ??
            (existing as { localCompanyUsers?: unknown })?.localCompanyUsers,
          updatedAt: Date.now(),
          name:
            resolvedCompanyName.trim() ||
            String((restNoFiscalLocalSafe as { name?: string }).name ?? (existing as { name?: string })?.name ?? ""),
        },
        {
          companyId: targetCompanyId,
          ownerUid: user.uid,
          ownerEmail: user.email ?? null,
          companyName:
            resolvedCompanyName.trim() ||
            String((restNoFiscalLocalSafe as { name?: string }).name ?? ""),
        }
      );
      if (cloudRestore) {
        localCompanyRow.authoritativeCompanyId = targetCompanyId;
        localCompanyRow.syncPolicy = "online";
        localCompanyRow.storageOption = String(
          (restNoFiscalLocalSafe as { storageOption?: string }).storageOption || "firebase"
        );
        localCompanyRow.syncedFromCloud = true;
        delete localCompanyRow.localRestoredFromBackupAt;
      }

      report.tick("Finalizing", "Saving company row…");
      await upsertLocalCompany(localCompanyRow as Parameters<typeof upsertLocalCompany>[0]);
      report.tick("Finalizing", "Flushing local database…");
      await flushBrowserDbToIndexedDB();
      reloadLocalCompanyRegistry();
      triggerSync();

      let deferCloudSkipReload = false;

      if (cloudRestore) {
        const cloudJob = {
          companyId: targetCompanyId,
          ownerUid: user.uid,
          ownerEmail: user.email ?? "",
          companyName:
            resolvedCompanyName.trim() ||
            String((restNoFiscalLocalSafe as { name?: string }).name ?? company?.name ?? ""),
          replaceCurrent,
        };
        persistPendingRestoreCloudPush({
          ...cloudJob,
          phase: "data",
          dataUploaded: false,
          createdAtMs: Date.now(),
        });

        report.tick("Uploading to cloud", "Sending company data to server…");
        const cloudData = await uploadRestoreDataToCloudImmediately(cloudJob);
        if (!cloudData.ok) {
          console.warn("[BackupRestore] immediate cloud data upload:", cloudData.message);
          queuePendingRestoreCloudPushFilesOnly(cloudJob);
          deferCloudSkipReload = true;
          toast({
            variant: "destructive",
            title: "Cloud data upload issue",
            description:
              cloudData.message ||
              "Local restore OK — files safe on device. Retry upload when online (no restart).",
            duration: 12_000,
          });
        } else {
          await beginRestoreCloudFilesUpload(cloudJob);
          deferCloudSkipReload = true;
          toast({
            title: "Restore complete — uploading files",
            description:
              "Company data is restored. Browse the app now; uploaded files appear as the header bar progresses. New tabs resume from the same %.",
            duration: 12_000,
          });
        }
      }
      // Local device (SQLite) restore: no Firestore upload — data stays on this device only.

      if (restoreAttachments && backupDataHasAttachmentBundle(backupData) && !staticBackupClient) {
        await incrementAttachmentRestoreUsage(user.uid);
      }

      setCompanyId(targetCompanyId);
      if (!cloudRestore) {
        grantOpenLocalCompanySession(targetCompanyId, { role: "owner" });
        markLocalBackupRestoreSelectionGrace(targetCompanyId);
      }

      if (cloudRestore && deferCloudSkipReload) {
        toast({
          title: "Restore complete on this device",
          description:
            "Company is ready to use. Cloud upload continues in the background — header bar shows progress (same % in new tabs).",
          duration: 10_000,
        });
        return;
      }

      report.tick("Complete", "Reloading app…");
      toast({
        title: "Restore Successful",
        description: cloudRestore
          ? replaceCurrent
            ? `Company "${resolvedCompanyName.trim() || company?.name}" restored. Cloud upload complete — reloading once.`
            : `New company restored (${targetCompanyId}). Cloud upload complete — reloading once.`
          : replaceCurrent
            ? `Company "${resolvedCompanyName.trim() || company?.name}" data replaced on this device only. Reloading…`
            : `New local company created (${targetCompanyId}). Your other companies are unchanged. Reloading…`,
      });
      window.location.reload();
    } catch (error: any) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast({ title: "Restore cancelled", description: "You can start again when ready." });
      } else {
        console.error("Local restore failed:", error);
        toast({
          variant: "destructive",
          title: "Restore Failed",
          description: error.message || "An error occurred during local restore.",
        });
      }
    } finally {
      setIsRestoring(false);
      restoreAbortRef.current = null;
      restoreZipFilesRef.current = null;
      setRestoreZipFilesByPath(null);
      setRestoreProgress(null);
      setFileToRestore(null);
    }
  };

  const handleOverwriteRestore = async (
    backupData: any,
    resolvedCompanyName: string,
    restoreAttachments: boolean,
    restoreTargetMode: RestoreTargetMode
  ) => {
    if (!companyId || !user?.uid || !backupData) return;

    const backupCompanyDetails = backupData?.companyDetails?.[0];
    if (!backupCompanyDetails) {
        toast({ variant: "destructive", title: "Invalid Backup", description: "Backup file is missing company details." });
        return;
    }

    const backupCompanyId = backupCompanyDetails.id;
    const backupOwnerId = backupCompanyDetails.ownerId;
    const backupOwnerEmail = backupCompanyDetails.ownerEmail;

    const currentEmail = (user.email || "").toLowerCase().trim();
    const backupEmail = (backupOwnerEmail || "").toLowerCase().trim();
    const isBackupOwner =
      (!!user.uid && !!backupOwnerId && user.uid === backupOwnerId) ||
      (!!currentEmail && !!backupEmail && currentEmail === backupEmail);

    if (!isBackupOwner) {
        toast({
            variant: "destructive",
            title: "Restore Blocked",
            description: backupOwnerEmail
              ? `This backup belongs to ${backupOwnerEmail}. Illegal restore attempt recorded.`
              : "This backup belongs to another owner. Illegal restore attempt recorded.",
            duration: 8000,
        });

        try {
          const notified = await sendSecurityAlertClient({
            backupOwnerId,
            backupOwnerEmail,
            backupSharedWith: backupCompanyDetails?.sharedWith || [],
            attemptedByUid: user.uid,
            attemptedByEmail: user.email ?? "",
            attemptedByName: (customUser?.displayName || user?.displayName) ?? undefined,
            companyName: backupCompanyDetails.name,
            companyId: backupCompanyId,
          });
          if (!notified) {
            toast({
              variant: "destructive",
              title: "Owner Notification Failed",
              description: "Attempt was blocked, but we could not resolve the original company admin to notify.",
              duration: 7000,
            });
          }
        } catch (e) {
          console.error("Failed to send restore security alert:", e);
          toast({
            variant: "destructive",
            title: "Owner Notification Failed",
            description: "Attempt was blocked, but sending warning notification failed.",
            duration: 7000,
          });
        }

        setIsOverwriteConfirmOpen(false);
        setFileToRestore(null);
        return;
    }
    
    const userDocRef = doc(firestore, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const surrenderedCompanies = userData.surrenderedCompanies || {};
        const surrenderedInfo = surrenderedCompanies[backupCompanyId];

        if (surrenderedInfo) {
            const formattedDate = new Date(surrenderedInfo.date.seconds * 1000).toLocaleDateString();
            toast({
                variant: "destructive",
                title: "Restore Blocked",
                description: `You surrendered this company to "${surrenderedInfo.surrenderedTo}" on ${formattedDate}. You cannot restore it.`,
                duration: 10000,
            });
            setIsOverwriteConfirmOpen(false);
            setFileToRestore(null);
            return;
        }
    }

    const replaceCurrent = restoreTargetMode === "replace_current";

    setIsRestoring(true);
    setIsOverwriteConfirmOpen(false);

    try {
        const { signal, report } = beginRestoreProgress(backupData, restoreAttachments);
        const targetCompanyId = replaceCurrent
          ? String(companyId || "").trim()
          : generateCompanyId(
              resolvedCompanyName.trim() || String(backupCompanyDetails.name ?? "company")
            );
        if (!targetCompanyId) {
          toast({ variant: "destructive", title: "Restore Failed", description: "No company selected to restore into." });
          return;
        }

        if (replaceCurrent) {
          report.tick("Preparing", "Clearing current company data in cloud…");
          await clearFirestoreCompanySubcollectionsForRestore(targetCompanyId);
          try {
            report.tick("Preparing", "Clearing local mirror on this device…");
            await deleteAllCompanyDocsForCompany(targetCompanyId);
          } catch (e) {
            console.warn("[BackupRestore] local clear before cloud replace skipped:", e);
          }
        }

        const backupCompanyIdFromFile = String(backupData.companyDetails?.[0]?.id ?? "").trim();

        let dataToWrite = backupData;
        const zipFilesForRestore = resolveRestoreZipFiles(restoreZipFilesByPath, restoreZipFilesRef.current);
        if (restoreAttachments && backupDataHasAttachmentBundle(backupData)) {
          if (!staticBackupClient) {
            const gate = await checkAttachmentRestoreAllowed(user.uid, accountPlanId);
            if (!gate.allowed) {
              toast({ variant: "destructive", title: "Attachment restore blocked", description: gate.message });
              setIsRestoring(false);
              setRestoreProgress(null);
              return;
            }
          }
          const map = await restoreAttachmentsFromBackupData(
            backupData,
            zipFilesForRestore,
            targetCompanyId,
            (_done, _total, bytes) => report.tick("Restoring attachments", "", 1, bytes),
            signal
          );
          await flushPendingBrowserDbSave();
          dataToWrite = applyAttachmentRefMapToBackupData(backupData, map);
        }

        let batch = writeBatch(firestore);
        const safeTimestamp = (val: any): Timestamp | null => {
            const date = parseFirestoreDateFieldToJsDate(val);
            return date ? Timestamp.fromDate(date) : null;
        };
        
        let count = 0;
        const shouldUploadAttachmentsToCloud =
          restoreAttachments && backupDataHasAttachmentBundle(backupData);
        for (const colName of collectionsToBackup) {
            report.throwIfAborted();
            const docsToRestore = dataToWrite[colName] || [];
            for (const docData of docsToRestore) {
                report.throwIfAborted();
                const { id: originalId, ...data } = docData;
                let rewritten = rewriteBackupCompanyIdsDeep(
                  backupCompanyIdFromFile,
                  targetCompanyId,
                  data
                ) as Record<string, unknown>;
                if (shouldUploadAttachmentsToCloud) {
                  report.tick("Uploading attachments", `${colName.replace(/_/g, " ")}…`);
                  try {
                    rewritten = await hydrateRestoredFieldsForCloudUpload(
                      targetCompanyId,
                      colName,
                      rewritten
                    );
                  } catch (e) {
                    console.warn("[BackupRestore] cloud attachment upload skipped for doc", originalId, e);
                  }
                }
                const rw = rewritten as {
                  isDeleted?: boolean;
                  date?: unknown;
                  dueDate?: unknown;
                  due_date?: unknown;
                  openingBalanceDate?: unknown;
                  createdAt?: unknown;
                  amount?: unknown;
                  total?: number;
                };
                const finalData: Record<string, unknown> = {
                    ...rewritten,
                    companyId: targetCompanyId,
                    isDeleted: rw.isDeleted ?? false,
                    date: safeTimestamp(rw.date),
                    openingBalanceDate: safeTimestamp(rw.openingBalanceDate),
                    createdAt: safeTimestamp(rw.createdAt) || serverTimestamp(),
                    amount:
                      rw.amount === "" || rw.amount === null || rw.amount === undefined
                        ? rw.total || 0
                        : Number(rw.amount),
                };
                if (colName === "vouchers") finalData.dueDate = safeTimestamp(rw.dueDate ?? rw.due_date);

                const docRef = doc(firestore, `companies/${targetCompanyId}/${colName}`, originalId);
                batch.set(docRef, finalData);
                
                count++;
                report.tick("Writing records", colName.replace(/_/g, " "));
                if (count >= 450) { 
                    report.tick("Writing records", "Uploading batch to cloud…", 0, 0);
                    await batch.commit();
                    batch = writeBatch(firestore);
                    count = 0;
                }
            }
        }

        if (dataToWrite.companyDetails?.[0]) {
            const {
              id: _bid,
              ownerId: _oid,
              ownerEmail: _oem,
              authoritativeCompanyId: _oldAuth,
              ...details
            } = dataToWrite.companyDetails[0];
            const finalName =
              resolvedCompanyName.trim() || String((details as { name?: string }).name ?? "");
            const detailsRewritten = rewriteBackupCompanyIdsDeep(
              backupCompanyIdFromFile,
              targetCompanyId,
              details
            ) as Record<string, unknown>;
            let companyRootFields = detailsRewritten;
            if (shouldUploadAttachmentsToCloud) {
              report.tick("Uploading attachments", "Company profile files…");
              try {
                companyRootFields = await hydratePendingLocalFileRefsDeep(targetCompanyId, detailsRewritten);
              } catch (e) {
                console.warn("[BackupRestore] company root attachment upload skipped", e);
              }
            }
            batch.set(doc(firestore, "companies", targetCompanyId), {
              ...companyRootFields,
              name: finalName,
              ownerId: user.uid,
              ownerEmail: user.email ?? "",
              authoritativeCompanyId: targetCompanyId,
            }, { merge: replaceCurrent });
        }

        report.tick("Finalizing", "Saving to Firestore…");
        await batch.commit();

        if (restoreAttachments && backupDataHasAttachmentBundle(backupData) && !staticBackupClient) {
          await incrementAttachmentRestoreUsage(user.uid);
        }

        report.tick("Finalizing", "Refreshing local registry…");
        reloadLocalCompanyRegistry();
        triggerSync();

        report.tick("Complete", "Reloading app…");
        setCompanyId(targetCompanyId);
        toast({
          title: "Restore Successful",
          description: replaceCurrent
            ? `Company "${resolvedCompanyName.trim() || company?.name}" data replaced in cloud. Page will now reload.`
            : `New cloud company ${targetCompanyId}. Page will now reload.`,
        });
        window.location.reload();
    } catch (error: any) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast({ title: "Restore cancelled", description: "You can start again when ready." });
      } else {
        console.error("Restore failed:", error);
        toast({
          variant: "destructive",
          title: "Restore Failed",
          description: error.message || "An error occurred during the overwrite process.",
        });
      }
    } finally {
      setIsRestoring(false);
      restoreAbortRef.current = null;
      restoreZipFilesRef.current = null;
      setRestoreZipFilesByPath(null);
      setRestoreProgress(null);
      setFileToRestore(null);
    }
  };


  return (
    <>
      <div className="flex min-w-0 flex-col gap-8">
        {/* PC: Backup + Auto ek row; mobile: Backup phir Auto (order 1–2), baaki cards neeche */}
        <div className="grid min-w-0 grid-cols-1 gap-8 md:grid-cols-2 md:gap-6 md:items-stretch">
        <Card className="flex h-full min-w-0 flex-col overflow-hidden">
          <CardHeader className="pb-3">
            {/* Title + Create Backup — chhoti screen par actions neeche wrap. */}
            <div className={backupCardHeaderLayoutCn}>
              <div className="flex min-w-0 items-center gap-1.5">
                <CardTitle className="text-base">Backup Data</CardTitle>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        aria-label="Backup data information"
                      >
                        <Info className="h-4 w-4" aria-hidden />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[20rem] text-xs leading-snug">
                      Download a complete backup of your company&apos;s data. You can choose to encrypt it for security.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className={backupCardHeaderActionsCn}>
                <PermissionButton
                  permission="export_data"
                  variant="outline"
                  size="sm"
                  onClick={handleBackupClick}
                  disabled={isBackingUp}
                  className={backupCardActionBtnCn}
                >
                  {isBackingUp ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Create Backup
                </PermissionButton>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openBackupLocationDialog}
                  className={backupCardActionBtnCn}
                >
                  Backup location
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-w-0 space-y-3 text-sm text-muted-foreground">
            <BackupLocationField
              locationLabel={backupLocationLabel}
              onChooseLocation={openBackupLocationDialog}
              showButton={false}
            />
            {staticBackupClient ? (
              <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                <p className="text-sm text-foreground font-medium">Pre-download (static app)</p>
                <p className="text-xs leading-relaxed">
                  Download full company data into local SQLite and cache attachment files on this device before backup with attachments.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={predownloadRunning || isBackingUp || !companyId}
                  onClick={() => void handlePredownloadForBackup()}
                  className={backupCardActionBtnCn}
                >
                  {predownloadRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Pre-download data &amp; attachments
                </Button>
              </div>
            ) : null}
            {isBackingUp ? null : backupRun.status === "interrupted" ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Previous backup was interrupted by refresh or close. Start again and keep this page open until complete.
              </p>
            ) : null}
          </CardContent>
          {(isBackingUp || predownloadRunning) && (backupProgress || predownloadProgress) ? (
          <CardFooter className="flex flex-col items-stretch gap-3 pt-0">
            <BackupProgressStrip
              progress={
                isBackingUp && backupProgress
                  ? backupProgress
                  : predownloadProgress
                    ? {
                        phase: predownloadProgress.phase,
                        detail: predownloadProgress.detail,
                        done: predownloadProgress.percent,
                        total: 100,
                      }
                    : backupProgress!
              }
              spinning={isBackingUp || predownloadRunning}
              inCard
              showRefreshWarning={isBackingUp || predownloadRunning}
              showCancel={isBackingUp || predownloadRunning}
              onCancel={() => {
                if (isBackingUp && cancelCompanyBackupRun()) {
                  toast({ title: "Backup cancelled", description: "You can start a new backup when ready." });
                } else if (predownloadRunning) {
                  cancelPredownload();
                  setPredownloadRunning(false);
                  setPredownloadProgress(null);
                  toast({ title: "Pre-download cancelled" });
                }
              }}
            />
          </CardFooter>
          ) : null}
        </Card>

        <Card className="flex h-full min-w-0 flex-col overflow-hidden">
          <CardHeader className="pb-3">
            {/* Auto backup — mobile par frequency + toggle neeche wrap. */}
            <div className={cn(backupCardHeaderLayoutCn, "gap-3")}>
              <div className="flex min-w-0 items-center gap-1.5">
                <CardTitle className="text-base">auto backup</CardTitle>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        aria-label="Auto backup information"
                      >
                        <Info className="h-4 w-4" aria-hidden />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[20rem] text-xs leading-snug">
                      Runs on this device for the currently selected company (owner, password set). Uses the same backup
                      location as Backup Data (either card se change — dono sync).
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className={backupCardHeaderActionsCn}>
              <select
                id="auto-backup-frequency"
                className={cn(backupCardPillCn, "min-w-0 flex-1 cursor-pointer sm:min-w-[7.5rem] sm:flex-none")}
                value={autoBackupPrefs.enabled ? autoBackupPrefs.frequency : "off"}
                disabled={!autoBackupPrefs.enabled}
                onChange={(e) => {
                  const frequency = e.target.value as AutoBackupFrequency;
                  const next: AutoBackupPrefs = {
                    ...autoBackupPrefs,
                    enabled: frequency !== "off",
                    frequency: frequency === "off" ? "daily" : frequency,
                  };
                  setAutoBackupPrefs(next);
                  saveAutoBackupPrefs(next);
                }}
                aria-label="Auto backup frequency"
              >
                <option value="off">Off</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              <div className={cn(backupCardPillCn, "min-w-0 flex-1 gap-2 sm:flex-none")}>
                <Label
                  htmlFor="auto-backup-enabled"
                  className="cursor-pointer text-sm font-medium leading-snug"
                >
                  Enable auto backup
                </Label>
                <Switch
                  id="auto-backup-enabled"
                  checked={autoBackupPrefs.enabled}
                  onCheckedChange={(checked) => {
                    const frequency: AutoBackupFrequency = checked
                      ? autoBackupPrefs.frequency === "off"
                        ? "daily"
                        : autoBackupPrefs.frequency
                      : "off";
                    const next: AutoBackupPrefs = {
                      ...autoBackupPrefs,
                      enabled: checked,
                      frequency,
                    };
                    setAutoBackupPrefs(next);
                    saveAutoBackupPrefs(next);
                  }}
                />
              </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-w-0 flex-1 space-y-4 text-sm">
            <BackupLocationField
              locationLabel={backupLocationLabel}
              onChooseLocation={openBackupLocationDialog}
              showButton={false}
            />
            {/* Backup location + Include attachments — chhoti screen par stack. */}
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openBackupLocationDialog}
                className={backupCardActionBtnCn}
              >
                Backup location
              </Button>
              {staticBackupClient ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(backupCardPillCn, "w-full min-w-0 justify-between gap-2 sm:w-auto sm:justify-center")}>
                      <Label
                        htmlFor="auto-backup-include-attachments"
                        className="cursor-pointer text-sm font-medium leading-snug"
                      >
                        Include attachments
                      </Label>
                      <Switch
                        id="auto-backup-include-attachments"
                        checked={autoBackupPrefs.includeAttachments}
                        disabled={!autoBackupPrefs.enabled || !attachmentFeatureOn}
                        onCheckedChange={(checked) => {
                          const next = { ...autoBackupPrefs, includeAttachments: checked };
                          setAutoBackupPrefs(next);
                          saveAutoBackupPrefs(next);
                        }}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[16rem] text-xs leading-snug">
                    Uses plan quota; larger backup files. {!attachmentFeatureOn ? "Not included on your plan." : null}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              ) : null}
            </div>
            {autoBackupPrefs.lastRunAt ? (
              <p className="text-xs text-muted-foreground">
                Last auto backup: {new Date(autoBackupPrefs.lastRunAt).toLocaleString()}
              </p>
            ) : null}
          </CardContent>
        </Card>
        </div>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Restore Data</CardTitle>
            <CardDescription>
              Restore from a JSON or encrypted .plbp file (legacy .webtally supported). Each restore creates a new company id so
              nothing merges into an existing slot by mistake.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 space-y-2">
            {nativeRuntime ? (
              <>
                {/* Native APK: dedicated picker se restore file selection stable rahe. */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePickRestoreFileNative}
                  className={backupCardActionBtnCn}
                >
                  Choose backup file
                </Button>
                <p className="text-xs text-muted-foreground break-all">
                  Selected file: <span className="font-medium text-foreground">{fileToRestore?.name || "Not selected"}</span>
                </p>
              </>
            ) : (
              <Input type="file" accept=".json,.plbp,.webtally" onChange={handleFileSelect} className="max-w-full" />
            )}
          </CardContent>
          <CardFooter className="flex min-w-0 flex-col items-stretch gap-3 pt-0">
            <PermissionButton
              permission="import_data"
              variant="outline"
              size="sm"
              onClick={startRestore}
              disabled={!fileToRestore || isRestoring}
              className={backupCardActionBtnCn}
            >
              {isRestoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Restore as new company
            </PermissionButton>
            {/* Restore live progress — backup card jaisa pill bar + cancel. */}
            {isRestoring && restoreProgress ? (
              <BackupProgressStrip
                progress={restoreProgress}
                spinning
                inCard
                showRefreshWarning
                refreshWarningText="Do not refresh or close this tab until restore completes."
                showCancel
                onCancel={() => {
                  cancelRestoreRun();
                }}
              />
            ) : null}
          </CardFooter>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex min-w-0 items-center gap-2">
              <Folder className="h-5 w-5 shrink-0" />
              <span className="min-w-0">Data save location</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 space-y-1 text-sm text-muted-foreground">
            <p className="break-words">
              Current:{" "}
              <span className="font-medium break-all text-foreground">
                {nativeRuntime
                  ? liveNativeFolderPath
                    ? formatNativeFolderDisplayPath(liveNativeFolderPath)
                    : "Not set"
                  : liveWebEnabled && liveWebLabel
                    ? liveWebLabel
                    : "Not set"}
              </span>
            </p>
            <p className="text-xs">Debounced sync also runs a few seconds after local saves when a location is active.</p>
          </CardContent>
          <CardFooter className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLiveDataLocationDialogOpen(true)}
              className={backupCardActionBtnCn}
            >
              Select folder
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleSyncLiveDataNow()}
              className={backupCardActionBtnCn}
            >
              Sync now
            </Button>
          </CardFooter>
        </Card>
      </div>

      <Dialog
        open={liveDataLocationDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setLiveDataLocationDialogOpen(false);
            return;
          }
          setLiveDataLocationDialogOpen(true);
        }}
      >
        <DialogContent className="w-[calc(100%-4px)] max-w-md rounded-xl mx-[2px]">
          <DialogHeader>
            <DialogTitle>Data save location</DialogTitle>
            <DialogDescription>
              Encrypted copies are saved under{" "}
              <code className="text-[10px]">
                {POCKET_LEDGER_MIRROR_DIR}/{COMPANIES_DIR_SEGMENT}/…
              </code>{" "}
              in the folder you choose. No password needed — this browser stores the encryption key on this device only.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!nativeRuntime && supportsWebFolderPicker ? (
              <>
                <div className="text-sm text-muted-foreground">
                  Selected folder: <span className="font-medium text-foreground">{liveWebLabel || "Not set"}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => void handlePickLiveDataWebFolder()}>
                    Browse folder
                  </Button>
                  <Button
                    type="button"
                    disabled={savingLiveDataLocation || !liveWebLabel}
                    onClick={() => void handleSaveLiveDataLocation()}
                  >
                    {savingLiveDataLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    <span className={savingLiveDataLocation ? "ml-2" : ""}>Save data location</span>
                  </Button>
                </div>
              </>
            ) : nativeRuntime ? (
              <>
                <Button type="button" variant="outline" onClick={() => void handlePickLiveDataNativeFolder()}>
                  Browse folder
                </Button>
                <div className="text-xs text-muted-foreground break-words">
                  Selected:{" "}
                  <span className="font-medium text-foreground">
                    {liveNativeFolderPath ? formatNativeFolderDisplayPath(liveNativeFolderPath) : "Not set"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  For SAF <code className="text-[10px]">content://</code> trees, mirror files are written via the same
                  native backup writer. Removing a file when a company goes online may require manual delete on some
                  devices.
                </p>
                <Button type="button" onClick={() => void handleSaveLiveDataLocation()} disabled={savingLiveDataLocation || !liveNativeFolderPath}>
                  {savingLiveDataLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  <span className={savingLiveDataLocation ? "ml-2" : ""}>Save data location</span>
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This browser does not support folder selection. Use a Chromium-based desktop browser or the app APK.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLiveDataLocationDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={backupLocationDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeBackupLocationDialog();
            return;
          }
          setBackupLocationDialogOpen(true);
        }}
      >
        <DialogContent className="w-[calc(100%-4px)] max-w-md rounded-xl mx-[2px]">
          <DialogHeader>
            <DialogTitle>Device backup location</DialogTitle>
            <DialogDescription>
              Choose where backup files should be saved on this device.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!nativeRuntime && (supportsWebFolderPicker || canPickElectronBackupDirectory()) ? (
              <>
                <div className="text-sm text-muted-foreground">
                  Current folder:{" "}
                  <span className="font-medium text-foreground break-all">
                    {webFolderDisplayPath || webFolderLabel || "Not set"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Auto save to selected folder: <span className="font-medium text-foreground">{webUseSelectedFolder ? "On" : "Off"}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={handlePickWebFolder}>
                    Browse folder
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSaveWebLocation}
                    disabled={!webFolderLabel || savingBackupLocation}
                  >
                    {savingBackupLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    <span className={savingBackupLocation ? "ml-2" : ""}>Save location</span>
                  </Button>
                </div>
              </>
            ) : nativeRuntime ? (
              <>
                <Button type="button" variant="outline" onClick={handlePickNativeFolder}>
                  Browse folder
                </Button>
                <div className="text-xs text-muted-foreground break-words">
                  Selected folder:{" "}
                  <span className="font-medium text-foreground">
                    {nativeFolderPath ? formatNativeFolderDisplayPath(nativeFolderPath) : "Not set"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={handleSaveNativeLocation} disabled={savingBackupLocation || !nativeFolderPath}>
                    {savingBackupLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    <span className={savingBackupLocation ? "ml-2" : ""}>Save location</span>
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This browser does not support fixed folder permission. Backup will ask location each time.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeBackupLocationDialog}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

       <AlertDialog open={backupPasswordHintOpen} onOpenChange={setBackupPasswordHintOpen}>
        <AlertDialogContent className="w-auto max-w-[min(calc(100vw-1.5rem),22rem)] gap-3 p-4 sm:max-w-sm">
          <AlertDialogHeader className="space-y-1.5">
            <AlertDialogTitle className="text-base text-destructive">Password Required to Create Backup</AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              To create a backup, you must first set a password for this company in Company Profile settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="h-9 px-3 text-sm">Close</AlertDialogCancel>
            <AlertDialogAction asChild className="h-9 px-3 text-sm">
              <Link href="/settings?view=company" onClick={() => setBackupPasswordHintOpen(false)}>
                Go to Settings
              </Link>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

       <AlertDialog open={isEncryptedBackupConfirmOpen} onOpenChange={setIsEncryptedBackupConfirmOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Encrypted Backup</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  This backup will be encrypted with your company password. That password is required to restore the data.
                </p>
                <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                  <Label className="text-sm font-medium text-foreground">Backup source</Label>
                  <RadioGroup
                    value={backupSourceMode}
                    onValueChange={(v) => {
                      setBackupSourceMode(v as CompanyBackupSourceMode);
                    }}
                    className="grid gap-2"
                  >
                    <label className="flex cursor-pointer items-start gap-2 text-left">
                      <RadioGroupItem value="local_only" id="backup-source-local" className="mt-0.5" />
                      <span>
                        <span className="font-medium text-foreground">Local device only</span> — SQLite on this
                        device. No Firestore / internet check. Use when offline or Firebase company was deleted.
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 text-left">
                      <RadioGroupItem value="online_merge" id="backup-source-online" className="mt-0.5" />
                      <span>
                        <span className="font-medium text-foreground">Online + local merge</span> — when online,
                        also read Firestore and merge with local SQLite (normal backup).
                      </span>
                    </label>
                  </RadioGroup>
                </div>
                <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                  <Label className="text-sm font-medium text-foreground">Backup contents</Label>
                  {staticBackupClient || backupSourceMode === "local_only" ? (
                  <RadioGroup
                    value={backupIncludeAttachments ? "attachments" : "data"}
                    onValueChange={(v) => setBackupIncludeAttachments(v === "attachments")}
                    className="grid gap-2"
                  >
                    <label className="flex cursor-pointer items-start gap-2 text-left">
                      <RadioGroupItem value="data" id="backup-mode-data" className="mt-0.5" />
                      <span>
                        <span className="font-medium text-foreground">Data only</span> — documents and attachment links (URLs). Smaller file.
                      </span>
                    </label>
                    <label
                      className={`flex items-start gap-2 text-left ${
                        backupSourceMode !== "local_only" && !attachmentFeatureOn
                          ? "opacity-60 cursor-not-allowed"
                          : "cursor-pointer"
                      }`}
                    >
                      <RadioGroupItem
                        value="attachments"
                        id="backup-mode-attachments"
                        className="mt-0.5"
                        disabled={backupSourceMode !== "local_only" && !attachmentFeatureOn}
                      />
                      <span>
                        <span className="font-medium text-foreground">
                          {backupSourceMode === "local_only"
                            ? "With attachments (local device)"
                            : "With attachments"}
                        </span>
                        {backupSourceMode === "local_only" ? (
                          <span className="block text-xs mt-1 leading-relaxed">
                            Embeds files already on this device (SQLite / local cache). No server download — use when Firebase Storage files were deleted.
                          </span>
                        ) : (
                          <span className="block text-xs mt-1 leading-relaxed">
                            Compressed zip inside encrypted .plbp (uses monthly plan quota).
                            {backupAttachmentGateHint ? (
                              <span className="block mt-1">{backupAttachmentGateHint}</span>
                            ) : null}
                          </span>
                        )}
                      </span>
                    </label>
                  </RadioGroup>
                  ) : (
                    <p className="text-sm leading-relaxed">
                      <span className="font-medium text-foreground">Data only</span> — company records and attachment
                      links (URLs). Attachment embed is available in the mobile/desktop app after pre-download.
                    </p>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    const allowsAttachmentEmbed =
                      staticBackupClient || backupSourceMode === "local_only" || attachmentFeatureOn;
                    void handleBackup(backupIncludeAttachments && allowsAttachmentEmbed);
                  }}
                >
                  Proceed
                </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
       <Dialog open={isDecrypting} onOpenChange={(open) => {
           if (!open) {
               setIsDecrypting(false);
               setFileToRestore(null);
               setDecryptionPassword('');
               setDecryptionError(null);
           }
       }}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Decryption Required</DialogTitle>
                 <Label>This backup file is encrypted. Please enter the password to restore.</Label>
            </DialogHeader>
            <div className="space-y-2">
              <div className="relative">
                <Input
                  type={showDecryptionPassword ? "text" : "password"}
                  value={decryptionPassword}
                  onChange={(e) => {
                    setDecryptionPassword(e.target.value);
                    setDecryptionError(null);
                  }}
                  placeholder="Enter password..."
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-1/2 h-8 w-8 -translate-y-1/2 border-0 shadow-none"
                  tabIndex={-1}
                  aria-label={showDecryptionPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowDecryptionPassword((prev) => !prev)}
                >
                  {showDecryptionPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </Button>
              </div>
              {decryptionError && <p className="text-sm text-destructive">{decryptionError}</p>}
               {decryptionError && fileToRestore?.name.endsWith('.json') && (
                <p className="text-sm text-amber-600">This file seems to be encrypted or is corrupted. Please provide a password if it's encrypted.</p>
              )}
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => {setIsDecrypting(false); setFileToRestore(null); }}>Cancel</Button>
                <Button onClick={handleDecryptionAndRestore} disabled={!decryptionPassword || isRestoring}>
                    {isRestoring && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Decrypt & Restore
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>


      <AlertDialog open={isOverwriteConfirmOpen} onOpenChange={setIsOverwriteConfirmOpen}>
        <AlertDialogContent className="flex max-h-[90vh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
                <FileWarning className="h-6 w-6 text-destructive" /> Are you absolutely sure?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {restoreTargetMode === "replace_current" ? (
                  <p>
                    Restore will <strong className="text-foreground">replace all data</strong> in the open company{" "}
                    <strong className="text-foreground">{company?.name}</strong> (same id). Other companies stay
                    unchanged. Only the company owner can restore.
                  </p>
                ) : (
                  <p>
                    Restore creates a <strong className="text-foreground">new company</strong> with a new id. Data in{" "}
                    <strong className="text-foreground">{company?.name}</strong> and your other companies stays as-is.
                    Only the company owner can restore.
                  </p>
                )}
                <p>
                  Type the confirmation text below (backup decryption already verified the file). To confirm, type{" "}
                  <code className="bg-muted px-2 py-1 rounded-md font-mono text-foreground">{company?.name.trim().toLowerCase()}</code>{" "}
                  (the company you have open now — proves intent).
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {company && (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
              <Label className="text-sm font-medium text-foreground">How to restore</Label>
              <RadioGroup
                value={restoreTargetMode}
                onValueChange={(v) => setRestoreTargetMode(v as RestoreTargetMode)}
                className="grid gap-2"
              >
                <label className="flex cursor-pointer items-start gap-2 text-left text-sm">
                  <RadioGroupItem value="replace_current" id="restore-target-replace" className="mt-0.5" />
                  <span>
                    <span className="font-medium text-foreground">1 — Replace current company</span> — overwrite{" "}
                    <strong>{company.name}</strong> data (same company id). Current vouchers, parties, etc. will be
                    replaced by backup.
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-left text-sm">
                  <RadioGroupItem value="new_company" id="restore-target-new" className="mt-0.5" />
                  <span>
                    <span className="font-medium text-foreground">2 — Restore as new company</span> — keep current
                    company as-is; backup becomes a separate company with a new id.
                  </span>
                </label>
              </RadioGroup>
            </div>
          )}
          {company && (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
              <Label className="text-sm font-medium text-foreground">Restore destination</Label>
              <p className="text-xs text-muted-foreground">
                <strong>This device</strong> = SQLite only on this PC/browser — no server upload.{" "}
                <strong>Firestore (cloud)</strong> = restore here first, then upload to your online company in the
                background (attachments from the header bar after reload).
              </p>
              <RadioGroup
                value={restoreToLocalSqlite ? "local" : "cloud"}
                onValueChange={(v) => setRestoreToLocalSqlite(v === "local")}
                className="grid gap-2"
              >
                <label className="flex cursor-pointer items-start gap-2 text-left text-sm">
                  <RadioGroupItem value="local" id="restore-dest-local" className="mt-0.5" />
                  <span>
                    <span className="font-medium text-foreground">This device (SQLite)</span> — full data on this browser; best for offline / local companies. Company row will stay local-first after restore.
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-left text-sm">
                  <RadioGroupItem value="cloud" id="restore-dest-cloud" className="mt-0.5" />
                  <span>
                    <span className="font-medium text-foreground">Firestore (cloud)</span> — same SQLite restore + app reload; then uploads to Firestore in the background (other devices can sync later).
                  </span>
                </label>
              </RadioGroup>
            </div>
          )}
          {backupDataToRestore?.companyDetails?.[0] && company && (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
              <Label className="text-sm font-medium text-foreground" htmlFor="restore-company-name-select">
                Company name after restore
              </Label>
              <p className="text-xs text-muted-foreground">
                {restoreTargetMode === "replace_current"
                  ? "Choose the display name for the restored company (same id as the open company)."
                  : "This name is stored on the new restored company only (id is always new). Pick backup name if you want the label to match the file."}
              </p>
              <select
                id="restore-company-name-select"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={restoreCompanyNameChoice}
                onChange={(e) => setRestoreCompanyNameChoice(e.target.value as "target" | "backup")}
              >
                <option value="target">
                  {String(company.name ?? "").trim() || "(current slot)"}
                  {restoreTargetMode === "replace_current"
                    ? " — keep this name (default)"
                    : " — use this name for the new copy (default)"}
                </option>
                <option value="backup">
                  {String(backupDataToRestore.companyDetails[0].name ?? "").trim() || "(backup)"} — from backup file
                </option>
              </select>
            </div>
          )}
          {backupDataHasOrphanAttachmentRefs(backupDataToRestore) && (
            <p className="text-xs text-destructive rounded-md border border-destructive/40 bg-destructive/5 p-3">
              This backup has attachment links (tick marks) but no embedded files. Restore will not bring files back —
              take a new backup with “With attachments” after the app update, then restore again.
            </p>
          )}
          {backupDataHasAttachmentBundle(backupDataToRestore) && (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
              <Label className="text-sm font-medium text-foreground">Attachment restore</Label>
              <p className="text-xs text-muted-foreground">
                This backup includes a compressed attachments zip (locked with your company password). Restore files to this device or keep URL links only.
              </p>
              <RadioGroup
                value={restoreIncludeAttachments ? "attachments" : "data"}
                onValueChange={(v) => setRestoreIncludeAttachments(v === "attachments")}
                className="grid gap-2"
              >
                <label className="flex cursor-pointer items-start gap-2 text-left text-sm">
                  <RadioGroupItem value="data" id="restore-mode-data" className="mt-0.5" />
                  <span>Data only — keep URLs from backup (files may be missing offline).</span>
                </label>
                <label
                  className={`flex items-start gap-2 text-left text-sm ${
                    !attachmentFeatureOn && !staticBackupClient && !restoreToLocalSqlite
                      ? "opacity-60 cursor-not-allowed"
                      : "cursor-pointer"
                  }`}
                >
                  <RadioGroupItem
                    value="attachments"
                    id="restore-mode-attachments"
                    className="mt-0.5"
                    disabled={!attachmentFeatureOn && !staticBackupClient && !restoreToLocalSqlite}
                  />
                  <span>
                    With attachments — write files to this device and update links.
                    {restoreToLocalSqlite || staticBackupClient ? (
                      <span className="block text-xs mt-1 text-muted-foreground">
                        Restore on the same app/EXE where you will use the company. Web browser and desktop app have
                        separate storage — files do not sync automatically.
                      </span>
                    ) : null}
                    {restoreAttachmentGateHint ? (
                      <span className="block text-xs mt-1 text-muted-foreground">{restoreAttachmentGateHint}</span>
                    ) : null}
                  </span>
                </label>
              </RadioGroup>
            </div>
          )}
          <Input 
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder="Type company name to confirm"
          />
          </div>
          <AlertDialogFooter className="shrink-0 border-t bg-background p-6 pt-4">
            <div className="flex justify-between items-center w-full">
                <AlertDialogCancel
                  onClick={() => {
                    setBackupDataToRestore(null);
                    restoreZipFilesRef.current = null;
                    setRestoreZipFilesByPath(null);
                  }}
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  void (async () => {
                    if (confirmationText.trim().toLowerCase() !== company?.name.trim().toLowerCase()) return;
                    if (!user?.uid) {
                      toast({ variant: "destructive", title: "Not signed in", description: "Sign in again, then retry." });
                      return;
                    }
                    if (!company?.isOwned) {
                      toast({ variant: "destructive", title: "Permission denied", description: "Only the company owner can restore data." });
                      return;
                    }
                    const data = backupDataToRestore;
                    if (!data) return;
                    const resolvedName = resolveRestoreFinalCompanyName(
                      restoreCompanyNameChoice,
                      company?.name ?? "",
                      String(data?.companyDetails?.[0]?.name ?? "")
                    );
                    setIsOverwriteConfirmOpen(false);
                    // Sirf radio — pehle `shouldRestoreToLocalOnly` se local company par cloud option hide + kabhi-kabhi galat branch (SQLite restore skip)
                    const withAttachments = resolveRestoreIncludeAttachments(
                      restoreIncludeAttachments,
                      data
                    );
                    await handleLocalOverwriteRestore(
                      data,
                      resolvedName,
                      withAttachments,
                      restoreTargetMode,
                      { cloudRestore: !restoreToLocalSqlite }
                    );
                  })();
                }}
                disabled={isRestoring || confirmationText.trim().toLowerCase() !== company?.name.trim().toLowerCase()}
                className="bg-destructive hover:bg-destructive/90"
                >
                {isRestoring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue — restore
                </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
