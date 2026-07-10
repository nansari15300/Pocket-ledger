"use client";

/**
 * Client → `sync_outbox` row (`client_write_id`, `nonce`, `payload_hash`) → `flushVoucherOutbox` →
 * Firestore `runTransaction`: first duplicate check on `companies/{fs}/_pl_ledger_idem/{client_write_id}`,
 * then write idem doc + target subcollection doc together — same `payload_hash` is not applied twice.
 */

import {
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
  enableNetwork,
} from "firebase/firestore";
import { runTransaction } from "@/lib/writeGateway/firestoreMutationsInternal";
import {
  firestore,
  firestoreNetworkDisabledByApi,
  queueFirestoreNetworkOp,
  markFirestoreNetworkDisabledByApi,
  settleAfterFirestoreNetworkEnabled,
} from "@/lib/firebase";
import { getBrowserDb } from "@/lib/localSqlite";
import { isLocalOnlyMode } from "@/lib/localMode";
import {
  apkEmbeddedSqliteFirstWritesPreferred,
  isClientNavigatorOffline,
  shouldAutoFlushOutboxAfterEnqueue,
} from "@/lib/apkOnlineFirestoreWritePolicy";
import { mirrorCompanyDocToBrowserDb, getCompanyDocFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { getLocalCompanyById, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import { coerceVoucherDocumentDate } from "@/lib/voucherDateNormalize";
import { PL_CLIENT_OFFLINE_FIRST_PERSIST_MS } from "@/lib/localMirrorServerMeta";
import {
  PL_ENCRYPTED_IV_FIELD,
  PL_ENCRYPTED_PAYLOAD_FIELD,
  PL_ENCRYPTED_V1_FIELD,
  decryptServerBackupPayloadJson,
  encryptServerBackupPayloadJson,
  getBackupEncryptionPassphraseFromSession,
} from "@/lib/serverBackupEncryption";
import { normalizeFileUrlsField } from "@/lib/voucherAttachmentNormalize";
import { isDeviceLocalCompany } from "@/lib/companyStorageKind";
import { mergeVoucherFileUrlsForEditDialog } from "@/lib/resolveVoucherAttachmentRemoteUrl";
import { isLocalFileRef } from "@/lib/localPendingFiles";
import {
  hydrateVoucherLocalAttachmentsForServer,
  hydratePendingLocalFileRefsDeep,
} from "@/lib/hydrateVoucherLocalAttachmentsForServer";
import { isCompanyNotFoundError } from "@/lib/companyUpdateGuard";
import {
  canReconcileLocalDocViaFirebase,
  readLocalFirebaseReconcileConfig,
  stripAttachmentFieldsForInvitedLedgerReconcile,
} from "@/lib/localFirebaseReconcile";

/** REST `Commit` pe idem create race → `already-exists`; outbox duplicate-cleanup pehchan ke liye. */
function isFirestoreAlreadyExistsError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const code = String((e as { code?: string }).code || "");
  return code === "already-exists" || code === "already_exists";
}

/**
 * Encrypted flush: merge server doc + outbox delta on update (partial outbox can become full ciphertext).
 * When merging from plaintext server docs, strip `plEncrypted*` fields before mixing.
 */
async function mergeForEncryptedFlush(
  fsCompanyId: string,
  collectionName: string,
  docId: string,
  op: string,
  docFields: Record<string, unknown>,
  localCompanyId: string,
  reg: LocalCompanyDoc
): Promise<Record<string, unknown>> {
  if (op === "create") return { ...docFields };
  const ref = doc(firestore, `companies/${fsCompanyId}/${collectionName}`, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ...docFields };
  const existing = snap.data() as Record<string, unknown>;
  if (existing[PL_ENCRYPTED_V1_FIELD] === true) {
    const phrase = getBackupEncryptionPassphraseFromSession(localCompanyId);
    const salt = String((reg as Record<string, unknown>).encryptServerBackupSalt ?? "");
    if (!phrase || !salt) throw new Error("mergeForEncryptedFlush: missing session key or salt — log in with company username/password");
    const iv = String(existing[PL_ENCRYPTED_IV_FIELD] ?? "");
    const payload = String(existing[PL_ENCRYPTED_PAYLOAD_FIELD] ?? "");
    const json = await decryptServerBackupPayloadJson(iv, payload, phrase, salt);
    const prev = outboxJsonParse(json);
    return { ...prev, ...docFields };
  }
  const {
    [PL_ENCRYPTED_V1_FIELD]: _e,
    [PL_ENCRYPTED_IV_FIELD]: _i,
    [PL_ENCRYPTED_PAYLOAD_FIELD]: _p,
    ...rest
  } = existing as Record<string, unknown>;
  return { ...rest, ...docFields };
}

/** Treat as offline for queueing when the network/backend is down (not permission errors). */
export function isLikelyOfflineFirestoreError(err: unknown): boolean {
  if (err == null) return false;
  const any = err as { code?: string; message?: string };
  const code = any.code ? String(any.code) : "";
  const msg = any.message ? String(any.message).toLowerCase() : "";
  if (code === "unavailable" || code === "deadline-exceeded") return true;
  if (msg.includes("network") || msg.includes("failed to fetch") || msg.includes("client is offline")) return true;
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return false;
}

function stripUndefinedDeep(obj: unknown): unknown {
  if (typeof obj === "bigint") return (obj as bigint).toString();
  if (typeof File !== "undefined" && obj instanceof File) return undefined;
  if (typeof Blob !== "undefined" && obj instanceof Blob) return undefined;
  if (Array.isArray(obj)) return (obj as unknown[]).map(stripUndefinedDeep).filter((v) => v !== undefined);
  if (obj !== null && typeof obj === "object") {
    // `Date` has no enumerable keys — if `Object.keys` walks it you get `{}` and wipe voucher `date` from outbox/SQLite.
    if (obj instanceof Date) {
      return isNaN((obj as Date).getTime()) ? undefined : obj;
    }
    if (obj instanceof Timestamp) return obj;
    if (typeof (obj as { toDate?: () => Date }).toDate === "function") return obj;
    const o = obj as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v === undefined) continue;
      const next = stripUndefinedDeep(v);
      if (next !== undefined) out[k] = next;
    }
    return out;
  }
  return obj;
}

