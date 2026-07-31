"use client";

/**
 * User folder → `pocket-ledger/` subfolder → encrypted JSON per **device-local** company.
 * Master DB IndexedDB + sql.js; mirrors use auto passphrase (IndexedDB) + saved salt.
 * "Upload to cloud" → mirror file delete (web).
 */

import { companyStorageIsLocal } from "@/config/plans";
import {
  readWebLiveDataDirectoryHandle,
  clearWebLiveDataDirectoryHandle,
  isNativeRuntime,
  ensureLiveMirrorAutoPassphrase,
  clearLiveMirrorAutoPassphrase,
} from "@/lib/backupSaveLocation";
import { flushBrowserDbToIndexedDB } from "@/lib/localSqlite";
import { getLocalCompanyById, listLocalCompanies, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { sealLiveMirrorJson } from "@/lib/liveDataFolderCrypto";
import { generateEncryptServerBackupSaltBase64 } from "@/lib/serverBackupEncryption";

const LIVE_DATA_PREFS_KEY = "pl_live_data_folder_prefs_v1";

/** Saari company mirror files isi subfolder me (user ne jo root pick kiya uske andar). */
export const POCKET_LEDGER_MIRROR_DIR = "pocket-ledger";

/** Firestore jaisa: `pocket-ledger/companies/<CompanyName>__<companyId>/...` */
export const COMPANIES_DIR_SEGMENT = "companies";

export const LIVE_MIRROR_FILE_PREFIX = "pl-local-company-";
export const LIVE_MIRROR_FILE_SUFFIX = ".json";

export const LIVE_MIRROR_FOLDER_MISSING_EVENT = "pl-live-mirror-folder-missing" as const;

/** Web: user ne picked root delete/move kiya — IndexedDB handle dead; dialog picker se naya handle chahiye. */
export const STALE_LIVE_DATA_HANDLE_CODE = "STALE_LIVE_DATA_HANDLE" as const;

function throwStaleLiveDataFolderError(): never {
  const err = new Error(
    "The saved folder was removed or the browser lost access. Pick the folder again (same or new location)."
  ) as Error & { code: typeof STALE_LIVE_DATA_HANDLE_CODE };
  err.code = STALE_LIVE_DATA_HANDLE_CODE;
  throw err;
}

const COLLECTIONS_TO_MIRROR = [
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
] as const;

export type LiveDataFolderPrefs = {
  webEnabled: boolean;
  webFolderLabel: string | null;
  nativeFolderPath: string | null;
  /** PBKDF2 salt (base64) — har device/folder config ek baar generate. */
  mirrorSaltBase64?: string | null;
};

const DEFAULT_LIVE_PREFS: LiveDataFolderPrefs = {
  webEnabled: false,
  webFolderLabel: null,
  nativeFolderPath: null,
  mirrorSaltBase64: null,
};

/** Web: user deleted `pocket-ledger/` — writes pause until Recreate or company removed. */
let mirrorFolderWriteBlocked = false;
let mirrorMissingDispatchedForBlock = false;
/** Background SQLite flush: requestPermission mat karo (NotAllowedError); sirf user Sync/Save par true. */
let mirrorSyncAllowPermissionRequest = false;

async function withMirrorSyncContext<T>(userInitiated: boolean, fn: () => Promise<T>): Promise<T> {
  const prev = mirrorSyncAllowPermissionRequest;
  mirrorSyncAllowPermissionRequest = userInitiated;
  try {
    return await fn();
  } finally {
    mirrorSyncAllowPermissionRequest = prev;
  }
}

export function resetMirrorMissingDispatchedGate(): void {
  mirrorMissingDispatchedForBlock = false;
}

export function clearMirrorFolderWriteBlock(): void {
  mirrorFolderWriteBlocked = false;
  mirrorMissingDispatchedForBlock = false;
}

function isNotFoundError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "NotFoundError";
}

/** Browser: bina user click ke File System Access — `getDirectoryHandle` / `requestPermission` fail. */
function isFileSystemAccessDeniedError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === "NotAllowedError" || e.name === "SecurityError")
  );
}

