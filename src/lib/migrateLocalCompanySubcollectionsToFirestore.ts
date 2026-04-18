"use client";

/**
 * "Upload company to cloud" ke baad: sirf company root Firestore pe tha, vouchers/parties SQLite me —
 * yahan browser SQLite (`company_docs`) se saari subcollections Firestore me push (batched set).
 */

import { doc, writeBatch, Timestamp, type Firestore } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { COMPANY_LOCAL_MIRROR_SUBCOLLECTIONS } from "@/lib/firestoreToLocalCompanyPull";

const BATCH_MAX = 450;

function sanitizeValue(v: unknown): unknown {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "bigint") return (v as bigint).toString();
  if (v instanceof Date) return Timestamp.fromDate(v);
  if (v instanceof Timestamp) return v;
  if (Array.isArray(v)) {
    const arr = v.map(sanitizeValue).filter((x) => x !== undefined);
    return arr;
  }
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    if (typeof (o as { toDate?: () => Date }).toDate === "function") {
      try {
        const d = (o as { toDate: () => Date }).toDate();
        if (d && !isNaN(d.getTime())) return Timestamp.fromDate(d);
      } catch {
        /* ignore */
      }
    }
    return sanitizeDocForFirestore(o);
  }
  if (typeof File !== "undefined" && v instanceof File) return undefined;
  if (typeof Blob !== "undefined" && v instanceof Blob) return undefined;
  return v;
}

function sanitizeDocForFirestore(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const s = sanitizeValue(v);
    if (s !== undefined) out[k] = s;
  }
  return out;
}

async function commitWrites(
  db: Firestore,
  ops: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }>
): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_MAX) {
    const chunk = ops.slice(i, i + BATCH_MAX);
    const batch = writeBatch(db);
    for (const { ref, data } of chunk) {
      batch.set(ref, data, { merge: true });
    }
    await batch.commit();
  }
}

/**
 * Local browser DB se saari mirror subcollections Firestore `companies/{fsCompanyId}/…` pe likho.
 * Company root doc pehle se hona chahiye (permissions).
 */
export async function pushAllLocalCompanyDocsToFirestore(fsCompanyId: string): Promise<{
  pushed: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let pushed = 0;

  for (const collectionName of COMPANY_LOCAL_MIRROR_SUBCOLLECTIONS) {
    try {
      const rows = await listCompanyDocsFromBrowserDb(fsCompanyId, collectionName, { forBackupMerge: true });
      if (!rows.length) continue;

      const ops: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = [];
      for (const row of rows) {
        const docId = String((row as { id?: string }).id ?? "");
        if (!docId) continue;
        const { id: _omit, ...rest } = row as Record<string, unknown> & { id: string };
        const data = sanitizeDocForFirestore(rest as Record<string, unknown>);
        if (data.companyId == null || String(data.companyId).trim() === "") {
          data.companyId = fsCompanyId;
        }
        const ref = doc(firestore, `companies/${fsCompanyId}/${collectionName}`, docId);
        ops.push({ ref, data });
      }

      if (ops.length) {
        await commitWrites(firestore, ops);
        pushed += ops.length;
      }
    } catch (e) {
      errors.push(`${collectionName}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { pushed, errors };
}