/** Serialize Firestore-like values to JSON-safe form (revive on flush). */
export function outboxJsonStringify(payload: Record<string, unknown>): string {
  const cleaned = stripUndefinedDeep(payload) as Record<string, unknown>;
  return JSON.stringify(cleaned, (_k, v) => {
    if (v && typeof v === "object" && "seconds" in v && "nanoseconds" in v && typeof (v as Timestamp).toDate === "function") {
      const t = v as Timestamp;
      return { __fsTs: true, seconds: t.seconds, nanoseconds: t.nanoseconds };
    }
    if (v instanceof Date) {
      return { __fsTs: true, seconds: Math.floor(v.getTime() / 1000), nanoseconds: 0 };
    }
    return v;
  });
}

export function outboxJsonParse(raw: string): Record<string, unknown> {
  return JSON.parse(raw, (_k, v) => {
    if (v && typeof v === "object" && (v as { __fsTs?: boolean }).__fsTs === true && typeof (v as { seconds?: number }).seconds === "number") {
      const o = v as { seconds: number; nanoseconds?: number };
      return new Timestamp(o.seconds, o.nanoseconds ?? 0);
    }
    return v;
  }) as Record<string, unknown>;
}

export type VoucherOutboxOp = "create" | "update" | "delete";

/** Outbox / patchVoucherFields: true for online-mirror companies — direct Firestore sync is allowed. */
export async function canSyncCompanyToServer(companyId: string): Promise<boolean> {
  // Cloud mirror row: `storageOption` may be missing — old `(c.storageOption || "local")` incorrectly blocked sync
  const localCompany = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!localCompany) return false;
  if ((localCompany as { plServerShared?: boolean }).plServerShared === true) return false;
  const c = localCompany as Record<string, unknown>;
  const soRaw = c.storageOption;
  const storageOption =
    typeof soRaw === "string" && soRaw.trim() !== "" ? soRaw.toLowerCase().trim() : "";
  const syncPolicy = String(c.syncPolicy || "").toLowerCase();
  const syncedFromCloud = c.syncedFromCloud === true;
  const hasAuthoritative = String(c.authoritativeCompanyId || "").trim().length > 0;
  const explicitOfflineOnly =
    storageOption === "local" &&
    !syncedFromCloud &&
    !hasAuthoritative &&
    syncPolicy !== "online";
  if (explicitOfflineOnly) return false;
  return (
    storageOption === "firebase" ||
    syncPolicy === "online" ||
    syncedFromCloud === true ||
    hasAuthoritative ||
    storageOption === ""
  );
}

