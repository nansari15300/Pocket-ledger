"use client";

import { Capacitor } from "@capacitor/core";
import {
  collection,
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
import { packPlbpZipBackup } from "@/lib/plbpBackupZip";
import {
  readBackupSaveLocationPrefs,
  readWebBackupDirectoryHandle,
  isNativeRuntime,
  ensureNativeBackupStoragePermission,
} from "@/lib/backupSaveLocation";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
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

function mergeFirestoreRowsWithLocalMirrorForBackup(
  fsRows: Array<Record<string, unknown> & { id: string }>,
  localRows: Array<Record<string, unknown> & { id: string }>
): Array<Record<string, unknown> & { id: string }> {
  const byId = new Map<string, Record<string, unknown> & { id: string }>();
  for (const r of fsRows) byId.set(String(r.id), { ...r });
  for (const r of localRows) {
    const id = String(r.id);
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, { ...r });
      continue;
    }
    if (docRowUpdatedMs(r) > docRowUpdatedMs(prev)) byId.set(id, { ...prev, ...r });
  }
  return Array.from(byId.values());
}

export type ExecuteCompanyBackupInput = {
  company: Company;
  companyId: string;
  ownerUid: string;
  accountPlanId: string;
  includeAttachments: boolean;
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
  const { company, companyId, ownerUid, accountPlanId, includeAttachments, onProgress, signal } = input;
  if (!company.password) return { ok: false, error: "Company password required." };

  if (includeAttachments) {
    const gate = await checkAttachmentBackupAllowed(ownerUid, accountPlanId);
    if (!gate.allowed) return { ok: false, error: gate.message || "Attachment backup not allowed." };
  }

  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException("Backup cancelled", "AbortError");
  };

  try {
    onProgress({ phase: "Reading data", detail: "Loading company records…" });
    // Nayi `.plbp` = abhi ka snapshot (SQLite + online Firestore); purani backup file se data merge nahi.
    const backupData: Record<string, unknown> = {
      companyDetails: [{ ...company, id: companyId }],
    };
    const fsCompanyId =
      String((company as { authoritativeCompanyId?: string }).authoritativeCompanyId || companyId || "").trim() ||
      companyId;
    const localOnlyBackup = String(company.storageOption || "").toLowerCase() === "local";
    const onlineForBackup = typeof navigator !== "undefined" && navigator.onLine;

    for (const colName of COLLECTIONS_TO_BACKUP) {
      throwIfAborted();
      onProgress({ phase: "Reading data", detail: `Collection: ${colName.replace(/_/g, " ")}…` });
      let fsRows: Array<Record<string, unknown> & { id: string }> = [];
      // Online backup: server se ek baar pull — local-only company par bhi taaki Firestore-only rows/refs miss na hon.
      if (onlineForBackup && fsCompanyId) {
        try {
          fsRows = await fetchSubcollectionAllDocsPaginated(fsCompanyId, colName);
        } catch {
          fsRows = [];
        }
      } else if (!localOnlyBackup) {
        try {
          fsRows = await fetchSubcollectionAllDocsPaginated(fsCompanyId, colName);
        } catch {
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

      // Server prefetch (online) ya verify-only (offline) — sirf nayi / missing refs.
      if (refsNeedingDownload.length > 0) {
        if (onlineForBackup) {
          onProgress({
            phase: "Syncing with server",
            detail: "Checking attachment files…",
            done: 0,
            total: refs.length,
          });
          const preflight = await preflightBackupAttachmentsBeforeEmbed({
            backupData,
            incrementalCache: incremental.cache,
            signal,
            onProgress: ({ done, total, detail }) => {
              onProgress({
                phase: "Syncing with server",
                detail,
                done,
                total,
              });
            },
          });
          if (preflight.missingRefs.length > 0) {
            return {
              ok: false,
              error: formatBackupAttachmentPreflightError(preflight.missingRefs.length, preflight.totalRefs),
            };
          }
        } else {
          onProgress({
            phase: "Checking attachments",
            detail: "Verifying cached attachment files…",
            done: 0,
            total: refs.length,
          });
          const preflight = await preflightBackupAttachmentsBeforeEmbed({
            backupData,
            incrementalCache: incremental.cache,
            signal,
            onProgress: ({ done, total, detail }) => {
              onProgress({ phase: "Checking attachments", detail, done, total });
            },
          });
          if (preflight.missingRefs.length > 0) {
            return {
              ok: false,
              error: `${preflight.missingRefs.length} attachment file(s) are not on this device. Connect to the internet and try again.`,
            };
          }
        }
      }

      const attachmentStartedMs = Date.now();
      let attachmentBytesTotal = 0;
      let lastSpeedSampleMs = attachmentStartedMs;
      let lastSpeedSampleBytes = 0;
      onProgress({
        phase: "Collecting attachments",
        detail:
          mergeSummary.reusedCount > 0 || mergeSummary.excludedRemovedCount > 0
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

        await incrementAttachmentBackupUsage(ownerUid);

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

    if (savedWithAttachments) {
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
