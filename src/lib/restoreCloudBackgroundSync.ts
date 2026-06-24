"use client";

/**
 * Cloud restore: SQLite + reload (BackupRestore) → data upload (progress) → reload → attachments background.
 */

import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { COLLECTIONS_TO_BACKUP } from "@/lib/companyBackupCore";
import { getLocalCompanyById, upsertLocalCompany } from "@/lib/localCompanyStore";
import { forceUploadLocalCompanyToServer } from "@/lib/forceUploadLocalCompanyToServer";
import { bumpLocalCompanyRegistry } from "@/lib/applyStripePlanToLocalCompany";

const STORAGE_KEY = "pl_pending_restore_cloud_push_v1";
const PROGRESS_STORAGE_KEY = "pl_restore_cloud_push_progress_v1";
const UPLOAD_LEADER_KEY = "pl_restore_cloud_upload_leader_v1";
const TAB_ID_KEY = "pl_restore_tab_id";
const LEADER_STALE_MS = 14_000;

export const RESTORE_CLOUD_PUSH_PROGRESS_EVENT = "pl-restore-cloud-push-progress";
export const RESTORE_CLOUD_VOUCHERS_REFRESH_EVENT = "pl-restore-cloud-vouchers-refresh";
export const RESTORE_CLOUD_PUSH_JOB_EVENT = "pl-restore-cloud-push-job";

export type RestoreCloudPushPhase = "data" | "files" | "sync";

export type PendingRestoreCloudPush = {
  companyId: string;
  ownerUid: string;
  ownerEmail: string;
  companyName: string;
  replaceCurrent: boolean;
  createdAtMs: number;
  phase?: RestoreCloudPushPhase;
  dataUploaded?: boolean;
  /** Files phase: total attachment count (persisted — new tab resumes same %). */
  filesTotal?: number;
  /** Files already uploaded to cloud (persisted across tabs / refresh). */
  filesUploaded?: number;
};

export type RestoreCloudPushProgressState = {
  companyId: string;
  companyName: string;
  phase: RestoreCloudPushPhase;
  phaseLabel: string;
  done: number;
  total: number;
  percent: number;
  status: "running" | "complete" | "failed";
  message?: string;
};

function writeProgress(state: RestoreCloudPushProgressState | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!state) window.localStorage.removeItem(PROGRESS_STORAGE_KEY);
    else window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(RESTORE_CLOUD_PUSH_PROGRESS_EVENT, { detail: state }));
  } catch {
    /* quota */
  }
}

export function getRestoreCloudPushProgress(): RestoreCloudPushProgressState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RestoreCloudPushProgressState;
  } catch {
    return null;
  }
}

export function subscribeRestoreCloudPushProgress(
  listener: (state: RestoreCloudPushProgressState | null) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvent = (e: Event) => {
    listener((e as CustomEvent<RestoreCloudPushProgressState | null>).detail ?? null);
  };
  window.addEventListener(RESTORE_CLOUD_PUSH_PROGRESS_EVENT, onEvent);
  listener(getRestoreCloudPushProgress());
  return () => window.removeEventListener(RESTORE_CLOUD_PUSH_PROGRESS_EVENT, onEvent);
}

export function isCompanyPendingRestoreCloudPush(companyId: string): boolean {
  const job = readPendingRestoreCloudPush();
  return !!job && job.companyId === companyId;
}

/** Upload chal raha ho ya pending files job ho. */
export function isRestoreCloudUploadLocked(): boolean {
  const prog = getRestoreCloudPushProgress();
  if (prog?.status === "running") return true;
  const job = readPendingRestoreCloudPush();
  if (!job) return false;
  const phase = job.phase ?? "data";
  return phase === "files" || phase === "sync";
}

function getRestoreTabId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = window.sessionStorage.getItem(TAB_ID_KEY);
  if (!id) {
    id = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    window.sessionStorage.setItem(TAB_ID_KEY, id);
  }
  return id;
}

type UploadLeaderRow = { tabId: string; companyId: string; heartbeatMs: number };

function readUploadLeader(): UploadLeaderRow | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(UPLOAD_LEADER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UploadLeaderRow;
  } catch {
    return null;
  }
}