/** Doc-level gate: local company par sirf invited reconciliation ledger + related vouchers. */
export async function canSyncCompanyCollectionToServer(
  companyId: string,
  collectionName: string,
  docId?: string,
  payload?: Record<string, unknown>
): Promise<boolean> {
  const localCompany = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!localCompany) return false;
  if (await canSyncCompanyToServer(companyId)) return true;
  if (!docId) return false;
  return canReconcileLocalDocViaFirebase(localCompany, companyId, collectionName, docId, payload);
}

/** Drop outbox rows only for truly local-only companies — if `storageOption` is missing, treat as ambiguous and do not delete. */
function isPureLocalOnlyCompanyRow(localCompany: LocalCompanyDoc): boolean {
  const c = localCompany as Record<string, unknown>;
  const soRaw = c.storageOption;
  const storageOption =
    typeof soRaw === "string" && soRaw.trim() !== "" ? soRaw.toLowerCase().trim() : "";
  if (storageOption === "") return false;
  if (storageOption === "firebase") return false;
  if (c.syncedFromCloud === true) return false;
  if (String(c.syncPolicy || "").toLowerCase() === "online") return false;
  if (String(c.authoritativeCompanyId || "").trim()) return false;
  return storageOption === "local";
}

/** Remove any prior pending row for the same doc+op so we do not flush stale duplicates. */
export async function enqueueCompanyDocOutbox(
  companyId: string,
  collectionName: string,
  op: VoucherOutboxOp,
  docId: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Web local-only + embedded SQLite-first + device offline: still enqueue when `isLocalOnlyMode` is false (cloud company on APK).
  if (
    (!isLocalOnlyMode() && !apkEmbeddedSqliteFirstWritesPreferred() && !isClientNavigatorOffline()) ||
    !companyId ||
    !collectionName ||
    !docId
  )
    return;
  if (!(await canSyncCompanyCollectionToServer(companyId, collectionName, docId, payload))) return;
  const db = await getBrowserDb();
  if (!db) return;
  const outboxId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `ob_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const json = outboxJsonStringify(payload);
  const now = Date.now();
  // Anti-spoof / replay-ready metadata — server future: `client_write_id` idempotency + `payload_hash` integrity.
  const clientWriteId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `cw_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const nonce =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `n_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const { computeSha256HexFromStringUtf8 } = await import("@/lib/security/sha256Hex");
  const payloadHash = await computeSha256HexFromStringUtf8(json);
  // Remove older row for same entity+op so the latest payload is what gets flushed.
  db.prepare(`DELETE FROM sync_outbox WHERE company_id = ? AND collection_name = ? AND doc_id = ? AND op = ?`).run(
    companyId,
    collectionName,
    docId,
    op
  );
  db.prepare(
    `INSERT INTO sync_outbox (outbox_id, company_id, collection_name, doc_id, op, payload, created_at, client_write_id, nonce, payload_hash)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(outboxId, companyId, collectionName, docId, op, json, now, clientWriteId, nonce, payloadHash);
  // Offline-first: flush background — embedded offline par band taaki Firestore Write stream + "Saving…" na atke.
  if (shouldAutoFlushOutboxAfterEnqueue()) {
    void flushVoucherOutbox().catch((e) => {
      console.warn("[localVoucherOutbox] background flush after enqueue failed", e);
    });
  }
}

/** Backward compatibility: legacy voucher code can keep calling this wrapper. */
export async function enqueueVoucherOutbox(
  companyId: string,
  op: VoucherOutboxOp,
  docId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await enqueueCompanyDocOutbox(companyId, "vouchers", op, docId, payload);
}