async function dispatchMirrorFolderMissingIfWeb(companyId: string): Promise<void> {
  if (isNativeRuntime()) return;
  if (!mirrorFolderWriteBlocked) mirrorFolderWriteBlocked = true;
  if (mirrorMissingDispatchedForBlock) return;
  mirrorMissingDispatchedForBlock = true;
  const rows = await listLocalCompanies({ includeDeleted: false });
  const row = rows.find((r) => r.id === companyId);
  const companyName = row?.name ? String(row.name) : companyId;
  window.dispatchEvent(
    new CustomEvent(LIVE_MIRROR_FOLDER_MISSING_EVENT, {
      detail: { companyId, companyName },
    })
  );
}

export function readLiveDataFolderPrefs(): LiveDataFolderPrefs {
  if (typeof window === "undefined") return DEFAULT_LIVE_PREFS;
  try {
    const raw = localStorage.getItem(LIVE_DATA_PREFS_KEY);
    if (!raw) return DEFAULT_LIVE_PREFS;
    const p = JSON.parse(raw) as Partial<LiveDataFolderPrefs>;
    return {
      webEnabled: p.webEnabled === true,
      webFolderLabel: typeof p.webFolderLabel === "string" && p.webFolderLabel.trim() ? p.webFolderLabel.trim() : null,
      nativeFolderPath:
        typeof p.nativeFolderPath === "string" && p.nativeFolderPath.trim() ? p.nativeFolderPath.trim() : null,
      mirrorSaltBase64:
        typeof p.mirrorSaltBase64 === "string" && p.mirrorSaltBase64.trim() ? p.mirrorSaltBase64.trim() : null,
    };
  } catch {
    return DEFAULT_LIVE_PREFS;
  }
}

export function saveLiveDataFolderPrefs(next: LiveDataFolderPrefs): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LIVE_DATA_PREFS_KEY, JSON.stringify(next));
}

/** Salt missing ho to naya banao aur prefs me likho. */
export function ensureLiveDataMirrorSalt(): string {
  const p = readLiveDataFolderPrefs();
  if (p.mirrorSaltBase64 && p.mirrorSaltBase64.length >= 16) return p.mirrorSaltBase64;
  const salt = generateEncryptServerBackupSaltBase64();
  saveLiveDataFolderPrefs({ ...p, mirrorSaltBase64: salt });
  return salt;
}

function mirrorFileName(companyId: string): string {
  return `${LIVE_MIRROR_FILE_PREFIX}${encodeURIComponent(String(companyId || "").trim())}${LIVE_MIRROR_FILE_SUFFIX}`;
}

/** Explorer-safe folder name: readable name + stable id (rename company = naya folder; purana prune se hata sakte ho). */
export function sanitizeCompanyDeltaFolderNamePart(raw: string): string {
  return (
    String(raw || "")
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 80) || "company"
  );
}

/** `pocket-ledger/companies/` ke andar ek company ka directory naam. */
export function companyDeltaFolderSegment(row: Pick<LocalCompanyDoc, "id" | "name">): string {
  const namePart = sanitizeCompanyDeltaFolderNamePart(String(row.name ?? "company"));
  const idPart = String(row.id ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown";
  return `${namePart}__${idPart}`;
}

/** Native SAF / docs: `pocket-ledger/companies/.../file.json` */
export function liveMirrorRelativeFilePath(row: Pick<LocalCompanyDoc, "id" | "name">): string {
  return `${POCKET_LEDGER_MIRROR_DIR}/${COMPANIES_DIR_SEGMENT}/${companyDeltaFolderSegment(row)}/${mirrorFileName(row.id)}`;
}

async function blobToBase64Raw(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      resolve(s.includes(",") ? s.split(",")[1]! : s);
    };
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

async function buildMirrorPayload(companyId: string): Promise<Record<string, unknown> | null> {
  const company = await getLocalCompanyById(companyId);
  if (!company) return null;
  const { getBrowserDbForCompanyId } = await import("@/lib/localSqlite");
  const db = await getBrowserDbForCompanyId(companyId);
  if (!db) return null;
  if (!company) return null;
  const collections: Record<string, unknown[]> = {};
  for (const col of COLLECTIONS_TO_MIRROR) {
    try {
      const docs = await listCompanyDocsFromBrowserDb(companyId, col, { forBackupMerge: true });
      collections[col] = Array.isArray(docs) ? docs : [];
    } catch {
      collections[col] = [];
    }
  }
  // Include pending offline queue so selected-location mirror carries unsynced operations too.
  const outboxRows = db
    .prepare(
      `SELECT outbox_id, company_id, collection_name, doc_id, op, payload, created_at
       FROM sync_outbox
       WHERE company_id = ?
       ORDER BY created_at ASC`
    )
    .all(companyId) as Array<Record<string, unknown>>;
  return {
    version: 2,
    companyId,
    exportedAt: Date.now(),
    company,
    collections,
    syncOutbox: Array.isArray(outboxRows) ? outboxRows : [],
  };
}

type DirHandleWithPickerPermission = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
};