/** Sirf ek tab upload chalaye — doosra tab progress dekhe, dubara start na kare. */
export function tryAcquireRestoreCloudUploadLeader(companyId: string): boolean {
  if (typeof window === "undefined") return false;
  const cid = String(companyId || "").trim();
  if (!cid) return false;
  const tabId = getRestoreTabId();
  const now = Date.now();
  try {
    const cur = readUploadLeader();
    if (
      cur &&
      cur.companyId === cid &&
      cur.tabId !== tabId &&
      now - cur.heartbeatMs < LEADER_STALE_MS
    ) {
      return false;
    }
    window.localStorage.setItem(
      UPLOAD_LEADER_KEY,
      JSON.stringify({ tabId, companyId: cid, heartbeatMs: now } satisfies UploadLeaderRow)
    );
    return true;
  } catch {
    return true;
  }
}

export function heartbeatRestoreCloudUploadLeader(companyId: string): void {
  if (typeof window === "undefined") return;
  const cid = String(companyId || "").trim();
  if (!cid) return;
  const tabId = getRestoreTabId();
  try {
    window.localStorage.setItem(
      UPLOAD_LEADER_KEY,
      JSON.stringify({ tabId, companyId: cid, heartbeatMs: Date.now() } satisfies UploadLeaderRow)
    );
  } catch {
    /* ignore */
  }
}

export function releaseRestoreCloudUploadLeader(companyId: string): void {
  if (typeof window === "undefined") return;
  const cid = String(companyId || "").trim();
  const tabId = getRestoreTabId();
  try {
    const cur = readUploadLeader();
    if (cur?.tabId === tabId && cur.companyId === cid) {
      window.localStorage.removeItem(UPLOAD_LEADER_KEY);
    }
  } catch {
    /* ignore */
  }
}

function dispatchRestoreCloudPushJob(job: PendingRestoreCloudPush | null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(RESTORE_CLOUD_PUSH_JOB_EVENT, { detail: job }));
}

export function queuePendingRestoreCloudPush(
  job: Omit<PendingRestoreCloudPush, "createdAtMs" | "phase" | "dataUploaded">
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PendingRestoreCloudPush = { ...job, phase: "data", createdAtMs: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    dispatchRestoreCloudPushJob(payload);
  } catch {
    /* quota */
  }
}

/** Data pehle upload ho chuka — sirf attachments background me. */
export function queuePendingRestoreCloudPushFilesOnly(
  job: Omit<PendingRestoreCloudPush, "createdAtMs" | "phase" | "dataUploaded"> & {
    filesTotal?: number;
    filesUploaded?: number;
  }
): void {
  if (typeof window === "undefined") return;
  try {
    const existing = readPendingRestoreCloudPush();
    const payload: PendingRestoreCloudPush = {
      ...job,
      phase: "files",
      dataUploaded: true,
      createdAtMs: existing?.createdAtMs ?? Date.now(),
      filesTotal: job.filesTotal ?? existing?.filesTotal,
      filesUploaded: job.filesUploaded ?? existing?.filesUploaded ?? 0,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    dispatchRestoreCloudPushJob(payload);
  } catch {
    /* quota */
  }
}

export function readPendingRestoreCloudPush(): PendingRestoreCloudPush | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingRestoreCloudPush;
    if (!parsed?.companyId || !parsed?.ownerUid) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistPendingRestoreCloudPush(job: PendingRestoreCloudPush): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(job));
    dispatchRestoreCloudPushJob(job);
  } catch {
    /* quota */
  }
}

