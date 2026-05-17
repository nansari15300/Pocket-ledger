
"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, Loader2, FileWarning, ShieldCheck, ShieldOff, Eye, EyeOff, Folder } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
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
  updateDoc,
  deleteField,
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
import { decryptData, encryptData } from "@/lib/encryption";
import Link from "next/link";
import { getGoogleDriveAuthUrl } from "@/lib/driveAuthClient";
import { ToastAction } from "../ui/toast";
import { getLocalCompanyById, upsertLocalCompany } from "@/lib/localCompanyStore";
import { flushBrowserDbToIndexedDB } from "@/lib/localSqlite";
import {
  upsertCompanyDocInBrowserDb,
  notifyBrowserDbCollectionUpdated,
  listCompanyDocsFromBrowserDb,
} from "@/lib/localCompanyDocMirror";
import { pushAllLocalCompanyDocsToFirestore } from "@/lib/migrateLocalCompanySubcollectionsToFirestore";
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

const collectionsToBackup = [
  "parties", "groups", "bank_accounts", "account_groups",
  "staff", "staff_groups", "items", "item_groups",
  "taxes", "tax_groups", "expense_accounts", "expense_groups", "vouchers",
];

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
      // Device settings: when user enabled fixed web folder, save directly there and skip Save As dialog.
      if (!isNativeRuntime() && savePrefs.webUseSelectedFolder) {
        const dirHandle = await readWebBackupDirectoryHandle();
        if (!dirHandle) {
          // Missing saved handle: fall back to Save As instead of hard failing.
          webPreferredFolderFailed = true;
        } else {
          if (typeof dirHandle.queryPermission === "function") {
            const p = await dirHandle.queryPermission({ mode: "readwrite" });
            if (p !== "granted" && typeof dirHandle.requestPermission === "function") {
              const req = await dirHandle.requestPermission({ mode: "readwrite" });
              if (req !== "granted") {
                webPreferredFolderFailed = true;
              }
            }
          }
          if (!webPreferredFolderFailed) {
            const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            const label = savePrefs.webFolderLabel || "Selected folder";
            return { where: `${label}/${fileName}` };
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

/** SAF/content URI ko user-friendly storage path label me badlo (UI display only). */
function formatNativeFolderDisplayPath(folderPath: string | null): string {
  const raw = String(folderPath || "").trim();
  if (!raw) return "Not set";
  if (!raw.startsWith("content://")) return raw;
  try {
    // Android tree URI pattern: .../tree/primary%3ADocuments -> storage/Documents
    const treeEncoded = raw.includes("/tree/") ? raw.split("/tree/")[1] ?? "" : "";
    const treeDecoded = decodeURIComponent(treeEncoded);
    const [volumeRaw, ...segments] = treeDecoded.split(":");
    const volume = String(volumeRaw || "").trim().toLowerCase();
    const root = volume === "primary" ? "storage" : `storage/${volume || "selected"}`;
    const suffix = segments.join(":").replace(/^\/+/, "");
    return suffix ? `${root}/${suffix}` : root;
  } catch {
    // Decode fail hone par raw URI hi fallback rakho.
    return raw;
  }
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

  const { company, companyId, setCompanyId, reloadLocalCompanyRegistry, triggerSync } = useCompany();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user, customUser } = useAuth();
  const { toast } = useToast();
  const { can } = usePermissions();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
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
  const [nativeFolderPath, setNativeFolderPath] = useState<string | null>(null);
  const [savingBackupLocation, setSavingBackupLocation] = useState(false);
  const [liveDataLocationDialogOpen, setLiveDataLocationDialogOpen] = useState(false);
  const [liveWebEnabled, setLiveWebEnabled] = useState(false);
  const [liveWebLabel, setLiveWebLabel] = useState<string | null>(null);
  const [liveNativeFolderPath, setLiveNativeFolderPath] = useState<string | null>(null);
  const [savingLiveDataLocation, setSavingLiveDataLocation] = useState(false);
  const supportsWebFolderPicker = canPickWebBackupFolder();
  const nativeRuntime = isNativeRuntime();
  /** Cloud-linked company: user choose SQLite vs Firestore — pehle default Firestore tha, local UI blank ho jati thi */
  const [restoreToLocalSqlite, setRestoreToLocalSqlite] = useState(true);
  /** Restore ke baad `companies.name`: default = jis slot mein restore ho raha hai (target); alternate = backup file ka naam */
  const [restoreCompanyNameChoice, setRestoreCompanyNameChoice] = useState<"target" | "backup">("target");

  useEffect(() => {
    if (isOverwriteConfirmOpen) {
      setRestoreToLocalSqlite(true);
      setRestoreCompanyNameChoice("target");
    }
  }, [isOverwriteConfirmOpen]);

  useEffect(() => {
    // Hydrate backup location prefs for this device.
    const prefs = readBackupSaveLocationPrefs();
    setWebUseSelectedFolder(prefs.webUseSelectedFolder);
    setWebFolderLabel(prefs.webFolderLabel);
    setNativeFolderPath(prefs.nativeFolderPath ?? null);
    const live = readLiveDataFolderPrefs();
    setLiveWebEnabled(live.webEnabled);
    setLiveWebLabel(live.webFolderLabel);
    setLiveNativeFolderPath(live.nativeFolderPath);
  }, []);

  useEffect(() => {
    // Deep link `?dialog=backup-location` opens the same popup as Backup location button.
    if (searchParams.get("dialog") === "backup-location") {
      setBackupLocationDialogOpen(true);
    }
  }, [searchParams]);

  const closeBackupLocationDialog = () => {
    setBackupLocationDialogOpen(false);
    if (searchParams.get("dialog") !== "backup-location") return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("dialog");
    const q = next.toString();
    const basePath = pathnameForModalRouterReplace(pathname || "");
    router.replace(q ? `${basePath}?${q}` : basePath, { scroll: false });
  };

  const handlePickWebFolder = async () => {
    if (!supportsWebFolderPicker) return;
    try {
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
      });
      setWebUseSelectedFolder(true);
      setWebFolderLabel(nextLabel);
      toast({ title: "Backup location saved", description: `Folder set to ${nextLabel}.` });
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
    });
    setWebUseSelectedFolder(false);
    setWebFolderLabel(null);
    toast({ title: "Backup location cleared", description: "Backup will ask location again." });
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
      await syncAllLocalCompanyMirrorsToFolder();
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
      await syncAllLocalCompanyMirrorsToFolder();
      toast({ title: "Synced", description: "Encrypted mirrors under pocket-ledger/ refreshed (if configured)." });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Sync failed", description: e instanceof Error ? e.message : "" });
    }
  };

  const handleBackupClick = () => {
    if (company?.password) {
      setIsEncryptedBackupConfirmOpen(true);
    } else {
      toast({
        variant: "destructive",
        title: "Password Required to Create Backup",
        description: "To create a backup, you must first set a password for this company in the settings.",
        action: (
          <ToastAction asChild altText="Go to Settings">
            <Link href="/settings?view=company">
                Go to Settings
            </Link>
          </ToastAction>
        ),
      });
    }
  };

  const handleBackup = async () => {
    if (!companyId || !company || !company.password) return;
    
    try {
      // Permission check: export
      assertCan(can, "export_data");
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
      setIsEncryptedBackupConfirmOpen(false);
      return;
    }
    
    setIsEncryptedBackupConfirmOpen(false);
    setIsBackingUp(true);

    try {
      const backupData: Record<string, any[]> = {
        companyDetails: [{ ...company, id: companyId }],
      };

      // Cloud data Firestore root id — galat `companyId` se parties pe PERMISSION_DENIED aata tha; local SQLite hamesha registry `companyId` se
      const fsCompanyId =
        String((company as { authoritativeCompanyId?: string }).authoritativeCompanyId || companyId || "").trim() ||
        companyId;
      const localOnlyBackup = String(company.storageOption || "").toLowerCase() === "local";

      for (const colName of collectionsToBackup) {
        let fsRows: Array<Record<string, unknown> & { id: string }> = [];
        if (!localOnlyBackup) {
          try {
            fsRows = await fetchSubcollectionAllDocsPaginated(fsCompanyId, colName);
          } catch (colError: unknown) {
            // Offline / rules / path: poori backup mat todo — SQLite mirror (forBackupMerge) se jodo
            console.warn("[Backup] Firestore subcollection read skipped, using local mirror if any:", colName, colError);
            fsRows = [];
          }
        }
        const localRows = await listCompanyDocsFromBrowserDb(companyId, colName, { forBackupMerge: true });
        backupData[colName] =
          localRows.length > 0
            ? mergeFirestoreRowsWithLocalMirrorForBackup(
                fsRows,
                localRows as Array<Record<string, unknown> & { id: string }>
              )
            : fsRows;
      }

      let jsonData: string;
      try {
        jsonData = JSON.stringify(backupData);
      } catch (stringifyError: any) {
        console.error("Backup JSON.stringify failed:", stringifyError);
        toast({
          variant: "destructive",
          title: "Backup Failed",
          description: "Data too large or invalid to prepare for backup.",
        });
        return;
      }

      let finalDataString: string;
      try {
        finalDataString = await encryptData(jsonData, company.password!);
      } catch (encError: any) {
        console.error("Backup encryption failed:", encError);
        const msg = encError?.message || String(encError);
        toast({
          variant: "destructive",
          title: "Backup Failed",
          description: msg.includes("encrypt") ? msg : `Encryption failed: ${msg}`,
        });
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileExtension = 'plbp';
      const fileName = `pocket-ledger_backup_${company.name.replace(/\s+/g, '_')}_${timestamp}.${fileExtension}`;
      const blob = new Blob([finalDataString], { type: "application/octet-stream" });
      const saved = await saveBackupBlobWithBestEffort(blob, fileName);
      toast({
        title: "Success",
        description: `Backup saved: ${saved.where}`,
      });
    } catch (error) {
      console.error(error);
      if ((error as any)?.name === "AbortError") {
        toast({ title: "Backup cancelled", description: "Save location was not selected." });
        return;
      }
      if (error instanceof PermissionDeniedError) {
        toast({ variant: "destructive", title: "Permission Denied", description: error.message });
      } else {
        toast({ variant: "destructive", title: "Backup Failed", description: (error as any)?.message || "Unexpected backup error." });
      }
    } finally {
      setIsBackingUp(false);
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
          const decryptedJson = await decryptData(encryptedContent, decryptionPassword);
          const backupData = JSON.parse(decryptedJson);
          
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
  const handleLocalOverwriteRestore = async (backupData: any, resolvedCompanyName: string) => {
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

    // Naya `companyId` banate hain — currently open company ka Firestore owner mismatch ab block nahi (purana slot touch nahi hota).

    setIsRestoring(true);
    setIsOverwriteConfirmOpen(false);
    toast({ title: "Restore Initiated", description: "Writing to local database…" });

    try {
      // Har restore par naya doc id — same backup do baar restore par SQLite rows mix nahi honge.
      const newCompanyId = generateCompanyId(
        resolvedCompanyName.trim() || String(backupCompanyDetails.name ?? "company")
      );

      const safeTimestamp = (val: any): Timestamp | null => {
        // Restore dates can come from Firestore JSON, local SQLite JSON, or old ISO backups; normalize all before writing.
        const date = parseFirestoreDateFieldToJsDate(val);
        return date ? Timestamp.fromDate(date) : null;
      };

      const backupCompanyIdFromFile = String(backupData.companyDetails?.[0]?.id ?? "").trim();

      for (const colName of collectionsToBackup) {
        const docsToRestore = backupData[colName] || [];
        for (const docData of docsToRestore) {
          const { id: originalId, ...data } = docData;
          const rewritten = rewriteBackupCompanyIdsDeep(backupCompanyIdFromFile, newCompanyId, data) as Record<string, unknown>;
          const rw = rewritten as { isDeleted?: boolean; date?: unknown; dueDate?: unknown; due_date?: unknown; openingBalanceDate?: unknown; createdAt?: unknown; amount?: unknown; total?: number };
          const finalData: Record<string, unknown> = {
            ...rewritten,
            companyId: newCompanyId,
            isDeleted: rw.isDeleted ?? false,
            date: safeTimestamp(rw.date),
            openingBalanceDate: safeTimestamp(rw.openingBalanceDate),
            createdAt: safeTimestamp(rw.createdAt) || Timestamp.now(),
            amount: rw.amount === "" || rw.amount === null || rw.amount === undefined ? rw.total || 0 : Number(rw.amount),
          };
          // Sale/Purchase overdue depends on dueDate; keep restored voucher backups selectable and visible in overdue list.
          if (colName === "vouchers") finalData.dueDate = safeTimestamp(rw.dueDate ?? rw.due_date);
          await upsertCompanyDocInBrowserDb(newCompanyId, colName, originalId, finalData as Record<string, unknown>, {
            notify: false,
            force: true,
          });
        }
        notifyBrowserDbCollectionUpdated(newCompanyId, colName);
      }

      const existing = await getLocalCompanyById(newCompanyId, { includeDeleted: true });
      const { id: _bid, ownerId: _boid, ownerEmail: _boe, ...restDetails } = backupData.companyDetails[0];
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

      const localCompanyRow: Record<string, unknown> = {
        ...(existing || {}),
        ...restNoFiscalLocalSafe,
        id: newCompanyId,
        ownerId: user.uid,
        ownerEmail: user.email ?? (existing as { ownerEmail?: string })?.ownerEmail,
        fiscalYearStart: fyStart ?? fiscalFieldToLocalIso((existing as { fiscalYearStart?: unknown })?.fiscalYearStart),
        fiscalYearEnd: fyEnd ?? fiscalFieldToLocalIso((existing as { fiscalYearEnd?: unknown })?.fiscalYearEnd),
        localCompanyUsers:
          (rest as { localCompanyUsers?: unknown }).localCompanyUsers ??
          (existing as { localCompanyUsers?: unknown })?.localCompanyUsers,
        updatedAt: Date.now(),
        storageOption: "local",
        syncedFromCloud: false,
        syncPolicy: "offline",
        // User ne confirm dialog mein jo naam choose kiya (target vs backup) — spread se backup `name` override
        name: resolvedCompanyName.trim() || String((restNoFiscalLocalSafe as { name?: string }).name ?? (existing as { name?: string })?.name ?? ""),
      };
      delete localCompanyRow.authoritativeCompanyId;

      await upsertLocalCompany(localCompanyRow as Parameters<typeof upsertLocalCompany>[0]);
      await flushBrowserDbToIndexedDB();
      reloadLocalCompanyRegistry();
      triggerSync();

      // Firestore root kabhi purane `authoritativeCompanyId` (backup wali company A) rakhta hai — shared user
      // `companies/{galatId}/vouchers` padhta hai → 0 data. SQLite sahi `companyId` par hai; cloud align + push.
      try {
        const cref = doc(firestore, "companies", newCompanyId);
        const cs = await getDoc(cref);
        if (cs.exists()) {
          await updateDoc(cref, { authoritativeCompanyId: deleteField() });
        }
        const { pushed, errors } = await pushAllLocalCompanyDocsToFirestore(newCompanyId);
        if (errors.length) {
          console.warn("[BackupRestore] post-local-restore cloud push:", errors.slice(0, 5));
        } else if (pushed > 0) {
          console.log("[BackupRestore] post-local-restore pushed docs:", pushed);
        }
      } catch (e) {
        console.warn("[BackupRestore] post-local-restore Firestore align/push skipped:", e);
      }

      setCompanyId(newCompanyId);
      toast({
        title: "Restore Successful",
        description: `Opened as a new company (${newCompanyId}). Reloading…`,
      });
      window.location.reload();
    } catch (error: any) {
      console.error("Local restore failed:", error);
      toast({
        variant: "destructive",
        title: "Restore Failed",
        description: error.message || "An error occurred during local restore.",
      });
    } finally {
      setIsRestoring(false);
      setFileToRestore(null);
    }
  };

  const handleOverwriteRestore = async (backupData: any, resolvedCompanyName: string) => {
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

    // Purani selected company delete nahi — naya Firestore `companies/{newId}` subtree banega.

    setIsRestoring(true);
    setIsOverwriteConfirmOpen(false);
    toast({ title: "Restore Initiated", description: "This may take a moment..." });

    try {
        const newCompanyId = generateCompanyId(
          resolvedCompanyName.trim() || String(backupCompanyDetails.name ?? "company")
        );
        const backupCompanyIdFromFile = String(backupData.companyDetails?.[0]?.id ?? "").trim();

        let batch = writeBatch(firestore);
        const safeTimestamp = (val: any): Timestamp | null => {
            // Cloud restore uses the same parser as voucher forms so dueDate survives JSON/plain timestamp backups.
            const date = parseFirestoreDateFieldToJsDate(val);
            return date ? Timestamp.fromDate(date) : null;
        };
        
        let count = 0;
        for (const colName of collectionsToBackup) {
            const docsToRestore = backupData[colName] || [];
            for (const docData of docsToRestore) {
                const { id: originalId, ...data } = docData;
                const rewritten = rewriteBackupCompanyIdsDeep(
                  backupCompanyIdFromFile,
                  newCompanyId,
                  data
                ) as Record<string, unknown>;
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
                    companyId: newCompanyId,
                    isDeleted: rw.isDeleted ?? false,
                    date: safeTimestamp(rw.date),
                    openingBalanceDate: safeTimestamp(rw.openingBalanceDate),
                    createdAt: safeTimestamp(rw.createdAt) || serverTimestamp(),
                    amount:
                      rw.amount === "" || rw.amount === null || rw.amount === undefined
                        ? rw.total || 0
                        : Number(rw.amount),
                };
                // Overdue vouchers require dueDate after restore; old backups may have due_date instead.
                if (colName === "vouchers") finalData.dueDate = safeTimestamp(rw.dueDate ?? rw.due_date);

                const docRef = doc(firestore, `companies/${newCompanyId}/${colName}`, originalId);
                batch.set(docRef, finalData);
                
                count++;
                if (count >= 450) { 
                    await batch.commit();
                    batch = writeBatch(firestore);
                    count = 0;
                }
            }
        }

        if (backupData.companyDetails?.[0]) {
            const {
              id: _bid,
              ownerId: _oid,
              ownerEmail: _oem,
              authoritativeCompanyId: _oldAuth,
              ...details
            } = backupData.companyDetails[0];
            const finalName =
              resolvedCompanyName.trim() || String((details as { name?: string }).name ?? "");
            const detailsRewritten = rewriteBackupCompanyIdsDeep(
              backupCompanyIdFromFile,
              newCompanyId,
              details
            ) as Record<string, unknown>;
            // Naya root doc — `set` taaki pehle se na ho to bhi likh sake; authoritative path = naya id.
            batch.set(doc(firestore, "companies", newCompanyId), {
              ...detailsRewritten,
              name: finalName,
              ownerId: user.uid,
              ownerEmail: user.email ?? "",
              authoritativeCompanyId: newCompanyId,
            });
        }

        await batch.commit();

        // Online restore ke baad local company registry / listeners align (static + web dono)
        reloadLocalCompanyRegistry();
        triggerSync();

        setCompanyId(newCompanyId);
        toast({
          title: "Restore Successful",
          description: `New cloud company ${newCompanyId}. Page will now reload.`,
        });
        window.location.reload();
    } catch (error: any) {
      console.error("Restore failed:", error);
      toast({ variant: "destructive", title: "Restore Failed", description: error.message || "An error occurred during the overwrite process." });
    } finally {
      setIsRestoring(false);
      setFileToRestore(null);
    }
  };


  return (
    <>
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Backup Data</CardTitle>
            <CardDescription>
              Download a complete backup of your company&apos;s data. You can choose to encrypt it for security.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <div className="flex flex-wrap items-center gap-2">
              <PermissionButton
                permission="export_data"
                onClick={handleBackupClick}
                disabled={isBackingUp}
              >
                {isBackingUp ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Create Backup
              </PermissionButton>
              {/* Backup page par hi backup location control: synced-device page se hata diya. */}
              <Button type="button" variant="outline" onClick={() => setBackupLocationDialogOpen(true)}>
                Backup location
              </Button>
            </div>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Restore Data</CardTitle>
            <CardDescription>
              Restore from a JSON or encrypted .plbp file (legacy .webtally supported). Each restore creates a new company id so
              nothing merges into an existing slot by mistake.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {nativeRuntime ? (
              <>
                {/* Native APK: dedicated picker se restore file selection stable rahe. */}
                <Button type="button" variant="outline" onClick={handlePickRestoreFileNative}>
                  Choose backup file
                </Button>
                <p className="text-xs text-muted-foreground break-all">
                  Selected file: <span className="font-medium text-foreground">{fileToRestore?.name || "Not selected"}</span>
                </p>
              </>
            ) : (
              <Input type="file" accept=".json,.plbp,.webtally" onChange={handleFileSelect} />
            )}
          </CardContent>
          <CardFooter>
            <PermissionButton
              permission="import_data"
              onClick={startRestore}
              disabled={!fileToRestore || isRestoring}
            >
              {isRestoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Restore as new company
            </PermissionButton>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Folder className="h-5 w-5" />
              Data save location
            </CardTitle>
            <CardDescription>
              Files go under{" "}
              <code className="text-xs">
                {POCKET_LEDGER_MIRROR_DIR}/{COMPANIES_DIR_SEGMENT}/&lt;CompanyName&gt;__&lt;companyId&gt;/
              </code>{" "}
              inside the folder you pick — one <strong>AES-GCM encrypted</strong> mirror per device-local company (
              <code className="text-xs">pl-local-company-*.json</code>, Firestore tree jaisa company scope). Old flat files
              in <code className="text-xs">{POCKET_LEDGER_MIRROR_DIR}/</code> root are moved here on next sync. Encryption
              uses an automatic key in this browser profile. The live database stays in SQLite (IndexedDB). If someone
              deletes <code className="text-xs">{POCKET_LEDGER_MIRROR_DIR}/</code>, the app will ask to recreate it or
              remove the company. Uploading a local company to the cloud removes its mirror on web.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p>
              Current:{" "}
              <span className="font-medium text-foreground">
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
          <CardFooter className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setLiveDataLocationDialogOpen(true)}>
              Select folder
            </Button>
            <Button type="button" variant="secondary" onClick={() => void handleSyncLiveDataNow()}>
              Sync now
            </Button>
            {(liveWebEnabled || liveNativeFolderPath) && (
              <Button type="button" variant="ghost" onClick={() => void handleClearLiveDataLocation()}>
                Clear location
              </Button>
            )}
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
                  <Button type="button" onClick={() => void handleSaveLiveDataLocation()} disabled={savingLiveDataLocation || !liveWebLabel}>
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
            {!nativeRuntime && supportsWebFolderPicker ? (
              <>
                <div className="text-sm text-muted-foreground">
                  Current folder: <span className="font-medium text-foreground">{webFolderLabel || "Not set"}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Auto save to selected folder: <span className="font-medium text-foreground">{webUseSelectedFolder ? "On" : "Off"}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={handlePickWebFolder}>
                    Browse folder
                  </Button>
                  <Button type="button" onClick={handleSaveWebLocation} disabled={!webFolderLabel || savingBackupLocation}>
                    {savingBackupLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    <span className={savingBackupLocation ? "ml-2" : ""}>Save location</span>
                  </Button>
                  <Button type="button" onClick={handleClearWebFolder} disabled={!webFolderLabel}>
                    Clear
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
                  <Button type="button" variant="ghost" onClick={handleClearNativeFolder} disabled={!nativeFolderPath}>
                    Clear selected folder
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

       <AlertDialog open={isEncryptedBackupConfirmOpen} onOpenChange={setIsEncryptedBackupConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Encrypted Backup</AlertDialogTitle>
            <AlertDialogDescription>
               This backup will be encrypted with your company password. This password will be required to restore the data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleBackup}>
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
              <Input 
                  type={showDecryptionPassword ? "text" : "password"}
                  value={decryptionPassword}
                  onChange={(e) => {
                      setDecryptionPassword(e.target.value)
                      setDecryptionError(null);
                  }}
                  placeholder="Enter password..."
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-0 h-auto text-xs"
                onClick={() => setShowDecryptionPassword((prev) => !prev)}
              >
                {showDecryptionPassword ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                {showDecryptionPassword ? "Hide password" : "Show password"}
              </Button>
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
                <FileWarning className="h-6 w-6 text-destructive" /> Are you absolutely sure?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Restore creates a <strong className="text-foreground">new company</strong> with a new id. Data in{" "}
                  <strong className="text-foreground">{company?.name}</strong> and your other companies stays as-is — same
                  backup restored twice will not mix rows. Only the company owner can restore.
                </p>
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
              <Label className="text-sm font-medium text-foreground">Restore destination</Label>
              <p className="text-xs text-muted-foreground">
                Local aur online dono companies ke liye: &quot;This device&quot; = browser SQLite (offline); Firestore = cloud sync.
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
                    <span className="font-medium text-foreground">Firestore (cloud)</span> — other devices can sync; use when you intentionally want cloud as source of truth.
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
                This name is stored on the <strong className="text-foreground">new</strong> restored company only (id is always
                new). Pick backup name if you want the label to match the file.
              </p>
              {/* Native select: Radix Select + AlertDialog focus trap issues avoid */}
              <select
                id="restore-company-name-select"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={restoreCompanyNameChoice}
                onChange={(e) => setRestoreCompanyNameChoice(e.target.value as "target" | "backup")}
              >
                <option value="target">
                  {String(company.name ?? "").trim() || "(current slot)"} — use this name for the new copy (default)
                </option>
                <option value="backup">
                  {String(backupDataToRestore.companyDetails[0].name ?? "").trim() || "(backup)"} — from backup file
                </option>
              </select>
            </div>
          )}
          <Input 
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder="Type company name to confirm"
          />
          <AlertDialogFooter>
            <div className="flex justify-between items-center w-full">
                <AlertDialogCancel onClick={() => setBackupDataToRestore(null)}>Cancel</AlertDialogCancel>
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
                    if (restoreToLocalSqlite) {
                      await handleLocalOverwriteRestore(data, resolvedName);
                    } else {
                      await handleOverwriteRestore(data, resolvedName);
                    }
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
