"use client";

import { Capacitor } from "@capacitor/core";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  documentId,
} from "firebase/firestore";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { encryptData, encryptBytes } from "@/lib/encryption";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { packPlbpZipBackup } from "@/lib/plbpBackupZip";
import {
  readBackupSaveLocationPrefs,
  readWebBackupDirectoryHandle,
  isNativeRuntime,
  ensureNativeBackupStoragePermission,
} from "@/lib/backupSaveLocation";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { backupPrefersLocalSnapshot } from "@/lib/backupLocalFirst";
import {
  buildAttachmentZipFromRefs,
  collectAttachmentRefsFromBackupData,
} from "@/lib/attachmentBackupBundle";
import {
  bytesPerSecToMbps,
  estimateRemainingFromFilePace,
  formatBackupThroughputLabel,
} from "@/lib/backupProgressMetrics";
import {
  checkAttachmentBackupAllowed,
  incrementAttachmentBackupUsage,
} from "@/lib/attachmentBackupUsage";
import {
  formatBackupAttachmentPreflightError,
  preflightBackupAttachmentsBeforeEmbed,
} from "@/lib/backupAttachmentPreflight";
import {
  loadIncrementalAttachmentCacheFromBackupLocation,
  refsMissingFromIncrementalCache,
  summarizeIncrementalAttachmentMerge,
  formatIncrementalMergeProgressDetail,
} from "@/lib/incrementalBackupFromLocation";
import type { Company } from "@/hooks/useCompany";

export const COLLECTIONS_TO_BACKUP = [
  "parties",
  "groups",
  "bank_accounts",
  "account_groups",
  "staff",
  "staff_groups",
  "items",
  "item_groups",
  "taxes",
  "tax_groups",
  "expense_accounts",
  "expense_groups",
  "vouchers",
  /** Auto Monthly schedule + enabled flag — restore ke baad app-open recurring chale. */
  "recurring_voucher_templates",
] as const;

const BACKUP_PAGE_SIZE = 500;

export { backupPrefersLocalSnapshot } from "@/lib/backupLocalFirst";

export type CompanyBackupProgress = {
  phase: string;
  detail: string;
  done?: number;
  total?: number;
  /** Attachment collect throughput — megabits per second (raw). */
  speedMbps?: number;
  /** UI label — Mbps/Kbps ya files/sec jab bytes kam hon. */
  speedLabel?: string;
  /** ETA label e.g. "~2 min left". */
  remainingLabel?: string;
};

async function blobToBase64DataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error ?? new Error("Failed to read blob"));
    r.readAsDataURL(blob);
  });
}

