
"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, Loader2, FileWarning, ShieldCheck, ShieldOff, Eye, EyeOff } from "lucide-react";
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
} from "firebase/firestore";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { PermissionButton } from "@/components/permission";
import { assertCan, PermissionDeniedError } from "@/lib/permissions/enforcePermission";
import { decryptData, encryptData } from "@/lib/encryption";
import Link from "next/link";
import { getGoogleDriveAuthUrl } from "@/lib/drive-actions";
import { ToastAction } from "../ui/toast";
import { getLocalCompanyById, upsertLocalCompany } from "@/lib/localCompanyStore";
import { flushBrowserDbToIndexedDB } from "@/lib/localSqlite";
import {
  deleteAllCompanyDocsForCompany,
  upsertCompanyDocInBrowserDb,
  notifyBrowserDbCollectionUpdated,
  listCompanyDocsFromBrowserDb,
} from "@/lib/localCompanyDocMirror";
import { clearSyncOutboxForCompany } from "@/lib/localVoucherOutbox";
import { Capacitor } from "@capacitor/core";
import {
  readBackupSaveLocationPrefs,
  readWebBackupDirectoryHandle,
  isNativeRuntime,
} from "@/lib/backupSaveLocation";

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
 * - Native APK: Documents me write + share sheet (user can choose destination/app).
 * - Fallback: anchor download.
 */
