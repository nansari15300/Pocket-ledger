"use client";

/**
 * Static build: Firestore fail hone par company subcollection writes queue + online aate hi flush.
 * Voucher tombstone (Sync-2 pilot): outbox update/create payloads — hard deleteDoc tab nahi;
 * recycler = isDeleted + deletedAt + deletedBy (softDeleteVoucherMoveToRecycleBin / voucherRecycleBinDeletedAt).
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  enableNetwork,
} from "firebase/firestore";
import {
  firestore,
  firestoreNetworkDisabledByApi,
  queueFirestoreNetworkOp,
  markFirestoreNetworkDisabledByApi,
  settleAfterFirestoreNetworkEnabled,
} from "@/lib/firebase";
import { getBrowserDb } from "@/lib/localSqlite";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { isLocalOnlyMode } from "@/lib/localMode";
import { mirrorVoucherDocToBrowserDb } from "@/lib/localCompanyDocMirror";
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
import { hydrateVoucherLocalAttachmentsForServer } from "@/lib/hydrateVoucherLocalAttachmentsForServer";

/**
 * Encrypted flush: update par server doc + outbox delta merge (partial outbox bhi full ciphertext ban jata hai).
 * Plaintext server doc se merge karte waqt `plEncrypted*` fields hata kar mix karo.
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

/** Network / backend-down — offline queue use karo (permission errors nahi). */
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
    // `Date`: enumerable keys nahi — agar neeche `Object.keys` reduce chale to `{}` ban jata hai → voucher `date` outbox/SQLite se wipe.
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

/** Firestore-like values ko JSON-safe (flush ke waqt revive). */
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

export type VoucherOutboxOp = "create" | "update";

/** Outbox / patchVoucherFields: online mirror company ke liye true — seedha Firestore sync allowed. */
export async function canSyncCompanyToServer(companyId: string): Promise<boolean> {
  // Cloud mirror row: `storageOption` kabhi missing — purana `(c.storageOption || "local")` galat tarah se sync block kar deta tha
  const localCompany = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!localCompany) return false;
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

/** Sirf asli local-only company ke liye outbox hatao — `storageOption` missing = ambiguous, mat hatao */
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