async function ensureDirWritePermission(dirHandle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = dirHandle as DirHandleWithPickerPermission;
  if (typeof h.queryPermission !== "function") return true;
  let p = await h.queryPermission({ mode: "readwrite" });
  if (p === "granted") return true;
  // Background debounced sync: sirf query — requestPermission user gesture ke bina NotAllowedError deta hai.
  if (!mirrorSyncAllowPermissionRequest) return false;
  if (typeof h.requestPermission === "function") {
    try {
      p = await h.requestPermission({ mode: "readwrite" });
    } catch (e) {
      if (isFileSystemAccessDeniedError(e)) return false;
      throw e;
    }
  }
  return p === "granted";
}

export async function getOrCreatePocketLedgerDir(parent: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  try {
    return await parent.getDirectoryHandle(POCKET_LEDGER_MIRROR_DIR, { create: true });
  } catch (e) {
    if (isFileSystemAccessDeniedError(e)) {
      throw new Error("Folder access denied — use Sync now or re-select the data folder.");
    }
    throw e;
  }
}

/** Open `pocket-ledger` without creating — `null` if user removed the folder or browser blocked access. */
export async function tryOpenPocketLedgerDirOnly(
  parent: FileSystemDirectoryHandle
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await parent.getDirectoryHandle(POCKET_LEDGER_MIRROR_DIR, { create: false });
  } catch (e) {
    if (isNotFoundError(e) || isFileSystemAccessDeniedError(e)) return null;
    throw e;
  }
}

async function getOrCreateCompaniesDir(plDir: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  try {
    return await plDir.getDirectoryHandle(COMPANIES_DIR_SEGMENT, { create: true });
  } catch (e) {
    if (isFileSystemAccessDeniedError(e)) {
      throw new Error("Folder access denied — use Sync now or re-select the data folder.");
    }
    throw e;
  }
}

/**
 * Web: company mirror folder pehle se bana tha lekin andar wala `.json` gum — user ne hard-delete kiya.
 * Pehli baar sync (folder hi nahi) par `false` taaki `writeMirrorWeb` create:true se naya file bana sake.
 */
async function companyDeltaJsonMissingButCompanyDirExisted(
  plDir: FileSystemDirectoryHandle,
  row: LocalCompanyDoc
): Promise<boolean> {
  try {
    const companiesDir = await plDir.getDirectoryHandle(COMPANIES_DIR_SEGMENT, { create: false });
    const seg = companyDeltaFolderSegment(row);
    let companyDir: FileSystemDirectoryHandle;
    try {
      companyDir = await companiesDir.getDirectoryHandle(seg, { create: false });
    } catch (e) {
      if (isNotFoundError(e)) return false;
      if (isFileSystemAccessDeniedError(e)) return false;
      throw e;
    }
    const name = mirrorFileName(row.id);
    try {
      await companyDir.getFileHandle(name, { create: false });
      return false;
    } catch (e) {
      if (isNotFoundError(e)) return true;
      if (isFileSystemAccessDeniedError(e)) return false;
      throw e;
    }
  } catch (e) {
    if (isNotFoundError(e)) return false;
    if (isFileSystemAccessDeniedError(e)) return false;
    throw e;
  }
}