async function saveBackupBlobWithBestEffort(blob: Blob, fileName: string): Promise<{ where: string }> {
  const savePrefs = readBackupSaveLocationPrefs();
  if (typeof window !== "undefined") {
    try {
      // Device settings: when user enabled fixed web folder, save directly there and skip Save As dialog.
      if (!isNativeRuntime() && savePrefs.webUseSelectedFolder) {
        const dirHandle = await readWebBackupDirectoryHandle();
        if (!dirHandle) {
          throw new Error("Backup location not set. Open Settings > Device settings and choose a folder.");
        }
        if (typeof dirHandle.queryPermission === "function") {
          const p = await dirHandle.queryPermission({ mode: "readwrite" });
          if (p !== "granted" && typeof dirHandle.requestPermission === "function") {
            const req = await dirHandle.requestPermission({ mode: "readwrite" });
            if (req !== "granted") {
              throw new Error("Selected backup folder permission denied. Please reselect folder in Device settings.");
            }
          }
        }
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        const label = savePrefs.webFolderLabel || "Selected folder";
        return { where: `${label}/${fileName}` };
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
        return { where: "Selected folder (Save As)" };
      }
    } catch (e: any) {
      if (e?.name === "AbortError") throw e;
      // picker unsupported/blocked -> नीचे fallback
    }
  }

  try {
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const dataUrl = await blobToBase64DataUrl(blob);
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
      // Device settings: prefer saved native directory + subfolder so backup destination stays consistent.
      const nativeDirectory =
        savePrefs.nativeDirectory === "EXTERNAL"
          ? ((Directory as unknown as Record<string, unknown>).ExternalStorage ?? Directory.Documents)
          : Directory.Documents;
      const rawSubfolder = String(savePrefs.nativeSubfolder || "").trim();
      const safeSubfolder = rawSubfolder.replace(/^[\\/]+|[\\/]+$/g, "");
      if (safeSubfolder) {
        await Filesystem.mkdir({
          path: safeSubfolder,
          directory: nativeDirectory as any,
          recursive: true,
        }).catch(() => undefined);
      }
      const finalPath = safeSubfolder ? `${safeSubfolder}/${fileName}` : fileName;
      await Filesystem.writeFile({
        path: finalPath,
        data: base64,
        directory: nativeDirectory as any,
      });
      const { uri } = await Filesystem.getUri({ path: finalPath, directory: nativeDirectory as any });
      try {
        // User yahan se target app/location choose kar sakta hai (Drive, Files, etc.)
        await Share.share({
          title: fileName,
          url: uri,
          dialogTitle: "Save backup file",
        });
      } catch {
        /* share optional */
      }
      const dirLabel = savePrefs.nativeDirectory === "EXTERNAL" ? "ExternalStorage" : "Documents";
      return { where: `${dirLabel}/${finalPath}` };
    }
  } catch {
    // native write fail -> browser fallback
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

    try {
      const liveCompanyRef = doc(firestore, "companies", companyId);
      const liveCompanySnap = await getDoc(liveCompanyRef);
      if (liveCompanySnap.exists()) {
        const liveData = liveCompanySnap.data();
        if (liveData.ownerId !== backupOwnerId) {
          toast({
            variant: "destructive",
            title: "Restore Blocked",
            description: `This company's ownership has changed. You cannot overwrite it.`,
            duration: 10000,
          });
          setIsOverwriteConfirmOpen(false);
          setFileToRestore(null);
          return;
        }
      }
    } catch {
      /* offline */
    }

    setIsRestoring(true);
    setIsOverwriteConfirmOpen(false);
    toast({ title: "Restore Initiated", description: "Writing to local database…" });

    try {
      await deleteAllCompanyDocsForCompany(companyId);
      await clearSyncOutboxForCompany(companyId);

      const safeTimestamp = (val: any): Timestamp | null => {
        if (!val) return null;
        if (val.seconds !== undefined && val.nanoseconds !== undefined) {
          return new Timestamp(val.seconds, val.nanoseconds);
        }
        const date = new Date(val);
        return isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
      };

      const backupCompanyIdFromFile = String(backupData.companyDetails?.[0]?.id ?? "").trim();

      for (const colName of collectionsToBackup) {
        const docsToRestore = backupData[colName] || [];
        for (const docData of docsToRestore) {
          const { id: originalId, ...data } = docData;
          const rewritten = rewriteBackupCompanyIdsDeep(backupCompanyIdFromFile, companyId, data) as Record<string, unknown>;
          const rw = rewritten as { isDeleted?: boolean; date?: unknown; openingBalanceDate?: unknown; createdAt?: unknown; amount?: unknown; total?: number };
          const finalData = {
            ...rewritten,
            companyId,
            isDeleted: rw.isDeleted ?? false,
            date: safeTimestamp(rw.date),
            openingBalanceDate: safeTimestamp(rw.openingBalanceDate),
            createdAt: safeTimestamp(rw.createdAt) || Timestamp.now(),
            amount: rw.amount === "" || rw.amount === null || rw.amount === undefined ? rw.total || 0 : Number(rw.amount),
          };
          await upsertCompanyDocInBrowserDb(companyId, colName, originalId, finalData as Record<string, unknown>, {
            notify: false,
            force: true,
          });
        }
        notifyBrowserDbCollectionUpdated(companyId, colName);
      }

      const existing = await getLocalCompanyById(companyId, { includeDeleted: true });
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
        id: companyId,
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

      toast({ title: "Restore Successful", description: "Local data updated. Reloading…" });
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

    const liveCompanyRef = doc(firestore, "companies", companyId);
    const liveCompanySnap = await getDoc(liveCompanyRef);
    if (liveCompanySnap.exists()) {
        const liveData = liveCompanySnap.data();
        if (liveData.ownerId !== backupOwnerId) {
             toast({
                variant: "destructive",
                title: "Restore Blocked",
                description: `This company's ownership has changed. You cannot overwrite it.`,
                duration: 10000,
            });
            setIsOverwriteConfirmOpen(false);
            setFileToRestore(null);
            return;
        }
    }

    setIsRestoring(true);
    setIsOverwriteConfirmOpen(false);
    toast({ title: "Restore Initiated", description: "This may take a moment..." });

    try {
        let batch = writeBatch(firestore);
        const safeTimestamp = (val: any): Timestamp | null => {
            if (!val) return null;
            if (val.seconds !== undefined && val.nanoseconds !== undefined) {
                return new Timestamp(val.seconds, val.nanoseconds);
            }
            const date = new Date(val);
            return isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
        };
        
        let count = 0;
        for (const colName of collectionsToBackup) {
            const q = query(collection(firestore, `companies/${companyId}/${colName}`));
            const snapshot = await getDocs(q);
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
                count++;
                if(count >= 450) {
                    batch.commit();
                    batch = writeBatch(firestore);
                    count = 0;
                }
            });

            const docsToRestore = backupData[colName] || [];
            for (const docData of docsToRestore) {
                const { id: originalId, ...data } = docData;
                const finalData = {
                    ...data,
                    companyId: companyId,
                    isDeleted: data.isDeleted ?? false,
                    date: safeTimestamp(data.date),
                    openingBalanceDate: safeTimestamp(data.openingBalanceDate),
                    createdAt: safeTimestamp(data.createdAt) || serverTimestamp(),
                    amount: (data.amount === "" || data.amount === null || data.amount === undefined) ? (data.total || 0) : Number(data.amount),
                };

                const docRef = doc(firestore, `companies/${companyId}/${colName}`, originalId);
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
            const { id, ownerId, ownerEmail, ...details } = backupData.companyDetails[0];
            const finalName =
              resolvedCompanyName.trim() || String((details as { name?: string }).name ?? "");
            // Firestore company root: user-chosen naam taaki selector / registry backup ke saath align ho
            batch.update(doc(firestore, "companies", companyId), { ...details, name: finalName });
        }

        await batch.commit();

        // Online restore ke baad local company registry / listeners align (static + web dono)
        reloadLocalCompanyRegistry();
        triggerSync();

        toast({ title: "Restore Successful", description: "Data overwritten successfully. Page will now reload." });
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
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Restore Data</CardTitle>
            <CardDescription>
              Restore company data from a JSON or encrypted .plbp file. Legacy .webtally files are also supported.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Input type="file" accept=".json,.plbp,.webtally" onChange={handleFileSelect} />
          </CardContent>
          <CardFooter>
            <PermissionButton
              permission="import_data"
              onClick={startRestore}
              disabled={!fileToRestore || isRestoring}
            >
              {isRestoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Restore & Overwrite
            </PermissionButton>
          </CardFooter>
        </Card>
      </div>

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
                  This action cannot be undone. This will permanently overwrite all current data in the company{" "}
                  <strong className="text-foreground">{company?.name}</strong>. Only the company owner can restore.
                </p>
                <p>
                  Type the confirmation text below (backup decryption already verified the file). To confirm, type{" "}
                  <code className="bg-muted px-2 py-1 rounded-md font-mono text-foreground">{company?.name.trim().toLowerCase()}</code>{" "}
                  in the box below.
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
                Default: current company (the slot you are restoring into). You can use the name from the backup file instead.
              </p>
              {/* Native select: Radix Select + AlertDialog focus trap issues avoid */}
              <select
                id="restore-company-name-select"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={restoreCompanyNameChoice}
                onChange={(e) => setRestoreCompanyNameChoice(e.target.value as "target" | "backup")}
              >
                <option value="target">
                  {String(company.name ?? "").trim() || "(current slot)"} — this company (default)
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