/** Pehle se pending same doc+op hata do taaki duplicate flush na ho. */
export async function enqueueCompanyDocOutbox(
  companyId: string,
  collectionName: string,
  op: VoucherOutboxOp,
  docId: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Local-only mode (web + static) dono me outbox queue allow karo.
  if (!isLocalOnlyMode() || !companyId || !collectionName || !docId) return;
  if (!(await canSyncCompanyToServer(companyId))) return;
  const db = await getBrowserDb();
  if (!db) return;
  const outboxId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `ob_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const json = outboxJsonStringify(payload);
  const now = Date.now();
  // Same entity+op ki purani row hatao so latest payload flush ho.
  db.prepare(`DELETE FROM sync_outbox WHERE company_id = ? AND collection_name = ? AND doc_id = ? AND op = ?`).run(
    companyId,
    collectionName,
    docId,
    op
  );
  db.prepare(
    `INSERT INTO sync_outbox (outbox_id, company_id, collection_name, doc_id, op, payload, created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run(outboxId, companyId, collectionName, docId, op, json, now);
  // Local save ko fast rakho: server flush background me try karo, Save button Firestore/network ka wait na kare.
  if (typeof navigator !== "undefined" && navigator.onLine) {
    void flushVoucherOutbox().catch((e) => {
      console.warn("[localVoucherOutbox] background flush after enqueue failed", e);
    });
  }
}

/** Backward compatibility: existing voucher code same function call use kar sake. */
export async function enqueueVoucherOutbox(
  companyId: string,
  op: VoucherOutboxOp,
  docId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await enqueueCompanyDocOutbox(companyId, "vouchers", op, docId, payload);
}

/** Full local restore se pehle: purani pending outbox hatao warna stale flush naya data overwrite kar de */
export async function clearSyncOutboxForCompany(companyId: string): Promise<void> {
  try {
    const db = await getBrowserDb();
    if (!db || !companyId) return;
    db.prepare(`DELETE FROM sync_outbox WHERE company_id = ?`).run(companyId);
  } catch (e) {
    console.warn("[localVoucherOutbox] clearSyncOutboxForCompany failed", e);
  }
}

/** Seedha Firestore update ke baad pending outbox row hatao — purana flush overwrite na kare. */
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
 * Queue ko Firestore pe likho; row delete; phir server snapshot se local mirror.
 * Pehli error par ruk jata hai (network abhi bhi kharab ho sakta hai).
 */
export async function flushVoucherOutbox(): Promise<{ ok: number; failed: number }> {
  // Local-only mode me hi flush run karo; online-normal mode pe queue expected nahi.
  if (!isLocalOnlyMode()) return { ok: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: 0, failed: 0 };
  // Sirf jab app ne `disableNetwork` lagaya ho — warna har flush par `enableNetwork` watch stream se takra kar
  // Firestore 12.8 INTERNAL ASSERTION (da08 / ca9) deta hai. Flag andar queue op me clear — do parallel flush = ek hi enable.
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

  const rows = db
    .prepare(`SELECT outbox_id, company_id, collection_name, doc_id, op, payload FROM sync_outbox ORDER BY created_at ASC`)
    .all() as Array<{ outbox_id: string; company_id: string; collection_name: string; doc_id: string; op: string; payload: string }>;

  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const reg = await getLocalCompanyById(row.company_id, { includeDeleted: true });
      if (!reg) {
        // Company registry abhi hydrate nahi — row mat hatao (pehle yahi se online sync delete ho jata tha)
        continue;
      }
      if (!(await canSyncCompanyToServer(row.company_id))) {
        if (isPureLocalOnlyCompanyRow(reg)) {
          db.prepare(`DELETE FROM sync_outbox WHERE outbox_id = ?`).run(row.outbox_id);
        }
        continue;
      }
      const data = outboxJsonParse(row.payload);
      if (row.collection_name === "vouchers" && typeof data === "object" && data && PL_CLIENT_OFFLINE_FIRST_PERSIST_MS in data) {
        delete (data as Record<string, unknown>)[PL_CLIENT_OFFLINE_FIRST_PERSIST_MS];
      }
      // Purani outbox rows / corrupt `date` — Firestore pe flush se pehle bhar do taaki statement sahi rahe.
      if (row.collection_name === "vouchers") coerceVoucherDocumentDate(data as Record<string, unknown>);
      const { id: _docIdField, ...docFields } = data;
      // SQLite `company_id` != Firestore doc id ho to authoritativeCompanyId se sahi path (warna server pe kuch nahi dikhta)
      const fsCompanyId =
        String((reg as Record<string, unknown>).authoritativeCompanyId || row.company_id).trim() || row.company_id;
      let docFieldsToWrite = docFields as Record<string, unknown>;
      // `local:` refs are device-local; never write them to Firestore — upload blobs first (other devices need HTTPS).
      if (row.collection_name === "vouchers") {
        docFieldsToWrite = await hydrateVoucherLocalAttachmentsForServer(fsCompanyId, docFieldsToWrite);
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
      if (encFlag && encSalt && encPhrase) {
        const inner = await mergeForEncryptedFlush(
          fsCompanyId,
          row.collection_name,
          row.doc_id,
          row.op,
          docFieldsToWrite,
          row.company_id,
          reg
        );
        const json = outboxJsonStringify(inner);
        const { ivBase64, cipherTextBase64 } = await encryptServerBackupPayloadJson(json, encPhrase, encSalt);
        let createdAtField: ReturnType<typeof serverTimestamp> | Timestamp = serverTimestamp();
        if (row.op === "update") {
          const prior = await getDoc(ref);
          if (prior.exists()) {
            const ca = prior.data()?.createdAt;
            if (ca) createdAtField = ca as Timestamp;
          }
        }
        await setDoc(
          ref,
          {
            companyId: fsCompanyId,
            [PL_ENCRYPTED_V1_FIELD]: true,
            [PL_ENCRYPTED_IV_FIELD]: ivBase64,
            [PL_ENCRYPTED_PAYLOAD_FIELD]: cipherTextBase64,
            createdAt: createdAtField,
            lastEditedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: false }
        );
      } else if (row.op === "create") {
        await setDoc(ref, {
          ...docFieldsToWrite,
          companyId: fsCompanyId,
          // Firestore metadata: vouchers aur normal masters dono me harmless.
          createdAt: serverTimestamp(),
          lastEditedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (row.op === "update") {
        const { createdAt: _c, ...rest } = docFieldsToWrite;
        await updateDoc(ref, {
          ...rest,
          companyId: fsCompanyId,
          lastEditedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        failed++;
        continue;
      }
      db.prepare(`DELETE FROM sync_outbox WHERE outbox_id = ?`).run(row.outbox_id);
      ok++;
      // Voucher flush ke baad snapshot-true mirror rakho; baaki collections already local payload se present hain.
      if (row.collection_name === "vouchers") {
        await mirrorVoucherDocToBrowserDb(row.company_id, row.doc_id);
      }
    } catch (e) {
      console.warn("[flushVoucherOutbox] row failed", row.outbox_id, e);
      failed++;
      // One bad row should not block the entire outbox forever; keep flushing remaining rows.
      continue;
    }
  }
  return { ok, failed };
}