export async function saveBackupBlobWithBestEffort(blob: Blob, fileName: string): Promise<{ where: string }> {
  const savePrefs = readBackupSaveLocationPrefs();
  if (Capacitor.isNativePlatform()) {
    try {
      const dataUrl = await blobToBase64DataUrl(blob);
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
      const treeUri = String(savePrefs.nativeFolderPath || "").trim();
      if (treeUri.startsWith("content://")) {
        try {
          const { BackupSaf } = await import("@/lib/capacitorBackupSaf");
          await BackupSaf.writeToTreeUri({ treeUri, fileName, data: base64 });
          return { where: "Selected folder (device)" };
        } catch {
          /* fall through */
        }
      }
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
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
        await Share.share({ title: fileName, url: savedUri, dialogTitle: "Save backup file" });
      } catch {
        /* share cancel ok */
      }
      const dirLabel = savePrefs.nativeDirectory === "EXTERNAL" ? "ExternalStorage" : "Documents";
      return { where: `${dirLabel}/${finalPath}` };
    } catch {
      /* native fail → web fallback */
    }
  }
  let webPreferredFolderFailed = false;
  if (typeof window !== "undefined") {
    try {
      // Web + static: saved DirectoryHandle par direct save (Chromium File System Access).
      if (!isNativeRuntime() && savePrefs.webUseSelectedFolder) {
        // Electron EXE: stored absolute path — poora D:\… path par likho (handle optional).
        if (isElectronDesktopApp() && savePrefs.webFolderDisplayPath) {
          try {
            const { writeElectronBackupFile } = await import("@/lib/electronBackupFolder");
            await writeElectronBackupFile(savePrefs.webFolderDisplayPath, fileName, blob);
            const dir = savePrefs.webFolderDisplayPath.replace(/[/\\]+$/, "");
            const sep = savePrefs.webFolderDisplayPath.includes("\\") ? "\\" : "/";
            return { where: `${dir}${sep}${fileName}` };
          } catch {
            /* fall through to DirectoryHandle / Save As */
          }
        }
        const dirHandle = await readWebBackupDirectoryHandle();
        if (!dirHandle) {
          webPreferredFolderFailed = true;
        } else {
          if (typeof dirHandle.queryPermission === "function") {
            const p = await dirHandle.queryPermission({ mode: "readwrite" });
            if (p !== "granted" && typeof dirHandle.requestPermission === "function") {
              try {
                const req = await dirHandle.requestPermission({ mode: "readwrite" });
                if (req !== "granted") webPreferredFolderFailed = true;
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
              const label =
                savePrefs.webFolderDisplayPath || savePrefs.webFolderLabel || "Selected folder";
              const sep = label.includes("\\") ? "\\" : "/";
              return { where: `${label.replace(/[/\\]+$/, "")}${sep}${fileName}` };
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
          where: webPreferredFolderFailed ? "Selected folder (Save As fallback)" : "Selected folder (Save As)",
        };
      }
    } catch (e: any) {
      if (e?.name === "AbortError") throw e;
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

const MASTER_COLLECTIONS_WITH_OPENING = new Set([
  "parties",
  "bank_accounts",
  "staff",
  "items",
  "expense_accounts",
  "taxes",
]);

const OPENING_BALANCE_BACKUP_KEYS = [
  "openingBalance",
  "openingBalanceDate",
  "openingBalanceNarration",
  "openingBalanceUnit",
  "openingBalanceRate",
  "openingBalanceTaxId",
  "openingBalanceAllocated",
  "balance",
] as const;

/** SQLite mirror me nahi — local-only backup me Firestore se supplement. */
const FIRESTORE_SUPPLEMENT_COLLECTIONS = new Set<string>(["recurring_voucher_templates"]);

function localRowDefinesOpeningBalance(row: Record<string, unknown>): boolean {
  return OPENING_BALANCE_BACKUP_KEYS.some((k) => row[k] !== undefined);
}

function applyOpeningBalanceFieldsFromLocal(
  target: Record<string, unknown>,
  local: Record<string, unknown>
): void {
  for (const k of OPENING_BALANCE_BACKUP_KEYS) {
    if (local[k] !== undefined) target[k] = local[k];
  }
}

function applyRecurringTemplateFieldsFromLocal(
  target: Record<string, unknown>,
  local: Record<string, unknown>
): void {
  if (typeof local.enabled === "boolean") target.enabled = local.enabled;
}

function mergeTwoBackupRows(
  fsRow: Record<string, unknown> & { id: string },
  localRow: Record<string, unknown> & { id: string },
  colName: string,
  localPrimary: boolean
): Record<string, unknown> & { id: string } {
  if (localPrimary) {
    const merged: Record<string, unknown> & { id: string } = { ...fsRow, ...localRow, id: localRow.id };
    if (MASTER_COLLECTIONS_WITH_OPENING.has(colName) && !localRowDefinesOpeningBalance(localRow)) {
      for (const k of OPENING_BALANCE_BACKUP_KEYS) {
        if (fsRow[k] !== undefined) merged[k] = fsRow[k];
      }
    }
    if (colName === "recurring_voucher_templates" && typeof localRow.enabled !== "boolean" && typeof fsRow.enabled === "boolean") {
      merged.enabled = fsRow.enabled;
    }
    return merged;
  }

  const localNewer = docRowUpdatedMs(localRow) > docRowUpdatedMs(fsRow);
  const merged: Record<string, unknown> & { id: string } = localNewer
    ? { ...fsRow, ...localRow, id: localRow.id }
    : { ...fsRow, id: fsRow.id };

  if (MASTER_COLLECTIONS_WITH_OPENING.has(colName)) {
    applyOpeningBalanceFieldsFromLocal(merged, localRow);
  }
  if (colName === "recurring_voucher_templates") {
    applyRecurringTemplateFieldsFromLocal(merged, localRow);
  }
  return merged;
}

function mergeFirestoreRowsWithLocalMirrorForBackup(
  fsRows: Array<Record<string, unknown> & { id: string }>,
  localRows: Array<Record<string, unknown> & { id: string }>,
  colName: string,
  options?: { localPrimary?: boolean }
): Array<Record<string, unknown> & { id: string }> {
  const localPrimary = options?.localPrimary === true;
  const byId = new Map<string, Record<string, unknown> & { id: string }>();
  for (const r of fsRows) byId.set(String(r.id), { ...r });
  for (const r of localRows) {
    const id = String(r.id);
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, { ...r });
      continue;
    }
    byId.set(id, mergeTwoBackupRows(prev, r, colName, localPrimary));
  }
  return Array.from(byId.values());
}

function mergeRecurringVoucherSettingsForBackup(
  ...sources: Array<{ enabled?: boolean; runScope?: string; allowedUserIds?: string[] } | null | undefined>
): { enabled?: boolean; runScope?: string; allowedUserIds?: string[] } | undefined {
  for (const s of sources) {
    if (!s || typeof s !== "object") continue;
    if (typeof s.enabled === "boolean") return { ...s };
  }
  for (const s of sources) {
    if (s && typeof s === "object" && Object.keys(s).length > 0) return { ...s };
  }
  return undefined;
}

async function buildCompanyDetailsForBackup(input: {
  company: Company;
  companyId: string;
  fsCompanyId: string;
  preferLocalSnapshot: boolean;
  onlineForBackup: boolean;
}): Promise<Array<Record<string, unknown>>> {
  const { company, companyId, fsCompanyId, preferLocalSnapshot, onlineForBackup } = input;
  const localRow = (await getLocalCompanyById(companyId, { includeDeleted: true })) as Record<string, unknown> | null;

  let fsCompany: Record<string, unknown> | null = null;
  if (onlineForBackup && fsCompanyId) {
    try {
      const snap = await getDoc(doc(firestore, "companies", fsCompanyId));
      if (snap.exists()) fsCompany = snap.data() as Record<string, unknown>;
    } catch {
      fsCompany = null;
    }
  }

  const recurringVoucherSettings = mergeRecurringVoucherSettingsForBackup(
    (localRow?.recurringVoucherSettings as { enabled?: boolean }) ?? null,
    (company as { recurringVoucherSettings?: { enabled?: boolean } }).recurringVoucherSettings ?? null,
    (fsCompany?.recurringVoucherSettings as { enabled?: boolean }) ?? null
  );

  const base = preferLocalSnapshot
    ? { ...(fsCompany || {}), ...company, ...(localRow || {}), id: companyId }
    : { ...(fsCompany || {}), ...company, ...(localRow || {}), id: companyId };

  if (recurringVoucherSettings) {
    (base as Record<string, unknown>).recurringVoucherSettings = recurringVoucherSettings;
  }

  return [base as Record<string, unknown>];
}

/** `local_only` = sirf is device ka SQLite; Firestore / online sync skip (offline recovery). */
export type CompanyBackupSourceMode = "local_only" | "online_merge";

export type ExecuteCompanyBackupInput = {
  company: Company;
  companyId: string;
  ownerUid: string;
  accountPlanId: string;
  includeAttachments: boolean;
  /** Default: static/APK/EXE → local_only behaviour jab set na ho; explicit choice UI se aata hai. */
  backupSourceMode?: CompanyBackupSourceMode;
  onProgress: (p: CompanyBackupProgress) => void;
  signal?: AbortSignal;
};

export type ExecuteCompanyBackupResult =
  | {
      ok: true;
      where: string;
      includeAttachments: boolean;
      /** User ne files chuni thi — kitni unique refs mili. */
      attachmentRefCount?: number;
      /** Bundle me kitni files embed hui (0 = data-only backup despite checkbox). */
      attachmentEmbeddedCount?: number;
    }
  | { ok: false; error: string; cancelled?: boolean };

/** Core backup pipeline — module singleton se chale taaki page change par na ruke. */
export async function executeCompanyBackup(input: ExecuteCompanyBackupInput): Promise<ExecuteCompanyBackupResult> {
  const {
    company,
    companyId,
    ownerUid,
    accountPlanId,
    includeAttachments,
    backupSourceMode = backupPrefersLocalSnapshot() ? "local_only" : "online_merge",
    onProgress,
    signal,
  } = input;
  const localOnlySource = backupSourceMode === "local_only";
  if (!company.password) return { ok: false, error: "Company password required." };

  if (includeAttachments && !localOnlySource) {
    const gate = await checkAttachmentBackupAllowed(ownerUid, accountPlanId);
    if (!gate.allowed) return { ok: false, error: gate.message || "Attachment backup not allowed." };
  }

  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException("Backup cancelled", "AbortError");
  };

  try {
    onProgress({ phase: "Reading data", detail: "Loading company records…" });
    const fsCompanyId =
      String((company as { authoritativeCompanyId?: string }).authoritativeCompanyId || companyId || "").trim() ||
      companyId;
    const localOnlyBackup = String(company.storageOption || "").toLowerCase() === "local";
    const onlineForBackup = typeof navigator !== "undefined" && navigator.onLine;
    const preferLocalSnapshot = backupPrefersLocalSnapshot() || localOnlySource;

    const companyDetails = await buildCompanyDetailsForBackup({
      company,
      companyId,
      fsCompanyId,
      preferLocalSnapshot,
      onlineForBackup,
    });

    // Nayi `.plbp` = abhi ka snapshot; static/EXE/APK par SQLite primary, web par Firestore merge.
    const backupData: Record<string, unknown> = {
      companyDetails,
    };

    for (const colName of COLLECTIONS_TO_BACKUP) {
      throwIfAborted();
      onProgress({
        phase: "Reading data",
        detail: preferLocalSnapshot
          ? `Local SQLite: ${colName.replace(/_/g, " ")}…`
          : `Collection: ${colName.replace(/_/g, " ")}…`,
      });
      const localRows = (await listCompanyDocsFromBrowserDb(companyId, colName, {
        forBackupMerge: true,
      })) as Array<Record<string, unknown> & { id: string }>;

      // Local-only / static: device SQLite primary. Online ho to Firestore se gaps bharo
      // (opening balance mirror me na ho / recurring templates SQLite me na hon).
      if (preferLocalSnapshot) {
        const needsFirestoreSupplement =
          onlineForBackup &&
          Boolean(fsCompanyId) &&
          (FIRESTORE_SUPPLEMENT_COLLECTIONS.has(colName) || MASTER_COLLECTIONS_WITH_OPENING.has(colName));
        if (needsFirestoreSupplement) {
          let fsRows: Array<Record<string, unknown> & { id: string }> = [];
          try {
            fsRows = await fetchSubcollectionAllDocsPaginated(fsCompanyId, colName);
          } catch {
            fsRows = [];
          }
          backupData[colName] = mergeFirestoreRowsWithLocalMirrorForBackup(fsRows, localRows, colName, {
            localPrimary: true,
          });
        } else {
          backupData[colName] = localRows;
        }
        continue;
      }

      let fsRows: Array<Record<string, unknown> & { id: string }> = [];
      if (onlineForBackup && fsCompanyId) {
        try {
          fsRows = await fetchSubcollectionAllDocsPaginated(fsCompanyId, colName);
        } catch {
          fsRows = [];
        }
      } else if (!localOnlyBackup && !localOnlySource) {
        try {
          fsRows = await fetchSubcollectionAllDocsPaginated(fsCompanyId, colName);
        } catch {
          fsRows = [];
        }
      }

      if (localRows.length > 0) {
        backupData[colName] = mergeFirestoreRowsWithLocalMirrorForBackup(fsRows, localRows, colName);
      } else {
        backupData[colName] = fsRows;
      }
    }

    let savedWithAttachments = false;
    let attachmentRefCount = 0;
    let attachmentEmbeddedCount = 0;
    if (includeAttachments) {
      const refs = collectAttachmentRefsFromBackupData(backupData);
      attachmentRefCount = refs.length;

      throwIfAborted();
      onProgress({
        phase: "Reading previous backup",
        detail: "Checking backup folder for reusable attachment files…",
      });
      const incremental = await loadIncrementalAttachmentCacheFromBackupLocation({
        companyId,
        companyPassword: company.password,
        companyName: company.name,
      });
      const mergeSummary = summarizeIncrementalAttachmentMerge(refs, incremental.cache);
      const refsNeedingDownload = refsMissingFromIncrementalCache(refs, incremental.cache);
      if (incremental.sourceFileName || mergeSummary.reusedCount > 0 || mergeSummary.excludedRemovedCount > 0) {
        onProgress({
          phase: "Reading previous backup",
          detail: formatIncrementalMergeProgressDetail({
            sourceFileName: incremental.sourceFileName,
            reusedCount: mergeSummary.reusedCount,
            newDownloadCount: mergeSummary.newDownloadCount,
            excludedRemovedCount: mergeSummary.excludedRemovedCount,
          }),
        });
      }

      // Static/EXE/APK: local verify pehle; local-only recovery: hamesha device cache check (server skip).
      if (refsNeedingDownload.length > 0 || (localOnlySource && refs.length > 0)) {
        const preferLocal = backupPrefersLocalSnapshot() || localOnlySource;
        onProgress({
          phase: preferLocal ? "Checking attachments" : onlineForBackup ? "Syncing with server" : "Checking attachments",
          detail: localOnlySource
            ? "Checking local attachment cache on this device…"
            : preferLocal
              ? "Checking local attachment files…"
              : "Checking attachment files…",
          done: 0,
          total: refs.length,
        });
        const preflight = await preflightBackupAttachmentsBeforeEmbed({
          backupData,
          incrementalCache: incremental.cache,
          signal,
          skipOnlineAttachmentFetch: localOnlySource,
          onProgress: ({ done, total, detail }) => {
            onProgress({
              phase: preferLocal ? "Checking attachments" : onlineForBackup ? "Syncing with server" : "Checking attachments",
              detail,
              done,
              total,
            });
          },
        });
        if (preflight.missingRefs.length > 0 && !localOnlySource) {
          return {
            ok: false,
            error: formatBackupAttachmentPreflightError(
              preflight.missingRefs.length,
              preflight.totalRefs,
              preferLocal
            ),
          };
        }
      }

      const attachmentStartedMs = Date.now();
      let attachmentBytesTotal = 0;
      let lastSpeedSampleMs = attachmentStartedMs;
      let lastSpeedSampleBytes = 0;
        onProgress({
          phase: "Collecting attachments",
          detail:
            localOnlySource
              ? mergeSummary.reusedCount > 0
                ? `Local device: reusing ${mergeSummary.reusedCount} file(s) from previous backup folder…`
                : refs.length
                  ? "Reading attachment files from this device only…"
                  : "No attachment refs found"
              : mergeSummary.reusedCount > 0 || mergeSummary.excludedRemovedCount > 0
                ? formatIncrementalMergeProgressDetail({
                    sourceFileName: incremental.sourceFileName,
                    reusedCount: mergeSummary.reusedCount,
                    newDownloadCount: mergeSummary.newDownloadCount,
                    excludedRemovedCount: mergeSummary.excludedRemovedCount,
                  })
                : refs.length
                  ? "Starting…"
                  : "No attachment refs found",
        done: 0,
        total: refs.length,
        speedMbps: 0,
        speedLabel: undefined,
      });
      const bundle = await buildAttachmentZipFromRefs(
        refs,
        (done, total, bytesAdded) => {
        attachmentBytesTotal += bytesAdded;
        const now = Date.now();
        const elapsedMs = now - attachmentStartedMs;
        const windowMs = now - lastSpeedSampleMs;
        const windowBytes = attachmentBytesTotal - lastSpeedSampleBytes;
        const instantMbps =
          windowMs >= 80 && windowBytes > 0 ? bytesPerSecToMbps(windowBytes, windowMs) : undefined;
        const speedMbps = bytesPerSecToMbps(attachmentBytesTotal, elapsedMs);
        const speedLabel = formatBackupThroughputLabel({
          bytesTotal: attachmentBytesTotal,
          elapsedMs,
          filesDone: done,
          instantMbps,
        });
        lastSpeedSampleMs = now;
        lastSpeedSampleBytes = attachmentBytesTotal;
        const remainingLabel = estimateRemainingFromFilePace(done, total, elapsedMs);
        onProgress({
          phase: "Collecting attachments",
          detail: "",
          done,
          total,
          speedMbps,
          speedLabel,
          remainingLabel,
        });
      },
        signal,
        { previousCache: incremental.cache }
      );
      backupData.backupVersion = 3;
      attachmentEmbeddedCount = bundle.manifest.entries.length;
      if (bundle.manifest.entries.length) {
        backupData.includesAttachments = true;
        backupData.attachmentZipManifest = bundle.manifest;
        savedWithAttachments = true;

        throwIfAborted();
        onProgress({ phase: "Compressing", detail: "Building compressed zip…" });
        const zipBytes = packPlbpZipBackup(backupData, bundle.files);

        onProgress({ phase: "Encrypting", detail: "Securing backup with company password…" });
        const finalDataString = await encryptBytes(zipBytes, company.password);

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileName = `pocket-ledger_backup_${company.name.replace(/\s+/g, "_")}_${timestamp}.plbp`;
        const blob = new Blob([finalDataString], { type: "application/octet-stream" });
        onProgress({ phase: "Saving", detail: "Writing backup file…" });
        const saved = await saveBackupBlobWithBestEffort(blob, fileName);

        if (!localOnlySource) {
          await incrementAttachmentBackupUsage(ownerUid);
        }

        onProgress({ phase: "Complete", detail: `Saved: ${saved.where}` });
        return {
          ok: true,
          where: saved.where,
          includeAttachments: savedWithAttachments,
          attachmentRefCount,
          attachmentEmbeddedCount,
        };
      }
      backupData.includesAttachments = false;
    } else {
      backupData.backupVersion = 3;
      backupData.includesAttachments = false;
    }

    throwIfAborted();
    onProgress({ phase: "Preparing file", detail: "Serializing backup data…" });
    let jsonData: string;
    try {
      jsonData = JSON.stringify(backupData);
    } catch {
      return { ok: false, error: "Data too large or invalid to prepare for backup." };
    }

    onProgress({ phase: "Encrypting", detail: "Securing backup with company password…" });
    const finalDataString = await encryptData(jsonData, company.password);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `pocket-ledger_backup_${company.name.replace(/\s+/g, "_")}_${timestamp}.plbp`;
    const blob = new Blob([finalDataString], { type: "application/octet-stream" });
    onProgress({ phase: "Saving", detail: "Writing backup file…" });
    const saved = await saveBackupBlobWithBestEffort(blob, fileName);

    if (savedWithAttachments && !localOnlySource) {
      await incrementAttachmentBackupUsage(ownerUid);
    }

    onProgress({ phase: "Complete", detail: `Saved: ${saved.where}` });
    return {
      ok: true,
      where: saved.where,
      includeAttachments: savedWithAttachments,
      attachmentRefCount: includeAttachments ? attachmentRefCount : undefined,
      attachmentEmbeddedCount: includeAttachments ? attachmentEmbeddedCount : undefined,
    };
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "Backup cancelled.", cancelled: true };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected backup error." };
  }
}