export function clearPendingRestoreCloudPush(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearRestoreCloudPushProgress(): void {
  writeProgress(null);
}

async function clearFirestoreCompanySubcollectionsForRestore(fsCompanyId: string): Promise<void> {
  const cid = String(fsCompanyId || "").trim();
  if (!cid) return;
  for (const colName of COLLECTIONS_TO_BACKUP) {
    const colRef = collection(firestore, `companies/${cid}/${colName}`);
    for (;;) {
      const snap = await getDocs(query(colRef, limit(400)));
      if (snap.empty) break;
      const batch = writeBatch(firestore);
      for (const d of snap.docs) batch.delete(d.ref);
      await batch.commit();
    }
  }
}

async function ensureFirestoreCompanyRoot(
  companyId: string,
  ownerUid: string,
  ownerEmail: string,
  companyName: string
): Promise<void> {
  const local = await getLocalCompanyById(companyId, { includeDeleted: true });
  const name = companyName.trim() || String((local as { name?: string })?.name || "").trim() || "Company";
  await setDoc(
    doc(firestore, "companies", companyId),
    {
      id: companyId,
      name,
      ownerId: ownerUid,
      ownerEmail: ownerEmail || "",
      authoritativeCompanyId: companyId,
      storageOption: "firebase",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function markLocalCompanyCloudSynced(companyId: string): Promise<void> {
  const local = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!local) return;
  await upsertLocalCompany({
    ...(local as Parameters<typeof upsertLocalCompany>[0]),
    storageOption: "firebase",
    syncPolicy: "online",
    syncedFromCloud: true,
    authoritativeCompanyId: companyId,
    updatedAt: Date.now(),
  });
  try {
    bumpLocalCompanyRegistry();
  } catch {
    /* ignore */
  }
}

function progressFromUpload(
  job: PendingRestoreCloudPush,
  phase: RestoreCloudPushPhase,
  phaseLabel: string,
  done: number,
  total: number,
  status: RestoreCloudPushProgressState["status"],
  message?: string
): RestoreCloudPushProgressState {
  const safeTotal = Math.max(1, total);
  let percent: number;
  if (status === "complete" && done >= safeTotal) {
    percent = 100;
  } else if (phase === "files" && done < safeTotal) {
    percent = Math.min(99, Math.floor((done / safeTotal) * 100));
  } else {
    percent = Math.min(100, Math.round((done / safeTotal) * 100));
  }
  return {
    companyId: job.companyId,
    companyName: job.companyName,
    phase,
    phaseLabel,
    done,
    total: safeTotal,
    percent,
    status,
    message,
  };
}

/** Restore ke dauran turant — SQLite complete hone ke baad, reload se pehle. */
export async function uploadRestoreDataToCloudImmediately(
  job: Omit<PendingRestoreCloudPush, "createdAtMs" | "phase" | "dataUploaded">
): Promise<{ ok: boolean; message?: string; docsPushed?: number }> {
  const fullJob: PendingRestoreCloudPush = {
    ...job,
    phase: "data",
    createdAtMs: Date.now(),
  };
  const result = await runPendingRestoreCloudPushDataPhase(fullJob, { skipFilesQueue: true });
  return {
    ok: result.ok,
    message: result.message,
    docsPushed: result.docsPushed,
  };
}

/** Phase 1 — ledger docs to Firestore. */
export async function runPendingRestoreCloudPushDataPhase(
  job: PendingRestoreCloudPush,
  options?: { skipFilesQueue?: boolean }
): Promise<{ ok: boolean; message?: string; reload?: boolean; docsPushed?: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    writeProgress(
      progressFromUpload(job, "data", "Uploading company data", 0, 1, "failed", "Offline — retry when online.")
    );
    return { ok: false, message: "Offline — cloud upload will retry when you are online." };
  }

  const companyId = String(job.companyId || "").trim();
  if (!companyId) return { ok: false, message: "Missing company id." };

  writeProgress(progressFromUpload(job, "data", "Uploading company data", 0, 1, "running"));

  try {
    if (job.replaceCurrent) {
      await clearFirestoreCompanySubcollectionsForRestore(companyId);
    }
    await ensureFirestoreCompanyRoot(companyId, job.ownerUid, job.ownerEmail, job.companyName);

    const result = await forceUploadLocalCompanyToServer(companyId, {
      mode: "docsOnly",
      onProgress: (p) => {
        writeProgress(
          progressFromUpload(job, "data", p.phase, p.done, p.total, "running", p.detail)
        );
      },
    });

    if (!result.ok && result.docsPushed === 0 && result.errors.length > 0) {
      const msg = result.message || result.errors[0] || "Cloud data upload failed.";
      writeProgress(progressFromUpload(job, "data", "Uploading company data", 0, 1, "failed", msg));
      return { ok: false, message: msg };
    }

    await markLocalCompanyCloudSynced(companyId);

    writeProgress(
      progressFromUpload(
        job,
        "data",
        "Company data uploaded",
        1,
        1,
        options?.skipFilesQueue ? "running" : "complete",
        options?.skipFilesQueue ? "Starting attachment upload…" : undefined
      )
    );

    if (!options?.skipFilesQueue) {
      persistPendingRestoreCloudPush({ ...job, phase: "files", dataUploaded: true });
      return {
        ok: true,
        reload: true,
        docsPushed: result.docsPushed,
        message: `Data uploaded (${result.docsPushed} records). Reloading for attachment sync…`,
      };
    }

    return {
      ok: true,
      docsPushed: result.docsPushed,
      message: `Data uploaded (${result.docsPushed} records).`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeProgress(progressFromUpload(job, "data", "Uploading company data", 0, 1, "failed", msg));
    return { ok: false, message: msg };
  }
}

/** Files phase queue + progress seed — caller browse kare, upload background me. */
export async function beginRestoreCloudFilesUpload(
  job: Omit<PendingRestoreCloudPush, "createdAtMs" | "phase" | "dataUploaded" | "filesTotal" | "filesUploaded">
): Promise<{ filesTotal: number }> {
  const companyId = String(job.companyId || "").trim();
  const { countPendingFilesForCompany } = await import("@/lib/localPendingFiles");
  const pendingCount = companyId ? await countPendingFilesForCompany(companyId) : 0;
  const existing = readPendingRestoreCloudPush();
  const filesTotal = Math.max(1, existing?.filesTotal ?? pendingCount);
  const filesUploaded = Math.max(0, existing?.filesUploaded ?? filesTotal - pendingCount);
  const fullJob: PendingRestoreCloudPush = {
    ...job,
    phase: "files",
    dataUploaded: true,
    createdAtMs: existing?.createdAtMs ?? Date.now(),
    filesTotal,
    filesUploaded,
  };
  persistPendingRestoreCloudPush(fullJob);
  writeProgress(
    progressFromUpload(
      fullJob,
      "files",
      pendingCount > 0 ? "Uploading attachments" : "No attachments to upload",
      filesUploaded,
      filesTotal,
      pendingCount > 0 ? "running" : "complete"
    )
  );
  return { filesTotal };
}

/** Phase 2 — attachments; resume from persisted filesUploaded / filesTotal. */
export async function runPendingRestoreCloudPushFilesPhase(
  job: PendingRestoreCloudPush
): Promise<{ ok: boolean; message?: string; reload?: boolean; needsLocalSync?: boolean; filesUploaded?: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const filesUploaded = Math.max(0, job.filesUploaded ?? 0);
    const filesTotal = Math.max(1, job.filesTotal ?? 1);
    writeProgress(
      progressFromUpload(
        job,
        "files",
        "Uploading attachments",
        filesUploaded,
        filesTotal,
        "failed",
        "Offline — retry when online."
      )
    );
    return { ok: false, message: "Offline — attachment upload will retry when you are online." };
  }

  const companyId = String(job.companyId || "").trim();
  if (!companyId) return { ok: false, message: "Missing company id." };

  const { countPendingFilesForCompany } = await import("@/lib/localPendingFiles");
  const pendingCount = await countPendingFilesForCompany(companyId);

  let filesTotal = Math.max(1, job.filesTotal ?? 0);
  let filesUploaded = Math.max(0, job.filesUploaded ?? 0);

  if (!job.filesTotal || job.filesTotal < 1) {
    filesTotal = Math.max(1, pendingCount + filesUploaded);
  } else if (pendingCount > 0) {
    // Resume: baseline = already uploaded count
    filesUploaded = Math.max(filesUploaded, filesTotal - pendingCount);
  }

  const workingJob: PendingRestoreCloudPush = { ...job, filesTotal, filesUploaded };
  persistPendingRestoreCloudPush(workingJob);

  if (pendingCount === 0) {
    clearPendingRestoreCloudPush();
    writeProgress(
      progressFromUpload(
        workingJob,
        "sync",
        "Syncing local cache",
        0,
        1,
        "running",
        "No files in upload queue — refreshing vouchers from cloud…"
      )
    );
    return { ok: true, reload: false, needsLocalSync: true, filesUploaded: filesUploaded, message: "Cloud restore complete (no attachment files)." };
  }

  writeProgress(
    progressFromUpload(
      workingJob,
      "files",
      "Uploading attachments",
      filesUploaded,
      filesTotal,
      "running"
    )
  );

  try {
    const result = await forceUploadLocalCompanyToServer(companyId, {
      mode: "filesOnly",
      progressBaseline: filesUploaded,
      progressTotal: filesTotal,
      onProgress: (p) => {
        const cumulativeDone = Math.min(filesTotal, p.done);
        const mergedJob = { ...workingJob, filesUploaded: cumulativeDone, filesTotal };
        persistPendingRestoreCloudPush(mergedJob);
        writeProgress(
          progressFromUpload(mergedJob, "files", p.phase, cumulativeDone, filesTotal, "running", p.detail)
        );
      },
    });

    const finalUploaded = Math.min(filesTotal, filesUploaded + result.filesSynced);

    if (!result.ok && result.filesSynced === 0 && result.errors.length > 0) {
      const msg = result.message || result.errors[0] || "Attachment upload failed.";
      writeProgress(
        progressFromUpload(workingJob, "files", "Uploading attachments", filesUploaded, filesTotal, "failed", msg)
      );
      return { ok: false, message: msg };
    }

    const remaining = await countPendingFilesForCompany(companyId);
    if (remaining > 0 && result.filesSynced === 0) {
      const msg = result.errors[0] || "Some attachments could not upload — will retry.";
      writeProgress(
        progressFromUpload(
          workingJob,
          "files",
          "Uploading attachments",
          finalUploaded,
          filesTotal,
          "failed",
          msg
        )
      );
      persistPendingRestoreCloudPush({ ...workingJob, filesUploaded: finalUploaded });
      return { ok: false, message: msg };
    }

    clearPendingRestoreCloudPush();
    writeProgress(
      progressFromUpload(
        workingJob,
        "files",
        "Attachments uploaded",
        filesTotal,
        filesTotal,
        "running",
        `${finalUploaded} file(s) on server — syncing local cache…`
      )
    );

    return {
      ok: true,
      reload: false,
      needsLocalSync: true,
      filesUploaded: finalUploaded,
      message:
        result.errors.length > 0
          ? `Attachments uploaded with ${result.errors.length} warning(s).`
          : result.filesSynced > 0
            ? `Cloud restore complete (${finalUploaded} files).`
            : "Cloud restore complete.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeProgress(
      progressFromUpload(workingJob, "files", "Uploading attachments", filesUploaded, filesTotal, "failed", msg)
    );
    return { ok: false, message: msg };
  }
}

/** Phase 3 — Firestore → SQLite pull + UI refresh (files upload ke turant baad). */
export async function runRestoreCloudLocalSyncPhase(
  job: PendingRestoreCloudPush,
  opts?: { filesUploaded?: number }
): Promise<{ ok: boolean; message?: string }> {
  const companyId = String(job.companyId || "").trim();
  if (!companyId) return { ok: false, message: "Missing company id." };

  const { pullAllCompanySubcollectionsFromFirestoreToLocalDb, COMPANY_LOCAL_MIRROR_SUBCOLLECTIONS } =
    await import("@/lib/firestoreToLocalCompanyPull");
  const { flushBrowserDbToIndexedDB } = await import("@/lib/localSqlite");
  const { notifyBrowserDbCollectionUpdated } = await import("@/lib/localCompanyDocMirror");

  const total = Math.max(1, COMPANY_LOCAL_MIRROR_SUBCOLLECTIONS.length);
  let completed = 0;
  const uploaded = opts?.filesUploaded ?? job.filesUploaded ?? 0;

  writeProgress(
    progressFromUpload(job, "sync", "Syncing local cache", 0, total, "running", "Downloading vouchers from cloud…")
  );

  try {
    const localRow = await getLocalCompanyById(companyId, { includeDeleted: true });
    await pullAllCompanySubcollectionsFromFirestoreToLocalDb(
      companyId,
      companyId,
      (localRow as import("@/hooks/useCompany").Company) ?? null,
      {
        onSubcollectionDone: ({ path, completed: c, total: t }) => {
          completed = c;
          writeProgress(
            progressFromUpload(
              job,
              "sync",
              "Syncing local cache",
              c,
              t,
              "running",
              `Synced ${path.replace(/_/g, " ")} (${c}/${t})…`
            )
          );
        },
      }
    );
    await flushBrowserDbToIndexedDB();
    notifyBrowserDbCollectionUpdated(companyId, "vouchers");
    bumpLocalCompanyRegistry();
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(RESTORE_CLOUD_VOUCHERS_REFRESH_EVENT, { detail: { companyId } })
      );
    }

    clearPendingRestoreCloudPush();
    const doneMsg =
      uploaded > 0
        ? `${uploaded} file(s) uploaded — ledger refreshed.`
        : "Local cache refreshed from cloud.";
    writeProgress(
      progressFromUpload(job, "sync", "Cloud restore complete", total, total, "complete", doneMsg)
    );
    return { ok: true, message: doneMsg };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeProgress(
      progressFromUpload(job, "sync", "Syncing local cache", completed, total, "failed", msg)
    );
    return { ok: false, message: msg };
  }
}

/** Legacy single-shot entry — prefer phased runners from PendingRestoreCloudPushManager. */
export async function runPendingRestoreCloudPush(
  job: PendingRestoreCloudPush
): Promise<{ ok: boolean; message?: string }> {
  const phase = job.phase ?? "data";
  if (phase === "files") return runPendingRestoreCloudPushFilesPhase(job);
  const data = await runPendingRestoreCloudPushDataPhase(job);
  if (data.ok && data.reload) {
    window.location.reload();
    return { ok: true, message: data.message };
  }
  return data;
}