/** Before a full local restore: clear old pending outbox rows or a stale flush can overwrite fresh data */
export async function clearSyncOutboxForCompany(companyId: string): Promise<void> {
  try {
    const db = await getBrowserDb();
    if (!db || !companyId) return;
    db.prepare(`DELETE FROM sync_outbox WHERE company_id = ?`).run(companyId);
  } catch (e) {
    console.warn("[localVoucherOutbox] clearSyncOutboxForCompany failed", e);
  }
}

/** After a direct Firestore update: remove matching outbox rows so an old flush cannot overwrite. */
/** APK online banner: count pending outbox rows in SQLite for the company. */
export async function countSyncOutboxRowsForCompany(companyId: string): Promise<number> {
  try {
    const cid = companyId.trim();
    if (!cid) return 0;
    const db = await getBrowserDb();
    if (!db) return 0;
    const row = db.prepare(`SELECT COUNT(1) as c FROM sync_outbox WHERE company_id = ?`).get(cid) as { c?: number };
    return Number(row?.c ?? 0);
  } catch {
    return 0;
  }
}

export async function removeOutboxRowsForCompanyDoc(
  companyId: string,
  collectionName: string,
  docId: string
): Promise<void> {
  if (!companyId || !collectionName || !docId) return;
  try {
    const db = await getBrowserDb();
    if (!db) return;
    db.prepare(`DELETE FROM sync_outbox WHERE company_id = ? AND collection_name = ? AND doc_id = ?`).run(
      companyId,
      collectionName,
      docId
    );
  } catch (e) {
    console.warn("[localVoucherOutbox] removeOutboxRowsForCompanyDoc failed", e);
  }
}

/**
 * Apply the queue to Firestore; delete rows; refresh local mirror from server snapshots.
 * Stops on the first failing row (network may still be bad).
 */