async function writeMirrorWeb(plDir: FileSystemDirectoryHandle, row: LocalCompanyDoc, fileText: string): Promise<void> {
  const ok = await ensureDirWritePermission(plDir);
  if (!ok) return;
  try {
    const companiesDir = await getOrCreateCompaniesDir(plDir);
    const seg = companyDeltaFolderSegment(row);
    const companyDir = await companiesDir.getDirectoryHandle(seg, { create: true });
    const name = mirrorFileName(row.id);
    const fileHandle = await companyDir.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(fileText);
    await writable.close();
    await removeDuplicateCompanyDeltaDirs(companiesDir, row.id, seg);
  } catch (e) {
    if (isFileSystemAccessDeniedError(e)) return;
    throw e;
  }
}

async function removeDuplicateCompanyDeltaDirs(
  companiesDir: FileSystemDirectoryHandle,
  companyId: string,
  keepSegment: string
): Promise<void> {
  const targetFile = mirrorFileName(companyId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyCo = companiesDir as any;
  if (typeof anyCo.entries !== "function") return;
  for await (const [dirName, handle] of anyCo.entries() as AsyncIterable<[string, FileSystemDirectoryHandle]>) {
    if (handle.kind !== "directory" || dirName === keepSegment) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySub = handle as any;
    if (typeof anySub.entries !== "function") continue;
    for await (const [fn] of anySub.entries() as AsyncIterable<[string, FileSystemFileHandle]>) {
      if (fn === targetFile) {
        try {
          await companiesDir.removeEntry(dirName, { recursive: true });
        } catch {
          /* ignore */
        }
        break;
      }
    }
  }
}

/** Purana layout: `pocket-ledger/pl-local-company-*.json` root par — nayi tree me move. */
async function migrateLegacyFlatMirrorFilesWeb(plDir: FileSystemDirectoryHandle): Promise<void> {
  const ok = await ensureDirWritePermission(plDir);
  if (!ok) return;
  const rows = await listLocalCompanies({ includeDeleted: false });
  const byId = new Map(rows.map((r) => [r.id, r]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyPl = plDir as any;
  if (typeof anyPl.entries !== "function") return;
  for await (const [name, handle] of anyPl.entries() as AsyncIterable<[string, FileSystemFileHandle]>) {
    if (handle.kind !== "file") continue;
    if (!name.startsWith(LIVE_MIRROR_FILE_PREFIX) || !name.endsWith(LIVE_MIRROR_FILE_SUFFIX)) continue;
    let id: string;
    try {
      id = decodeURIComponent(name.slice(LIVE_MIRROR_FILE_PREFIX.length, -LIVE_MIRROR_FILE_SUFFIX.length));
    } catch {
      continue;
    }
    const row = byId.get(id);
    if (!row || !companyStorageIsLocal(String(row.storageOption || "local"))) continue;
    try {
      const file = await handle.getFile();
      const text = await file.text();
      await writeMirrorWeb(plDir, row, text);
      await plDir.removeEntry(name);
    } catch {
      /* skip corrupt / locked */
    }
  }
}

async function deleteMirrorWebForCompany(plDir: FileSystemDirectoryHandle, row: LocalCompanyDoc): Promise<void> {
  const ok = await ensureDirWritePermission(plDir);
  if (!ok) return;
  try {
    const companiesDir = await plDir.getDirectoryHandle(COMPANIES_DIR_SEGMENT, { create: false });
    await companiesDir.removeEntry(companyDeltaFolderSegment(row), { recursive: true });
    return;
  } catch {
    /* fall through: legacy flat file */
  }
  try {
    await plDir.removeEntry(mirrorFileName(row.id));
  } catch {
    /* missing */
  }
}

/** Company DB se hat chuki ho to bhi sahi folder hatao — tree me id se scan. */
async function deleteMirrorWebByCompanyId(plDir: FileSystemDirectoryHandle, companyId: string): Promise<void> {
  const cid = String(companyId || "").trim();
  if (!cid) return;
  const row = await getLocalCompanyById(cid, { includeDeleted: true });
  if (row) {
    await deleteMirrorWebForCompany(plDir, row);
    return;
  }
  const ok = await ensureDirWritePermission(plDir);
  if (!ok) return;
  const targetFile = mirrorFileName(cid);
  try {
    const companiesDir = await plDir.getDirectoryHandle(COMPANIES_DIR_SEGMENT, { create: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyCo = companiesDir as any;
    if (typeof anyCo.entries === "function") {
      for await (const [dirName, handle] of anyCo.entries() as AsyncIterable<[string, FileSystemDirectoryHandle]>) {
        if (handle.kind !== "directory") continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anySub = handle as any;
        if (typeof anySub.entries !== "function") continue;
        for await (const [fn] of anySub.entries() as AsyncIterable<[string, FileSystemFileHandle]>) {
          if (fn === targetFile) {
            try {
              await companiesDir.removeEntry(dirName, { recursive: true });
            } catch {
              /* ignore */
            }
            return;
          }
        }
      }
    }
  } catch {
    /* no companies/ */
  }
  try {
    await plDir.removeEntry(targetFile);
  } catch {
    /* missing */
  }
}

async function pruneStaleFlatRootMirrorFiles(plDir: FileSystemDirectoryHandle, locals: Set<string>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDir = plDir as any;
  if (typeof anyDir.entries !== "function") return;
  for await (const [name, handle] of anyDir.entries() as AsyncIterable<[string, FileSystemFileHandle]>) {
    if (handle.kind !== "file") continue;
    if (!name.startsWith(LIVE_MIRROR_FILE_PREFIX) || !name.endsWith(LIVE_MIRROR_FILE_SUFFIX)) continue;
    let id: string;
    try {
      id = decodeURIComponent(name.slice(LIVE_MIRROR_FILE_PREFIX.length, -LIVE_MIRROR_FILE_SUFFIX.length));
    } catch {
      continue;
    }
    if (!locals.has(id)) {
      try {
        await plDir.removeEntry(name);
      } catch {
        /* ignore */
      }
    }
  }
}

async function pruneStaleMirrorsWeb(plDir: FileSystemDirectoryHandle): Promise<void> {
  const ok = await ensureDirWritePermission(plDir);
  if (!ok) return;
  const locals = new Set<string>();
  const rows = await listLocalCompanies({ includeDeleted: false });
  for (const c of rows) {
    if (companyStorageIsLocal(String(c.storageOption || "local"))) {
      locals.add(c.id);
    }
  }
  try {
    const companiesDir = await plDir.getDirectoryHandle(COMPANIES_DIR_SEGMENT, { create: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyCo = companiesDir as any;
    if (typeof anyCo.entries === "function") {
      for await (const [dirName, handle] of anyCo.entries() as AsyncIterable<[string, FileSystemDirectoryHandle]>) {
        if (handle.kind !== "directory") continue;
        let foundId: string | null = null;
        const companyDir = handle;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anySub = companyDir as any;
        if (typeof anySub.entries !== "function") continue;
        for await (const [fn, fh] of anySub.entries() as AsyncIterable<[string, FileSystemFileHandle]>) {
          if (fh.kind !== "file") continue;
          if (!fn.startsWith(LIVE_MIRROR_FILE_PREFIX) || !fn.endsWith(LIVE_MIRROR_FILE_SUFFIX)) continue;
          try {
            foundId = decodeURIComponent(fn.slice(LIVE_MIRROR_FILE_PREFIX.length, -LIVE_MIRROR_FILE_SUFFIX.length));
          } catch {
            foundId = null;
          }
          break;
        }
        if (foundId && !locals.has(foundId)) {
          try {
            await companiesDir.removeEntry(dirName, { recursive: true });
          } catch {
            /* ignore */
          }
        }
      }
    }
  } catch {
    /* companies/ missing — sirf flat prune */
  }
  await pruneStaleFlatRootMirrorFiles(plDir, locals);
}

async function writeMirrorNative(treeUri: string, row: LocalCompanyDoc, fileText: string): Promise<void> {
  const rel = liveMirrorRelativeFilePath(row);
  const base64 = await blobToBase64Raw(new Blob([fileText], { type: "application/json" }));
  if (treeUri.startsWith("content://")) {
    const { BackupSaf } = await import("@/lib/capacitorBackupSaf");
    await BackupSaf.writeToTreeUri({ treeUri, fileName: rel, data: base64 });
    return;
  }

  // Native absolute path fallback: FilePicker can return non-SAF paths on some devices/builds.
  const { Filesystem } = await import("@capacitor/filesystem");
  const basePath = String(treeUri || "").trim().replace(/[\\/]+$/, "");
  if (!basePath) throw new Error("No native folder path selected.");
  const fullPath = `${basePath}/${rel}`.replace(/\\/g, "/");
  await Filesystem.writeFile({
    path: fullPath,
    data: base64,
    recursive: true,
  });
}

async function sealPayloadForMirror(plainJson: string): Promise<string> {
  const phrase = await ensureLiveMirrorAutoPassphrase();
  const salt = readLiveDataFolderPrefs().mirrorSaltBase64 || ensureLiveDataMirrorSalt();
  return sealLiveMirrorJson(plainJson, phrase, salt);
}

export type LiveDataMirrorSyncOptions = {
  /** User click (Sync now / Save location) — folder permission request allowed. */
  userInitiated?: boolean;
};

export async function syncLocalCompanyDeltaToFolder(
  companyId: string,
  options?: LiveDataMirrorSyncOptions
): Promise<void> {
  return withMirrorSyncContext(options?.userInitiated === true, () => syncLocalCompanyDeltaToFolderInner(companyId));
}

async function syncLocalCompanyDeltaToFolderInner(companyId: string): Promise<void> {
  const prefs = readLiveDataFolderPrefs();
  if (!prefs.webEnabled && !prefs.nativeFolderPath) return;
  if (!isNativeRuntime() && prefs.webEnabled && mirrorFolderWriteBlocked) return;
  const row = await listLocalCompanies({ includeDeleted: false }).then((rows) => rows.find((r) => r.id === companyId));
  if (!row || !companyStorageIsLocal(String(row.storageOption || "local"))) return;
  const payload = await buildMirrorPayload(companyId);
  if (!payload) return;
  const plainJson = JSON.stringify(payload);
  const fileText = await sealPayloadForMirror(plainJson);

  if (!isNativeRuntime()) {
    const root = (await readWebLiveDataDirectoryHandle()) as FileSystemDirectoryHandle | null;
    if (!root) return;
    if (!(await ensureDirWritePermission(root))) return;
    const inner = await tryOpenPocketLedgerDirOnly(root);
    if (!inner) {
      await dispatchMirrorFolderMissingIfWeb(companyId);
      return;
    }
    await migrateLegacyFlatMirrorFilesWeb(inner);
    // Sirf tab roko jab pehle se company subfolder tha aur ab json nahi — full `pocket-ledger` delete jaisa hi prompt (resave / remove).
    if (await companyDeltaJsonMissingButCompanyDirExisted(inner, row)) {
      await dispatchMirrorFolderMissingIfWeb(companyId);
      return;
    }
    await writeMirrorWeb(inner, row, fileText);
    return;
  }

  const tree = String(prefs.nativeFolderPath || "").trim();
  if (!tree) return;
  await writeMirrorNative(tree, row, fileText);
}

export async function syncAllLocalCompanyDeltasToFolder(options?: LiveDataMirrorSyncOptions): Promise<void> {
  return withMirrorSyncContext(options?.userInitiated === true, () => syncAllLocalCompanyDeltasToFolderInner());
}

async function syncAllLocalCompanyDeltasToFolderInner(): Promise<void> {
  const prefs = readLiveDataFolderPrefs();
  if (!prefs.webEnabled && !prefs.nativeFolderPath) return;
  if (!isNativeRuntime() && prefs.webEnabled && mirrorFolderWriteBlocked) return;

  const rows = await listLocalCompanies({ includeDeleted: false });
  const localRows = rows.filter((c) => companyStorageIsLocal(String(c.storageOption || "local")));

  if (!isNativeRuntime()) {
    const root = (await readWebLiveDataDirectoryHandle()) as FileSystemDirectoryHandle | null;
    if (!root) return;
    if (!(await ensureDirWritePermission(root))) return;
    const inner = await tryOpenPocketLedgerDirOnly(root);
    if (!inner) {
      const first = localRows[0];
      if (first) await dispatchMirrorFolderMissingIfWeb(first.id);
      return;
    }
    await migrateLegacyFlatMirrorFilesWeb(inner);
    await pruneStaleMirrorsWeb(inner);
    for (const c of localRows) {
      await syncLocalCompanyDeltaToFolder(c.id).catch(() => undefined);
    }
    return;
  }

  const tree = String(prefs.nativeFolderPath || "").trim();
  if (!tree) return;
  for (const c of localRows) {
    await syncLocalCompanyDeltaToFolder(c.id).catch(() => undefined);
  }
}

export async function removeLocalCompanyDeltaFromFolder(companyId: string): Promise<void> {
  const cid = String(companyId || "").trim();
  if (!cid) return;

  if (!isNativeRuntime()) {
    const root = (await readWebLiveDataDirectoryHandle()) as FileSystemDirectoryHandle | null;
    if (!root) return;
    try {
      const inner = await root.getDirectoryHandle(POCKET_LEDGER_MIRROR_DIR, { create: false });
      await deleteMirrorWebByCompanyId(inner, cid);
    } catch {
      /* pocket-ledger missing */
    }
    return;
  }
}

export type RecreatePocketLedgerMirrorOptions = {
  /** Stale-handle recovery: picker se mila hua fresh root (IndexedDB me save ho chuka ho ideally). */
  webRootOverride?: FileSystemDirectoryHandle;
};

/** Recreate `pocket-ledger/` under the saved root and rewrite all local company mirrors. */
export async function recreatePocketLedgerMirrorFolderAndResync(
  options?: RecreatePocketLedgerMirrorOptions
): Promise<void> {
  clearMirrorFolderWriteBlock();
  const prefs = readLiveDataFolderPrefs();
  if (!prefs.webEnabled && !prefs.nativeFolderPath) return;
  if (!isNativeRuntime()) {
    const root =
      options?.webRootOverride ?? ((await readWebLiveDataDirectoryHandle()) as FileSystemDirectoryHandle | null);
    if (!root) throw new Error("No data folder selected.");
    try {
      await getOrCreatePocketLedgerDir(root);
    } catch (e) {
      // Disk se user folder hata chuka / rename — purana handle ab `NotFoundError` deta hai; IndexedDB handle hatao taaki UI dubara pick kara sake.
      if (e instanceof DOMException && e.name === "NotFoundError") {
        await clearWebLiveDataDirectoryHandle();
        throwStaleLiveDataFolderError();
      }
      throw e;
    }
  }
  await syncAllLocalCompanyDeltasToFolder();
}

export async function clearLiveDataFolderPrefsAndSession(): Promise<void> {
  await clearLiveMirrorAutoPassphrase();
  clearMirrorFolderWriteBlock();
}

let mirrorDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleLiveDataFolderMirrorAfterFlush(): void {
  const prefs = readLiveDataFolderPrefs();
  if (!prefs.webEnabled && !prefs.nativeFolderPath) return;
  if (mirrorDebounceTimer) clearTimeout(mirrorDebounceTimer);
  mirrorDebounceTimer = setTimeout(() => {
    mirrorDebounceTimer = null;
    // Background: permission request nahi — NotAllowedError uncaught mat aaye.
    void syncAllLocalCompanyDeltasToFolder().catch(() => undefined);
  }, 4000);
}