export async function flushVoucherOutbox(): Promise<{ ok: number; failed: number }> {
  // Flush: web local + embedded SQLite-first (APK/static) — still flush the queue when `isLocalOnlyMode` is false.
  if (!isLocalOnlyMode() && !apkEmbeddedSqliteFirstWritesPreferred()) {
    if (process.env.NODE_ENV !== "production") {
      // Offline→online "refresh" trace: flush kab skip (mode/policy).
      console.log("[QUEUE_FLUSH]", "skip:not-local-first-mode");
    }
    return { ok: 0, failed: 0 };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[QUEUE_FLUSH]", "skip:navigator-offline");
    }
    return { ok: 0, failed: 0 };
  }
  // Capture for logging before `enableNetwork` may clear the flag below.
  const hadFirestoreNetworkDisabledByApi = firestoreNetworkDisabledByApi;
  // Only when the app called `disableNetwork` — otherwise repeated `enableNetwork` during flush can hit
  // Firestore 12.8 INTERNAL ASSERTION (da08 / ca9). Clear the flag inside the queued op — parallel flushes share one enable.
  if (firestoreNetworkDisabledByApi) {
    await queueFirestoreNetworkOp(async () => {
      if (!firestoreNetworkDisabledByApi) return;
      try {
        await enableNetwork(firestore);
        await settleAfterFirestoreNetworkEnabled();
      } catch {
        /* ignore */
      }
      markFirestoreNetworkDisabledByApi(false);
    });
  }
  const db = await getBrowserDb();
  if (!db) return { ok: 0, failed: 0 };

  const { computeSha256HexFromStringUtf8 } = await import("@/lib/security/sha256Hex");

  const rows = db
    .prepare(
      `SELECT outbox_id, company_id, collection_name, doc_id, op, payload, client_write_id, nonce, payload_hash FROM sync_outbox ORDER BY created_at ASC`
    )
    .all() as Array<{
      outbox_id: string;
      company_id: string;
      collection_name: string;
      doc_id: string;
      op: string;
      payload: string;
      client_write_id: string | null;
      nonce: string | null;
      payload_hash: string | null;
    }>;

  if (process.env.NODE_ENV !== "production") {
    // Outbox run start — `enableNetwork` may restart Firestore snapshots (refresh-like feel).
    console.log("[QUEUE_FLUSH]", "start", { pendingRows: rows.length, hadFirestoreNetworkDisabledByApi });
  }

  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      if (row.payload_hash) {
        const h = await computeSha256HexFromStringUtf8(row.payload);
        if (h !== row.payload_hash) {
          console.warn("[flushVoucherOutbox] payload_hash mismatch — tampered or corrupt row skipped", row.outbox_id);
          failed++;
          continue;
        }
      }
      const reg = await getLocalCompanyById(row.company_id, { includeDeleted: true });
      if (!reg) {
        // Company registry not hydrated yet — do not delete the row (used to wrongly drop online sync deletes here)
        continue;
      }
      const data = outboxJsonParse(row.payload);
      const rowSyncAllowed = await canSyncCompanyCollectionToServer(
        row.company_id,
        row.collection_name,
        row.doc_id,
        typeof data === "object" && data ? (data as Record<string, unknown>) : undefined
      );
      if (!rowSyncAllowed) {
        // Pure-local + no reconcile setting: drop row. Drive-connected pause: keep row for later.
        const localReconcileCfg = readLocalFirebaseReconcileConfig(reg);
        const dropPureLocalRow =
          isPureLocalOnlyCompanyRow(reg) &&
          !localReconcileCfg.blockedByDrive &&
          !(await canReconcileLocalDocViaFirebase(
            reg,
            row.company_id,
            row.collection_name,
            row.doc_id,
            typeof data === "object" && data ? (data as Record<string, unknown>) : undefined
          ));
        if (dropPureLocalRow) {
          db.prepare(`DELETE FROM sync_outbox WHERE outbox_id = ?`).run(row.outbox_id);
        }
        continue;
      }
      if (row.collection_name === "vouchers" && typeof data === "object" && data && PL_CLIENT_OFFLINE_FIRST_PERSIST_MS in data) {
        delete (data as Record<string, unknown>)[PL_CLIENT_OFFLINE_FIRST_PERSIST_MS];
      }
      // Old outbox rows / corrupt `date` — normalize before Firestore flush so statements stay valid.
      if (row.collection_name === "vouchers") coerceVoucherDocumentDate(data as Record<string, unknown>);
      const { id: _docIdField, ...docFields } = data;
      // When SQLite `company_id` differs from Firestore doc id, use `authoritativeCompanyId` for the correct path (otherwise nothing appears server-side)
      const fsCompanyId =
        String((reg as Record<string, unknown>).authoritativeCompanyId || row.company_id).trim() || row.company_id;
      let docFieldsToWrite = docFields as Record<string, unknown>;
      if (row.collection_name === "vouchers") {
        try {
          const mirrorRow = await getCompanyDocFromBrowserDb(row.company_id, "vouchers", row.doc_id, {
            includeDeleted: true,
          });
          const mirrorUrls = normalizeFileUrlsField(mirrorRow?.fileUrls);
          const payloadUrls = normalizeFileUrlsField(docFieldsToWrite.fileUrls);
          if (
            mirrorUrls.length > 0 &&
            payloadUrls.some((u) => isLocalFileRef(u)) &&
            mirrorUrls.some((u) => typeof u === "string" && u.startsWith("http"))
          ) {
            docFieldsToWrite = {
              ...docFieldsToWrite,
              fileUrls: mergeVoucherFileUrlsForEditDialog(payloadUrls, mirrorUrls),
            };
          } else if (payloadUrls.length > 0 && !Array.isArray(docFieldsToWrite.fileUrls)) {
            docFieldsToWrite = { ...docFieldsToWrite, fileUrls: payloadUrls };
          }
        } catch {
          /* mirror merge best-effort */
        }
      }
      const localFirebaseReconcile = await canReconcileLocalDocViaFirebase(
        reg,
        row.company_id,
        row.collection_name,
        row.doc_id,
        docFieldsToWrite
      );
      // Invited-ledger reconcile: data-only — attachments Firebase par nahi.
      if (localFirebaseReconcile) {
        docFieldsToWrite = stripAttachmentFieldsForInvitedLedgerReconcile(
          row.collection_name,
          docFieldsToWrite
        );
      } else {
        if (row.collection_name === "vouchers") {
          const skipAttachHydrate =
            apkEmbeddedSqliteFirstWritesPreferred() && isDeviceLocalCompany(reg);
          if (!skipAttachHydrate) {
            docFieldsToWrite = await hydrateVoucherLocalAttachmentsForServer(fsCompanyId, docFieldsToWrite);
          }
        } else {
          docFieldsToWrite = await hydratePendingLocalFileRefsDeep(fsCompanyId, docFieldsToWrite);
        }
      }
      const ref = doc(firestore, `companies/${fsCompanyId}/${row.collection_name}`, row.doc_id);
      const regAny = reg as Record<string, unknown>;
      const encFlag = regAny.encryptServerBackup === true;
      const encSalt = String(regAny.encryptServerBackupSalt ?? "").trim();
      const encPhrase = getBackupEncryptionPassphraseFromSession(row.company_id);
      // Optional server ciphertext — default OFF; encrypt needs active local login session (username+password → session key).
      if (encFlag && (!encSalt || !encPhrase)) {
        console.warn(
          "[flushVoucherOutbox] encryptServerBackup is on but salt or session key is missing — row skipped; log in with company username and password."
        );
        continue;
      }

      const idemKey = String(row.client_write_id || row.outbox_id || "").trim() || row.outbox_id;
      const idemRef = doc(firestore, `companies/${fsCompanyId}/_pl_ledger_idem`, idemKey);
      const payloadHash = row.payload_hash || "";

      /** Build Firestore payload before `runTransaction` — do not run async encrypt inside the transaction callback. */
      let txnPayload:
        | { mode: "enc"; doc: Record<string, unknown> }
        | { mode: "set"; doc: Record<string, unknown>; merge: boolean }
        | { mode: "merge"; doc: Record<string, unknown> };

      if (encFlag && encSalt && encPhrase) {
        const mergeOp = row.op === "delete" ? "update" : row.op;
        const inner = await mergeForEncryptedFlush(
          fsCompanyId,
          row.collection_name,
          row.doc_id,
          mergeOp,
          docFieldsToWrite,
          row.company_id,
          reg
        );
        const json = outboxJsonStringify(inner);
        const { ivBase64, cipherTextBase64 } = await encryptServerBackupPayloadJson(json, encPhrase, encSalt);
        let createdAtField: ReturnType<typeof serverTimestamp> | Timestamp = serverTimestamp();
        if (row.op === "update" || row.op === "delete") {
          const prior = await getDoc(ref);
          if (prior.exists()) {
            const ca = prior.data()?.createdAt;
            if (ca) createdAtField = ca as Timestamp;
          }
        }
        txnPayload = {
          mode: "enc",
          doc: {
            companyId: fsCompanyId,
            [PL_ENCRYPTED_V1_FIELD]: true,
            [PL_ENCRYPTED_IV_FIELD]: ivBase64,
            [PL_ENCRYPTED_PAYLOAD_FIELD]: cipherTextBase64,
            createdAt: createdAtField,
            lastEditedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        };
      } else if (row.op === "delete") {
        // Tombstone: merge server row — never hard `deleteDoc` inside flush.
        txnPayload = {
          mode: "merge",
          doc: {
            ...docFieldsToWrite,
            companyId: fsCompanyId,
            isDeleted: true,
            lastEditedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        };
      } else if (row.op === "create") {
        txnPayload = {
          mode: "set",
          merge: false,
          doc: {
            ...docFieldsToWrite,
            companyId: fsCompanyId,
            createdAt: serverTimestamp(),
            lastEditedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        };
      } else if (row.op === "update") {
        const { createdAt: _c, ...rest } = docFieldsToWrite;
        txnPayload = {
          mode: "merge",
          doc: {
            ...rest,
            companyId: fsCompanyId,
            lastEditedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        };
      } else {
        failed++;
        continue;
      }

      // `set(merge:true)` + missing idem kabhi REST `exists:false` create bhejta — doc parallel me ban jaye to `already-exists` (sab voucher types).
      const idemWriteBody = {
        payloadHash,
        nonce: row.nonce,
        applied: true,
        op: row.op,
        collection: row.collection_name,
        docId: row.doc_id,
        at: serverTimestamp(),
      };

      let flushResult: "duplicate" | "applied";
      try {
        flushResult = await runTransaction(firestore, async (tx) => {
          const idemSnap = await tx.get(idemRef);
          if (idemSnap.exists()) {
            const prev = idemSnap.data() as { payloadHash?: string; applied?: boolean };
            if (prev.applied === true && prev.payloadHash === payloadHash) return "duplicate" as const;
            if (prev.payloadHash && prev.payloadHash !== payloadHash) throw new Error("pl_idem_payload_conflict");
            tx.update(idemRef, idemWriteBody);
          } else {
            tx.set(idemRef, idemWriteBody, { merge: false });
          }
          if (txnPayload.mode === "enc") {
            tx.set(ref, txnPayload.doc, { merge: false });
          } else if (txnPayload.mode === "set") {
            tx.set(ref, txnPayload.doc, { merge: txnPayload.merge });
          } else {
            tx.set(ref, txnPayload.doc, { merge: true });
          }
          return "applied" as const;
        });
      } catch (e) {
        if (isCompanyNotFoundError(e)) {
          const ghostPayload = outboxJsonParse(row.payload);
          const isGhostDelete =
            row.op === "delete" ||
            (typeof ghostPayload === "object" &&
              ghostPayload &&
              (ghostPayload as Record<string, unknown>).isDeleted === true);
          if (isGhostDelete) {
            const { purgeGhostLocalCompanyDoc } = await import("@/lib/purgeGhostLocalCompanyDoc");
            await purgeGhostLocalCompanyDoc(row.company_id, row.collection_name, row.doc_id);
            db.prepare(`DELETE FROM sync_outbox WHERE outbox_id = ?`).run(row.outbox_id);
            ok++;
            continue;
          }
        }
        if (isFirestoreAlreadyExistsError(e)) {
          try {
            const snap = await getDoc(idemRef);
            if (snap.exists()) {
              const p = snap.data() as { payloadHash?: string; applied?: boolean };
              if (p.applied === true && p.payloadHash === payloadHash) {
                db.prepare(`DELETE FROM sync_outbox WHERE outbox_id = ?`).run(row.outbox_id);
                ok++;
                await mirrorCompanyDocToBrowserDb(row.company_id, row.collection_name, row.doc_id);
                continue;
              }
            }
          } catch {
            /* niche warn + failed */
          }
          console.warn("[flushVoucherOutbox] already-exists (idem race?) — row left for retry", row.outbox_id, e);
          failed++;
          continue;
        }
        throw e;
      }

      if (flushResult === "duplicate") {
        db.prepare(`DELETE FROM sync_outbox WHERE outbox_id = ?`).run(row.outbox_id);
        ok++;
        // Idempotent replay: align local SQLite with the server doc (same as a fresh apply).
        await mirrorCompanyDocToBrowserDb(row.company_id, row.collection_name, row.doc_id);
        continue;
      }

      db.prepare(`DELETE FROM sync_outbox WHERE outbox_id = ?`).run(row.outbox_id);
      ok++;
      // Every collection: align SQLite with server timestamps + hydrated URLs (previously only vouchers were mirrored post-flush).
      await mirrorCompanyDocToBrowserDb(row.company_id, row.collection_name, row.doc_id);
    } catch (e) {
      if (isCompanyNotFoundError(e)) {
        try {
          const ghostPayload = outboxJsonParse(row.payload);
          const isGhostDelete =
            row.op === "delete" ||
            (typeof ghostPayload === "object" &&
              ghostPayload &&
              (ghostPayload as Record<string, unknown>).isDeleted === true);
          if (isGhostDelete) {
            const { purgeGhostLocalCompanyDoc } = await import("@/lib/purgeGhostLocalCompanyDoc");
            await purgeGhostLocalCompanyDoc(row.company_id, row.collection_name, row.doc_id);
            db.prepare(`DELETE FROM sync_outbox WHERE outbox_id = ?`).run(row.outbox_id);
            ok++;
            continue;
          }
        } catch {
          /* fall through */
        }
      }
      console.warn("[flushVoucherOutbox] row failed", row.outbox_id, e);
      failed++;
      // One bad row should not block the entire outbox forever; keep flushing remaining rows.
      continue;
    }
  }
  if (process.env.NODE_ENV !== "production") {
    console.log("[SYNC_COMPLETE]", "flushVoucherOutbox", { ok, failed, pendingRowsStart: rows.length });
  }
  return { ok, failed };
}
